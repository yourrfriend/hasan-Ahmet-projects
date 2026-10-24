'use strict';
// Sunucu testleri: gerçek WebSocket bağlantılarıyla oda, oyun, kopma ve geri dönme.
process.env.HOST_GRACE_MS='300';
process.env.EMPTY_ROOM_MS='300';
const test=require('node:test');
const assert=require('node:assert');
const http=require('http');
const WebSocket=require('ws');
const G=require('../game.js');
const {createServer}=require('../server.js');

let srv,base;
test.before(()=>new Promise(r=>{srv=createServer({quiet:true,tickMs:50});srv.server.listen(0,'127.0.0.1',()=>{base='127.0.0.1:'+srv.server.address().port;r()})}));
test.after(()=>new Promise(r=>srv.close(r)));

// Basit istemci: gelen son state/priv'i tutar, koşul bekler.
function client(uid,name,join){
  const ws=new WebSocket('ws://'+base+'/ws');
  // me: sunucunun verdiği açık kimlik (uid gizli anahtardır, state içinde geçmez); chat: parça parça gelen sohbet
  const c={ws,uid,me:null,P:null,priv:null,privN:0,errs:[],states:0,chat:[],
    send:m=>ws.send(JSON.stringify(m)),
    until(f,ms=3000){return new Promise((res,rej)=>{const t0=Date.now();const iv=setInterval(()=>{if(f(c)){clearInterval(iv);res(c)}else if(Date.now()-t0>ms){clearInterval(iv);rej(new Error(uid+' beklenen duruma gelmedi'))}},10)})},
    close(){return new Promise(r=>{if(ws.readyState>=2)return r();ws.once('close',r);ws.close()})}}; // sunucu kapattıysa beklemeden döner
  ws.on('message',d=>{const m=JSON.parse(d);if(m.t==='state'){c.P=m.P;c.states++;c.raw=String(d)}else if(m.t==='you')c.me=m.id;else if(m.t==='chat')c.chat.push(...m.a);else if(m.t==='priv'){c.priv=m.d;c.privN++}else if(m.t==='err')c.errs.push(m)});
  ws.on('open',()=>c.send({t:'join',uid,name,color:G.COLORS[0],hat:'cap',...join}));
  return c;
}

test('statik sayfa ve sağlık uç noktası',async()=>{
  const get=p=>new Promise((res,rej)=>http.get('http://'+base+p,r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>res({s:r.statusCode,b}))}).on('error',rej));
  const a=await get('/');assert.strictEqual(a.s,200);assert.match(a.b,/Kasaba Gecesi/);
  const sg=await get('/saglik');assert.strictEqual(sg.s,200);assert.ok('surum' in JSON.parse(sg.b),'/saglik sürümü göstermeli');
  assert.strictEqual((await get('/sunucu/game.js')).s,200);
  assert.strictEqual((await get('/../server.js')).s,404);
});

test('olmayan odaya katılma hata verir',async()=>{
  const c=client('x1','Ali',{room:'yokboyle'});
  await c.until(c=>c.errs.length);assert.strictEqual(c.errs[0].code,'noroom');await c.close();
});

