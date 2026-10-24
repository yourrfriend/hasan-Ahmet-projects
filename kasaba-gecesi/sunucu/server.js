'use strict';
// Kasaba Gecesi sunucusu: oda yönetimi, WebSocket, faz zamanlayıcısı, yeniden bağlanma, statik dosya.
// Tek süreç, odalar bellekte. Çalıştır: node server.js  (PORT=8787, HOST=0.0.0.0)
const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {WebSocketServer}=require('ws');
const G=require('./game.js');

const ROOM_TTL_MS=+process.env.ROOM_TTL_MS||2*60*60*1000;   // bu kadar süre mesaj gelmezse oda silinir
const HOST_GRACE_MS=+process.env.HOST_GRACE_MS||10*60*1000; // ev sahibi bu kadar dönmezse yetki devredilir
const MAX_ROOMS=+process.env.MAX_ROOMS||1000;
const MAX_SOCKS_PER_ROOM=40;
const INDEX=path.join(__dirname,'..','index.html');
const GAME_JS=path.join(__dirname,'game.js'); // istemci de yükler: sabitler tek yerde
const CODE_CHARS='abcdefghjkmnpqrstuvwxyz23456789';
// İstemcinin gönderdiği kimlik (kg_uid) gizli anahtardır; herkese açık durumda ondan türetilen
// kısa bir kimlik gezer. Açık kimliği bilen başkasının yerine giremez, ev sahibi olamaz.
const pubId=key=>crypto.createHash('sha256').update('kg:'+key).digest('base64url').slice(0,12);

function genCode(rooms){for(;;){let s='';for(let i=0;i<6;i++)s+=CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)];if(!rooms.has(s))return s}}
const cleanCode=v=>typeof v==='string'?v.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,12):'';
const cleanUid=v=>typeof v==='string'?v.replace(/[^A-Za-z0-9_-]/g,'').slice(0,24):'';
const cleanName=v=>typeof v==='string'?v.trim().slice(0,16):'';

