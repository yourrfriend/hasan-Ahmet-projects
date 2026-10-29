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
  const c={ws,uid,me:null,P:null,priv:null,privN:0,errs:[],states:0,chat:[],diger:[],
    send:m=>ws.send(JSON.stringify(m)),
    until(f,ms=3000){return new Promise((res,rej)=>{const t0=Date.now();const iv=setInterval(()=>{if(f(c)){clearInterval(iv);res(c)}else if(Date.now()-t0>ms){clearInterval(iv);rej(new Error(uid+' beklenen duruma gelmedi: '+f.toString().slice(0,120)+' · phase='+(c.P&&c.P.phase)+' errs='+JSON.stringify(c.errs)))}},10)})},
    close(){return new Promise(r=>{if(ws.readyState>=2)return r();ws.once('close',r);ws.close()})}}; // sunucu kapattıysa beklemeden döner
  ws.on('message',d=>{const m=JSON.parse(d);if(m.t==='state'){c.P=m.P;c.states++;c.raw=String(d)}else if(m.t==='you'){c.me=m.id;c.kayitli=!!m.kayitli}else if(m.t==='chat')c.chat.push(...m.a);else if(m.t==='priv'){c.priv=m.d;c.privN++}else if(m.t==='err')c.errs.push(m);else c.diger.push(m)});
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
  const a=await get(base,'/ayar.json');assert.strictEqual(a.s,200);assert.deepStrictEqual(JSON.parse(a.b),{url:null,anonKey:null,kurulum:null,kayit:false,eposta:false,turnstile:null});
  const s2=createServer({quiet:true,tickMs:50,jwksAlma:false,ayar:{url:'https://x.example',anonKey:'anon-abc',serviceKey:'srv-gizli',jwtSecret:'jwt-gizli',kurulum:'kasaba-test'}});
  await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;
  try{
    const r=await get(b2,'/ayar.json');assert.deepStrictEqual(JSON.parse(r.b),{url:'https://x.example',anonKey:'anon-abc',kurulum:'kasaba-test',kayit:true,eposta:false,turnstile:null});
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

// ---------- Paket 1b: hızlı ifade yolu ----------
test('hızlı ifade: sohbete düşer, bekleme err soft, kopup dönen oyuncunun sayacı sürer',async()=>{
  const {host,cs,room}=await odaKur('hz',4);const R=()=>srv.rooms.get(room).game;
  host.send({t:'start'});await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='night'&&c.priv.role)));
  R().P.waited=true;R().P.ends=Date.now()-1;await Promise.all(cs.map(c=>c.until(c=>c.P.phase==='talk')));
  cs[1].send({t:'hizli',k:'rol',rol:'doktor',d:1,n:'x1'});await host.until(c=>c.chat.some(m=>m.kisa==='rol'&&m.t==='🗣️ Rolüm: Doktor'&&m.id===cs[1].me));
  cs[1].send({t:'hizli',k:'koru',d:1,n:'x2'});await cs[1].until(c=>c.errs.some(e=>e.code==='soft'&&/Biraz bekle/.test(e.m)));
  await cs[1].close();const geri=client('hz1','O1',{room});await geri.until(c=>c.priv&&c.priv.role);
  geri.send({t:'hizli',k:'koru',d:1,n:'x3'});await geri.until(c=>c.errs.some(e=>/Biraz bekle/.test(e.m)),3000);
  assert.ok(!host.chat.some(m=>m.kisa==='koru'),'bekleme içinde ikinci ifade sohbete düşmez');
  for(const c of [host,cs[2],cs[3],geri])await c.close();
});