test('oda kur, katıl, oyna; ev sahibi kopunca oyun sürer; kopan oyuncu geri döner',async()=>{
  const host=client('h1','Ev',{host:true,settings:{night:20,talk:20,vote:20}});
  await host.until(c=>c.P&&c.P.room);
  const room=host.P.room;assert.ok(host.me&&host.me!=='h1');assert.strictEqual(host.P.hostId,host.me);
  assert.ok(!host.raw.includes('h1'),'gizli anahtar state içinde geçmemeli');
  const others=['p1','p2','p3'].map((u,i)=>client(u,'Oyuncu'+i,{room}));
  await host.until(c=>c.P.lobby.length===4);
  // aynı rengi seçen herkes farklı renk almalı
  assert.strictEqual(new Set(host.P.lobby.map(p=>p.color)).size,4);
  // ev sahibi olmayan başlatamaz
  others[0].send({t:'start'});await new Promise(r=>setTimeout(r,150));assert.strictEqual(host.P.phase,'lobby');
  host.send({t:'start'});
  const all=[host,...others];
  await Promise.all(all.map(c=>c.until(c=>c.P.phase==='night'&&c.priv&&c.priv.role)));
  assert.strictEqual(host.P.settings.night,20);
  for(const c of all){for(const k of ['"roles"','"acts"','"votes"','"notes"'])assert.ok(!c.raw.includes(k),'sızıntı: '+k)}
  const roleOf={};all.forEach(c=>roleOf[c.uid]=c.priv.role.label);

  // açık kimliği bilen biri ev sahibinin yerine giremez: ayrı bir üye olur, rol göremez, başlatamaz/iptal edemez
  const fake=client(host.me,'Sahte',{room});
  await fake.until(c=>c.P&&c.me);
  assert.notStrictEqual(fake.me,host.me);assert.strictEqual(fake.priv.role,null);
  fake.send({t:'cancel'});await new Promise(r=>setTimeout(r,150));assert.strictEqual(host.P.phase,'night');
  await fake.close();

  // ev sahibi sekmeyi kapatır: diğerleri onun kopuk olduğunu görür (state.online)
  await host.close();
  const room0=srv.rooms.get(room);
  await others[0].until(c=>Array.isArray(c.P.online)&&!c.P.online.includes(host.me));
  assert.ok(others.every(o=>others[0].P.online.includes(o.me)),'bağlı oyuncular online listesinde');
  // gece süresi dolsun: zamanı ileri sar (kopuk oyuncu bekleme kuralı game.test'te; burada atlanır)
  room0.game.P.waited=true;room0.game.P.ends=Date.now()-1;
  await others[0].until(c=>c.P.phase==='talk'||c.P.phase==='end');
  // 10 dk (testte 300 ms) sonra ev sahipliği oyuncuya geçer
  await others[0].until(c=>c.P.hostId!==host.me);
  assert.ok(others.map(c=>c.me).includes(others[0].P.hostId));

  // kopan oyuncu aynı kimlikle döner: rolü ve durumu aynı
  await others[1].close();
  const back=client('p2','Oyuncu1',{room});
  await back.until(c=>c.P&&c.priv&&c.priv.role);
  assert.strictEqual(back.priv.role.label,roleOf.p2);
  assert.strictEqual(back.P.gameId,others[0].P.gameId);

  // eski ev sahibi de geri gelebilir; artık ev sahibi değildir ama rolü durur
  // (gerçek istemci ev sahibi sekmesinde host:true göndermeyi sürdürür; yetki devredilmiş olsa da kendi oyununa döner)
  const h2=client('h1','Ev',{room,host:true});
  await h2.until(c=>c.priv&&c.priv.role);
  assert.strictEqual(h2.priv.role.label,roleOf.h1);assert.strictEqual(h2.P.room,room);
  assert.strictEqual(h2.me,host.me);assert.notStrictEqual(h2.P.hostId,h2.me);

  // yeni ev sahibi iptal edebilir → herkes lobiye, roller silinir
  const newHost=[others[0],others[2],back].find(c=>c.me===others[0].P.hostId);
  newHost.send({t:'cancel'});
  await h2.until(c=>c.P.phase==='lobby'&&c.priv&&c.priv.role===null);
  for(const c of [others[0],others[2],back,h2])await c.close();
});

test('oy ve sohbet sunucuda doğrulanır',async()=>{
  const host=client('v0','A',{host:true});await host.until(c=>c.P&&c.P.room);
  const room=host.P.room;const cs=[host,...['v1','v2','v3'].map(u=>client(u,u,{room}))];
  await host.until(c=>c.P.lobby.length===4);host.send({t:'start'});
  await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='night')));
  cs[1].send({t:'msg',x:'gece yazamam'});
  const R=srv.rooms.get(room).game;R.P.ends=Date.now()-1;
  await host.until(c=>c.P.phase!=='night');
  if(host.P.phase==='talk'){
    const alive=host.P.players.filter(p=>p.alive);
    const speaker=cs.find(c=>alive.some(p=>p.id===c.me));
    speaker.send({t:'msg',x:'merhaba kasaba'});
    await host.until(c=>c.chat.some(m=>m.t==='merhaba kasaba'));
    assert.ok(!host.chat.some(m=>m.t==='gece yazamam'));
    assert.ok(!('chat' in host.P),'sohbet state içinde değil, ayrı pakette gelir');
    // geç katılan tüm sohbeti bir kerede alır; sonrakiler yalnız yeni satırı
    const late=client('v9','Geç',{room});await late.until(c=>c.chat.some(m=>m.t==='merhaba kasaba'));
    const before=late.chat.length;speaker.send({t:'msg',x:'ikinci'});await late.until(c=>c.chat.length===before+1);
    assert.strictEqual(late.chat[late.chat.length-1].t,'ikinci');await late.close();
    R.P.ends=Date.now()-1;await host.until(c=>c.P.phase==='vote');
    // olmayan kişiye oy sayılmaz; herkes oy verince faz kendiliğinden geçer
    speaker.send({t:'vote',v:'kimseyok'});await new Promise(r=>setTimeout(r,100));assert.deepStrictEqual(host.P.voted,[]);
    const voters=cs.filter(c=>alive.some(p=>p.id===c.me));
    voters.forEach(c=>c.send({t:'vote',v:'skip'}));
    await host.until(c=>c.P.phase==='night'||c.P.phase==='end');
  }
  for(const c of cs)await c.close();
});

