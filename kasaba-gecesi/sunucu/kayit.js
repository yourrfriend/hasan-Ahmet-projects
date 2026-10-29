'use strict';
// Kayıt yuvası: sunucu her yayında (flush) odanın olay günlüğünü (R.log) buraya boşaltır; kayıtlı oyuncuların profilini
// buradan yazar. Oyun sunucusu SQL bilmez; bu modül Supabase'e PostgREST (HTTP, service_role) ile yazar.
//   olustur(opts) → {kuyrukla(room, olaylar), profil(uye, {ad,renk,sapka}), sonRoller(uye), kapat(), sayac}
// opts: {url, serviceKey, kurulum, deneme:[ms…] (yeniden deneme aralıkları), kuyrukSinir (10000), bekleMs (profil tekilleştirme),
//        zamanAsimiMs (5000), quiet}
// url/serviceKey yoksa hiçbir istek yapılmaz (misafir kurulum). kuyrukla/profil hiçbir zaman beklemez ya da fırlatmaz.
//
// Yazma yolu (tasarım §5.5): tek sıralı işçi; her iş bir odadan gelen olay demetidir. baslangic → kasaba bul/kur + üyelik +
// oyunlar + oyun_oyunculari; her olay → olaylar (toplu, ignore-duplicates: yeniden denemede güvenli); bitis/iptal → oyunlar ve
// oyun_oyunculari güncellenir. Misafir ev sahibinin maçı hiç yazılmaz (§5.3). 5xx/ağ hatası → aynı iş artan aralıkla tekrar;
// 4xx → iş düşer (log). Açılışta 3 saatten eski "devam" oyunları iptal edilir (servis yeniden başlamış, kuyruk gitmiş).
const DENEME=[1000,5000,15000,60000,300000];
const {ek,TEKRAR}=require('./game.js'); // kasaba adı: "Ece'nin Kasabası" (game.js saf; tek kaynak); TEKRAR.gecmisUz: rol geçmişi uzunluğu
function olustur(opts={}){
  const sayac={olay:0,yazilan:0,hata:0,dusen:0,atlanan:0,profil:0,kuyruk:0,gecmisOkunan:0,gecmisHata:0,kasa:0,ilerlemeHata:0};
  const acik=!!(opts.url&&opts.serviceKey);const bekleMs=opts.bekleMs??2000,zamanAsimi=opts.zamanAsimiMs??5000;
  const deneme=opts.deneme||DENEME,kuyrukSinir=opts.kuyrukSinir||10000,kurulum=opts.kurulum||'bilinmiyor';
  const log=opts.quiet?()=>{}:(...a)=>console.log(new Date().toISOString(),'kayit:',...a);
  const bekleyen=new Map(); // uye → {veri, t}  (profil tekilleştirme)
  const sonProfil=new Map(); // uye → JSON {ad,renk,sapka}: aynıysa yeniden yazılmaz (süreç ömrü)
  let kapali=false,kapaniyor=false,uykuCoz=null; // kapaniyor: yeni iş alınmaz, kuyruk boşalana (en çok 3 sn) dek yazım sürer; uykuCoz: yeniden deneme uykusunu keser
  const kok=()=>opts.url.replace(/\/+$/,'')+'/rest/v1/';
  async function istek(yontem,yol,govde,prefer,sayma){
    const r=await fetch(kok()+yol,{method:yontem,headers:{apikey:opts.serviceKey,Authorization:'Bearer '+opts.serviceKey,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},body:govde==null?undefined:JSON.stringify(govde),signal:AbortSignal.timeout(zamanAsimi)});
    if(!r.ok){const e=new Error('HTTP '+r.status+' '+yontem+' '+yol.split('?')[0]+' '+(await r.text().catch(()=>'')).slice(0,160));e.durum=r.status;throw e}
    if(yontem!=='GET'&&!sayma)sayac.yazilan++; // yazilan = başarılı yazma istekleri (açılış temizliği hariç)
    const metin=await r.text();return metin?JSON.parse(metin):null;
  }
  const gonder=(yol,govde,prefer)=>istek('POST',yol,govde,prefer);
  // ---------- profil (upsert; aynı üye için bekleMs içindeki son değer tek istekte) ----------
  function profil(uye,veri){
    if(!acik||kapali||!uye)return;
    const imza=JSON.stringify({ad:veri.ad||'',renk:veri.renk||null,sapka:veri.sapka||null});
    if(sonProfil.get(uye)===imza){const b=bekleyen.get(uye);if(b){clearTimeout(b.t);bekleyen.delete(uye)}return} // DB zaten bu görünümde: bekleyen farklı yazım da iptal (A→B→A)
    const b=bekleyen.get(uye);if(b)clearTimeout(b.t);
    const t=setTimeout(()=>{bekleyen.delete(uye);
      gonder('profiller',{uye,ad:veri.ad||'',renk:veri.renk||null,sapka:veri.sapka||null,guncellenme:new Date().toISOString()},'resolution=merge-duplicates,return=minimal')
        .then(()=>{sayac.profil++;sonProfil.set(uye,imza)}).catch(e=>{sayac.hata++;log('profil yazılamadı',uye.slice(0,8),e.message)})},bekleMs);
    bekleyen.set(uye,{veri,t});
  }
  // ---------- maç ve olay kuyruğu ----------
  const kuyruk=[];let isci=null,denemeNo=0,zamanlayici=null;
  const atlanan=new Set(); // misafir ev sahibinin maçları (oyunId): olayları da atlanır
  const kasabaOnbellek=new Map(); // sahip uuid → kasaba id (süreç ömrü)
  function kuyrukla(room,olaylar){
    if(!acik||kapali||kapaniyor||!olaylar||!olaylar.length)return;sayac.olay+=olaylar.length;
    const uyeler={};for(const [id,m] of room.members||[])if(m&&m.uye)uyeler[id]=m.uye;
    kuyruk.push({oda:room.code,hostPub:room.hostId,uyeler,olaylar:olaylar.map(o=>({...o}))});
    sayac.kuyruk=kuyruk.reduce((a,is)=>a+is.olaylar.length,0);
    while(sayac.kuyruk>kuyrukSinir&&kuyruk.length){const d=kuyruk.shift();sayac.kuyruk-=d.olaylar.length;sayac.dusen+=d.olaylar.length;log('kuyruk dolu, en eski düşürüldü',d.olaylar.length)}
    calistir();
  }
  function calistir(){if(isci||kapali||!kuyruk.length)return;isci=isle().finally(()=>{isci=null})}
  // Kalıcı hatalar (satır geçersiz: 400/404/409/422) o olayı düşürür, demetin kalanı yazılır. Diğer her şey (5xx, ağ, 401/403/408/429:
  // anahtar/yetki/hız sorunu) aynı işi artan aralıkla yeniden dener; yazılmış olaylar demetten çıkarıldığı için kalınan yerden sürer.
  const KALICI=new Set([400,404,409,422]);
  async function isle(){
    while(kuyruk.length&&!kapali){
      const is=kuyruk[0];
      try{await isiYaz(is);kuyruk.shift();denemeNo=0}
      catch(e){sayac.hata++;if(kapali)return;
        const ms=deneme[Math.min(denemeNo++,deneme.length-1)];log('yazılamadı, '+ms+' ms sonra tekrar:',e.message);
        await new Promise(r=>{uykuCoz=r;zamanlayici=setTimeout(r,ms)});uykuCoz=null;
      }
    }
  }
  async function isiYaz(is){
    while(is.olaylar.length&&!kapali){
      const o=is.olaylar[0];
      try{await olayYaz(is,o)}
      catch(e){
        if(!(e.durum&&KALICI.has(e.durum)))throw e; // geçici: işi yeniden dene (kalınan olaydan)
        sayac.dusen++;log('olay düştü',o.tur,e.message);
        if(o.tur==='baslangic'){atlanan.add(o.oyunId);sayac.atlanan++;const sahip=is.uyeler[is.hostPub];if(sahip)kasabaOnbellek.delete(sahip);log('maç atlandı',String(o.oyunId).slice(0,8))}
      }
      is.olaylar.shift();sayac.kuyruk--;
    }
  }
  async function olayYaz(is,o){
    const oyunId=o.oyunId;if(!oyunId||atlanan.has(oyunId))return;
    if(o.tur==='baslangic'){
      const sahip=is.uyeler[is.hostPub];
      if(!sahip){atlanan.add(oyunId);sayac.atlanan++;log('misafir ev sahibi, maç yazılmaz',oyunId.slice(0,8));return}
      const oyuncular=o.veri.oyuncular||[];
      let kasabaId=kasabaOnbellek.get(sahip);
      if(!kasabaId){const var_=await istek('GET','kasabalar?sahip=eq.'+sahip+'&select=id&limit=1');
        if(var_&&var_.length)kasabaId=var_[0].id;
        else{const hostAd=(oyuncular.find(p=>p.id===is.hostPub)||{}).ad||'Ev sahibi';const yeni=await gonder('kasabalar',{ad:ek(hostAd,'in')+' Kasabası',sahip},'return=representation');kasabaId=yeni[0].id}
        kasabaOnbellek.set(sahip,kasabaId)}
      const uyeSatirlari=[{kasaba_id:kasabaId,uye:sahip,rol:'sahip'}];for(const p of oyuncular){const u=is.uyeler[p.id];if(u&&u!==sahip)uyeSatirlari.push({kasaba_id:kasabaId,uye:u,rol:'uye'})}
      await gonder('kasaba_uyeleri',uyeSatirlari,'resolution=ignore-duplicates,return=minimal');
      // baslama: maçın gerçek başlangıcı (gameId = startGame anındaki ms), kuyruk gecikmesi değil
      await gonder('oyunlar',{id:oyunId,kasaba_id:kasabaId,kurulum,oda_kodu:is.oda,baslama:new Date(o.oyun||o.zaman||Date.now()).toISOString(),sonuc:'devam',oyuncu_sayisi:oyuncular.length,ayarlar:o.veri.ayarlar||null},'resolution=ignore-duplicates,return=minimal');
      await gonder('oyun_oyunculari',oyuncular.map(p=>({oyun_id:oyunId,pub_id:p.id,uye:is.uyeler[p.id]||null,ad:p.ad||null,renk:p.renk||null,sapka:p.sapka||null})),'resolution=ignore-duplicates,return=minimal');
    }
    // olayın kendisi (gizli alanlar dahil; RLS yalnız bitmiş oyunlar için okutur)
    await gonder('olaylar',[{oyun_id:oyunId,sira:o.sira,gun:o.gun,faz:o.faz,tur:o.tur,veri:o.veri}],'resolution=ignore-duplicates,return=minimal');
    const zaman=new Date(o.zaman||Date.now()).toISOString();
    if(o.tur==='bitis'){
      await istek('PATCH','oyunlar?id=eq.'+oyunId,{bitis:zaman,sonuc:'bitti',kazanan_takim:o.veri.kazanan||null,kazanan_metin:o.veri.kazanan_metin||null},'return=minimal');
      for(const p of o.veri.oyuncular||[])await istek('PATCH','oyun_oyunculari?oyun_id=eq.'+oyunId+'&pub_id=eq.'+encodeURIComponent(p.id),{rol_key:p.rol_key,takim:p.takim,deli_gibi:p.deli_gibi,calinan_rol:p.calinan_rol,sonunda_sag:p.sag,olum_gunu:p.olum_gunu,olum_sekli:p.olum_sekli},'return=minimal');
    }else if(o.tur==='iptal'){
      await istek('PATCH','oyunlar?id=eq.'+oyunId,{bitis:zaman,sonuc:'iptal'},'return=minimal');
    }
  }
  // açılış temizliği: servis yeniden başlamış, kuyruk gitmiş → 3 saatten eski "devam" oyunları iptal
  if(acik){const esik=new Date(Date.now()-3*3600*1000).toISOString();
    istek('PATCH','oyunlar?sonuc=eq.devam&kurulum=eq.'+encodeURIComponent(kurulum)+'&baslama=lt.'+encodeURIComponent(esik),{sonuc:'iptal',bitis:new Date().toISOString()},'return=minimal',true).then(()=>log('eski devam oyunları iptal edildi')).catch(e=>{sayac.hata++;log('açılış temizliği yapılamadı',e.message)})}
  // ---------- rol geçmişi tohumu (geri bildirim paketi §5.4): oyuncunun bu kurulumdaki son 5 bitmiş maçtaki rolleri ----------
  // En yeni önde; Hırsız'ın kayıtlı rol_key'i çalınan roldür → başlangıç rolü 'hirsiz'. Hata/zaman aşımı/ayarsız → null (sessiz).
  async function sonRoller(uye){
    if(!acik||kapali||!uye)return null;
    try{
      const rows=await istek('GET','oyun_oyunculari?select=rol_key,takim,calinan_rol,oyunlar!inner(bitis)&uye=eq.'+encodeURIComponent(uye)+'&rol_key=not.is.null&oyunlar.kurulum=eq.'+encodeURIComponent(kurulum)+'&oyunlar.sonuc=eq.bitti&order=oyunlar(bitis).desc&limit='+TEKRAR.gecmisUz);
      sayac.gecmisOkunan++;
      return (rows||[]).map(r=>({key:r.calinan_rol?'hirsiz':r.rol_key,team:r.calinan_rol?'neu':r.takim})).filter(r=>r.key&&r.team); // Hırsız: başlangıç rolü ve takımı (oda belleğiyle aynı)
    }catch(e){sayac.gecmisHata++;log('rol geçmişi okunamadı',String(uye).slice(0,8),e.message);return null}
  }
  // ---------- ilerleme (göç 008): yalnız service_role RPC'leri; hata/ayarsız → null (oyunu beklemez, tekrar denenmez) ----------
  async function rpcCagir(ad,govde){if(!acik||kapali)return null;try{return await istek('POST','rpc/'+ad,govde,null,true)}catch(e){sayac.ilerlemeHata++;log(ad+' başarısız',e.message);return null}}
  const envanterOku=uye=>uye?rpcCagir('envanter_oku',{p_uye:uye}):Promise.resolve(null);
  async function macSonu(uye,oyunId,o){if(!uye||!oyunId)return null;o=o||{};
    const r=await rpcCagir('mac_sonu',{p_uye:uye,p_oyun:oyunId,p_odul:o.odul||null,p_rozetler:o.rozetler||[],p_harcanan:o.harcanan||null,p_bonus:o.bonus||0,p_gunluk:o.gunluk||0,p_basari:o.basari||null,p_seri_artis:o.seriArtis||0,p_seri_tavan:o.seriTavan||0,p_gorev:o.gorev||null,p_gorev_bonus:o.gorevBonus||0});if(r)sayac.kasa++;return r}
  const kozmetikAl=(uye,key,fiyat)=>uye?rpcCagir('kozmetik_al',{p_uye:uye,p_key:key,p_fiyat:fiyat}):Promise.resolve(null);
  const baglaOdulu=uye=>uye?rpcCagir('bagla_odulu',{p_uye:uye}):Promise.resolve(null);
  const davetKaydet=(kod,uye)=>kod&&uye?rpcCagir('davet_kaydet',{p_kod:kod,p_yeni:uye}):Promise.resolve(null);
  return{
    kuyrukla,profil,sonRoller,envanterOku,macSonu,kozmetikAl,baglaOdulu,davetKaydet,
    async kapat(){ // yeni iş alınmaz; kuyruktaki kalan olaylar (bitiş dahil) en çok 3 sn içinde yazılır, sonra kapanır
      kapaniyor=true;for(const b of bekleyen.values())clearTimeout(b.t);bekleyen.clear();
      if(uykuCoz){clearTimeout(zamanlayici);uykuCoz()}
      const son=Date.now()+3000;while(isci&&Date.now()<son)await Promise.race([isci.catch(()=>{}),new Promise(r=>setTimeout(r,50))]); // isle kuyruk boşalana dek sürer
      kapali=true;clearTimeout(zamanlayici);if(uykuCoz)uykuCoz()},
    sayac
  };
}
module.exports={olustur};
