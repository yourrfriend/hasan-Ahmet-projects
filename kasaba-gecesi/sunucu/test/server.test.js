'use strict';
// Sunucu testleri: gerçek WebSocket bağlantılarıyla oda, oyun, kopma ve geri dönme.
process.env.HOST_GRACE_MS='300';
process.env.EMPTY_ROOM_MS='300';
process.env.MAX_ROOMS_PER_IP='1000';process.env.MAX_SOCKS_PER_IP='1000';process.env.MAX_ROOMS_PER_IP_MIN='1000'; // testler tek IP'den çok oda açar; sınır testi kendi sunucusunu kurar
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
function client(uid,name,join,b=base){
  const ws=new WebSocket('ws://'+b+'/ws');
  // me: sunucunun verdiği açık kimlik (uid gizli anahtardır, state içinde geçmez); chat: parça parça gelen sohbet
  const c={ws,uid,me:null,P:null,priv:null,privN:0,errs:[],states:0,chat:[],
    send:m=>ws.send(JSON.stringify(m)),
    until(f,ms=3000){return new Promise((res,rej)=>{const t0=Date.now();const iv=setInterval(()=>{if(f(c)){clearInterval(iv);res(c)}else if(Date.now()-t0>ms){clearInterval(iv);rej(new Error(uid+' beklenen duruma gelmedi: '+f.toString().slice(0,120)+' · phase='+(c.P&&c.P.phase)+' errs='+JSON.stringify(c.errs)))}},10)})},
    close(){return new Promise(r=>{if(ws.readyState>=2)return r();ws.once('close',r);ws.close()})}}; // sunucu kapattıysa beklemeden döner
  ws.on('message',d=>{const m=JSON.parse(d);if(m.t==='state'){c.P=m.P;c.states++;c.raw=String(d)}else if(m.t==='you'){c.me=m.id;c.kayitli=!!m.kayitli}else if(m.t==='chat')c.chat.push(...m.a);else if(m.t==='priv'){c.priv=m.d;c.privN++}else if(m.t==='err')c.errs.push(m)});
  ws.on('open',()=>c.send({t:'join',uid,name,color:G.COLORS[0],hat:'cap',...join}));
  return c;
}

test('statik sayfa ve sağlık uç noktası',async()=>{
  const get=p=>new Promise((res,rej)=>http.get('http://'+base+p,r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>res({s:r.statusCode,b}))}).on('error',rej));
  const a=await get('/');assert.strictEqual(a.s,200);assert.match(a.b,/Kasaba Gecesi/);
  const sg=await get('/saglik');assert.strictEqual(sg.s,200);const sgj=JSON.parse(sg.b);assert.ok('surum' in sgj,'/saglik sürümü göstermeli');
  assert.deepStrictEqual(Object.keys(sgj.kayit).sort(),['dusen','hata','kuyruk','yazilan'],'/saglik kayıt sayaçları (yalnız sayılar)');assert.ok(!sg.b.includes('serviceKey'));
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
  const c=client('r0','A',{host:true});await c.until(c=>c.P&&c.P.room);
  let prev=c.P.room;const eski=[];
  for(let i=0;i<5;i++){eski.push(prev);c.send({t:'join',uid:'r0',name:'A',host:true});await c.until(x=>x.P.room!==prev);prev=c.P.room}
  // başka testlerin odaları bu sırada kapanabilir: toplam sayı yerine terk edilen kodlara bak
  assert.ok(eski.every(k=>!srv.rooms.has(k)),'terk edilen boş lobi odaları hemen silinmeli');assert.ok(srv.rooms.has(prev));
  await c.close();
  const t0=Date.now();while(srv.rooms.has(prev)&&Date.now()-t0<2000)await new Promise(r=>setTimeout(r,50));
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

