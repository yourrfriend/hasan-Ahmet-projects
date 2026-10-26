'use strict';
// Gece gece hikâye (Plan 5): bitmiş bir oyunun olay günlüğünü Türkçe satırlara çevirir. Saf: ağ yok, DOM yok.
//   hikaye(olaylar, oyuncular, ROLES) → [{baslik, satirlar:[string]}]
//   olaylar: {sira,gun,faz,tur,veri} (Supabase `olaylar` ya da R.gameLog); oyuncular: oyun_oyunculari_acik satırları
//   ({pub_id, ad, rol_key, takim, deli_gibi, calinan_rol}); rol null ise (süren oyun) etiket yazılmaz.
// Ölçüm/hızlı olaylar (hazir, kopus, dondu, son_ekran_goruldu, rovans_basladi, hizli) ve bilinmeyen türler atlanır.
// Node: module.exports · tarayıcı: window.KG_HIKAYE. Ek yardımcısı game.js'ten (ek(ad,'in'|'i')).
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KG_HIKAYE=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
const G=(typeof window!=='undefined'&&window.KG_GAME)||(typeof require==='function'?require('../sunucu/game.js'):null);
const ek=G&&G.ek?G.ek:(ad,tip)=>ad+"'"+(tip==='in'?'in':'i');
const FAZ={night:'gece',talk:'tartışma',vote:'oylama',end:'bitiş',lobby:'lobi'};
const HAMLE={doktor:(b)=>ek(b,'i')+' korudu',gozcu:(b)=>ek(b,'in')+' evini gözetledi',izci:(b)=>ek(b,'i')+' izledi',dedektif:(b)=>ek(b,'in')+' evini aradı',
  polis:(b)=>ek(b,'i')+' tutmaya gitti',tuzakci:(b)=>ek(b,'in')+' kapısına tuzak kurdu',ispiyoncu:(b)=>ek(b,'i')+' ispiyonladı',provokator:(b)=>ek(b,'i')+' kışkırttı',
  temizlikci:(b)=>ek(b,'i')+' temizlemeye gitti',suclayici:(b)=>ek(b,'i')+' suçladı',bombaci:(b)=>ek(b,'in')+' evine dinamit koydu',hirsiz:(b)=>ek(b,'in')+' evine girdi',
  buyucu:(b)=>b+' için rol tahmini yaptı',hortlak:(b)=>ek(b,'in')+' kapısına mum koydu',serikatil:(b)=>ek(b,'in')+' evine girdi'};
