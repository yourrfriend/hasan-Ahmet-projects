'use strict';
// Kasaba Gecesi sunucusu: oda yönetimi, WebSocket, faz zamanlayıcısı, yeniden bağlanma, statik dosya.
// Tek süreç, odalar bellekte. Çalıştır: node server.js  (PORT=8787, HOST=0.0.0.0)
const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {WebSocketServer}=require('ws');
const G=require('./game.js');
const Kayit=require('./kayit.js');
const Kimlik=require('./kimlik.js');
const Hesap=require('./hesap.js');
const Eposta=require('./eposta.js');
const Kod=require('./kod.js');

const ROOM_TTL_MS=+process.env.ROOM_TTL_MS||2*60*60*1000;   // bu kadar süre mesaj gelmezse oda silinir
const HOST_GRACE_MS=+process.env.HOST_GRACE_MS||10*60*1000; // ev sahibi bu kadar dönmezse yetki devredilir
const EMPTY_ROOM_MS=+process.env.EMPTY_ROOM_MS||10*60*1000; // kimse bağlı değilse oda bu kadar sonra silinir
const MAX_ROOMS=+process.env.MAX_ROOMS||1000;
// IP başına frenler (tünel/Caddy arkasında IP CF-Connecting-IP ya da X-Forwarded-For'dan; doğrudan bağlantıda soket adresi)
const IP_ODA=+process.env.MAX_ROOMS_PER_IP||5;           // aynı anda ev sahipliği yapılan oda
const IP_SOKET=+process.env.MAX_SOCKS_PER_IP||24;        // eşzamanlı soket
const IP_ODA_DAKIKA=+process.env.MAX_ROOMS_PER_IP_MIN||5; // dakikada oda kurma
const MAX_SOCKS_PER_ROOM=40;
const INDEX=path.join(__dirname,'..','index.html');
const GAME_JS=path.join(__dirname,'game.js'); // istemci de yükler: sabitler tek yerde
const SAYFA=path.join(__dirname,'..','sayfa'); // gömülü supabase-js (ve ileride sayfa betikleri); yalnız düz .js adları
const CODE_CHARS='abcdefghjkmnpqrstuvwxyz23456789';
// İstemcinin gönderdiği kimlik (kg_uid) gizli anahtardır; herkese açık durumda ondan türetilen
// kısa bir kimlik gezer. Açık kimliği bilen başkasının yerine giremez, ev sahibi olamaz.
const pubId=key=>crypto.createHash('sha256').update('kg:'+key).digest('base64url').slice(0,12);

function genCode(rooms){for(;;){let s='';for(let i=0;i<12;i++)s+=CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)];if(!rooms.has(s))return s}}
const cleanCode=v=>typeof v==='string'?v.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,12):'';
const cleanUid=v=>typeof v==='string'?v.replace(/[^A-Za-z0-9_-]/g,'').slice(0,24):'';
const cleanName=v=>typeof v==='string'?v.trim().slice(0,16):'';