test('sunucu olay günlüğünü her flush\'ta kayit\'a verir; log bellekte birikmez; biten oyunda priv.payin gelir',async()=>{
  const alinan=[];const sahte={kuyrukla:(room,ol)=>{alinan.push(...ol)},kapat(){}};
  const s2=createServer({quiet:true,tickMs:50,kayit:sahte});await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));
  const b2='127.0.0.1:'+s2.server.address().port;
  const host=client('g0','A',{host:true},b2);await host.until(c=>c.P&&c.P.room);const room=host.P.room;
  const cs=[host,...['g1','g2','g3'].map(u=>client(u,u,{room},b2))];await host.until(c=>c.P.lobby.length===4);
  try{
  host.send({t:'start'});await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='night'&&c.priv.role)));
  const R=s2.rooms.get(room).game;
  await new Promise(r=>setTimeout(r,100));
  assert.strictEqual(alinan[0]&&alinan[0].tur,'baslangic');assert.strictEqual(R.log.length,0,'flush sonrası log boş');
  // iki hain + iki masum; ev sahibi (hain) bir masumu öldürür → oyun gece biter
  const ids=R.P.players.map(p=>p.id);ids.forEach((id,i)=>{R.g.roles[id]={key:i<2?'hain':'masum',team:i<2?'imp':'inn',mad:null,uses:{},vest:3,planted:[]}});
  G.act(R,host.me,{kill:ids[2]});R.P.waited=true;R.P.ends=Date.now()-1;
  await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='end'&&c.P.ozet&&c.priv.payin)));
  assert.strictEqual(alinan[alinan.length-1].tur,'bitis');assert.strictEqual(R.log.length,0);
  const kurban=R.P.players.find(p=>p.id===ids[2]).name;
  assert.deepStrictEqual(host.priv.payin.oldurdu,[kurban]);
  // kopup dönen aynı oyuncu payin'i yeniden alır
  await host.close();const back=client('g0','A',{room},b2);await back.until(c=>c.priv&&c.priv.payin);
  assert.deepStrictEqual(back.priv.payin.oldurdu,[kurban]);
  for(const c of [back,...cs.slice(1)])await c.close();
  }finally{await new Promise(r=>s2.close(r))} // başarısızlıkta da kapansın, test süreci asılı kalmasın
});

test('inceleme: oyun sürerken oda silinince günlük iptal ile biter',async()=>{
  const alinan=[];const sahte={kuyrukla:(room,ol)=>{alinan.push(...ol)},kapat(){}};
  const s2=createServer({quiet:true,tickMs:50,kayit:sahte});await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));
  const b2='127.0.0.1:'+s2.server.address().port;
  const host=client('q0','A',{host:true},b2);await host.until(c=>c.P&&c.P.room);const room=host.P.room;
  const cs=[host,...['q1','q2','q3'].map(u=>client(u,u,{room},b2))];await host.until(c=>c.P.lobby.length===4);
  try{
    host.send({t:'start'});await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='night')));
    host.send({t:'close'});await cs[1].until(c=>c.errs.some(e=>e.code==='closed'));
    const turler=alinan.map(e=>e.tur);assert.strictEqual(turler[turler.length-1],'iptal','oda kapanınca son olay iptal olmalı: '+turler.join(','));
    for(const c of cs)await c.close();
  }finally{await new Promise(r=>s2.close(r))}
});

// ---------- Paket 1a: rövanş ----------
// oyunu hızla bitirir: yarısı hain, biri son masumu öldürür → hain ≥ diğerleri → hainler kazanır (gece biter)
function hizliBitir(R){const ids=R.P.players.map(p=>p.id);const h=Math.ceil(ids.length/2);ids.forEach((id,i)=>{R.g.roles[id]={key:i<h?'hain':'masum',team:i<h?'imp':'inn',mad:null,uses:{},vest:3,planted:[]}});
  G.act(R,ids[0],{kill:ids[ids.length-1]});R.P.waited=true;R.P.ends=Date.now()-1}
const bekle=ms=>new Promise(r=>setTimeout(r,ms));
async function odaKur(pre,n,b=base){const host=client(pre+'0','Ev',{host:true},b);await host.until(c=>c.P&&c.P.room);const room=host.P.room;
  const cs=[host];for(let i=1;i<n;i++)cs.push(client(pre+i,'O'+i,{room},b));await host.until(c=>c.P.lobby.length===n);return {host,cs,room}}

test('rövanş: hazır yalnız oyun sonunda kabul edilir; sayaç state ile yayılır; vazgeç düşürür',async()=>{
  const {host,cs,room}=await odaKur('rv',4);
  host.send({t:'start'});await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='night'&&c.priv.role)));
  host.send({t:'hazir',v:true});await bekle(150);assert.deepStrictEqual(host.P.hazir,[],'gece hazır kabul edilmez');
  hizliBitir(srv.rooms.get(room).game);await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='end')));
  cs[1].send({t:'hazir',v:true});await Promise.all(cs.map(c=>c.until(c=>c.P.hazir.includes(cs[1].me))));
  cs[1].send({t:'hazir',v:false});await host.until(c=>!c.P.hazir.includes(cs[1].me));
  for(const c of cs)await c.close();
});