function hikaye(olaylar,oyuncular,ROLES){
  ROLES=ROLES||(G&&G.ROLES)||{};
  const oy=new Map();for(const p of oyuncular||[])oy.set(p.pub_id,p);
  const nm=id=>{const p=oy.get(id);return p&&p.ad?p.ad:'?'};
  const rolEtiket=(key,takim)=>key?(G&&G.rolEtiketi?G.rolEtiketi({rol_key:key,takim}):key):''; // etiket tek kaynaktan (game.js)
  // anlık rol: rol_key oyun sonu anahtarıdır; Hırsız çalana kadar Hırsız'dır (calinan_rol), çalınca oyun sonu rolüne geçer
  const simdi=new Map();for(const p of oy.values())if(p.calinan_rol&&p.rol_key)simdi.set(p.pub_id,{key:p.calinan_rol,takim:'neu'});
  const rolSimdi=id=>{const s=simdi.get(id);if(s)return s;const p=oy.get(id)||{};return {key:p.rol_key,takim:p.takim}};
  const kimRol=id=>{const r=rolSimdi(id);if(!r.key)return '';return ' ('+rolEtiket(r.key,r.takim)+')'};
  const bloklar=[];const al=(baslik)=>{let b=bloklar[bloklar.length-1];if(!b||b.baslik!==baslik){b={baslik,satirlar:[]};bloklar.push(b)}return b};
  const sirali=[...(olaylar||[])].sort((a,b)=>(a.sira||0)-(b.sira||0));
  for(const e of sirali){
    const v=e.veri||{};const gun=e.gun||0;
    if(e.tur==='gece_hamle'){const b=al('🌙 Gece '+gun);const kim=nm(v.kim),etiket=kimRol(v.kim);const rol=rolSimdi(v.kim).key;
      if(v.tur==='kill')b.satirlar.push(kim+etiket+' '+ek(nm(v.hedef),'in')+' evine girdi');
      else if(v.tur==='self')b.satirlar.push(kim+etiket+' yelek giydi');
      else if(v.tur==='det')b.satirlar.push(kim+etiket+' dinamitleri patlattı');
      else if(v.hedef){const f=HAMLE[rol];b.satirlar.push(kim+etiket+' '+(f?f(nm(v.hedef)):ek(nm(v.hedef),'in')+' evine gitti')+(v.tahmin&&ROLES[v.tahmin]?' ('+ROLES[v.tahmin].n+')':''))}
    }
    else if(e.tur==='gece_sonuc'){const b=al('🌙 Gece '+gun);
      for(const x of v.esyalar||[]){const N=nm(x.kim);const t={iksir:'🧪 '+N+' iksir içti'+(x.etki==='korudu'?' ve saldırıdan sağ çıktı':''),fener:'🏮 '+N+' fenerle bekledi'+(x.etki==='hain_gordu'?'; kapısına gelen haini gördü':''),duman:'💨 '+N+' dumanla görünmeden dolaştı',maske:'🎭 '+N+' maske taktı'}[x.key];if(t)b.satirlar.push(t)}
      for(const k of v.kurtaranlar||[])b.satirlar.push('💉 '+nm(k.kim)+' bir saldırıyı önledi; '+nm(k.hedef)+' sağ çıktı');
      for(const id of v.yelek||[])b.satirlar.push('🦺 '+nm(id)+' yelek sayesinde saldırıdan sağ çıktı');
      const tz={};for(const t of v.tuzak||[]){const key=t.kuran+'>'+t.ev;(tz[key]=tz[key]||{kuran:t.kuran,ev:t.ev,kim:[]}).kim.push(t.kim)}
      for(const t of Object.values(tz))b.satirlar.push('🪤 '+ek(nm(t.kuran),'in')+' tuzağı '+t.kim.map(x=>ek(nm(x),'i')).join(', ')+' '+ek(nm(t.ev),'in')+' kapısında yakaladı');
      for(const t of v.tutanlar||[])b.satirlar.push('👮 Polis '+nm(t.kim)+', '+ek(nm(t.hedef),'i')+' evde tuttu');
      if(v.caldi){b.satirlar.push('🎭 '+nm(v.caldi.hirsiz)+' '+ek(nm(v.caldi.kurban),'in')+' rolünü çaldı; artık '+v.caldi.yeni_rol);simdi.delete(v.caldi.hirsiz)}
      for(const s of v.ispiyon||[])b.satirlar.push('📣 '+nm(s.kim)+' sabah '+ek(nm(s.hedef),'in')+' rolünü açıkladı: '+s.rol);
      const patlayan=(v.olenler||[]).filter(o=>o.sekil==='bomb');if(patlayan.length)b.satirlar.push('🧨 Dinamitler patladı; '+patlayan.map(o=>nm(o.kim)).join(', ')+' evleriyle uçtu');
      for(const o of v.olenler||[]){
        if(o.sekil==='bolt'){if(o.kimden&&o.kimden.length)b.satirlar.push('⚡ Büyücü '+ek(nm(o.kim),'in')+' rolünü doğru tahmin etti; yıldırım düştü');else b.satirlar.push('⚡ Büyücü yanlış tahmin etti; yıldırım kendine döndü ('+nm(o.kim)+')');continue}
        if(o.sekil==='ghost'){b.satirlar.push('🕯️ '+nm(o.kim)+' hayaletin kurbanı oldu');continue}
        if(o.sekil==='bomb'||o.sekil==='vanish')continue;
        b.satirlar.push('💀 '+nm(o.kim)+' öldü'+(o.rol?' ('+o.rol+')':'')+(o.kimden&&o.kimden.length?' — '+o.kimden.map(nm).join(', ')+' öldürdü':''));
      }
      if(!(v.olenler||[]).length&&!(v.kurtaranlar||[]).length&&!(v.yelek||[]).length)b.satirlar.push('Sakin bir gece: kimse ölmedi');
    }
    else if(e.tur==='iddia'){const b=al('☀️ Gün '+gun);const r=ROLES[v.rol_iddia];const iddia=r?r.n:v.rol_iddia;const gercek=rolEtiket(v.gercek_rol,v.gercek_takim);
      b.satirlar.push('🗣️ '+nm(v.kim)+': «Rolüm '+iddia+'» — '+(gercek===iddia?'doğruydu':'o sırada rolü '+gercek+' idi'))}
    else if(e.tur==='gunduz_sonuc'){const b=al('☀️ Gün '+gun);const t=v.toplamlar||{};const parcalar=Object.keys(t).sort((a,c)=>t[c]-t[a]).map(id=>nm(id)+' '+t[id]);if(v.cekimser)parcalar.push('çekimser '+v.cekimser);
      if(v.fis)b.satirlar.push('🗳️ Biri oy fişi kullandı'); // oy gizliliği: kullananın adı yazılmaz
      if(v.provoke)b.satirlar.push('🔥 '+nm(v.provoke)+' kışkırtılmıştı (oy alırsa +2)');
      if(parcalar.length)b.satirlar.push('🗳️ Oylar: '+parcalar.join(', '));
      b.satirlar.push(v.asilan?'⚖️ Kasaba '+ek(nm(v.asilan),'i')+' gönderdi'+(v.rol_goruntu?' ('+v.rol_goruntu+')':''):'⚖️ Oylar yetersiz, kimse gönderilmedi')}
    else if(e.tur==='bitis'){al('🏁 Bitiş').satirlar.push(v.kazanan_metin||'Oyun bitti')}
    else if(e.tur==='iptal'){al('🏁 Bitiş').satirlar.push('Oyun iptal edildi (Gün '+(v.gun||gun)+', '+(FAZ[v.faz]||v.faz||'')+')')}
    // baslangic, hazir, kopus, dondu, son_ekran_goruldu, rovans_basladi, hizli ve bilinmeyenler: satır üretmez
  }
  return bloklar;
}
return {hikaye};
});
