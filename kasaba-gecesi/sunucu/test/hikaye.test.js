'use strict';
// sayfa/hikaye.js: olay günlüğünden gece gece Türkçe hikâye (saf; Node'da da yüklenir). Günlük gerçek motorla üretilir.
const test=require('node:test');const assert=require('node:assert');
const G=require('../game.js');const {hikaye}=require('../../sayfa/hikaye.js');
const lobbyOf=n=>Array.from({length:n},(_,i)=>({id:'u'+i,name:'Oyuncu'+i,color:G.COLORS[i],hat:'cap'}));
function fixed(roles){const R=G.createGame();G.startGame(R,lobbyOf(roles.length));roles.forEach((k,i)=>{const e=G.SETUP.find(s=>s.id===k);R.g.roles['u'+i]={key:e.key,team:e.team,mad:null,uses:{},vest:3,planted:[]}});return R}
const oyuncular=R=>{const b=R.gameLog.find(e=>e.tur==='bitis');return R.P.players.map(p=>{const k=b?b.veri.oyuncular.find(o=>o.id===p.id):null;return {pub_id:p.id,ad:p.name,rol_key:k?k.rol_key:null,takim:k?k.takim:null,deli_gibi:k?k.deli_gibi:null,calinan_rol:k?k.calinan_rol:null}})};
const duz=h=>h.map(b=>b.baslik+'\n'+b.satirlar.join('\n')).join('\n');