test('rövanş: 3 hazırla başlamaz, 4 ile başlar; hazır olmayan ve kopuk oyuncu rol almaz; iki start tek maç',async()=>{
  const {host,cs,room}=await odaKur('rw',6);const R=()=>srv.rooms.get(room).game;
  host.send({t:'start'});await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='night'&&c.priv.role)));
  const ilkGameId=host.P.gameId;hizliBitir(R());await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='end')));
  cs[1].send({t:'hazir',v:true});cs[2].send({t:'hazir',v:true});await host.until(c=>c.P.hazir.length===2);
  host.send({t:'start',rovans:true}); // ev sahibi hazır sayılır → 3: yetmez
  await host.until(c=>c.errs.some(e=>e.code==='soft'&&/4–12 hazır/.test(e.m)));assert.strictEqual(host.P.phase,'end');
  cs[4].send({t:'hazir',v:true});await host.until(c=>c.P.hazir.includes(cs[4].me));await cs[4].close(); // hazır ama kopuk: sayılmaz
  await host.until(c=>!c.P.online.includes(cs[4].me));
  cs[3].send({t:'hazir',v:true});await host.until(c=>c.P.hazir.includes(cs[3].me));
  host.send({t:'start',rovans:true});
  await Promise.all([host,cs[1],cs[2],cs[3]].map(c=>c.until(c=>c.P.phase==='night'&&c.priv.role)));
  assert.notStrictEqual(host.P.gameId,ilkGameId);const yeniGameId=host.P.gameId;
  assert.deepStrictEqual(host.P.players.map(p=>p.id).sort(),[host,cs[1],cs[2],cs[3]].map(c=>c.me).sort());
  await cs[5].until(c=>c.P.phase==='night').catch(e=>{throw new Error(e.message+' phase='+cs[5].P.phase+' errs='+JSON.stringify(cs[5].errs)+' states='+cs[5].states+' ws='+cs[5].ws.readyState)});assert.strictEqual(cs[5].priv.role,null,'hazır olmayan rol almaz');
  assert.deepStrictEqual(host.P.hazir,[],'yeni maçta hazır bayrakları sıfırlanır');
  host.send({t:'start',rovans:true});await bekle(150);assert.strictEqual(host.P.phase,'night');assert.strictEqual(host.P.gameId,yeniGameId,'ikinci start maç üretmez');
  // önceki maça ait gecikmiş hamle reddedilir (g = eski gameId)
  cs[1].send({t:'act',kill:cs[2].me,d:1,g:ilkGameId});await bekle(100);assert.ok(!R().g.acts[cs[1].me],'eski maçın hamlesi işlenmemeli');
  cs[1].send({t:'act',kill:cs[2].me,d:1,g:yeniGameId});await bekle(100);assert.ok(R().g.acts[cs[1].me]||R().g.roles[cs[1].me].team!=='imp','yeni maçın hamlesi işlenir');
  for(const c of [host,cs[1],cs[2],cs[3],cs[5]])await c.close();
});

test('rövanş: ev sahibi devri hazır bayraklarını korur; yeni ev sahibi başlatır',async()=>{
  const {host,cs,room}=await odaKur('rx',5);
  host.send({t:'start'});await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='night'&&c.priv.role)));
  hizliBitir(srv.rooms.get(room).game);await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='end')));
  for(const c of cs.slice(1))c.send({t:'hazir',v:true});await host.until(c=>c.P.hazir.length===4);
  await host.close();
  await cs[1].until(c=>c.P.hostId!==host.me,3000);
  assert.strictEqual(cs[1].P.hazir.length,4,'devir hazırları silmez');
  const yeni=cs.find(c=>c.me===cs[1].P.hostId);yeni.send({t:'start',rovans:true});
  await Promise.all(cs.slice(1).map(c=>c.until(c=>c.P.phase==='night'&&c.priv.role)));
  assert.strictEqual(yeni.P.players.length,4);
  for(const c of cs.slice(1))await c.close();
});

// ---------- Paket 1a: Bu Akşamın Skoru ----------
test('skor: maç bitince herkes oynadı, kazananlar kazandı; iki flush tek artış; kopuk oyuncu paydada; ölü kazanan sayılır',async()=>{
  const {host,cs,room}=await odaKur('sk',4);const R=()=>srv.rooms.get(room).game;
  host.send({t:'start'});await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='night'&&c.priv.role)));
  assert.deepStrictEqual(host.P.skor,[],'maç bitmeden skor boş');
  await cs[3].close(); // kopuk ama oyunda: paydada kalır
  hizliBitir(R()); // ilk iki oyuncu hain; son oyuncu (kopuk) ölür → hainler kazanır
  await Promise.all(cs.slice(0,3).map(c=>c.until(c=>c.P.phase==='end'&&c.P.skor&&c.P.skor.length===4)));
  const by=Object.fromEntries(host.P.skor.map(s=>[s.id,s]));
  for(const c of cs)assert.deepStrictEqual([by[c.me].oynadi,by[c.me].kazandi],[1,R().P.winner.kazananlar.includes(c.me)?1:0],c.uid);
  assert.strictEqual(host.P.skor.filter(s=>s.kazandi===1).length,2);
  assert.deepStrictEqual(host.P.skor.map(s=>s.kazandi),[1,1,0,0],'kazandı azalan sıralı');
  // ikinci flush (hazır mesajı yayın tetikler) skoru değiştirmez
  host.send({t:'hazir',v:true});await host.until(c=>c.P.hazir.includes(host.me));
  assert.deepStrictEqual(host.P.skor.map(s=>[s.oynadi,s.kazandi]),[[1,1],[1,1],[1,0],[1,0]]);
  for(const c of cs.slice(0,3))await c.close();
});