function createServer(opts={}){
  const rooms=new Map();
  const log=opts.quiet?()=>{}:(...a)=>console.log(new Date().toISOString(),...a);

  // ---------- statik dosya ----------
  const server=http.createServer((req,res)=>{
    const url=(req.url||'/').split('?')[0];
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end()}
    if(url==='/'||url==='/index.html'){
      fs.readFile(INDEX,(err,buf)=>{
        if(err){res.writeHead(500);return res.end('index.html okunamadı')}
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:buf);
      });return;
    }
    if(url==='/sunucu/game.js'){
      fs.readFile(GAME_JS,(err,buf)=>{
        if(err){res.writeHead(500);return res.end('game.js okunamadı')}
        res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:buf);
      });return;
    }
    if(url==='/saglik'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,rooms:rooms.size,surum:process.env.KG_SURUM||null}))}
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Bulunamadı');
  });

  // ---------- oda yardımcıları ----------
  function newRoom(code,hostId){
    const room={code,hostId,game:G.createGame(),members:new Map(),lastActive:Date.now(),hostGoneSince:null,flushT:null,lastPriv:new Map()};
    rooms.set(code,room);log('oda açıldı',code);return room;
  }
  const online=m=>m.socks.size>0;
  // lobi: bağlı ve adı olan üyeler, ev sahibi önde; aynı rengi seçen ikinciye boş renk
  function lobbyOf(room){
    const list=[];
    for(const [id,m] of room.members)if(online(m)&&m.name)list.push({id,name:m.name,color:m.color,hat:m.hat});
    list.sort((a,b)=>(b.id===room.hostId)-(a.id===room.hostId));
    const used=new Set();list.forEach(p=>{if(!p.color||used.has(p.color))p.color=G.COLORS.find(c=>!used.has(c))||G.COLORS[0];used.add(p.color);if(!p.hat)p.hat='none'});
    return list;
  }
  // sohbet state içinde gitmez; her sokete yalnız görmediği satırlar ayrıca yollanır (sendChat)
  function stateMsg(room){return JSON.stringify({t:'state',P:{...room.game.P,chat:undefined,lobby:lobbyOf(room),hostId:room.hostId,room:room.code},now:Date.now()})}
  function sendRaw(ws,str){if(ws.readyState===1){try{ws.send(str)}catch(e){}}}
  function send(ws,obj){sendRaw(ws,JSON.stringify(obj))}
  function sendChat(ws,room){
    const chat=room.game.P.chat;const last=chat.length?chat[chat.length-1].s:0;
    if(!(last>ws.chatSeen))return;
    const a=chat.filter(c=>c.s>ws.chatSeen);
    send(ws,{t:'chat',a,init:!ws.chatSeen||undefined});ws.chatSeen=last;
  }
  function sendPriv(room,uid,force){
    const m=room.members.get(uid);if(!m)return;
    const str=JSON.stringify({t:'priv',d:G.privFor(room.game,uid)});
    if(!force&&room.lastPriv.get(uid)===str)return;room.lastPriv.set(uid,str);
    for(const ws of m.socks)sendRaw(ws,str);
  }
  function flush(room){
    clearTimeout(room.flushT);room.flushT=null;
    if(!rooms.has(room.code))return;
    const st=stateMsg(room);
    for(const [uid,m] of room.members){for(const ws of m.socks){sendRaw(ws,st);sendChat(ws,room)}sendPriv(room,uid)}
  }
  // kısa sürede gelen değişiklikleri tek pakette yolla
  function schedule(room){if(!room.flushT)room.flushT=setTimeout(()=>flush(room),40)}
  function deleteRoom(room,why){
    clearTimeout(room.flushT);rooms.delete(room.code);
    for(const m of room.members.values())for(const ws of m.socks){send(ws,{t:'err',m:why,code:'closed'});ws.room=null;try{ws.close(4000,'oda kapandı')}catch(e){}}
    log('oda silindi',room.code,why);
  }
  function detach(ws){
    const room=ws.room;if(!room)return;ws.room=null;
    const m=room.members.get(ws.uid);if(!m)return;
    m.socks.delete(ws);
    if(!online(m)){
      if(ws.uid===room.hostId)room.hostGoneSince=Date.now();
      // oyunda olmayan (lobideki ya da izleyen) üye kopunca kaydı silinir; oyuncu dönebilsin diye kalır
      if(!(room.game.P.players||[]).some(p=>p.id===ws.uid)){room.members.delete(ws.uid);room.lastPriv.delete(ws.uid)}
    }
    schedule(room);
  }
  function isHost(ws){return ws.room&&ws.uid===ws.room.hostId}

  // ---------- mesajlar ----------
  function onJoin(ws,m){
    const key=cleanUid(m.uid);if(!key)return send(ws,{t:'err',m:'Geçersiz oyuncu kimliği.',code:'bad'});
    const uid=pubId(key);
    let code=cleanCode(m.room);let room=code&&rooms.get(code);
    if(!room){
      if(!m.host)return send(ws,{t:'err',m:'Oda bulunamadı. Kod doğru mu? Oda uzun süre boş kaldıysa kapanmış olabilir.',code:'noroom'});
      if(rooms.size>=MAX_ROOMS)return send(ws,{t:'err',m:'Sunucu dolu, biraz sonra tekrar dene.',code:'full'});
      room=newRoom(code||genCode(rooms),uid);
    }
    let sockCount=0;for(const x of room.members.values())sockCount+=x.socks.size;
    if(sockCount>=MAX_SOCKS_PER_ROOM)return send(ws,{t:'err',m:'Oda dolu.',code:'full'});
    if(ws.room)detach(ws);
    ws.uid=uid;ws.room=room;ws.chatSeen=0;
    let mem=room.members.get(uid);
    if(!mem){mem={name:'',color:null,hat:'none',socks:new Set()};room.members.set(uid,mem)}
    applyLook(mem,m);
    mem.socks.add(ws);
    if(uid===room.hostId){room.hostGoneSince=null;if(m.settings&&room.game.P.phase==='lobby')room.game.settings=G.cleanSettings(m.settings)}
    room.lastActive=Date.now();
    // yeni bağlanana açık kimliği ve hemen tam durum; diğerlerine lobi değişikliği
    send(ws,{t:'you',id:uid});
    sendRaw(ws,stateMsg(room));sendChat(ws,room);sendRaw(ws,JSON.stringify({t:'priv',d:G.privFor(room.game,uid)}));
    schedule(room);
  }
  function applyLook(mem,m){
    const n=cleanName(m.name);if(n)mem.name=n;
    if(G.COLORS.includes(m.color))mem.color=m.color;
    if(G.HATS.includes(m.hat))mem.hat=m.hat;
  }
  function onMessage(ws,m){
    if(m.t==='join')return onJoin(ws,m);
    const room=ws.room;if(!room)return;
    room.lastActive=Date.now();
    const R=room.game,uid=ws.uid;
    switch(m.t){
      case 'look':{const mem=room.members.get(uid);if(mem){applyLook(mem,m);schedule(room)}break}
      case 'settings':if(isHost(ws)&&R.P.phase==='lobby')R.settings=G.cleanSettings(m);break;
      case 'start':
        if(!isHost(ws)||R.P.phase!=='lobby')break;
        if(m.settings)R.settings=G.cleanSettings(m.settings);
        if(G.startGame(R,lobbyOf(room))){room.lastPriv.clear();log('oyun başladı',room.code,R.P.players.length+' kişi');flush(room)}
        else send(ws,{t:'err',m:'Başlamak için 4–12 oyuncu gerekir.',code:'soft'});
        break;
      case 'cancel':if(isHost(ws)&&R.P.phase!=='lobby'){G.endToLobby(R);flush(room)}break;
      case 'close':if(isHost(ws))deleteRoom(room,'Ev sahibi odayı kapattı.');break;
      case 'act':G.act(R,uid,m);break; // gece hamlesi gizli: kimseye yayın yok
      case 'vote':if(G.vote(R,uid,m.v,m.d))schedule(room);break;
      case 'msg':if(G.chat(R,uid,m.x))schedule(room);break;
      case 'dmsg':if(G.deadChat(R,uid,m.x))schedule(room);break;
    }
  }

  // ---------- WebSocket ----------
  const wss=new WebSocketServer({server,path:'/ws',maxPayload:16*1024});
  wss.on('connection',ws=>{
    ws.isAlive=true;ws.room=null;ws.uid=null;ws.chatSeen=0;ws.bucket={t:Date.now(),n:0};
    ws.on('pong',()=>{ws.isAlive=true});
    ws.on('message',data=>{
      // basit hız sınırı: saniyede 30 mesaj
      const now=Date.now();if(now-ws.bucket.t>1000)ws.bucket={t:now,n:0};if(++ws.bucket.n>30)return;
      let m;try{m=JSON.parse(data)}catch(e){return}
      if(!m||typeof m!=='object'||typeof m.t!=='string')return;
      try{onMessage(ws,m)}catch(e){log('hata',e&&e.stack||e)}
    });
    ws.on('close',()=>detach(ws));
    ws.on('error',()=>{});
  });
  // ölü bağlantıları (uyuyan telefonlar) temizle
  const pingIv=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue}ws.isAlive=false;try{ws.ping()}catch(e){}}},opts.pingMs||30000);

  // ---------- zamanlayıcı: faz geçişleri, ev sahibi devri, oda temizliği ----------
  const tickIv=setInterval(()=>{
    const now=Date.now();
    for(const room of [...rooms.values()]){
      if(now-room.lastActive>ROOM_TTL_MS){deleteRoom(room,'Oda uzun süre kullanılmadığı için kapandı.');continue}
      try{if(G.tick(room.game))flush(room)}catch(e){log('hata',room.code,e&&e.stack||e)}
      if(room.hostGoneSince&&now-room.hostGoneSince>=HOST_GRACE_MS){
        const players=(room.game.P.players||[]).map(p=>p.id);
        const cands=[...room.members.keys()].filter(id=>online(room.members.get(id))&&room.members.get(id).name);
        const next=cands.find(id=>players.includes(id))||cands[0];
        if(next){log('ev sahibi devri',room.code,room.hostId,'→',next);room.hostId=next;room.hostGoneSince=null;flush(room)}
      }
    }
  },opts.tickMs||500);

  function close(cb){clearInterval(pingIv);clearInterval(tickIv);for(const r of [...rooms.values()])clearTimeout(r.flushT);for(const ws of wss.clients)ws.terminate();wss.close();server.close(cb)}
  return {server,wss,rooms,close};
}

module.exports={createServer};

if(require.main===module){
  const port=+process.env.PORT||8787,host=process.env.HOST||'0.0.0.0';
  const s=createServer();
  s.server.listen(port,host,()=>console.log('Kasaba Gecesi sunucusu: http://'+host+':'+port+'  (WebSocket: /ws)'));
  const stop=()=>s.close(()=>process.exit(0));
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
