'use strict';
// Kayıt yuvası: sunucu her yayında (flush) odanın olay günlüğünü (R.log) buraya boşaltır; kayıtlı oyuncuların profilini
// buradan yazar. Oyun sunucusu SQL bilmez; bu modül Supabase'e PostgREST (HTTP, service_role) ile yazar.
//   olustur(opts) → {kuyrukla(room, olaylar), profil(uye, {ad,renk,sapka}), kapat(), sayac}
// opts: {url, serviceKey, kurulum, deneme:[ms…] (yeniden deneme aralıkları), kuyrukSinir (10000), bekleMs (profil tekilleştirme),
//        zamanAsimiMs (5000), quiet}
// url/serviceKey yoksa hiçbir istek yapılmaz (misafir kurulum). kuyrukla/profil hiçbir zaman beklemez ya da fırlatmaz.
//
// Yazma yolu (tasarım §5.5): tek sıralı işçi; her iş bir odadan gelen olay demetidir. baslangic → kasaba bul/kur + üyelik +
// oyunlar + oyun_oyunculari; her olay → olaylar (toplu, ignore-duplicates: yeniden denemede güvenli); bitis/iptal → oyunlar ve
// oyun_oyunculari güncellenir. Misafir ev sahibinin maçı hiç yazılmaz (§5.3). 5xx/ağ hatası → aynı iş artan aralıkla tekrar;
// 4xx → iş düşer (log). Açılışta 3 saatten eski "devam" oyunları iptal edilir (servis yeniden başlamış, kuyruk gitmiş).
const DENEME=[1000,5000,15000,60000,300000];
function olustur(opts={}){
  const sayac={olay:0,yazilan:0,hata:0,dusen:0,atlanan:0,profil:0,kuyruk:0};
  const acik=!!(opts.url&&opts.serviceKey);const bekleMs=opts.bekleMs??2000,zamanAsimi=opts.zamanAsimiMs??5000;
  const deneme=opts.deneme||DENEME,kuyrukSinir=opts.kuyrukSinir||10000,kurulum=opts.kurulum||'bilinmiyor';
  const log=opts.quiet?()=>{}:(...a)=>console.log(new Date().toISOString(),'kayit:',...a);
  const bekleyen=new Map(); // uye → {veri, t}  (profil tekilleştirme)
  let kapali=false;
  const kok=()=>opts.url.replace(/\/+$/,'')+'/rest/v1/';
  async function istek(yontem,yol,govde,prefer){
    const r=await fetch(kok()+yol,{method:yontem,headers:{apikey:opts.serviceKey,Authorization:'Bearer '+opts.serviceKey,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},body:govde==null?undefined:JSON.stringify(govde),signal:AbortSignal.timeout(zamanAsimi)});
    if(!r.ok){const e=new Error('HTTP '+r.status+' '+yontem+' '+yol.split('?')[0]+' '+(await r.text().catch(()=>'')).slice(0,160));e.durum=r.status;throw e}
    const metin=await r.text();return metin?JSON.parse(metin):null;
  }
  const gonder=(yol,govde,prefer)=>istek('POST',yol,govde,prefer);
  // ---------- profil (upsert; aynı üye için bekleMs içindeki son değer tek istekte) ----------
  function profil(uye,veri){
    if(!acik||kapali||!uye)return;
    const b=bekleyen.get(uye);if(b)clearTimeout(b.t);
    const t=setTimeout(()=>{bekleyen.delete(uye);
      gonder('profiller',{uye,ad:veri.ad||'',renk:veri.renk||null,sapka:veri.sapka||null,guncellenme:new Date().toISOString()},'resolution=merge-duplicates,return=minimal')
        .then(()=>{sayac.profil++}).catch(e=>{sayac.hata++;log('profil yazılamadı',uye.slice(0,8),e.message)})},bekleMs);
    bekleyen.set(uye,{veri,t});
  }
  // ---------- maç ve olay kuyruğu ----------
  const kuyruk=[];let isci=null,denemeNo=0,zamanlayici=null;
  const atlanan=new Set(); // misafir ev sahibinin maçları (oyunId): olayları da atlanır
  const kasabaOnbellek=new Map(); // sahip uuid → kasaba id (süreç ömrü)
  function kuyrukla(room,olaylar){
    if(!acik||kapali||!olaylar||!olaylar.length)return;sayac.olay+=olaylar.length;
    const uyeler={};for(const [id,m] of room.members||[])if(m&&m.uye)uyeler[id]=m.uye;
    kuyruk.push({oda:room.code,hostPub:room.hostId,uyeler,olaylar:olaylar.map(o=>({...o}))});
    sayac.kuyruk=kuyruk.reduce((a,is)=>a+is.olaylar.length,0);
    while(sayac.kuyruk>kuyrukSinir&&kuyruk.length){const d=kuyruk.shift();sayac.kuyruk-=d.olaylar.length;sayac.dusen+=d.olaylar.length;log('kuyruk dolu, en eski düşürüldü',d.olaylar.length)}
    calistir();
  }
  function calistir(){if(isci||kapali||!kuyruk.length)return;isci=isle().finally(()=>{isci=null})}
  async function isle(){
    while(kuyruk.length&&!kapali){
      const is=kuyruk[0];
      try{await isiYaz(is);kuyruk.shift();sayac.kuyruk-=is.olaylar.length;denemeNo=0}
      catch(e){sayac.hata++;
        if(e.durum&&e.durum>=400&&e.durum<500){log('yazım düştü',e.message);kuyruk.shift();sayac.kuyruk-=is.olaylar.length;sayac.dusen+=is.olaylar.length;denemeNo=0;continue}
        if(kapali)return; // kapat() istek sürerken geldi: yeni zamanlayıcı kurma
        const ms=deneme[Math.min(denemeNo++,deneme.length-1)];log('yazılamadı, '+ms+' ms sonra tekrar:',e.message);
        await new Promise(r=>{zamanlayici=setTimeout(r,ms)});if(kapali)return;
      }
    }
  }
  async function isiYaz(is){
    for(const o of is.olaylar){
      const oyunId=o.oyunId;if(!oyunId||atlanan.has(oyunId))continue;
      if(o.tur==='baslangic'){
        const sahip=is.uyeler[is.hostPub];
        if(!sahip){atlanan.add(oyunId);sayac.atlanan++;log('misafir ev sahibi, maç yazılmaz',oyunId.slice(0,8));continue}
        const oyuncular=o.veri.oyuncular||[];
        let kasabaId=kasabaOnbellek.get(sahip);
        if(!kasabaId){const var_=await istek('GET','kasabalar?sahip=eq.'+sahip+'&select=id&limit=1');
          if(var_&&var_.length)kasabaId=var_[0].id;
          else{const hostAd=(oyuncular.find(p=>p.id===is.hostPub)||{}).ad||'Ev sahibi';const yeni=await gonder('kasabalar',{ad:ek(hostAd,'in')+' Kasabası',sahip},'return=representation');kasabaId=yeni[0].id}
          kasabaOnbellek.set(sahip,kasabaId)}
        const uyeSatirlari=[{kasaba_id:kasabaId,uye:sahip,rol:'sahip'}];for(const p of oyuncular){const u=is.uyeler[p.id];if(u&&u!==sahip)uyeSatirlari.push({kasaba_id:kasabaId,uye:u,rol:'uye'})}
        await gonder('kasaba_uyeleri',uyeSatirlari,'resolution=ignore-duplicates,return=minimal');
        await gonder('oyunlar',{id:oyunId,kasaba_id:kasabaId,kurulum,oda_kodu:is.oda,baslama:new Date().toISOString(),sonuc:'devam',oyuncu_sayisi:oyuncular.length,ayarlar:o.veri.ayarlar||null},'resolution=ignore-duplicates,return=minimal');
        await gonder('oyun_oyunculari',oyuncular.map(p=>({oyun_id:oyunId,pub_id:p.id,uye:is.uyeler[p.id]||null,ad:p.ad||null,renk:p.renk||null,sapka:p.sapka||null})),'resolution=ignore-duplicates,return=minimal');
        sayac.yazilan+=3;
      }
      // olayın kendisi (gizli alanlar dahil; RLS yalnız bitmiş oyunlar için okutur)
      await gonder('olaylar',[{oyun_id:oyunId,sira:o.sira,gun:o.gun,faz:o.faz,tur:o.tur,veri:o.veri}],'resolution=ignore-duplicates,return=minimal');sayac.yazilan++;
      if(o.tur==='bitis'){
        await istek('PATCH','oyunlar?id=eq.'+oyunId,{bitis:new Date().toISOString(),sonuc:'bitti',kazanan_takim:o.veri.kazanan||null,kazanan_metin:o.veri.kazanan_metin||null},'return=minimal');
        for(const p of o.veri.oyuncular||[])await istek('PATCH','oyun_oyunculari?oyun_id=eq.'+oyunId+'&pub_id=eq.'+encodeURIComponent(p.id),{rol_key:p.rol_key,takim:p.takim,deli_gibi:p.deli_gibi,calinan_rol:p.calinan_rol,sonunda_sag:p.sag,olum_gunu:p.olum_gunu,olum_sekli:p.olum_sekli},'return=minimal');
        sayac.yazilan++;
      }else if(o.tur==='iptal'){
        await istek('PATCH','oyunlar?id=eq.'+oyunId,{bitis:new Date().toISOString(),sonuc:'iptal'},'return=minimal');sayac.yazilan++;
      }
    }
  }
  // Türkçe tamlayan eki (game.js'teki ek() ile aynı kural; kayit game.js'i yüklemez)
  function ek(ad,tip){const a=String(ad);const h=Array.from(a.toLocaleLowerCase('tr')).filter(c=>/[\p{L}\p{N}]/u.test(c));const son=h[h.length-1]||'';
    const U=/[aeıioöuüâîû]/;const u=[...h].reverse().find(c=>U.test(c))||'i';const unlu=/[aıâ]/.test(u)?'ı':/[eiî]/.test(u)?'i':/[ouû]/.test(u)?'u':'ü';const bit=U.test(son);
    return a+"'"+(bit?(tip==='in'?'n':'y'):'')+unlu+(tip==='in'?'n':'')}
  // açılış temizliği: servis yeniden başlamış, kuyruk gitmiş → 3 saatten eski "devam" oyunları iptal
  if(acik){const esik=new Date(Date.now()-3*3600*1000).toISOString();
    istek('PATCH','oyunlar?sonuc=eq.devam&baslama=lt.'+encodeURIComponent(esik),{sonuc:'iptal',bitis:new Date().toISOString()},'return=minimal').then(()=>log('eski devam oyunları iptal edildi')).catch(e=>{sayac.hata++;log('açılış temizliği yapılamadı',e.message)})}
  return{
    kuyrukla,profil,
    kapat(){kapali=true;clearTimeout(zamanlayici);for(const b of bekleyen.values())clearTimeout(b.t);bekleyen.clear()},
    sayac
  };
}
module.exports={olustur};