test('skor: iptal sayılmaz; rövanşta birikir; ad değişir; ev sahibi devri korur',async()=>{
  const {host,cs,room}=await odaKur('sl',4);const R=()=>srv.rooms.get(room).game;
  host.send({t:'start'});await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='night'&&c.priv.role)));
  host.send({t:'cancel'});await host.until(c=>c.P.phase==='lobby');assert.deepStrictEqual(host.P.skor,[],'iptal skor işlemez');
  host.send({t:'start'});await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='night'&&c.priv.role)));
  hizliBitir(R());await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='end'&&c.P.skor.length===4)));
  for(const c of cs)c.send({t:'hazir',v:true});await host.until(c=>c.P.hazir.length===4);
  host.send({t:'start',rovans:true});await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='night'&&c.P.skor.length===4)));
  hizliBitir(R());await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='end'&&c.P.skor.every(s=>s.oynadi===2))));
  assert.strictEqual(host.P.skor.reduce((a,s)=>a+s.kazandi,0),4,'iki maçta ikişer kazanan');
  cs[1].send({t:'look',name:'YeniAd'});await host.until(c=>c.P.skor.some(s=>s.id===cs[1].me&&s.ad==='YeniAd'));
  await host.close();await cs[1].until(c=>c.P.hostId!==host.me,3000);
  assert.ok(cs[1].P.skor.every(s=>s.oynadi===2),'devir skoru korur');
  for(const c of cs.slice(1))await c.close();
});

// ---------- Paket 1a: ölçüm olayları ----------
test('ölçüm olayları kayıt yuvasına gider, maç damgası taşır, içerik taşımaz',async()=>{
  const alinan=[];const sahte={kuyrukla:(room,ol)=>{alinan.push(...ol)},kapat(){}};
  const s2=createServer({quiet:true,tickMs:50,kayit:sahte});await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));
  const b2='127.0.0.1:'+s2.server.address().port;
  try{
    const {host,cs,room}=await odaKur('ol',4,b2);const R=()=>s2.rooms.get(room).game;
    host.send({t:'start'});await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='night'&&c.priv.role)));const g1=host.P.gameId;
    await cs[3].close();await host.until(c=>!c.P.online.includes(cs[3].me));
    const geri=client('ol3','O3',{room},b2);await geri.until(c=>c.priv&&c.priv.role);await host.until(c=>c.P.online.includes(geri.me));
    hizliBitir(R());await Promise.all([host,cs[1],cs[2],geri].map(c=>c.until(c=>c.P.phase==='end')));
    host.send({t:'gordum'});host.send({t:'gordum'});cs[1].send({t:'hazir',v:true});await host.until(c=>c.P.hazir.length===1);
    for(const c of [cs[2],geri])c.send({t:'hazir',v:true});await host.until(c=>c.P.hazir.length===3);
    await bekle(150);assert.ok(!R().gameLog.some(e=>['hazir','son_ekran_goruldu','kopus','dondu'].includes(e.tur)),'ölçüm olayları gameLog\'a girmez: '+R().gameLog.map(e=>e.tur).join(','));
    const stBefore=host.states;host.send({t:'gordum'});cs[1].send({t:'hazir',v:true});await bekle(200);assert.strictEqual(host.states,stBefore,'tekrarlanan gordum/hazır yayın tetiklemez');
    host.send({t:'start',rovans:true});await Promise.all([host,cs[1],cs[2],geri].map(c=>c.until(c=>c.P.phase==='night'&&c.P.gameId!==g1)));
    await bekle(150);
    const tur=t=>alinan.filter(e=>e.tur===t);
    assert.ok(alinan.every(e=>'oyun' in e),'her olay oyun damgası taşır');
    assert.deepStrictEqual(tur('kopus').map(e=>[e.veri.kim,e.gun,e.faz,e.veri.olu,e.oyun]),[[cs[3].me,1,'night',false,g1]]); // gün/faz zarfta

    assert.deepStrictEqual(tur('dondu').map(e=>[e.veri.kim,e.oyun]),[[geri.me,g1]]);
    assert.deepStrictEqual(tur('son_ekran_goruldu').map(e=>[e.veri.kim,e.oyun]),[[host.me,g1]],'gordum tekil');
    assert.deepStrictEqual(tur('hazir').map(e=>[e.veri.kim,e.veri.v,e.oyun]),[[cs[1].me,true,g1],[cs[2].me,true,g1],[geri.me,true,g1]]);
    const rb=tur('rovans_basladi');assert.strictEqual(rb.length,1);assert.strictEqual(rb[0].veri.onceki,g1);assert.deepStrictEqual(rb[0].veri.oyuncular.sort(),[host,cs[1],cs[2],geri].map(c=>c.me).sort());
    const bas=tur('baslangic');assert.strictEqual(bas.length,2);assert.strictEqual(bas[1].veri.rovans,true);assert.strictEqual(bas[1].veri.onceki,g1);assert.strictEqual(bas[1].oyun,host.P.gameId);
    for(const e of [...tur('kopus'),...tur('dondu'),...tur('son_ekran_goruldu'),...tur('hazir'),...tur('rovans_basladi')]){const j=JSON.stringify(e.veri);for(const k of ['"rol"','"hedef"','"x"','"oy"','"guess"','"kill"'])assert.ok(!j.includes(k),'içerik taşımaz: '+j)}
    for(const c of [host,cs[1],cs[2],geri])await c.close();
  }finally{await new Promise(r=>s2.close(r))}
});