// ---------- Plan 5: sayfa yolları ----------
const H=require('../hesap.js');
const postJ=(b,p,govde,h)=>new Promise((res,rej)=>{const r=http.request('http://'+b+p,{method:'POST',headers:{'Content-Type':'application/json',...(h||{})}},r2=>{let s='';r2.on('data',d=>s+=d);r2.on('end',()=>res({s:r2.statusCode,b:s,h:r2.headers}))});r.on('error',rej);r.end(govde)});
test('kanca: imzalı GoTrue isteği mail gönderir (200 {}); aynı webhook-id tekrar → mail yok; imzasız 401; sırsız kurulumda 404; /ayar.json eposta; /saglik sayaçları',async()=>{
  const SIR='v1,whsec_'+Buffer.from('kanca-sirri').toString('base64');const mailler=[];
  const eposta={kodMaili:require('../eposta.js').kodMaili,sendTransactionalEmail:async m=>{mailler.push(m);return {ok:true,id:'e'}}};
  const srv=createServer({quiet:true,jwksAlma:false,ayar:{url:'http://127.0.0.1:1',anonKey:'anon',serviceKey:'srv',jwtSecret:'x',kurulum:'t',kancaSirri:SIR},eposta});
  await new Promise(r=>srv.server.listen(0,'127.0.0.1',r));const base='127.0.0.1:'+srv.server.address().port;
  try{
    const govde=JSON.stringify({user:{id:'u1',email:'kisi@ornek.com'},email_data:{token:'123456',email_action_type:'magiclink'}});
    const bas=H.imzala({sir:SIR,id:'msg_a',ts:Math.floor(Date.now()/1000),govde});
    const a=await postJ(base,'/eposta/kanca',govde,bas);assert.strictEqual(a.s,200,a.b);assert.strictEqual(a.b,'{}');assert.strictEqual(mailler.length,1);assert.strictEqual(mailler[0].to,'kisi@ornek.com');assert.match(mailler[0].subject,/123456/);
    const b=await postJ(base,'/eposta/kanca',govde,bas);assert.strictEqual(b.s,200);assert.strictEqual(mailler.length,1,'aynı webhook-id → ikinci mail yok');
    const c=await postJ(base,'/eposta/kanca',govde,{});assert.strictEqual(c.s,401);assert.strictEqual(JSON.parse(c.b).error.http_code,401);
    const kotu=H.imzala({sir:'v1,whsec_'+Buffer.from('baska').toString('base64'),id:'msg_b',ts:Math.floor(Date.now()/1000),govde});
    assert.strictEqual((await postJ(base,'/eposta/kanca',govde,kotu)).s,401);
    assert.strictEqual((await postJ(base,'/',govde,{})).s,405,'diğer POST yolları 405 kalır');
    const ayar=JSON.parse((await getH(base,'/ayar.json')).b);assert.strictEqual(ayar.eposta,true);assert.strictEqual(ayar.kancaSirri,undefined,'sır /ayar.json\'a girmez');
    const sag=JSON.parse((await getH(base,'/saglik')).b);assert.deepStrictEqual(sag.eposta,{gonderilen:1,hata:0,atlanan:0,sinir:0,kota:0});
    const buyuk='{"a":"'+'x'.repeat(70000)+'"}';const d=await postJ(base,'/eposta/kanca',buyuk,H.imzala({sir:SIR,id:'msg_c',ts:Math.floor(Date.now()/1000),govde:buyuk}));assert.strictEqual(d.s,413);
  }finally{await new Promise(r=>srv.close(r))}
  const s2=createServer({quiet:true,jwksAlma:false,ayar:{url:'http://127.0.0.1:1',anonKey:'anon',serviceKey:'srv',jwtSecret:'x',kurulum:'t'},eposta});
  await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;
  try{assert.strictEqual((await postJ(b2,'/eposta/kanca','{}',{})).s,404);assert.strictEqual(JSON.parse((await getH(b2,'/ayar.json')).b).eposta,false)}
  finally{await new Promise(r=>s2.close(r))}
});
test('/hesap/birlestir: iki taze token → RPC + admin silme (taklit); eski süresi dolmuş 401; kayıt kapalıda 404; IP başına dakikada 5',async()=>{
  const rest=await taklitRest();const ESKI='aaaaaaaa-0000-4000-8000-00000000000a',YENI='aaaaaaaa-0000-4000-8000-00000000000b';
  const tok=(sub,{exp=3600,anon=true,email}={})=>Kimlik.imzala({sub,exp:Math.floor(Date.now()/1000)+exp,is_anonymous:anon,...(email?{email}:{})},'x');
  const srv=createServer({quiet:true,jwksAlma:false,kayit:{kuyrukla(){},profil(){},kapat(){},sayac:{}},ayar:{url:rest.url,anonKey:'anon',serviceKey:'srv',jwtSecret:'x',kurulum:'t'}});
  await new Promise(r=>srv.server.listen(0,'127.0.0.1',r));const base='127.0.0.1:'+srv.server.address().port;
  try{
    const a=await postJ(base,'/hesap/birlestir',JSON.stringify({eski:tok(ESKI),yeni:tok(YENI,{anon:false,email:'a@b.c'})}));
    assert.strictEqual(a.s,200,a.b);assert.deepStrictEqual(JSON.parse(a.b),{ok:true});
    const yollar=rest.istekler.map(i=>i.yontem+' '+i.yol);assert.deepStrictEqual(yollar,['POST /rest/v1/rpc/hesap_birlestir','DELETE /auth/v1/admin/users/'+ESKI]);
    assert.deepStrictEqual(rest.istekler[0].govde,{eski:ESKI,yeni:YENI});
    const b=await postJ(base,'/hesap/birlestir',JSON.stringify({eski:tok(ESKI,{exp:-5}),yeni:tok(YENI,{anon:false,email:'a@b.c'})}));assert.strictEqual(b.s,401);assert.strictEqual(JSON.parse(b.b).error,'eski_suresi_dolmus');
    assert.strictEqual((await postJ(base,'/hesap/birlestir','{bozuk')).s,400);
    for(let i=0;i<3;i++)await postJ(base,'/hesap/birlestir','{}');
    const son=await postJ(base,'/hesap/birlestir','{}');assert.strictEqual(son.s,429,'6. istek aynı IP → 429');
    const sag=JSON.parse((await getH(base,'/saglik')).b);assert.deepStrictEqual(sag.birlestirme,{ok:1,hata:6}); // 401, 400 ×4, 429 (limit de hata sayılır)
  }finally{await new Promise(r=>srv.close(r));await rest.kapat()}
  const s2=createServer({quiet:true});await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;
  try{assert.strictEqual((await postJ(b2,'/hesap/birlestir','{}')).s,404)}finally{await new Promise(r=>s2.close(r))}
});
test('kanca: başarısız gönderim önbelleklenmez (GoTrue yeniden deneyince mail gider); eşzamanlı aynı webhook-id tek mail; alıcı başına saatte 5',async()=>{
  const SIR='v1,whsec_'+Buffer.from('kanca-sirri-2').toString('base64');const mailler=[];let basarisiz=true;let beklet=null;
  const eposta={kodMaili:require('../eposta.js').kodMaili,sendTransactionalEmail:async m=>{if(beklet)await beklet;mailler.push(m);return basarisiz?{ok:false,neden:'saglayici',durum:500}:{ok:true,id:'e'}}};
  const srv=createServer({quiet:true,jwksAlma:false,ayar:{url:'http://127.0.0.1:1',anonKey:'anon',serviceKey:'srv',jwtSecret:'x',kurulum:'t',kancaSirri:SIR},eposta});
  await new Promise(r=>srv.server.listen(0,'127.0.0.1',r));const base='127.0.0.1:'+srv.server.address().port;
  const yuk=(email,id)=>{const govde=JSON.stringify({user:{id:'u1',email},email_data:{token:'123456',email_action_type:'magiclink'}});return [govde,H.imzala({sir:SIR,id,ts:Math.floor(Date.now()/1000),govde})]};
  try{
    let [g,h]=yuk('a@ornek.com','msg_f');assert.strictEqual((await postJ(base,'/eposta/kanca',g,h)).s,500);assert.strictEqual(mailler.length,1);
    basarisiz=false;assert.strictEqual((await postJ(base,'/eposta/kanca',g,h)).s,200,'aynı id, ilk deneme başarısızdı → yeniden gönderilir');assert.strictEqual(mailler.length,2);
    assert.strictEqual((await postJ(base,'/eposta/kanca',g,h)).s,200);assert.strictEqual(mailler.length,2,'başarılı sonuç önbellekte');
    // eşzamanlı tekrar: ilk işlem sürerken aynı id → tek mail
    let coz;beklet=new Promise(r=>{coz=r});[g,h]=yuk('b@ornek.com','msg_g');const p1=postJ(base,'/eposta/kanca',g,h);await new Promise(r=>setTimeout(r,50));const p2=postJ(base,'/eposta/kanca',g,h);await new Promise(r=>setTimeout(r,50));coz();beklet=null;
    const [r1,r2]=await Promise.all([p1,p2]);assert.strictEqual(r1.s,200);assert.strictEqual(r2.s,200);assert.strictEqual(mailler.filter(m=>m.to==='b@ornek.com').length,1,'eşzamanlı tekrar tek mail');
    // alıcı başına saatte 5: 6. istek (farklı id) → 500, mail yok
    for(let i=0;i<5;i++){const [g2,h2]=yuk('c@ornek.com','msg_c'+i);assert.strictEqual((await postJ(base,'/eposta/kanca',g2,h2)).s,200)}
    const [g6,h6]=yuk('c@ornek.com','msg_c6');const r6=await postJ(base,'/eposta/kanca',g6,h6);assert.strictEqual(r6.s,500);assert.strictEqual(mailler.filter(m=>m.to==='c@ornek.com').length,5,'6. mail gitmez');
    const sag=JSON.parse((await getH(base,'/saglik')).b);assert.strictEqual(sag.eposta.sinir,1);
  }finally{await new Promise(r=>srv.close(r))}
});
test('/eposta/kod ve /hesap/anonim: Turnstile + tavanlar + yerel GoTrue; /ayar.json turnstile; kanca günlük tavanı; /saglik kod',async()=>{
  const dk=[];
  const rest=await taklitRest();const o3=rest.url.replace('http://','');const ts=[];let tsCevap=()=>({success:true,action:'kod_bagla',hostname:'x.test'});
  const turnstileFetch=async(u,o)=>{ts.push({u,body:String(o.body)});return {ok:true,status:200,json:async()=>tsCevap(String(o.body))}};
  const mailler=[];const eposta={kodMaili:require('../eposta.js').kodMaili,sendTransactionalEmail:async m=>{mailler.push(m);return {ok:true,id:'e'}}};
  const SIR='v1,whsec_'+Buffer.from('kanca').toString('base64');
  const srv=createServer({quiet:true,jwksAlma:false,eposta,turnstileFetch,kayit:{kuyrukla(){},profil(){},kapat(){},sayac:{},davetKaydet:async(kod,uye)=>{dk.push({kod,uye});return true}},ayar:{url:'http://127.0.0.1:1',anonKey:'anon',serviceKey:'srv',jwtSecret:'x',kurulum:'t',kancaSirri:SIR,kancaGunluk:2,turnstileSite:'site',turnstileSecret:'sir',turnstileHostnames:['x.test'],icUrl:rest.url,kodGunluk:5,kodSaatlik:5}});
  await new Promise(r=>srv.server.listen(0,'127.0.0.1',r));const base='127.0.0.1:'+srv.server.address().port;
  const ANON='aaaaaaaa-0000-4000-8000-00000000000a';const tok=(o={})=>Kimlik.imzala({sub:ANON,exp:Math.floor(Date.now()/1000)+3600,is_anonymous:o.anon??true,...(o.email?{email:o.email}:{})},'x');
  const kod=(g,h)=>postJ(base,'/eposta/kod',JSON.stringify(g),h);
  try{
    assert.strictEqual(JSON.parse((await getH(base,'/ayar.json')).b).turnstile,'site');
    // bağla: PUT /auth/v1/user kullanıcının token'ıyla
    let r=await kod({tur:'bagla',email:'Ben@Ornek.com',turnstile:'t1',token:tok()});assert.strictEqual(r.s,200,r.b);assert.deepStrictEqual(JSON.parse(r.b),{ok:true});
    let g=rest.istekler.filter(i=>i.yol.startsWith('/auth/v1/user'));assert.strictEqual(g.length,1);assert.strictEqual(g[0].yontem,'PUT');assert.deepStrictEqual(g[0].govde,{email:'ben@ornek.com'});
    assert.match(ts[0].body,/^secret=sir&response=t1&remoteip=/);
    // Turnstile başarısız → 403, GoTrue'ya istek yok, sayaç artmaz (IP penceresi dolmadan denenir)
    { const n=rest.istekler.length;tsCevap=()=>({success:false,'error-codes':['invalid-input-response']});
      r=await kod({tur:'gir',email:'c@ornek.com',turnstile:'t6'});assert.strictEqual(r.s,403);assert.strictEqual(JSON.parse(r.b).error,'turnstile');assert.strictEqual(rest.istekler.length,n);
      tsCevap=()=>({success:true,action:'kod_bagla',hostname:'x.test'}); }
    r=await kod({tur:'bagla',email:'a@b.c',turnstile:'t2',token:tok({anon:false,email:'a@b.c'})});assert.strictEqual(r.s,400);assert.strictEqual(JSON.parse(r.b).error,'zaten_bagli');
    r=await kod({tur:'bagla',email:'a@b.c',turnstile:'t3'});assert.strictEqual(r.s,401);
    // gir: POST /auth/v1/otp create_user:false; kayıtlı olmayan adres GoTrue 422'si aynen
    tsCevap=()=>({success:true,action:'kod_gir',hostname:'x.test'});
    r=await kod({tur:'gir',email:'ben@ornek.com',turnstile:'t4'});assert.strictEqual(r.s,200);const otp=rest.istekler.filter(i=>i.yol.startsWith('/auth/v1/otp'));assert.deepStrictEqual(otp[0].govde,{email:'ben@ornek.com',create_user:false});
    r=await kod({tur:'gir',email:'yok@ornek.com',turnstile:'t5'});assert.strictEqual(r.s,422);assert.strictEqual(JSON.parse(r.b).error_code,'otp_disabled');
    // aynı IP: işaretli istekler t1 (bağla), t4, t5 (gir) = 3 — 10 dk'da 3 sınırı: 4. işaretli istek 429
    r=await kod({tur:'gir',email:'d@ornek.com',turnstile:'t7'});assert.strictEqual(r.s,429,r.b);const j=JSON.parse(r.b);assert.strictEqual(j.error,'limit');assert.ok(j.sureSn>0);
    const sag=JSON.parse((await getH(base,'/saglik')).b);assert.ok(sag.kod&&sag.kod.istek>=3&&sag.kod.turnstile_red===1&&sag.kod.ip_sinir===1,JSON.stringify(sag.kod));
    // anonim: yerel signup {} → oturum aynen; 11. → 429
    r=await postJ(base,'/hesap/anonim','');assert.strictEqual(r.s,200);assert.strictEqual(JSON.parse(r.b).access_token,'t-anon');const sg=rest.istekler.filter(i=>i.yol.startsWith('/auth/v1/signup'));assert.strictEqual(sg.length,1);assert.deepStrictEqual(sg[0].govde,{});
    // davet: geçerli kod yeni hesabın kimliğiyle kaydedilir; geçersiz kod ve gövdesiz eski istemci kayıt yapmaz
    assert.strictEqual((await postJ(base,'/hesap/anonim',JSON.stringify({davet:'abcdefgh'}))).s,200);for(let i=0;i<40&&!dk.length;i++)await new Promise(r=>setTimeout(r,10));
    assert.deepStrictEqual(dk,[{kod:'ABCDEFGH',uye:'aaaaaaaa-0000-4000-8000-0000000000aa'}]);
    assert.strictEqual((await postJ(base,'/hesap/anonim',JSON.stringify({davet:'IL0'}))).s,200);await new Promise(r=>setTimeout(r,50));assert.strictEqual(dk.length,1,'geçersiz kod kaydedilmez');
    for(let i=0;i<7;i++)assert.strictEqual((await postJ(base,'/hesap/anonim','')).s,200);
    assert.strictEqual((await postJ(base,'/hesap/anonim','')).s,429);
    // kanca günlük tavanı 2: 3. mail 500
    const yuk=(i)=>{const govde=JSON.stringify({user:{id:'u',email:'k'+i+'@ornek.com'},email_data:{token:'123456',email_action_type:'magiclink'}});return [govde,H.imzala({sir:SIR,id:'kg'+i,ts:Math.floor(Date.now()/1000),govde})]};
    for(let i=0;i<2;i++){const [gv,h]=yuk(i);assert.strictEqual((await postJ(base,'/eposta/kanca',gv,h)).s,200)}
    const [gv,h]=yuk(2);assert.strictEqual((await postJ(base,'/eposta/kanca',gv,h)).s,500);assert.strictEqual(mailler.length,2);assert.strictEqual(JSON.parse((await getH(base,'/saglik')).b).eposta.kota,1);
  }finally{await new Promise(r=>srv.close(r));await rest.kapat()}
  // ayarsız: turnstileSecret yok → 503 turnstile_ayarsiz; icUrl yok → 503 ic
  const s2=createServer({quiet:true,jwksAlma:false,ayar:{url:'http://127.0.0.1:1',anonKey:'anon',serviceKey:'srv',jwtSecret:'x',kurulum:'t',kancaSirri:'v1,whsec_YQ==',icUrl:'http://127.0.0.1:1'}});
  await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;
  try{const r=await postJ(b2,'/eposta/kod',JSON.stringify({tur:'gir',email:'a@b.c',turnstile:'t'}));assert.strictEqual(r.s,503);assert.strictEqual(JSON.parse(r.b).error,'turnstile_ayarsiz')}finally{await new Promise(r=>s2.close(r))}
  const s3=createServer({quiet:true,jwksAlma:false,ayar:{url:'http://127.0.0.1:1',anonKey:'anon',serviceKey:'srv',jwtSecret:'x',kurulum:'t',kancaSirri:'v1,whsec_YQ==',turnstileSecret:'sir'}});
  await new Promise(r=>s3.server.listen(0,'127.0.0.1',r));const b3='127.0.0.1:'+s3.server.address().port;
  try{assert.strictEqual(JSON.parse((await postJ(b3,'/eposta/kod',JSON.stringify({tur:'gir',email:'a@b.c',turnstile:'t'}))).b).error,'ic');assert.strictEqual((await postJ(b3,'/hesap/anonim','')).s,503)}finally{await new Promise(r=>s3.close(r))}
});
test('/eposta/kod: eşzamanlı isteklerde tavan Turnstile sonrası yeniden denetlenir (TOCTOU yok); istemci IP\'si GoTrue\'ya X-Forwarded-For ile gider; kota dalı 503',async()=>{
  const rest=await taklitRest();
  const turnstileFetch=async(u,o)=>{await new Promise(r=>setTimeout(r,300));return {ok:true,status:200,json:async()=>({success:true,action:'kod_gir',hostname:'x.test'})}};
  const ayar={url:'http://127.0.0.1:1',anonKey:'anon',serviceKey:'srv',jwtSecret:'x',kurulum:'t',kancaSirri:'v1,whsec_YQ==',turnstileSite:'site',turnstileSecret:'sir',turnstileHostnames:['x.test'],icUrl:rest.url};
  const srv=createServer({quiet:true,jwksAlma:false,turnstileFetch,kayit:{kuyrukla(){},profil(){},kapat(){},sayac:{}},ayar,kodTavan:{ipOn:1,ipSaat:9,adresSaat:9,adresGun:9}});
  await new Promise(r=>srv.server.listen(0,'127.0.0.1',r));const base='127.0.0.1:'+srv.server.address().port;
  try{
    const [a,b]=await Promise.all([postJ(base,'/eposta/kod',JSON.stringify({tur:'gir',email:'e1@ornek.com',turnstile:'t1'})),postJ(base,'/eposta/kod',JSON.stringify({tur:'gir',email:'e2@ornek.com',turnstile:'t2'}))]);
    assert.deepStrictEqual([a.s,b.s].sort(),[200,429],'IP 1/10 dk: iki eşzamanlı istekten yalnız biri geçer');
    const otp=rest.istekler.filter(i=>i.yol.startsWith('/auth/v1/otp'));assert.strictEqual(otp.length,1);assert.strictEqual(otp[0].xff,'127.0.0.1','istemci IP\'si GoTrue\'ya iletilir');
    const an=await postJ(base,'/hesap/anonim','');assert.strictEqual(an.s,200);const sg=rest.istekler.filter(i=>i.yol.startsWith('/auth/v1/signup'));assert.strictEqual(sg[0].xff,'127.0.0.1');
  }finally{await new Promise(r=>srv.close(r))}
  const hizli=async()=>({ok:true,status:200,json:async()=>({success:true,action:'kod_gir',hostname:'x.test'})});
  const s2=createServer({quiet:true,jwksAlma:false,turnstileFetch:hizli,kayit:{kuyrukla(){},profil(){},kapat(){},sayac:{}},ayar:{...ayar,kodGunluk:2,kodSaatlik:2},kodTavan:{ipOn:99,ipSaat:99,adresSaat:99,adresGun:99}});
  await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;
  try{
    for(let i=0;i<2;i++)assert.strictEqual((await postJ(b2,'/eposta/kod',JSON.stringify({tur:'gir',email:'k'+i+'@ornek.com',turnstile:'t'+i}))).s,200);
    const r=await postJ(b2,'/eposta/kod',JSON.stringify({tur:'gir',email:'k9@ornek.com',turnstile:'t9'}));assert.strictEqual(r.s,503);assert.strictEqual(JSON.parse(r.b).error,'kota');
    assert.strictEqual(JSON.parse((await getH(b2,'/saglik')).b).kod.kota,1);
  }finally{await new Promise(r=>s2.close(r));await rest.kapat()}
});
const getH=(b,p,h)=>new Promise((res,rej)=>http.get('http://'+b+p,{headers:h||{}},r=>{let s='';r.on('data',d=>s+=d);r.on('end',()=>res({s:r.statusCode,b:s,h:r.headers}))}).on('error',rej));
test('statik dosya önbelleği: sürümsüz /sayfa/* ve game.js no-cache + ETag (304); ?v= ile uzun önbellek; html sayfalarda __V__ sürümle dolar',async()=>{
  const srv=createServer({quiet:true});await new Promise(r=>srv.server.listen(0,'127.0.0.1',r));const base='127.0.0.1:'+srv.server.address().port;
  try{
    for(const yol of ['/sayfa/ortak.css','/sayfa/hikaye.js','/sunucu/game.js']){
      const a=await getH(base,yol);assert.strictEqual(a.s,200,yol);assert.match(a.h['cache-control']||'',/no-cache/,yol+' sürümsüz → no-cache');assert.ok(a.h.etag,yol+' ETag');
      const b=await getH(base,yol,{'If-None-Match':a.h.etag});assert.strictEqual(b.s,304,yol+' If-None-Match → 304');assert.strictEqual(b.b,'');
    }
    const v=await getH(base,'/sayfa/ortak.css?v=abc');assert.strictEqual(v.s,200);assert.match(v.h['cache-control']||'',/max-age=31536000/,'sürümlü → uzun önbellek');
    const u='aaaaaaaa-0000-4000-8000-000000000009';
    for(const yol of ['/oyun/'+u,'/kasaba/'+u]){const o=await getH(base,yol);assert.ok(!o.b.includes('__V__'),yol+' __V__ kalmamalı');assert.match(o.b,/\/sayfa\/ortak\.js\?v=[A-Za-z0-9._-]+"/,yol+' betikler sürümlü');assert.match(o.b,/\/sayfa\/ortak\.css\?v=/)}
    const i=await getH(base,'/');assert.match(i.b,/sayfa\/supabase\.js\?v='\+KG_VER/,'index.html supabase.js sürümlü yükler');
    assert.match(i.b,/src="sunucu\/game\.js\?v=[A-Za-z0-9._-]+"/,'index.html game.js sürümlü (Cloudflare .js dosyalarına 4 sa tarayıcı önbelleği uyguluyor)');assert.ok(!i.b.includes('__V__'));
    for(const yol of ['/oyun/'+u,'/kasaba/'+u])assert.match((await getH(base,yol)).b,/\/sunucu\/game\.js\?v=[A-Za-z0-9._-]+"/,yol+' game.js sürümlü');
    const gv=await getH(base,'/sunucu/game.js?v=abc');assert.strictEqual(gv.s,200);assert.match(gv.h['cache-control']||'',/max-age=31536000/,'sürümlü game.js → uzun önbellek');
  }finally{await new Promise(r=>srv.close(r))}
});
test('geçmiş sayfaları: /oyun/<uuid> ve /kasaba/<uuid> html döner; geçersiz kimlik 404; /sayfa/*.css sunulur',async()=>{
  const u='aaaaaaaa-0000-4000-8000-000000000001';
  const o=await get(base,'/oyun/'+u);assert.strictEqual(o.s,200);assert.match(o.h['content-type'],/text\/html/);assert.match(o.b,/KG_HIKAYE|hikaye/);
  const k=await get(base,'/kasaba/'+u);assert.strictEqual(k.s,200);assert.match(k.h['content-type'],/text\/html/);
  assert.strictEqual((await get(base,'/oyun/abc')).s,404);assert.strictEqual((await get(base,'/oyun/')).s,404);assert.strictEqual((await get(base,'/kasaba/'+u+'/x')).s,404);
  const c=await get(base,'/sayfa/ortak.css');assert.strictEqual(c.s,200);assert.match(c.h['content-type'],/text\/css/);
  assert.strictEqual((await get(base,'/sayfa/../sunucu/server.js')).s,404);assert.strictEqual((await get(base,'/sayfa/oyun.html')).s,404,'sayfa html\'leri yalnız /oyun ve /kasaba yolundan');
});

// ---------- Geri bildirim paketi §5.4: rol geçmişi tohumu (kayıtlı oyuncu join'de, arka planda, yalnız boş girdi) ----------
test('join: kayıtlı oyuncunun rol geçmişi Supabase\'den tohumlanır; misafir atlanır; maç başladıysa oda belleği ezilmez; /saglik sayacı',async()=>{
  const GIZLI='test-jwt-gizli';const simdi=Math.floor(Date.now()/1000);
  const SUB1='11111111-2222-4333-8444-555555555551',SUB2='11111111-2222-4333-8444-555555555552';
  const kadar=async(f,ms=3000)=>{const t0=Date.now();while(!f()&&Date.now()-t0<ms)await bekle(25);assert.ok(f(),'beklenen gelmedi')};
  let coz=null;const sahte={kuyrukla(){},profil(){},kapat(){},sayac:{gecmisOkunan:3,gecmisHata:1},sonRoller:uye=>uye===SUB1?Promise.resolve([{key:'hain',team:'imp'}]):uye===SUB2?new Promise(r=>{coz=r}):Promise.resolve([])}; // SUB2: test elle çözer (geç gelen tohum)
  const s2=createServer({quiet:true,tickMs:50,jwksAlma:false,kayit:sahte,ayar:{url:'https://x.example',anonKey:'a',serviceKey:'s',jwtSecret:GIZLI,kurulum:'t'}});
  await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;const acik=[];
  try{
    const tok1=Kimlik.imzala({sub:SUB1,exp:simdi+3600,role:'authenticated',is_anonymous:true},GIZLI);
    const a=client('rg0','A',{host:true,token:tok1},b2);await a.until(c=>c.P&&c.P.room);acik.push(a);const room=a.P.room;const R=s2.rooms.get(room).game;
    await kadar(()=>R.rolGecmisi[a.me]);assert.deepStrictEqual(R.rolGecmisi[a.me],[{key:'hain',team:'imp'}],'tohum geldi');
    const g=client('rg1','G',{room},b2);await g.until(c=>c.me);acik.push(g);await bekle(100);assert.strictEqual(R.rolGecmisi[g.me],undefined,'misafir tohumlanmaz');
    const sg=await get(b2,'/saglik');const j=JSON.parse(sg.b);assert.deepStrictEqual(j.rolGecmisi,{okunan:3,hata:1});assert.deepStrictEqual(Object.keys(j.kayit).sort(),['dusen','hata','kuyruk','yazilan']);
    // gecikmeli tohum: o arada maç başlar → oda belleği (maçın rolü) kalır
    const tok2=Kimlik.imzala({sub:SUB2,exp:simdi+3600,role:'authenticated',is_anonymous:true},GIZLI);
    const cs=[client('rg2','B',{room},b2),client('rg3','C',{room},b2),client('rg4','D',{room,token:tok2},b2)];acik.push(...cs);await a.until(c=>c.P.lobby.length===5);
    const d=cs[2];await kadar(()=>typeof coz==='function');assert.ok(!R.rolGecmisi[d.me],'tohum henüz gelmedi');
    a.send({t:'start'});await a.until(c=>c.P.phase==='night');
    assert.strictEqual(R.rolGecmisi[d.me].length,1,'maç belleği yazıldı');const rol=R.rolGecmisi[d.me][0];
    coz([{key:'doktor',team:'inn'},{key:'polis',team:'inn'}]);await bekle(50);
    assert.deepStrictEqual(R.rolGecmisi[d.me],[rol],'geç gelen (dolu) tohum oda belleğini ezmez');
    // sonRoller olmayan kayıt nesnesiyle join hata vermez
    const s3=createServer({quiet:true,tickMs:50,jwksAlma:false,kayit:{kuyrukla(){},profil(){},kapat(){}},ayar:{url:'https://x.example',anonKey:'a',serviceKey:'s',jwtSecret:GIZLI,kurulum:'t'}});
    await new Promise(r=>s3.server.listen(0,'127.0.0.1',r));const b3='127.0.0.1:'+s3.server.address().port;
    try{const e=client('rg5','E',{host:true,token:tok1},b3);await e.until(c=>c.P&&c.P.room);assert.deepStrictEqual(e.errs,[]);await e.close()}finally{await new Promise(r=>s3.close(r))}
  }finally{for(const c of acik)await c.close();await new Promise(r=>s2.close(r))}
});

test('rol geçmişi tohumu: boş geçmiş de yazılır, aynı oyuncu yeniden bağlanınca sorgu tekrarlanmaz',async()=>{
  const GIZLI='test-jwt-gizli';const simdi=Math.floor(Date.now()/1000);const SUB='11111111-2222-4333-8444-555555555559';
  let cagri=0;const sahte={kuyrukla(){},profil(){},kapat(){},sayac:{},sonRoller:()=>{cagri++;return Promise.resolve([])}};
  const s2=createServer({quiet:true,tickMs:50,jwksAlma:false,kayit:sahte,ayar:{url:'https://x.example',anonKey:'a',serviceKey:'s',jwtSecret:GIZLI,kurulum:'t'}});
  await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;const acik=[];
  try{
    const tok=Kimlik.imzala({sub:SUB,exp:simdi+3600,role:'authenticated',is_anonymous:true},GIZLI);
    const a=client('bg0','A',{host:true,token:tok},b2);await a.until(c=>c.P&&c.P.room);acik.push(a);const room=a.P.room;const R=s2.rooms.get(room).game;
    await bekle(100);assert.strictEqual(cagri,1);assert.deepStrictEqual(R.rolGecmisi[a.me],[],'boş geçmiş yazıldı');
    const a2=client('bg1','A',{room,token:tok},b2);await a2.until(c=>c.me);acik.push(a2);await bekle(100);assert.strictEqual(cagri,1,'ikinci bağlanışta sorgu yok');
  }finally{for(const c of acik)await c.close();await new Promise(r=>s2.close(r))}
});

// ---------- Ertelenen küçükler 1 / Task 5: sunucu yolları ----------
async function bitmisOda(sahteKayit){ // 4 oyunculu oda; oyun başlar; sunucuda faz 'end' yapılır (skor/hazir yolları için yeter)
  const s2=createServer({quiet:true,tickMs:50,kayit:sahteKayit||{kuyrukla(){},profil(){},kapat(){},sayac:{}}});await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));
  const b2='127.0.0.1:'+s2.server.address().port;const cs=[];
  const kapat=async()=>{for(const c of cs)await c.close().catch(()=>{});await new Promise(r=>s2.close(r))};
  try{
    const host=client('bo0','Ev',{host:true},b2);await host.until(c=>c.P&&c.P.room);const room=host.P.room;cs.push(host);
    for(const u of ['bo1','bo2','bo3'])cs.push(client(u,'O'+u,{room},b2));await host.until(c=>c.P.lobby.length===4);
    host.send({t:'start'});await host.until(c=>c.P.phase==='night');
    const R=s2.rooms.get(room).game;R.P.phase='end';R.P.winner={team:'inn',kazananlar:R.P.players.map(p=>p.id)};
    return {s2,b2,room,host,cs,R,kapat};
  }catch(e){await kapat();throw e}
}
test('hazir/gordum: izleyici (oyuncu olmayan üye) gönderirse kabul edilmez, bağlantı kalır',async()=>{
  const o=await bitmisOda();
  try{
    const iz=client('bo9','Izleyici',{room:o.room},o.b2);await iz.until(c=>c.P&&c.P.phase==='end');
    iz.send({t:'hazir',v:true});iz.send({t:'gordum'});await bekle(150);
    assert.deepStrictEqual(o.host.P.hazir,[],'izleyici hazır listesine giremez');assert.ok(!o.s2.rooms.get(o.room).gorduler.has(iz.me),'izleyici gördüm sayılmaz');
    o.cs[1].send({t:'hazir',v:true});await o.host.until(c=>c.P.hazir.includes(o.cs[1].me));
    iz.send({t:'msg',x:'hâlâ buradayım'});await bekle(100);assert.deepStrictEqual(iz.errs,[]);await iz.close();
  }finally{await o.kapat()}
});
test('hazir olayı üye başına maçta en çok 10 kez yazılır; durum yine değişir',async()=>{
  const alinan=[];const o=await bitmisOda({kuyrukla:(r,ol)=>{alinan.push(...ol)},profil(){},kapat(){},sayac:{}});
  try{
    const c=o.cs[1];for(let i=0;i<13;i++){c.send({t:'hazir',v:i%2===0});await o.host.until(h=>h.P.hazir.includes(c.me)===(i%2===0))}
    await bekle(200);const n=alinan.filter(e=>e.tur==='hazir'&&e.veri.kim===c.me).length+o.R.log.filter(e=>e.tur==='hazir'&&e.veri.kim===c.me).length;
    assert.ok(n<=10,'hazir olayı tavanı: '+n);assert.ok(o.host.P.hazir.includes(c.me),'13. (açık) durum geçerli');
  }finally{await o.kapat()}
});
test('skor: oyun bitince bir kez işlenir (flush/start/cancel ile ikinci kez değil); ad üyenin son adı',async()=>{
  const o=await bitmisOda();
  try{
    o.cs[1].send({t:'look',name:'YeniAd',color:G.COLORS[1],hat:'none'});await bekle(80);
    o.host.send({t:'msg',x:'bitti'});await o.host.until(c=>c.P.skor&&c.P.skor.length===4); // flush → skorIsle
    const s1=o.host.P.skor.find(x=>x.id===o.cs[1].me);assert.strictEqual(s1.ad,'YeniAd','skor adı üyenin güncel adı');assert.strictEqual(s1.oynadi,1);
    o.host.send({t:'cancel'});await o.host.until(c=>c.P.phase==='lobby');
    assert.strictEqual(o.host.P.skor.find(x=>x.id===o.cs[1].me).oynadi,1,'cancel ikinci kez saymaz');
    o.cs[1].send({t:'look',name:'Ucuncu',color:G.COLORS[1],hat:'none'});await o.host.until(c=>c.P.skor.find(x=>x.id===o.cs[1].me).ad==='Ucuncu');
  }finally{await o.kapat()}
});
test('flush: kayit.kuyrukla fırlatsa da yayın sürer',async()=>{
  let patlat=false;const o=await bitmisOda({kuyrukla(){if(patlat)throw new Error('patladı')},profil(){},kapat(){},sayac:{}});
  try{patlat=true;o.cs[1].send({t:'hazir',v:true});await o.host.until(c=>c.P.hazir.includes(o.cs[1].me)); // hazir → G.olay → flush → bosalt fırlatır; yayın yine gelmeli
    assert.deepStrictEqual(o.host.errs,[]);o.cs[1].send({t:'look',name:'Patlak',color:G.COLORS[1],hat:'none'});await o.host.until(c=>(c.P.lobby||[]).some(x=>x.name==='Patlak'))}
  finally{await o.kapat()}
});
test('govdeOku: çok baytlı karakter parça sınırında bölünse de doğru okunur',async()=>{
  const s2=createServer({quiet:true,tickMs:50});
  const {Readable}=require('stream');const req=new Readable({read(){}}); // gerçek akış: setEncoding çok baytlı sınırı birleştirir
  const p=s2.govdeOku(req,100);const buf=Buffer.from('{"a":"ağaç"}','utf8');const i=buf.indexOf(Buffer.from('ğ'))+1; // 'ğ' iki bayt: ilk baytta kes
  req.push(buf.subarray(0,i));req.push(buf.subarray(i));req.push(null);
  assert.deepStrictEqual(JSON.parse(await p),{a:'ağaç'});
  await new Promise(r=>s2.close(r));
});
test('/hesap/birlestir: bilinmeyen kid → JWKS bir kez yeniden çekilir ve doğrulanır',async()=>{
  const ec=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'}),ec2=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
  const jwk=(k,kid)=>({...k.publicKey.export({format:'jwk'}),kid,alg:'ES256',use:'sig'});const ESKI='55555555-6666-4777-8888-999999999991',YENI='55555555-6666-4777-8888-999999999992';
  const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const tok=(kid,priv,sub,ek)=>{const d=b64({alg:'ES256',typ:'JWT',kid})+'.'+b64({sub,exp:Math.floor(Date.now()/1000)+60,...ek});return d+'.'+crypto.sign('sha256',Buffer.from(d),{key:priv,dsaEncoding:'ieee-p1363'}).toString('base64url')};
  let kaynak=[()=>({keys:[jwk(ec,'k1')]}),()=>({keys:[jwk(ec,'k1'),jwk(ec2,'k2')]})];let cagri=0;
  const hesapFetch=async(u,o)=>({ok:true,status:u.includes('/rpc/')?204:200,json:async()=>({}),text:async()=>''});
  const s2=createServer({quiet:true,tickMs:50,hesapFetch,ayar:{url:'https://x',anonKey:'a',serviceKey:'s',kurulum:'t'},jwksGetirici:async()=>{cagri++;return kaynak.shift()()},jwksDenemeMs:[60,60,60],jwksYenilemeMs:0});
  await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;
  try{
    await new Promise(r=>setTimeout(r,150));assert.strictEqual(cagri,1);
    const r=await postJ(b2,'/hesap/birlestir',JSON.stringify({eski:tok('k2',ec2.privateKey,ESKI,{is_anonymous:true}),yeni:tok('k2',ec2.privateKey,YENI,{is_anonymous:false,email:'a@b.c'})}));
    assert.strictEqual(r.s,200,r.b);assert.strictEqual(cagri,2,'bilinmeyen kid → bir kez yeniden çekildi');
  }finally{await new Promise(r=>s2.close(r))}
});
test('/eposta/kod bağla: GoTrue 503 ise IP/adres hakkı yanmaz; sonraki istek geçer',async()=>{
  const rest=await taklitRest();let tsCevap=()=>({success:true,action:'kod_bagla',hostname:'x.test'});
  const turnstileFetch=async(u,o)=>({ok:true,status:200,json:async()=>tsCevap()});
  const eposta={kodMaili:require('../eposta.js').kodMaili,sendTransactionalEmail:async()=>({ok:true,id:'e'})};const SIR='v1,whsec_'+Buffer.from('kanca').toString('base64');
  const srv=createServer({quiet:true,jwksAlma:false,turnstileFetch,eposta,kayit:{kuyrukla(){},profil(){},kapat(){},sayac:{}},kodTavan:{ipOn:1,ipSaat:1},ayar:{url:'http://127.0.0.1:1',anonKey:'anon',serviceKey:'srv',jwtSecret:'x',kurulum:'t',kancaSirri:SIR,turnstileSite:'site',turnstileSecret:'sir',turnstileHostnames:['x.test'],icUrl:rest.url,kodGunluk:50,kodSaatlik:50}});
  await new Promise(r=>srv.server.listen(0,'127.0.0.1',r));const base='127.0.0.1:'+srv.server.address().port;
  const ANON='aaaaaaaa-0000-4000-8000-00000000000b';const tok=Kimlik.imzala({sub:ANON,exp:Math.floor(Date.now()/1000)+3600,is_anonymous:true},'x');
  try{
    rest.hataAyarla(req=>req.yol.startsWith('/auth/v1/user')?503:null);
    const a=await postJ(base,'/eposta/kod',JSON.stringify({tur:'bagla',email:'a@b.c',turnstile:'t',token:tok}));assert.strictEqual(a.s,503,a.b);
    rest.hataAyarla(()=>null);
    const b=await postJ(base,'/eposta/kod',JSON.stringify({tur:'bagla',email:'a@b.c',turnstile:'t',token:tok}));assert.strictEqual(b.s,200,'IC hatası hak yakmaz: '+b.b);
    const c=await postJ(base,'/eposta/kod',JSON.stringify({tur:'bagla',email:'a@b.c',turnstile:'t',token:tok}));assert.strictEqual(c.s,429,'başarılı istek hak yakar');
  }finally{await new Promise(r=>srv.close(r));await rest.kapat()}
});
test('Turnstile hostname listesi boşsa açılışta uyarı',async()=>{
  const s2=createServer({quiet:true,jwksAlma:false,ayar:{url:'http://127.0.0.1:1',anonKey:'anon',serviceKey:'srv',jwtSecret:'x',kurulum:'t',turnstileSite:'site',turnstileSecret:'sir',turnstileHostnames:[],icUrl:'http://ic.test'}});
  try{assert.ok((s2.uyarilar||[]).some(u=>/hostname/i.test(u)),JSON.stringify(s2.uyarilar))}finally{await new Promise(r=>s2.close(r))}
});

test('govdeOku: sınır bayt sayar (çok baytlı karakterlerle aşılamaz)',async()=>{
  const s2=createServer({quiet:true,tickMs:50});const {Readable}=require('stream');
  try{
    const req=new Readable({read(){}});const p=s2.govdeOku(req,20);req.push(Buffer.from('ğğğğğğğğğğ','utf8'));req.push(null); // 10 karakter = 20 bayt: sınırda, kabul
    assert.strictEqual((await p).length,10);
    const req2=new Readable({read(){}});const p2=s2.govdeOku(req2,20);req2.push(Buffer.from('ğğğğğğğğğğğ','utf8'));req2.push(null); // 11 karakter = 22 bayt > 20 → 413
    await assert.rejects(p2,e=>e.kod===413,'22 bayt > 20: 413');
  }finally{await new Promise(r=>s2.close(r))}
});

test('hızlı ifade: 8 sn bekleme sahte saatle (opts.clock) — bekleme bitince ikinci ifade kabul edilir',async()=>{
  let t=1_000_000;const s2=createServer({quiet:true,tickMs:50,clock:()=>t});await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;
  const host=client('hz0','Ev',{host:true},b2);await host.until(c=>c.P&&c.P.room);const room=host.P.room;
  const cs=[host,...['hz1','hz2','hz3'].map(u=>client(u,'O'+u,{room},b2))];await host.until(c=>c.P.lobby.length===4);
  try{
    host.send({t:'start'});await host.until(c=>c.P.phase==='night');const R=s2.rooms.get(room).game;
    R.P.phase='talk';R.P.day=1; // tartışma (sunucu zamanlayıcısı sahte saatle; faz elle)
    cs[1].send({t:'hizli',k:'koru',d:1,n:'c1'});await host.until(c=>c.chat.some(m=>m.kisa==='koru'&&m.id===cs[1].me));
    cs[1].send({t:'hizli',k:'belirsiz',d:1,n:'c2'});await cs[1].until(c=>c.errs.some(e=>e.code==='soft'&&/Biraz bekle/.test(e.m)));
    t+=8001;cs[1].send({t:'hizli',k:'belirsiz',d:1,n:'c3'});await host.until(c=>c.chat.some(m=>m.kisa==='belirsiz'&&m.id===cs[1].me),3000);
  }finally{for(const c of cs)await c.close();await new Promise(r=>s2.close(r))}
});

// ---------- İlerleme (Task 5): envanter, görünüm doğrulama, eşya seçimi, maç sonu kasa, /ben uçları ----------
async function ilerlemeSunucu(env){ // env: uye → envanter; macSonu çağrıları kaydedilir
  const GIZLI='test-jwt-gizli';const cagri={set:[],mac:[],al:[],oku:0,bagla:[],baglanan:new Set(),ilk:5,tavan:false};
  const sahte={kuyrukla(){},profil(){},kapat(){},sayac:{kasa:3,ilerlemeHata:1},
    envanterOku:async u=>{cagri.oku++;return env[u]||{yildiz:0,esyalar:{},kozmetikler:[]}},
    macSonu:async(u,o,x)=>{cagri.mac.push({u,o,x});if(cagri.bekle)await cagri.bekle;if(cagri.hataSay>0){cagri.hataSay--;return null}if(cagri.kozVer)return {odul:{tur:'kozmetik',key:'sapka:korsan',nadir:'nadir'},donustu:!!cagri.kozDonustu,yildiz:5,yeni_rozetler:[],tavan:false,gunun_ilki:0};if(cagri.tekrarSonuc)return {tekrar:true,sonuc:{odul:x.odul,donustu:false,yildiz:9,yeni_rozetler:[],tavan:false,gunun_ilki:5,kademeler:[],seri:2,gorevler:[{key:'mac',odul:15}]}};const kd=cagri.kademeYok?{}:{kademeler:[{key:'kurtarici',kademe:1,odul:10}],seri:3,gorevler:[{key:'mac',odul:15}],davet:10};return cagri.tavan?{odul:null,donustu:false,yildiz:5,yeni_rozetler:[],tavan:true,gunun_ilki:0,...kd}:{odul:x.odul,donustu:false,yildiz:5,yeni_rozetler:x.rozetler,tavan:false,gunun_ilki:cagri.ilk,...kd}},
    setOdul:async(u,st)=>{cagri.set.push({u,st});return cagri.setVer?{setler:[{key:'korsan',odul:40}],yildiz:45}:null},
    kozmetikAl:async(u,key,fiyat)=>{cagri.al.push({u,key,fiyat});return fiyat>50?{hata:'yildiz',yildiz:10}:{ok:true,yildiz:3}},
    baglaOdulu:async u=>{cagri.bagla.push(u);if(cagri.baglaBekle)await cagri.baglaBekle;if(u===cagri.bagliDegil)return {hata:'bagli_degil'};if(cagri.baglanan.has(u))return {tekrar:true};cagri.baglanan.add(u);return {ok:true,yildiz:30,davet:cagri.baglaDavet||0}}};
  const srv=createServer({quiet:true,tickMs:50,jwksAlma:false,kayit:sahte,ilerlemeDenemeMs:50,ayar:{url:'https://x.example',anonKey:'a',serviceKey:'s',jwtSecret:GIZLI,kurulum:'t'}});
  await new Promise(r=>srv.server.listen(0,'127.0.0.1',r));
  const tok=sub=>Kimlik.imzala({sub,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',is_anonymous:true},GIZLI);
  return {srv,b:'127.0.0.1:'+srv.server.address().port,cagri,tok,kapat:()=>new Promise(r=>srv.close(r))};
}
const SA='aaaaaaaa-1111-4222-8333-000000000001',SB='aaaaaaaa-1111-4222-8333-000000000002';
test('ilerleme: kayıtlı join envanter alır; premium şapka yalnız sahibine, envanter gelince uygulanır; bayrak/efekt lobide',async()=>{
  const I=await ilerlemeSunucu({[SA]:{yildiz:4,esyalar:{iksir:1},kozmetikler:['sapka:tac','bayrak:mavi']}});const acik=[];
  try{
    const a=client('il0','A',{host:true,token:I.tok(SA),hat:'tac',bayrak:'mavi',efekt:'yildiz'},I.b);acik.push(a);await a.until(c=>c.P&&c.P.room);
    await a.until(c=>c.diger.some(m=>m.t==='envanter'));const e=a.diger.find(m=>m.t==='envanter').d;assert.deepStrictEqual(e,{yildiz:4,esyalar:{iksir:1},kozmetikler:['sapka:tac','bayrak:mavi'],bagli:false,baglaOdulu:false,basarilar:{},seri:null,hafta:null,davet:null});
    await a.until(c=>c.P.lobby.some(x=>x.id===c.me&&x.hat==='tac'&&x.bayrak==='mavi'));assert.strictEqual(a.P.lobby.find(x=>x.id===a.me).efekt,'none','sahip olunmayan efekt reddedilir');
    const b=client('il1','B',{room:a.P.room,token:I.tok(SB),hat:'tac',bayrak:'ejder'},I.b);acik.push(b);await b.until(c=>c.diger.some(m=>m.t==='envanter'));await a.until(c=>c.P.lobby.some(x=>x.id===b.me));
    const lb=a.P.lobby.find(x=>x.id===b.me);assert.strictEqual(lb.hat,'none','sahibi olmayan premium şapka kabul edilmez (varsayılanda kalır)');assert.strictEqual(lb.bayrak,'none');
    const g=client('il2','G',{room:a.P.room,hat:'hale'},I.b);acik.push(g);await a.until(c=>c.P.lobby.some(x=>x.id===g.me));assert.strictEqual(a.P.lobby.find(x=>x.id===g.me).hat,'none','misafir premium alamaz');
    assert.ok(!g.diger.some(m=>m.t==='envanter'),'misafire envanter yok');
  }finally{for(const c of acik)await c.close();await I.kapat()}
});
test('ilerleme: eşya modu — lobide herkese eşya (envanterden seçilen ya da rastgele), başlayınca R.g.esya; bellekte adet düşer',async()=>{
  const I=await ilerlemeSunucu({[SA]:{yildiz:0,esyalar:{iksir:1},kozmetikler:[]}});const acik=[];
  try{
    const a=client('ie0','A',{host:true,token:I.tok(SA),esya:'iksir'},I.b);acik.push(a);await a.until(c=>c.P&&c.P.room);const room=a.P.room;
    a.send({t:'settings',night:30,talk:60,vote:30,esyaModu:true});
    for(const u of ['ie1','ie2','ie3']){const c=client(u,u,{room},I.b);acik.push(c)}
    await a.until(c=>c.P.lobby.length===4&&c.P.settings&&c.P.settings.esyaModu);
    await a.until(c=>c.diger.some(m=>m.t==='lobiEsya'&&m.d&&m.d.key==='iksir'&&m.d.kaynak==='envanter'));
    await acik[1].until(c=>c.diger.some(m=>m.t==='lobiEsya'&&m.d&&I.srv&&m.d.kaynak==='bedava'));
    const once=acik[1].diger.filter(m=>m.t==='lobiEsya').pop().d.key;assert.ok(['fis','kum','pusula','zar'].includes(once),'bedava havuz sıradan+zar: '+once);
    a.send({t:'start'});await a.until(c=>c.P.phase==='night');const R=I.srv.rooms.get(room).game;
    assert.deepStrictEqual(R.g.esya[a.me],[{key:'iksir',kaynak:'envanter',kullanildi:false}]);const e1=R.g.esya[acik[1].me][0];assert.ok(once==='zar'?e1.zar===true:e1.key===once,'lobide gösterilen bedava eşya maçta aynı (zar nadir eşyaya döner)');
    assert.deepStrictEqual(I.srv.rooms.get(room).ayirma,[{uye:SA,key:'iksir',pid:a.me,oyun:R.P.gameId}],'maç süresince sunucu çapında ayrıldı');
    await a.until(c=>c.priv&&c.priv.esya&&c.priv.esya[0]&&c.priv.esya[0].key==='iksir');
  }finally{for(const c of acik)await c.close();await I.kapat()}
});
test('eşya v2: esya{k:kum} tartışmayı uzatır ve herkese sys satırı; kap{d,g} ilk dokunana ikinci eşya, P.paket herkese, kimin aldığı gizli; paket eşyası düşüme gitmez; mod kapalıyken yok sayılır',async()=>{
  const I=await ilerlemeSunucu({[SA]:{yildiz:0,esyalar:{},kozmetikler:[]}});const acik=[];
  try{
    const a=client('ev0','A',{host:true,token:I.tok(SA)},I.b);acik.push(a);await a.until(c=>c.P&&c.P.room);const kod=a.P.room;
    a.send({t:'settings',night:30,talk:60,vote:30,esyaModu:true});for(const u of ['ev1','ev2','ev3'])acik.push(client(u,u,{room:kod},I.b));
    await a.until(c=>c.P.lobby.length===4&&c.P.settings&&c.P.settings.esyaModu);a.send({t:'start'});await a.until(c=>c.P.phase==='night');
    const room=I.srv.rooms.get(kod),R=room.game;const b=acik[1];await b.until(c=>c.priv&&c.priv.esya);
    R.g.esya[a.me]=[{key:'kum',kaynak:'bedava',kullanildi:false}];R.P.waited=true;R.P.ends=Date.now()-1;await a.until(c=>c.P.phase==='talk');
    R.g.paket=null; // zamanlamayı test belirler
    const ends=R.P.ends;a.send({t:'esya',k:'kum',d:1,g:R.P.gameId});
    await a.until(c=>c.chat.some(m=>m.sys&&/⏳ Biri kum saatini çevirdi: \+30 sn/.test(m.t)));await b.until(c=>c.chat.some(m=>m.sys&&/kum saatini/.test(m.t)));
    assert.strictEqual(R.P.ends,ends+30000);await a.until(c=>c.P.ends===ends+30000);await a.until(c=>c.priv.esya[0].kullanildi===true);
    // paket: sunucu tick'i açar
    R.g.paket={zaman:0,keys:['fis'],alanlar:[],acik:false,ends:null};await a.until(c=>c.P.paket&&c.P.paket.key==='fis'&&c.P.paket.n===1);await b.until(c=>c.P.paket&&c.P.paket.key==='fis');
    assert.deepStrictEqual(Object.keys(a.P.paket).sort(),['ends','key','n','yer']);assert.deepStrictEqual(a.P.paket.yer,acik[1].P.paket.yer,'herkes aynı yeri görür');
    b.send({t:'kap',d:1,g:R.P.gameId});await b.until(c=>c.priv.esya.length===2&&c.priv.esya[1].key==='fis');
    await a.until(c=>c.P.paket===null);await a.until(c=>c.chat.some(m=>m.sys&&/📦 Meydana 🗳️ oy fişi düştü — biri kaptı/.test(m.t)));
    assert.strictEqual(a.priv.esya.length,1,'kapmayanın envanteri değişmez');assert.ok(!a.raw.includes(b.me+'"]')&&!/alanlar/.test(a.raw),'kimin kaptığı state\'te yok');
    acik[2].send({t:'kap',d:1,g:R.P.gameId});await bekle(120);assert.strictEqual(R.g.esya[acik[2].me].length,1,'kapanmış paket');
    // maç sonu: paket eşyası harcanan olarak gitmez; envanterden gelen (sahte) gider
    R.g.esya[b.me][1].kullanildi=true;R.g.esya[a.me]=[{key:'iksir',kaynak:'envanter',kullanildi:true}];
    R.gameLog.push({sira:99,gun:1,faz:'vote',tur:'gunduz_sonuc',veri:{}});R.P.phase='end';R.P.winner={team:'inn',kazananlar:[]};a.send({t:'look',name:'A1'});
    await a.until(()=>I.cagri.mac.length===1);assert.strictEqual(I.cagri.mac[0].u,SA);assert.strictEqual(I.cagri.mac[0].x.harcanan,'iksir');
  }finally{for(const c of acik)await c.close();await I.kapat()}
  // eşya modu kapalı: mesajlar yok sayılır
  const h=client('ek0','H',{host:true});await h.until(c=>c.P&&c.P.room);const k2=h.P.room;const ot=['ek1','ek2','ek3'].map(u=>client(u,u,{room:k2}));
  await h.until(c=>c.P.lobby.length===4);h.send({t:'start'});await h.until(c=>c.P.phase==='night');const R2=srv.rooms.get(k2).game;R2.P.waited=true;R2.P.ends=Date.now()-1;await h.until(c=>c.P.phase==='talk');
  const e2=R2.P.ends;h.send({t:'esya',k:'kum',d:1,g:R2.P.gameId});h.send({t:'kap',d:1,g:R2.P.gameId});await bekle(120);assert.strictEqual(R2.P.ends,e2);assert.ok(!R2.g.esya||!Object.keys(R2.g.esya).length);assert.strictEqual(h.errs.length,0);
  for(const c of [h,...ot])await c.close();
});
test('eşya v2: kap başarılıysa yalnız kapanın priv\'i gider; paket açık kaldıkça başkasına state yok; son eşyayla herkese P.paket=null',async()=>{
  const I=await ilerlemeSunucu({});const acik=[];
  try{
    const a=client('kp0','A',{host:true},I.b);acik.push(a);await a.until(c=>c.P&&c.P.room);const kod=a.P.room;
    a.send({t:'settings',night:30,talk:60,vote:30,esyaModu:true});for(const u of ['kp1','kp2','kp3'])acik.push(client(u,u,{room:kod},I.b));
    await a.until(c=>c.P.lobby.length===4&&c.P.settings&&c.P.settings.esyaModu);a.send({t:'start'});await a.until(c=>c.P.phase==='night');
    const R=I.srv.rooms.get(kod).game;const [b,c2,d]=acik.slice(1);await d.until(c=>c.priv&&c.priv.esya);
    R.P.waited=true;R.P.ends=Date.now()-1;await a.until(c=>c.P.phase==='talk');R.g.paket={zaman:0,keys:['kum','kum'],alanlar:[],acik:false,ends:null};
    await Promise.all(acik.map(c=>c.until(x=>x.P.paket&&x.P.paket.n===2)));
    const stB=b.states,stC=c2.states,stD=d.states;a.send({t:'kap',d:1,g:R.P.gameId});await a.until(c=>c.priv.esya.length===2&&c.priv.esya[1].key==='kum');
    await bekle(150);assert.strictEqual(b.states,stB,'kap sonrası başkasına state gitmez (kapma anı sızmaz)');assert.strictEqual(c2.states,stC);assert.strictEqual(d.states,stD);
    assert.ok(b.P.paket&&b.P.paket.n===2,'paket hâlâ açık');
    b.send({t:'kap',d:1,g:R.P.gameId});await Promise.all(acik.map(c=>c.until(x=>x.P.paket===null)));assert.strictEqual(R.g.esya[b.me].length,2);
    await a.until(c=>c.chat.some(m=>m.sys&&/ikisini de kaptılar/.test(m.t)));
  }finally{for(const c of acik)await c.close();await I.kapat()}
});
test('ev kozmetiği: sahibi değilse varsayılana düşer, sahibiyse lobide ve maçta görünür; ev resmi ve evler.js sunulur, yol dışı istek 404',async()=>{
  const I=await ilerlemeSunucu({[SA]:{yildiz:0,esyalar:{},kozmetikler:['ev:fici-han']}});const acik=[];
  try{
    const a=client('ev0','A',{host:true,token:I.tok(SA),ev:'fici-han'},I.b);acik.push(a);await a.until(c=>c.P&&c.P.room);await a.until(c=>c.diger.some(m=>m.t==='envanter'));
    await a.until(c=>c.P.lobby.find(x=>x.id===c.me).ev==='fici-han');
    const g=client('ev1','G',{room:a.P.room,ev:'pagoda'},I.b);acik.push(g);await a.until(c=>c.P.lobby.some(x=>x.id===g.me));
    assert.strictEqual(a.P.lobby.find(x=>x.id===g.me).ev,'none','sahip olunmayan ev kabul edilmez');
    a.send({t:'look',name:'A',ev:'kristal'});await a.until(c=>c.P.lobby.find(x=>x.id===c.me).ev==='none');
    a.send({t:'look',name:'A',ev:'fici-han'});await a.until(c=>c.P.lobby.find(x=>x.id===c.me).ev==='fici-han');
    for(const u of ['ev2','ev3'])acik.push(client(u,u,{room:a.P.room},I.b));await a.until(c=>c.P.lobby.length===4);
    a.send({t:'start'});await a.until(c=>c.P.phase==='night');assert.strictEqual(a.P.players.find(x=>x.id===a.me).ev,'fici-han','maçta oyuncu listesinde ev');
    const r=await getH(I.b,'/sayfa/ev/fici-han.webp');assert.strictEqual(r.s,200);assert.strictEqual(r.h['content-type'],'image/webp');
    assert.strictEqual((await getH(I.b,'/sayfa/evler.js')).s,200);
    {const r2=await getH(I.b,'/sayfa/ev/fici-han.webp');assert.strictEqual(r2.s,200);assert.strictEqual(r2.h.etag,r.h.etag,'bellekteki kopya aynı');const li=await getH(I.b,'/sayfa/ev/fici-han-isik.webp');assert.strictEqual(li.s,200);assert.strictEqual(li.h['content-type'],'image/webp')}
    assert.strictEqual((await getH(I.b,'/sayfa/ev/yok-isik.webp')).s,404);
    for(const yol of ['/sayfa/ev/yok.webp','/sayfa/ev/..%2Fevler.webp','/sayfa/ev/%2e%2e%2f%2e%2e%2fserver.webp','/sayfa/ev/FICI.webp','/sayfa/ev/fici-han.png'])assert.strictEqual((await getH(I.b,yol)).s,404,yol);
  }finally{for(const c of acik)await c.close();await I.kapat()}
});
test('ilerleme: maç sonu kayıtlı her oyuncuya bir macSonu ve {t:kasa}; oylamasız maç kasa vermez; ikinci flush tekrar etmez',async()=>{
  const I=await ilerlemeSunucu({});const acik=[];I.cagri.kademeYok=true;
  try{
    const a=client('im0','A',{host:true,token:I.tok(SA)},I.b);acik.push(a);await a.until(c=>c.P&&c.P.room);const room=a.P.room;
    const b=client('im1','B',{room,token:I.tok(SB)},I.b);acik.push(b);for(const u of ['im2','im3']){acik.push(client(u,u,{room},I.b))}
    await a.until(c=>c.P.lobby.length===4);a.send({t:'start'});await a.until(c=>c.P.phase==='night');
    const R=I.srv.rooms.get(room).game;R.gameLog.push({sira:99,gun:1,faz:'vote',tur:'gunduz_sonuc',veri:{}});
    R.P.phase='end';R.P.winner={team:'inn',kazananlar:[a.me]};a.send({t:'look',name:'A1'}); // look → schedule → flush
    await a.until(c=>c.diger.some(m=>m.t==='kasa'));await b.until(c=>c.diger.some(m=>m.t==='kasa'));
    assert.strictEqual(I.cagri.mac.length,2,'yalnız iki kayıtlı oyuncu');const ma=I.cagri.mac.find(x=>x.u===SA);assert.deepStrictEqual(a.diger.find(m=>m.t==='kasa').d.kademeler,[],'RPC kademeler vermezse []');assert.strictEqual(a.diger.find(m=>m.t==='kasa').d.seri,0,'RPC seri vermezse 0');assert.deepStrictEqual(a.diger.find(m=>m.t==='kasa').d.gorevler,[],'RPC görev vermezse []');assert.strictEqual(a.diger.find(m=>m.t==='kasa').d.davet,0,'RPC davet vermezse 0');
    assert.strictEqual(ma.o,R.P.oyunId);assert.strictEqual(ma.x.bonus,2,'kazanan bonusu');assert.strictEqual(I.cagri.mac.find(x=>x.u===SB).x.bonus,0);assert.ok(ma.x.odul&&ma.x.odul.tur);
    if(ma.x.odul.tur==='kozmetik')assert.ok(ma.x.odul.donusum>0);
    a.send({t:'look',name:'A2'});await bekle(200);assert.strictEqual(I.cagri.mac.length,2,'ikinci flush tekrar etmez');
    a.send({t:'cancel'});await a.until(c=>c.P.phase==='lobby');a.send({t:'start'});await a.until(c=>c.P.phase==='night');
    const R2=I.srv.rooms.get(room).game;R2.P.phase='end';R2.P.winner={team:'imp',kazananlar:[]};a.send({t:'look',name:'A3'});await bekle(250);
    assert.strictEqual(I.cagri.mac.length,2,'oylama yaşanmamış maç kasa vermez');
  }finally{for(const c of acik)await c.close();await I.kapat()}
});
test('/ben/al: token, katalog fiyatı, hata kodları, kayıt kapalı 404; /ben sayfası; /saglik ilerleme',async()=>{
  const I=await ilerlemeSunucu({});
  try{
    assert.strictEqual((await postJ(I.b,'/ben/al',JSON.stringify({key:'sapka:tac'}))).s,401);
    const h={Authorization:'Bearer '+I.tok(SA)};
    assert.strictEqual((await postJ(I.b,'/ben/al',JSON.stringify({key:'sapka:yok'}),h)).s,400);
    const ok=await postJ(I.b,'/ben/al',JSON.stringify({key:'bayrak:mavi'}),h);assert.strictEqual(ok.s,200,ok.b);assert.deepStrictEqual(JSON.parse(ok.b),{ok:true,yildiz:3,setler:[]});assert.deepStrictEqual(Object.keys(I.cagri.set.at(-1).st),Object.keys(G.SETLER),'satın almadan sonra set denetimi');
    I.cagri.setVer=true;const ok2=await postJ(I.b,'/ben/al',JSON.stringify({key:'bayrak:mavi'}),h);assert.deepStrictEqual(JSON.parse(ok2.b),{ok:true,yildiz:45,setler:[{key:'korsan',odul:40}]});I.cagri.setVer=false;
    assert.deepStrictEqual(I.cagri.al[0],{u:SA,key:'bayrak:mavi',fiyat:25},'fiyat katalogdan');
    const az=await postJ(I.b,'/ben/al',JSON.stringify({key:'sapka:tac'}),h);assert.strictEqual(az.s,409);assert.deepStrictEqual(JSON.parse(az.b),{error:'yildiz',yildiz:10});assert.strictEqual(I.cagri.al.at(-1).fiyat,180);
    const sg=JSON.parse((await get(I.b,'/saglik')).b);assert.deepStrictEqual(sg.ilerleme,{kasa:3,hata:1});
    assert.strictEqual((await get(I.b,'/ben')).s,200);
  }finally{await I.kapat()}
  const s2=createServer({quiet:true,tickMs:50});await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));
  try{assert.strictEqual((await postJ('127.0.0.1:'+s2.server.address().port,'/ben/al','{}')).s,404)}finally{await new Promise(r=>s2.close(r))}
});

test('ilerleme: aynı kullanıcının tek eşyası iki odada aynı anda taşınamaz (sunucu çapında ayırma); maç bitince ayırma kalkar',async()=>{
  const I=await ilerlemeSunucu({[SA]:{yildiz:0,esyalar:{iksir:1},kozmetikler:[]}});const acik=[];
  try{
    const oda=async(pfx)=>{const h=client(pfx+'0','H',{host:true},I.b);acik.push(h);await h.until(c=>c.P&&c.P.room);h.send({t:'settings',night:30,talk:60,vote:30,esyaModu:true});return h};
    const h1=await oda('ra'),h2=await oda('rb');
    const a1=client('rs1','A',{room:h1.P.room,token:I.tok(SA),esya:'iksir'},I.b),a2=client('rs2','A',{room:h2.P.room,token:I.tok(SA),esya:'iksir'},I.b);acik.push(a1,a2);
    for(const [h,p] of [[h1,'x'],[h2,'y']])for(const u of ['1','2'])acik.push(client(p+u,p+u,{room:h.P.room},I.b));
    await h1.until(c=>c.P.lobby.length===4);await h2.until(c=>c.P.lobby.length===4);
    await a1.until(c=>c.diger.some(m=>m.t==='lobiEsya'&&m.d&&m.d.kaynak==='envanter'));
    h1.send({t:'start'});await h1.until(c=>c.P.phase==='night');
    await new Promise(r=>setTimeout(r,200));h2.send({t:'start'});await h2.until(c=>c.P.phase==='night');
    const R1=I.srv.rooms.get(h1.P.room).game,R2=I.srv.rooms.get(h2.P.room).game;
    assert.strictEqual(R1.g.esya[a1.me][0].kaynak,'envanter');assert.strictEqual(R2.g.esya[a2.me][0].kaynak,'bedava','ikinci oda aynı tek eşyayı alamaz');
  }finally{for(const c of acik)await c.close();await I.kapat()}
});

test('ilerleme: maç sonu düşüm tamamlanmadan ayırma kalkmaz; harcanan eşya bütün odalardaki kopyalarda düşer',async()=>{
  const I=await ilerlemeSunucu({[SA]:{yildiz:0,esyalar:{iksir:1},kozmetikler:[]}});let coz;I.cagri.bekle=new Promise(r=>{coz=r});const acik=[];
  const eskiMac=I.srv?null:null;
  try{
    const kayitSahte=I.srv.rooms; // yer tutucu
    const oda=async(pfx)=>{const h=client(pfx+'0','H',{host:true},I.b);acik.push(h);await h.until(c=>c.P&&c.P.room);h.send({t:'settings',night:30,talk:60,vote:30,esyaModu:true});return h};
    const h1=await oda('da'),h2=await oda('db');
    const a1=client('ds1','A',{room:h1.P.room,token:I.tok(SA),esya:'iksir'},I.b),a2=client('ds2','A',{room:h2.P.room,token:I.tok(SA),esya:'iksir'},I.b);acik.push(a1,a2);
    for(const [h,p] of [[h1,'dx'],[h2,'dy']])for(const u of ['1','2'])acik.push(client(p+u,p+u,{room:h.P.room},I.b));
    await h1.until(c=>c.P.lobby.length===4);await h2.until(c=>c.P.lobby.length===4);await a1.until(c=>c.diger.some(m=>m.t==='lobiEsya'&&m.d&&m.d.kaynak==='envanter'));
    h1.send({t:'start'});await h1.until(c=>c.P.phase==='night');const R1=I.srv.rooms.get(h1.P.room).game;
    R1.g.esya[a1.me][0].kullanildi=true;R1.gameLog.push({sira:99,gun:1,faz:'vote',tur:'gunduz_sonuc',veri:{}});
    I.yavaslat=true;R1.P.phase='end';R1.P.winner={team:'inn',kazananlar:[]};h1.send({t:'look',name:'H1'});
    await new Promise(r=>setTimeout(r,150));assert.strictEqual(I.cagri.mac.length,1,'macSonu çağrıldı (henüz dönmedi)');
    h2.send({t:'start'});await h2.until(c=>c.P.phase==='night');const R2=I.srv.rooms.get(h2.P.room).game;
    assert.strictEqual(R2.g.esya[a2.me][0].kaynak,'bedava','düşüm onaylanmadan ayırma kalkmaz');
    coz();await new Promise(r=>setTimeout(r,200));
    assert.strictEqual(I.srv.rooms.get(h2.P.room).members.get(a2.me).envanter.esyalar.iksir||0,0,'harcanan eşya diğer odadaki kopyada da düştü');
  }finally{coz&&coz();for(const c of acik)await c.close();await I.kapat()}
});

test('ilerleme: aynı odada yeni maç, önceki maçın düşümü beklenirken ayırmayı silmez',async()=>{
  const I=await ilerlemeSunucu({[SA]:{yildiz:0,esyalar:{iksir:1},kozmetikler:[]}});let coz;I.cagri.bekle=new Promise(r=>{coz=r});const acik=[];
  try{
    const h=client('rv0','H',{host:true},I.b);acik.push(h);await h.until(c=>c.P&&c.P.room);h.send({t:'settings',night:30,talk:60,vote:30,esyaModu:true});
    const a=client('rv1','A',{room:h.P.room,token:I.tok(SA),esya:'iksir'},I.b);acik.push(a);for(const u of ['rv2','rv3'])acik.push(client(u,u,{room:h.P.room},I.b));
    await h.until(c=>c.P.lobby.length===4);await a.until(c=>c.diger.some(m=>m.t==='lobiEsya'&&m.d&&m.d.kaynak==='envanter'));
    h.send({t:'start'});await h.until(c=>c.P.phase==='night');const room=I.srv.rooms.get(h.P.room);const R=room.game;
    R.g.esya[a.me][0].kullanildi=true;R.gameLog.push({sira:99,gun:1,faz:'vote',tur:'gunduz_sonuc',veri:{}});R.P.phase='end';R.P.winner={team:'inn',kazananlar:[]};h.send({t:'look',name:'H1'});
    await new Promise(r=>setTimeout(r,150));assert.strictEqual(I.cagri.mac.length,1);
    h.send({t:'cancel'});await h.until(c=>c.P.phase==='lobby');h.send({t:'start'});await h.until(c=>c.P.phase==='night');
    assert.strictEqual(room.game.g.esya[a.me][0].kaynak,'bedava','önceki maçın ayırması düşüm onaylanana dek durur');
    coz();await new Promise(r=>setTimeout(r,150));assert.ok(!room.ayirma.some(x=>x.oyun!==room.game.P.gameId),'düşüm sonrası eski ayırma kalktı');
  }finally{coz&&coz();for(const c of acik)await c.close();await I.kapat()}
});

test('ilerleme: maç sonu kayıt bir kez başarısızsa bir kez yeniden denenir; kasa yine gelir',async()=>{
  const I=await ilerlemeSunucu({});I.cagri.hataSay=1;const acik=[];
  try{
    const a=client('rt0','A',{host:true,token:I.tok(SA)},I.b);acik.push(a);await a.until(c=>c.P&&c.P.room);const room=a.P.room;for(const u of ['rt1','rt2','rt3'])acik.push(client(u,u,{room},I.b));
    await a.until(c=>c.P.lobby.length===4);a.send({t:'start'});await a.until(c=>c.P.phase==='night');const R=I.srv.rooms.get(room).game;
    R.gameLog.push({sira:99,gun:1,faz:'vote',tur:'gunduz_sonuc',veri:{}});R.P.phase='end';R.P.winner={team:'inn',kazananlar:[]};a.send({t:'look',name:'A1'});
    await a.until(c=>c.diger.some(m=>m.t==='kasa'),3000);assert.strictEqual(I.cagri.mac.length,2,'bir hata + bir yeniden deneme');
  }finally{for(const c of acik)await c.close();await I.kapat()}
});

test('ilerleme: ilk yanıt kaybolup yeniden deneme tekrar dönerse, saklanan sonuçla tam kasa kartı gelir',async()=>{
  const I=await ilerlemeSunucu({});I.cagri.tekrarSonuc=true;const acik=[];
  try{
    const a=client('ks0','A',{host:true,token:I.tok(SA)},I.b);acik.push(a);await a.until(c=>c.P&&c.P.room);const room=a.P.room;for(const u of ['ks1','ks2','ks3'])acik.push(client(u,u,{room},I.b));
    await a.until(c=>c.P.lobby.length===4);a.send({t:'start'});await a.until(c=>c.P.phase==='night');const R=I.srv.rooms.get(room).game;
    R.gameLog.push({sira:99,gun:1,faz:'vote',tur:'gunduz_sonuc',veri:{}});R.P.phase='end';R.P.winner={team:'inn',kazananlar:[a.me]};a.send({t:'look',name:'A1'});
    const k=(await a.until(c=>c.diger.find(m=>m.t==='kasa'),3000)).diger.find(m=>m.t==='kasa').d;
    assert.strictEqual(k.tekrar,false,'saklanan sonuç varsa tekrar kartı değil');assert.strictEqual(k.yildiz,9);assert.deepStrictEqual(k.gorevler,[{key:'mac',odul:15}]);assert.strictEqual(k.seri,2);assert.strictEqual(k.gununIlki,5);assert.deepStrictEqual(k.dokum,G.yildizDokumu(R,a.me));
  }finally{for(const c of acik)await c.close();await I.kapat()}
});

test('setler: kasadan yeni kozmetik çıkınca set denetimi, kasa mesajı setler ve güncel yıldız; kopya kozmetikte denetim yok',async()=>{
  for(const kopya of [false,true]){const I=await ilerlemeSunucu({});I.cagri.kozVer=true;I.cagri.kozDonustu=kopya;I.cagri.setVer=true;const acik=[];
    try{
      const a=client('st0'+kopya,'A',{host:true,token:I.tok(SA)},I.b);acik.push(a);await a.until(c=>c.P&&c.P.room);const room=a.P.room;for(const u of ['st1','st2','st3'])acik.push(client(u+kopya,u,{room},I.b));
      await a.until(c=>c.P.lobby.length===4);a.send({t:'start'});await a.until(c=>c.P.phase==='night');const R=I.srv.rooms.get(room).game;
      R.gameLog.push({sira:99,gun:1,faz:'vote',tur:'gunduz_sonuc',veri:{}});R.P.phase='end';R.P.winner={team:'inn',kazananlar:[a.me]};a.send({t:'look',name:'A1'});
      const k=(await a.until(c=>c.diger.find(m=>m.t==='kasa'),3000)).diger.find(m=>m.t==='kasa').d;
      if(kopya){assert.strictEqual(I.cagri.set.length,0,'kopya kozmetik set denetimi yapmaz');assert.deepStrictEqual(k.setler,[]);assert.strictEqual(k.yildiz,5)}
      else{assert.strictEqual(I.cagri.set.length,1);assert.deepStrictEqual(Object.keys(I.cagri.set[0].st),Object.keys(G.SETLER));assert.deepStrictEqual(k.setler,[{key:'korsan',odul:40}]);assert.strictEqual(k.yildiz,45,'yıldız set sonrası')}
    }finally{for(const c of acik)await c.close();await I.kapat()}}
});

// ---------- Yıldız ekonomisi 1 (Task 3) ----------
test('yıldız: maç sonu dökümü yalnız oyuncunun kasasında; bonus döküm toplamı; günün ilki geçer; tavanda döküm boş',async()=>{
  const I=await ilerlemeSunucu({[SA]:{yildiz:0,esyalar:{},kozmetikler:[],basarilar:{kurtarici:{sayac:3,kademe:1}}}});const acik=[];
  try{
    const a=client('ys0','A',{host:true,token:I.tok(SA)},I.b);acik.push(a);await a.until(c=>c.P&&c.P.room);const room=a.P.room;
    const b=client('ys1','B',{room,token:I.tok(SB)},I.b);acik.push(b);for(const u of ['ys2','ys3'])acik.push(client(u,u,{room},I.b));
    await a.until(c=>c.P.lobby.length===4);a.send({t:'start'});await a.until(c=>c.P.phase==='night');
    const R=I.srv.rooms.get(room).game;R.gameLog.push({sira:99,gun:1,faz:'vote',tur:'gunduz_sonuc',veri:{}});R.g.hainOyu={[b.me]:1};
    R.P.phase='end';R.P.winner={team:'inn',kazananlar:[a.me]};a.send({t:'look',name:'A1'});
    const ka=(await a.until(c=>c.diger.find(m=>m.t==='kasa'))).diger.find(m=>m.t==='kasa').d;const kb=(await b.until(c=>c.diger.find(m=>m.t==='kasa'))).diger.find(m=>m.t==='kasa').d;
    assert.deepStrictEqual(ka.dokum,G.yildizDokumu(R,a.me));assert.deepStrictEqual(kb.dokum,G.yildizDokumu(R,b.me));
    assert.ok(kb.dokum.some(x=>x.key==='hain_oyu'&&x.adet===2),'B haine oy');assert.ok(!ka.dokum.some(x=>x.key==='hain_oyu'),'A, B\'nin dökümünü görmez');
    assert.strictEqual(I.cagri.mac.find(x=>x.u===SA).x.bonus,G.yildizToplam(ka.dokum));assert.strictEqual(I.cagri.mac.find(x=>x.u===SB).x.bonus,G.yildizToplam(kb.dokum));
    assert.deepStrictEqual(ka.kademeler,[{key:'kurtarici',kademe:1,odul:10}],'kasa mesajı kademeler');assert.strictEqual(ka.seri,3,'kasa mesajı seri');assert.deepStrictEqual(ka.gorevler,[{key:'mac',odul:15}],'kasa mesajı görevler');assert.strictEqual(ka.davet,10,'kasa mesajı davet');{const x=I.cagri.mac.find(m=>m.u===SA).x;assert.deepStrictEqual(Object.keys(x.gorev),G.haftaGorevleri(G.haftaPazartesi(Date.now())));assert.strictEqual(x.gorevBonus,G.HAFTALIK.bonus)}{const x=I.cagri.mac.find(m=>m.u===SA).x;assert.strictEqual(x.seriArtis,G.YILDIZ_KAYNAK.seri.adet);assert.strictEqual(x.seriTavan,G.YILDIZ_KAYNAK.seri.tavan)}const bp=I.cagri.mac.find(x=>x.u===SA).x.basari;assert.deepStrictEqual(Object.keys(bp),Object.keys(G.BASARILAR),'9 anahtar');assert.strictEqual(bp.mudavim.artis,0);for(const v of Object.values(bp))assert.ok(v.esik.length===3&&v.odul.length===3&&typeof v.artis==='number',JSON.stringify(v));
    await a.until(c=>c.diger.some(m=>m.t==='envanter'&&m.d.basarilar&&m.d.basarilar.kurtarici&&m.d.basarilar.kurtarici.sayac===3),3000);
    assert.strictEqual(ka.gununIlki,5);assert.strictEqual(I.cagri.mac.find(x=>x.u===SA).x.gunluk,G.YILDIZ_KAYNAK.gunun_ilki.adet,'günün ilki miktarı sunucudan');
    I.cagri.tavan=true;a.send({t:'cancel'});await a.until(c=>c.P.phase==='lobby');a.diger.length=0;a.send({t:'start'});await a.until(c=>c.P.phase==='night');
    const R2=I.srv.rooms.get(room).game;R2.gameLog.push({sira:99,gun:1,faz:'vote',tur:'gunduz_sonuc',veri:{}});R2.P.phase='end';R2.P.winner={team:'inn',kazananlar:[a.me]};a.send({t:'look',name:'A2'});
    const k2=(await a.until(c=>c.diger.find(m=>m.t==='kasa'))).diger.find(m=>m.t==='kasa').d;assert.deepStrictEqual(k2.dokum,[],'tavanda döküm yok');assert.strictEqual(k2.gununIlki,0);assert.strictEqual(k2.tavan,true);assert.deepStrictEqual(k2.kademeler,[{key:'kurtarici',kademe:1,odul:10}],'tavanda da kademe');
  }finally{for(const c of acik)await c.close();await I.kapat()}
});
test('yıldız: envanter mesajı bağlılık bayraklarını taşır',async()=>{
  const I=await ilerlemeSunucu({[SA]:{yildiz:3,esyalar:{},kozmetikler:[],bagli:true,bagla_odulu:false}});const acik=[];
  try{const a=client('yb0','A',{host:true,token:I.tok(SA)},I.b);acik.push(a);
    const e=(await a.until(c=>c.diger.find(m=>m.t==='envanter'))).diger.find(m=>m.t==='envanter').d;assert.strictEqual(e.bagli,true);assert.strictEqual(e.baglaOdulu,false);
  }finally{for(const c of acik)await c.close();await I.kapat()}
});
test('/hesap/bagla-odulu: token, bir kez, eşzamanlı istek, bağlı değil, soketlere kart, kayıt kapalı 404',async()=>{
  const I=await ilerlemeSunucu({});const acik=[];
  try{
    assert.strictEqual((await postJ(I.b,'/hesap/bagla-odulu','{}')).s,401);
    const a=client('bo0','A',{host:true,token:I.tok(SA)},I.b);acik.push(a);await a.until(c=>c.P&&c.P.room&&c.diger.some(m=>m.t==='envanter'));
    const h={Authorization:'Bearer '+I.tok(SA)};
    const ok=await postJ(I.b,'/hesap/bagla-odulu','{}',h);assert.strictEqual(ok.s,200,ok.b);assert.deepStrictEqual(JSON.parse(ok.b),{ok:true,yildiz:30,davet:0});
    const kart=(await a.until(c=>c.diger.find(m=>m.t==='baglaOdulu'))).diger.find(m=>m.t==='baglaOdulu').d;assert.deepStrictEqual(kart,{yildiz:30,kozmetik:'bayrak:mektup',davet:0});
    const tk=await postJ(I.b,'/hesap/bagla-odulu','{}',h);assert.strictEqual(tk.s,200);assert.deepStrictEqual(JSON.parse(tk.b),{tekrar:true});
    let ac;I.cagri.baglaBekle=new Promise(r=>ac=r);const hb={Authorization:'Bearer '+I.tok(SB)};
    const p1=postJ(I.b,'/hesap/bagla-odulu','{}',hb),p2=postJ(I.b,'/hesap/bagla-odulu','{}',hb);await bekle(80);ac();I.cagri.baglaBekle=null;
    const ik=[JSON.parse((await p1).b),JSON.parse((await p2).b)];assert.strictEqual(ik.filter(x=>x.ok).length,1,JSON.stringify(ik));assert.strictEqual(ik.filter(x=>x.tekrar).length,1);
    await bekle(100);assert.strictEqual(a.diger.filter(m=>m.t==='baglaOdulu').length,1,'başka üyenin ödülü A\'ya gitmez, A\'ya bir kez');
    I.cagri.bagliDegil=SB;I.cagri.baglanan.delete(SB);const bd=await postJ(I.b,'/hesap/bagla-odulu','{}',hb);assert.strictEqual(bd.s,409);assert.deepStrictEqual(JSON.parse(bd.b),{error:'bagli_degil'});
  }finally{for(const c of acik)await c.close();await I.kapat()}
  const s2=createServer({quiet:true,tickMs:50});await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));
  try{assert.strictEqual((await postJ('127.0.0.1:'+s2.server.address().port,'/hesap/bagla-odulu','{}')).s,404)}finally{await new Promise(r=>s2.close(r))}
});
test('/ben/al: yalnız bağlamayla verilen öğe satılmaz; nadir yeni fiyat 70',async()=>{
  const I=await ilerlemeSunucu({});
  try{const h={Authorization:'Bearer '+I.tok(SA)};
    const oz=await postJ(I.b,'/ben/al',JSON.stringify({key:'bayrak:mektup'}),h);assert.strictEqual(oz.s,400);assert.deepStrictEqual(JSON.parse(oz.b),{error:'ozel'});assert.strictEqual(I.cagri.al.length,0,'RPC çağrılmaz');
    await postJ(I.b,'/ben/al',JSON.stringify({key:'bayrak:yildiz'}),h);assert.strictEqual(I.cagri.al[0].fiyat,70);
  }finally{await I.kapat()}
});

