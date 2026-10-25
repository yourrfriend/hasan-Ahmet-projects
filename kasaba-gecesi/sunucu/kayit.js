'use strict';
// Kayıt yuvası: sunucu her yayında (flush) odanın olay günlüğünü (R.log) buraya boşaltır ve kayıtlı oyuncuların
// profilini buradan yazar. Oyun sunucusu SQL bilmez; bu modül Supabase'e PostgREST (HTTP, service_role) ile yazar.
//   olustur(opts) → {kuyrukla(room, olaylar), profil(uye, {ad,renk,sapka}), kapat(), sayac}
// opts: {url, serviceKey, bekleMs (profil tekilleştirme, vars. 2000), zamanAsimiMs (5000), quiet}
// url/serviceKey yoksa hiçbir istek yapılmaz (misafir kurulum). kuyrukla/profil hiçbir zaman beklemez ya da fırlatmaz;
// hata sayılır ve loglanır — oyun fark etmez. Olayların veritabanına yazılması Plan 4'te (şimdilik sayılır ve atılır).
function olustur(opts={}){
  const sayac={olay:0,profil:0,hata:0};
  const acik=!!(opts.url&&opts.serviceKey);const bekleMs=opts.bekleMs??2000,zamanAsimi=opts.zamanAsimiMs??5000;
  const log=opts.quiet?()=>{}:(...a)=>console.log(new Date().toISOString(),'kayit:',...a);
  const bekleyen=new Map(); // uye → {veri, t}
  let kapali=false;
  async function gonder(yol,govde,prefer){
    const r=await fetch(opts.url.replace(/\/+$/,'')+'/rest/v1/'+yol,{method:'POST',headers:{apikey:opts.serviceKey,Authorization:'Bearer '+opts.serviceKey,'Content-Type':'application/json',Prefer:prefer},body:JSON.stringify(govde),signal:AbortSignal.timeout(zamanAsimi)});
    if(!r.ok)throw new Error('HTTP '+r.status+' '+(await r.text().catch(()=>'')).slice(0,200));
  }
  // profiller upsert: aynı üye için bekleMs içindeki son değer tek istekte gider (ad/renk/şapka art arda değişir)
  function profil(uye,veri){
    if(!acik||kapali||!uye)return;
    const b=bekleyen.get(uye);if(b)clearTimeout(b.t);
    const t=setTimeout(()=>{bekleyen.delete(uye);const v=bekleyen.get(uye)||{veri};
      gonder('profiller',{uye,ad:veri.ad||'',renk:veri.renk||null,sapka:veri.sapka||null,guncellenme:new Date().toISOString()},'resolution=merge-duplicates,return=minimal')
        .then(()=>{sayac.profil++}).catch(e=>{sayac.hata++;log('profil yazılamadı',uye.slice(0,8),e.message)})},bekleMs);
    bekleyen.set(uye,{veri,t});
  }
  return{
    kuyrukla(room,olaylar){sayac.olay+=olaylar.length},
    profil,
    kapat(){kapali=true;for(const b of bekleyen.values())clearTimeout(b.t);bekleyen.clear()},
    sayac
  };
}
module.exports={olustur};
