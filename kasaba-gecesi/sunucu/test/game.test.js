'use strict';
// node --test  →  oyun mantığı testleri
const test=require('node:test');
const assert=require('node:assert');
const G=require('../game.js');

const SECRET_KEYS=['roles','acts','votes','notes','dchat','candle','planted','mad','uses','vest','haunt','provoke','blame'];
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
