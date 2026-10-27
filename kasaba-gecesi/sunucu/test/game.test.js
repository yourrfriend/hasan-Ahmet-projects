'use strict';
// node --test  →  oyun mantığı testleri
const test=require('node:test');
const assert=require('node:assert');
const G=require('../game.js');

const SECRET_KEYS=['roles','acts','votes','notes','dchat','candle','planted','mad','uses','vest','haunt','provoke','blame','log','gameLog','hizli','rolGecmisi','esya','fis'];
function keysDeep(o,out=new Set()){if(o&&typeof o==='object'){for(const k of Object.keys(o)){out.add(k);keysDeep(o[k],out)}}return out}
function noLeak(P){const ks=keysDeep(P);for(const k of SECRET_KEYS)assert.ok(!ks.has(k),'state içinde gizli alan: '+k)}

function lobbyOf(n){return Array.from({length:n},(_,i)=>({id:'u'+i,name:'Oyuncu'+i,color:G.COLORS[i],hat:'none'}))}
const pick=a=>a[Math.floor(Math.random()*a.length)];

// Rastgele ama kurallara uygun (ve arada geçersiz) hamlelerle bir oyunu sonuna kadar oynatır.
function playRandom(n){
  const R=G.createGame({night:15,talk:15,vote:15});
  assert.ok(G.startGame(R,lobbyOf(n)));
  noLeak(R.P);
  let steps=0;
  while(R.P.phase!=='end'){
    assert.ok(++steps<400,'oyun bitmedi');
    const alive=G.alivePlayers(R).map(p=>p.id);
    for(const p of R.P.players){
      const priv=G.privFor(R,p.id);
      assert.ok(priv.role,'rolsüz oyuncu');
      if(p.alive)assert.deepStrictEqual(priv.dchat,[]);
      if(priv.role.team!=='imp'&&R.g.roles[p.id].team!=='imp')assert.deepStrictEqual(priv.mates,[]);
    }
    if(R.P.phase==='night'){
      for(const id of alive){
        const m={kill:Math.random()<.5?pick(alive):null,ab:Math.random()<.1?'self':pick(alive),det:Math.random()<.2,
          guess:Math.random()<.5?pick(Object.keys(G.ROLES)):pick(['constructor','__proto__','yok'])};
        G.act(R,id,m);
      }
      G.act(R,'yabanci',{kill:alive[0]});G.vote(R,alive[0],'skip');G.chat(R,alive[0],'gece konuşmaz');
      G.advance(R);
    }else if(R.P.phase==='talk'){
      G.chat(R,pick(alive),'merhaba');G.deadChat(R,pick(alive),'yaşayan ölü sohbetine yazamaz');
      for(const d of R.P.dead)G.deadChat(R,d.id,'ölüler');
      G.advance(R);
    }else if(R.P.phase==='vote'){
      G.vote(R,alive[0],'olmayan-kisi');
      const day=R.P.day;
      // çoğu zaman birine yığılsın ki oyun ilerlesin
      const target=pick(alive);
      for(const id of alive){if(R.P.phase!=='vote'||R.P.day!==day)break;G.vote(R,id,Math.random()<.8?target:pick([...alive,'skip']))}
      if(R.P.phase==='vote')G.advance(R);
    }
    noLeak(R.P);
    JSON.stringify(R.P);
  }
  assert.ok(R.P.winner&&R.P.reveal.length===n);
  return R;
}

for(const n of [4,7,12]){
  test(n+' kişilik rastgele oyunlar hatasız biter ve sızıntı olmaz',()=>{for(let i=0;i<300;i++)playRandom(n)});
}

test('rol dağılımı oyuncu sayısına uyar',()=>{
  for(let n=4;n<=12;n++){const c=G.autoSetup(n);assert.strictEqual(Object.values(c).reduce((a,b)=>a+b,0),n)}
});

test('4 kişiden az ya da 12 kişiden çok oyun başlamaz',()=>{
  assert.strictEqual(G.startGame(G.createGame(),lobbyOf(3)),false);
  const R=G.createGame();assert.strictEqual(G.startGame(R,lobbyOf(15)),false);assert.strictEqual(R.P.phase,'lobby');
  assert.ok(G.startGame(G.createGame(),lobbyOf(12)));
});

function fixed(roles){
  const R=G.createGame();G.startGame(R,lobbyOf(roles.length));
  roles.forEach((k,i)=>{const e=G.SETUP.find(s=>s.id===k);R.g.roles['u'+i]={key:e.key,team:e.team,mad:null,uses:{},vest:3,planted:[]}});
  return R;
}

test('doktor saldırıyı engeller, oylama birini gönderir',()=>{
  const R=fixed(['hain','doktor','masum','masum','masum']);
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.advance(R);
  assert.strictEqual(R.P.phase,'talk');assert.ok(G.pl(R,'u2').alive);assert.deepStrictEqual(R.P.morning.saved,['u2']);
  G.advance(R);assert.strictEqual(R.P.phase,'vote');
  for(const id of ['u1','u2','u3','u4'])G.vote(R,id,'u0');
  G.vote(R,'u0','skip');
  assert.strictEqual(R.P.phase,'end');assert.strictEqual(R.P.winner.team,'inn');
});

test('kışkırtma tek başına astırmaz: herkes çekimserse kimse gönderilmez; bir gerçek oy varsa +2 sayılır',()=>{
  // u1 provokatör gece u0'ı (hain) kışkırtır; sabah 5 kişi sağ
  let R=fixed(['hain','provokator','doktor','masum','masum']);
  G.act(R,'u0',{kill:'u4'});G.act(R,'u1',{ab:'u0'});G.act(R,'u2',{ab:'u4'});G.advance(R);
  assert.strictEqual(R.P.phase,'talk');G.advance(R);assert.strictEqual(R.P.phase,'vote');assert.strictEqual(R.P.provoked,'u0','kışkırtılan rozeti');
  for(const id of ['u0','u1','u2','u3','u4'])G.vote(R,id,'skip');
  assert.strictEqual(R.P.phase,'night','oyun sürer');assert.ok(G.pl(R,'u0').alive,'yalnız kışkırtma oyuyla asılmaz');
  assert.strictEqual(R.P.evening.out,null);assert.match(R.P.evening.summary,/çekimser 5/);assert.doesNotMatch(R.P.evening.summary,/Oyuncu0 2/,'sayılmayan +2 özete girmez');
  const gs=R.gameLog.find(e=>e.tur==='gunduz_sonuc');assert.strictEqual(gs.veri.asilan,null);assert.deepStrictEqual(gs.veri.toplamlar,{});assert.strictEqual(gs.veri.provoke,'u0','günlükte kışkırtma yine yazılır');
  // aynı kurgu, bir gerçek oy: u3 → u0; +2 ile 3 olur, asılır (tek hain → masumlar kazanır)
  R=fixed(['hain','provokator','doktor','masum','masum']);
  G.act(R,'u0',{kill:'u4'});G.act(R,'u1',{ab:'u0'});G.act(R,'u2',{ab:'u4'});G.advance(R);G.advance(R);
  G.vote(R,'u3','u0');for(const id of ['u0','u1','u2','u4'])G.vote(R,id,'skip');
  assert.strictEqual(R.P.phase,'end');assert.strictEqual(R.P.winner.team,'inn');
  const gs2=R.gameLog.find(e=>e.tur==='gunduz_sonuc');assert.deepStrictEqual(gs2.veri.toplamlar,{u0:3},'1 gerçek oy + 2 kışkırtma');
  // kışkırtılan başkası (u3), gerçek oy u0'a tek: u0 1 oyla asılmaz, u3'e kışkırtma sayılmaz → kimse gitmez
  R=fixed(['hain','provokator','doktor','masum','masum']);
  G.act(R,'u0',{kill:'u4'});G.act(R,'u1',{ab:'u3'});G.act(R,'u2',{ab:'u4'});G.advance(R);G.advance(R);
  G.vote(R,'u2','u0');for(const id of ['u0','u1','u3','u4'])G.vote(R,id,'skip');
  assert.strictEqual(R.P.phase,'night');assert.ok(G.pl(R,'u3').alive);assert.deepStrictEqual(R.gameLog.find(e=>e.tur==='gunduz_sonuc').veri.toplamlar,{u0:1});
});

test('rolEtiketi: tek kaynak — sürümlü hain, Deli, Hırsız çaldı, bilinmeyen',()=>{
  assert.strictEqual(G.rolEtiketi({rol_key:'polis',takim:'inn'}),'Polis');
  assert.strictEqual(G.rolEtiketi({rol_key:'polis',takim:'imp'}),'Polis (Hain)');
  assert.strictEqual(G.rolEtiketi({rol_key:'hain',takim:'imp'}),'Hain');
  assert.strictEqual(G.rolEtiketi({rol_key:'doktor',takim:'inn',deli_gibi:true}),'Doktor (aslında Deli)');
  assert.strictEqual(G.rolEtiketi({rol_key:'polis',takim:'inn',calinan_rol:'polis'}),'Polis (Hırsız çaldı)');
  assert.strictEqual(G.rolEtiketi({rol_key:'yok',takim:'inn'}),'yok');
  assert.strictEqual(G.rolEtiketi(null),'?');assert.strictEqual(G.rolEtiketi({rol_key:null}),'?');
});

test('oyun olayları: tahminsiz büyücü hamlesi yazılmaz; sira maç başına sıfırlanır; rolDagit deneme 0 dizi döner',()=>{
  let R=fixed(['hain','buyucu','doktor','masum','masum']);
  G.act(R,'u1',{ab:'u3'});G.act(R,'u0',{kill:'u4'});G.advance(R);
  assert.strictEqual(R.gameLog.filter(e=>e.tur==='gece_hamle'&&e.veri.kim==='u1').length,0,'tahminsiz büyücü hamlesi günlükte yok');
  assert.strictEqual(R.gameLog.filter(e=>e.tur==='gece_hamle'&&e.veri.kim==='u0').length,1);
  G.endToLobby(R);assert.ok(G.startGame(R,lobbyOf(5)));
  assert.strictEqual(R.gameLog[0].tur,'baslangic');assert.strictEqual(R.gameLog[0].sira,1,'ikinci maçın ilk olayı sira 1');
  assert.ok(Array.isArray(G.rolDagit([{key:'hain',team:'imp'},{key:'doktor',team:'inn'}],[{id:'a'},{id:'b'}],{},{deneme:0,kacinmaP:1})));
});

test('bıçaklanan ve aynı gece yıldırım yiyen kurban: olenler.sekiller ikisini taşır, gazetede yıldırım kartı çıkar',()=>{
  const R=fixed(['hain','buyucu','doktor','masum','masum']);
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u3',guess:'masum'});G.advance(R);
  const gs=R.gameLog.find(e=>e.tur==='gece_sonuc');const o=gs.veri.olenler.find(x=>x.kim==='u3');
  assert.ok(o,'u3 öldü');assert.strictEqual(o.sekil,'stab','ilk neden korunur');assert.deepStrictEqual(o.sekiller,['stab','bolt']);
  assert.deepStrictEqual(o.yildirim_kimden,['u1']);
  const gz=G.gazeteFor(R);assert.ok(gz.some(k=>/⚡/.test(JSON.stringify(k))),'yıldırım kartı: '+JSON.stringify(gz));
  assert.ok(gz.some(k=>/⚡/.test(JSON.stringify(k))&&JSON.stringify(k).includes('u1')),'kart büyücüye bağlı');
});

test('Hırsız kurbanı: olenler.sekil ve sekiller tutarlı (vanish); aynı gece yıldırım da varsa sekiller ikisini taşır',()=>{
  let R=fixed(['hirsiz','doktor','masum','masum','masum']);
  G.act(R,'u0',{ab:'u2'});G.advance(R);
  let o=R.gameLog.find(e=>e.tur==='gece_sonuc').veri.olenler.find(x=>x.kim==='u2');
  assert.strictEqual(o.sekil,'vanish');assert.deepStrictEqual(o.sekiller,['vanish']);
  R=fixed(['hirsiz','buyucu','doktor','masum','masum']);
  G.act(R,'u0',{ab:'u3'});G.act(R,'u1',{ab:'u3',guess:'masum'});G.advance(R);
  o=R.gameLog.find(e=>e.tur==='gece_sonuc').veri.olenler.find(x=>x.kim==='u3');
  assert.strictEqual(o.sekil,'vanish');assert.deepStrictEqual(o.sekiller,['vanish','bolt']);
});

test('olay alan şemaları: her olay türünün veri anahtarları sabit (hikâye/gazete/kayıt bunlara bağlı)',()=>{
  const R=fixed(['hain','doktor','provokator','buyucu','masum','masum']);
  G.act(R,'u0',{kill:'u4'});G.act(R,'u1',{ab:'u5'});G.act(R,'u2',{ab:'u0'});G.act(R,'u3',{ab:'u5',guess:'masum'});G.advance(R);
  G.hizli(R,'u1',{k:'rol',rol:'doktor',d:1,n:'a'});G.advance(R);
  for(const id of ['u1','u2','u3','u5'])G.vote(R,id,'u0');G.vote(R,'u0','skip'); // hain asılır, büyücü tek başına → oyun sürer
  G.act(R,'u3',{ab:'u1',guess:'doktor'});G.advance(R);
  const beklenen={
    baslangic:['ayarlar','oyuncular','roller'],
    gece_hamle:['hedef','kim','tahmin','tur'],
    gece_sonuc:['bombalar','caldi','esyalar','haberler','ispiyon','kurtaranlar','kurtarilan','mum','olenler','provokasyon','tutanlar','tutulan','tuzak','yelek','yildirim','ziyaretler'],
    iddia:['algilanan_rol','gercek_rol','gercek_takim','kim','rol_iddia'],
    gunduz_sonuc:['asilan','cekimser','fis','kum','provoke','rol_goruntu','toplamlar','vasiyet'],
  };
  const gorulen={};for(const e of R.gameLog)gorulen[e.tur]=[...new Set([...(gorulen[e.tur]||[]),...Object.keys(e.veri)])].sort();
  for(const [tur,alanlar] of Object.entries(beklenen))assert.deepStrictEqual(gorulen[tur],alanlar,'olay '+tur+' alanları');
  const olen=R.gameLog.find(e=>e.tur==='gece_sonuc').veri.olenler[0];assert.deepStrictEqual(Object.keys(olen).sort(),['kim','kimden','kimden_ad','rol','sekil','sekiller'],'olenler[] alanları (yildirim_kimden yalnız yıldırımda)');
  G.endToLobby(R);const ip=R.gameLog.find(e=>e.tur==='iptal');assert.deepStrictEqual(Object.keys(ip.veri).sort(),['faz','gun'],'iptal alanları');
});