// ---------- oda kodu ve IP sınırları ----------
test('oda kodu 12 karakter ve yalnız sunucu üretir; ev sahibinin artık olmayan eski kodu kullanılmaz',async()=>{
  const eski='abcdefghjkmn';
  const a=client('kc0','A',{host:true,room:eski});await a.until(c=>c.P&&c.P.room);
  assert.match(a.P.room,/^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/,'kod 12 karakter, karışan harfler yok: '+a.P.room);
  assert.notStrictEqual(a.P.room,eski,'istemcinin verdiği kod kullanılmaz');
  assert.ok(!srv.rooms.has(eski));
  const b=client('kc1','B',{host:true});await b.until(c=>c.P&&c.P.room);assert.notStrictEqual(b.P.room,a.P.room);
  await a.close();await b.close();
});

test('IP başına sınır: ev sahipliği odası ve eşzamanlı soket',async()=>{
  const s2=createServer({quiet:true,tickMs:50,ipOda:2,ipSoket:4,ipOdaDakika:100});await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));
  const b2='127.0.0.1:'+s2.server.address().port;const acik=[];
  try{
    const h1=client('ip0','A',{host:true},b2);await h1.until(c=>c.P&&c.P.room);acik.push(h1);
    const h2=client('ip1','B',{host:true},b2);await h2.until(c=>c.P&&c.P.room);acik.push(h2);
    const h3=client('ip2','C',{host:true},b2);await h3.until(c=>c.errs.length);acik.push(h3);
    assert.strictEqual(h3.errs[0].code,'limit','üçüncü oda aynı IP için reddedilir: '+JSON.stringify(h3.errs));
    assert.strictEqual(s2.rooms.size,2);
    await h2.close();{const t0=Date.now();while(s2.rooms.size>1&&Date.now()-t0<3000)await new Promise(r=>setTimeout(r,50))}assert.strictEqual(s2.rooms.size,1,'boş oda EMPTY_ROOM_MS sonra silinir, yer açılır');
    const h4=client('ip3','D',{host:true},b2);await h4.until(c=>c.P&&c.P.room);acik.push(h4);
    // soket sınırı (4): şu an 3 açık (h1, h3 — hata aldı ama soketi açık —, h4); 4. açılır, 5. kapatılır
    const s5=client('ip4','E',{room:h1.P.room},b2);await s5.until(c=>c.P&&c.P.room);acik.push(s5);
    const s6=client('ip5','F',{room:h1.P.room},b2);acik.push(s6);
    await new Promise(r=>setTimeout(r,300));assert.ok(s6.ws.readyState>=2||s6.errs.some(e=>e.code==='limit'),'sınırı aşan soket aynı IP için kabul edilmez');
  }finally{for(const c of acik)await c.close();await new Promise(r=>s2.close(r))}
});

