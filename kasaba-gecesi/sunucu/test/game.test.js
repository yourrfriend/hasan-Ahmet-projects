'use strict';
// node --test  →  oyun mantığı testleri
const test=require('node:test');
const assert=require('node:assert');
const G=require('../game.js');

const SECRET_KEYS=['roles','acts','votes','notes','dchat','candle','planted','mad','uses','vest','haunt','provoke','blame','log','gameLog'];
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
  gs=R.log.find(e=>e.tur==='gece_sonuc');assert.deepStrictEqual(gs.veri.olenler,[{kim:'u2',sekil:'stab',kimden:['u0'],kimden_ad:'Hain',rol:'Masum'}]);
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
const OZEL=Object.keys(G.ROLES).filter(k=>!['masum','hain'].includes(k));
test('rol dağılımı: eşikler, tekrarsız özel roller, bilgi rolü ≥ hain, %75 yetenekli',()=>{
  const bekle={4:[1,0,0,0],5:[1,0,0,0],6:[1,0,0,1],7:[1,0,0,1],8:[1,0,0,1],9:[2,1,1,1],10:[2,1,1,1],11:[2,1,1,1],12:[2,2,1,1]}; // hain, saldırgan, pasif, deli
  for(let n=4;n<=12;n++){
    const kumeler=new Set();
    for(let i=0;i<500;i++){
      const c=G.autoSetup(n);const ids=Object.keys(c);
      assert.strictEqual(Object.values(c).reduce((a,b)=>a+b,0),n,'toplam '+n);
      const say=(f)=>ids.filter(f).reduce((a,id)=>a+c[id],0);
      const hain=say(id=>G.SETUP.find(s=>s.id===id).team==='imp');
      const sald=say(id=>['serikatil','bombaci','hirsiz','buyucu'].includes(id));
      const pasif=say(id=>['hayatta','hortlak'].includes(id));
      assert.deepStrictEqual([hain,sald,pasif,c.deli||0],bekle[n],'n='+n+' '+JSON.stringify(c));
      for(const id of ids)if(id!=='masum'&&id!=='hain')assert.strictEqual(c[id],1,'özel rol tekrar: '+id+' n='+n);
      assert.ok((c.hain||0)>=1,'düz hain şart');
      assert.ok(say(id=>id.endsWith('_h')||['temizlikci','suclayici'].includes(id))<=Math.floor(hain/2),'yetenekli hain sınırı n='+n);
      assert.ok(c.doktor===1,'doktor hep');assert.strictEqual(c.polis||0,n>=5?1:0,'polis 5+');
      const bilgi=say(id=>BILGI.includes(id));assert.ok(bilgi>=hain,'bilgi rolü ≥ hain n='+n+' '+JSON.stringify(c));
      const m=n-hain-sald-pasif-(c.deli||0);const yetenekli=m-(c.masum||0);
      assert.strictEqual(yetenekli,Math.min(m,Math.max(Math.ceil(0.75*m),hain+1),8),'yetenekli masum sayısı n='+n);
      kumeler.add(ids.sort().join(','));
    }
    if(n>=7)assert.ok(kumeler.size>1,'n='+n+' hep aynı küme');
  }
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
