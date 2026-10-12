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

test('4 kişiden az oyun başlamaz, 12 kişiden fazlası kesilir',()=>{
  assert.strictEqual(G.startGame(G.createGame(),lobbyOf(3)),false);
  const R=G.createGame();G.startGame(R,lobbyOf(15));assert.strictEqual(R.P.players.length,12);
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