// ---------- Plan 3: kimlik ----------
const get=(b,p)=>new Promise((res,rej)=>http.get('http://'+b+p,r=>{let s='';r.on('data',d=>s+=d);r.on('end',()=>res({s:r.statusCode,b:s,h:r.headers}))}).on('error',rej));
test('/ayar.json yalnız açık ayarları döner; ayarsızken kayıt kapalı; /sayfa/supabase.js sunulur',async()=>{
  const a=await get(base,'/ayar.json');assert.strictEqual(a.s,200);assert.deepStrictEqual(JSON.parse(a.b),{url:null,anonKey:null,kurulum:null,kayit:false});
  const s2=createServer({quiet:true,tickMs:50,jwksAlma:false,ayar:{url:'https://x.example',anonKey:'anon-abc',serviceKey:'srv-gizli',jwtSecret:'jwt-gizli',kurulum:'kasaba-test'}});
  await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;
  try{
    const r=await get(b2,'/ayar.json');assert.deepStrictEqual(JSON.parse(r.b),{url:'https://x.example',anonKey:'anon-abc',kurulum:'kasaba-test',kayit:true});
    assert.ok(!r.b.includes('srv-gizli')&&!r.b.includes('jwt-gizli'),'gizli anahtarlar /ayar.json\'da geçmez');
    const js=await get(b2,'/sayfa/supabase.js');assert.strictEqual(js.s,200);assert.match(js.h['content-type'],/javascript/);assert.match(js.b,/createClient/);
    assert.strictEqual((await get(b2,'/sayfa/../sunucu/server.js')).s,404);assert.strictEqual((await get(b2,'/sayfa/yok.js')).s,404);
  }finally{await new Promise(r=>s2.close(r))}
});

const Kimlik=require('../kimlik.js');const crypto=require('crypto');
const pubIdOf=key=>crypto.createHash('sha256').update('kg:'+key).digest('base64url').slice(0,12);
test('join{token}: geçerli/süresi dolmuş token kimliği sub\'dan verir; sahte token misafir; secret yoksa token yok sayılır',async()=>{
  const GIZLI='test-jwt-gizli';const SUB='11111111-2222-4333-8444-555555555555';const simdi=Math.floor(Date.now()/1000);
  const s2=createServer({quiet:true,tickMs:50,jwksAlma:false,ayar:{url:'https://x.example',anonKey:'a',serviceKey:'s',jwtSecret:GIZLI,kurulum:'t'}});
  await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;const acik=[];
  try{
    const tok=Kimlik.imzala({sub:SUB,exp:simdi+3600,role:'authenticated',is_anonymous:true},GIZLI);
    const a=client('tk0','A',{host:true,token:tok},b2);await a.until(c=>c.P&&c.P.room);acik.push(a);const room=a.P.room;
    assert.strictEqual(a.me,pubIdOf('sb:'+SUB),'kimlik token sub\'ından türer');assert.strictEqual(a.kayitli,true);
    assert.ok(!a.raw.includes(SUB),'uuid yayınlarda geçmez');
    // aynı token, başka kg_uid → aynı açık kimlik (ikinci sekme)
    const a2=client('baska-uid','A',{room,token:tok},b2);await a2.until(c=>c.me);acik.push(a2);assert.strictEqual(a2.me,a.me);
    // sahte imza → misafir (kg_uid yolu), hata yok
    const sahte=Kimlik.imzala({sub:SUB,exp:simdi+3600},'yanlis');
    const g=client('tk1','G',{room,token:sahte},b2);await g.until(c=>c.me);acik.push(g);assert.strictEqual(g.me,pubIdOf('tk1'));assert.strictEqual(g.kayitli,false);assert.deepStrictEqual(g.errs,[]);
    // oyun sürerken kop, süresi dolmuş token'la dön → aynı koltuk
    const cs=['tk2','tk3'].map(u=>client(u,u,{room},b2));acik.push(...cs);await a.until(c=>c.P.lobby.length===4);
    a.send({t:'start'});await Promise.all([a,g,...cs].map(c=>c.until(c=>c.P.phase==='night'&&c.priv.role)));const rol=a.priv.role.label;
    await a.close();await a2.close();await g.until(c=>!c.P.online.includes(a.me));
    const eski=Kimlik.imzala({sub:SUB,exp:simdi-100,role:'authenticated'},GIZLI);
    const d=client('yeni-cihaz','A',{room,token:eski},b2);await d.until(c=>c.priv&&c.priv.role);acik.push(d);
    assert.strictEqual(d.me,a.me);assert.strictEqual(d.priv.role.label,rol,'süresi dolmuş token koltuğu geri verir');assert.strictEqual(d.kayitli,true);
  }finally{for(const c of acik)await c.close();await new Promise(r=>s2.close(r))}
  // jwtSecret yok (varsayılan sunucu): token yok sayılır
  const tok2=Kimlik.imzala({sub:SUB,exp:simdi+3600},GIZLI);
  const e=client('tk9','E',{host:true,token:tok2});await e.until(c=>c.P&&c.P.room);assert.strictEqual(e.me,pubIdOf('tk9'));assert.strictEqual(e.kayitli,false);await e.close();
});