test('lobiden kopan üye silinir; 13 kişiyle oyun başlamaz; ev sahibi odayı kapatır',async()=>{
  const host=client('k0','A',{host:true});await host.until(c=>c.P&&c.P.room);
  const room=host.P.room;const r=srv.rooms.get(room);
  const guest=client('k1','B',{room});await host.until(c=>c.P.lobby.length===2);
  await guest.close();await host.until(c=>c.P.lobby.length===1);
  assert.strictEqual(r.members.size,1,'kopan lobi üyesi bellekte kalmamalı');
  const cs=[];for(let i=1;i<=12;i++)cs.push(client('k'+i,'O'+i,{room}));
  await host.until(c=>c.P.lobby.length===13,5000);
  host.send({t:'start'});await host.until(c=>c.errs.some(e=>e.code==='soft'));assert.strictEqual(host.P.phase,'lobby');
  host.send({t:'close'});
  await cs[0].until(c=>c.errs.some(e=>e.code==='closed'));assert.ok(!srv.rooms.has(room));
  for(const c of [host,...cs])await c.close();
});

test('aynı soket üst üste oda kurunca boş odalar birikmez; boş oda süresi dolunca kapanır',async()=>{
  const before=srv.rooms.size;
  const c=client('r0','A',{host:true});await c.until(c=>c.P&&c.P.room);
  let prev=c.P.room;
  for(let i=0;i<5;i++){c.send({t:'join',uid:'r0',name:'A',host:true});await c.until(x=>x.P.room!==prev);prev=c.P.room}
  assert.strictEqual(srv.rooms.size,before+1,'terk edilen boş lobi odaları hemen silinmeli');
  await c.close();
  await new Promise(r=>setTimeout(r,700));
  assert.ok(!srv.rooms.has(prev),'kimsenin kalmadığı oda EMPTY_ROOM_MS sonra kapanmalı');
});

test('ev sahibinin eski kodu başkasının odası çıkarsa yeni oda alır',async()=>{
  const a=client('s0','A',{host:true});await a.until(c=>c.P&&c.P.room);const code=a.P.room;
  const b=client('s1','B',{host:true,room:code}); // "önceki odamı aç": kod artık a'nın odası
  await b.until(c=>c.P&&c.P.room);
  assert.notStrictEqual(b.P.room,code,'yabancının lobisine oyuncu olarak düşmemeli');
  assert.strictEqual(b.P.hostId,b.me);
  await new Promise(r=>setTimeout(r,100));assert.strictEqual(a.P.lobby.length,1);
  await a.close();await b.close();
});

test('iptalden sonra çevrimdışı üyeler bellekte kalmaz; yeni katılan tek priv alır',async()=>{
  const host=client('m0','A',{host:true});await host.until(c=>c.P&&c.P.room);const room=host.P.room;
  const cs=['m1','m2','m3'].map(u=>client(u,u,{room}));await host.until(c=>c.P.lobby.length===4);
  await new Promise(r=>setTimeout(r,150));
  for(const c of cs)assert.strictEqual(c.privN,1,c.uid+' katılırken priv bir kez gelmeli');
  host.send({t:'start'});await Promise.all([host,...cs].map(c=>c.until(c=>c.P.phase==='night'&&c.priv.role)));
  await cs[0].close();await new Promise(r=>setTimeout(r,100));
  const r=srv.rooms.get(room);assert.strictEqual(r.members.size,4,'oyundaki oyuncu kopsa da kaydı durur');
  host.send({t:'cancel'});await host.until(c=>c.P.phase==='lobby');
  await new Promise(r=>setTimeout(r,100));
  assert.strictEqual(r.members.size,3,'lobide çevrimdışı üye kalmamalı');assert.ok(!r.lastPriv.has(cs[0].me));
  for(const c of [host,cs[1],cs[2]])await c.close();
});
