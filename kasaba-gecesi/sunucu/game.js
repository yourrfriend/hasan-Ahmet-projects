'use strict';
// Kasaba Gecesi — oyun mantığı (eskiden ev sahibinin tarayıcısında çalışırdı).
// Ağdan bağımsızdır: her fonksiyon bir oda-oyun nesnesi R={P,g,settings} alır ve onu günceller.
//   R.P  herkese açık durum (istemciye aynen gider)
//   R.g  gizli durum (roller, gece hamleleri, oylar, notlar) — asla istemciye gitmez
// Kişiye özel paket privFor(R,id) ile üretilir.
// Aynı dosya tarayıcıda da yüklenir (index.html <script src="sunucu/game.js">): sabitler tek yerde durur.
//   Node: module.exports   ·   tarayıcı: window.KG_GAME
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KG_GAME=api})(typeof globalThis!=='undefined'?globalThis:this,function(){

// ---------- Rol tanımları ----------
// act: 'other' = bir ev seçer, 'self' = kendine, yok = yetenek yok. pos: gece gittiği evde nerede durur.
const ROLES={
  masum:{n:'Masum',team:'inn',ico:'🏠',desc:'Özel bir yeteneğin yok. Gündüz tartış, oylamayla hainleri bul.',ipucu:"Gece bir şey yapmazsın; gündüz kimin ne söylediğini karşılaştır, çelişkileri yakala."},
  doktor:{n:'Doktor',team:'inn',ico:'💉',desc:'Gece birini seç. O gece saldırıya uğrarsa kurtulur.',act:'other',pos:'door',ipucu:"Kendini koruyamazsın; sabah ölümleri koruduğun evle eşleştir. Kimi koruduğunu açıklamak haini sana yöneltebilir."},
  deli:{n:'Deli',team:'inn',ico:'🌀',desc:'Masum bir rol olduğunu sanırsın ama yaptıkların hiçbir şey değiştirmez.',ipucu:"Bunu bilmezsin: bilgilerin uydurma olabilir. Kimse %100 emin konuşmasın."},
  polis:{n:'Polis',team:'inn',ico:'👮',desc:'Seçtiğin kişi o gece evden çıkamaz; rolünü kullanamaz. Seri Katil\'i ve Bombacı\'yı tutamazsın.',act:'other',dual:true,pos:'door',ipucu:"Tuttuğun kişi o gece yetenek kullanamaz; şüpheliyi tutmak ölümü de önleyebilir."},
  gozcu:{n:'Gözcü',team:'inn',ico:'🔭',desc:'Seçtiğin evi gözetlersin; o gece kaç kişinin geldiğini öğrenirsin.',act:'other',dual:true,pos:'bush',ipucu:"Gelen sayısı rol söylemez; bir ziyaretçi Doktor da olabilir, hain de."},
  izci:{n:'İzci',team:'inn',ico:'👣',desc:'Seçtiğin kişiyi izlersin; gece hangi eve gittiğini öğrenirsin.',act:'other',dual:true,pos:'bush',ipucu:"Birinin bir eve gitmesi tek başına hain olduğunu göstermez; sabah ölümlerle eşleştir."},
  dedektif:{n:'Dedektif',team:'inn',ico:'🔍',desc:'Seçtiğin kişinin evini ararsın; olabileceği rolleri öğrenirsin.',act:'other',dual:true,pos:'window',ipucu:"Üç rolden yalnız biri doğru; listeyi açıklamak hedefi savunmasız bırakabilir."},
  tuzakci:{n:'Tuzakçı',team:'inn',ico:'🪤',desc:'Seçtiğin evin önüne tuzak kurarsın; o eve gelen herkes yakalanır ve rolünü kullanamaz.',act:'other',dual:true,pos:'door',ipucu:"Tuzağa yakalanan herkes o gece etkisiz; yakalanan masum da olabilir."},
  ispiyoncu:{n:'İspiyoncu',team:'inn',ico:'📣',desc:'Bir kez: seçtiğin kişinin rolünü sabah meydanda herkese açıklarsın.',act:'other',once:true,dual:true,pos:'window',ipucu:"Tek seferlik: sabah herkese açıklanır. Zamanlaması oyunu belirler."},
  provokator:{n:'Provokatör',team:'inn',ico:'🔥',desc:'Bir kez: seçtiğin kişiye ertesi oylamada 2 oy eklenir (en az bir gerçek oy alırsa).',act:'other',once:true,dual:true,pos:'door',ipucu:"Tek seferlik: seçtiğin kişi ertesi oylamada gerçek bir oy alırsa 2 oy daha eklenir; dikkatli hedef seç."},
  hain:{n:'Hain',team:'imp',ico:'🗡️',desc:'Her gece birinin evine girip onu öldürürsün. Hainler birbirini tanır ama gece birbirini göremez.',ipucu:"Her gece ayrı öldürürsün; arkadaşın kim bilirsin. Gündüz masum gibi akıl yürüt."},
  temizlikci:{n:'Temizlikçi',team:'imp',ico:'🧹',desc:'Gece ya öldürürsün ya temizlersin: seçtiğin kişi o gece ölürse rolü sabah gizli kalır.',act:'other',pos:'door',ipucu:"Temizlediğin kişi ölürse rolü sabah gizli kalır; o gece öldüremezsin."},
  suclayici:{n:'Suçlayıcı',team:'imp',ico:'🫵',desc:'Gece ya öldürürsün ya suçlarsın: seçtiğin kişi o gece ölür ya da ertesi gün asılırsa rolü Hain görünür.',act:'other',pos:'door',ipucu:"Suçladığın kişi ölür ya da asılırsa 'Hain' görünür; gündüz şüpheyi ona yönlendir."},
  hayatta:{n:'Hayatta Kalan',team:'neu',ico:'🦺',desc:'Sona kadar yaşa. 3 kez yelek giyebilirsin; yelekliyken ölmezsin. Kazanan tarafla kazanırsın.',act:'self',ipucu:"Yelek bir gece korur, 3 hakkın var; kimse seni hedef görmesin."},
  serikatil:{n:'Seri Katil',team:'neu',ico:'🔪',desc:'Her gece birinin evine girip onu öldürürsün. Polis seni tutamaz. Tek başına kalınca kazanırsın.',act:'other',pos:'enter',ipucu:"Polis seni tutamaz; herkese karşısın, hainler de seni avlar."},
  bombaci:{n:'Bombacı',team:'neu',ico:'🧨',desc:'Her gece bir eve dinamit koyarsın. İstediğin gece hepsini patlatırsın. Polis seni tutamaz. Herkes ölünce kazanırsın.',act:'other',pos:'door',ipucu:"Dinamitleri biriktir, doğru gece hepsini patlat; Polis seni tutamaz."},
  hirsiz:{n:'Hırsız',team:'neu',ico:'🎭',desc:'Seçtiğin kişinin evine girip onu öldürür ve rolünü çalarsın; artık o rolle o tarafta oynarsın.',act:'other',pos:'enter',ipucu:"Rolü çaldığın kişi kaybolur; sonra o rolle ve o tarafla kazanmaya çalışırsın."},
  buyucu:{n:'Büyücü',team:'neu',ico:'⚡',desc:'Evinden çıkmadan birini seçip rolünü tahmin edersin. Doğruysa yıldırımla ölür, Doktor kurtaramaz. Yanlışsa sen ölürsün. Tek başına kazanırsın.',act:'other',guess:true,pos:'home',ipucu:"Evden çıkmazsın; tahmin yanlışsa sen ölürsün — bilgi topla, acele etme."},
  hortlak:{n:'Hortlak',team:'neu',ico:'🕯️',desc:'Gece bir evin önüne mum koyarsın. Ertesi gün asılırsan o gece hayalet olarak gelir, mum koyduğun kişiyi öldürürsün. Asılınca kazanırsın.',act:'other',pos:'door',ipucu:"Asılmak kazanmaktır; mum koyduğun kişi o gece hayalet olarak alınır."}
};
const MADPOOL=['doktor','polis','gozcu','izci','dedektif','tuzakci','ispiyoncu','provokator'];
const INVGROUPS=[['doktor','serikatil','hirsiz'],['polis','hain','hayatta'],['gozcu','dedektif','bombaci'],['tuzakci','ispiyoncu','temizlikci'],['provokator','suclayici','masum'],['izci','buyucu','hortlak']];
const DUAL=['polis','gozcu','izci','dedektif','tuzakci','ispiyoncu','provokator'];
const SETUP=[
  ...['masum','doktor','deli','polis','gozcu','izci','dedektif','tuzakci','ispiyoncu','provokator'].map(k=>({id:k,key:k,team:'inn'})),
  {id:'hain',key:'hain',team:'imp'},{id:'temizlikci',key:'temizlikci',team:'imp'},{id:'suclayici',key:'suclayici',team:'imp'},
  ...DUAL.map(k=>({id:k+'_h',key:k,team:'imp'})),
  ...['hayatta','serikatil','bombaci','hirsiz','buyucu','hortlak'].map(k=>({id:k,key:k,team:'neu'}))
];
const COLORS=['#3b7bff','#ff6fae','#2fb55a','#ffd23f','#8e4bff','#2fd3c8','#ff7a2f','#f4f1e8','#6b3f2a','#e23b3b','#9bd84a','#ff9ad5'];
const HATS=['none','beanie','cap','ears','bow','glasses','hood'];
const DEFAULT_SETTINGS={night:30,talk:120,vote:45};
// ---------- İlerleme ve eşya modu (tasarım docs/superpowers/specs/2026-10-26-kasaba-gecesi-ilerleme-esya-design.md) ----------
const ESYA={
  iksir:{n:'İksir',ico:'🧪',faz:'night',desc:'Bir gece saldırılara karşı korunursun (yıldırım ve hayalet hariç).'},
  fener:{n:'Fener',ico:'🏮',faz:'night',desc:'Bir gece evine gelenlerin adlarını öğrenirsin.'},
  duman:{n:'Duman',ico:'💨',faz:'night',desc:'Bir gece ziyaretin görünmez olur: Gözcü, İzci ve fener seni görmez.'},
  maske:{n:'Maske',ico:'🎭',faz:'night',desc:'Bir gece Dedektif ve İspiyoncu seni Masum görür.'},
  fis:{n:'Oy fişi',ico:'🗳️',faz:'vote',desc:'Bir oylamada oyun 2 sayılır (tek başına kimseyi astıramaz).'}
};
const NADIRLIK={siradan:{fiyat:12,donusum:3},nadir:{fiyat:30,donusum:8},efsanevi:{fiyat:80,donusum:20}};
const KOZMETIK={
  sapka:{cicek:{n:'Çiçek',nadir:'siradan'},parti:{n:'Parti külahı',nadir:'siradan'},kask:{n:'Kask',nadir:'siradan'},sef:{n:'Aşçı şapkası',nadir:'siradan'},
    kovboy:{n:'Kovboy',nadir:'nadir'},korsan:{n:'Korsan',nadir:'nadir'},cadi:{n:'Cadı şapkası',nadir:'nadir'},tac:{n:'Taç',nadir:'efsanevi'},hale:{n:'Hale',nadir:'efsanevi'}},
  bayrak:{kirmizi:{n:'Kırmızı bayrak',nadir:'siradan',renk:'#e23b3b'},mavi:{n:'Mavi bayrak',nadir:'siradan',renk:'#3b7bff'},yesil:{n:'Yeşil bayrak',nadir:'siradan',renk:'#2fb55a'},mor:{n:'Mor bayrak',nadir:'siradan',renk:'#8e4bff'},
    yildiz:{n:'Yıldızlı bayrak',nadir:'nadir',renk:'#1e3a8a',ico:'⭐'},ay:{n:'Hilal bayrağı',nadir:'nadir',renk:'#0e1a3d',ico:'🌙'},ejder:{n:'Ejder sancağı',nadir:'efsanevi',renk:'#7a1010',ico:'🐉'},simsek:{n:'Şimşek sancağı',nadir:'efsanevi',renk:'#3a2f1c',ico:'⚡'}},
  efekt:{yaprak:{n:'Yaprak',nadir:'siradan',ico:'🍂'},yildiz:{n:'Yıldız',nadir:'nadir',ico:'✨'},duman:{n:'Duman',nadir:'nadir',ico:'💨'},havaifisek:{n:'Havai fişek',nadir:'efsanevi',ico:'🎆'}}
};
const KASA={esya:50,yildiz:12,siradan:25,nadir:10,efsanevi:3}; // yüzde
const ROZETLER={
  ilk_mac:{n:'İlk maç',ico:'🎟️',desc:'İlk maçını oynadın.'},mac_10:{n:'Müdavim',ico:'🏘️',desc:'10 maç oynadın.'},mac_50:{n:'Kasabanın demirbaşı',ico:'🏛️',desc:'50 maç oynadın.'},
  kurtarici:{n:'Kurtarıcı',ico:'💉',desc:'Doktor olarak bir saldırıyı önledin.'},bekci:{n:'Bekçi',ico:'👮',desc:'Polis olarak bir haini evde tuttun.'},
  tuzak_ustasi:{n:'Tuzak ustası',ico:'🪤',desc:'Tuzağın birini yakaladı.'},hain_zafer:{n:'Gölgelerin efendisi',ico:'🗡️',desc:'Hain olarak kazandın.'},
  masum_zafer:{n:'Kasabanın kalkanı',ico:'🛡️',desc:'Masum tarafında kazandın.'},sag_kalan:{n:'Son ışık',ico:'🕯️',desc:'Sona kadar yaşadın ve kazandın.'},
  tek_kurt:{n:'Yalnız kurt',ico:'🐺',desc:'Tarafsız olarak tek başına kazandın.'},hortlak_zafer:{n:'Mezardan zafer',ico:'👻',desc:'Hortlak olarak asılıp kazandın.'},
  yildirim:{n:'Yıldırım',ico:'⚡',desc:'Büyücü olarak bir rolü doğru tahmin ettin.'},iksir_kurtardi:{n:'Son yudum',ico:'🧪',desc:'İksirin seni ölümden kurtardı.'},
  fener_gordu:{n:'Gece nöbeti',ico:'🏮',desc:'Fenerin kapına gelen bir haini gördü.'}
};
const TEK_KAZANAN=['serikatil','bombaci','hirsiz','buyucu'];
function kasaOdulu(rnd){rnd=rnd||Math.random;const r=rnd()*100,r2=rnd();let t=0;const sec=a=>a[Math.min(a.length-1,Math.floor(r2*a.length))];
  if(r<(t+=KASA.esya))return {tur:'esya',key:sec(Object.keys(ESYA)),adet:1};
  if(r<(t+=KASA.yildiz))return {tur:'yildiz',adet:3+Math.min(2,Math.floor(r2*3))};
  const nadir=r<(t+=KASA.siradan)?'siradan':r<(t+=KASA.nadir)?'nadir':'efsanevi';
  const havuz=[];for(const [tur,ks] of Object.entries(KOZMETIK))for(const [k,v] of Object.entries(ks))if(v.nadir===nadir)havuz.push(tur+':'+k);
  return {tur:'kozmetik',key:sec(havuz),nadir};
}
// kozmetik doğrulama: temel şapkalar ve 'none' herkese; katalogdakiler yalnız sahibine (sahip: Set('tur:anahtar'))
function kozmetikGecerli(tur,key,sahip){if(typeof key!=='string')return false;
  if(tur==='sapka'&&HATS.includes(key))return true;if((tur==='bayrak'||tur==='efekt')&&key==='none')return true;
  return has(KOZMETIK,tur)&&has(KOZMETIK[tur],key)&&!!sahip&&sahip.has(tur+':'+key)}
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);

function roleLabel(r){const b=ROLES[r.key];return b.n+((r.team==='imp'&&b.team!=='imp')?' (Hain)':'')}
// Kayıt satırından rol etiketi (tek kaynak: index.html, sayfa/ortak.js, sayfa/hikaye.js bunu kullanır): {rol_key,takim,deli_gibi,calinan_rol}
// maç sonu rozetleri: yalnız günlükteki gerçek olaylardan (oylar tek tek kaydedilmez → oya dayalı rozet yok); maç sayısı rozetleri RPC'de
function rozetlerFor(R,id){const g=R.g,P=R.P;if(!g||!g.roles[id])return [];const out=new Set();const r=g.roles[id];
  for(const e of R.gameLog||[]){if(e.tur!=='gece_sonuc')continue;const v=e.veri||{};
    if((v.kurtaranlar||[]).some(k=>k.kim===id))out.add('kurtarici');
    if((v.tutanlar||[]).some(t=>t.kim===id&&g.roles[t.hedef]&&g.roles[t.hedef].team==='imp'))out.add('bekci');
    if((v.tuzak||[]).some(t=>t.kuran===id))out.add('tuzak_ustasi');
    for(const o of v.olenler||[]){const bolt=o.sekil==='bolt'?o.kimden:(o.sekiller||[]).includes('bolt')?o.yildirim_kimden:null;if(bolt&&bolt.includes(id))out.add('yildirim')}
    for(const x of v.esyalar||[]){if(x.kim!==id)continue;if(x.key==='iksir'&&x.etki==='korudu')out.add('iksir_kurtardi');if(x.key==='fener'&&x.etki==='hain_gordu')out.add('fener_gordu')}}
  if(P.phase==='end'&&P.winner&&(P.winner.kazananlar||[]).includes(id)){const me=pl(R,id);
    if(r.team==='imp')out.add('hain_zafer');if(r.team==='inn'||r.mad)out.add('masum_zafer');
    if(r.team==='neu'&&TEK_KAZANAN.includes(r.orig||r.key))out.add('tek_kurt');if(r.key==='hortlak')out.add('hortlak_zafer');
    if(me&&me.alive)out.add('sag_kalan')}
  return [...out];
}
function rolEtiketi(b){if(!b||!b.rol_key)return '?';const r=ROLES[b.rol_key];let ad=r?r.n:b.rol_key;if(b.takim==='imp'&&r&&r.team!=='imp')ad+=' (Hain)';if(b.deli_gibi)ad+=' (aslında Deli)';if(b.calinan_rol)ad+=' (Hırsız çaldı)';return ad}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
// Rol dağılımı (tasarım docs/superpowers/specs/2026-10-24-kasaba-gecesi-sahne-design.md §5.1): eşikler oyuncu
// sayısına göre; her özel rol en fazla bir kez; 2 hainde 1 sürümlü + 1 düz Hain, tek hain DAGILIM.tekHainSurumP olasılıkla sürümlü;
// Masum DAGILIM.masum(n) (4–6: 0, 7+: 1), kalan masumların hepsi yetenekli (havuz 8 rol); bilgi rolü sayısı ≥ hain.
// Geri bildirim paketi: docs/superpowers/specs/2026-10-25-kasaba-gecesi-rol-dagilimi-geri-bildirim-design.md.
// Eşikler test/denge.js ile ölçülür (README "Rol dağılımı").
// Eşikler denge.js ölçümüyle seçildi (2026-10-24): her hain ayrı öldürdüğü için 2 hain ancak 9+ kişide; 3 hain hiç yok.
const DAGILIM={
  hain:n=>n<=8?1:2,
  saldirgan:n=>n>=12?2:n>=9?1:0,   // serikatil / bombaci / hirsiz / buyucu
  pasif:n=>n>=9?1:0,               // hayatta / hortlak
  deli:n=>n>=6?1:0,
  masum:n=>n>=7?1:0,               // yeteneksiz Masum: 4–6 kişide yok, 7+ kişide 1 (kullanıcı kararı 2026-10-25)
  tekHainSurumP:0.5                // tek hainli oyunda hainin sürümlü (Polis-hain, Gözcü-hain…) olma olasılığı; 2 hainde hep 1 sürümlü + 1 düz
};
Object.freeze(DAGILIM); // eşikler tek yerde ve değişmez; ölçüm/test için autoSetup(n, ayar) ile geçici üst yazım
const BILGI_ROLLERI=['polis','gozcu','izci','dedektif','ispiyoncu'];
// Tekrar eğilimi (geri bildirim paketi §5.3): torba değişmez, yalnız kimin hangi rolü aldığı seçilir. Oyuncu başına son
// gecmisUz rol R.rolGecmisi'nde (gizli, oda ömrünce) tutulur; kacinmaP olasılıkla deneme kadar karıştırmadan en az cezalısı
// seçilir, kalanında düz karıştırma (kesin yasak olmasın: "geçen maç haindi, bu maç değil" denemesin).
const TEKRAR={kacinmaP:0.8,gecmisUz:5,deneme:200,ceza:{hemen:4,yakin:1,takim:2}};
function tekrarCezasi(rol,gecmis){
  if(!gecmis||!gecmis.length)return 0;
  let c=0;
  if(gecmis[0].key===rol.key)c+=TEKRAR.ceza.hemen;
  for(let i=1;i<=2&&i<gecmis.length;i++)if(gecmis[i].key===rol.key)c+=TEKRAR.ceza.yakin;
  if(rol.team==='imp'&&gecmis.length>=2&&gecmis[0].team==='imp'&&gecmis[1].team==='imp')c+=TEKRAR.ceza.takim;
  return c;
}
function rolDagit(bag,players,gecmis,opts){
  const o={...TEKRAR,...(opts||{})};gecmis=gecmis||{};
  const toplam=sira=>sira.reduce((a,r,i)=>a+tekrarCezasi(r,gecmis[players[i].id]),0);
  if(Math.random()>=o.kacinmaP)return shuffle(bag.slice());
  let enIyi=shuffle(bag.slice()),enAz=toplam(enIyi);
  for(let d=1;d<o.deneme;d++){const sira=shuffle(bag.slice());const c=toplam(sira);if(c<enAz){enAz=c;enIyi=sira;if(c===0)break}}
  return enIyi;
}
function autoSetup(n,ayar){ // ayar: DAGILIM alanlarını geçici üst yazar (denge.js, testler); üretimde verilmez
  const D=ayar?{...DAGILIM,...ayar}:DAGILIM;
  const c={};const add=id=>{c[id]=(c[id]||0)+1};
  const hain=D.hain(n),sald=D.saldirgan(n),pasif=D.pasif(n),deli=D.deli(n);
  const surumlu=hain===1?(Math.random()<D.tekHainSurumP?1:0):Math.floor(hain/2);
  const yh=shuffle(['temizlikci','suclayici','polis_h','gozcu_h','dedektif_h','tuzakci_h','izci_h','ispiyoncu_h','provokator_h']).slice(0,surumlu);
  yh.forEach(add);for(let i=yh.length;i<hain;i++)add('hain');
  shuffle(['serikatil','bombaci','hirsiz','buyucu']).slice(0,sald).forEach(add);
  shuffle(['hayatta','hortlak']).slice(0,pasif).forEach(add);
  if(deli)add('deli');
  const m=n-hain-sald-pasif-deli;
  const yetenekli=Math.min(m-D.masum(n),8);
  const secilen=['doktor'];if(n>=5&&secilen.length<yetenekli)secilen.push('polis');
  let bilgi=secilen.filter(k=>BILGI_ROLLERI.includes(k)).length;
  const havuzB=shuffle(['gozcu','izci','dedektif','ispiyoncu']),havuzD=shuffle(['tuzakci','provokator']);
  while(secilen.length<yetenekli&&(havuzB.length||havuzD.length)){
    let k;
    if(bilgi<hain&&havuzB.length)k=havuzB.shift();            // önce bilgi rolleri, hain sayısına ulaşana kadar
    else{k=shuffle([...havuzB,...havuzD])[0];const ix=havuzB.indexOf(k);if(ix>=0)havuzB.splice(ix,1);else havuzD.splice(havuzD.indexOf(k),1)}
    secilen.push(k);if(BILGI_ROLLERI.includes(k))bilgi++;
  }
  secilen.forEach(add);for(let i=secilen.length;i<m;i++)add('masum');
  return c;
}
function cleanSettings(s){
  const o={...DEFAULT_SETTINGS};
  for(const k of Object.keys(DEFAULT_SETTINGS))if(s&&Number.isFinite(+s[k]))o[k]=Math.max(15,Math.min(600,Math.round(+s[k])));
  o.esyaModu=!!(s&&s.esyaModu===true); // eşya modu: ev sahibi lobide açar (yalnız gerçek true)
  return o;
}

let clock=()=>Date.now();
function setClock(f){clock=f||(()=>Date.now())}

function lobbyState(){return{phase:'lobby',chat:[],dead:[],players:[]}}
function createGame(settings){return{P:lobbyState(),g:null,settings:cleanSettings(settings),seq:0,log:[],logSeq:0,gameLog:[],rolGecmisi:{}}} // rolGecmisi: pubId → [{key,team}…] en yeni önde (gizli)

function pl(R,id){return (R.P.players||[]).find(p=>p.id===id)}
function alivePlayers(R){return (R.P.players||[]).filter(p=>p.alive)}
function nameOf(R,id){const p=pl(R,id);return p?p.name:'?'}
function effKey(R,id){const r=R.g.roles[id];return r.mad?null:r.key}
function shownRole(R,id){const r=R.g.roles[id];return r.mad?{key:r.mad,team:'inn'}:{key:r.key,team:r.team}}
function note(R,id,t){if(R.g.notes[id])R.g.notes[id].push('Gece '+R.P.day+': '+t)}
// her sohbet satırı artan bir sıra numarası (s) taşır; sunucu istemciye yalnız yeni satırları yollar
function pushChat(R,m){m.s=R.seq=(R.seq||0)+1;R.P.chat.push(m);if(R.P.chat.length>150)R.P.chat.shift()}
function sysChat(R,t){pushChat(R,{sys:true,t})}
// Olay günlüğü (R.log): hikâye, özet ve istatistiğin tek kaynağı. Gizlidir, P'ye girmez; sunucu her yayında boşaltır.
// Oyuncular açık kimlikle (P.players[].id) geçer. Olay türleri ve alanları: docs/superpowers/specs/…gecmis-design.md §5.4
// R.log sunucuya giden kuyruktur (her yayında boşaltılır); R.gameLog bu oyunun tam günlüğüdür (özet ve "senin payın" buradan).
function logEv(R,tur,veri){const e={sira:++R.logSeq,gun:R.P.day||0,faz:R.P.phase,tur,veri,oyun:R.P.gameId||null,oyunId:R.P.oyunId||null,zaman:Date.now()};R.log.push(e);R.gameLog.push(e)}
// Ölçüm olayları (sunucu yazar: son_ekran_goruldu, hazir, rovans_basladi, kopus, dondu); içerik taşımaz, günlükle aynı yoldan kayda gider
function olay(R,tur,veri){R.log.push({sira:++R.logSeq,gun:R.P.day||0,faz:R.P.phase,tur,veri,oyun:R.P.gameId||null,oyunId:R.P.oyunId||null,zaman:Date.now()})} // gameLog'a girmez (özet/gazete onu tarar)

// ---------- Oyun akışı ----------
// lobby: [{id,name,color,hat}] (oda sırasıyla). En az 4, en çok 12 kişi.
// Maç kimliği (uuid v4): kayıt tablolarının anahtarı; herkese açıktır (Plan 5'te /oyun/<id>). Node ve tarayıcıda crypto.randomUUID var.
function yeniOyunId(){const c=typeof crypto!=='undefined'?crypto:(typeof require==='function'?require('crypto'):null);return c&&c.randomUUID?c.randomUUID():'u-'+clock()+'-'+Math.random().toString(36).slice(2,10)}
// Oyuncu başına kapanış alanları (bitis olayı → oyun_oyunculari): rol oyun sonundaki, Deli masum, Hırsız çaldıysa calinan_rol işareti
function kapanisFor(R){const g=R.g;const olum={};
  for(const e of R.gameLog){if(e.tur==='gece_sonuc')for(const o of e.veri.olenler)olum[o.kim]={gun:e.gun,sekil:o.sekil};else if(e.tur==='gunduz_sonuc'&&e.veri.asilan)olum[e.veri.asilan]={gun:e.gun,sekil:'asildi'}}
  return R.P.players.map(p=>{const r=g.roles[p.id];return {id:p.id,rol_key:r.key,takim:r.mad?'inn':r.team,deli_gibi:r.mad||null,calinan_rol:r.orig||null,sag:!!p.alive,olum_gunu:olum[p.id]?olum[p.id].gun:null,olum_sekli:olum[p.id]?olum[p.id].sekil:null}})}
function startGame(R,lobby,secenek){ // secenek: {rovans:true, onceki:gameId} rövanşta
  const players=lobby.slice();if(players.length<4||players.length>12)return false;
  R.logSeq=0; // sira maç başına (rovans_basladi olayı start'tan önce yazılır: eski maçın sırasında kalır)
  const counts=autoSetup(players.length,secenek&&secenek.dagilim);
  const bag=[];for(const e of SETUP)for(let i=0;i<(counts[e.id]||0);i++)bag.push({key:e.key,team:e.team});
  if(!R.rolGecmisi)R.rolGecmisi={};
  const sira=rolDagit(bag,players,R.rolGecmisi);
  const roles={};players.forEach((p,i)=>{const r=sira[i];roles[p.id]={key:r.key,team:r.team,mad:r.key==='deli'?MADPOOL[Math.floor(Math.random()*MADPOOL.length)]:null,uses:{},vest:3,planted:[]};
    R.rolGecmisi[p.id]=[{key:r.key,team:r.team},...(R.rolGecmisi[p.id]||[])].slice(0,TEKRAR.gecmisUz)});
  R.g={roles,acts:{},notes:{},dchat:[],votes:{},provoke:null,blame:null,clean:null,candle:{},haunt:null,hauntWins:[],esya:{},fis:{}};R.gameLog=[];
  // eşya modu: herkese tam bir eşya, rolden bağımsız (sunucu lobide seçimi/çekilişi secenek.esyalar ile verir; eksik/geçersiz → rastgele bedava)
  if(R.settings&&R.settings.esyaModu){const keys=Object.keys(ESYA);for(const p of players){const s=secenek&&secenek.esyalar&&secenek.esyalar[p.id];
    R.g.esya[p.id]=s&&typeof s.key==='string'&&has(ESYA,s.key)?{key:s.key,kaynak:s.kaynak==='envanter'?'envanter':'bedava',kullanildi:false}:{key:keys[Math.floor(Math.random()*keys.length)],kaynak:'bedava',kullanildi:false}}}
  players.forEach(p=>R.g.notes[p.id]=[]);
  const settings={...R.settings};
  R.P={phase:'night',day:1,ends:clock()+settings.night*1000+6000,chat:[],dead:[],voted:[],settings,gameId:clock(),oyunId:yeniOyunId(),morning:null,evening:null,provoked:null,
     players:players.map(p=>({id:p.id,name:p.name,alive:true,color:p.color,hat:p.hat,bayrak:p.bayrak||'none',efekt:p.efekt||'none'})),
     roleList:bag.map(r=>({n:roleLabel(r),team:r.team})).sort((a,b)=>a.team.localeCompare(b.team))};
  logEv(R,'baslangic',{ayarlar:settings,roller:R.P.roleList,oyuncular:players.map(p=>({id:p.id,ad:p.name,renk:p.color,sapka:p.hat})),...(secenek&&secenek.rovans?{rovans:true,onceki:secenek.onceki}:{})});
  return true;
}
function setPhase(R,ph){
  const P=R.P,g=R.g;
  P.phase=ph;g.votes={};P.voted=[];P.provoked=null;P.waited=false;P.waiting=null;
  // sabah/akşam sahnelerine animasyon payı eklenir
  const extra=ph==='talk'?7:ph==='night'?6:0;
  const secs=ph==='night'?P.settings.night:ph==='talk'?P.settings.talk:P.settings.vote;
  P.ends=clock()+(secs+extra)*1000;
  if(ph==='night'){P.day++;g.acts={}}
  if(ph==='vote'){if(g.provoke&&g.provoke.day===P.day)P.provoked=g.provoke.t}
  if(ph!=='talk')P.morning=null;if(ph!=='night')P.evening=null;
}
function inGame(R){return !!R.g&&['night','talk','vote'].includes(R.P.phase)}
function advance(R){
  if(!inGame(R))return false;
  if(R.P.phase==='night')resolveNight(R);
  else if(R.P.phase==='talk')setPhase(R,'vote');
  else if(R.P.phase==='vote')resolveVote(R);
  return true;
}
// Süre dolduysa fazı ilerletir. Değişiklik olduysa true.
// Gece bitiminde bağlantısı kopuk (offline: açık kimlik kümesi) yaşayan oyuncu varsa faz bir kez, en çok WAIT_MS bekler;
// kopuk olanların adı P.waiting ile herkese gösterilir. Hamlesi olup olmadığına bakılmaz: bakılsa rolü ele verirdi.
const WAIT_MS=30000;
function tick(R,offline){
  if(!inGame(R)||!R.P.ends||clock()<R.P.ends)return false;
  if(R.P.phase==='night'&&offline&&!R.P.waited){
    const w=alivePlayers(R).filter(p=>offline.has(p.id)).map(p=>p.id);
    if(w.length){R.P.waited=true;R.P.waiting=w;R.P.ends=clock()+WAIT_MS;return true}
  }
  return advance(R);
}

function resolveNight(R){
  const P=R.P,g=R.g,acts={...g.acts};
  const nm=id=>nameOf(R,id),nt=(id,t)=>note(R,id,t),eff=id=>effKey(R,id);
  const al=alivePlayers(R).map(p=>p.id);const alive=id=>pl(R,id)&&pl(R,id).alive;
  const blocked=new Set(),traps={},visits={},attacks=[],heals=new Set(),vested=new Set(),went={};
  al.forEach(id=>visits[id]=[]);
  // hainde öldürme ile yetenek aynı gece olmaz: öldürme seçildiyse yetenek düşer
  for(const id of al){const r=g.roles[id];if(r.team==='imp'&&acts[id]&&acts[id].kill)acts[id]={...acts[id],ab:null}}
  const A=id=>acts[id]||{};
  const tgt=(id,f)=>{const t=A(id)[f];return(t&&alive(t)&&t!==id)?t:null};
  const M={deaths:[],saved:[],snitch:[],lightning:[],exploded:[],haunted:[],news:[]};
  // günlük: yalnız etkin hamleler (deli ve geçersiz hedefler yazılmaz; hainde öldürme seçildiyse yetenek zaten düşmüştür)
  // eşyalar (gece): bu gece kullanılanlar çözümde harcanır (tutulmuş olsan da evdesin)
  const ES=g.esya||{};const kul=al.filter(id=>ES[id]&&!ES[id].kullanildi&&ESYA[ES[id].key].faz==='night'&&A(id).esya);kul.forEach(id=>{ES[id].kullanildi=true});
  const esyaLog=kul.map(id=>({kim:id,key:ES[id].key,etki:null}));const esyaKume=k=>new Set(kul.filter(id=>ES[id].key===k));
  const dumanli=esyaKume('duman'),maskeli=esyaKume('maske'),iksirli=esyaKume('iksir'),fenerli=esyaKume('fener');
  const L={tutulan:new Set(),tutanlar:[],tuzak:[],yelek:new Set(),kurtaranlar:[],bombalar:[],mum:[],caldi:null,provokasyon:null,killers:{},killerAd:{},sekiller:{},boltIds:{}}; // aynı kişi birden çok saldırı/polisle tekrar yazılmasın diye Set
  for(const id of al){const k=eff(id);if(!k)continue;const a=A(id);
    if(g.roles[id].team==='imp'&&tgt(id,'kill'))logEv(R,'gece_hamle',{kim:id,tur:'kill',hedef:tgt(id,'kill'),tahmin:null});
    if(k==='hayatta'&&a.ab==='self')logEv(R,'gece_hamle',{kim:id,tur:'self',hedef:null,tahmin:null});
    else if(ROLES[k].act==='other'&&tgt(id,'ab')){const tahmin=k==='buyucu'&&typeof a.guess==='string'&&has(ROLES,a.guess)?a.guess:null;
      if(!(k==='buyucu'&&!tahmin))logEv(R,'gece_hamle',{kim:id,tur:k==='buyucu'?'guess':'ab',hedef:tgt(id,'ab'),tahmin})} // tahminsiz büyücü: etkisiz hamle, günlüğe girmez
    if(k==='bombaci'&&a.det)logEv(R,'gece_hamle',{kim:id,tur:'det',hedef:null,tahmin:null});
  }
  // 1–2) tuzak ve polis birbirini etkiler, o yüzden birlikte ve sıradan bağımsız çözülür:
  //   · Polisin tuttuğu polis kimseyi tutamaz; iki polis birbirini seçerse ikisi de evde kalır.
  //   · Polisin tuttuğu tuzakçı tuzak kuramaz; tuzağa yakalanan polis kimseyi tutamaz.
  const cops=al.filter(id=>eff(id)==='polis'&&tgt(id,'ab'));
  const trappers=al.filter(id=>eff(id)==='tuzakci'&&tgt(id,'ab'));
  const heldCop=new Set(cops.filter(c=>cops.some(q=>q!==c&&tgt(q,'ab')===c)));
  let heldTrapper=new Set();
  const placeTraps=()=>{for(const k of Object.keys(traps))delete traps[k];for(const t of trappers)if(!heldTrapper.has(t))traps[tgt(t,'ab')]=t};
  const trappedAt=(c,t)=>!!traps[t]&&traps[t]!==c;
  for(let i=0;i<4;i++){placeTraps();
    const free=cops.filter(c=>!heldCop.has(c)&&!trappedAt(c,tgt(c,'ab')));
    const next=new Set(trappers.filter(t=>free.some(c=>tgt(c,'ab')===t)));
    if(next.size===heldTrapper.size&&[...next].every(t=>heldTrapper.has(t)))break;
    heldTrapper=next}
  placeTraps();
  for(const t of trappers){if(heldTrapper.has(t)){blocked.add(t);L.tutulan.add(t);nt(t,'Polis seni evde tuttu, tuzak kuramadın.')}else went[t]=tgt(t,'ab')}
  // polis seri katili tutamaz
  for(const c of cops){const t=tgt(c,'ab');
    if(heldCop.has(c)){blocked.add(c);L.tutulan.add(c);nt(c,'Polis seni evde tuttu, kimseyi tutamadın.');continue}
    visits[t].push(c);went[c]=t;
    if(trappedAt(c,t)){blocked.add(c);L.tuzak.push({kim:c,ev:t,kuran:traps[t]});nt(c,'Tuzağa yakalandın, kimseyi tutamadın.');nt(traps[t],nm(c)+' tuzağına yakalandı.')}
    else if(eff(t)==='serikatil'||eff(t)==='bombaci'){nt(c,nm(t)+' evde durmadı; onu tutamadın.')} // ikisi de tutulamaz (Polis–Bombacı kilidi olmasın)
    else{blocked.add(t);L.tutulan.add(t);L.tutanlar.push({kim:c,hedef:t});nt(c,nm(t)+' bu gece evden çıkamadı.');if(!heldCop.has(t)&&!heldTrapper.has(t))nt(t,'Polis seni evde tuttu, rolünü kullanamadın.')}}
  // 3) ziyaretler ve tuzak yakalamaları (büyücü evinden çıkmaz; polis ve tuzakçının yetenek hedefi yukarıda, öldürme hedefi burada)
  for(const id of al){const k=eff(id);const r=g.roles[id];const targets=new Set();
    if(r.team==='imp'&&tgt(id,'kill'))targets.add(tgt(id,'kill'));
    if(k&&ROLES[k].act==='other'&&!['buyucu','polis','tuzakci'].includes(k)&&tgt(id,'ab'))targets.add(tgt(id,'ab'));
    if(r.mad&&tgt(id,'ab'))targets.add(tgt(id,'ab'));
    if(blocked.has(id))continue;
    for(const t of targets){visits[t].push(id);went[id]=t;if(traps[t]&&traps[t]!==id){blocked.add(id);L.tuzak.push({kim:id,ev:t,kuran:traps[t]});nt(id,nm(t)+' evinde tuzağa yakalandın, rolünü kullanamadın.');nt(traps[t],nm(id)+' tuzağına yakalandı.')}}
  }
  const ok=id=>!blocked.has(id);
  // 4) koruma
  for(const id of al){const k=eff(id);if(k==='doktor'&&ok(id)&&tgt(id,'ab'))heals.add(tgt(id,'ab'));
    if(k==='hayatta'&&ok(id)&&A(id).ab==='self'&&g.roles[id].vest>0){g.roles[id].vest--;vested.add(id);nt(id,'Yelek giydin (kalan '+g.roles[id].vest+').')}}
  // 5) saldırılar: her hain kendi başına
  for(const id of al){const k=eff(id);const r=g.roles[id];if(!ok(id))continue;
    if(r.team==='imp'&&tgt(id,'kill'))attacks.push({v:tgt(id,'kill'),by:'Hain',ids:[id],cause:'stab'});
    if(k==='serikatil'&&tgt(id,'ab'))attacks.push({v:tgt(id,'ab'),by:'Seri Katil',ids:[id],cause:'stab'});
    if(k==='hirsiz'&&tgt(id,'ab'))attacks.push({v:tgt(id,'ab'),by:'Hırsız',ids:[id],thief:id,cause:'stab'});
    if(k==='bombaci'){if(tgt(id,'ab')){r.planted.push(tgt(id,'ab'));L.bombalar.push(tgt(id,'ab'));nt(id,nm(tgt(id,'ab'))+' evine dinamit koydun.')}
      if(A(id).det){const hs=[...new Set(r.planted)].filter(alive);hs.forEach(v=>{attacks.push({v,by:'Bombacı',ids:[id],cause:'bomb'});M.exploded.push(v)});r.planted=[];nt(id,hs.length?'Dinamitleri patlattın!':'Patlatacak dinamit yoktu.')}}
    if(k==='buyucu'&&tgt(id,'ab')&&A(id).guess&&has(ROLES,A(id).guess)){const t=tgt(id,'ab');const real=g.roles[t].key;
      if(A(id).guess===real){attacks.push({v:t,by:'Büyücü',ids:[id],cause:'bolt',sure:true});M.lightning.push(t);nt(id,'Tahminin doğruydu: '+nm(t)+' = '+ROLES[real].n+'. Yıldırım gönderdin.')}
      else{attacks.push({v:id,by:'Büyü',ids:[],cause:'bolt',sure:true});M.lightning.push(id);nt(id,'Tahminin yanlıştı ('+nm(t)+' '+ROLES[A(id).guess].n+' değil). Yıldırım sana döndü.')}}
  }
  // hortlak intikamı
  if(g.haunt&&g.haunt.night===P.day&&alive(g.haunt.t)){attacks.push({v:g.haunt.t,by:'Hortlak',ids:[],cause:'ghost',sure:true});M.haunted.push(g.haunt.t)}
  g.haunt=null;
  const died=[],causes={};
  for(const at of attacks){if(died.includes(at.v)){(L.sekiller[at.v]=L.sekiller[at.v]||[]).push(at.cause);if(at.cause==='bolt')L.boltIds[at.v]=at.ids} // aynı gece ikinci neden (ör. bıçak + yıldırım): kayda girer, kart çıkar
    if(!alive(at.v)||died.includes(at.v)){at.ids.forEach(i=>nt(i,nm(at.v)+' zaten ölmüştü.'));continue}
    if(!at.sure&&heals.has(at.v)){nt(at.v,'Saldırıya uğradın ama Doktor seni kurtardı!');for(const id of al)if(eff(id)==='doktor'&&tgt(id,'ab')===at.v){if(!L.kurtaranlar.some(k=>k.kim===id&&k.hedef===at.v))L.kurtaranlar.push({kim:id,hedef:at.v});nt(id,nm(at.v)+' saldırıya uğradı, onu kurtardın!')}at.ids.forEach(i=>nt(i,nm(at.v)+' saldırınızdan kurtuldu.'));if(!M.saved.includes(at.v))M.saved.push(at.v);continue}
    if(!at.sure&&iksirli.has(at.v)){const x=esyaLog.find(e=>e.kim===at.v&&e.key==='iksir');if(x)x.etki='korudu';nt(at.v,'Saldırıya uğradın, iksir seni kurtardı.');at.ids.forEach(i=>nt(i,nm(at.v)+' saldırınızdan kurtuldu.'));continue}
    if(!at.sure&&vested.has(at.v)){L.yelek.add(at.v);nt(at.v,'Saldırıya uğradın, yelek seni kurtardı.');at.ids.forEach(i=>nt(i,nm(at.v)+' saldırınızdan kurtuldu.'));continue}
    died.push(at.v);causes[at.v]=at.cause;L.sekiller[at.v]=[at.cause];L.killers[at.v]=at.ids;L.killerAd[at.v]=at.by;at.ids.forEach(i=>nt(i,nm(at.v)+' öldürüldü.'));
    if(at.thief){const vr=g.roles[at.v];const nr=vr.mad?{key:'masum',team:'inn'}:{key:vr.key,team:vr.team};g.roles[at.thief].orig='hirsiz';g.roles[at.thief].key=nr.key;g.roles[at.thief].team=nr.team;g.roles[at.thief].uses={};nt(at.thief,nm(at.v)+' rolünü çaldın: artık '+roleLabel(nr)+' olarak oynuyorsun.');causes[at.v]='vanish';L.sekiller[at.v]=['vanish'];L.caldi={hirsiz:at.thief,kurban:at.v,yeni_rol:roleLabel(nr)}}
  }
  // 6) bilgi rolleri
  // deli de dahil: tutulan ya da tuzağa yakalanan bilgi alamaz (yoksa deli olduğunu anlar)
  for(const id of al){const r=g.roles[id];const k=eff(id);const t=tgt(id,'ab');const bk=r.mad||k;if(!t||!bk||!ok(id))continue;
    if(bk==='polis'&&r.mad)nt(id,nm(t)+' bu gece evden çıkamadı.');
    if(bk==='gozcu'){const n=r.mad?Math.floor(Math.random()*3):visits[t].filter(v=>!dumanli.has(v)).length;nt(id,nm(t)+' evine bu gece '+n+' kişi geldi.')}
    if(bk==='izci'){let w;if(r.mad){const o=al.filter(x=>x!==t&&x!==id);w=Math.random()<.4?null:o[Math.floor(Math.random()*o.length)]}else w=dumanli.has(t)?null:(went[t]||null);nt(id,w?nm(t)+' gece '+nm(w)+' evine gitti.':nm(t)+' gece evinden çıkmadı.')}
    if(bk==='dedektif'){const sk=r.mad?INVGROUPS[Math.floor(Math.random()*INVGROUPS.length)]:INVGROUPS.find(gp=>gp.includes(maskeli.has(t)?'masum':shownRole(R,t).key))||INVGROUPS[4];nt(id,nm(t)+' şunlardan biri: '+sk.map(x=>ROLES[x].n).join(' / '))}
    if(bk==='ispiyoncu'&&!r.uses.ispiyoncu&&!died.includes(id)){r.uses.ispiyoncu=true;const sr=r.mad?{key:MADPOOL[Math.floor(Math.random()*MADPOOL.length)],team:'inn'}:maskeli.has(t)?{key:'masum',team:'inn'}:shownRole(R,t);M.snitch.push({by:id,t,role:roleLabel(sr)});nt(id,nm(t)+' rolünü sabah meydanda açıkladın.')}
    if(bk==='provokator'&&!r.uses.provokator){r.uses.provokator=true;if(r.mad)r.fakeProvoked={t,day:P.day};else{g.provoke={t,day:P.day};L.provokasyon=t}nt(id,nm(t)+' yarın oy alırsa 2 oy daha eklenecek.')}
    if(k==='temizlikci'&&died.includes(t))g.clean=t;
    if(k==='suclayici')g.blame={t,day:P.day};
    if(k==='hortlak'){g.candle[id]=t;L.mum.push({kim:id,ev:t});nt(id,nm(t)+' kapısına mum koydun.')}
  }
  // fener: kapına gelenler (dumanlılar görünmez)
  for(const id of fenerli){const gelen=(visits[id]||[]).filter(v=>!dumanli.has(v));nt(id,gelen.length?'Fenerinle gördün: evine '+gelen.map(nm).join(', ')+' geldi.':'Fenerinle gördün: evine kimse gelmedi.');
    if(gelen.some(v=>g.roles[v]&&g.roles[v].team==='imp')){const x=esyaLog.find(e=>e.kim===id&&e.key==='fener');if(x)x.etki='hain_gordu'}}
  // 7) ölümler
  const olenler=[];
  for(const v of died){pl(R,v).alive=false;let shown=roleLabel(shownRole(R,v));if(g.clean===v)shown='? (rolü gizlendi)';else if(g.blame&&g.blame.t===v)shown='Hain';P.dead.push({id:v,role:shown});olenler.push({kim:v,sekil:causes[v],sekiller:L.sekiller[v]||[causes[v]],kimden:L.killers[v]||[],kimden_ad:L.killerAd[v]||'',rol:shown,...(L.boltIds[v]?{yildirim_kimden:L.boltIds[v]}:{})});M.deaths.push({id:v,role:shown,cause:causes[v]});M.news.push(causes[v]==='vanish'?'🎭 '+nm(v)+' kayboldu. Rolü: '+shown:'💀 '+nm(v)+' gece öldü. Rolü: '+shown)}
  M.saved=M.saved.filter(v=>!died.includes(v));M.saved.forEach(v=>M.news.push('🛡️ '+nm(v)+' saldırıya uğradı, Doktor kurtardı.'));
  M.snitch.forEach(s=>M.news.push('📣 '+nm(s.by)+' (İspiyoncu) açıkladı: '+nm(s.t)+' = '+s.role));
  if(!died.length&&!M.saved.length&&!esyaLog.some(e=>e.etki==='korudu'))M.news.push('🌅 Sakin bir gece. Kimse ölmedi.');
  for(const e of esyaLog)M.news.push({iksir:'🧪 Bu gece biri iksir içti'+(e.etki==='korudu'?' ve saldırıdan sağ çıktı.':'.'),fener:'🏮 Bu gece biri fenerle bekledi.',duman:'💨 Bu gece kasabada duman vardı.',maske:'🎭 Bu gece biri maske taktı.'}[e.key]); // kullanım açık, kullanan gizli
  g.clean=null;
  sysChat(R,'— Gündüz '+P.day+' —');M.news.forEach(n=>sysChat(R,n));
  P.morning=M;
  logEv(R,'gece_sonuc',{ziyaretler:visits,tutulan:[...L.tutulan],tutanlar:L.tutanlar,tuzak:L.tuzak,kurtarilan:M.saved,kurtaranlar:L.kurtaranlar,yelek:[...L.yelek],olenler,caldi:L.caldi,bombalar:L.bombalar,
    yildirim:M.lightning,ispiyon:M.snitch.map(x=>({kim:x.by,hedef:x.t,rol:x.role})),provokasyon:L.provokasyon,mum:L.mum,haberler:M.news,esyalar:esyaLog});
  if(checkWin(R))return;setPhase(R,'talk');
}
function resolveVote(R){
  const P=R.P,g=R.g,tally={};const al=alivePlayers(R);const nm=id=>nameOf(R,id);
  let skip=0;for(const p of al){const t=g.votes[p.id];if(t==='skip'||!t)skip++;else tally[t]=(tally[t]||0)+1}
  // kışkırtma gerçek bir oyu büyütür, tek başına astırmaz: herkes çekimserse +2 sayılmaz (kullanıcı kararı 2026-10-25; e2e kararsızlığının kökü)
  if(g.provoke&&g.provoke.day===P.day&&pl(R,g.provoke.t)&&pl(R,g.provoke.t).alive&&tally[g.provoke.t]>=1)tally[g.provoke.t]+=2;
  // oy fişi: birine oy veren sahibinin oyu 2 sayılır; sıralamada/eşitlikte sayılır, asma eşiğine (≥2) sayılmaz; çekimserde harcanmaz
  const fisli=Object.keys(g.fis||{}).filter(id=>g.fis[id]&&g.esya&&g.esya[id]&&g.esya[id].key==='fis'&&!g.esya[id].kullanildi&&pl(R,id)&&pl(R,id).alive&&g.votes[id]&&g.votes[id]!=='skip');
  const tam={...tally};for(const id of fisli){tam[g.votes[id]]=(tam[g.votes[id]]||0)+1;g.esya[id].kullanildi=true}
  const sorted=Object.keys(tam).sort((a,b)=>tam[b]-tam[a]);
  let out=null;if(sorted.length&&(sorted.length===1||tam[sorted[0]]>tam[sorted[1]])&&(tally[sorted[0]]||0)>=2)out=sorted[0];
  const E={out:null,summary:''};
  if(out){pl(R,out).alive=false;let shown=roleLabel(shownRole(R,out));if(g.blame&&g.blame.day===P.day&&g.blame.t===out)shown='Hain';P.dead.push({id:out,role:shown});E.out={id:out,role:shown};sysChat(R,'⚖️ Kasaba '+nm(out)+' kişisini gönderdi. Rolü: '+shown);
    if(g.roles[out].key==='hortlak'){g.hauntWins.push(out);const t=g.candle[out];if(t&&pl(R,t)&&pl(R,t).alive){g.haunt={t,night:P.day+1};note(R,out,'Asıldın! Bu gece '+nm(t)+' evine hayalet olarak gideceksin.')}else note(R,out,'Asıldın, kazandın! Mum koyduğun bir ev yoktu.')}}
  else sysChat(R,'⚖️ Oylar yetersiz, kimse gönderilmedi.');
  E.summary=Object.keys(tam).sort((a,b)=>tam[b]-tam[a]).map(id=>nm(id)+' '+tam[id]).concat(skip?['çekimser '+skip]:[]).join(', ')+(fisli.length?' · 🗳️ Biri oy fişi kullandı':'');
  if(E.summary)sysChat(R,'🗳️ Oylar: '+E.summary);
  const prov=g.provoke&&g.provoke.day===P.day?g.provoke.t:null;
  g.provoke=null;g.blame=null;P.evening=E;
  logEv(R,'gunduz_sonuc',{asilan:out,rol_goruntu:E.out?E.out.role:null,toplamlar:tam,cekimser:skip,provoke:prov,fis:fisli[0]||null}); // tek tek oylar yazılmaz
  if(checkWin(R))return;setPhase(R,'night');
}
// Kazanan oyuncular (tek kaynak; skor ve gazete yeniden hesaplamaz): takım zaferinde o takımın tüm katılımcıları
// (ölü/kopuk dahil; takım oyun sonundaki roldür, Deli masumdur), tarafsız zaferinde kişi; sağ Hayatta Kalan ve
// asılmış Hortlaklar her zaman eklenir. "Kimse kazanamadı" → boş.
function kazananlar(R,w){
  const g=R.g,ids=R.P.players.map(p=>p.id);const team=id=>g.roles[id].mad?'inn':g.roles[id].team;
  const k=new Set();
  if(w.team==='inn'||w.team==='imp')for(const id of ids)if(team(id)===w.team)k.add(id);
  else if(w.team==='neu'&&w.who)k.add(w.who);
  for(const p of alivePlayers(R))if(g.roles[p.id].key==='hayatta')k.add(p.id);
  for(const id of g.hauntWins)k.add(id);
  return ids.filter(id=>k.has(id));
}
function checkWin(R){
  const P=R.P,g=R.g;const al=alivePlayers(R).map(p=>p.id);
  const team=id=>g.roles[id].team,key=id=>g.roles[id].key;
  const imp=al.filter(id=>team(id)==='imp');const hostile=al.filter(id=>['serikatil','bombaci','hirsiz','buyucu'].includes(key(id)));
  const passive=al.filter(id=>['hayatta','hortlak'].includes(key(id)));const others=al.filter(id=>!imp.includes(id)&&!passive.includes(id)&&!hostile.includes(id));
  let w=null;
  if(!al.length)w={t:'Kimse kazanamadı',team:null};
  else if(!imp.length&&!hostile.length)w={t:'Masumlar kazandı!',team:'inn'};
  else if(!hostile.length&&imp.length&&imp.length>=others.length)w={t:'Hainler kazandı!',team:'imp'};
  else if(hostile.length===1&&!imp.length&&!others.length)w={t:ROLES[key(hostile[0])].n+' tek başına kazandı!',team:'neu',who:hostile[0]};
  if(!w)return false;
  P.phase='end';P.ends=null;
  P.winner={...w,survivors:al.filter(id=>key(id)==='hayatta').map(id=>nameOf(R,id)),haunters:g.hauntWins.map(id=>nameOf(R,id))};
  P.winner.kazananlar=kazananlar(R,w);
  P.gazete=gazeteFor(R);
  P.reveal=P.players.map(p=>({id:p.id,name:p.name,role:roleLabel(shownRole(R,p.id))+(g.roles[p.id].mad?' (aslında Deli)':g.roles[p.id].orig?' (Hırsız çaldı)':''),team:g.roles[p.id].mad?'inn':g.roles[p.id].team,alive:p.alive}));
  P.ozet=ozetFor(R);
  logEv(R,'bitis',{kazanan:w.team,kazanan_metin:w.t,kazananlar:P.winner.kazananlar,oyuncular:kapanisFor(R),sag_kalanlar:P.winner.survivors,hortlak_kazananlar:P.winner.haunters,acilis:P.reveal});
  return true;
}
// Maç özeti (herkese açık, yalnız oyun bitince): kazanan ve her oyuncunun rolü/akıbeti, oyun günlüğünden.
function ozetFor(R){const P=R.P;const olum={};
  for(const e of R.gameLog){
    if(e.tur==='gece_sonuc')for(const o of e.veri.olenler)olum[o.kim]={gun:e.gun,faz:'gece',sekil:o.sekil,kimden:o.kimden};
    else if(e.tur==='gunduz_sonuc'&&e.veri.asilan)olum[e.veri.asilan]={gun:e.gun,faz:'gunduz',sekil:'asildi',kimden:[]};
  }
  return{kazanan:{takim:P.winner.team,metin:P.winner.t},oyuncular:P.reveal.map(r=>({id:r.id,ad:r.name,rol:r.role,takim:r.team,sag:r.alive,olum:olum[r.id]||null}))};
}
// "Senin payın" (kişiye özel, yalnız oyun bitince): öldürdüklerin, kurtardıkların, yakaladıkların, tuttukların.
function payinFor(R,id){const nm=x=>nameOf(R,x);const o={oldurdu:[],kurtardi:[],yakaladi:[],tuttu:[]};
  for(const e of R.gameLog){if(e.tur!=='gece_sonuc')continue;const v=e.veri;
    for(const d of v.olenler)if(d.kimden.includes(id))o.oldurdu.push(nm(d.kim));
    for(const k of v.kurtaranlar||[])if(k.kim===id)o.kurtardi.push(nm(k.hedef));
    for(const t of v.tuzak)if(t.kuran===id)o.yakaladi.push(nm(t.kim));
    for(const t of v.tutanlar||[])if(t.kim===id)o.tuttu.push(nm(t.hedef));
  }return o;
}
// ---------- Kasaba Gazetesi (yalnız bitmiş oyun; tasarım paket1 §5.2) ----------
// En çok GAZETE_EN_COK kart, yalnız günlükteki gerçekleşmiş olaylardan, deterministik: adaylar (tür önceliği, gün,
// kayıt sırası) ile sıralanır; aynı özne iki kartta olmaz; bitiş kartı yalnız yer kalırsa.
const GAZETE_EN_COK=3;
// Ad + kesme + ek: ünlü uyumu (a,ı→ı · e,i→i · o,u→u · ö,ü→ü) ve kaynaştırma (ünlüyle bitene -yi / -nin).
// tip 'i' = belirtme (-ı/-i/-u/-ü), 'in' = tamlayan (-ın/-in/-un/-ün). Sondaki emoji/noktalama atlanır; sonu sayıysa
// sayının okunuşuna göre (7 yedi, 10 on, 20 yirmi, 100 yüz, 1000 bin).
const RAKAM_SON={0:['ı',false],1:['i',false],2:['i',true],3:['ü',false],4:['ü',false],5:['i',false],6:['ı',true],7:['i',true],8:['i',false],9:['u',false]};
const ONLAR_SON={1:['u',false],2:['i',true],3:['u',false],4:['ı',false],5:['i',true],6:['ı',false],7:['i',false],8:['i',false],9:['ı',false]};
const UNLU=/[aeıioöuüâîû]/;
function ek(ad,tip){
  const a=String(ad);const harfler=Array.from(a.toLocaleLowerCase('tr')).filter(c=>/[\p{L}\p{N}]/u.test(c));
  let unlu='i',unluyleBiter=false;const son=harfler[harfler.length-1]||'';
  if(/[0-9]/.test(son)){let n=0;while(n<harfler.length&&/[0-9]/.test(harfler[harfler.length-1-n]))n++;const sayi=harfler.slice(harfler.length-n).join('');
    if(+son)[unlu,unluyleBiter]=RAKAM_SON[+son];else if(/[1-9]0$/.test(sayi))[unlu,unluyleBiter]=ONLAR_SON[+sayi.slice(-2,-1)];else if(/00$/.test(sayi)&&!/000$/.test(sayi))[unlu,unluyleBiter]=['ü',false];else if(/000$/.test(sayi))[unlu,unluyleBiter]=['i',false];else [unlu,unluyleBiter]=RAKAM_SON[0]}
  else{const u=[...harfler].reverse().find(c=>UNLU.test(c))||'i';
    unlu=/[aıâ]/.test(u)?'ı':/[eiî]/.test(u)?'i':/[ouû]/.test(u)?'u':'ü';unluyleBiter=UNLU.test(son)}
  const kaynastirma=unluyleBiter?(tip==='in'?'n':'y'):'';
  return a+"'"+kaynastirma+unlu+(tip==='in'?'n':'');
}
function gazeteFor(R){
  const P=R.P,g=R.g,nm=id=>nameOf(R,id);const ad=[];let sira=0;
  const ekle=(tur,oncelik,gun,ozne,metin)=>ad.push({tur,oncelik,gun,sira:sira++,ozne,metin});
  for(const p of P.players)if(g.roles[p.id].mad)ekle('deli',0,0,[p.id],'🌀 '+nm(p.id)+" aslında Deli'ydi; kendisine "+ROLES[g.roles[p.id].mad].n+' rolü gösteriliyordu.');
  let sonGece=null,sonGun=null,esyaKarti=null;
  for(const e of R.gameLog){
    if(e.tur==='gece_sonuc'){const v=e.veri,G_='Gece '+e.gun+': ';sonGece=e;
      for(const k of v.kurtaranlar||[])ekle('mudahale',1,e.gun,[k.kim],'💉 '+G_+nm(k.kim)+' bir saldırıyı önledi; '+nm(k.hedef)+' sağ çıktı.');
      for(const id of v.yelek||[])ekle('mudahale',1,e.gun,[id],'🦺 '+G_+nm(id)+' yelek sayesinde saldırıdan sağ çıktı.');
      const tuzaklar={};for(const t of v.tuzak||[]){const key=t.kuran+'>'+t.ev;(tuzaklar[key]=tuzaklar[key]||{kuran:t.kuran,ev:t.ev,kim:[]}).kim.push(t.kim)}
      for(const t of Object.values(tuzaklar))ekle('mudahale',1,e.gun,[t.kuran],'🪤 '+G_+ek(nm(t.kuran),'in')+' tuzağı '+t.kim.map(k=>ek(nm(k),'i')).join(', ')+' '+ek(nm(t.ev),'in')+' kapısında yakaladı.');
      for(const t of v.tutanlar||[])ekle('mudahale',1,e.gun,[t.kim],'👮 '+G_+'Polis '+nm(t.kim)+', '+ek(nm(t.hedef),'i')+' evde tuttu.');
      for(const o of v.olenler||[]){
        if(o.sekil==='ghost'){const h=Object.keys(g.candle).find(x=>g.candle[x]===o.kim&&g.hauntWins.includes(x));if(h)ekle('mudahale',1,e.gun,[h],'🕯️ '+G_+nm(h)+' hayalet olarak döndü; '+nm(o.kim)+' mumun bedelini ödedi.')}
      }
      for(const x of v.esyalar||[]){if(esyaKarti&&!(x.etki&&!esyaKarti.etki))continue;const N=nm(x.kim);
        const t={iksir:x.etki==='korudu'?'🧪 '+G_+ek(N,'in')+' iksiri onu saldırıdan kurtardı.':'🧪 '+G_+N+' iksir içti.',fener:'🏮 '+G_+N+' fenerle bekledi'+(x.etki==='hain_gordu'?'; kapısına gelen haini gördü.':'.'),duman:'💨 '+G_+N+' dumanla görünmeden dolaştı.',maske:'🎭 '+G_+N+' maske taktı.'}[x.key];
        if(t)esyaKarti={etki:x.etki,gun:e.gun,kim:x.kim,metin:t}}
      if(v.caldi)ekle('mudahale',1,e.gun,[v.caldi.hirsiz],'🎭 '+G_+nm(v.caldi.hirsiz)+' '+ek(nm(v.caldi.kurban),'in')+' rolünü çaldı; artık '+v.caldi.yeni_rol+'.');
      for(const o of v.olenler||[]){
        if(!(o.sekil==='bolt'||(o.sekiller||[]).includes('bolt')))continue;
        const boltKimden=o.sekil==='bolt'?o.kimden:(o.yildirim_kimden||[]); // bıçak + yıldırım: yıldırımı atan büyücü
        if(boltKimden&&boltKimden.length)ekle('mudahale',1,e.gun,boltKimden.slice(),'⚡ '+G_+'Büyücü '+ek(nm(o.kim),'in')+' rolünü doğru tahmin etti; yıldırım düştü.');
        else ekle('mudahale',1,e.gun,[o.kim],'⚡ '+G_+'Büyücü yanlış tahmin etti; yıldırım kendine düştü.');
      }
      const patlayan=(v.olenler||[]).filter(o=>o.sekil==='bomb');
      if(patlayan.length)ekle('mudahale',1,e.gun,[...new Set(patlayan.flatMap(o=>o.kimden||[]))],'🧨 '+G_+'dinamitler patladı; '+patlayan.map(o=>nm(o.kim)).join(', ')+' evleriyle uçtu.');
    }else if(e.tur==='gunduz_sonuc')sonGun=e;
  }
  // iddia ve gerçeklik (Paket 1b §5.2): oyuncu başına rol iddiaları, iddia anındaki gerçek rolle karşılaştırılır; Deli'nin sandığı
  // rolü söylemesi blöf sayılmaz (Deli kartı anlatır); niyet atfı yok. Öncelik 2 (deli → müdahale → iddia).
  const iddialar=new Map();
  for(const e of R.gameLog)if(e.tur==='iddia'){const v=e.veri;if(v.algilanan_rol&&v.rol_iddia===v.algilanan_rol)continue;(iddialar.get(v.kim)||iddialar.set(v.kim,[]).get(v.kim)).push({gun:e.gun,rol:v.rol_iddia,gercek:roleLabel({key:v.gercek_rol,team:v.gercek_takim})})}
  for(const [kim,liste] of iddialar){
    const son=liste[liste.length-1];const farkli=[...new Set(liste.map(x=>x.rol).reverse())].reverse(); // son iddia listenin sonunda
    const gercek=son.gercek===ROLES[son.rol].n?null:son.gercek;
    const metin=farkli.length>1
      ?'🗣️ '+nm(kim)+' önce '+farkli.slice(0,-1).map(r=>ROLES[r].n).join(', ')+', sonra '+ROLES[farkli[farkli.length-1]].n+' olduğunu söyledi; '+(gercek?'o sırada rolü '+gercek+' idi.':'doğruydu.')
      :'🗣️ Gün '+son.gun+': '+nm(kim)+' '+ROLES[son.rol].n+' olduğunu söyledi; '+(gercek?'o sırada rolü '+gercek+' idi.':'doğruydu.');
    ekle('iddia',gercek?2:2.5,son.gun,[kim],metin); // yanlış çıkan iddialar doğrulardan önce
  }
  // bitiş kartı: oyunu bitiren son olay (gündüz asılma ya da gece ölümleri)
  let bitis=null;const son=[sonGece,sonGun].filter(Boolean).sort((a,b)=>b.sira-a.sira)[0];
  if(son&&son.tur==='gunduz_sonuc'&&son.veri.asilan)bitis={tur:'bitis',ozne:[],metin:'⚖️ Gün '+son.gun+': kasaba '+ek(nm(son.veri.asilan),'i')+' gönderdi ve oyun bitti.'};
  else if(son&&son.tur==='gece_sonuc'&&son.veri.olenler.length)bitis={tur:'bitis',ozne:[],metin:'🌙 Gece '+son.gun+': '+son.veri.olenler.map(o=>nm(o.kim)).join(', ')+' öldü ve oyun bitti.'};
  if(esyaKarti)ekle('esya',1,esyaKarti.gun,[esyaKarti.kim],esyaKarti.metin); // en çok bir eşya kartı (önce etkili olan)
  ad.sort((a,b)=>a.oncelik-b.oncelik||a.gun-b.gun||a.sira-b.sira);
  const secilen=[],ozneler=new Set(),atlanan=[];
  for(const a of ad){if(secilen.length>=GAZETE_EN_COK)break;if(a.ozne.some(o=>ozneler.has(o))){atlanan.push(a);continue}secilen.push(a);a.ozne.forEach(o=>ozneler.add(o))}
  if(secilen.length<GAZETE_EN_COK&&bitis)secilen.push(bitis);
  for(const a of atlanan){if(secilen.length>=GAZETE_EN_COK)break;secilen.push(a)} // yer kaldıysa aynı özne de olur
  return secilen.map(k=>({tur:k.tur,ozne:k.ozne,metin:k.metin}));
}
function endToLobby(R){if(R.g&&['night','talk','vote'].includes(R.P.phase))logEv(R,'iptal',{gun:R.P.day,faz:R.P.phase});R.g=null;R.P=lobbyState()}

// ---------- Oyuncu eylemleri (sunucu doğrular) ----------
const sid=v=>typeof v==='string'&&v.length<=24?v:null;
// gece hamlesi: {kill, ab, guess, det, d?}
function act(R,id,m){
  const P=R.P;if(!R.g||P.phase!=='night')return false;const me=pl(R,id);if(!me||!me.alive)return false;
  if(m.d!=null&&m.d!==P.day)return false;if(m.g!=null&&m.g!==P.gameId)return false; // başka maçın gecikmiş hamlesi
  const target=v=>{v=sid(v);return v&&pl(R,v)?v:null};
  R.g.acts[id]={kill:target(m.kill),ab:m.ab==='self'?'self':target(m.ab),guess:typeof m.guess==='string'&&has(ROLES,m.guess)?m.guess:null,det:!!m.det,esya:m.esya===true};
  return true;
}
// oy: 'skip' ya da yaşayan bir oyuncu. Herkes oy verince faz kendiliğinden geçer.
function vote(R,id,v,d,gid,esya){
  const P=R.P;if(!R.g||P.phase!=='vote')return false;const me=pl(R,id);if(!me||!me.alive)return false;
  if(d!=null&&d!==P.day)return false;if(gid!=null&&gid!==P.gameId)return false;
  v=sid(v);if(v!=='skip'){const t=v&&pl(R,v);if(!t||!t.alive)return false}
  R.g.votes[id]=v;R.g.fis=R.g.fis||{};R.g.fis[id]=esya===true;P.voted=Object.keys(R.g.votes);
  if(alivePlayers(R).every(p=>R.g.votes[p.id]!==undefined))advance(R);
  return true;
}
function chat(R,id,x){
  const P=R.P;if(!R.g)return false;const me=pl(R,id);if(!me||!me.alive||(P.phase!=='talk'&&P.phase!=='vote'))return false;
  const t=String(x==null?'':x).slice(0,240);if(!t.trim())return false;
  pushChat(R,{id,t,d:P.day,ts:clock()});return true;
}
// Hızlı ifadeler (Paket 1b, tasarım §5.1): tartışmada tek dokunuşla; metni sunucu kurar, sohbete oyuncunun sözü olarak girer
// (rozet yok). Rol iddiası gerçek rolle birlikte günlüğe yazılır (gazete "iddia ve gerçeklik"); diğerleri ölçüm (hedef yazılmaz).
const HIZLI_BEKLE_MS=8000,HIZLI_GUN=4,HIZLI_ANAHTAR=20;
const HIZLI_TUR={rol:'🗣️ Rolüm: {rol}',suphe:'🤨 {ad} hakkında şüphem var.',belirsiz:'🤷 Bu bilgi kesin değil.',koru:'🛡️ Beni koruyun!',aciklama:'📣 Bir açıklama yapacağım.'};
function hizli(R,id,m){
  const P=R.P,g=R.g;const yok={ok:false,kod:'gecersiz'};
  if(!g||P.phase!=='talk'||!m||typeof m!=='object')return yok;const me=pl(R,id);if(!me||!me.alive)return yok;
  if(m.d!==P.day||!has(HIZLI_TUR,m.k))return yok;
  let rol=null,hedef=null;
  if(m.k==='rol'){if(typeof m.rol!=='string'||!has(ROLES,m.rol))return yok;rol=m.rol}
  if(m.k==='suphe'){hedef=sid(m.hedef);const h=hedef&&pl(R,hedef);if(!h||!h.alive||hedef===id)return yok}
  const n=typeof m.n==='string'?m.n.slice(0,40):'';
  g.hizli=g.hizli||{};const h=g.hizli[id]=g.hizli[id]||{gun:P.day,n:0,son:0,anahtarlar:[]};
  if(h.gun!==P.day){h.gun=P.day;h.n=0}
  if(n&&h.anahtarlar.includes(n))return {ok:false,kod:'tekrar'};
  const simdi=clock();const kalanMs=HIZLI_BEKLE_MS-(simdi-h.son);
  if(h.son&&kalanMs>0)return {ok:false,kod:'bekle',kalan:Math.ceil(kalanMs/1000)};
  if(h.n>=HIZLI_GUN)return {ok:false,kod:'gun'};
  h.n++;h.son=simdi;if(n){h.anahtarlar.push(n);if(h.anahtarlar.length>HIZLI_ANAHTAR)h.anahtarlar.shift()}
  const adT=hedef?nameOf(R,hedef):'',rolT=rol?ROLES[rol].n:'';const t=HIZLI_TUR[m.k].replace('{rol}',()=>rolT).replace('{ad}',()=>adT); // fonksiyon: ad içindeki $ kalıpları yorumlanmasın
  pushChat(R,{id,t,d:P.day,ts:simdi,kisa:m.k}); // kisa: hızlı ifade türü (yalnız hafif stil)
  if(m.k==='rol'){const r=g.roles[id];logEv(R,'iddia',{kim:id,rol_iddia:rol,gercek_rol:r.key,gercek_takim:r.team,algilanan_rol:r.mad||null})}
  else olay(R,'hizli',{kim:id,k:m.k});
  return {ok:true};
}
function deadChat(R,id,x){
  if(!R.g)return false;const me=pl(R,id);if(!me||me.alive)return false;
  const t=String(x==null?'':x).slice(0,240);if(!t.trim())return false;
  R.g.dchat.push({id,t});if(R.g.dchat.length>80)R.g.dchat.shift();return true;
}

// Kişiye özel paket (yalnız o oyuncuya gider). Oyunda değilse boş paket.
const EMPTY_PRIV={role:null,notes:[],mates:[],dchat:[],payin:null,esya:null};
function privFor(R,id){
  const g=R.g;if(!g||!g.roles[id])return EMPTY_PRIV;const P=R.P;const r=g.roles[id];const sr=r.mad?{key:r.mad,team:'inn'}:{key:r.key,team:r.team};
  const me=pl(R,id);
  return{role:{key:sr.key,team:sr.team,label:roleLabel(sr),desc:ROLES[sr.key].desc,ico:ROLES[sr.key].ico},
    mates:r.team==='imp'?Object.keys(g.roles).filter(x=>g.roles[x].team==='imp'&&x!==id):[],
    notes:g.notes[id]||[],dchat:me&&!me.alive?g.dchat:[],
    fakeProvoked:r.fakeProvoked&&r.fakeProvoked.day===P.day&&P.phase==='vote'?r.fakeProvoked.t:null,
    uses:r.uses,vest:r.vest,planted:r.planted.slice(),candle:g.candle[id]||null,payin:P.phase==='end'?payinFor(R,id):null,
    esya:g.esya&&g.esya[id]?{key:g.esya[id].key,kullanildi:g.esya[id].kullanildi}:null};
}
// maç sonu: eşya kullanımı (sunucu envanterden harcar: yalnız kaynak 'envanter' ve kullanildi)
function esyaKullanimi(R){const out={};for(const [id,e] of Object.entries(R.g&&R.g.esya||{}))out[id]={key:e.key,kaynak:e.kaynak,kullanildi:e.kullanildi};return out
}

return{ROLES,SETUP,COLORS,HATS,DEFAULT_SETTINGS,ESYA,NADIRLIK,KOZMETIK,KASA,ROZETLER,kasaOdulu,kozmetikGecerli,rozetlerFor,DAGILIM,TEKRAR,tekrarCezasi,rolDagit,roleLabel,rolEtiketi,autoSetup,cleanSettings,setClock,
  lobbyState,createGame,startGame,setPhase,advance,tick,resolveNight,resolveVote,checkWin,kazananlar,gazeteFor,GAZETE_EN_COK,ek,endToLobby,olay,
  act,vote,chat,deadChat,esyaKullanimi,hizli,HIZLI_BEKLE_MS,HIZLI_GUN,HIZLI_TUR,privFor,pl,alivePlayers,inGame};
});