test('hikâye: gece hamleleri, sonuç, iddia, oylar, bitiş; ölçüm olayları yok',()=>{
  let t=1000;G.setClock(()=>t);
  try{
    const R=fixed(['hain','doktor','gozcu','deli','masum','masum']);R.g.roles.u3.mad='polis';
    G.act(R,'u0',{kill:'u4'});G.act(R,'u1',{ab:'u4'});G.act(R,'u2',{ab:'u4'});G.act(R,'u3',{ab:'u0'});G.advance(R); // doktor kurtarır
    t+=9000;G.hizli(R,'u0',{k:'rol',rol:'masum',d:1,n:'a'});t+=9000;G.hizli(R,'u1',{k:'koru',d:1,n:'b'});
    G.advance(R);for(const id of ['u1','u2','u3','u4'])G.vote(R,id,'u5');G.vote(R,'u0','skip');G.vote(R,'u5','skip'); // u5 asılır (masum)
    G.act(R,'u0',{kill:'u1'});G.advance(R); // gece 2: doktor ölür
    G.advance(R);for(const id of ['u2','u3','u4'])G.vote(R,id,'u0');G.vote(R,'u0','skip'); // hain asılır → masumlar
    assert.strictEqual(R.P.phase,'end');
    R.log.push({sira:99,gun:2,faz:'end',tur:'hazir',veri:{kim:'u2',v:true}});R.gameLog.push({sira:100,gun:2,faz:'end',tur:'son_ekran_goruldu',veri:{kim:'u2'}});
    const h=hikaye(R.gameLog,oyuncular(R),G.ROLES);const m=duz(h);
    assert.deepStrictEqual(h.map(b=>b.baslik),['🌙 Gece 1','☀️ Gün 1','🌙 Gece 2','☀️ Gün 2','🏁 Bitiş'],m);
    assert.match(m,/Oyuncu0 \(Hain\) Oyuncu4'ün evine girdi/);assert.match(m,/Oyuncu1 \(Doktor\) Oyuncu4'ü korudu/);assert.match(m,/Oyuncu2 \(Gözcü\) Oyuncu4'ün evini gözetledi/);
    assert.match(m,/Oyuncu1 bir saldırıyı önledi; Oyuncu4 sağ çıktı/);
    assert.ok(!/Oyuncu3 \(/.test(m.split('☀️ Gün 1')[0]),'Deli\'nin hamlesi günlükte yok, hikâyede de yok');
    assert.match(m,/Oyuncu0: «Rolüm Masum» — o sırada rolü Hain idi/);
    assert.match(m,/Oylar: Oyuncu5 4, çekimser 2/);assert.match(m,/Kasaba Oyuncu5'i gönderdi \(Masum\)/);
    assert.match(m,/Oyuncu1 öldü \(Doktor\)/);assert.match(m,/Masumlar kazandı!/);
    assert.ok(!/hazir|son_ekran_goruldu|Beni koruyun|🛡️/.test(m),'ölçüm/hızlı olaylar hikâyeye girmez');
    // bilinmeyen tur sessiz; bilinmeyen pub_id → ?; süren oyun (rol null) → ad yalnız
    const h2=hikaye([...R.gameLog,{sira:101,gun:3,faz:'talk',tur:'bilinmeyen',veri:{}},{sira:102,gun:3,faz:'night',tur:'gece_hamle',veri:{kim:'u0',tur:'kill',hedef:'yok',tahmin:null}}],oyuncular(R).map(o=>({...o,rol_key:null,takim:null})),G.ROLES);const m2=duz(h2);
    assert.match(m2,/Oyuncu0 Oyuncu4'ün evine girdi/);assert.ok(!/\(Hain\)/.test(m2.split('☀️ Gün 1')[0]),'rol null → etiket yok');assert.match(m2,/Oyuncu0 \?'in evine girdi/,'bilinmeyen oyuncu → ?');
  }finally{G.setClock()}
});
test('hikâye: iptal ve özel olaylar (tuzak, tutma, hırsız, yıldırım, patlama, hortlak, yelek)',()=>{
  let R=fixed(['hain','tuzakci','polis','masum','masum']);G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u3'});G.act(R,'u2',{ab:'u4'});G.advance(R);const oy=oyuncular(R);G.endToLobby(R); // iptalde oyuncu listesi lobiye döner; sayfa oyun_oyunculari'ndan okur
  let m=duz(hikaye(R.gameLog,oy,G.ROLES));
  assert.match(m,/Oyuncu1'in tuzağı Oyuncu0'ı Oyuncu3'ün kapısında yakaladı/);assert.match(m,/Polis Oyuncu2, Oyuncu4'ü evde tuttu/);assert.match(m,/Oyun iptal edildi \(Gün 1, tartışma\)/);
  R=fixed(['hirsiz','hain','doktor','masum','masum','masum','masum']);G.act(R,'u0',{ab:'u2'});G.advance(R);
  assert.match(duz(hikaye(R.gameLog,oyuncular(R),G.ROLES)),/Oyuncu0 Oyuncu2'nin rolünü çaldı; artık Doktor/);
  // bitmiş oyunda Hırsız'ın çalma gecesi hâlâ Hırsız olarak anlatılır (rol_key oyun sonu anahtarıdır: Doktor); sonraki gece yeni rolüyle
  G.advance(R);for(const id of ['u0','u3','u4','u5','u6'])G.vote(R,id,'u1');G.vote(R,'u1','skip'); // hain asılır → masumlar (Hırsız artık Doktor)
  assert.strictEqual(R.P.phase,'end');const oyH=oyuncular(R);assert.strictEqual(oyH[0].rol_key,'doktor');assert.strictEqual(oyH[0].calinan_rol,'hirsiz');
  m=duz(hikaye(R.gameLog,oyH,G.ROLES));
  assert.match(m,/Oyuncu0 \(Hırsız\) Oyuncu2'nin evine girdi/,m);assert.ok(!/\(Doktor\) Oyuncu2/.test(m),'çalma gecesi Doktor hamlesi gibi yazılmamalı: '+m);
  R=fixed(['hirsiz','hain','doktor','masum','masum','masum','masum']);G.act(R,'u0',{ab:'u2'});G.advance(R);G.advance(R);for(const id of ['u0','u1','u3','u4','u5','u6'])G.vote(R,id,'skip');
  G.act(R,'u0',{ab:'u3'});G.act(R,'u1',{kill:'u3'});G.advance(R);G.advance(R);for(const id of ['u0','u3','u4','u5','u6'])G.vote(R,id,'u1');G.vote(R,'u1','skip');assert.strictEqual(R.P.phase,'end'); // u3 kurtarıldı, o da oy verir
  m=duz(hikaye(R.gameLog,oyuncular(R),G.ROLES));assert.match(m,/Gece 2\n[\s\S]*Oyuncu0 \(Doktor\) Oyuncu3'ü korudu/,'çalmadan sonraki gece yeni rol: '+m);
  R=fixed(['buyucu','hain','doktor','masum','masum','masum']);G.act(R,'u0',{ab:'u2',guess:'doktor'});G.advance(R);
  assert.match(duz(hikaye(R.gameLog,oyuncular(R),G.ROLES)),/Büyücü Oyuncu2'nin rolünü doğru tahmin etti; yıldırım düştü/);
  R=fixed(['hain','hayatta','masum','masum','masum']);G.act(R,'u0',{kill:'u1'});G.act(R,'u1',{ab:'self'});G.advance(R);
  assert.match(duz(hikaye(R.gameLog,oyuncular(R),G.ROLES)),/Oyuncu1 yelek sayesinde saldırıdan sağ çıktı/);
});

test('hikâye: Seri Katil hamlesi, kim öldürdü satırı, kışkırtma satırı',()=>{
  const R=fixed(['hain','provokator','serikatil','doktor','masum','masum']);
  G.act(R,'u0',{kill:'u4'});G.act(R,'u1',{ab:'u5'});G.act(R,'u2',{ab:'u5'});G.act(R,'u3',{ab:'u3'});G.advance(R); // u4 haince, u5 seri katilce ölür
  assert.strictEqual(R.P.phase,'talk');G.advance(R);
  for(const id of ['u0','u1','u2','u3'])G.vote(R,id,'skip');
  const oy=R.P.players.map(p=>({pub_id:p.id,ad:p.name,rol_key:R.g.roles[p.id].key,takim:R.g.roles[p.id].team})); // roller bilinir (bitmiş gibi)
  const h=hikaye(R.gameLog,oy,G.ROLES);const m=duz(h);
  assert.match(m,/Oyuncu2 \(Seri Katil\) Oyuncu5'in evine girdi/,'Seri Katil hamlesi HAMLE\'de');
  assert.match(m,/Oyuncu4 öldü \(Masum\) — Oyuncu0 öldürdü/,'kim öldürdü');
  assert.match(m,/Oyuncu5 öldü \(Masum\) — Oyuncu2 öldürdü/);
  assert.match(m,/🔥 Oyuncu5 kışkırtılmıştı/,'kışkırtma satırı (ölmüş olsa da günlükte)');
});

test('hikâye: eşya satırları (gece adıyla, oy fişi anonim)',()=>{
  const R=G.createGame({night:30,talk:120,vote:45,esyaModu:true});G.startGame(R,lobbyOf(6),{esyalar:{u1:{key:'iksir',kaynak:'envanter'},u0:{key:'fis',kaynak:'envanter'}}});
  ['hain','masum','masum','masum','masum','masum'].forEach((k,i)=>{const e=G.SETUP.find(x=>x.id===k);R.g.roles['u'+i]={key:e.key,team:e.team,mad:null,uses:{},vest:3,planted:[]}});
  G.act(R,'u0',{kill:'u1'});G.act(R,'u1',{esya:true});G.advance(R);G.advance(R);
  G.vote(R,'u0','u1',null,null,true);G.vote(R,'u3','u1');G.vote(R,'u2','u4');G.vote(R,'u5','u4');G.vote(R,'u1','skip');G.vote(R,'u4','skip');
  const oy=R.P.players.map(p=>({pub_id:p.id,ad:p.name,rol_key:R.g.roles[p.id].key,takim:R.g.roles[p.id].team}));
  const m=duz(hikaye(R.gameLog,oy,G.ROLES));
  assert.match(m,/🧪 Oyuncu1 iksir içti ve saldırıdan sağ çıktı/);assert.match(m,/🗳️ Biri oy fişi kullandı/);assert.ok(!/Oyuncu0 oy fişi/.test(m),'fiş kullanan adı yok');
});

test('hikâye 2: pusula, kilit, vasiyet, kum saati ve paket satırları (bitmiş oyunda adla; süren oyunda paket adsız)',()=>{
  const R=G.createGame({night:30,talk:120,vote:45,esyaModu:true});
  const E={u0:'fis',u1:'pusula',u2:'kilit',u3:'vasiyet',u4:'kum',u5:'fis'};G.startGame(R,lobbyOf(6),{esyalar:Object.fromEntries(Object.entries(E).map(([k,v])=>[k,{key:v,kaynak:'envanter'}]))});
  ['hain','gozcu','masum','masum','masum','serikatil'].forEach((k,i)=>{const e=G.SETUP.find(x=>x.id===k);R.g.roles['u'+i]={key:e.key,team:e.team,mad:null,uses:{},vest:3,planted:[]}});
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u0',esya:'pusula',esyaHedef:'u0'});G.act(R,'u2',{esya:'kilit',esyaHedef:'u5'});G.act(R,'u5',{ab:'u3'});G.advance(R); // Seri Katil kilitlenmez; u3 ölür, vasiyeti okunur
  assert.strictEqual(G.esyaKullan(R,'u4','kum'),true);
  R.gameLog.push({sira:900,gun:1,faz:'talk',tur:'paket',veri:{key:'kum',n:2,alan:2,alanlar:['u1','u2']},oyun:R.P.gameId,oyunId:R.P.oyunId,zaman:0});
  R.gameLog.push({sira:901,gun:1,faz:'talk',tur:'paket',veri:{key:'fis',n:1,alan:0,alanlar:[]},oyun:R.P.gameId,oyunId:R.P.oyunId,zaman:0});
  R.gameLog.push({sira:902,gun:1,faz:'talk',tur:'paket',veri:{key:'fis',n:1,alan:1,alanlar:['u4']},oyun:R.P.gameId,oyunId:R.P.oyunId,zaman:0});
  G.advance(R);for(const id of ['u0','u1','u2','u4','u5'])G.vote(R,id,'skip');
  const oy=R.P.players.map(p=>({pub_id:p.id,ad:p.name,rol_key:R.g.roles[p.id].key,takim:R.g.roles[p.id].team}));
  const m=duz(hikaye(R.gameLog,oy,G.ROLES));
  assert.match(m,/🧭 Oyuncu1 pusulayla Oyuncu0'ı izledi: evinden çıktı/);assert.match(m,/🔒 Oyuncu2 Oyuncu5'in kapısını kilitledi; ama Oyuncu5 evde durmadı/);
  assert.match(m,/📜 Oyuncu3'ün vasiyeti okundu/);assert.match(m,/⏳ Biri kum saatini çevirdi/);assert.ok(!/Oyuncu4 kum/.test(m));
  assert.match(m,/📦 Meydana ⏳ kum saati düştü; Oyuncu1 ve Oyuncu2 kaptı/);assert.match(m,/📦 Meydana 🗳️ oy fişi düştü; kimse kapmadı/);assert.match(m,/📦 Meydana 🗳️ oy fişi düştü; biri kaptı/);assert.ok(!/Oyuncu4 kaptı/.test(m),'fiş kapan adı bitmiş oyunda da yazılmaz');
  const suren=oy.map(p=>({...p,rol_key:null,takim:null}));const m2=duz(hikaye(R.gameLog,suren,G.ROLES));
  assert.match(m2,/📦 Meydana ⏳ kum saati düştü; ikisini de kaptılar/);assert.ok(!/Oyuncu1 ve Oyuncu2 kaptı/.test(m2),'süren oyunda kapan adsız');
});
