'use strict';
// Sunucu testleri: gerçek WebSocket bağlantılarıyla oda, oyun, kopma ve geri dönme.
process.env.HOST_GRACE_MS='300';
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
  const c={ws,uid,P:null,priv:null,errs:[],states:0,
    send:m=>ws.send(JSON.stringify(m)),
    until(f,ms=3000){return new Promise((res,rej)=>{const t0=Date.now();const iv=setInterval(()=>{if(f(c)){clearInterval(iv);res(c)}else if(Date.now()-t0>ms){clearInterval(iv);rej(new Error(uid+' beklenen duruma gelmedi'))}},10)})},
    close(){return new Promise(r=>{ws.once('close',r);ws.close()})}};
  ws.on('message',d=>{const m=JSON.parse(d);if(m.t==='state'){c.P=m.P;c.states++;c.raw=String(d)}else if(m.t==='priv')c.priv=m.d;else if(m.t==='err')c.errs.push(m)});
  ws.on('open',()=>c.send({t:'join',uid,name,color:G.COLORS[0],hat:'cap',...join}));
  return c;
}

test('statik sayfa ve sağlık uç noktası',async()=>{
  const get=p=>new Promise((res,rej)=>http.get('http://'+base+p,r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>res({s:r.statusCode,b}))}).on('error',rej));
  const a=await get('/');assert.strictEqual(a.s,200);assert.match(a.b,/Kasaba Gecesi/);
  assert.strictEqual((await get('/saglik')).s,200);
  assert.strictEqual((await get('/../server.js')).s,404);
});

test('olmayan odaya katılma hata verir',async()=>{
  const c=client('x1','Ali',{room:'yokboyle'});
  await c.until(c=>c.errs.length);assert.strictEqual(c.errs[0].code,'noroom');await c.close();
});

test('oda kur, katıl, oyna; ev sahibi kopunca oyun sürer; kopan oyuncu geri döner',async()=>{
  const host=client('h1','Ev',{host:true,settings:{night:20,talk:20,vote:20}});
  await host.until(c=>c.P&&c.P.room);
  const room=host.P.room;assert.strictEqual(host.P.hostId,'h1');
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

  // ev sahibi sekmeyi kapatır
  await host.close();
  const room0=srv.rooms.get(room);
  // gece süresi dolsun: zamanı ileri sar
  room0.game.P.ends=Date.now()-1;
  await others[0].until(c=>c.P.phase==='talk'||c.P.phase==='end');
  // 10 dk (testte 300 ms) sonra ev sahipliği oyuncuya geçer
  await others[0].until(c=>c.P.hostId!=='h1');
  assert.ok(['p1','p2','p3'].includes(others[0].P.hostId));

  // kopan oyuncu aynı kimlikle döner: rolü ve durumu aynı
  await others[1].close();
  const back=client('p2','Oyuncu1',{room});
  await back.until(c=>c.P&&c.priv&&c.priv.role);
  assert.strictEqual(back.priv.role.label,roleOf.p2);
  assert.strictEqual(back.P.gameId,others[0].P.gameId);

  // eski ev sahibi de geri gelebilir; artık ev sahibi değildir ama rolü durur
  const h2=client('h1','Ev',{room});
  await h2.until(c=>c.priv&&c.priv.role);
  assert.strictEqual(h2.priv.role.label,roleOf.h1);
  assert.notStrictEqual(h2.P.hostId,'h1');

  // yeni ev sahibi iptal edebilir → herkes lobiye, roller silinir
  const newHost=[others[0],others[2],back].find(c=>c.uid===others[0].P.hostId);
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
    const speaker=cs.find(c=>alive.some(p=>p.id===c.uid));
    speaker.send({t:'msg',x:'merhaba kasaba'});
    await host.until(c=>c.P.chat.some(m=>m.t==='merhaba kasaba'));
    assert.ok(!host.P.chat.some(m=>m.t==='gece yazamam'));
    R.P.ends=Date.now()-1;await host.until(c=>c.P.phase==='vote');
    // olmayan kişiye oy sayılmaz; herkes oy verince faz kendiliğinden geçer
    speaker.send({t:'vote',v:'kimseyok'});await new Promise(r=>setTimeout(r,100));assert.deepStrictEqual(host.P.voted,[]);
    const voters=cs.filter(c=>alive.some(p=>p.id===c.uid));
    voters.forEach(c=>c.send({t:'vote',v:'skip'}));
    await host.until(c=>c.P.phase==='night'||c.P.phase==='end');
  }
  for(const c of cs)await c.close();
});
