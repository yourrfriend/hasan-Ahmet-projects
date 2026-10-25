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
    const h2=hikaye([...R.gameLog,{sira:101,gun:3,faz:'talk',tur:'bilinmeyen',veri:{}}],oyuncular(R).map(o=>({...o,rol_key:null,takim:null})).slice(0,4),G.ROLES);const m2=duz(h2);
    assert.match(m2,/Oyuncu0 Oyuncu4'ün evine girdi/);assert.ok(!/\(Hain\)/.test(m2.split('☀️ Gün 1')[0]),'rol null → etiket yok');assert.match(m2,/\?/);
  }finally{G.setClock()}
});
test('hikâye: iptal ve özel olaylar (tuzak, tutma, hırsız, yıldırım, patlama, hortlak, yelek)',()=>{
  let R=fixed(['hain','tuzakci','polis','masum','masum']);G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u3'});G.act(R,'u2',{ab:'u4'});G.advance(R);const oy=oyuncular(R);G.endToLobby(R); // iptalde oyuncu listesi lobiye döner; sayfa oyun_oyunculari'ndan okur
  let m=duz(hikaye(R.gameLog,oy,G.ROLES));
  assert.match(m,/Oyuncu1'in tuzağı Oyuncu0'ı Oyuncu3'ün kapısında yakaladı/);assert.match(m,/Polis Oyuncu2, Oyuncu4'ü evde tuttu/);assert.match(m,/Oyun iptal edildi \(Gün 1, tartışma\)/);
  R=fixed(['hirsiz','hain','doktor','masum','masum','masum','masum']);G.act(R,'u0',{ab:'u2'});G.advance(R);
  assert.match(duz(hikaye(R.gameLog,oyuncular(R),G.ROLES)),/Oyuncu0 Oyuncu2'nin rolünü çaldı; artık Doktor/);
  R=fixed(['buyucu','hain','doktor','masum','masum','masum']);G.act(R,'u0',{ab:'u2',guess:'doktor'});G.advance(R);
  assert.match(duz(hikaye(R.gameLog,oyuncular(R),G.ROLES)),/Büyücü Oyuncu2'nin rolünü doğru tahmin etti; yıldırım düştü/);
  R=fixed(['hain','hayatta','masum','masum','masum']);G.act(R,'u0',{kill:'u1'});G.act(R,'u1',{ab:'self'});G.advance(R);
  assert.match(duz(hikaye(R.gameLog,oyuncular(R),G.ROLES)),/Oyuncu1 yelek sayesinde saldırıdan sağ çıktı/);
});