const notesOf=(R,id)=>R.g.notes[id].join(' | ');
test('hain polis öldürmeye gidince ziyareti sayılır ve tuzağa yakalanır',()=>{
  // u0 polis(hain) u2'yi öldürmeye gider; u1 gözcü u2'nin evine bakar → kendisiyle birlikte 2 kişi görmeli
  let R=fixed(['polis_h','gozcu','masum','masum']);
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.advance(R);
  assert.match(notesOf(R,"u1"),/2 kişi geldi/);assert.ok(!G.pl(R,'u2').alive);
  // tuzakçı u2'nin kapısına tuzak kurarsa hain polis yakalanır, u2 ölmez
  R=fixed(['polis_h','tuzakci','masum','masum']);
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.advance(R);
  assert.ok(G.pl(R,'u2').alive);assert.match(notesOf(R,'u0'),/tuzağa yakalandın/);
});
test('polisin tuttuğu polis kimseyi tutamaz; sıra önemsiz',()=>{
  // u0 polis → u1 polis(hain) → u2 doktor → u4; u3 hain u4'ü öldürür: doktor serbest kalmalı, u4 kurtulmalı
  for(const roles of [['polis','polis_h','doktor','hain','masum'],['polis_h','polis','doktor','hain','masum']]){
    const R=fixed(roles);
    G.act(R,'u0',{ab:'u1'});G.act(R,'u1',{ab:'u2'});G.act(R,'u2',{ab:'u4'});G.act(R,'u3',{kill:'u4'});G.advance(R);
    assert.ok(G.pl(R,'u4').alive,roles.join(','));assert.deepStrictEqual(R.P.morning.saved,['u4']);
    assert.match(notesOf(R,'u1'),/kimseyi tutamadın/);assert.ok(!/Polis seni evde tuttu/.test(notesOf(R,'u2')));
  }
  // iki polis birbirini seçerse ikisi de evde kalır, doktor yine serbesttir
  const R=fixed(['polis','polis_h','doktor','hain','masum']);
  G.act(R,'u0',{ab:'u1'});G.act(R,'u1',{ab:'u0'});G.act(R,'u2',{ab:'u4'});G.act(R,'u3',{kill:'u4'});G.advance(R);
  assert.ok(G.pl(R,'u4').alive);for(const id of ['u0','u1'])assert.match(notesOf(R,id),/kimseyi tutamadın/);
});
test('polisin tuttuğu tuzakçı tuzak kuramaz',()=>{
  // u0 polis → u1 tuzakçı; u1 tuzağı u3'e; u2 hain u3'ü öldürür → tuzak yok, u3 ölür
  const R=fixed(['polis','tuzakci','hain','masum','masum']);
  G.act(R,'u0',{ab:'u1'});G.act(R,'u1',{ab:'u3'});G.act(R,'u2',{kill:'u3'});G.advance(R);
  assert.ok(!G.pl(R,'u3').alive);assert.match(notesOf(R,'u1'),/tuzak kuramadın/);assert.ok(!/yakalandı/.test(notesOf(R,'u2')));
});
test('polisin tuttuğu hayatta kalan yelek giyemez',()=>{
  const R=fixed(['polis','hayatta','hain','masum']);
  G.act(R,'u0',{ab:'u1'});G.act(R,'u1',{ab:'self'});G.act(R,'u2',{kill:'u1'});G.advance(R);
  assert.ok(!G.pl(R,'u1').alive);assert.strictEqual(R.g.roles.u1.vest,3);
  // tutulmazsa yelek işler
  const R2=fixed(['polis','hayatta','hain','masum']);
  G.act(R2,'u0',{ab:'u3'});G.act(R2,'u1',{ab:'self'});G.act(R2,'u2',{kill:'u1'});G.advance(R2);
  assert.ok(G.pl(R2,'u1').alive);assert.strictEqual(R2.g.roles.u1.vest,2);
});
test('sohbet satırları artan sıra numarası taşır',()=>{
  const R=fixed(['hain','masum','masum','masum']);G.advance(R);
  assert.strictEqual(R.P.phase,'talk');G.chat(R,'u1','selam');G.chat(R,'u2','selam');
  const s=R.P.chat.map(m=>m.s);assert.ok(s.every((v,i)=>i===0||v>s[i-1]),'sıra artmalı: '+s);
});

test('süre dolunca tick fazı ilerletir',()=>{
  let t=1000;G.setClock(()=>t);
  try{
    const R=fixed(['hain','masum','masum','masum']);
    assert.strictEqual(G.tick(R),false);
    t=R.P.ends;assert.strictEqual(G.tick(R),true);assert.strictEqual(R.P.phase,'talk');
  }finally{G.setClock()}
});

test('gece hamlesi doğrulanır: yanlış gün, ölü oyuncu, yabancı',()=>{
  const R=fixed(['hain','masum','masum','masum']);
  assert.strictEqual(G.act(R,'u0',{kill:'u1',d:5}),false);
  assert.strictEqual(G.act(R,'zz',{kill:'u1'}),false);
  assert.strictEqual(G.act(R,'u0',{kill:'u1',guess:'constructor'}),true);
  assert.strictEqual(R.g.acts.u0.guess,null);
  G.advance(R);assert.ok(!G.pl(R,'u1').alive);
  G.advance(R);
  assert.strictEqual(G.vote(R,'u1','u0'),false,'ölü oy veremez');
  assert.strictEqual(G.chat(R,'u1','x'),false,'ölü meydanda yazamaz');
  assert.strictEqual(G.deadChat(R,'u1','x'),true);
  assert.strictEqual(G.privFor(R,'u1').dchat.length,1);
  assert.strictEqual(G.privFor(R,'u2').dchat.length,0);
});

test('lobiye dönüş gizli durumu siler',()=>{
  const R=fixed(['hain','masum','masum','masum']);G.endToLobby(R);
  assert.strictEqual(R.g,null);assert.strictEqual(R.P.phase,'lobby');assert.strictEqual(G.privFor(R,'u0').role,null);
});

test('tutulan ya da tuzağa yakalanan deli de bilgi alamaz (gerçek rolden ayırt edilemez)',()=>{
  // u0 polis u1'i tutar; u1 deli (kendini gözcü sanır) u2'ye bakar → yalnız "tuttu" notu, "kişi geldi" olmamalı
  let R=fixed(['polis','deli','hain','masum','masum']);R.g.roles.u1.mad='gozcu';
  G.act(R,'u0',{ab:'u1'});G.act(R,'u1',{ab:'u2'});G.advance(R);
  assert.match(notesOf(R,'u1'),/Polis seni evde tuttu/);assert.ok(!/kişi geldi/.test(notesOf(R,'u1')),notesOf(R,'u1'));
  // u0 tuzakçı u2'nin kapısına tuzak kurar; deli(gözcü) u2'ye gidince yakalanır, bilgi alamaz
  R=fixed(['tuzakci','deli','hain','masum','masum']);R.g.roles.u1.mad='gozcu';
  G.act(R,'u0',{ab:'u2'});G.act(R,'u1',{ab:'u2'});G.advance(R);
  assert.match(notesOf(R,'u1'),/tuzağa yakalandın/);assert.ok(!/kişi geldi/.test(notesOf(R,'u1')),notesOf(R,'u1'));
});
test('izci: tuzağa yakalanan eve gitmiş sayılır, polisin tuttuğu çıkmamış sayılır',()=>{
  // u0 hain u3'e gider ve u1'in tuzağına yakalanır; u2 izci u0'ı izler → "u3 evine gitti" (gözcü de onu orada sayar)
  let R=fixed(['hain','tuzakci','izci','masum']);
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u3'});G.act(R,'u2',{ab:'u0'});G.advance(R);
  assert.ok(G.pl(R,'u3').alive);assert.match(notesOf(R,'u0'),/tuzağa yakalandın/);
  assert.match(notesOf(R,'u2'),/Oyuncu0 gece Oyuncu3 evine gitti/);
  // polis u0'ı evde tutar → izci "evinden çıkmadı" der
  R=fixed(['hain','polis','izci','masum']);
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u0'});G.act(R,'u2',{ab:'u0'});G.advance(R);
  assert.ok(G.pl(R,'u3').alive);assert.match(notesOf(R,'u2'),/Oyuncu0 gece evinden çıkmadı/);
});

test('gece bitiminde bağlantısı kopuk yaşayan oyuncu varsa bir kez en çok 30 sn beklenir',()=>{
  let t=1000;G.setClock(()=>t);
  try{
    const R=fixed(['hain','masum','masum','masum']);t=R.P.ends;
    assert.strictEqual(G.tick(R,new Set(['u1'])),true,'bekleme durumu değişiklik sayılır');
    assert.strictEqual(R.P.phase,'night');assert.deepStrictEqual(R.P.waiting,['u1']);assert.strictEqual(R.P.ends,t+30000);
    t=R.P.ends-1;assert.strictEqual(G.tick(R,new Set(['u1'])),false);
    t=R.P.ends;assert.strictEqual(G.tick(R,new Set(['u1'])),true);assert.strictEqual(R.P.phase,'talk','ikinci kez beklenmez');assert.ok(!R.P.waiting);
    noLeak(R.P);
    // kimse kopuk değilse ya da kopuk olan ölüyse beklenmez
    const R2=fixed(['hain','masum','masum','masum']);t=R2.P.ends;assert.strictEqual(G.tick(R2,new Set()),true);assert.strictEqual(R2.P.phase,'talk');
    const R3=fixed(['hain','masum','masum','masum']);G.pl(R3,'u1').alive=false;t=R3.P.ends;G.tick(R3,new Set(['u1']));assert.strictEqual(R3.P.phase,'talk');
    // gündüz fazlarında beklenmez
    t=R3.P.ends;G.tick(R3,new Set(['u2']));assert.strictEqual(R3.P.phase,'vote');
  }finally{G.setClock()}
});

test('olay günlüğü: başlangıç, etkin gece hamleleri, gece ve gündüz sonucu, bitiş; sıra artar',()=>{
  const R=fixed(['hain','doktor','masum','masum','masum']);
  assert.strictEqual(R.log[0].tur,'baslangic');assert.strictEqual(R.log[0].veri.oyuncular.length,5);
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.act(R,'u3',{ab:'u4'}); // u3 masum: yeteneği yok, yazılmaz
  G.advance(R);
  assert.deepStrictEqual(R.log.filter(e=>e.tur==='gece_hamle').map(e=>[e.veri.kim,e.veri.tur,e.veri.hedef]),[['u0','kill','u2'],['u1','ab','u2']]);
  const gs=R.log.find(e=>e.tur==='gece_sonuc');assert.strictEqual(gs.gun,1);assert.strictEqual(gs.faz,'night');
  assert.deepStrictEqual(gs.veri.kurtarilan,['u2']);assert.deepStrictEqual(gs.veri.olenler,[]);assert.deepStrictEqual(gs.veri.ziyaretler.u2.sort(),['u0','u1']);
  G.advance(R);for(const id of ['u1','u2','u3','u4'])G.vote(R,id,'u0');G.vote(R,'u0','skip');
  const gd=R.log.find(e=>e.tur==='gunduz_sonuc');assert.strictEqual(gd.veri.asilan,'u0');assert.deepStrictEqual(gd.veri.toplamlar,{u0:4});assert.strictEqual(gd.veri.cekimser,1);
  const b=R.log[R.log.length-1];assert.strictEqual(b.tur,'bitis');assert.strictEqual(b.veri.kazanan,'inn');assert.strictEqual(b.veri.acilis.length,5);
  assert.ok(R.log.every((e,i)=>e.sira===i+1),'sıra 1..n');
  noLeak(R.P);assert.ok(!JSON.stringify(R.P).includes('"log"'));
});
test('olay günlüğü: tuzak, tutma ve ölüm ayrıntıları; gece bitince sıra gece_sonuc → bitis',()=>{
  // u0 hain u3'e gider, u1 tuzakçı u3'ün kapısında, u2 polis u4'ü tutar
  let R=fixed(['hain','tuzakci','polis','masum','masum']);
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u3'});G.act(R,'u2',{ab:'u4'});G.advance(R);
  let gs=R.log.find(e=>e.tur==='gece_sonuc');
  assert.deepStrictEqual(gs.veri.tuzak,[{kim:'u0',ev:'u3',kuran:'u1'}]);assert.deepStrictEqual(gs.veri.tutulan,['u4']);
  // 2 hain + 2 masum: bir masum ölünce hain >= diğerleri → oyun gece biter (checkWin resolveNight içinde)
  R=fixed(['hain','hain','masum','masum']);G.act(R,'u0',{kill:'u2'});G.advance(R);
  assert.strictEqual(R.P.phase,'end');
  const turler=R.log.map(e=>e.tur);assert.deepStrictEqual(turler.slice(-2),['gece_sonuc','bitis']);
  gs=R.log.find(e=>e.tur==='gece_sonuc');assert.deepStrictEqual(gs.veri.olenler,[{kim:'u2',sekil:'stab',sekiller:['stab'],kimden:['u0'],kimden_ad:'Hain',rol:'Masum'}]);
});
test('olay günlüğü: iptal yazılır, lobide ve bitmiş oyunda yazılmaz',()=>{
  const R=fixed(['hain','masum','masum','masum']);G.advance(R);G.endToLobby(R);
  const son=R.log[R.log.length-1];assert.strictEqual(son.tur,'iptal');assert.deepStrictEqual(son.veri,{gun:1,faz:'talk'});
  const n=R.log.length;G.endToLobby(R);assert.strictEqual(R.log.length,n,'lobideyken iptal yazılmaz');
});

test('oyun sonu özeti ve senin payın günlükten türer',()=>{
  const R=fixed(['hain','doktor','tuzakci','masum','masum']);
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u3'});G.act(R,'u2',{ab:'u4'});G.advance(R); // doktor u3'ü kurtarır
  G.advance(R);for(const id of ['u0','u1','u2','u3'])G.vote(R,id,'u4');G.vote(R,'u4','skip'); // u4 asılır
  G.act(R,'u0',{kill:'u2'});G.advance(R); // gece 2: tuzakçı ölür → 1 hain, 2 masum → sürer
  G.advance(R);for(const id of ['u1','u3'])G.vote(R,id,'u0');G.vote(R,'u0','u1'); // hain asılır → masumlar
  assert.strictEqual(R.P.phase,'end');
  const oz=R.P.ozet;assert.deepStrictEqual(oz.kazanan,{takim:'inn',metin:'Masumlar kazandı!'});
  const by=Object.fromEntries(oz.oyuncular.map(o=>[o.id,o]));
  assert.deepStrictEqual(by.u4.olum,{gun:1,faz:'gunduz',sekil:'asildi',kimden:[]});
  assert.deepStrictEqual(by.u2.olum,{gun:2,faz:'gece',sekil:'stab',kimden:['u0']});
  assert.strictEqual(by.u1.olum,null);assert.strictEqual(by.u1.sag,true);assert.strictEqual(by.u0.rol,'Hain');
  assert.deepStrictEqual(G.privFor(R,'u0').payin,{oldurdu:['Oyuncu2'],kurtardi:[],yakaladi:[],tuttu:[]});
  assert.deepStrictEqual(G.privFor(R,'u1').payin.kurtardi,['Oyuncu3']);
  noLeak(R.P);
});
test('payin oyun bitmeden null; hırsız ve deli özette doğru görünür',()=>{
  let R=fixed(['hain','masum','masum','masum']);assert.strictEqual(G.privFor(R,'u0').payin,null);assert.strictEqual(R.P.ozet,undefined);
  R=fixed(['hirsiz','hain','doktor','masum','masum','masum','masum']);
  G.act(R,'u0',{ab:'u2'});G.advance(R); // hırsız doktorun rolünü çalar
  assert.strictEqual(R.g.roles.u0.key,'doktor');
  // kalan oyunu hızlıca bitir: hain ve hırsız (artık doktor) dışında herkes gece ölmüş gibi
  for(const id of ['u3','u4','u5','u6'])G.pl(R,id).alive=false;
  G.advance(R);G.advance(R); // talk → vote → çözüm (kimse oy vermez) → checkWin
  assert.strictEqual(R.P.phase,'end');
  const o=Object.fromEntries(R.P.ozet.oyuncular.map(o=>[o.id,o]));
  assert.match(o.u0.rol,/Hırsız çaldı/);assert.deepStrictEqual(G.privFor(R,'u0').payin.oldurdu,['Oyuncu2']);
  R=fixed(['hain','deli','masum','masum','masum']);R.g.roles.u1.mad='doktor';
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.advance(R);
  assert.ok(!R.log.some(e=>e.tur==='gece_hamle'&&e.veri.kim==='u1'),'deli hamlesi etkin değildir');
});

test('inceleme: çoklu saldırıda kurtaranlar/yelek tekrarlanmaz; tutulan tekil',()=>{
  // hain ve seri katil aynı kişiye, doktor onu korur → kurtardi bir kez
  let R=fixed(['hain','serikatil','doktor','masum','masum']);
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u3'});G.act(R,'u2',{ab:'u3'});G.advance(R);
  assert.deepStrictEqual(G.privFor(R,'u2').payin,null);
  let gs=R.log.find(e=>e.tur==='gece_sonuc');assert.deepStrictEqual(gs.veri.kurtaranlar,[{kim:'u2',hedef:'u3'}]);
  // yelek: iki saldırı, bir yelek
  R=fixed(['hain','serikatil','hayatta','masum','masum']);
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.act(R,'u2',{ab:'self'});G.advance(R);
  gs=R.log.find(e=>e.tur==='gece_sonuc');assert.deepStrictEqual(gs.veri.yelek,['u2']);
  // iki polis aynı hedefi tutar → tutulan tekil; polis polisi tutarsa tutulan polis bir kez
  R=fixed(['polis','polis','masum','masum','hain']);
  G.act(R,'u0',{ab:'u2'});G.act(R,'u1',{ab:'u2'});G.advance(R);
  gs=R.log.find(e=>e.tur==='gece_sonuc');assert.deepStrictEqual(gs.veri.tutulan,['u2']);
  R=fixed(['polis','polis','masum','masum','hain']);
  G.act(R,'u0',{ab:'u1'});G.act(R,'u1',{ab:'u2'});G.advance(R);
  gs=R.log.find(e=>e.tur==='gece_sonuc');assert.deepStrictEqual(gs.veri.tutulan,['u1']);
});