test('kayıtlı oyuncunun adı/rengi değişince kayit.profil çağrılır; misafirde çağrılmaz',async()=>{
  const GIZLI='p-gizli';const SUB='22222222-3333-4444-8555-666666666666';const cagri=[];
  const sahte={kuyrukla(){},profil:(uye,v)=>cagri.push([uye,v]),kapat(){},sayac:{}};
  const s2=createServer({quiet:true,tickMs:50,jwksAlma:false,kayit:sahte,ayar:{url:'https://x',anonKey:'a',serviceKey:'s',jwtSecret:GIZLI,kurulum:'t'}});
  await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;
  try{
    const tok=Kimlik.imzala({sub:SUB,exp:Math.floor(Date.now()/1000)+600},GIZLI);
    const a=client('pr0','Ece',{host:true,token:tok,color:G.COLORS[1],hat:'bow'},b2);await a.until(c=>c.P&&c.P.room);
    assert.deepStrictEqual(cagri[cagri.length-1],[SUB,{ad:'Ece',renk:G.COLORS[1],sapka:'bow'}],'join\'de profil yazılır');
    a.send({t:'look',name:'Ece2'});await a.until(c=>c.P.lobby.some(p=>p.name==='Ece2'));
    assert.deepStrictEqual(cagri[cagri.length-1],[SUB,{ad:'Ece2',renk:G.COLORS[1],sapka:'bow'}]);
    const n=cagri.length;const g=client('pr1','Mis',{room:a.P.room},b2);await g.until(c=>c.me);g.send({t:'look',name:'Mis2'});await bekle(100);
    assert.strictEqual(cagri.length,n,'misafir için profil yazılmaz');
    await a.close();await g.close();
  }finally{await new Promise(r=>s2.close(r))}
});

test('join{token}: ES256 token sunucuya verilen JWKS ile doğrulanır (self-hosted Supabase)',async()=>{
  const ec=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});const SUB='33333333-4444-4555-8666-777777777777';
  const jwks={keys:[{...ec.publicKey.export({format:'jwk'}),kid:'k1',alg:'ES256',use:'sig'}]};
  const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const data=b64({alg:'ES256',typ:'JWT',kid:'k1'})+'.'+b64({sub:SUB,exp:Math.floor(Date.now()/1000)+60,is_anonymous:true});
  const tok=data+'.'+crypto.sign('sha256',Buffer.from(data),{key:ec.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  const s2=createServer({quiet:true,tickMs:50,jwksAlma:false,ayar:{url:'https://x',anonKey:'a',serviceKey:'s',jwks:Buffer.from(JSON.stringify(jwks)).toString('base64'),kurulum:'t'}}); // base64 metin: env'den geldiği biçim
  await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;
  try{const a=client('es0','A',{host:true,token:tok},b2);await a.until(c=>c.P&&c.P.room);assert.strictEqual(a.kayitli,true);assert.strictEqual(a.me,pubIdOf('sb:'+SUB));await a.close()}
  finally{await new Promise(r=>s2.close(r))}
});

test('JWKS: ilk çekim başarısızsa yeniden dener; bilinmeyen kid gelince (anahtar dönünce) yeniden çeker',async()=>{
  const ec=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'}),ec2=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
  const jwk=(k,kid)=>({...k.publicKey.export({format:'jwk'}),kid,alg:'ES256',use:'sig'});const SUB='44444444-5555-4666-8777-888888888888';
  const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const tok=(kid,priv)=>{const d=b64({alg:'ES256',typ:'JWT',kid})+'.'+b64({sub:SUB,exp:Math.floor(Date.now()/1000)+60});return d+'.'+crypto.sign('sha256',Buffer.from(d),{key:priv,dsaEncoding:'ieee-p1363'}).toString('base64url')};
  let kaynak=[()=>{throw new Error('bağlantı yok')},()=>({keys:[jwk(ec,'k1')]}),()=>({keys:[jwk(ec,'k1'),jwk(ec2,'k2')]})];let cagri=0;
  const s2=createServer({quiet:true,tickMs:50,ayar:{url:'https://x',anonKey:'a',serviceKey:'s',kurulum:'t'},jwksGetirici:async()=>{cagri++;return kaynak.shift()()},jwksDenemeMs:[60,60,60],jwksYenilemeMs:0});
  await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;
  try{
    await new Promise(r=>setTimeout(r,250)); // ilk deneme düşer, ikinci 60 ms sonra başarır
    assert.strictEqual(cagri,2,'başarısız çekim yeniden denenir');
    const a=client('jw0','A',{host:true,token:tok('k1',ec.privateKey)},b2);await a.until(c=>c.P&&c.P.room);assert.strictEqual(a.kayitli,true);await a.close();
    // anahtar döndü: k2 ile imzalı token → bilinmeyen kid → yeniden çek → aynı join'de doğrulanır (yenileme beklemesiz, test ayarı)
    const b=client('jw1','B',{host:true,token:tok('k2',ec2.privateKey)},b2);await b.until(c=>c.P&&c.P.room);
    assert.strictEqual(cagri,3,'bilinmeyen kid yeniden çekim tetikler');assert.strictEqual(b.kayitli,true,'döndürülen anahtarla imzalı token kabul edilir');await b.close();
  }finally{await new Promise(r=>s2.close(r))}
});

