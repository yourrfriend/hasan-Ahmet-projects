'use strict';
// Kasaba sayfası (Plan 5): arkadaş karşılaştırmaları ve kazanma kuralının JS kopyası (db/goc/003 kazanma() ile aynı beş dal).
//   kazandiMi(oyuncuSatiri, oyun) → boolean
//   karsilastir(benUuid, oyunlar, oyuncular) → [{uye, ad, birlikte, ayniTarafZafer, karsi:{ben,o}, azMac}]
//   oyunlar: oyunlar satırları (sonuc, kazanan_takim); oyuncular: oyun_oyunculari_acik satırları (oyun_id, uye, ad, takim, rol_key, sonunda_sag, olum_sekli)
// Yalnız bitmiş (sonuc='bitti') oyunlar; misafirler (uye null) karşılaştırmaya girmez. N<3 ortak maçta azMac:true ("henüz az maç").
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KG_KARSILASTIRMA=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
const TEK=new Set(['serikatil','bombaci','hirsiz','buyucu']);
function kazandiMi(p,oyun){
  if(!p||!oyun)return false;
  if(p.rol_key==='hayatta')return !!p.sonunda_sag;
  if(p.rol_key==='hortlak')return p.olum_sekli==='asildi';
  if(TEK.has(p.rol_key)&&p.takim==='neu')return oyun.kazanan_takim==='neu'&&!!p.sonunda_sag;
  return !!p.takim&&p.takim===oyun.kazanan_takim;
}
function karsilastir(ben,oyunlar,oyuncular){
  const bitmis=new Map();for(const o of oyunlar||[])if(o&&o.sonuc==='bitti')bitmis.set(o.id,o);
  const satirlar=(oyuncular||[]).filter(p=>p&&p.uye&&bitmis.has(p.oyun_id));
  const benim=new Map();for(const p of satirlar)if(p.uye===ben)benim.set(p.oyun_id,p);
  const uyeler=new Map();
  for(const p of satirlar){
    if(p.uye===ben)continue;const b=benim.get(p.oyun_id);if(!b)continue;const oyun=bitmis.get(p.oyun_id);
    const u=uyeler.get(p.uye)||{uye:p.uye,ad:p.ad||'?',birlikte:0,ayniTarafZafer:0,karsi:{ben:0,o:0},azMac:true};
    u.birlikte++;if(p.ad)u.ad=p.ad;
    const benK=kazandiMi(b,oyun),oK=kazandiMi(p,oyun);
    if(b.takim===p.takim){if(benK&&oK)u.ayniTarafZafer++}
    else{if(benK)u.karsi.ben++;if(oK)u.karsi.o++}
    uyeler.set(p.uye,u);
  }
  return [...uyeler.values()].map(u=>({...u,azMac:u.birlikte<3})).sort((a,b)=>b.birlikte-a.birlikte||a.ad.localeCompare(b.ad,'tr'));
}
return {kazandiMi,karsilastir};
});