const BILGI=['polis','gozcu','izci','dedektif','ispiyoncu'];
test('rol dağılımı: eşikler, tekrarsız özel roller, bilgi rolü ≥ hain, Masum 7+ kişide 1',()=>{
  const bekle={4:[1,0,0,0],5:[1,0,0,0],6:[1,0,0,1],7:[1,0,0,1],8:[1,0,0,1],9:[2,1,1,1],10:[2,1,1,1],11:[2,1,1,1],12:[2,2,1,1]}; // hain, saldırgan, pasif, deli
  for(let n=4;n<=12;n++){
    const kumeler=new Set();let surumluSay=0;
    for(let i=0;i<500;i++){
      const c=G.autoSetup(n);const ids=Object.keys(c);
      assert.strictEqual(Object.values(c).reduce((a,b)=>a+b,0),n,'toplam '+n);
      const say=(f)=>ids.filter(f).reduce((a,id)=>a+c[id],0);
      const hain=say(id=>G.SETUP.find(s=>s.id===id).team==='imp');
      const sald=say(id=>['serikatil','bombaci','hirsiz','buyucu'].includes(id));
      const pasif=say(id=>['hayatta','hortlak'].includes(id));
      assert.deepStrictEqual([hain,sald,pasif,c.deli||0],bekle[n],'n='+n+' '+JSON.stringify(c));
      for(const id of ids)if(id!=='masum'&&id!=='hain')assert.strictEqual(c[id],1,'özel rol tekrar: '+id+' n='+n);
      const surumlu=say(id=>id.endsWith('_h')||['temizlikci','suclayici'].includes(id));surumluSay+=surumlu;
      assert.ok(surumlu<=Math.ceil(hain/2),'sürümlü hain sınırı n='+n);
      if(hain>=2)assert.ok((c.hain||0)>=1,'2 hainde en az bir düz Hain n='+n);
      assert.ok(c.doktor===1,'doktor hep');assert.strictEqual(c.polis||0,n>=5?1:0,'polis 5+');
      const bilgi=say(id=>BILGI.includes(id));assert.ok(bilgi>=hain,'bilgi rolü ≥ hain n='+n+' '+JSON.stringify(c));
      assert.strictEqual(c.masum||0,n>=7&&n!==9?1:0,'masum n='+n+' (9 kişide yok: Tuzakçı/Provokatör yuvası) '+JSON.stringify(c));
      kumeler.add(ids.sort().join(','));
    }
    if(n>=7)assert.ok(kumeler.size>1,'n='+n+' hep aynı küme');
    if(n<=8){const oran=surumluSay/500;assert.ok(oran>=0.35&&oran<=0.65,'tek hain sürümlü oranı ≈ %50 n='+n+' '+oran)}
    else assert.strictEqual(surumluSay,500,'2 hainde hep 1 sürümlü n='+n);
  }
  // olasılık sabiti uçları
  for(let i=0;i<100;i++){const c=G.autoSetup(6,{tekHainSurumP:0});assert.strictEqual(c.hain,1,'P=0 → hep düz Hain')}
  for(let i=0;i<100;i++){const c=G.autoSetup(6,{tekHainSurumP:1});assert.strictEqual(c.hain||0,0,'P=1 → hep sürümlü')}
  assert.strictEqual(G.DAGILIM.tekHainSurumP,0.5,'varsayılan 0,5');
  assert.ok(Object.isFrozen(G.DAGILIM),'DAGILIM donmuş: eşikler yalnız autoSetup(n, ayar) ile geçici değişir');
  assert.throws(()=>{'use strict';G.DAGILIM.tekHainSurumP=0},'donmuş nesneye yazma strict kipte fırlatır');
  for(let i=0;i<50;i++)assert.strictEqual(G.autoSetup(5,{masum:()=>1}).masum,1,'autoSetup ayar: masum eşiği geçici');
});

// ---------- Geri bildirim paketi: tekrar eğilimi (rolDagit, R.rolGecmisi) ----------
test('tekrarCezasi: hemen tekrar 4, son 3\'te 1\'er, üst üste üçüncü hain 2, geçmişsiz 0',()=>{
  const r=(key,team='inn')=>({key,team});
  assert.strictEqual(G.tekrarCezasi(r('doktor'),[]),0);
  assert.strictEqual(G.tekrarCezasi(r('doktor'),undefined),0);
  assert.strictEqual(G.tekrarCezasi(r('doktor'),[r('doktor')]),4,'hemen tekrar');
  assert.strictEqual(G.tekrarCezasi(r('doktor'),[r('polis'),r('doktor')]),1,'h[1]');
  assert.strictEqual(G.tekrarCezasi(r('doktor'),[r('polis'),r('gozcu'),r('doktor')]),1,'h[2]');
  assert.strictEqual(G.tekrarCezasi(r('doktor'),[r('polis'),r('doktor'),r('doktor')]),2,'h[1] ve h[2]');
  assert.strictEqual(G.tekrarCezasi(r('doktor'),[r('polis'),r('gozcu'),r('izci'),r('doktor')]),0,'h[3] sayılmaz');
  assert.strictEqual(G.tekrarCezasi(r('hain','imp'),[r('polis','imp'),r('gozcu','imp')]),2,'üçüncü kez hain (takım)');
  assert.strictEqual(G.tekrarCezasi(r('hain','imp'),[r('hain','imp'),r('gozcu','imp')]),6,'hemen tekrar + takım');
  assert.strictEqual(G.tekrarCezasi(r('polis','imp'),[r('polis','inn')]),4,'Polis ve Polis-hain aynı key');
  assert.strictEqual(G.tekrarCezasi(r('doktor','inn'),[r('polis','inn'),r('gozcu','inn')]),0,'masum takımı tekrarı ceza değil');
});

test('rolDagit: cezasız dağıtım varsa bulur; eğilim tekrarı azaltır, kesin yasaklamaz',()=>{
  const bag=[{key:'doktor',team:'inn'},{key:'polis',team:'inn'},{key:'masum',team:'inn'},{key:'hain',team:'imp'}];
  const players=[{id:'u0'},{id:'u1'},{id:'u2'},{id:'u3'}];
  const gecmis={u0:[{key:'hain',team:'imp'}],u1:[{key:'masum',team:'inn'}],u2:[{key:'polis',team:'inn'}],u3:[{key:'doktor',team:'inn'}]};
  const ceza=(sira,g)=>sira.reduce((a,r,i)=>a+G.tekrarCezasi(r,g[players[i].id]),0);
  for(let i=0;i<50;i++){
    const sira=G.rolDagit(bag,players,gecmis,{kacinmaP:1,deneme:200});
    assert.strictEqual(sira.length,4);assert.deepStrictEqual(sira.map(r=>r.key).sort(),['doktor','hain','masum','polis'],'torbanın tamamı');
    assert.strictEqual(ceza(sira,gecmis),0,'cezasız dağıtım bulunur');
  }
  let tekrar=0;for(let i=0;i<400;i++){if(G.rolDagit(bag,players,gecmis)[0].key==='hain')tekrar++}
  assert.ok(tekrar/400<=0.12,'varsayılan eğilimle hemen tekrar seyrek: '+tekrar/400); // %20 düz karıştırma → ≈%5 beklenir; kesin yasak değil
  let temel=0;for(let i=0;i<400;i++){if(G.rolDagit(bag,players,{})[0].key==='hain')temel++}
  assert.ok(temel/400>=0.15&&temel/400<=0.35,'geçmişsiz düz rastgele: '+temel/400);
  for(let i=0;i<20;i++){const sira=G.rolDagit(bag,players,{u0:[{key:'hain',team:'imp'}]},{kacinmaP:1});assert.deepStrictEqual(sira.map(r=>r.key).sort(),['doktor','hain','masum','polis'],'yalnız u0 geçmişli: torba tam')}
  assert.deepStrictEqual(G.TEKRAR,{kacinmaP:0.8,gecmisUz:5,deneme:200,ceza:{hemen:4,yakin:1,takim:2}});
});

test('startGame rol geçmişini odada tutar: oyuncu başına son 5, ayrılanın kaydı durur, state\'e sızmaz',()=>{
  const R=G.createGame();assert.deepStrictEqual(R.rolGecmisi,{});
  assert.ok(G.startGame(R,lobbyOf(4)));
  for(const p of R.P.players){const h=R.rolGecmisi[p.id];assert.strictEqual(h.length,1);assert.deepStrictEqual(h[0],{key:R.g.roles[p.id].key,team:R.g.roles[p.id].team})}
  noLeak(R.P);
  G.endToLobby(R);
  const yeni=[...lobbyOf(4).slice(1),{id:'u9',name:'Yeni',color:G.COLORS[5],hat:'none'}]; // u0 çıktı, u9 geldi
  assert.ok(G.startGame(R,yeni));
  assert.strictEqual(R.rolGecmisi.u0.length,1,'ayrılanın kaydı durur');assert.strictEqual(R.rolGecmisi.u1.length,2);assert.strictEqual(R.rolGecmisi.u9.length,1);
  assert.deepStrictEqual(R.rolGecmisi.u1[0],{key:R.g.roles.u1.key,team:R.g.roles.u1.team},'en yeni önde');
  for(let i=0;i<6;i++){G.endToLobby(R);assert.ok(G.startGame(R,yeni))}
  assert.strictEqual(R.rolGecmisi.u1.length,5,'en çok 5');
  noLeak(R.P);
});

test('polis bombacıyı tutamaz (seri katil gibi); 1\'e 1 kalınca bombacı patlatıp kazanır',()=>{
  // u0 polis u1 bombacıyı tutmaya gider; bombacı yine dinamit koyar
  let R=fixed(['polis','bombaci','hain','masum','masum']);
  G.act(R,'u0',{ab:'u1'});G.act(R,'u1',{ab:'u3'});G.advance(R);
  assert.match(notesOf(R,'u0'),/evde durmadı; onu tutamadın/);assert.strictEqual(R.g.roles.u1.planted.length,1);
  assert.ok(!/Polis seni evde tuttu/.test(notesOf(R,'u1')));
  // polis + bombacı: bombacı önceki geceden dinamit koymuş olsun, patlatınca polis ölür → oyun biter (kilit yok)
  R=fixed(['polis','bombaci','masum','masum']);G.pl(R,'u2').alive=false;G.pl(R,'u3').alive=false;R.g.roles.u1.planted=['u0'];
  G.act(R,'u0',{ab:'u1'});G.act(R,'u1',{det:true});G.advance(R);
  assert.strictEqual(R.P.phase,'end');assert.strictEqual(R.P.winner.who,'u1');
});

test('privFor.planted dinamit konan evlerin listesidir',()=>{
  const R=fixed(['bombaci','hain','masum','masum','masum']);
  G.act(R,'u0',{ab:'u2'});G.advance(R);G.advance(R);G.advance(R); // gece 1 → gündüz → oylama → gece 2
  G.act(R,'u0',{ab:'u3'});G.advance(R);
  assert.deepStrictEqual(G.privFor(R,'u0').planted,['u2','u3']);
  assert.deepStrictEqual(G.privFor(R,'u1').planted,[]);
});

// ---------- Paket 1a: kazananlar listesi ----------
test('kazananlar: takım zaferi ölüleri kapsar; hırsız yeni takımıyla; deli masum; hayatta kalan ve hortlak eklenir; kimse yoksa boş',()=>{
  const bitir=R=>{assert.strictEqual(R.P.phase,'end');const k=R.P.winner.kazananlar;assert.ok(Array.isArray(k));for(const id of k)assert.ok(R.P.players.some(p=>p.id===id),'kazanan oyuncu olmalı: '+id);
    const b=R.log[R.log.length-1];assert.strictEqual(b.tur,'bitis');assert.deepStrictEqual(b.veri.kazananlar,k);return k.slice().sort()};
  // masumlar kazanır: gece ölen masum (u4) da kazanır
  let R=fixed(['hain','doktor','masum','masum','masum']);
  G.act(R,'u0',{kill:'u4'});G.advance(R);assert.ok(!G.pl(R,'u4').alive);
  G.advance(R);for(const id of ['u1','u2','u3'])G.vote(R,id,'u0');G.vote(R,'u0','skip');
  assert.deepStrictEqual(bitir(R),['u1','u2','u3','u4']);
  // hainler kazanır: iki hain
  R=fixed(['hain','hain','masum','masum']);G.act(R,'u0',{kill:'u2'});G.advance(R);
  assert.deepStrictEqual(bitir(R),['u0','u1']);
  // hırsız doktoru çalar (artık masum tarafı), sonra masumlar kazanır → hırsız listede
  R=fixed(['hirsiz','hain','doktor','masum','masum','masum','masum']);
  G.act(R,'u0',{ab:'u2'});G.advance(R);assert.strictEqual(R.g.roles.u0.team,'inn');
  G.advance(R);for(const id of ['u0','u3','u4','u5','u6'])G.vote(R,id,'u1');G.vote(R,'u1','skip');
  assert.ok(bitir(R).includes('u0'));assert.ok(!bitir(R).includes('u1'));
  // deli masum zaferinde listede, hain zaferinde değil; hayatta kalan sağsa hain zaferinde de listede
  R=fixed(['hain','deli','masum','masum','hayatta']);R.g.roles.u1.mad='doktor';
  G.act(R,'u0',{kill:'u2'});G.advance(R);G.advance(R);for(const id of ['u1','u3','u4'])G.vote(R,id,'u0');G.vote(R,'u0','skip');
  assert.deepStrictEqual(bitir(R),['u1','u2','u3','u4']);
  R=fixed(['hain','deli','masum','hayatta']);R.g.roles.u1.mad='doktor';
  G.act(R,'u0',{kill:'u2'});G.advance(R); // 1 hain, 1 deli(masum), 1 hayatta → hain ≥ diğerleri(1) → hainler
  assert.deepStrictEqual(bitir(R),['u0','u3']);
  // hortlak asılır (kazanır), oyun sonra masumlarla biter → hortlak listede
  R=fixed(['hain','hortlak','masum','masum','masum','masum']);
  G.advance(R);G.advance(R);for(const id of ['u0','u2','u3','u4'])G.vote(R,id,'u1');G.vote(R,'u1','skip');G.vote(R,'u5','skip');
  assert.ok(!G.pl(R,'u1').alive);assert.deepStrictEqual(R.g.hauntWins,['u1']);
  G.advance(R);G.advance(R);for(const id of ['u2','u3','u4','u5'])G.vote(R,id,'u0');G.vote(R,'u0','skip');
  assert.ok(bitir(R).includes('u1'));
  // kimse kazanamadı: herkes ölü
  R=fixed(['hain','masum','masum','masum']);for(const id of ['u0','u1','u2','u3'])G.pl(R,id).alive=false;G.advance(R);
  assert.deepStrictEqual(bitir(R),[]);
});