function createServer(opts={}){
  const rooms=new Map();
  const log=opts.quiet?()=>{}:(...a)=>console.log(new Date().toISOString(),...a);
  const ipOda=opts.ipOda||IP_ODA,ipSoket=opts.ipSoket||IP_SOKET,ipOdaDakika=opts.ipOdaDakika||IP_ODA_DAKIKA;
  const ipSoketler=new Map(),ipKurmalar=new Map(); // ip → açık soket sayısı; ip → son bir dakikadaki oda kurma zamanları
  const ipOdalar=ip=>[...rooms.values()].filter(r=>r.ip===ip).length;
  // Supabase ayarı (env ya da opts.ayar): url/anonKey istemciye /ayar.json ile gider; serviceKey ve jwtSecret yalnız sunucuda
  const ayar=opts.ayar||{url:process.env.SUPABASE_URL||null,anonKey:process.env.SUPABASE_ANON_KEY||null,serviceKey:process.env.SUPABASE_SERVICE_KEY||null,jwtSecret:process.env.SUPABASE_JWT_SECRET||null,jwks:process.env.SUPABASE_JWT_JWKS||null,kurulum:process.env.KG_KURULUM||null,kancaSirri:process.env.EPOSTA_KANCA_SIRRI||null,
    // Plan 7: Turnstile, GoTrue yerel adresi, kod tavanları
    turnstileSite:process.env.TURNSTILE_SITE||null,turnstileSecret:process.env.TURNSTILE_SECRET||null,turnstileHostnames:(process.env.TURNSTILE_HOSTNAMES||process.env.ALAN||'').split(',').map(x=>x.trim()).filter(Boolean),
    icUrl:process.env.SUPABASE_IC_URL||null,kodGunluk:+process.env.KOD_GUNLUK||80,kodSaatlik:+process.env.KOD_SAATLIK||30,kancaGunluk:+process.env.KANCA_GUNLUK||90};
  // Token doğrulama anahtarları: HS256 için jwtSecret; ES256/RS256 için JWKS — env'den (JSON ya da base64) ya da Supabase'in açık
  // JWKS uç noktasından (açık anahtarlar; gizli değil). Çekim başarısızsa artan aralıkla yeniden denenir (sunucu Supabase'den önce
  // açılabilir); bilinmeyen kid gelince (anahtar dönmüş) en çok dakikada bir yeniden çekilir. Anahtar yokken herkes misafirdir.
  const dogrulama={secret:ayar.jwtSecret||null,jwks:Kimlik.jwksCoz(typeof ayar.jwks==='string'?ayar.jwks:ayar.jwks?JSON.stringify(ayar.jwks):null)};
  const jwksGetirici=opts.jwksGetirici||(async()=>{const r=await fetch(ayar.url.replace(/\/+$/,'')+'/auth/v1/.well-known/jwks.json',{headers:ayar.anonKey?{apikey:ayar.anonKey}:{},signal:AbortSignal.timeout(5000)});return r.json()});
  const jwksDenemeMs=opts.jwksDenemeMs||[10000,30000,60000,300000],jwksYenilemeMs=opts.jwksYenilemeMs??60000;
  let jwksSonCekim=0,jwksSuren=null,jwksZamanlayici=null;
  async function jwksGetir(deneme=0){
    if(!ayar.url||opts.jwksAlma===false)return;
    if(jwksSuren)return jwksSuren;
    jwksSuren=(async()=>{try{jwksSonCekim=Date.now();const j=await jwksGetirici();if(j&&Array.isArray(j.keys)&&j.keys.length){dogrulama.jwks=j;log('jwks alındı',j.keys.length+' anahtar');return}log('jwks boş')}catch(e){log('jwks alınamadı',e.message)}
      if(!dogrulama.jwks){const ms=jwksDenemeMs[Math.min(deneme,jwksDenemeMs.length-1)];jwksZamanlayici=setTimeout(()=>jwksGetir(deneme+1),ms)}})().finally(()=>{jwksSuren=null});
    return jwksSuren;
  }
  if(!dogrulama.jwks)jwksGetir();
  // token'ın kid'i elimizdeki JWKS'te yoksa (anahtar döndü) yeniden çek; dakikada en çok bir kez
  function kidBilinmiyor(token){const p=String(token).split('.');if(p.length!==3)return false;let h;try{h=JSON.parse(Buffer.from(p[0],'base64url').toString('utf8'))}catch(e){return false}
    if(!h||!['ES256','RS256'].includes(h.alg)||!h.kid)return false;return !(dogrulama.jwks&&dogrulama.jwks.keys.some(k=>k.kid===h.kid))}
  const ayarAcik=()=>({url:ayar.url||null,anonKey:ayar.anonKey||null,kurulum:ayar.kurulum||null,kayit:!!(ayar.url&&ayar.serviceKey),eposta:!!(ayar.url&&ayar.serviceKey&&ayar.kancaSirri),turnstile:ayar.turnstileSite||null}); // eposta: bu kurulum GoTrue kancasının hedefi (sır var) → istemcide bağla/gir düğmeleri; turnstile: site anahtarı (gizli değil)
  // E-posta (Plan 6): GoTrue "Send Email" kancası → tek gönderim fonksiyonu. Sır yoksa uç kapalı (404). webhook-id ile 10 dk tekilleştirme (GoTrue yeniden dener).
    // kota: kanca günlük tavanı (KANCA_GUNLUK); kancaGun: son 24 saatin gönderim zamanları
const eposta=opts.eposta||Eposta.varsayilan;const epostaSayac={gonderilen:0,hata:0,atlanan:0,sinir:0,kota:0};const kancaGun=[];const kancaGorulen=new Map();const kancaAlici=new Map();const KANCA_ALICI_SAAT=opts.kancaAliciSaat||5;
  function govdeOku(req,sinir){return new Promise((res,rej)=>{let b='';let asim=false;req.on('data',d=>{if(asim)return;b+=d;if(b.length>sinir){asim=true;rej(Object.assign(new Error('büyük'),{kod:413}))}});req.on('end',()=>{if(!asim)res(b)});req.on('error',rej)})}
  async function kancaUcu(req,res){
    const json=(d,b)=>{res.writeHead(d,{'Content-Type':'application/json'});res.end(JSON.stringify(b))};
    if(!ayar.kancaSirri){res.writeHead(404);return res.end('yok')}
    let govde;try{govde=await govdeOku(req,64*1024)}catch(e){return json(e.kod===413?413:400,{error:{http_code:e.kod===413?413:400,message:'gövde'}})}
    const d=Hesap.imzaDogrula({sirlar:ayar.kancaSirri,headers:req.headers,govde,simdiMs:Date.now()});
    if(!d.ok){log('kanca reddedildi',d.neden);return json(401,{error:{http_code:401,message:'imza: '+d.neden}})}
    const id=req.headers['webhook-id'];const simdi=Date.now();for(const [k,v] of kancaGorulen)if(simdi-v.zaman>600000)kancaGorulen.delete(k);
    // tekilleştirme: süren işin promise'i saklanır (eşzamanlı tekrar aynı sonucu bekler); yalnız 200 sonuç 10 dk tutulur,
    // başarısız gönderim silinir ki GoTrue'nun yeniden denemesi gerçekten yeniden göndersin (biz kendimiz denemeyiz)
    let is=kancaGorulen.get(id);
    if(!is){
      is={zaman:simdi,sonuc:(async()=>{
        let yuk;try{yuk=JSON.parse(govde)}catch(e){return {durum:400,govde:{error:{http_code:400,message:'json'}}}}
        const c=Hesap.kancaYukunuCoz(yuk);
        // alıcı başına saatte en çok 5 kod maili (anon anahtarla herkes kod isteyebilir; Resend kotası ve gönderici itibarı)
        if(c.alici){const l=(kancaAlici.get(c.alici)||[]).filter(t=>simdi-t<3600000);if(l.length>=KANCA_ALICI_SAAT){epostaSayac.sinir++;log('kanca sınır',Hesap.maskele(c.alici));return {durum:500,govde:{error:{http_code:500,message:'e-posta gönderilemedi'}}}}l.push(simdi);kancaAlici.set(c.alici,l)}
        // kanca günlük tavanı (tek boğaz; iki kurulum birlikte Resend'in günlük 100'ünü aşmasın)
        if(c.alici){while(kancaGun.length&&simdi-kancaGun[0]>=86400000)kancaGun.shift();if(kancaGun.length>=ayar.kancaGunluk){epostaSayac.kota++;log('UYARI kanca günlük tavan doldu');return {durum:500,govde:{error:{http_code:500,message:'e-posta gönderilemedi'}}}}kancaGun.push(simdi)}
        // sayfa: kurulumun kendi adresi (ALAN, kur.sh'nin env'i) — maildeki tek link
        const r=await Hesap.kancaIsle({yuk,eposta,sayac:epostaSayac,sayfa:process.env.ALAN?'https://'+process.env.ALAN+'/':undefined});
        log('kanca',c.tur||'atlandi',c.alici?Hesap.maskele(c.alici):'-',r.durum);return r})()};
      kancaGorulen.set(id,is);
    }
    const r=await is.sonuc;if(r.durum!==200&&kancaGorulen.get(id)===is)kancaGorulen.delete(id);
    return json(r.durum,r.govde);
  }
  const kayit=opts.kayit||Kayit.olustur({url:ayar.url,serviceKey:ayar.serviceKey,kurulum:ayar.kurulum,quiet:!!opts.quiet}); // olay günlüğünün gittiği yer (testler bellekte biriktiren bir sahte verir)
  // odanın biriken olaylarını kayıt yuvasına ver (R.log boşalır; R.gameLog oyunda kalır)
  function bosalt(room){const R=room.game;if(R.log.length)kayit.kuyrukla(room,R.log.splice(0))}
  // Bu Akşamın Skoru: biten maç bir kez işlenir (gameId); katılımcılar oynadı, P.winner.kazananlar kazandı. İptal işlenmez.
  function skorIsle(room){const P=room.game.P;if(P.phase!=='end'||!P.gameId||room.skorIslenen.has(P.gameId))return;room.skorIslenen.add(P.gameId);
    const kaz=new Set((P.winner&&P.winner.kazananlar)||[]);
    for(const p of P.players){const s=room.skor.get(p.id)||{ad:p.name,oynadi:0,kazandi:0};s.ad=p.name;s.oynadi++;if(kaz.has(p.id))s.kazandi++;room.skor.set(p.id,s)}}
  const skorListesi=room=>[...room.skor].map(([id,s])=>({id,ad:s.ad,oynadi:s.oynadi,kazandi:s.kazandi})).sort((a,b)=>b.kazandi-a.kazandi||a.ad.localeCompare(b.ad,'tr'));

  // ---------- statik dosya ----------
  // Önbellek: html ve sürümsüz betikler no-cache + ETag (Cloudflare kenarı eski kopyayı tutmasın; tarayıcı 304 alır);
  // ?v=<sürüm> ile istenen /sayfa/* dosyaları bir yıl önbelleklenir. Sayfalar betikleri __V__ yerine yazılan kurulum sürümüyle ister.
  const SURUM_V=(process.env.KG_SURUM||'').replace(/[^A-Za-z0-9._-]/g,'-')||('dev'+Date.now());
  function statik(req,res,buf,tip,surumlu){
    const etag='W/"'+crypto.createHash('sha1').update(buf).digest('base64url').slice(0,20)+'"';
    const cc=surumlu?'public, max-age=31536000, immutable':'no-cache';
    if(req.headers['if-none-match']===etag){res.writeHead(304,{ETag:etag,'Cache-Control':cc});return res.end()}
    res.writeHead(200,{'Content-Type':tip,'Cache-Control':cc,ETag:etag});res.end(req.method==='HEAD'?undefined:buf);
  }
  // Kod istekleri ve anonim kimlik (Plan 7): mail üreten tek herkese açık giriş burası. Turnstile + tavanlar; GoTrue'ya yalnız yerel adresten.
  const tavan=Kod.tavanlar({saat:ayar.kodSaatlik,gun:ayar.kodGunluk});const kodSayac={gonderildi:0,turnstile_red:0};
  const icFetch=opts.icFetch||((u,o)=>fetch(u,o)),turnstileFetch=opts.turnstileFetch||((u,o)=>fetch(u,o));
  const tavanTemizle=setInterval(()=>tavan.temizle(),600000);if(tavanTemizle.unref)tavanTemizle.unref();
  if(ayar.url&&ayar.serviceKey&&ayar.kancaSirri&&!ayar.icUrl)log('UYARI: SUPABASE_IC_URL yok; /eposta/kod ve /hesap/anonim 503 döner');
  const icKok=()=>String(ayar.icUrl||'').replace(/\/+$/,'');
  async function icIstek(yontem,yol,govde,ekBaslik){const r=await icFetch(icKok()+yol,{method:yontem,headers:{apikey:ayar.anonKey||'','Content-Type':'application/json',...(ekBaslik||{})},body:govde===undefined?undefined:JSON.stringify(govde),signal:AbortSignal.timeout(10000)});let j=null;try{j=await r.json()}catch(e){}return {durum:r.status,govde:j}}
  async function kodUcu(req,res){
    const json=(d,b)=>{res.writeHead(d,{'Content-Type':'application/json'});res.end(JSON.stringify(b))};
    if(!ayarAcik().eposta){res.writeHead(404);return res.end('yok')}
    let g;try{g=JSON.parse(await govdeOku(req,8*1024))}catch(e){return json(400,{error:'gecersiz_govde'})}
    const tur=g&&g.tur,email=String(g&&g.email||'').trim().toLowerCase();
    if(!(tur==='bagla'||tur==='gir')||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return json(400,{error:'gecersiz_govde'});
    if(!ayar.turnstileSecret)return json(503,{error:'turnstile_ayarsiz'});
    if(!ayar.icUrl)return json(503,{error:'ic'});
    const ip=ipOf(req);const k=tavan.kontrol({ip,adres:email});
    if(!k.ok&&k.neden==='ip')return json(429,{error:'limit',sureSn:k.sureSn});
    const t=await Kod.turnstileDogrula({secret:ayar.turnstileSecret,response:g.turnstile,remoteip:ip,action:'kod_'+tur,hostnames:ayar.turnstileHostnames,fetch:turnstileFetch});
    if(!t.ok){kodSayac.turnstile_red++;log('kod turnstile red',t.neden);return json(403,{error:'turnstile',neden:t.neden})}
    if(!k.ok)return json(k.neden==='kota'?503:429,{error:k.neden==='kota'?'kota':'limit',sureSn:k.sureSn});
    let sonuc;
    if(tur==='bagla'){
      if(typeof g.token!=='string'||!g.token)return json(401,{error:'token'});
      const kim=Kimlik.dogrula(g.token,dogrulama);if(!kim||kim.suresiDolmus)return json(401,{error:'token'});
      if(kim.eposta)return json(400,{error:'zaten_bagli'});
      tavan.isaretle({ip,adres:email});
      try{sonuc=await icIstek('PUT','/auth/v1/user',{email},{Authorization:'Bearer '+g.token})}catch(e){return json(503,{error:'ic'})}
    }else{
      tavan.isaretle({ip,adres:email});
      try{sonuc=await icIstek('POST','/auth/v1/otp',{email,create_user:false})}catch(e){return json(503,{error:'ic'})}
    }
    log('kod',tur,Hesap.maskele(email),sonuc.durum);
    if(sonuc.durum>=200&&sonuc.durum<300){kodSayac.gonderildi++;return json(200,{ok:true})}
    const b=sonuc.govde||{};return json(sonuc.durum>=400&&sonuc.durum<600?sonuc.durum:502,{error:'gotrue',error_code:b.error_code||b.code||null,msg:b.msg||b.message||null});
  }
  async function anonimUcu(req,res){
    const json=(d,b)=>{res.writeHead(d,{'Content-Type':'application/json'});res.end(JSON.stringify(b))};
    if(!(ayar.url&&ayar.anonKey)){res.writeHead(404);return res.end('yok')}
    if(!ayar.icUrl)return json(503,{error:'ic'});
    const a=tavan.anonimKontrol(ipOf(req));if(!a.ok)return json(429,{error:'limit',sureSn:a.sureSn});
    let sonuc;try{sonuc=await icIstek('POST','/auth/v1/signup',{})}catch(e){return json(503,{error:'ic'})}
    return json(sonuc.durum,sonuc.govde||{});
  }
  // Hesap birleştirme (Plan 6): ikinci cihazda e-postayla girince o cihazın anonim geçmişi hesaba taşınır. Yalnız kayıt açıkken; IP başına dakikada 5.
  const hesapFetch=opts.hesapFetch||((u,o)=>fetch(u,o));const birlestirmeSayac={ok:0,hata:0};const ipBirlestirme=new Map();
  async function birlestirUcu(req,res){
    const json=(d,b)=>{res.writeHead(d,{'Content-Type':'application/json'});res.end(JSON.stringify(b))};
    if(!(ayar.url&&ayar.serviceKey)){res.writeHead(404);return res.end('yok')}
    const ip=ipOf(req),simdi=Date.now();const son=(ipBirlestirme.get(ip)||[]).filter(t=>simdi-t<60000);
    if(son.length>=5){birlestirmeSayac.hata++;return json(429,{error:'limit'})}son.push(simdi);ipBirlestirme.set(ip,son);
    let govde;try{govde=JSON.parse(await govdeOku(req,8*1024))}catch(e){birlestirmeSayac.hata++;return json(400,{error:'gecersiz_govde'})}
    const r=await Hesap.birlestir(govde,{dogrula:t=>Kimlik.dogrula(t,dogrulama),url:ayar.url,serviceKey:ayar.serviceKey,fetch:hesapFetch});
    if(r.durum===200)birlestirmeSayac.ok++;else birlestirmeSayac.hata++;
    log('birlestir',r.durum,r.govde.error||r.govde.uyari||'ok');return json(r.durum,r.govde);
  }
  const server=http.createServer((req,res)=>{
    const url=(req.url||'/').split('?')[0],surumlu=/[?&]v=/.test(req.url||'');
    if(req.method==='POST'&&url==='/eposta/kanca'){kancaUcu(req,res).catch(e=>{log("kanca hata",e&&e.message);res.writeHead(500);res.end()});return}
    if(req.method==='POST'&&url==='/hesap/birlestir'){birlestirUcu(req,res).catch(()=>{res.writeHead(500);res.end()});return}
    if(req.method==='POST'&&url==='/eposta/kod'){kodUcu(req,res).catch(()=>{res.writeHead(500);res.end()});return}
    if(req.method==='POST'&&url==='/hesap/anonim'){anonimUcu(req,res).catch(()=>{res.writeHead(500);res.end()});return}
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end()}
    if(url==='/'||url==='/index.html'){
      fs.readFile(INDEX,(err,buf)=>{
        if(err){res.writeHead(500);return res.end('index.html okunamadı')}
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:buf.toString('utf8').split('__V__').join(SURUM_V));
      });return;
    }
    if(url==='/sunucu/game.js'){
      fs.readFile(GAME_JS,(err,buf)=>{
        if(err){res.writeHead(500);return res.end('game.js okunamadı')}
        statik(req,res,buf,'text/javascript; charset=utf-8',surumlu);
      });return;
    }
    if(url==='/ayar.json'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-cache'});return res.end(JSON.stringify(ayarAcik()))}
    if(/^\/sayfa\/[a-z0-9_-]+\.(js|css)$/.test(url)){
      const css=url.endsWith('.css');
      fs.readFile(path.join(SAYFA,url.slice(7)),(err,buf)=>{
        if(err){res.writeHead(404);return res.end('yok')}
        statik(req,res,buf,(css?'text/css':'application/javascript')+'; charset=utf-8',surumlu);
      });return;
    }
    // geçmiş sayfaları (Plan 5): /oyun/<uuid> ve /kasaba/<uuid> → statik html; veriyi sayfa Supabase'den kendi oturumuyla okur
    const sayfaYolu=url.match(/^\/(oyun|kasaba)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    if(sayfaYolu){
      fs.readFile(path.join(SAYFA,sayfaYolu[1]+'.html'),(err,buf)=>{
        if(err){res.writeHead(404);return res.end('yok')}
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:buf.toString('utf8').split('__V__').join(SURUM_V));
      });return;
    }
    if(url==='/saglik'){const k=kayit.sayac||{};res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,rooms:rooms.size,surum:process.env.KG_SURUM||null,kayit:{kuyruk:k.kuyruk||0,yazilan:k.yazilan||0,hata:k.hata||0,dusen:k.dusen||0},eposta:{...epostaSayac},birlestirme:{...birlestirmeSayac},kod:{...tavan.sayac,...kodSayac}}))} // kayıt, e-posta, birleştirme ve kod sayaçları: yalnız sayılar
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Bulunamadı');
  });

  // ---------- oda yardımcıları ----------
  function newRoom(code,hostId,ip){
    const room={code,hostId,ip,game:G.createGame(),members:new Map(),lastActive:Date.now(),hostGoneSince:null,emptySince:null,flushT:null,lastPriv:new Map(),hazir:new Set(),skor:new Map(),skorIslenen:new Set(),gorduler:new Set()}; // hazir: rövanşa hazır üyeler (yalnız oyun sonunda); skor: oda oturumu (pubId → {ad,oynadi,kazandi})
    rooms.set(code,room);log('oda açıldı',code);return room;
  }
  const online=m=>m.socks.size>0;
  const anyOnline=room=>[...room.members.values()].some(online);
  // oyunda olmayan (lobideki ya da izleyen) üye kopunca kaydı silinir; oyuncu dönebilsin diye kalır.
  // Lobiye dönüşte (iptal) ya da yeni oyunda eski oyuncular da buradan temizlenir.
  function prune(room){const players=room.game.P.players||[];for(const [id,m] of room.members)if(!online(m)&&!players.some(p=>p.id===id)){room.members.delete(id);room.lastPriv.delete(id);room.hazir.delete(id)}}
  // lobi: bağlı ve adı olan üyeler, ev sahibi önde; aynı rengi seçen ikinciye boş renk
  function lobbyOf(room){
    const list=[];
    for(const [id,m] of room.members)if(online(m)&&m.name)list.push({id,name:m.name,color:m.color,hat:m.hat});
    list.sort((a,b)=>(b.id===room.hostId)-(a.id===room.hostId));
    const used=new Set();list.forEach(p=>{if(!p.color||used.has(p.color))p.color=G.COLORS.find(c=>!used.has(c))||G.COLORS[0];used.add(p.color);if(!p.hat)p.hat='none'});
    return list;
  }
  // sohbet state içinde gitmez; her sokete yalnız görmediği satırlar ayrıca yollanır (sendChat)
  // online: bağlı üyelerin açık kimlikleri; istemci kopuk oyuncuyu işaretler, gece sonu onları bekler
  const onlineIds=room=>[...room.members].filter(([,m])=>online(m)).map(([id])=>id);
  function stateMsg(room){return JSON.stringify({t:'state',P:{...room.game.P,chat:undefined,lobby:lobbyOf(room),hostId:room.hostId,room:room.code,online:onlineIds(room),hazir:[...room.hazir],skor:skorListesi(room)},now:Date.now()})}
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
    skorIsle(room);bosalt(room);prune(room);
    const st=stateMsg(room);
    for(const [uid,m] of room.members){for(const ws of m.socks){sendRaw(ws,st);sendChat(ws,room)}sendPriv(room,uid)}
  }
  // kısa sürede gelen değişiklikleri tek pakette yolla
  function schedule(room){if(!room.flushT)room.flushT=setTimeout(()=>flush(room),40)}
  function deleteRoom(room,why){
    clearTimeout(room.flushT);
    if(G.inGame(room.game))G.endToLobby(room.game); // süren oyun iptal sayılır: günlük 'iptal' ile biter (kayıt tarafı buna güvenir)
    bosalt(room);rooms.delete(room.code);
    for(const m of room.members.values())for(const ws of m.socks){send(ws,{t:'err',m:why,code:'closed'});ws.room=null;try{ws.close(4000,'oda kapandı')}catch(e){}}
    log('oda silindi',room.code,why);
  }
  function detach(ws){
    const room=ws.room;if(!room)return;ws.room=null;
    const m=room.members.get(ws.uid);if(!m)return;
    m.socks.delete(ws);
    if(!online(m)){
      const R=room.game,oy=G.inGame(R)&&(R.P.players||[]).find(p=>p.id===ws.uid);
      if(oy)G.olay(R,'kopus',{kim:ws.uid,olu:!oy.alive}); // ölçüm: oyundaki oyuncu koptu (gün/faz zarfta)
      if(ws.uid===room.hostId)room.hostGoneSince=Date.now();
      if(!anyOnline(room))room.emptySince=Date.now();
    }
    schedule(room);
  }
  // soket başka bir odaya geçiyor: ayrılır; boş bıraktığı lobi odası süre dolmasını beklemeden silinir
  function leave(ws){const old=ws.room;if(!old)return;detach(ws);if(old.game.P.phase==='lobby'&&!anyOnline(old))deleteRoom(old,'Oda terk edildi.')}
  function isHost(ws){return ws.room&&ws.uid===ws.room.hostId}

  // ---------- mesajlar ----------
  function onJoin(ws,m){
    // kimlik: geçerli imzalı Supabase token'ı varsa sub (uuid) → 'sb:<uuid>' (kayıtlı); yoksa istemcinin gizli anahtarı (misafir).
    // Süresi dolmuş ama imzası doğru token da kimlik verir (koltuk kaybolmasın; tasarım §5.2). uuid yayınlara girmez: pubId hash'tir.
    let k=(dogrulama.secret||dogrulama.jwks)&&typeof m.token==='string'?Kimlik.dogrula(m.token,dogrulama):null;
    if(!k&&typeof m.token==='string'&&!m._jwksDenendi&&ayar.url&&opts.jwksAlma!==false&&kidBilinmiyor(m.token)&&Date.now()-jwksSonCekim>=jwksYenilemeMs){
      m._jwksDenendi=true;jwksGetir().then(()=>{if(ws.readyState===1)onJoin(ws,m)});return} // yeniden çekip aynı join'i tekrar dene
    const key=k?'sb:'+k.sub:cleanUid(m.uid);if(!key)return send(ws,{t:'err',m:'Geçersiz oyuncu kimliği.',code:'bad'});
    const uid=pubId(key);
    let code=cleanCode(m.room);let room=code&&rooms.get(code);
    // ev sahibi eski kodunu getirdi ama oda artık başkasının (eskisi kapanmış, kod yeniden dağıtılmış):
    // üyesi ya da oyuncusu değilse yabancının lobisine düşmesin, yeni oda alsın
    if(room&&m.host&&room.hostId!==uid&&!room.members.has(uid)&&!(room.game.P.players||[]).some(p=>p.id===uid)){room=null;code=''}
    if(ws.room&&ws.room!==room)leave(ws);
    if(!room){
      if(!m.host)return send(ws,{t:'err',m:'Oda bulunamadı. Kod doğru mu? Oda uzun süre boş kaldıysa kapanmış olabilir.',code:'noroom'});
      if(rooms.size>=MAX_ROOMS)return send(ws,{t:'err',m:'Sunucu dolu, biraz sonra tekrar dene.',code:'full'});
      const simdi=Date.now();const son=(ipKurmalar.get(ws.ip)||[]).filter(t=>simdi-t<60000);
      if(ipOdalar(ws.ip)>=ipOda||son.length>=ipOdaDakika)return send(ws,{t:'err',m:'Bu adresten çok fazla oda açıldı; biraz sonra tekrar dene.',code:'limit'});
      son.push(simdi);ipKurmalar.set(ws.ip,son);
      room=newRoom(genCode(rooms),uid,ws.ip); // kodu her zaman sunucu üretir: eski/elle kod "kapılamaz"; "Önceki odam" yalnız oda yaşıyorsa onu açar
    }
    let sockCount=0;for(const x of room.members.values())sockCount+=x.socks.size;
    if(sockCount>=MAX_SOCKS_PER_ROOM)return send(ws,{t:'err',m:'Oda dolu.',code:'full'});
    if(ws.room)detach(ws);
    ws.uid=uid;ws.room=room;ws.chatSeen=0;room.emptySince=null;
    let mem=room.members.get(uid);
    if(mem&&!online(mem)&&G.inGame(room.game)&&(room.game.P.players||[]).some(p=>p.id===uid))G.olay(room.game,'dondu',{kim:uid}); // ölçüm: kopan oyuncu döndü
    if(!mem){mem={name:'',color:null,hat:'none',socks:new Set(),uye:null};room.members.set(uid,mem)}
    mem.uye=k?k.sub:mem.uye||null; // kayıtlı oyuncunun kalıcı kimliği (profil yazımı için); yayınlanmaz
    applyLook(room,uid,mem,m);
    mem.socks.add(ws);
    if(uid===room.hostId){room.hostGoneSince=null;if(m.settings&&room.game.P.phase==='lobby')room.game.settings=G.cleanSettings(m.settings)}
    room.lastActive=Date.now();
    // yeni bağlanana açık kimliği ve hemen tam durum; diğerlerine lobi değişikliği
    send(ws,{t:'you',id:uid,kayitli:!!k});
    sendRaw(ws,stateMsg(room));sendChat(ws,room);sendPriv(room,uid,true);
    schedule(room);
  }
  function applyLook(room,uid,mem,m){
    const n=cleanName(m.name);if(n){mem.name=n;const sk=room.skor.get(uid);if(sk)sk.ad=n} // skor tablosu son adı gösterir
    if(G.COLORS.includes(m.color))mem.color=m.color;
    if(G.HATS.includes(m.hat))mem.hat=m.hat;
    if(mem.uye&&mem.name)kayit.profil(mem.uye,{ad:mem.name,renk:mem.color,sapka:mem.hat}); // kayıtlı oyuncu: profil (arka planda, oyunu beklemez)
  }
  function onMessage(ws,m){
    if(m.t==='join')return onJoin(ws,m);
    const room=ws.room;if(!room)return;
    room.lastActive=Date.now();
    const R=room.game,uid=ws.uid;
    switch(m.t){
      case 'look':{const mem=room.members.get(uid);if(mem){applyLook(room,uid,mem,m);schedule(room)}break}
      case 'settings':if(isHost(ws)&&R.P.phase==='lobby')R.settings=G.cleanSettings(m);break;
      case 'start':{
        // lobiden: bağlı herkes. Oyun sonundan rövanş (rovans:true): yalnız hazır ∧ bağlı üyeler; başlatan ev sahibi hazır sayılır
        if(!isHost(ws))break;
        const rovans=!!m.rovans&&R.P.phase==='end';if(!(R.P.phase==='lobby'||rovans))break;
        skorIsle(room); // flush beklenmeden başlatılırsa biten maçın skoru kaçmasın
        if(m.settings)R.settings=G.cleanSettings(m.settings);
        const liste=rovans?lobbyOf(room).filter(p=>p.id===uid||room.hazir.has(p.id)):lobbyOf(room);
        if(rovans&&(liste.length<4||liste.length>12)){send(ws,{t:'err',m:'Rövanş için 4–12 hazır ve bağlı oyuncu gerekir (şu an '+liste.length+').',code:'soft'});break}
        const onceki=R.P.gameId;if(rovans)G.olay(R,'rovans_basladi',{onceki,oyuncular:liste.map(p=>p.id)});
        if(G.startGame(R,liste,rovans?{rovans:true,onceki}:null)){room.hazir.clear();room.gorduler.clear();room.lastPriv.clear();log(rovans?'rövanş başladı':'oyun başladı',room.code,R.P.players.length+' kişi');flush(room)}
        else send(ws,{t:'err',m:'Başlamak için 4–12 oyuncu gerekir.',code:'soft'});
        break}
      case 'cancel':if(isHost(ws)&&R.P.phase!=='lobby'){skorIsle(room);G.endToLobby(R);room.hazir.clear();flush(room)}break;
      case 'hazir':if(R.P.phase==='end'&&room.members.has(uid)){const v=!!m.v;if(v!==room.hazir.has(uid)){if(v)room.hazir.add(uid);else room.hazir.delete(uid);G.olay(R,'hazir',{kim:uid,v});schedule(room)}}break; // değişmediyse yayın yok
      case 'gordum':if(R.P.phase==='end'&&room.members.has(uid)&&!room.gorduler.has(uid)){room.gorduler.add(uid);G.olay(R,'son_ekran_goruldu',{kim:uid});bosalt(room)}break; // ölçüm: son ekran görüldü (kişi başı bir kez; yayın gerekmez)
      case 'close':if(isHost(ws))deleteRoom(room,'Ev sahibi odayı kapattı.');break;
      case 'act':G.act(R,uid,m);break; // gece hamlesi gizli: kimseye yayın yok
      case 'vote':if(G.vote(R,uid,m.v,m.d,m.g))schedule(room);break;
      case 'msg':if(G.chat(R,uid,m.x))schedule(room);break;
      case 'hizli':{const r=G.hizli(R,uid,m);if(r.ok)schedule(room);else if(r.kod==='bekle')send(ws,{t:'err',m:'Biraz bekle ('+r.kalan+' sn).',code:'soft'});else if(r.kod==='gun')send(ws,{t:'err',m:'Bugünlük hızlı ifade hakkın bitti ('+G.HIZLI_GUN+').',code:'soft'});break}
      case 'dmsg':if(G.deadChat(R,uid,m.x))schedule(room);break;
    }
  }

  // ---------- WebSocket ----------
  const wss=new WebSocketServer({server,path:'/ws',maxPayload:16*1024});
  // istemci IP'si: yalnız yerel vekilden (Caddy/tünel) gelen bağlantıda başlıklara güvenilir
  function ipOf(req){const d=(req.socket&&req.socket.remoteAddress)||'';const yerel=/^(127\.|::1$|::ffff:127\.)/.test(d);
    if(!yerel)return d;const cf=req.headers['cf-connecting-ip'];const xff=(req.headers['x-forwarded-for']||'').split(',')[0].trim();return cf||xff||d}
  wss.on('connection',(ws,req)=>{
    ws.ip=ipOf(req);const n=(ipSoketler.get(ws.ip)||0)+1;
    if(n>ipSoket){send(ws,{t:'err',m:'Bu adresten çok fazla bağlantı var.',code:'limit'});try{ws.close(4001,'limit')}catch(e){}return}
    ipSoketler.set(ws.ip,n);ws.on('close',()=>{const k=(ipSoketler.get(ws.ip)||1)-1;if(k<=0)ipSoketler.delete(ws.ip);else ipSoketler.set(ws.ip,k)});
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
      if(room.emptySince&&now-room.emptySince>EMPTY_ROOM_MS&&!anyOnline(room)){deleteRoom(room,'Odada kimse kalmadı.');continue}
      try{const off=new Set((room.game.P.players||[]).map(p=>p.id).filter(id=>!room.members.has(id)||!online(room.members.get(id))));if(G.tick(room.game,off))flush(room)}catch(e){log('hata',room.code,e&&e.stack||e)}
      if(room.hostGoneSince&&now-room.hostGoneSince>=HOST_GRACE_MS){
        const players=(room.game.P.players||[]).map(p=>p.id);
        const cands=[...room.members.keys()].filter(id=>online(room.members.get(id))&&room.members.get(id).name);
        const next=cands.find(id=>players.includes(id))||cands[0];
        if(next){log('ev sahibi devri',room.code,room.hostId,'→',next);room.hostId=next;room.hostGoneSince=null;flush(room)}
      }
    }
  },opts.tickMs||500);

  function close(cb){clearInterval(pingIv);clearInterval(tickIv);clearTimeout(jwksZamanlayici);for(const r of [...rooms.values()]){clearTimeout(r.flushT);bosalt(r)}kayit.kapat();for(const ws of wss.clients)ws.terminate();wss.close();server.close(cb)}
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