// ---------- Plan 4: kayıt ----------
const {taklitRest}=require('./taklit-rest.js');
test('kayıt: kayıtlı ev sahibinin maçı taklit Supabase\'e yazılır; rövanş aynı kasabaya; iptal; misafir ev sahibi yazılmaz',async()=>{
  const t=await taklitRest();const GIZLI='k-gizli';const SUB='55555555-6666-4777-8888-999999999999';
  const s2=createServer({quiet:true,tickMs:50,jwksAlma:false,ayar:{url:t.url,anonKey:'a',serviceKey:'srv',jwtSecret:GIZLI,kurulum:'test-kur'}});
  await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;const R=code=>s2.rooms.get(code).game;
  const tablo=n=>t.T[n];const kadar=async(f,ms=6000)=>{const t0=Date.now();while(!f()&&Date.now()-t0<ms)await bekle(30);assert.ok(f(),'beklenen kayıt gelmedi')};
  try{
    const tok=Kimlik.imzala({sub:SUB,exp:Math.floor(Date.now()/1000)+600},GIZLI);
    const host=client('ky0','Ece',{host:true,token:tok},b2);await host.until(c=>c.P&&c.P.room);const room=host.P.room;
    const cs=[host,...['ky1','ky2','ky3'].map(u=>client(u,u,{room},b2))];await host.until(c=>c.P.lobby.length===4);
    host.send({t:'start'});await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='night'&&c.priv.role)));const oyunId=host.P.oyunId;
    await kadar(()=>tablo('oyunlar').length===1&&tablo('oyun_oyunculari').length===4&&tablo('olaylar').some(o=>o.tur==='baslangic'));
    assert.deepStrictEqual([tablo('oyunlar')[0].id,tablo('oyunlar')[0].kurulum,tablo('oyunlar')[0].oda_kodu,tablo('oyunlar')[0].sonuc],[oyunId,'test-kur',room,'devam']);
    assert.deepStrictEqual(tablo('kasabalar').map(k=>[k.ad,k.sahip]),[["Ece'nin Kasabası",SUB]]);
    assert.strictEqual(tablo('oyun_oyunculari').filter(p=>p.uye).length,1,'yalnız ev sahibi kayıtlı');
    hizliBitir(R(room));await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='end')));
    await kadar(()=>tablo('oyunlar')[0].sonuc==='bitti'&&tablo('oyun_oyunculari').every(p=>p.rol_key));
    assert.strictEqual(tablo('oyunlar')[0].kazanan_takim,'imp');assert.ok(tablo('olaylar').some(o=>o.tur==='bitis'&&o.oyun_id===oyunId));
    // rövanş: yeni oyun, aynı kasaba, olaylarda rovans_basladi
    for(const c of cs)c.send({t:'hazir',v:true});await host.until(c=>c.P.hazir.length===4);host.send({t:'start',rovans:true});
    await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='night'&&c.P.oyunId!==oyunId)));const oyun2=host.P.oyunId;
    await kadar(()=>tablo('oyunlar').length===2);assert.strictEqual(tablo('oyunlar')[1].kasaba_id,tablo('oyunlar')[0].kasaba_id);assert.strictEqual(tablo('kasabalar').length,1);
    assert.ok(tablo('olaylar').some(o=>o.tur==='rovans_basladi'&&o.oyun_id===oyunId),'rövanş olayı önceki maça yazılır');
    // süren maçta iptal
    host.send({t:'cancel'});await host.until(c=>c.P.phase==='lobby');await kadar(()=>tablo('oyunlar')[1].sonuc==='iptal');assert.ok(tablo('oyunlar')[1].bitis);
    for(const c of cs)await c.close();
    // misafir ev sahibi: hiçbir istek yok
    const n=t.istekler.length;const g=client('ky9','Mis',{host:true},b2);await g.until(c=>c.P&&c.P.room);const gr=g.P.room;
    const gs=[g,...['ky8','ky7','ky6'].map(u=>client(u,u,{room:gr},b2))];await g.until(c=>c.P.lobby.length===4);g.send({t:'start'});await Promise.all(gs.map(c=>c.until(c=>c.P.phase==='night')));
    await bekle(400);assert.strictEqual(t.istekler.length,n,'misafir ev sahibi: istek yok');assert.strictEqual(tablo('oyunlar').length,2);
    for(const c of gs)await c.close();
  }finally{await new Promise(r=>s2.close(r));await t.kapat()}
});