// ---------- Paket 1a: Kasaba Gazetesi ----------
const asil=(R,kim,oyverenler)=>{for(const id of oyverenler)G.vote(R,id,kim);for(const p of G.alivePlayers(R))if(!oyverenler.includes(p.id))G.vote(R,p.id,'skip')};
test('gazete: deli kartı önce, doktor müdahalesi, en çok 3, deterministik; oyun sürerken yok',()=>{
  const R=fixed(['hain','doktor','deli','masum','masum']);R.g.roles.u2.mad='polis';
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u3'});G.advance(R);
  assert.strictEqual(R.P.gazete,undefined,'oyun sürerken gazete yok');noLeak(R.P);
  G.advance(R);asil(R,'u0',['u1','u2','u3','u4']);
  assert.strictEqual(R.P.phase,'end');const gz=R.P.gazete;
  assert.ok(Array.isArray(gz)&&gz.length>=2&&gz.length<=3,JSON.stringify(gz));
  assert.strictEqual(gz[0].tur,'deli');assert.match(gz[0].metin,/Oyuncu2 aslında Deli'ydi; kendisine Polis rolü gösteriliyordu/);
  assert.strictEqual(gz[1].tur,'mudahale');assert.match(gz[1].metin,/Gece 1: Oyuncu1 bir saldırıyı önledi; Oyuncu3 sağ çıktı/);
  assert.deepStrictEqual(G.gazeteFor(R),G.gazeteFor(R));
  for(const k of gz)assert.ok(!/kurtardı|MVP|kandırdı/.test(k.metin));
});
test('gazete: saldırı yoksa ya da doktor engellendiyse kart yok; aday yoksa yalnız bitiş kartı',()=>{
  let R=fixed(['hain','doktor','masum','masum','masum']);
  G.act(R,'u1',{ab:'u3'});G.advance(R);G.advance(R);asil(R,'u0',['u1','u2','u3','u4']); // saldırı yok
  assert.ok(!R.P.gazete.some(k=>k.tur==='mudahale'),JSON.stringify(R.P.gazete));
  assert.deepStrictEqual(R.P.gazete.map(k=>k.tur),['bitis']);assert.match(R.P.gazete[0].metin,/Gün 1: kasaba Oyuncu0'ı gönderdi ve oyun bitti/);
  R=fixed(['hain','doktor','polis_h','masum','masum','masum']);
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u3'});G.act(R,'u2',{ab:'u1'});G.advance(R); // hain polis doktoru tutar → u3 ölür
  assert.ok(!G.pl(R,'u3').alive);G.advance(R);asil(R,'u0',['u1','u4','u5']);G.advance(R);G.advance(R);asil(R,'u2',['u1','u4','u5']);
  assert.strictEqual(R.P.phase,'end');assert.ok(!R.P.gazete.some(k=>/önledi/.test(k.metin)),JSON.stringify(R.P.gazete));
  // gece ölümle biten oyun: bitiş kartı gece metni
  R=fixed(['hain','hain','masum','masum']);G.act(R,'u0',{kill:'u2'});G.advance(R);
  assert.match(R.P.gazete.find(k=>k.tur==='bitis').metin,/Gece 1: Oyuncu2 öldü ve oyun bitti/);
});
test('gazete: yelek, tuzak, tutma, hırsız, yıldırım (iki yön), patlama, hortlak metinleri',()=>{
  const son=R=>{for(const p of G.alivePlayers(R))if(R.g.roles[p.id].team!=='imp')G.pl(R,p.id).alive=false;G.advance(R);G.advance(R);assert.strictEqual(R.P.phase,'end');return R.P.gazete.map(k=>k.metin).join(' | ')};
  let R=fixed(['hain','hayatta','masum','masum','masum']);G.act(R,'u0',{kill:'u1'});G.act(R,'u1',{ab:'self'});G.advance(R);
  assert.match(son(R),/🦺 Gece 1: Oyuncu1 yelek sayesinde saldırıdan sağ çıktı/);
  R=fixed(['hain','tuzakci','masum','masum','masum']);G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.advance(R);
  assert.match(son(R),/🪤 Gece 1: Oyuncu1'in tuzağı Oyuncu0'ı Oyuncu2'nin kapısında yakaladı/);
  R=fixed(['hain','polis','masum','masum','masum']);G.act(R,'u1',{ab:'u0'});G.advance(R);
  assert.match(son(R),/👮 Gece 1: Polis Oyuncu1, Oyuncu0'ı evde tuttu/);
  R=fixed(['hirsiz','hain','doktor','masum','masum','masum','masum']);G.act(R,'u0',{ab:'u2'});G.advance(R);
  assert.match(son(R),/🎭 Gece 1: Oyuncu0 Oyuncu2'nin rolünü çaldı; artık Doktor/);
  R=fixed(['buyucu','hain','doktor','masum','masum','masum']);G.act(R,'u0',{ab:'u2',guess:'doktor'});G.advance(R);
  assert.match(son(R),/⚡ Gece 1: Büyücü Oyuncu2'nin rolünü doğru tahmin etti; yıldırım düştü/);
  R=fixed(['buyucu','hain','doktor','masum','masum','masum']);G.act(R,'u0',{ab:'u2',guess:'polis'});G.advance(R);
  assert.match(son(R),/⚡ Gece 1: Büyücü yanlış tahmin etti; yıldırım kendine düştü/);
  R=fixed(['bombaci','hain','masum','masum','masum','masum']);G.act(R,'u0',{ab:'u2'});G.advance(R);G.advance(R);G.advance(R);
  G.act(R,'u0',{ab:'u3',det:true});G.advance(R); // gece 2: önceki dinamit patlar (u2)
  assert.match(son(R),/🧨 Gece 2: dinamitler patladı; Oyuncu2, Oyuncu3 evleriyle uçtu/); // aynı gece koyulan da patlar
  R=fixed(['hain','hortlak','masum','masum','masum','masum']);G.act(R,'u1',{ab:'u2'});G.advance(R);G.advance(R);asil(R,'u1',['u0','u2','u3','u4']);
  G.advance(R);assert.ok(!G.pl(R,'u2').alive,'hayalet mum koyduğu kişiyi aldı');
  assert.match(son(R),/🕯️ Gece 2: Oyuncu1 hayalet olarak döndü; Oyuncu2 mumun bedelini ödedi/);
});
test('gazete: aynı özne iki kartı kaplamaz; sıra tür → gün → kayıt',()=>{
  const R=fixed(['hain','doktor','tuzakci','masum','masum','masum','masum']);
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u3'});G.advance(R);G.advance(R);asil(R,'u4',['u0','u1','u2','u3']);   // gece 1 doktor önler; gün 1 u4 asılır
  G.act(R,'u0',{kill:'u5'});G.act(R,'u1',{ab:'u5'});G.act(R,'u2',{ab:'u6'});G.advance(R);                      // gece 2 doktor önler, tuzak boş
  G.advance(R);asil(R,'u6',['u0','u1','u2','u3']);
  G.act(R,'u0',{kill:'u3'});G.act(R,'u2',{ab:'u3'});G.advance(R);                                                // gece 3 tuzak haini yakalar
  G.advance(R);asil(R,'u0',['u1','u2','u3','u5']);assert.strictEqual(R.P.phase,'end');
  const m=R.P.gazete.map(k=>k.metin);assert.strictEqual(m.length,3,m.join(' | '));
  assert.match(m[0],/Gece 1: Oyuncu1 bir saldırıyı önledi/);assert.match(m[1],/Gece 3: Oyuncu2'nin tuzağı/);assert.match(m[2],/Gün 3: kasaba Oyuncu0'ı gönderdi/);
  assert.ok(!m.some(x=>/Gece 2: Oyuncu1/.test(x)),'doktorun ikinci kartı atlanır');
});

test('inceleme: Türkçe ad ekleri ünlü uyumuna ve kaynaştırmaya uyar; gazete metinleri doğru ek alır',()=>{
  const e=G.ek;
  assert.strictEqual(e('Ece','i'),"Ece'yi");assert.strictEqual(e('Can','in'),"Can'ın");assert.strictEqual(e('Ahmet','in'),"Ahmet'in");
  assert.strictEqual(e('Deniz','i'),"Deniz'i");assert.strictEqual(e('Kaya','in'),"Kaya'nın");assert.strictEqual(e('Umut','i'),"Umut'u");
  assert.strictEqual(e('Gül','in'),"Gül'ün");assert.strictEqual(e('Oyuncu2','in'),"Oyuncu2'nin");assert.strictEqual(e('Oyuncu0','i'),"Oyuncu0'ı");
  assert.strictEqual(e('Oyuncu6','i'),"Oyuncu6'yı");assert.strictEqual(e('Xyz','i'),"Xyz'i");
  // inceleme: büyük İ, çok haneli sayı sonu, sondaki emoji/noktalama
  assert.strictEqual(e('ALİ','i'),"ALİ'yi");assert.strictEqual(e('VELİ','in'),"VELİ'nin");assert.strictEqual(e('AYŞE','in'),"AYŞE'nin");
  assert.strictEqual(e('Oyuncu10','i'),"Oyuncu10'u");assert.strictEqual(e('Oyuncu20','i'),"Oyuncu20'yi");assert.strictEqual(e('Oyuncu100','in'),"Oyuncu100'ün");assert.strictEqual(e('Oyuncu40','i'),"Oyuncu40'ı");
  assert.strictEqual(e('Ali😀','i'),"Ali😀'yi");assert.strictEqual(e('Can!','in'),"Can!'ın");
  const R=fixed(['hain','tuzakci','masum','masum','masum']);R.P.players.find(p=>p.id==='u0').name='Ece';R.P.players.find(p=>p.id==='u1').name='Kaya';R.P.players.find(p=>p.id==='u2').name='Can';
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.advance(R);for(const p of G.alivePlayers(R))if(p.id!=='u0')G.pl(R,p.id).alive=false;G.advance(R);G.advance(R);
  assert.match(R.P.gazete.map(k=>k.metin).join(' | '),/Kaya'nın tuzağı Ece'yi Can'ın kapısında yakaladı/);
});

// ---------- Plan 4: oyunId ve bitiş kapanış alanları ----------
test('oyunId her maçta yeni uuid ve her günlük kaydında; bitis olayında oyuncu kapanış alanları',()=>{
  let R=fixed(['hain','doktor','deli','masum','masum']);R.g.roles.u2.mad='doktor';
  assert.match(R.P.oyunId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);const ilk=R.P.oyunId;
  assert.ok(R.log.every(e=>e.oyunId===ilk),'her kayıt oyunId taşır');
  G.act(R,'u0',{kill:'u4'});G.advance(R);G.advance(R);asil(R,'u0',['u1','u2','u3']); // gece 1 u4 ölür; gün 1 hain asılır → masumlar
  assert.strictEqual(R.P.phase,'end');const b=R.log[R.log.length-1];assert.strictEqual(b.tur,'bitis');
  const by=Object.fromEntries(b.veri.oyuncular.map(o=>[o.id,o]));
  assert.deepStrictEqual(by.u0,{id:'u0',rol_key:'hain',takim:'imp',deli_gibi:null,calinan_rol:null,sag:false,olum_gunu:1,olum_sekli:'asildi'});
  assert.deepStrictEqual(by.u4,{id:'u4',rol_key:'masum',takim:'inn',deli_gibi:null,calinan_rol:null,sag:false,olum_gunu:1,olum_sekli:'stab'});
  assert.deepStrictEqual(by.u2,{id:'u2',rol_key:'deli',takim:'inn',deli_gibi:'doktor',calinan_rol:null,sag:true,olum_gunu:null,olum_sekli:null});
  noLeak(R.P);
  // hırsız doktoru çaldı: rol_key oyun sonundaki, calinan_rol 'hirsiz' işareti
  R=fixed(['hirsiz','hain','doktor','masum','masum','masum','masum']);assert.notStrictEqual(R.P.oyunId,ilk);
  G.act(R,'u0',{ab:'u2'});G.advance(R);G.advance(R);asil(R,'u1',['u0','u3','u4','u5','u6']);
  assert.strictEqual(R.P.phase,'end');const o=Object.fromEntries(R.log[R.log.length-1].veri.oyuncular.map(o=>[o.id,o]));
  assert.deepStrictEqual([o.u0.rol_key,o.u0.takim,o.u0.calinan_rol,o.u2.olum_sekli],['doktor','inn','hirsiz','vanish']);
  // iptal olayı da oyunId taşır (P sıfırlanmadan yazılır)
  R=fixed(['hain','masum','masum','masum']);const id3=R.P.oyunId;G.endToLobby(R);const son=R.log[R.log.length-1];assert.strictEqual(son.tur,'iptal');assert.strictEqual(son.oyunId,id3);
});

// ---------- Paket 1b: hızlı ifadeler ----------
test('hızlı ifade: doğrulama, metinler, 8 sn bekleme, gün başına 4, tekilleştirme, olaylar',()=>{
  let t=1000;G.setClock(()=>t);
  try{
    const R=fixed(['hain','masum','deli','masum','masum']);R.g.roles.u2.mad='polis';
    assert.deepStrictEqual(G.hizli(R,'u1',{k:'koru',d:1,n:'a0'}).kod,'gecersiz','gece hızlı ifade yok');
    G.advance(R);assert.strictEqual(R.P.phase,'talk');
    const r1=G.hizli(R,'u1',{k:'rol',rol:'doktor',d:1,n:'a1'});assert.deepStrictEqual(r1,{ok:true});
    const son=R.P.chat[R.P.chat.length-1];assert.deepStrictEqual({id:son.id,t:son.t,kisa:son.kisa,d:son.d},{id:'u1',t:'🗣️ Rolüm: Doktor',kisa:'rol',d:1});
    const n=R.P.chat.length;assert.strictEqual(G.hizli(R,'u1',{k:'rol',rol:'doktor',d:1,n:'a1'}).kod,'tekrar');assert.strictEqual(R.P.chat.length,n,'aynı anahtar ikinci kez işlenmez');
    const b=G.hizli(R,'u1',{k:'koru',d:1,n:'a2'});assert.strictEqual(b.kod,'bekle');assert.ok(b.kalan>=1&&b.kalan<=8,'kalan sn: '+b.kalan);
    t+=9000;assert.strictEqual(G.hizli(R,'u1',{k:'koru',d:1,n:'a2'}).ok,true);assert.strictEqual(R.P.chat[R.P.chat.length-1].t,'🛡️ Beni koruyun!');
    for(const m of [{k:'x',d:1,n:'b1'},{k:'rol',rol:'yok',d:1,n:'b2'},{k:'suphe',hedef:'u1',d:1,n:'b3'},{k:'suphe',hedef:'u0',d:0,n:'b4'},{k:'suphe',d:1,n:'b5'}]){t+=9000;assert.strictEqual(G.hizli(R,'u1',m).kod,'gecersiz',JSON.stringify(m))}
    t+=9000;assert.strictEqual(G.hizli(R,'u1',{k:'suphe',hedef:'u0',d:1,n:'c1'}).ok,true);assert.strictEqual(R.P.chat[R.P.chat.length-1].t,'🤨 Oyuncu0 hakkında şüphem var.');
    t+=9000;assert.strictEqual(G.hizli(R,'u1',{k:'belirsiz',d:1,n:'c2'}).ok,true);assert.strictEqual(R.P.chat[R.P.chat.length-1].t,'🤷 Bu bilgi kesin değil.');
    t+=9000;assert.strictEqual(G.hizli(R,'u1',{k:'aciklama',d:1,n:'c3'}).kod,'gun','gün başına 4');
    // başka oyuncu etkilenmez; ölü oyuncu gönderemez
    assert.strictEqual(G.hizli(R,'u3',{k:'aciklama',d:1,n:'d1'}).ok,true);assert.strictEqual(R.P.chat[R.P.chat.length-1].t,'📣 Bir açıklama yapacağım.');
    G.pl(R,'u4').alive=false;assert.strictEqual(G.hizli(R,'u4',{k:'koru',d:1,n:'e1'}).kod,'gecersiz');
    // deli rol iddiası: algilanan_rol dolu
    assert.strictEqual(G.hizli(R,'u2',{k:'rol',rol:'polis',d:1,n:'f1'}).ok,true);
    const iddialar=R.log.filter(e=>e.tur==='iddia').map(e=>e.veri);
    assert.deepStrictEqual(iddialar,[{kim:'u1',rol_iddia:'doktor',gercek_rol:'masum',gercek_takim:'inn',algilanan_rol:null},{kim:'u2',rol_iddia:'polis',gercek_rol:'deli',gercek_takim:'inn',algilanan_rol:'polis'}]);
    const hz=R.log.filter(e=>e.tur==='hizli').map(e=>e.veri);assert.deepStrictEqual(hz,[{kim:'u1',k:'koru'},{kim:'u1',k:'suphe'},{kim:'u1',k:'belirsiz'},{kim:'u3',k:'aciklama'}],'hedef yazılmaz');
    noLeak(R.P);assert.ok(!JSON.stringify(R.P).includes('gercek_rol'));
    // yeni gün: sayaç sıfır
    G.advance(R);for(const p of G.alivePlayers(R))G.vote(R,p.id,'skip');assert.strictEqual(R.P.phase,'night');G.advance(R);assert.strictEqual(R.P.day,2);
    t+=9000;assert.strictEqual(G.hizli(R,'u1',{k:'aciklama',d:2,n:'g1'}).ok,true);
  }finally{G.setClock()}
});

test('gazete: iddia kartı — doğru/yanlış/çoklu iddia; Deli atlanır; Hırsız öncesi-sonrası; hain kopyası etiketi; sıra',()=>{
  let t=1000;G.setClock(()=>t);const soyle=(R,id,rol)=>{t+=9000;assert.strictEqual(G.hizli(R,id,{k:'rol',rol,d:R.P.day,n:id+rol+R.P.day+t}).ok,true)};
  try{
    // yanlış ve doğru iddia; Deli atlanır
    let R=fixed(['hain','masum','doktor','deli','masum','masum']);R.g.roles.u3.mad='doktor';
    G.advance(R);soyle(R,'u1','doktor');soyle(R,'u2','doktor');soyle(R,'u3','doktor');
    G.advance(R);asil(R,'u0',['u1','u2','u3','u4','u5']);assert.strictEqual(R.P.phase,'end');
    let m=R.P.gazete.map(k=>k.tur+'|'+k.metin);
    assert.match(m.join('\n'),/iddia\|🗣️ Gün 1: Oyuncu1 Doktor olduğunu söyledi; o sırada rolü Masum idi\./);
    assert.match(m.join('\n'),/iddia\|🗣️ Gün 1: Oyuncu2 Doktor olduğunu söyledi; doğruydu\./);
    assert.ok(!m.some(x=>/Oyuncu3 Doktor olduğunu söyledi/.test(x)),'Deli iddiası blöf sayılmaz');assert.strictEqual(m[0].split('|')[0],'deli');
    assert.deepStrictEqual(m.map(x=>x.split('|')[0]),['deli','iddia','iddia']);
    // çoklu iddia (hain: önce Masum sonra Doktor) ve hain kopyası etiketi
    R=fixed(['hain','polis_h','masum','masum','masum','masum','masum']);
    G.advance(R);soyle(R,'u0','masum');soyle(R,'u1','polis');G.advance(R);asil(R,'u2',['u0','u1','u3','u4']); // gün 1: u2 asılır
    G.advance(R);soyle(R,'u0','doktor');G.advance(R);asil(R,'u0',['u1','u3','u4','u5','u6']); // gün 2: u0 asılır
    G.act(R,'u1',{kill:'u3'});G.advance(R);G.advance(R);asil(R,'u1',['u4','u5','u6']);assert.strictEqual(R.P.phase,'end');
    m=R.P.gazete.map(k=>k.metin).join('\n');
    assert.match(m,/🗣️ Oyuncu0 önce Masum, sonra Doktor olduğunu söyledi; o sırada rolü Hain idi\./);
    assert.match(m,/🗣️ Gün 1: Oyuncu1 Polis olduğunu söyledi; o sırada rolü Polis \(Hain\) idi\./);
    // hırsız: çalmadan önce "Hırsız", çaldıktan sonra "Doktor" → ikisi de kendi anındaki rolle; son iddia doğru
    R=fixed(['hirsiz','hain','doktor','masum','masum','masum','masum']);
    G.advance(R);soyle(R,'u0','hirsiz');G.advance(R);asil(R,'u3',['u0','u1','u2','u4']);G.act(R,'u0',{ab:'u2'});G.advance(R);assert.strictEqual(R.g.roles.u0.key,'doktor');
    soyle(R,'u0','doktor');G.advance(R);asil(R,'u1',['u0','u4','u5','u6']);assert.strictEqual(R.P.phase,'end');
    m=R.P.gazete.map(k=>k.metin).join('\n');
    assert.match(m,/🗣️ Oyuncu0 önce Hırsız, sonra Doktor olduğunu söyledi; doğruydu\./); // son iddia o anki rolle (çalınmış Doktor) eşleşir
  }finally{G.setClock()}
});

test('rol rehberi: her rolün kısa ipucu metni var (10–120 karakter)',()=>{
  for(const [k,r] of Object.entries(G.ROLES))assert.ok(typeof r.ipucu==='string'&&r.ipucu.length>=10&&r.ipucu.length<=120,'ipucu yok/uzun: '+k);
});

test('inceleme: A→B→A iddia sırası son iddiayla biter; yanlış iddialar doğrulardan önce; $ içeren ad metni bozmaz',()=>{
  let t=1000;G.setClock(()=>t);const soyle=(R,id,rol)=>{t+=9000;assert.strictEqual(G.hizli(R,id,{k:'rol',rol,d:R.P.day,n:id+rol+R.P.day+t}).ok,true)};
  try{
    let R=fixed(['hain','doktor','masum','masum','masum','masum']);
    G.advance(R);soyle(R,'u1','doktor');soyle(R,'u1','masum');soyle(R,'u1','doktor');soyle(R,'u2','polis');
    G.advance(R);asil(R,'u0',['u1','u2','u3','u4','u5']);assert.strictEqual(R.P.phase,'end');
    const m=R.P.gazete.filter(k=>k.tur==='iddia').map(k=>k.metin);
    assert.match(m.join('\n'),/Oyuncu1 önce Masum, sonra Doktor olduğunu söyledi; doğruydu\./,'sıra son iddiayla bitmeli: '+m.join(' | '));
    assert.match(m[0],/Oyuncu2 Polis olduğunu söyledi; o sırada rolü Masum idi/,'yanlış iddia önce gelir');
    R=fixed(['hain','masum','masum','masum']);R.P.players.find(p=>p.id==='u0').name="$`$'";G.advance(R);
    assert.strictEqual(G.hizli(R,'u1',{k:'suphe',hedef:'u0',d:1,n:'z1'}).ok,true);assert.strictEqual(R.P.chat[R.P.chat.length-1].t,"🤨 $`$' hakkında şüphem var.");
    assert.ok(!/koruyabilirsin/.test(G.ROLES.doktor.ipucu),'doktor kendini koruyamaz (istemcide yol yok); ipucu bunu söylemesin');
  }finally{G.setClock()}
});

// ---------- İlerleme (Task 1): katalog, kasa ödülü, rozetler ----------
test('9 kişi: Masum yok, serbest yuva Tuzakçı/Provokatör ya da ikinci bilgi rolü (kullanıcı 2026-10-27)',()=>{
  let td=0;const N=4000;for(let i=0;i<N;i++){const c=G.autoSetup(9);assert.ok(!c.masum,'masum yok');if(c.tuzakci||c.provokator)td++}
  assert.ok(Math.abs(td/N*100-40)<4,'Tuzakçı/Provokatör sıklığı ~%40: %'+(td/N*100).toFixed(1));
});
test('katalog: eşyalar, kozmetikler, nadirlik, kasa ağırlıkları, rozetler tanımlı',()=>{
  assert.deepStrictEqual(Object.keys(G.ESYA).sort(),['duman','fener','fis','iksir','kilit','kum','maske','pusula','vasiyet','zar']);
  for(const e of Object.values(G.ESYA)){assert.ok(typeof e.nasil==='string'&&e.nasil.length>20,'nasıl kullanılır metni: '+e.n);assert.ok(e.n&&e.ico&&e.desc&&['night','talk','vote','pasif','none'].includes(e.faz)&&G.NADIRLIK[e.nadir],JSON.stringify(e))}
  assert.deepStrictEqual(Object.keys(G.ESYA).filter(k=>G.ESYA[k].hedef).sort(),['kilit','pusula']);
  assert.deepStrictEqual(Object.keys(G.ESYA).filter(k=>G.ESYA[k].pasif).sort(),['iksir','vasiyet']);
  assert.deepStrictEqual(G.ESYA_KATMAN('siradan').sort(),['fis','kum','pusula','zar']);assert.deepStrictEqual(G.ESYA_KATMAN('nadir').sort(),['duman','fener','iksir','maske','vasiyet']);
  assert.deepStrictEqual(G.ESYA_KATMAN('efsanevi'),['kilit']);assert.strictEqual(G.ESYA_YUVA,2);
  assert.deepStrictEqual(G.KASA_ESYA,{siradan:50,nadir:40,efsanevi:10});assert.deepStrictEqual(G.PAKET,{sans:0.6,sure:5000,nadirP:0.25,maxMac:3,uzat:30000});
  assert.deepStrictEqual(Object.keys(G.KOZMETIK).sort(),['bayrak','efekt','ev','sapka']);
  assert.strictEqual(Object.keys(G.KOZMETIK.sapka).length,9);assert.strictEqual(Object.keys(G.KOZMETIK.bayrak).length,9);assert.strictEqual(Object.keys(G.KOZMETIK.efekt).length,4);
  for(const tur of Object.values(G.KOZMETIK))for(const k of Object.values(tur))assert.ok(k.n&&G.NADIRLIK[k.nadir],JSON.stringify(k));
  for(const k of Object.keys(G.KOZMETIK.sapka))assert.ok(!G.HATS.includes(k),'premium şapka temel listede olmamalı: '+k);
  assert.deepStrictEqual(G.NADIRLIK,{siradan:{fiyat:25,donusum:6},nadir:{fiyat:70,donusum:18},efsanevi:{fiyat:180,donusum:45}});
  assert.deepStrictEqual(G.KASA,{esya:50,yildiz:12,siradan:25,nadir:10,efsanevi:3});
  for(const r of Object.values(G.ROZETLER))assert.ok(r.n&&r.ico&&r.desc);
  for(const k of ['ilk_mac','mac_10','mac_50','kurtarici','bekci','tuzak_ustasi','hain_zafer','masum_zafer','sag_kalan','tek_kurt','hortlak_zafer','yildirim','iksir_kurtardi','fener_gordu'])assert.ok(G.ROZETLER[k],k);
});
test('ev kozmetiği: en az 80 ev, adlar kısa, nadirlik geçerli; çizim dosyasıyla birebir; resimli evlerin dosyası var',()=>{
  const EV=G.KOZMETIK.ev,E=require('../../sayfa/evler.js'),fs=require('fs'),path=require('path');
  assert.ok(Object.keys(EV).length>=80,'ev sayısı '+Object.keys(EV).length);
  for(const [k,v] of Object.entries(EV)){assert.ok(/^[a-z0-9-]+$/.test(k),k);assert.ok(v.n&&v.n.length<=18,'ad '+k+': '+v.n);assert.ok(G.NADIRLIK[v.nadir],k)}
  assert.deepStrictEqual(Object.keys(EV).sort(),E.anahtarlar().sort(),'game.js kataloğu ve evler.js çizimleri aynı anahtarlar');
  for(const k of E.resimler())assert.ok(fs.existsSync(path.join(__dirname,'../../sayfa/ev',k+'.webp')),'resim dosyası '+k);
  for(const k of E.resimler()){const m=E.model(k);if(m.isik)assert.ok(fs.existsSync(path.join(__dirname,'../../sayfa/ev',k+'-isik.webp')),'ışık dosyası '+k)}
  assert.strictEqual(E.model('constructor'),null);assert.strictEqual(E.model('__proto__'),null);
  const say={siradan:0,nadir:0,efsanevi:0};for(const v of Object.values(EV))say[v.nadir]++;assert.ok(say.siradan>=25&&say.nadir>=20&&say.efsanevi>=10,JSON.stringify(say));
  assert.strictEqual(G.kozmetikGecerli('ev','none',new Set()),true,'varsayılan ev herkese');assert.strictEqual(G.kozmetikGecerli('ev','fici',new Set()),false);assert.strictEqual(G.kozmetikGecerli('ev','fici',new Set(['ev:fici'])),true);
  for(const k of E.anahtarlar()){const m=E.model(k);assert.ok(m&&m.silu&&m.golge&&typeof m.ust==='number'&&typeof m.ciz==='function',k)}
});
test('kasaOdulu kozmetik: tür ağırlığı öğe sayısının karekökü (evler baskın, tek öğeli tür şişmez)',()=>{
  for(const nadir of ['siradan','nadir','efsanevi']){
    const say={};let n=0;for(let i=0;i<60000;i++){const o=G.kasaOdulu();if(o.tur!=='kozmetik'||o.nadir!==nadir)continue;n++;const t=o.key.split(':')[0];say[t]=(say[t]||0)+1}
    const sayi=t=>Object.values(G.KOZMETIK[t]).filter(v=>v.nadir===nadir).length;const turler=Object.keys(G.KOZMETIK).filter(t=>sayi(t)>0);const top=turler.reduce((a,t)=>a+Math.sqrt(sayi(t)),0);
    for(const t of turler)assert.ok(Math.abs(say[t]/n-Math.sqrt(sayi(t))/top)<0.035,nadir+' '+t+' %'+(100*say[t]/n).toFixed(1)+' beklenen %'+(100*Math.sqrt(sayi(t))/top).toFixed(1));
    if(nadir==='siradan')assert.ok(say.efekt/n<0.15,'tek sıradan efekt (Yaprak) şişmez: %'+(100*say.efekt/n).toFixed(1));
  }
});
test('kasaOdulu: her dal ve oranlar',()=>{
  const seq=a=>{let i=0;return()=>a[i++%a.length]};
  assert.strictEqual(G.kasaOdulu(seq([0.0,0.5])).tur,'esya');
  const y=G.kasaOdulu(seq([0.55,0.5]));assert.strictEqual(y.tur,'yildiz');assert.ok(y.adet>=6&&y.adet<=10);
  const k1=G.kasaOdulu(seq([0.70,0.1]));assert.strictEqual(k1.tur,'kozmetik');assert.strictEqual(k1.nadir,'siradan');assert.match(k1.key,/^(sapka|bayrak|efekt|ev):/);
  assert.strictEqual(G.kasaOdulu(seq([0.90,0.1])).nadir,'nadir');assert.strictEqual(G.kasaOdulu(seq([0.99,0.1])).nadir,'efsanevi');
  const say={};for(let i=0;i<10000;i++){const o=G.kasaOdulu();const k=o.tur==='kozmetik'?o.nadir:o.tur;say[k]=(say[k]||0)+1}
  for(const [k,w] of Object.entries(G.KASA))assert.ok(Math.abs(say[k]/100-w)<2.5,k+' %'+say[k]/100);
  for(let i=0;i<500;i++){const o=G.kasaOdulu();if(o.tur==='esya')assert.ok(G.ESYA[o.key]&&o.adet===1);if(o.tur==='kozmetik'){const [t,k]=o.key.split(':');assert.strictEqual(G.KOZMETIK[t][k].nadir,o.nadir)}}
});
test('eşya çekilişleri 2: bedava havuz sıradan+zar, paket %25 nadir, zar nadir verir, kasa katmanları 50/40/10, setRnd',()=>{
  const say=(f,n)=>{const c={};for(let i=0;i<n;i++){const k=f();c[k]=(c[k]||0)+1}return c};
  const b=say(()=>G.bedavaEsya(),10000);assert.deepStrictEqual(Object.keys(b).sort(),['fis','kum','pusula','zar']);
  for(const k of Object.keys(b))assert.ok(Math.abs(b[k]/100-25)<2.5,k+' %'+b[k]/100);
  const p=say(()=>G.paketEsya(),10000);let nadir=0;for(const [k,n] of Object.entries(p)){assert.notStrictEqual(G.ESYA[k].nadir,'efsanevi',k);if(G.ESYA[k].nadir==='nadir')nadir+=n}
  assert.ok(Math.abs(nadir/100-25)<2.5,'paket nadir %'+nadir/100);assert.ok(p.zar>0,'paket zar çıkarır');
  const z=say(()=>G.zarAt(),2000);assert.deepStrictEqual(Object.keys(z).sort(),G.ESYA_KATMAN('nadir').sort());
  const kk={};let esyaN=0;for(let i=0;i<20000;i++){const o=G.kasaOdulu();if(o.tur!=='esya')continue;esyaN++;assert.notStrictEqual(o.key,'zar');const t=G.ESYA[o.key].nadir;kk[t]=(kk[t]||0)+1}
  for(const [t,w] of Object.entries(G.KASA_ESYA))assert.ok(Math.abs(kk[t]/esyaN*100-w)<2.5,t+' %'+(kk[t]/esyaN*100).toFixed(1));
  G.setRnd(()=>0);try{assert.strictEqual(G.bedavaEsya(),'fis');assert.strictEqual(G.paketEsya(),G.ESYA_KATMAN('nadir')[0]);assert.strictEqual(G.zarAt(),G.ESYA_KATMAN('nadir')[0]);assert.strictEqual(G.kasaOdulu().tur,'esya')}finally{G.setRnd(null)}
  G.setRnd(()=>0.999);try{assert.strictEqual(G.bedavaEsya(),'zar');assert.strictEqual(G.paketEsya(),'zar')}finally{G.setRnd(null)}
});
test('kozmetikGecerli: temel şapka herkese, premium yalnız sahibine',()=>{
  const sahip=new Set(['sapka:tac','bayrak:mavi']);
  assert.strictEqual(G.kozmetikGecerli('sapka','cap',new Set()),true);assert.strictEqual(G.kozmetikGecerli('sapka','tac',new Set()),false);
  assert.strictEqual(G.kozmetikGecerli('sapka','tac',sahip),true);assert.strictEqual(G.kozmetikGecerli('bayrak','mavi',sahip),true);
  assert.strictEqual(G.kozmetikGecerli('bayrak','none',new Set()),true);assert.strictEqual(G.kozmetikGecerli('efekt','none',new Set()),true);
  assert.strictEqual(G.kozmetikGecerli('bayrak','yok-boyle',sahip),false);assert.strictEqual(G.kozmetikGecerli('sapka','constructor',sahip),false);
});
test('rozetlerFor: günlükten — kurtarıcı, bekçi, tuzak ustası, zafer rozetleri, yıldırım',()=>{
  let R=fixed(['hain','doktor','polis','tuzakci','masum','masum']);
  G.act(R,'u0',{kill:'u4'});G.act(R,'u1',{ab:'u4'});G.act(R,'u2',{ab:'u0'});G.act(R,'u3',{ab:'u5'});G.advance(R); // polis haini tutar → kimse ölmez
  G.advance(R);for(const id of ['u1','u2','u3','u4','u5'])G.vote(R,id,'u0');G.vote(R,'u0','skip');
  assert.strictEqual(R.P.phase,'end');
  assert.ok(G.rozetlerFor(R,'u2').includes('bekci'),'polis haini tuttu');assert.ok(G.rozetlerFor(R,'u2').includes('masum_zafer'));assert.ok(G.rozetlerFor(R,'u2').includes('sag_kalan'));
  assert.ok(!G.rozetlerFor(R,'u0').includes('hain_zafer'));
  R=fixed(['hain','doktor','masum','masum','masum']);G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.advance(R);
  assert.ok(G.rozetlerFor(R,'u1').includes('kurtarici'));
  R=fixed(['hain','tuzakci','masum','masum','masum']);G.act(R,'u1',{ab:'u2'});G.act(R,'u0',{kill:'u2'});G.advance(R);
  assert.ok(G.rozetlerFor(R,'u1').includes('tuzak_ustasi'));
  R=fixed(['hain','buyucu','doktor','masum','masum']);G.act(R,'u1',{ab:'u3',guess:'masum'});G.advance(R);
  assert.ok(G.rozetlerFor(R,'u1').includes('yildirim'));assert.deepStrictEqual(G.rozetlerFor(R,'u3'),[],'ölen masum, oyun sürüyor: rozet yok');
  R=fixed(['hain','masum','masum','masum']);G.act(R,'u0',{kill:'u1'});G.advance(R);G.advance(R);for(const id of ['u0','u2','u3'])G.vote(R,id,'skip');G.act(R,'u0',{kill:'u2'});G.advance(R);
  assert.strictEqual(R.P.phase,'end');assert.ok(G.rozetlerFor(R,'u0').includes('hain_zafer'));
});

// ---------- İlerleme (Task 2): eşya modu ----------
// belirtilmeyen oyuncular 'fis' taşır (bedava çekiliş rastgele; zar nadir eşyaya dönüp testi bozmasın)
function esyali(roles,esyalar){const R=G.createGame({night:30,talk:120,vote:45,esyaModu:true});const tam={};roles.forEach((_,i)=>tam['u'+i]='fis');Object.assign(tam,esyalar);
  G.startGame(R,lobbyOf(roles.length),{esyalar:Object.fromEntries(Object.entries(tam).map(([id,k])=>[id,{key:k,kaynak:'envanter'}]))});
  roles.forEach((k,i)=>{const e=G.SETUP.find(x=>x.id===k);R.g.roles['u'+i]={key:e.key,team:e.team,mad:null,uses:{},vest:3,planted:[]}});return R}
const haber=R=>(R.P.morning&&R.P.morning.news||[]).join(' | ');
const gs=R=>R.gameLog.filter(e=>e.tur==='gece_sonuc').pop().veri;
test('eşya modu kapalı: eşya yok, olaylarda esyalar [] ve fis null, ayar false',()=>{
  const R=fixed(['hain','doktor','masum','masum','masum']);assert.strictEqual(R.P.settings.esyaModu,false);assert.ok(!R.g.esya||!Object.keys(R.g.esya).length);
  G.act(R,'u0',{kill:'u2',esya:'fener'});G.advance(R);assert.deepStrictEqual(gs(R).esyalar,[]);
  assert.strictEqual(G.esyaKullan(R,'u0','kum'),false);
  G.advance(R);for(const id of ['u0','u1','u3','u4'])G.vote(R,id,'skip',null,null,true);
  const v=R.gameLog.find(e=>e.tur==='gunduz_sonuc').veri;assert.strictEqual(v.fis,null);assert.strictEqual(v.kum,false);assert.strictEqual(v.vasiyet,null);assert.strictEqual(G.privFor(R,'u0').esya,null);
  assert.strictEqual(G.cleanSettings({esyaModu:true}).esyaModu,true);assert.strictEqual(G.cleanSettings({esyaModu:'evet'}).esyaModu,false);assert.strictEqual(G.cleanSettings({}).esyaModu,false);
});
test('eşya dağıtımı 2: herkese tek eşyalı dizi; seçilen envanterden, geçersiz/eksik bedava havuzdan; zar nadir eşyaya döner; priv dizi; P gizli',()=>{
  const R=esyali(['hain','masum','masum','masum','masum'],{u0:'iksir',u1:'yok-boyle',u3:'zar'});
  for(let i=0;i<5;i++){const e=R.g.esya['u'+i];assert.ok(Array.isArray(e)&&e.length===1&&G.ESYA[e[0].key],'u'+i);assert.strictEqual(e[0].kullanildi,false)}
  assert.deepStrictEqual(R.g.esya.u0,[{key:'iksir',kaynak:'envanter',kullanildi:false}]);assert.strictEqual(R.g.esya.u1[0].kaynak,'bedava');assert.strictEqual(R.g.esya.u2[0].kaynak,'envanter');
  assert.ok(['fis','kum','pusula'].includes(R.g.esya.u1[0].key)||R.g.esya.u1[0].zar,'bedava havuz sıradan (zar dönüşmüş olabilir)');
  const z=R.g.esya.u3[0];assert.strictEqual(G.ESYA[z.key].nadir,'nadir');assert.strictEqual(z.zar,true);assert.strictEqual(z.kaynak,'envanter');assert.strictEqual(z.kaynakKey,'zar');assert.deepStrictEqual(G.esyaKullanimi(R).u3,[{key:'zar',kaynak:'envanter',kullanildi:false}],'düşüm özgün anahtarla');assert.match(R.g.notes.u3.join(' | '),/🎲 Zar: .* çıktı/);
  assert.deepStrictEqual(G.privFor(R,'u0').esya,[{key:'iksir',kullanildi:false,pasif:true,hedefli:false}]);noLeak(R.P);assert.strictEqual(R.P.settings.esyaModu,true);
  assert.deepStrictEqual(Object.keys(G.privFor(R,'u3').esya[0]).sort(),['hedefli','key','kullanildi','pasif']);
  R.g.esya.u2.push({key:'kilit',kaynak:'paket',kullanildi:false});assert.strictEqual(G.privFor(R,'u2').esya.length,2);assert.deepStrictEqual(G.privFor(R,'u2').esya[1],{key:'kilit',kullanildi:false,pasif:false,hedefli:true});
});
test('eski biçim act{esya:true} yok sayılır; sahip olunmayan / fazı uymayan eşya harcanmaz',()=>{
  const R=esyali(['hain','masum','masum','masum','masum'],{u1:'fener',u2:'fis'});
  G.act(R,'u1',{esya:true});G.act(R,'u2',{esya:'fis'});G.act(R,'u3',{esya:'fener'});G.advance(R);
  assert.deepStrictEqual(gs(R).esyalar,[]);assert.strictEqual(R.g.esya.u1[0].kullanildi,false);assert.strictEqual(R.g.esya.u2[0].kullanildi,false);assert.ok(!/fener/.test(haber(R)));
});
test('iksir pasif: saldırıda kendiliğinden harcanır ve haber; saldırısız gece harcanmaz; Doktor önce; iki saldırı tek harcama',()=>{
  let R=esyali(['hain','masum','masum','masum','masum'],{u1:'iksir'});
  G.act(R,'u0',{kill:'u1'});G.advance(R);
  assert.ok(G.pl(R,'u1').alive);assert.match(haber(R),/Bu gece biri iksir içti ve saldırıdan sağ çıktı/);assert.ok(!/u1|Oyuncu1/.test(haber(R)),'kullanan gizli');
  assert.deepStrictEqual(gs(R).esyalar,[{kim:'u1',key:'iksir',etki:'korudu',hedef:null}]);assert.strictEqual(R.g.esya.u1[0].kullanildi,true);assert.ok(G.rozetlerFor(R,'u1').includes('iksir_kurtardi'));
  G.advance(R);for(const id of ['u0','u1','u2','u3','u4'])G.vote(R,id,'skip');
  G.act(R,'u0',{kill:'u1'});G.advance(R);assert.ok(!G.pl(R,'u1').alive,'ikinci kez iksir yok');
  R=esyali(['hain','masum','masum','masum','masum'],{u1:'iksir'});G.act(R,'u0',{kill:'u2'});G.advance(R);
  assert.strictEqual(R.g.esya.u1[0].kullanildi,false,'saldırı yoksa harcanmaz');assert.ok(!/iksir/.test(haber(R)));assert.deepStrictEqual(gs(R).esyalar,[]);
  R=esyali(['hain','doktor','masum','masum','masum'],{u2:'iksir'});
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.advance(R);
  assert.ok(G.pl(R,'u2').alive);assert.match(haber(R),/Doktor kurtardı/);assert.ok(!/iksir/.test(haber(R)),'Doktor kurtardıysa iksir kalır');assert.strictEqual(R.g.esya.u2[0].kullanildi,false);
  assert.deepStrictEqual(gs(R).esyalar,[]);assert.ok(G.rozetlerFor(R,'u1').includes('kurtarici'));assert.ok(!G.rozetlerFor(R,'u2').includes('iksir_kurtardi'));
  R=esyali(['hain','serikatil','masum','masum','masum','masum','masum','masum','masum'],{u2:'iksir'});
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.advance(R);
  assert.ok(G.pl(R,'u2').alive,'iki saldırıdan da korur');assert.strictEqual(gs(R).esyalar.filter(e=>e.key==='iksir').length,1,'tek kayıt');assert.strictEqual((haber(R).match(/iksir içti/g)||[]).length,1);
});
test('inceleme düzeltmeleri: iki iksir aynı gece tek harcanır; asılan Hortlak\'ın vasiyeti hayalet hedefini söylemez',()=>{
  let R=esyali(['hain','serikatil','masum','masum','masum','masum','masum','masum','masum'],{u2:'iksir'});R.g.esya.u2.push({key:'iksir',kaynak:'paket',kullanildi:false});
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.advance(R);
  assert.ok(G.pl(R,'u2').alive);assert.deepStrictEqual(R.g.esya.u2.map(e=>e.kullanildi),[true,false],'ikinci iksir kalır');
  assert.strictEqual(gs(R).esyalar.filter(e=>e.key==='iksir').length,1);assert.strictEqual((haber(R).match(/iksir içti/g)||[]).length,1);
  R=esyali(['hain','hortlak','masum','masum','masum'],{u1:'vasiyet'});G.act(R,'u1',{ab:'u3'});G.advance(R);G.advance(R);
  for(const id of ['u0','u2','u3','u4'])G.vote(R,id,'u1');G.vote(R,'u1','skip');
  assert.ok(!G.pl(R,'u1').alive);assert.match(R.P.evening.summary,/vasiyeti/);assert.ok(!/hayalet|gideceksin/.test(R.P.evening.summary),'hayalet hedefi sızmaz: '+R.P.evening.summary);
  assert.ok(R.g.haunt&&R.g.haunt.t==='u3','hortlak intikamı yine kurulur');
});
test('fener: kapına gelenlerin adları; hain geldiyse etki ve rozet',()=>{
  const R=esyali(['hain','doktor','masum','masum','masum'],{u2:'fener'});
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.act(R,'u2',{esya:'fener'});G.advance(R);
  const n=R.g.notes.u2.join(' | ');assert.match(n,/Fenerinle gördün: evine .*Oyuncu0/);assert.match(n,/Oyuncu1/);
  assert.match(haber(R),/Bu gece biri fenerle bekledi/);assert.deepStrictEqual(gs(R).esyalar,[{kim:'u2',key:'fener',etki:'hain_gordu',hedef:null}]);assert.ok(G.rozetlerFor(R,'u2').includes('fener_gordu'));
  const R2=esyali(['hain','masum','masum','masum','masum'],{u3:'fener'});G.act(R2,'u3',{esya:'fener'});G.advance(R2);assert.match(R2.g.notes.u3.join(' | '),/Fenerinle gördün: evine kimse gelmedi/);
});
test('duman: Gözcü sayısından, İzci\'den ve pusuladan düşer, günlükte gerçek ziyaret kalır',()=>{
  const R=esyali(['hain','gozcu','izci','masum','masum'],{u0:'duman',u4:'pusula'});
  G.act(R,'u0',{kill:'u3',esya:'duman'});G.act(R,'u1',{ab:'u3'});G.act(R,'u2',{ab:'u0'});G.act(R,'u4',{esya:'pusula',esyaHedef:'u0'});G.advance(R);
  assert.ok(!G.pl(R,'u3').alive,'duman saldırıyı engellemez');
  assert.match(R.g.notes.u1.join(' | '),/Oyuncu3 evine bu gece 1 kişi geldi/,'yalnız gözcünün kendisi sayılır');
  assert.match(R.g.notes.u2.join(' | '),/Oyuncu0 gece evinden çıkmadı/);assert.match(R.g.notes.u4.join(' | '),/Pusula: Oyuncu0 bu gece evinden çıkmadı/);assert.match(haber(R),/Bu gece kasabada duman vardı/);
  assert.ok(gs(R).ziyaretler.u3.includes('u0'),'gizli günlük gerçek ziyareti tutar');
});
test('maske: Dedektif ve İspiyoncu Masum görür',()=>{
  const R=esyali(['hain','dedektif','ispiyoncu','masum','masum'],{u0:'maske'});
  G.act(R,'u0',{esya:'maske'});G.act(R,'u1',{ab:'u0'});G.act(R,'u2',{ab:'u0'});G.advance(R);
  assert.match(R.g.notes.u1.join(' | '),/Oyuncu0 şunlardan biri: .*Masum/);assert.match(haber(R),/Oyuncu0 = Masum/);assert.match(haber(R),/Bu gece biri maske taktı/);
});
test('pusula: hedef evinden çıktı mı; tutulan çıkmadı; sahibi ziyaret sayılmaz; kendi/ölü hedef yok sayılır',()=>{
  let R=esyali(['hain','gozcu','masum','masum','masum'],{u2:'pusula'});
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u2'});G.act(R,'u2',{esya:'pusula',esyaHedef:'u0'});G.advance(R);
  assert.match(R.g.notes.u2.join(' | '),/Pusula: Oyuncu0 bu gece evinden çıktı/);assert.match(haber(R),/🧭 Bu gece biri pusulaya baktı/);assert.ok(!/Oyuncu2/.test(haber(R)));
  assert.deepStrictEqual(gs(R).esyalar,[{kim:'u2',key:'pusula',etki:'cikti',hedef:'u0'}]);assert.match(R.g.notes.u1.join(' | '),/Oyuncu2 evine bu gece 1 kişi geldi/,'pusula ziyaret değil: yalnız Gözcü kendisi sayılır');
  assert.ok(!gs(R).ziyaretler.u0.includes('u2'));
  R=esyali(['hain','polis','masum','masum','masum'],{u2:'pusula'});
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u0'});G.act(R,'u2',{esya:'pusula',esyaHedef:'u0'});G.advance(R);
  assert.match(R.g.notes.u2.join(' | '),/Oyuncu0 bu gece evinden çıkmadı/);assert.strictEqual(gs(R).esyalar[0].etki,'cikmadi');
  R=esyali(['hain','masum','masum','masum','masum'],{u2:'pusula'});G.act(R,'u2',{esya:'pusula',esyaHedef:'u2'});G.advance(R);
  assert.strictEqual(R.g.esya.u2[0].kullanildi,false,'kendi evi yok sayılır');assert.deepStrictEqual(gs(R).esyalar,[]);
  G.advance(R);for(const id of ['u0','u1','u2','u3','u4'])G.vote(R,id,'u4');G.act(R,'u2',{esya:'pusula',esyaHedef:'u4'});G.advance(R);
  assert.strictEqual(R.g.esya.u2[0].kullanildi,false,'ölü hedef yok sayılır');
});
test('kilit: hedef hamle yapamaz (hain öldüremez), notlar ve anonim haber; Seri Katil durdurulamaz ve sessiz; Polis sahibini tutsa da işler',()=>{
  let R=esyali(['hain','masum','masum','masum','masum'],{u1:'kilit'});
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{esya:'kilit',esyaHedef:'u0'});G.advance(R);
  assert.ok(G.pl(R,'u2').alive,'kilitli hain öldüremedi');assert.match(R.g.notes.u0.join(' | '),/Bu gece kapın kilitliydi, evden çıkamadın/);assert.match(R.g.notes.u1.join(' | '),/Kapıyı kilitledin: Oyuncu0/);
  assert.match(haber(R),/🔒 Bu gece birinin kapısı kilitlendi/);assert.ok(!/Oyuncu1|Oyuncu0/.test(haber(R).split('🔒')[1]));assert.match(haber(R),/Sakin bir gece/);
  assert.deepStrictEqual(gs(R).esyalar,[{kim:'u1',key:'kilit',etki:'kilitledi',hedef:'u0'}]);assert.deepStrictEqual(gs(R).tutulan,[],'kilit Polis tutması sayılmaz');assert.ok(!G.rozetlerFor(R,'u1').includes('bekci'));
  R=esyali(['hain','serikatil','masum','masum','masum','masum','masum','masum','masum'],{u2:'kilit'});
  G.act(R,'u1',{ab:'u3'});G.act(R,'u2',{esya:'kilit',esyaHedef:'u1'});G.advance(R);
  assert.ok(!G.pl(R,'u3').alive,'Seri Katil durdurulamaz');assert.match(R.g.notes.u2.join(' | '),/Kapıyı kilitledin: Oyuncu1/);assert.ok(!/kilitliydi/.test(R.g.notes.u1.join(' | ')));
  assert.strictEqual(gs(R).esyalar[0].etki,'durduramadi');assert.match(haber(R),/🔒 Bu gece birinin kapısı kilitlendi/);assert.strictEqual(R.g.esya.u2[0].kullanildi,true);
  R=esyali(['hain','polis','masum','masum','masum'],{u2:'kilit'});
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u2'});G.act(R,'u2',{esya:'kilit',esyaHedef:'u0'});G.advance(R);
  assert.ok(G.pl(R,'u3').alive,'tutulan sahibin kilidi yine işler');assert.ok(gs(R).tutulan.includes('u2'));
  R=esyali(['hain','polis','masum','masum','masum'],{u2:'kilit'});
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u0'});G.act(R,'u2',{esya:'kilit',esyaHedef:'u1'});G.advance(R);
  assert.ok(!G.pl(R,'u3').alive,'kilitli Polis tutamadı, hain öldürdü');assert.deepStrictEqual(gs(R).tutulan,[]);
});
test('vasiyet pasif: gece ölümünde o gecenin notları sabah adla; asılmada oylama özetinde; not yoksa boştu; ölümle harcanır',()=>{
  let R=esyali(['hain','gozcu','masum','masum','masum'],{u1:'vasiyet'});
  G.act(R,'u0',{kill:'u1'});G.act(R,'u1',{ab:'u3'});G.advance(R);
  assert.ok(!G.pl(R,'u1').alive);assert.match(haber(R),/📜 Oyuncu1'in vasiyeti: Oyuncu3 evine bu gece 1 kişi geldi\./);assert.strictEqual(R.g.esya.u1[0].kullanildi,true);
  assert.deepStrictEqual(gs(R).esyalar,[{kim:'u1',key:'vasiyet',etki:'okundu',hedef:null}]);
  R=esyali(['hain','masum','masum','masum','masum'],{u1:'vasiyet'});G.act(R,'u0',{kill:'u2'});G.advance(R);
  assert.strictEqual(R.g.esya.u1[0].kullanildi,false,'ölmedi, harcanmadı');assert.ok(!/vasiyet/.test(haber(R)));
  G.advance(R);for(const id of ['u0','u3','u4'])G.vote(R,id,'u1');G.vote(R,'u1','skip');
  assert.ok(!G.pl(R,'u1').alive);assert.match(R.P.evening.summary,/📜 Oyuncu1'in vasiyeti boştu/);assert.strictEqual(R.g.esya.u1[0].kullanildi,true);
  const v=R.gameLog.filter(e=>e.tur==='gunduz_sonuc').pop().veri;assert.deepStrictEqual(v.vasiyet,{kim:'u1'});assert.strictEqual(v.kum,false);
});
test('kum saati: tartışma 30 sn uzar, sohbette anonim satır, günde bir kez; gece/oylamada ve sahipsizde false',()=>{
  const R=esyali(['hain','masum','masum','masum','masum'],{u1:'kum',u2:'kum'});
  assert.strictEqual(G.esyaKullan(R,'u1','kum'),false,'gece');G.advance(R);
  const once=R.P.ends,n0=R.P.chat.length;assert.strictEqual(G.esyaKullan(R,'u3','kum'),false,'sahibi değil');assert.strictEqual(G.esyaKullan(R,'u1','fis'),false);
  assert.strictEqual(G.esyaKullan(R,'u1','kum'),true);assert.strictEqual(R.P.ends,once+30000);assert.strictEqual(R.g.esya.u1[0].kullanildi,true);
  const son=R.P.chat[R.P.chat.length-1];assert.strictEqual(R.P.chat.length,n0+1);assert.ok(son.sys&&/⏳ Biri kum saatini çevirdi: \+30 sn/.test(son.t)&&!/Oyuncu1/.test(son.t));
  assert.strictEqual(G.esyaKullan(R,'u2','kum'),false,'aynı gün ikinci');assert.strictEqual(R.P.ends,once+30000);assert.strictEqual(R.g.esya.u2[0].kullanildi,false);
  assert.strictEqual(G.esyaKullan(R,'u1','kum'),false,'harcanmış');G.advance(R);assert.strictEqual(G.esyaKullan(R,'u2','kum'),false,'oylamada');
  for(const id of ['u0','u1','u2','u3','u4'])G.vote(R,id,'skip');assert.strictEqual(R.gameLog.filter(e=>e.tur==='gunduz_sonuc').pop().veri.kum,true);
  G.advance(R);assert.strictEqual(R.P.phase,'talk');assert.strictEqual(G.esyaKullan(R,'u2','kum'),true,'ertesi gün yine');
});
test('meydan paketi: tartışmada planlanır, zamanında açılır (tür+sayı+süre açık), ilk dokunan alır, anonim kapanış satırı ve olay',()=>{
  let t=1000;G.setClock(()=>t);G.setRnd(()=>0.1);
  try{
    let R=esyali(['hain','masum','masum','masum','masum'],{});assert.ok(!R.g.paket,'gece planlanmaz');
    G.advance(R);assert.strictEqual(R.P.phase,'talk');const pk=R.g.paket;assert.ok(pk&&!pk.acik&&pk.keys.length===1&&G.ESYA[pk.keys[0]],'tartışmada planlandı');
    assert.ok(pk.zaman>=t+7000&&pk.zaman<=t+7000+120*1000*2/3,'sabah animasyonundan (7 sn) sonra, ilk üçte iki');
    { G.setRnd(()=>0);const R0=esyali(['hain','masum','masum','masum','masum'],{});G.advance(R0);assert.strictEqual(R0.g.paket.zaman,t+7000,'rnd=0 → tam animasyon sonu');G.setRnd(()=>0.1) }assert.strictEqual(R.P.paket,null);noLeak(R.P);
    assert.strictEqual(G.tick(R),false);t=pk.zaman;assert.strictEqual(G.tick(R),true,'açılış değişiklik');assert.strictEqual(R.P.phase,'talk');
    assert.deepStrictEqual({...R.P.paket,yer:undefined},{key:pk.keys[0],n:1,ends:t+5000,yer:undefined});
    { const y=R.P.paket.yer;assert.ok(y&&Math.hypot(y.x,y.y)<=1.0001&&Number.isFinite(y.x)&&Number.isFinite(y.y),'yer birim disk içinde: '+JSON.stringify(y)) }assert.strictEqual(R.g.paketSayisi,1);noLeak(R.P);
    assert.strictEqual(G.kap(R,'u1',1,R.P.gameId),true);assert.strictEqual(R.g.esya.u1.length,2);assert.deepStrictEqual(R.g.esya.u1[1],{key:pk.keys[0],kaynak:'paket',kullanildi:false});
    assert.strictEqual(R.P.paket,null,'tek eşya alınınca hemen kapanır');assert.strictEqual(R.g.paket,null);
    const son=R.P.chat[R.P.chat.length-1];assert.ok(son.sys&&son.t==='📦 Meydana '+G.ESYA[pk.keys[0]].ico+' '+G.ESYA[pk.keys[0]].n.toLowerCase()+' düştü — biri kaptı',son.t);
    const ev=R.gameLog.filter(e=>e.tur==='paket').pop();assert.deepStrictEqual(ev.veri,{key:pk.keys[0],n:1,alan:1,alanlar:['u1']});assert.deepStrictEqual(Object.keys(ev.veri).sort(),['alan','alanlar','key','n']);
    assert.strictEqual(G.kap(R,'u2',1,R.P.gameId),false,'kapandıktan sonra');assert.strictEqual(G.privFor(R,'u1').esya.length,2);
    // 9 kişi: iki eşya, sunucu sırası, tekrar/ölü/yanlış gün/dolu yuva
    R=esyali(['hain','hain','masum','masum','masum','masum','masum','masum','masum'],{});G.advance(R);t=R.g.paket.zaman;G.tick(R);
    assert.strictEqual(R.P.paket.n,2);assert.deepStrictEqual(R.g.paket.keys,[R.P.paket.key,R.P.paket.key],'iki eşya aynı tür');
    assert.strictEqual(G.kap(R,'u2',1,R.P.gameId),true);assert.strictEqual(G.kap(R,'u2',1,R.P.gameId),false,'aynı kişi ikinci kez');
    assert.strictEqual(G.kap(R,'u3',2,R.P.gameId),false,'yanlış gün');assert.strictEqual(G.kap(R,'u3',1,'baska'),false,'yanlış maç');
    R.g.esya.u4.push({key:'fis',kaynak:'paket',kullanildi:true});assert.strictEqual(G.kap(R,'u4',1,R.P.gameId),false,'yuva dolu (kullanılmış da sayılır)');
    G.pl(R,'u5').alive=false;assert.strictEqual(G.kap(R,'u5',1,R.P.gameId),false,'ölü');
    assert.strictEqual(R.P.paket.n,2,'kalan sayı açığa çıkmaz');
    assert.strictEqual(G.kap(R,'u3',1,R.P.gameId),true);assert.strictEqual(R.P.paket,null);assert.strictEqual(G.kap(R,'u6',1,R.P.gameId),false,'üçüncü');
    assert.match(R.P.chat[R.P.chat.length-1].t,/düştü — ikisini de kaptılar$/);assert.deepStrictEqual(R.gameLog.filter(e=>e.tur==='paket').pop().veri.alanlar,['u2','u3']);
    // süre dolunca kimse kapmadı
    R=esyali(['hain','masum','masum','masum','masum'],{});G.advance(R);t=R.g.paket.zaman;G.tick(R);t=R.P.paket.ends;assert.strictEqual(G.tick(R),true);
    assert.strictEqual(R.P.paket,null);assert.match(R.P.chat[R.P.chat.length-1].t,/düştü — kimse kapmadı$/);assert.strictEqual(R.gameLog.filter(e=>e.tur==='paket').pop().veri.alan,0);assert.strictEqual(R.P.phase,'talk');
    // faz biterken açık paket kapanır (tek satır)
    R=esyali(['hain','masum','masum','masum','masum'],{});G.advance(R);t=R.g.paket.zaman;G.tick(R);const n0=R.P.chat.length;t=R.P.ends;G.tick(R);
    assert.strictEqual(R.P.phase,'vote');assert.strictEqual(R.P.paket,null);assert.strictEqual(R.g.paket,null);assert.strictEqual(R.P.chat.filter((m,i)=>i>=n0&&/📦/.test(m.t||'')).length,1);
    // planlanmış ama açılmamış paket faz bitince sessizce gider
    R=esyali(['hain','masum','masum','masum','masum'],{});G.advance(R);const n1=R.P.chat.length;t=R.P.ends;G.tick(R);assert.strictEqual(R.g.paket,null);assert.ok(!R.P.chat.slice(n1).some(m=>/📦/.test(m.t||'')));assert.strictEqual(R.g.paketSayisi||0,0);
    // maç tavanı ve şans
    R=esyali(['hain','masum','masum','masum','masum'],{});R.g.paketSayisi=3;G.advance(R);assert.ok(!R.g.paket,'maxMac');
    G.setRnd(()=>0.7);R=esyali(['hain','masum','masum','masum','masum'],{});G.advance(R);assert.ok(!R.g.paket,'şans tutmadı');G.setRnd(()=>0.1);
    // eşya modu kapalı
    R=fixed(['hain','masum','masum','masum','masum']);G.advance(R);assert.ok(!R.g.paket);assert.strictEqual(G.kap(R,'u1',1,R.P.gameId),false);
    // paket zarı anında nadir eşya + not
    const seq=a=>{let i=0;return()=>a[i++%a.length]};G.setRnd(seq([0.1,0.5,0.9,0.999,0.3]));R=esyali(['hain','masum','masum','masum','masum'],{});G.advance(R);
    assert.strictEqual(R.g.paket.keys[0],'zar');t=R.g.paket.zaman;G.tick(R);assert.strictEqual(R.P.paket.key,'zar');assert.strictEqual(G.kap(R,'u1',1,R.P.gameId),true);
    const z=R.g.esya.u1[1];assert.strictEqual(G.ESYA[z.key].nadir,'nadir');assert.strictEqual(z.zar,true);assert.strictEqual(z.kaynak,'paket');assert.match(R.g.notes.u1.join(' | '),/🎲 Zar: .* çıktı/);
    // fiş paketi: kapan kimliği günlüğe yazılmaz
    G.setRnd(seq([0.1,0.5,0.0,0.3]));R=esyali(['hain','masum','masum','masum','masum'],{});G.advance(R);assert.strictEqual(R.g.paket.keys[0],'fis');t=R.g.paket.zaman;G.tick(R);
    assert.strictEqual(G.kap(R,'u2',1,R.P.gameId),true);const pf=R.gameLog.filter(e=>e.tur==='paket').pop().veri;assert.deepStrictEqual(pf,{key:'fis',n:1,alan:1,alanlar:[]});
  }finally{G.setClock();G.setRnd(null)}
});
test('gazete 2: eşya kartı önceliği (iksir korudu > kilit > fener hain > vasiyet > diğer), en çok bir paket kartı; P.ozet eşya açıklaması (fiş gizli)',()=>{
  const R=esyali(['hain','masum','masum','masum','masum','masum'],{u1:'kilit',u2:'fener',u3:'iksir',u4:'fis',u5:'vasiyet'});
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{esya:'kilit',esyaHedef:'u2'});G.act(R,'u2',{esya:'fener'});G.advance(R); // iksir korur, kilit masumu kilitler, fener kimseyi görmez
  R.gameLog.push({sira:900,gun:1,faz:'talk',tur:'paket',veri:{key:'fis',n:1,alan:1,alanlar:['u4']},oyun:R.P.gameId,oyunId:R.P.oyunId,zaman:0});
  R.gameLog.push({sira:901,gun:1,faz:'talk',tur:'paket',veri:{key:'kum',n:2,alan:0,alanlar:[]},oyun:R.P.gameId,oyunId:R.P.oyunId,zaman:0});
  G.advance(R);G.vote(R,'u4','u0',null,null,true);for(const id of ['u1','u2','u3','u5'])G.vote(R,id,'u0');G.vote(R,'u0','skip');
  assert.strictEqual(R.P.phase,'end');const gz=G.gazeteFor(R);
  const ek=gz.filter(c=>c.tur==='esya');assert.strictEqual(ek.length,1);assert.match(ek[0].metin,/🧪 Gece 1: Oyuncu3'ün iksiri onu saldırıdan kurtardı/);
  const pk=gz.filter(c=>c.tur==='paket');assert.strictEqual(pk.length,1);assert.strictEqual(pk[0].metin,'📦 Maçta 2 paket düştü, 1\'i kapıldı.');assert.deepStrictEqual(pk[0].ozne,[]);
  const oz=Object.fromEntries(R.P.ozet.oyuncular.map(p=>[p.id,p.esyalar]));
  assert.deepStrictEqual(oz.u3,[{key:'iksir',kullanildi:true,kaynak:'envanter'}]);assert.deepStrictEqual(oz.u1,[{key:'kilit',kullanildi:true,kaynak:'envanter'}]);
  assert.deepStrictEqual(oz.u2,[{key:'fener',kullanildi:true,kaynak:'envanter'}]);assert.deepStrictEqual(oz.u5,[{key:'vasiyet',kullanildi:false,kaynak:'envanter'}]);
  assert.deepStrictEqual(oz.u4,[],'fiş listeye hiç girmez (taşıdığı bile oy gizliliğini bozar)');assert.deepStrictEqual(oz.u0,[]);assert.ok(!JSON.stringify(R.P.ozet).includes('fis'));
  noLeak(R.P);
  // öncelik: kilit kilitledi > fener hain gördü > vasiyet
  const R2=esyali(['hain','masum','masum','masum','masum'],{u1:'fener',u2:'kilit',u3:'vasiyet'});
  G.act(R2,'u0',{kill:'u1'});G.act(R2,'u1',{esya:'fener'});G.act(R2,'u2',{esya:'kilit',esyaHedef:'u4'});G.advance(R2);
  G.advance(R2);for(const id of ['u1','u2','u3','u4'])G.vote(R2,id,'u0');G.vote(R2,'u0','skip');assert.strictEqual(R2.P.phase,'end');
  const e2=G.gazeteFor(R2).filter(c=>c.tur==='esya');assert.strictEqual(e2.length,1);assert.match(e2[0].metin,/🔒 Gece 1: Oyuncu2 Oyuncu4'ün kapısını kilitledi/);
  // eşya modu kapalı: ozet.esyalar boş dizi, paket kartı yok
  const R3=fixed(['hain','masum','masum','masum']);G.advance(R3);G.advance(R3);for(const id of ['u1','u2','u3'])G.vote(R3,id,'u0');G.vote(R3,'u0','skip');
  assert.deepStrictEqual(R3.P.ozet.oyuncular[0].esyalar,[]);assert.ok(!G.gazeteFor(R3).some(c=>c.tur==='paket'));
});
test('privFor.hamle: gece kendi hamlesi geri gelir (yenileme); başka fazda ve başkasına yok; P gizli',()=>{
  const R=esyali(['hain','doktor','masum','masum','masum'],{u1:'kilit'});
  assert.strictEqual(G.privFor(R,'u0').hamle,null,'hamle yokken null');
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2',esya:'kilit',esyaHedef:'u0'});
  assert.deepStrictEqual(G.privFor(R,'u0').hamle,{kill:'u2',ab:null,guess:null,det:false,esya:null,esyaHedef:null});
  assert.deepStrictEqual(G.privFor(R,'u1').hamle,{kill:null,ab:'u2',guess:null,det:false,esya:'kilit',esyaHedef:'u0'});
  assert.strictEqual(G.privFor(R,'u2').hamle,null,'başkasının hamlesi görünmez');noLeak(R.P);
  G.advance(R);assert.strictEqual(R.P.phase,'talk');assert.strictEqual(G.privFor(R,'u1').hamle,null,'gündüz yok');
});
test('meydan paketi yeri: rastgele, birim disk içinde, her pakette yeniden; herkese aynı (P), deterministik',()=>{
  let t=1000;G.setClock(()=>t);
  try{const yerler=new Set();
    for(let i=0;i<40;i++){G.setRnd(()=>0.1);const R=esyali(['hain','masum','masum','masum','masum'],{});G.advance(R);t=R.g.paket.zaman;
      let j=0;const seq=[0.05,0.95,0.5,0.25,0.75,0.33];G.setRnd(()=>(seq[(i+j++)%seq.length]+i*0.013)%1);G.tick(R);const y=R.P.paket.yer;
      assert.ok(Math.hypot(y.x,y.y)<=1.0001,'disk: '+JSON.stringify(y));yerler.add(y.x+','+y.y)}
    assert.ok(yerler.size>=10,'yer her pakette değişir: '+yerler.size);
    G.setRnd(()=>0);const R=esyali(['hain','masum','masum','masum','masum'],{});G.advance(R);t=R.g.paket.zaman;G.tick(R);assert.deepStrictEqual(R.P.paket.yer,{x:0,y:0},'rnd=0 → merkez');
  }finally{G.setClock();G.setRnd(null)}
});
test('oy fişi: oyu 2 sayar, eşiğe sayılmaz, eşitliği bozar; anonim özet',()=>{
  let R=esyali(['hain','masum','masum','masum','masum'],{u0:'fis'});G.advance(R);G.advance(R);
  G.vote(R,'u0','u1',null,null,true);for(const id of ['u1','u2','u3','u4'])G.vote(R,id,'skip');
  assert.ok(G.pl(R,'u1').alive,'tek oy + fiş astırmaz');assert.strictEqual(R.g.esya.u0[0].kullanildi,true,'birine oy verdiyse harcanır');
  R=esyali(['hain','masum','masum','masum','masum','masum'],{u0:'fis'});G.advance(R);G.advance(R);
  G.vote(R,'u0','u1',null,null,true);G.vote(R,'u3','u1');G.vote(R,'u2','u4');G.vote(R,'u5','u4');G.vote(R,'u1','skip');G.vote(R,'u4','skip');
  assert.ok(!G.pl(R,'u1').alive,'fiş eşitliği bozdu');const v=R.gameLog.find(e=>e.tur==='gunduz_sonuc').veri;assert.strictEqual(v.fis,1,'fiş sayısı (kimlik yazılmaz)');assert.deepStrictEqual(v.toplamlar,{u1:3,u4:2});
  assert.match(R.P.evening.summary,/Biri oy fişi kullandı/);
  R=esyali(['hain','masum','masum','masum','masum'],{u0:'fis'});G.advance(R);G.advance(R);G.vote(R,'u0','skip',null,null,true);for(const id of ['u1','u2','u3','u4'])G.vote(R,id,'skip');
  assert.strictEqual(R.g.esya.u0[0].kullanildi,false,'çekimserde fiş harcanmaz');
});
test('esyaKullanimi ve gazete: harcananlar dizi, kullanmadan ölen harcamaz; gazete eşya kartı adıyla',()=>{
  const R=esyali(['hain','masum','masum','masum'],{u1:'iksir',u2:'fener'});
  G.act(R,'u0',{kill:'u1'});G.advance(R);G.advance(R);for(const id of ['u0','u1','u2','u3'])G.vote(R,id,'skip');
  G.act(R,'u0',{kill:'u2'});G.advance(R);G.advance(R);for(const id of ['u0','u1','u3'])G.vote(R,id,'skip');G.act(R,'u0',{kill:'u3'});G.advance(R);
  assert.strictEqual(R.P.phase,'end');const k=G.esyaKullanimi(R);
  assert.deepStrictEqual(k.u1,[{key:'iksir',kaynak:'envanter',kullanildi:true}]);assert.deepStrictEqual(k.u2,[{key:'fener',kaynak:'envanter',kullanildi:false}]);
  assert.ok(G.gazeteFor(R).some(c=>/🧪/.test(c.metin)&&/Oyuncu1/.test(c.metin)),JSON.stringify(G.gazeteFor(R)));
});

// ---------- Yıldız ekonomisi 1 (Task 1): maç sonu dökümü, hain oyu, fiyatlar ----------
const bitir=(R,kaz)=>{R.P.phase='end';R.P.winner={kazananlar:kaz}};
const dokumSay=(d,k)=>d.filter(x=>x.key===k).reduce((a,x)=>a+x.adet,0);
test('yildizDokumu: Doktor iki kurtarış + kazanma; toplam',()=>{
  const R=fixed(['hain','doktor','masum','masum','masum','masum']);
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.advance(R);G.advance(R);for(const p of R.P.players)G.vote(R,p.id,'skip');
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u3'});G.advance(R);
  bitir(R,['u1','u2','u3','u4','u5']);const d=G.yildizDokumu(R,'u1');
  assert.strictEqual(dokumSay(d,'kazanma'),2);assert.strictEqual(dokumSay(d,'kurtarici'),2);assert.strictEqual(G.yildizToplam(d),4);
});
test('yildizDokumu: rol başarısı maç başına en çok 3',()=>{
  const R=fixed(['hain','doktor','masum','masum','masum']);for(let i=0;i<5;i++)R.gameLog.push({tur:'gece_sonuc',gun:i+1,veri:{kurtaranlar:[{kim:'u1',hedef:'u2'}]}});
  bitir(R,['u0']);const d=G.yildizDokumu(R,'u1');assert.strictEqual(dokumSay(d,'kurtarici'),3);assert.strictEqual(G.yildizToplam(d),3);
});
test('yildizDokumu: tarafsız tek kazanan +4, kazanma yerine',()=>{
  const R=fixed(['hain','serikatil','masum','masum','masum']);bitir(R,['u1']);const d=G.yildizDokumu(R,'u1');
  assert.strictEqual(dokumSay(d,'tek_kazanan'),4);assert.strictEqual(dokumSay(d,'kazanma'),0);
});
test('yildizDokumu: kalabalık maç 8+ oyuncu',()=>{
  const R8=fixed(['hain','masum','masum','masum','masum','masum','masum','masum']);bitir(R8,[]);assert.strictEqual(dokumSay(G.yildizDokumu(R8,'u3'),'kalabalik'),1);
  const R7=fixed(['hain','masum','masum','masum','masum','masum','masum']);bitir(R7,[]);assert.strictEqual(dokumSay(G.yildizDokumu(R7,'u3'),'kalabalik'),0);
});
test('hain oyu: yalnız asılan haine oy veren masum taraf; günlük kaydı değişmez',()=>{
  let R=fixed(['hain','hain','masum','masum','masum','masum']);G.advance(R);G.advance(R);
  for(const id of ['u1','u2','u3'])G.vote(R,id,'u0');G.vote(R,'u4','u5');G.vote(R,'u5','skip');G.vote(R,'u0','skip');
  const gs=R.gameLog.find(e=>e.tur==='gunduz_sonuc');assert.strictEqual(gs.veri.asilan,'u0');
  assert.deepStrictEqual(Object.keys(gs.veri).sort(),['asilan','cekimser','fis','kum','provoke','rol_goruntu','toplamlar','vasiyet']);
  assert.deepStrictEqual(R.g.hainOyu,{u2:1,u3:1},'ortak hain ve masuma oy veren almaz');
  bitir(R,[]);assert.strictEqual(dokumSay(G.yildizDokumu(R,'u2'),'hain_oyu'),2);assert.strictEqual(dokumSay(G.yildizDokumu(R,'u4'),'hain_oyu'),0);
  R=fixed(['hain','masum','masum','masum','masum']);G.advance(R);G.advance(R);G.vote(R,'u1','u0');G.vote(R,'u2','u0');G.vote(R,'u3','u4');G.vote(R,'u4','u3');G.vote(R,'u0','u3');
  assert.deepStrictEqual(R.g.hainOyu||{},{},'hain asılmadı → kimse yok');
});
test('hain oyu: takım oylama anındaki hâline göre',()=>{
  const R=fixed(['hain','hain','masum','masum','masum','masum']);G.advance(R);G.advance(R);
  for(const id of ['u2','u3','u4'])G.vote(R,id,'u0');for(const id of ['u0','u1','u5'])G.vote(R,id,'skip');
  R.g.roles.u2.team='imp';bitir(R,[]);assert.strictEqual(dokumSay(G.yildizDokumu(R,'u2'),'hain_oyu'),2);
});
test('yildizDokumu: maç bitmeden boş; katalog',()=>{
  const R=fixed(['hain','doktor','masum','masum']);assert.deepStrictEqual(G.yildizDokumu(R,'u1'),[]);
  assert.strictEqual(G.YILDIZ_KAYNAK.gunun_ilki.adet,5);assert.strictEqual(G.YILDIZ_KAYNAK.bagla.adet,25);assert.strictEqual(G.ROL_BASARI_TAVAN,3);
});
test('fiyatlar ve özel kozmetik',()=>{
  assert.deepStrictEqual(G.NADIRLIK,{siradan:{fiyat:25,donusum:6},nadir:{fiyat:70,donusum:18},efsanevi:{fiyat:180,donusum:45}});
  assert.strictEqual(G.KOZMETIK.bayrak.mektup.ozel,'bagla');assert.strictEqual(G.KOZMETIK.bayrak.mektup.ico,'✉️');
  for(let i=0;i<3000;i++){const o=G.kasaOdulu();assert.notStrictEqual(o.key,'bayrak:mektup');if(o.tur==='yildiz')assert.ok(o.adet>=6&&o.adet<=10,String(o.adet))}
});
test('göç 010 miktarları game.js ile aynı (günün ilki, bağlama)',()=>{
  const sql=require('fs').readFileSync(require('path').join(__dirname,'../db/goc/010_yildiz_1.sql'),'utf8');
  assert.strictEqual(Number((sql.match(/gunun_ilki_miktar constant int := (\d+)/)||[])[1]),G.YILDIZ_KAYNAK.gunun_ilki.adet);
  assert.strictEqual(Number((sql.match(/bagla_miktar constant int := (\d+)/)||[])[1]),G.YILDIZ_KAYNAK.bagla.adet);
  assert.ok(sql.includes("p_key = 'bayrak:mektup'")&&sql.includes("'bayrak:mektup') on conflict"),'mektup anahtarı göçte');
  assert.ok(Object.entries(G.KOZMETIK).every(([t,o])=>Object.entries(o).every(([k,v])=>!v.ozel||(t+':'+k)==='bayrak:mektup')),'özel öğe yalnız mektup (göç bunu sabit tutar)');
});