test('/hesap/bagla-odulu: imza anahtarı dönünce JWKS bir kez yeniden çekilir, ödül verilir',async()=>{
  const ec=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'}),ec2=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
  const jwk=(k,kid)=>({...k.publicKey.export({format:'jwk'}),kid,alg:'ES256',use:'sig'});const UYE='55555555-6666-4777-8888-999999999993';
  const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const tok=(kid,priv,sub,ek)=>{const d=b64({alg:'ES256',typ:'JWT',kid})+'.'+b64({sub,exp:Math.floor(Date.now()/1000)+60,...ek});return d+'.'+crypto.sign('sha256',Buffer.from(d),{key:priv,dsaEncoding:'ieee-p1363'}).toString('base64url')};
  let kaynak=[()=>({keys:[jwk(ec,'k1')]}),()=>({keys:[jwk(ec,'k1'),jwk(ec2,'k2')]})];let cagri=0;const verilen=[];
  const kayit={kuyrukla(){},profil(){},kapat(){},sayac:{},baglaOdulu:async u=>{verilen.push(u);return {ok:true,yildiz:25}}};
  const s2=createServer({quiet:true,tickMs:50,kayit,ayar:{url:'https://x',anonKey:'a',serviceKey:'s',kurulum:'t'},jwksGetirici:async()=>{cagri++;return kaynak.shift()()},jwksDenemeMs:[60,60,60],jwksYenilemeMs:0});
  await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));const b2='127.0.0.1:'+s2.server.address().port;
  try{
    await new Promise(r=>setTimeout(r,150));assert.strictEqual(cagri,1);
    const r=await postJ(b2,'/hesap/bagla-odulu','{}',{Authorization:'Bearer '+tok('k2',ec2.privateKey,UYE,{email:'a@b.c'})});
    assert.strictEqual(r.s,200,r.b);assert.strictEqual(cagri,2,'bilinmeyen kid → bir kez yeniden çekildi');assert.deepStrictEqual(verilen,[UYE]);
  }finally{await new Promise(r=>s2.close(r))}
});
