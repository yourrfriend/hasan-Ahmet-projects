'use strict';
// Uçtan uca test: gerçek tarayıcı sekmeleri aynı odaya girer ve oynar.
//   npm run e2e   (Playwright ve Chromium gerekir: npm i -g playwright && npx playwright install chromium)
// Kontrol edilenler: davet linkiyle katılma, rol dağıtımı, gece hamlesi, ev sahibi sekmesi kapanınca
// oyunun sürmesi ve yetkinin devri, sohbet, gizli oy, bağlantı kopunca rozet + yeniden bağlanma,
// kopan oyuncunun (ve eski ev sahibinin) aynı linkle rolüyle geri dönmesi, oyun sonu özeti ve "Tekrar oyna".
process.env.HOST_GRACE_MS=process.env.HOST_GRACE_MS||'1500';
const assert=require('node:assert');
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.error('Playwright bulunamadı: npm i -g playwright && npx playwright install chromium');process.exit(2)}
const {createServer}=require('../server.js');
const G=require('../game.js');

const step=t=>console.log('•',t);
(async()=>{
  const srv=createServer({quiet:true,tickMs:100});
  await new Promise(r=>srv.server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+srv.server.address().port+'/';
  const browser=await chromium.launch(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{});
  const errors=[];
  const open=async(ctx,name,url)=>{const p=await ctx.newPage();p.on('pageerror',e=>errors.push(name+': '+e.message));await p.goto(url);return p};
  const newCtx=()=>browser.newContext({viewport:{width:900,height:520}});
  const roomOf=()=>[...srv.rooms.values()][0];
  const phase=p=>p.evaluate(()=>P.phase);
  try{
    step('kimlik: Supabase ayarsızken misafir, not yok; ulaşılmaz Supabase ile 2 sn içinde misafir ve "Misafir" notu');
    { const ayar=await (await fetch(base+'ayar.json')).json();assert.deepStrictEqual(ayar,{url:null,anonKey:null,kurulum:null,kayit:false,eposta:false,turnstile:null});
      const KANCA_SIR='v1,whsec_'+Buffer.from('e2e-kanca').toString('base64');const birlesmeler=[]; // Plan 6: /hesap/birlestir sunucuda gerçek, Supabase çağrıları sahte
      // Plan 7: anonim oturum ve kod istekleri sunucudan; sunucunun GoTrue (icFetch) ve Turnstile (turnstileFetch) çağrıları sahte
      const icIstekler=[],tsIstekler=[];let icSignupDurum=200,icGecikmeMs=0;let oturumVer=()=>null; // oturumVer: anonim signup yanıtı (aşağıda oturum tanımlanınca atanır)
      const icFetch=async(url,o)=>{const u=new URL(url);const g=o&&o.body?JSON.parse(o.body):null;icIstekler.push({yol:u.pathname,yontem:o.method,govde:g,auth:o.headers&&o.headers.Authorization});
        const json=(b,st=200)=>({status:st,ok:st<300,json:async()=>b,text:async()=>JSON.stringify(b)});
        if(u.pathname==='/auth/v1/signup')return icSignupDurum===200?json(oturumVer()):json({error:'kapali'},icSignupDurum);
        if(u.pathname==='/auth/v1/user'){if(icGecikmeMs)await new Promise(r=>setTimeout(r,icGecikmeMs));return json({id:'x',new_email:g&&g.email})}
        if(u.pathname==='/auth/v1/otp')return json({});
        return json({},404)};
      const gorulenBelirtec=new Set();
      const turnstileFetch=async(url,o)=>{const b=new URLSearchParams(String(o.body));const t=b.get('response');tsIstekler.push(t);const m=/^sahte-(kod_\w+)-/.exec(t||'');
        const cevap=gorulenBelirtec.has(t)||!m?{success:false,'error-codes':['timeout-or-duplicate']}:{success:true,action:m[1],hostname:'127.0.0.1'};gorulenBelirtec.add(t);return {status:200,ok:true,json:async()=>cevap}};
      const s3=createServer({quiet:true,tickMs:100,jwksAlma:false,ayar:{url:'http://127.0.0.1:1',anonKey:'anon',serviceKey:'srv',jwtSecret:'x',kurulum:'e2e',kancaSirri:KANCA_SIR,turnstileSite:'site-sahte',turnstileSecret:'sir',turnstileHostnames:['127.0.0.1'],icUrl:'http://ic.test',kodGunluk:50,kodSaatlik:50},kodTavan:{ipOn:20,ipSaat:40}, // e2e: tüm bağlamlar aynı IP; IP tavanı devreye girmesin (adres tavanı sınanır)
        icFetch,turnstileFetch,hesapFetch:async(url,o)=>{birlesmeler.push({url,yontem:o.method,govde:o.body?JSON.parse(o.body):null});return {status:200,ok:true,json:async()=>({}),text:async()=>''}}});
      await new Promise(r=>s3.server.listen(0,'127.0.0.1',r));const base3='http://127.0.0.1:'+s3.server.address().port+'/';
      const c3=await newCtx();const p3=await open(c3,'Kimlik',base3);const t0=Date.now();
      await p3.waitForSelector('.kimlik-notu',{timeout:5000});assert.match(await p3.textContent('.kimlik-notu'),/Misafir/);
      await p3.click('text=Yeni oda kur');await p3.fill('#nameInput','K');await p3.click('text=Lobiye gir');
      await p3.waitForFunction(()=>/oda=[a-z0-9]{12}/.test((document.querySelector('.lobbybar code')||{}).textContent||''),null,{timeout:6000});
      assert.ok(Date.now()-t0<9000,'ulaşılmaz Supabase oyunu bekletmemeli');assert.strictEqual(await p3.evaluate(()=>kayitli),false);
      assert.match(await p3.textContent('.kimlik-notu-lobi'),/Misafir/,'sunucu kayıtlı saymadıysa lobide misafir notu');
      await c3.close();
      step('giriş sayfası geçmişi: kayıt açık + oturum varken .gecmis bloğu (sahte Supabase: route), oyun kurma düğmesi yerinde');
      { const Kimlik=require('../kimlik.js');const ben='11111111-2222-4333-8444-555555555555';const o3=base3.replace(/\/$/,'');
        const jwt=Kimlik.imzala({sub:ben,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated',is_anonymous:true},'x');
        const oturum={access_token:jwt,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'r1',user:{id:ben,aud:'authenticated',role:'authenticated',is_anonymous:true,app_metadata:{provider:'anonymous'},user_metadata:{},created_at:new Date().toISOString()}};
        const ben2='22222222-2222-4333-8444-555555555555';const EPOSTA='ben@ornek.com';
        const jwtBagli=Kimlik.imzala({sub:ben,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated',is_anonymous:false,email:EPOSTA},'x');
        const jwt2=Kimlik.imzala({sub:ben2,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated',is_anonymous:false,email:EPOSTA},'x');
        const oturumBagli={...oturum,access_token:jwtBagli,refresh_token:'r2',user:{...oturum.user,email:EPOSTA,is_anonymous:false}};
        const oturum2={...oturum,access_token:jwt2,refresh_token:'r3',user:{...oturum.user,id:ben2,email:EPOSTA,is_anonymous:false}};
        let epostaBayragi=false,userGecikmeMs=0;const authIstekler=[]; // Plan 6 incelemesi: logout scope=local, doğrulama sonrası rastgele şifre // Plan 6 senaryoları /ayar.json'da eposta:true ister; userGecikmeMs: PUT /auth/v1/user yavaş Supabase taklidi
        oturumVer=()=>oturum;let signupRota=0;let apiJsDurum=200;
        const g1='aaaaaaaa-0000-4000-8000-000000000001',g2='aaaaaaaa-0000-4000-8000-000000000002',g3='aaaaaaaa-0000-4000-8000-000000000003',k1='bbbbbbbb-0000-4000-8000-000000000001';
        const g4='aaaaaaaa-0000-4000-8000-000000000004',g9='aaaaaaaa-0000-4000-8000-000000000009';
        const tablo={cuzdan:[{uye:'11111111-2222-4333-8444-555555555555',yildiz:33}],esyalar:[{uye:'11111111-2222-4333-8444-555555555555',key:'iksir',adet:2}],kozmetikler:[{uye:'11111111-2222-4333-8444-555555555555',key:'sapka:tac'}],rozetler:[{uye:'11111111-2222-4333-8444-555555555555',key:'ilk_mac',kazanma:'2026-10-26T10:00:00Z'}],basarilar:[{uye:'11111111-2222-4333-8444-555555555555',key:'kurtarici',sayac:12,kademe:2}],haftalik_gorevler:(()=>{const h=G.haftaPazartesi(Date.now()),k=G.haftaGorevleri(h),onceki=new Date(Date.parse(h+'T00:00:00Z')-7*864e5).toISOString().slice(0,10);return [{uye:'11111111-2222-4333-8444-555555555555',hafta:h,key:k[0],sayac:1,tamam:false},{uye:'11111111-2222-4333-8444-555555555555',hafta:h,key:k[1],sayac:G.HAFTALIK.havuz[k[1]].hedef,tamam:true},{uye:'11111111-2222-4333-8444-555555555555',hafta:onceki,key:k[2],sayac:9,tamam:true}]})(),seriler:[{uye:'11111111-2222-4333-8444-555555555555',seri:3,en_uzun:9,son_gun:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date())}],
          oyuncu_ozet:[{uye:ben,kurulum:'e2e',oyun:3,kazanma:2,en_cok_rol:'doktor',son_oyun:'2026-10-25T20:00:00Z'}],
          // g3: kasabamın maçı ama ben oynamadım → "son oyunların"da yok; g4: süren oyun (bitiş yok, roller gizli, olaylar RLS'de boş)
          oyunlar:[{id:g3,kasaba_id:k1,kurulum:'e2e',bitis:'2026-10-25T21:00:00Z',sonuc:'bitti',kazanan_takim:'inn',kazanan_metin:'Masumlar kazandı',oyuncu_sayisi:4,baslama:'2026-10-25T20:40:00Z'},
                   {id:g1,kasaba_id:k1,kurulum:'e2e',bitis:'2026-10-25T20:00:00Z',sonuc:'bitti',kazanan_takim:'inn',kazanan_metin:'Masumlar kazandı',oyuncu_sayisi:5,baslama:'2026-10-25T19:40:00Z'},
                   {id:g2,kasaba_id:null,kurulum:'e2e',bitis:'2026-10-24T19:00:00Z',sonuc:'bitti',kazanan_takim:'imp',kazanan_metin:'Hainler kazandı',oyuncu_sayisi:6,baslama:'2026-10-24T18:40:00Z'},
                   {id:g4,kasaba_id:k1,kurulum:'e2e',bitis:null,sonuc:'devam',kazanan_takim:null,kazanan_metin:null,oyuncu_sayisi:4,baslama:'2026-10-25T22:00:00Z'}],
          oyun_oyunculari_acik:[{oyun_id:g1,pub_id:'p1',uye:ben,ad:'Ben',rol_key:'doktor',takim:'inn',deli_gibi:null,calinan_rol:null,sonunda_sag:true,olum_gunu:null,olum_sekli:null},
                                {oyun_id:g1,pub_id:'p9',uye:null,ad:'Bot',rol_key:'hain',takim:'imp',deli_gibi:null,calinan_rol:null,sonunda_sag:false,olum_gunu:2,olum_sekli:'asildi'},
                                {oyun_id:g2,pub_id:'p2',uye:ben,ad:'Ben',rol_key:'polis',takim:'imp',deli_gibi:null,calinan_rol:null,sonunda_sag:false,olum_gunu:2,olum_sekli:'asildi'},
                                {oyun_id:g4,pub_id:'p1',uye:ben,ad:'Ben',rol_key:null,takim:null,deli_gibi:null,calinan_rol:null,sonunda_sag:null,olum_gunu:null,olum_sekli:null},
                                {oyun_id:g4,pub_id:'p9',uye:null,ad:'Bot',rol_key:null,takim:null,deli_gibi:null,calinan_rol:null,sonunda_sag:null,olum_gunu:null,olum_sekli:null}],
          olaylar:[{oyun_id:g1,sira:1,gun:1,faz:'night',tur:'gece_hamle',veri:{kim:'p9',tur:'kill',hedef:'p1'}},{oyun_id:g1,sira:2,gun:1,faz:'night',tur:'gece_sonuc',veri:{olenler:[],kurtaranlar:[{kim:'p1',hedef:'p1'}]}},
                   {oyun_id:g1,sira:3,gun:1,faz:'vote',tur:'gunduz_sonuc',veri:{asilan:'p9',rol_goruntu:'Hain',toplamlar:{p9:4},cekimser:1}},{oyun_id:g1,sira:4,gun:1,faz:'end',tur:'bitis',veri:{kazanan_metin:'Masumlar kazandı'}}],
          kasaba_uyeleri:[{kasaba_id:k1,uye:ben,rol:'uye',katilma:'2026-10-24T18:40:00Z'},{kasaba_id:k1,uye:'22222222-2222-4333-8444-555555555555',rol:'sahip',katilma:'2026-10-24T18:39:00Z'}],kasabalar:[{id:k1,ad:"Barış'ın Kasabası",sahip:'22222222-2222-4333-8444-555555555555',olusturma:'2026-10-24T18:40:00Z'}],
          kasaba_tablo:[{kasaba_id:k1,kurulum:'e2e',uye:ben,ad:'Ben',oyun:1,kazanma:1,en_cok_rol:'doktor'}],profiller:[{uye:ben,ad:'Ben',renk:'#3b7bff'}]};
        // PostgREST süzgeç taklidi: sütun=eq.x ve sütun=in.(a,b); select/order/limit yok sayılır (sıra sabit listedeki gibi)
        const suz=(satir,sp)=>{let r=satir;for(const [k,v] of sp){const m=/^(eq|in)\.(.*)$/.exec(v);if(!m)continue;const vals=m[1]==='in'?m[2].replace(/^\(|\)$/g,'').split(','):[m[2]];r=r.filter(x=>vals.includes(String(x[k])))}return r};
        const istekler=[];
        const c5=await newCtx();
        let restHata=null,rpcBugun=null;const c5Rota={desen:u=>/\/(auth|rest)\/v1\//.test(u.pathname)||u.pathname==='/ayar.json'||u.hostname==='challenges.cloudflare.com',isle:async route=>{
          if(new URL(route.request().url()).hostname==='challenges.cloudflare.com'){if(apiJsDurum!==200)return route.fulfill({status:apiJsDurum,body:''});
            return route.fulfill({status:200,contentType:'application/javascript',body:"window.turnstile={_n:0,_o:{},render(el,o){const id='w'+(++this._n);this._o[id]=o;el.setAttribute('data-widget',id);return id},execute(id){const o=this._o[id];if(window.__tsKutu&&o['before-interactive-callback']){o['before-interactive-callback']();setTimeout(()=>{o['after-interactive-callback']&&o['after-interactive-callback']();o.callback('sahte-'+o.action+'-'+Date.now()+'-'+(++this._n))},600)}else setTimeout(()=>o.callback('sahte-'+o.action+'-'+Date.now()+'-'+(++this._n)),10)},reset(){},remove(){}}"})}
          const u=new URL(route.request().url());const json=(b,st)=>route.fulfill({status:st||200,contentType:'application/json',body:JSON.stringify(b)});
          if(u.pathname==='/ayar.json')return json({url:o3,anonKey:'anon',kurulum:'e2e',kayit:true,eposta:epostaBayragi,turnstile:'site-sahte'});
          if(u.pathname.startsWith('/auth/v1/')){const m=route.request().method();let g=null;try{g=JSON.parse(route.request().postData()||'null')}catch(e){}if(u.pathname==='/auth/v1/signup')signupRota++;
            if(u.pathname==='/auth/v1/user'&&m==='PUT'){authIstekler.push({yol:'user',govde:g});const bearer=(route.request().headers()['authorization']||'').replace(/^Bearer /,'');const kullanici=bearer===jwt2?oturum2.user:bearer===jwtBagli?oturumBagli.user:oturum.user;
              if(g&&g.password)return json({...kullanici});if(userGecikmeMs)await new Promise(r=>setTimeout(r,userGecikmeMs));return json({...kullanici,new_email:g&&g.email})}
            if(u.pathname==='/auth/v1/otp')return json({});
            if(u.pathname==='/auth/v1/verify'){if(g&&g.token==='000000')return json({code:429,error_code:'over_request_rate_limit',msg:'invalid request'},429); // yanıltıcı msg: tablo error_code'a bakmalı
              if(!g||g.token!=='123456')return json({code:403,error_code:'otp_expired',msg:'Token has expired or is invalid'},403);return json(g.type==='email_change'?oturumBagli:oturum2)}
            if(u.pathname==='/auth/v1/logout'){authIstekler.push({yol:'logout',scope:u.searchParams.get('scope')});return route.fulfill({status:204,body:''})}
            return json(/signup|token/.test(u.pathname)?oturum:oturum.user)}
          if(route.request().method()==='HEAD')return route.fulfill({status:200,headers:{'content-range':'0-1/2','content-type':'application/json'},body:''}); // count=exact → N=2
          if(route.request().method()==='PATCH'){let g=null;try{g=JSON.parse(route.request().postData()||'null')}catch(e){}if(g&&typeof g.ad==='string'&&(g.ad.length>40||g.ad.startsWith('KISIT')))return json({code:'23514',message:'new row for relation "kasabalar" violates check constraint "kasabalar_ad_uzunluk"'},400);return route.fulfill({status:204,body:''})} // göç 007: ad uzunluk kısıtı
          const t=u.pathname.split('/').pop();istekler.push(t+'?'+u.searchParams.toString());
          if(restHata===t)return json({message:'taklit sunucu hatası'},500); // ağ/sunucu hatası dalı: sayfa "göremezsin" dememeli
          if(t==='istanbul_bugun')return json(rpcBugun||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date()));
          if(!tablo[t])return json({message:'yok: '+t},404);
          return json(suz(tablo[t],u.searchParams))}};
        await c5.route(c5Rota.desen,c5Rota.isle);
        const p5=await open(c5,'Geçmiş',base3);
        await p5.waitForSelector('.gecmis',{timeout:8000});
        const g=await p5.evaluate(()=>{const e=document.querySelector('.gecmis');return{t:e.textContent,maclar:[...e.querySelectorAll('a.mac')].map(a=>({href:a.getAttribute('href'),t:a.textContent})),kasabalar:[...e.querySelectorAll('a.kasaba')].map(a=>({href:a.getAttribute('href'),t:a.textContent}))}});
        assert.match(g.t,/3 oyun/);assert.match(g.t,/2 kazanma/);assert.match(g.t,/Doktor/);assert.ok(!/%/.test(g.t),'yüzde yok');
        assert.deepStrictEqual(g.maclar.map(m=>m.href),['/oyun/'+g1,'/oyun/'+g2],'yalnız oynadığım bitmiş maçlar, yeniden eskiye');
        assert.match(g.maclar[0].t,/Masumlar kazandı/);assert.match(g.maclar[0].t,/Doktor/);assert.match(g.maclar[0].t,/Barış'ın Kasabası/);
        assert.match(g.maclar[1].t,/Hainler kazandı/);assert.match(g.maclar[1].t,/Polis \(Hain\)/);
        assert.deepStrictEqual(g.kasabalar,[{href:'/kasaba/'+k1,t:"Barış'ın Kasabası"}]);
        assert.ok(await p5.$('text=Yeni oda kur'),'oyun kurma düğmesi yerinde');
        assert.ok(istekler.some(i=>/^oyunlar\?.*sonuc=eq\.bitti/.test(i)&&/order=bitis\.desc/.test(i)&&/kurulum=eq\.e2e/.test(i)),'oyunlar: yalnız bu kurulumun bitmiş maçları, bitiş sırasıyla: '+istekler.join(' | '));
        assert.match(await p5.textContent('.kimlik-notu'),/Kimliğin bu tarayıcıda/);
        assert.strictEqual(await p5.getAttribute('a.profil','href'),'/ben','kayıt açıkken giriş sayfasında Profilim bağlantısı');
        // /oyun dalları (aynı oturum): göremediğim/olmayan oyun; süren oyun (roller gizli, kimse ölü görünmez, hikâye notu); bitmiş oyun
        const oyunSayfa=async id=>{await p5.goto(o3+'/oyun/'+id);await p5.waitForFunction(()=>document.querySelector('.not')||document.querySelector('#icerik .gun, #icerik h2'),null,{timeout:8000}); // not ya da içerik (tablo+hikâye birlikte eklenir)
          return p5.evaluate(()=>({not:[...document.querySelectorAll('.not')].map(n=>n.textContent).join(' '),icerik:document.getElementById('icerik').textContent,olu:document.querySelectorAll('#icerik tr.olu').length,satir:document.querySelectorAll('#icerik tr').length-1,gun:document.querySelectorAll('.gun').length,roller:[...document.querySelectorAll('#icerik td .tag')].map(t=>t.textContent)}))};
        const bos=await oyunSayfa(g9);assert.match(bos.not,/göremezsin/);assert.strictEqual(bos.icerik,'');
        restHata='oyunlar';const hatali=await oyunSayfa(g1);restHata=null;assert.match(hatali.not,/Bağlantı hatası/,'sunucu hatasında "göremezsin" değil bağlantı hatası: '+hatali.not);assert.ok(!/göremezsin/.test(hatali.not));
        const suren=await oyunSayfa(g4);assert.strictEqual(suren.not,'');assert.strictEqual(suren.satir,2);assert.deepStrictEqual(suren.roller,['?','?']);
        assert.strictEqual(suren.olu,0,'süren oyunda kimse ölü sınıfında olmamalı');assert.ok(!/💀/.test(suren.icerik),'süren oyunda kurukafa yok: '+suren.icerik);assert.match(suren.icerik,/Oyun sürüyor/);assert.match(suren.icerik,/Oyun bitince hikâye/);
        const biten=await oyunSayfa(g1);assert.strictEqual(biten.satir,2);assert.strictEqual(biten.olu,1);assert.deepStrictEqual(biten.roller,['Doktor','Hain']);assert.match(biten.icerik,/Ben \(sen\)/);assert.match(biten.icerik,/Masumlar kazandı/);
        assert.ok(biten.gun>=3,'bitmiş oyunda hikâye blokları: '+biten.gun);assert.match(biten.icerik,/Bot \(Hain\) Ben'in evine girdi/);assert.match(biten.icerik,/Kasaba Bot'u gönderdi \(Hain\)/);
        // /kasaba: tablo + son maçlar yalnız bu kurulumdan
        istekler.length=0;await p5.goto(o3+'/kasaba/'+k1);await p5.waitForFunction(()=>document.querySelector('.not')||[...document.querySelectorAll('#icerik h2')].some(h=>/Son maçlar/.test(h.textContent)),null,{timeout:8000});
        const ks=await p5.evaluate(()=>({t:document.querySelector('main').textContent,maclar:[...document.querySelectorAll('a[href^="/oyun/"]')].map(a=>a.getAttribute('href'))}));
        assert.match(ks.t,/Barış'ın Kasabası/);assert.match(ks.t,/Ben \(sen\)/);assert.ok(!/%/.test(ks.t),'yüzde yok');
        { const sahipSinif=await p5.evaluate(()=>{const t=[...document.querySelectorAll('.tag')].find(x=>/sahip/.test(x.textContent));return t?t.className:null});assert.ok(sahipSinif&&/\bsahip\b/.test(sahipSinif)&&!/\bimp\b/.test(sahipSinif),'sahip rozeti hain kırmızısı olmamalı: '+sahipSinif)}
        // sahip: sunucu kısıtı (23514, göç 007) → anlaşılır metin
        { const sahipEski=tablo.kasabalar[0].sahip;tablo.kasabalar[0].sahip=ben;await p5.goto(o3+'/kasaba/'+k1);await p5.waitForSelector('input[maxlength="40"]',{timeout:8000});await p5.evaluate(()=>{const i=document.querySelector('input[maxlength="40"]');i.value='KISIT deneme'}); // istemci 40'a kırptığı için sahte sunucu bu değerde kısıt hatası döner
          await p5.click('text=Adı kaydet');await p5.waitForSelector('.not',{timeout:8000});assert.match(await p5.textContent('.not'),/en çok 40 karakter/,'kasaba adı kısıt metni');tablo.kasabalar[0].sahip=sahipEski}
        // /ben: özet, yıldız, eşyalar, rozetler (kazanılan/kilitli), koleksiyon; dükkânda al → /ben/al (Bearer), giy → localStorage
        { const alimlar=[];await p5.route('**/ben/al',async route=>{const r=route.request();const g=JSON.parse(r.postData()||'{}');alimlar.push({key:g.key,auth:r.headers()['authorization']||''});
            tablo.kozmetikler.push({uye:ben,key:g.key});tablo.cuzdan[0].yildiz=8;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,yildiz:8})})});
          await p5.goto(o3+'/ben');await p5.waitForFunction(()=>[...document.querySelectorAll('#icerik h2')].some(h=>/Koleksiyon/.test(h.textContent)),null,{timeout:8000});
          const t=await p5.textContent('main');assert.match(t,/⭐ 33/);assert.match(t,/İksir ×2/);assert.match(t,/Rozetler \(1\/4\)/);assert.match(await p5.textContent('.seri-satir'),/🔥 Seri: 3 gün · en uzun 9/,'profil seri satırı');
          {const k=G.haftaGorevleri(G.haftaPazartesi(Date.now()));assert.match(await p5.textContent('.haftalik'),/Bu haftanın görevleri · \d gün kaldı/,'görev başlığı');assert.strictEqual(await p5.evaluate(()=>document.querySelectorAll('.haftalik .gorev').length),3);
            assert.match(await p5.textContent('.gorev[data-key="'+k[0]+'"]'),new RegExp('1/'+G.HAFTALIK.havuz[k[0]].hedef),'ilerleme');assert.match(await p5.textContent('.gorev[data-key="'+k[1]+'"]'),/✓/,'tamam');assert.doesNotMatch(await p5.textContent('.gorev[data-key="'+k[2]+'"]'),/✓|9\//,'geçen haftanın satırı sayılmaz');assert.doesNotMatch(await p5.textContent('.haftalik'),/Hepsi tamam/)}
          // hafta cihaz saatinden değil sunucudan (istanbul_bugun): sunucu gelecek haftayı derse o haftanın görevleri; üçü tamamsa (bonus satırı olmasa da) "Hepsi tamam"
          {const sonraki=new Date(Date.parse(G.haftaPazartesi(Date.now())+'T00:00:00Z')+7*864e5).toISOString().slice(0,10);const k2=G.haftaGorevleri(sonraki);rpcBugun=sonraki;const eski=tablo.haftalik_gorevler;tablo.haftalik_gorevler=k2.map(key=>({uye:'11111111-2222-4333-8444-555555555555',hafta:sonraki,key,sayac:9,tamam:true}));
            await p5.goto(o3+'/ben');await p5.waitForSelector('.haftalik .gorev',{timeout:8000});assert.deepStrictEqual(await p5.evaluate(()=>[...document.querySelectorAll('.haftalik .gorev')].map(x=>x.dataset.key)),k2,'sunucu haftası');assert.match(await p5.textContent('.haftalik'),/Hepsi tamam/,'üçü tamam');
            rpcBugun=null;tablo.haftalik_gorevler=eski;await p5.goto(o3+'/ben');await p5.waitForSelector('.haftalik .gorev',{timeout:8000})}
          assert.strictEqual(await p5.evaluate(()=>document.querySelectorAll('.rozet:not(.kilitli)').length),1,'bir rozet kazanılmış');
          assert.strictEqual(await p5.evaluate(()=>document.querySelectorAll('.basari').length),9,'dokuz başarı satırı');assert.match(await p5.textContent('.basari[data-key="kurtarici"]'),/12\/30 → altın/,'kurtarıcı ilerlemesi');
          assert.strictEqual(await p5.evaluate(()=>document.querySelectorAll('.basari[data-key="kurtarici"] .madalya:not(.yok)').length),2,'iki madalya');assert.match(await p5.textContent('.basari[data-key="mudavim"]'),/0\/10 → bronz/,'sayaç yoksa 0');
          assert.strictEqual(await p5.evaluate(()=>document.querySelectorAll('.basari[data-key="mudavim"] .madalya:not(.yok)').length),0);assert.ok(await p5.evaluate(()=>[...document.querySelectorAll('#icerik h2')].some(h=>/Başarılar/.test(h.textContent))),'Başarılar başlığı');
          assert.ok(await p5.evaluate(()=>[...document.querySelectorAll('#icerik h3')].some(h=>h.textContent==='Evler')),'Evler bölümü');assert.strictEqual(await p5.evaluate(()=>document.querySelectorAll('.urun svg.onizleme, .urun img.onizleme').length),Object.keys(G.KOZMETIK.ev).length,'her eve önizleme');
          assert.ok(await p5.evaluate(()=>[...document.querySelectorAll('.urun svg.onizleme')].filter(x=>x.firstChild).length<KG_EVLER.svg().length),'SVG önizlemeler tembel çizilir');
          assert.match(await p5.textContent('.guvenlik'),/E-posta bağla/,'hesap güvenliği kartı');assert.strictEqual(await p5.getAttribute('.guvenlik a','href'),'/?bagla=1');
          assert.match(await p5.textContent('.urun[data-key="bayrak:mektup"]'),/E-postanı bağlayınca/);assert.strictEqual(await p5.$('.urun[data-key="bayrak:mektup"] button'),null,'özel öğe satılmaz');
          assert.match(await p5.textContent('.urun[data-key="sapka:hemsire"]'),/Kurtarıcı altınıyla/,'altın kozmetik etiketi');assert.strictEqual(await p5.$('.urun[data-key="sapka:hemsire"] button'),null,'altın satılmaz');
          assert.strictEqual((await p5.textContent('.urun[data-key="bayrak:yildiz"] button')).trim(),'Al · ⭐ 70');
          await p5.click('.urun[data-key="bayrak:mavi"] button');await p5.waitForFunction(()=>/⭐ 8/.test(document.querySelector('main').textContent),null,{timeout:8000});
          await p5.waitForSelector('.hatirlat-satin',{timeout:5000});assert.match(await p5.textContent('.hatirlat-satin'),/yalnız bu tarayıcıda/,'satın alma sonrası hatırlatma');
          assert.deepStrictEqual(alimlar.map(a=>a.key),['bayrak:mavi']);assert.match(alimlar[0].auth,/^Bearer ey/,'oturum tokenıyla');
          await p5.click('.urun[data-key="sapka:tac"] button');await p5.waitForFunction(()=>{try{return JSON.parse(localStorage.getItem('kg_look')).hat==='tac'}catch(e){return false}},null,{timeout:8000});
          await Promise.all([p5.waitForNavigation(),p5.click('.urun button:has-text("Yanına al")')]);await p5.waitForFunction(()=>[...document.querySelectorAll('#icerik h2')].some(h=>/Koleksiyon/.test(h.textContent)),null,{timeout:8000});
          assert.strictEqual(await p5.evaluate(()=>JSON.parse(localStorage.getItem('kg_look')).esya),'iksir');assert.match(await p5.textContent('main'),/Yanında ✓/);
          await Promise.all([p5.waitForNavigation(),p5.click('button:has-text("Rastgele al")')]);await p5.waitForFunction(()=>[...document.querySelectorAll('#icerik h2')].some(h=>/Koleksiyon/.test(h.textContent)),null,{timeout:8000});
          assert.strictEqual(await p5.evaluate(()=>JSON.parse(localStorage.getItem('kg_look')).esya),undefined,'Rastgele: seçim silinir');assert.match(await p5.textContent('main'),/Rastgele ✓/);
          await p5.unroute('**/ben/al') }
        restHata='kasabalar';await p5.goto(o3+'/kasaba/'+k1);await p5.waitForSelector('.not',{timeout:8000});assert.match(await p5.textContent('.not'),/Bağlantı hatası/,'kasaba sayfası sunucu hatası');restHata=null;assert.deepStrictEqual(ks.maclar,['/oyun/'+g3,'/oyun/'+g1],'son maçlar: kasabanın bitmiş maçları, yeniden eskiye');
        assert.ok(istekler.some(i=>/^oyunlar\?.*kasaba_id=eq\./.test(i)&&/kurulum=eq\.e2e/.test(i)),'kasaba son maçları kurulum süzgeciyle: '+istekler.join(' | '));
        await c5.close();
        step('e-posta (Plan 6): e-postasız kayıtlı → iki düğme; ?bagla=1 formu açar; kod ile bağla (yanlış kod → hata); Hesabın + çıkış');
        epostaBayragi=true;
        const c6=await newCtx();await c6.route(c5Rota.desen,c5Rota.isle);const p6=await open(c6,'Hesap',base3);
        await p6.waitForSelector('button.hesap-bagla',{timeout:8000});
        assert.strictEqual(signupRota,0,'anonim oturum GoTrue\'ya doğrudan değil, sunucudan (/hesap/anonim) alınır');assert.ok(icIstekler.some(i=>i.yol==='/auth/v1/signup'&&JSON.stringify(i.govde)==='{}'),'sunucu yerel GoTrue signup {} çağırdı');
        assert.strictEqual(await p6.evaluate(()=>hesap.uuid),ben,'oturum setSession ile kuruldu');
        assert.match(await p6.textContent('.hesap-durum'),/Kimliğin bu tarayıcıda/);assert.ok(!/Google/.test(await p6.textContent('body')),'Google notu kalktı');assert.ok(await p6.$('button.hesap-gir'));
        await p6.goto(base3+'?bagla=1');await p6.waitForSelector('#hesapEposta',{timeout:8000});assert.ok(!/bagla=1/.test(p6.url()),'parametre temizlenir');
        await p6.click('button.hesap-vazgec');assert.strictEqual(await p6.$('#hesapEposta'),null);
        const kodBekle=async(p,ad)=>{await p.waitForFunction(()=>document.querySelector('#hesapKod')||document.querySelector('.hesap-hata'),null,{timeout:8000});const h=await p.$('.hesap-hata');if(h)throw new Error(ad+': kod adımı yerine hata: '+await h.textContent())};
        await p6.click('button.hesap-bagla');await p6.fill('#hesapEposta','ben@ornek.com');await p6.click('button.hesap-gonder');
        await kodBekle(p6,'bağla');assert.match(await p6.textContent('button.hesap-yeniden'),/\(\d+\)/,'yeniden gönder sayaçlı');assert.strictEqual(await p6.$eval('button.hesap-yeniden',b=>b.disabled),true);
        { const u=icIstekler.filter(i=>i.yol==='/auth/v1/user');assert.strictEqual(u.length,1,'bağla: sunucu PUT /auth/v1/user');assert.strictEqual(u[0].auth,'Bearer '+jwt);assert.deepStrictEqual(u[0].govde,{email:'ben@ornek.com'});assert.match(tsIstekler[tsIstekler.length-1],/^sahte-kod_bagla-/,'Turnstile belirteci action ile') }
        assert.match(await p6.evaluate(()=>document.body.textContent),/15 dk geçerli/,'kod ekranı: süre');assert.match(await p6.evaluate(()=>document.body.textContent),/gecikebilir/,'kod ekranı: gecikme uyarısı');
        await p6.fill('#hesapKod','999999');await p6.click('button.hesap-dogrula');await p6.waitForSelector('.hesap-hata',{timeout:8000});assert.match(await p6.textContent('.hesap-hata'),/Kod yanlış/);
        await p6.fill('#hesapKod','000000');await p6.click('button.hesap-dogrula');await p6.waitForFunction(()=>/Çok sık istek/.test((document.querySelector('.hesap-hata')||{}).textContent||''),null,{timeout:8000}).catch(()=>{});
        assert.match(await p6.textContent('.hesap-hata'),/Çok sık istek/,'error_code tablosu msg\'den önce gelir');
        const baglaIstek=[];await p6.route('**/hesap/bagla-odulu',route=>{baglaIstek.push(route.request().headers()['authorization']||'');return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,yildiz:25})})});
        await p6.fill('#hesapKod','123456');await p6.click('button.hesap-dogrula');
        await p6.waitForFunction(()=>/Hesabın: ben@ornek\.com/.test((document.querySelector('.hesap-durum')||{}).textContent||''),null,{timeout:8000});
        await p6.waitForSelector('.bagla-kart',{timeout:8000});assert.match(await p6.textContent('.bagla-kart'),/✉️ Hesabın güvende! \+25 ⭐ ve Mühürlü mektup bayrağı/,'bağlama ödülü kartı');
        await p6.click('.bagla-kart button');assert.strictEqual(await p6.$('.bagla-kart'),null,'Tamam kartı kapatır');
        assert.deepStrictEqual(baglaIstek,['Bearer '+jwtBagli],'ödül bağlı oturumun tokenıyla bir kez istenir');
        assert.ok(await p6.$('button.hesap-cikis'));assert.strictEqual(await p6.$('button.hesap-bagla'),null);assert.strictEqual(await p6.$('#hesapEposta'),null);
        assert.strictEqual(await p6.evaluate(()=>JSON.parse(localStorage.getItem('kg_token'))),jwtBagli,'kg_token bağlı oturuma geçer');
        assert.strictEqual(authIstekler.filter(a=>a.yol==='user').length,0,'istemci GoTrue /user ucunu doğrudan çağırmaz (şifre döndürme kalktı, bağlama sunucudan)');
        // hatırlatma yardımcısı: yalnız e-postasız kayıtlıda; son ekran bu yardımcıyı kullanır
        assert.deepStrictEqual(await p6.evaluate(()=>[hatirlatGoster({eposta:true},true,null),hatirlatGoster({eposta:true},true,'a@b.c'),hatirlatGoster({eposta:false},true,null),hatirlatGoster(null,false,null),hatirlatGoster({eposta:true},false,null)]),[true,false,false,false,false]);
        assert.ok(await p6.evaluate(()=>renderEndUI.toString().includes('hatirlatGoster(')&&renderEndUI.toString().includes('hesap-hatirlat')),'son ekran hatırlatması yardımcıya bağlı');
        // /ben'de ödül gelince sayfa yeni cüzdan ve mektupla yeniden çizilir (düğmeler eski yıldızla gri kalmaz)
        { const eskiY=tablo.cuzdan[0].yildiz;await p6.evaluate(()=>localStorage.removeItem('kg_bagla_odul'));await p6.unroute('**/hesap/bagla-odulu');
          await p6.route('**/hesap/bagla-odulu',route=>{tablo.kozmetikler.push({uye:ben,key:'bayrak:mektup'});tablo.cuzdan[0].yildiz=58;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,yildiz:58})})});
          await p6.goto(o3+'/ben');await p6.waitForFunction(()=>/Hesabın güvende/.test(document.querySelector('main').textContent)&&document.querySelector('.urun[data-key="bayrak:mektup"] button'),null,{timeout:8000});
          assert.match(await p6.textContent('main'),/⭐ 58/);assert.strictEqual((await p6.textContent('.urun[data-key="bayrak:mektup"] button')).trim(),'Giy','mektup alındı: Giy');
          tablo.kozmetikler=tablo.kozmetikler.filter(k=>k.key!=='bayrak:mektup');tablo.cuzdan[0].yildiz=eskiY;await p6.unroute('**/hesap/bagla-odulu');
          await p6.goto(base3);await p6.waitForSelector('button.hesap-cikis',{timeout:8000}) }
        await p6.click('button.hesap-cikis');await p6.waitForSelector('button.hesap-bagla',{timeout:8000});assert.deepStrictEqual(authIstekler.filter(a=>a.yol==='logout').map(a=>a.scope),['local'],'çıkış yalnız bu cihaz (scope=local)');assert.notStrictEqual(await p6.evaluate(()=>JSON.parse(localStorage.getItem('kg_token'))),jwtBagli,'çıkışta bağlı token gider; yenilemede yeni anonim oturum');
        await c6.close();
        step('e-posta: ikinci cihaz — kod ile gir, 2 oyunu ekle → /hesap/birlestir; Hayır → çağrı yok; yavaş Supabase → zaman aşımı metni');
        const c7=await newCtx();await c7.route(c5Rota.desen,c5Rota.isle);const p7=await open(c7,'İkinci',base3);
        await p7.waitForSelector('button.hesap-gir',{timeout:8000});await p7.click('button.hesap-gir');await p7.fill('#hesapEposta','ben@ornek.com');
        await p7.evaluate(()=>{window.__tsKutu=true});await p7.click('button.hesap-gonder'); // Cloudflare kutu gösterirse: düğme bunu söyler, kutu görünür alana gelir
        await p7.waitForFunction(()=>/işaretle/i.test((document.querySelector('button.hesap-gonder')||{}).textContent||''),null,{timeout:4000});
        // Turnstile kutusu yeniden çizilen ağacın dışında (#turnstileKutu, sabit alt kutu): render() widget'ı silmemeli — aynı eleman (data-widget) hâlâ orada ve görünür
        { const g=await p7.evaluate(()=>{const k=document.getElementById('turnstileKutu');const w=k&&k.querySelector('[data-widget]');if(!k||!w)return {k:!!k,w:!!w};const r=k.getBoundingClientRect();return {k:true,w:true,gorunur:k.offsetHeight>0&&r.top>=0&&r.bottom<=innerHeight,formda:!!document.querySelector('.hesap-form .hesap-turnstile')}});
          assert.deepStrictEqual(g,{k:true,w:true,gorunur:true,formda:false},'Turnstile kutusu sayfa altında, widget render sonrası yaşıyor: '+JSON.stringify(g)) }
        await p7.evaluate(()=>{window.__tsKutu=false});await p7.click('button.hesap-vazgec');await p7.waitForSelector('button.hesap-gir',{timeout:4000});
        assert.strictEqual(await p7.evaluate(()=>{const k=document.getElementById('turnstileKutu');return k?k.offsetHeight:0}),0,'vazgeçince kutu gizlenir');
        await p7.click('button.hesap-gir');await p7.fill('#hesapEposta','ben@ornek.com');await p7.click('button.hesap-gonder');
        await kodBekle(p7,'gir');await p7.fill('#hesapKod','123456');await p7.click('button.hesap-dogrula');
        await p7.waitForSelector('.hesap-birlestir',{timeout:8000});assert.match(await p7.textContent('.hesap-birlestir'),/2 oyunu/);
        await p7.click('.hesap-birlestir button.ekle');
        await p7.waitForFunction(()=>/Hesabın: ben@ornek\.com/.test((document.querySelector('.hesap-durum')||{}).textContent||'')&&!document.querySelector('.hesap-birlestir'),null,{timeout:10000});
        assert.strictEqual(birlesmeler.length,2,'RPC + admin silme');{ const o=icIstekler.filter(i=>i.yol==='/auth/v1/otp');assert.ok(o.length>=1,'gir: sunucu POST /auth/v1/otp');assert.deepStrictEqual(o[o.length-1].govde,{email:'ben@ornek.com',create_user:false}) }assert.strictEqual(birlesmeler[0].url,'http://127.0.0.1:1/rest/v1/rpc/hesap_birlestir');assert.deepStrictEqual(birlesmeler[0].govde,{eski:ben,yeni:ben2});assert.strictEqual(birlesmeler[1].yontem,'DELETE');
        await c7.close();
        const c8=await newCtx();await c8.route(c5Rota.desen,c5Rota.isle);const p8=await open(c8,'İkinci-hayır',base3);
        await p8.waitForSelector('button.hesap-gir',{timeout:8000});await p8.click('button.hesap-gir');await p8.fill('#hesapEposta','ben@ornek.com');await p8.click('button.hesap-gonder');
        await kodBekle(p8,'gir-hayır');await p8.fill('#hesapKod','123456');await p8.click('button.hesap-dogrula');await p8.waitForSelector('.hesap-birlestir',{timeout:8000});
        // Review Focus 2 (Plan 6): bu cihazın eski anonim token'ı süresi dolmuşsa birleştirme yapılmaz, dürüst metin
        { const c9x=await newCtx();await c9x.route(c5Rota.desen,c5Rota.isle);const p9x=await open(c9x,'Süresi-dolmuş',base3);
          await p9x.waitForSelector('button.hesap-gir',{timeout:8000});await p9x.click('button.hesap-gir');await p9x.fill('#hesapEposta','dolmus@ornek.com');await p9x.click('button.hesap-gonder');
          await kodBekle(p9x,'gir-dolmuş');await p9x.fill('#hesapKod','123456');await p9x.click('button.hesap-dogrula');await p9x.waitForSelector('.hesap-birlestir',{timeout:8000});
          const dolmus=Kimlik.imzala({sub:ben,exp:Math.floor(Date.now()/1000)-60,role:'authenticated',aud:'authenticated',is_anonymous:true},'x');
          await p9x.evaluate(t=>{ui.hesap.eski=t},dolmus);await p9x.click('.hesap-birlestir button.ekle');
          await p9x.waitForFunction(()=>/taşınamadı/.test((document.querySelector('.hesap-birlestir')||{}).textContent||''),null,{timeout:10000}); // bilgi satırı .hesap-birlestir içinde p.small
          assert.match(await p9x.textContent('.hesap-birlestir'),/taşınamadı \(eski_suresi_dolmus\)/,'süresi dolmuş eski token: dürüst metin');await c9x.close()}
        await p8.click('.hesap-birlestir button.hayir');await p8.waitForFunction(()=>/Hesabın: ben@ornek\.com/.test((document.querySelector('.hesap-durum')||{}).textContent||''),null,{timeout:10000});
        assert.strictEqual(birlesmeler.length,2,'Hayır → birleştirme çağrısı yok');
        await c8.close();
        icGecikmeMs=11000;const c9=await newCtx();await c9.route(c5Rota.desen,c5Rota.isle);const p9=await open(c9,'Yavaş',base3);
        await p9.waitForSelector('button.hesap-bagla',{timeout:8000});await p9.click('button.hesap-bagla');await p9.fill('#hesapEposta','yavas@ornek.com');const t9=Date.now();await p9.click('button.hesap-gonder');
        await p9.waitForSelector('.hesap-hata',{timeout:11500});assert.match(await p9.textContent('.hesap-hata'),/gönderilemedi/);assert.ok(Date.now()-t9<11200,'10 sn zaman aşımı');
        await c9.close();icGecikmeMs=0;
        step('e-posta (Plan 7): 4. kod isteği 429 metni; Turnstile betiği yüklenemezse metin; sunucu GoTrue\'ya ulaşamazsa misafir');
        { const c10=await newCtx();await c10.route(c5Rota.desen,c5Rota.isle);const p10=await open(c10,'Tavan',base3);await p10.waitForSelector('button.hesap-bagla',{timeout:8000});
          for(let i=0;i<3;i++){await p10.click(i?'button.hesap-vazgec':'button.hesap-gir');if(i)await p10.click('button.hesap-gir');await p10.fill('#hesapEposta','tavan@ornek.com');await p10.click('button.hesap-gonder');await kodBekle(p10,'tavan '+i)}
          await p10.click('button.hesap-vazgec');await p10.click('button.hesap-gir');await p10.fill('#hesapEposta','tavan@ornek.com');await p10.click('button.hesap-gonder');await p10.waitForSelector('.hesap-hata',{timeout:8000});assert.match(await p10.textContent('.hesap-hata'),/Çok sık istek/,'adres saatte 3');
          await c10.close(); }
        { apiJsDurum=404;const c11=await newCtx();await c11.route(c5Rota.desen,c5Rota.isle);const p11=await open(c11,'Betik',base3);await p11.waitForSelector('button.hesap-bagla',{timeout:8000});
          await p11.click('button.hesap-bagla');await p11.fill('#hesapEposta','ben@ornek.com');await p11.click('button.hesap-gonder');await p11.waitForSelector('.hesap-hata',{timeout:8000});assert.match(await p11.textContent('.hesap-hata'),/yüklenemedi/);
          assert.strictEqual(await p11.$eval('button.hesap-gonder',b=>b.disabled),false,'düğme tekrar basılabilir');apiJsDurum=200;await c11.close(); }
        { icSignupDurum=503;const c12=await newCtx();await c12.route(c5Rota.desen,c5Rota.isle);const p12=await open(c12,'Misafir',base3);await p12.waitForSelector('.kimlik-notu',{timeout:8000});
          assert.match(await p12.textContent('.kimlik-notu'),/Misafir/,'sunucu GoTrue\'ya ulaşamayınca misafir');assert.ok(await p12.$('text=Yeni oda kur'));icSignupDurum=200;await c12.close(); }
        epostaBayragi=false; }
      await new Promise(r=>s3.close(r)); }

    step('geçmiş sayfaları: Supabase yokken hatasız açılır ve "kayıt kapalı" der');
    { const c4=await newCtx();const u='aaaaaaaa-0000-4000-8000-000000000009';
      for(const yol of ['/oyun/'+u,'/kasaba/'+u]){const p=await open(c4,'Sayfa'+yol,base.replace(/\/$/,'')+yol);await p.waitForSelector('.not',{timeout:8000});assert.match(await p.textContent('.not'),/Kayıt kapalı/,yol);assert.ok(await p.$('main'))}
      await c4.close(); }

    step('kayıt kapalı: ?bagla=1 form açmaz, düğme yok');
    { const c0=await newCtx();const p0=await open(c0,'Kapalı',base+'?bagla=1');await p0.waitForSelector('text=Yeni oda kur');assert.strictEqual(await p0.$('#hesapEposta'),null);assert.strictEqual(await p0.$('button.hesap-bagla'),null);await c0.close(); }

    step('ev sahibi oda kurar');
    const hostCtx=await newCtx();let host=await open(hostCtx,'Ev',base);
    await host.click('text=Yeni oda kur');await host.fill('#nameInput','Ev');await host.click('text=Lobiye gir');
    await host.waitForSelector('.lobbybar code');
    const link=await host.textContent('.lobbybar code');assert.match(link,/\?oda=[a-z0-9]{12}$/);
    assert.strictEqual(await host.evaluate(()=>kayitli),false);assert.strictEqual(await host.$('.kimlik-notu'),null,'kayıt kapalı kurulumda kimlik notu yok');assert.strictEqual(await host.$('.kimlik-notu-lobi'),null);

    step('?s= yabancı sunucuyu yalnız yerelde seçer (gizli anahtar linkteki adrese gitmez)');
    const izin=await host.evaluate(()=>{const canli={hostname:'kasaba.ornek.com',host:'kasaba.ornek.com',protocol:'https:'};return[
      sunucuIzinli('evil.example',canli),sunucuIzinli('wss://evil.example/ws',canli),sunucuIzinli('https://kasaba.ornek.com',canli),
      sunucuIzinli('evil.example',{hostname:'localhost',host:'localhost:8787',protocol:'http:'}),sunucuIzinli('',canli),sunucuIzinli('evil.example',location)]});
    assert.deepStrictEqual(izin,[false,false,true,true,false,true]);
    assert.ok(/^u[0-9a-z]{16,}$/.test(await host.evaluate(()=>uid)),'kimlik anahtarı uzun ve rastgele olmalı');

    step('3 oyuncu davet linkiyle katılır');
    const ctxs={},pages={};
    for(const n of ['Ali','Ayse','Can']){ctxs[n]=await newCtx();pages[n]=await open(ctxs[n],n,link);await pages[n].fill('#nameInput',n);await pages[n].click('text=Lobiye gir')}
    await host.waitForFunction(()=>/4 \/ 12/.test(document.querySelector('.count').textContent));
    assert.strictEqual(await pages.Ali.$('.start'),null,'ev sahibi olmayanda başlat düğmesi olmamalı');
    // rol rehberi lobide de açılır ve kapanır
    await host.click('button.rehber-dugme');await host.waitForSelector('.rehber');assert.match(await host.textContent('.rehber'),/Masumlar[\s\S]*Hainler[\s\S]*Tarafsızlar/);await host.click('.rehber .kapat');assert.strictEqual(await host.$('.rehber'),null);

    step('telefon klavyesi: süre kutusu odaktayken pencere küçülünce odak ve değer kalır');
    await host.click('.gear');await host.fill('#sure_night','45');await host.focus('#sure_night');
    await host.setViewportSize({width:900,height:300});await host.waitForTimeout(400);
    assert.deepStrictEqual(await host.evaluate(()=>({id:document.activeElement.id,v:document.activeElement.value})),{id:'sure_night',v:'45'});
    await host.setViewportSize({width:900,height:520});await host.evaluate(()=>document.activeElement.blur());await host.waitForTimeout(300);
    await host.click('.gear');

    step('oyun başlar, herkes rolünü görür');
    await host.click('.start');
    const all=()=>[host,...Object.values(pages)];
    for(const p of all())await p.waitForSelector('.ov.mine',{timeout:15000});
    const ids={},keys={};for(const [n,p] of [['Ev',host],...Object.entries(pages)]){ids[n]=await p.evaluate(()=>myId);keys[n]=await p.evaluate(()=>uid)}
    assert.ok(Object.values(ids).every((id,i)=>id&&id!==Object.values(keys)[i]),'açık kimlik gizli anahtardan farklı olmalı');
    const roles={};for(const [n,p] of [['Ev',host],...Object.entries(pages)])roles[n]=await p.textContent('.ov.mine b');
    console.log('  roller:',roles);
    const R=roomOf().game;
    assert.deepStrictEqual(Object.keys(R.g.roles).sort(),Object.values(ids).sort());

    step('gece: hamlesi olan herkes bir eve dokunur');
    await host.waitForTimeout(5200); // rol kartı gece animasyonundan sonra açılır
    for(const p of all())await p.click('text=Anladım');
    // rol rehberi gece de açılır, sahneyi kaplamaz, kendi rolünü işaretlemez, 19 rolü ve dağılımı listeler
    { const rp=pages.Ali;await rp.click('button.rehber-dugme');await rp.waitForSelector('.rehber');
      const r=await rp.evaluate(()=>{const e=document.querySelector('.rehber');const t=e.textContent;return{w:e.getBoundingClientRect().width/innerWidth,roller:Object.values(ROLES).filter(x=>t.includes(x.n)).length,dagilim:/Dağılım/.test(t),ben:!!e.querySelector('.ben'),gizli:t.includes('Hain arkadaşların')||t.includes((priv.notes||[]).join(''))&&(priv.notes||[]).length>0}});
      assert.ok(await rp.evaluate(()=>/Eşyalar/.test(document.querySelector('.rehber').textContent)&&!/Kum saati/.test(document.querySelector('.rehber').textContent)&&!!document.querySelector('.rehber button.esyalar-ac')),'rol rehberinde eşya listesi yok, ayrı Eşyalar bağlantısı var');
      assert.ok(r.w<0.6,'çekmece sahnenin yarısından azını kaplar');assert.strictEqual(r.roller,Object.keys(await rp.evaluate(()=>ROLES)).length,'tüm roller listelenir');assert.ok(r.dagilim);assert.strictEqual(r.ben,false);assert.strictEqual(r.gizli,false);
      await rp.evaluate(()=>{document.querySelector('.rehber').scrollTop=180});await rp.waitForTimeout(3200);assert.ok(await rp.evaluate(()=>document.querySelector('.rehber').scrollTop)>100,'rehber kaydırması render ile sıfırlanmamalı');
      await rp.click('.rehber .kapat');assert.strictEqual(await rp.$('.rehber'),null);
      await rp.click('button.rehber-dugme');await rp.waitForSelector('.rehber .esyalar-ac');
      await rp.click('.rehber button.esyalar-ac');await rp.waitForSelector('.ov.esyalar',{timeout:3000});{ const t=await rp.textContent('.ov.esyalar');assert.match(t,/Kum saati/);assert.match(t,/paket/);assert.ok(t.includes(G.ESYA.kilit.nasil),'eşya sayfasında nasıl kullanılır')}
      await rp.click('.ov.esyalar button.kapat');await rp.waitForFunction(()=>!document.querySelector('.ov.esyalar'));
      const kes=await rp.evaluate(()=>{const a=document.querySelector('.timerbox').getBoundingClientRect(),b=document.querySelector('.rehber-dugme').getBoundingClientRect();return !(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top)});assert.strictEqual(kes,false,'📘 zamanlayıcıyı örtmemeli'); }
    let acted=0;const actors=[];
    // Provokatör hamle yapmaz: kışkırtılan oyuncu oylamada +2 oy alır ve "herkes çekimser" oylamasında asılır; 4 kişide bu oyunu 1. günde
    // bitirir, sonraki adımlar (kopan oyuncu döner…) süren oyun ister. (Kararsızlığın kök nedeni; 2026-10-25.)
    const adi=new Map([[host,'Ev'],...Object.entries(pages).map(([n,q])=>[q,n])]);
    for(const p of all()){
      if(/Provokatör/.test(roles[adi.get(p)]||''))continue;
      // gerçek tıklama, ekrandaki konuma: evin üstünü örten bir katman varsa (gece karartması, ipucu) burada yakalanır
      const at=await p.evaluate(()=>{if(!canTarget())return null;const t=P.players.find(x=>x.id!==myId);const g=scene.houses[t.id].g;if(!g.onclick)throw new Error('ev tıklanamıyor');const r=g.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});
      if(!at)continue;
      await p.mouse.click(at.x,at.y);acted++;actors.push(p);
      if(acted===1){
        // yürüyüş: 250 ms sonra karakter henüz hedefte değil; walkMs sonra hedefte, yürüyüş sınıfı düşmüş, etiket karakterin üstünde
        await p.waitForTimeout(250);const t0=Date.now()-250;
        const walk=await p.evaluate(()=>anim.walkMs);assert.ok(walk>=500&&walk<=3500,'walkMs '+walk);
        const yolda=await p.evaluate(()=>{const b=scene.beans[myId];const r=b.g.getBoundingClientRect();const h=scene.houses[anim.hedef].g.getBoundingClientRect();return Math.hypot((r.x+r.width/2)-(h.x+h.width/2),(r.y+r.height/2)-(h.y+h.height/2))});
        assert.ok(yolda>60,'250 ms sonra hâlâ yolda olmalı: '+yolda);
        await p.waitForTimeout(Math.max(0,walk-(Date.now()-t0))+150);
        const varis=await p.evaluate(()=>{const b=scene.beans[myId];return{walking:b.g.classList.contains('walking'),tag:b.tag.textContent}});
        assert.strictEqual(varis.walking,false,'varışta yürüyüş sınıfı düşmeli');assert.strictEqual(varis.tag,'SEN');
        // rol hareketi: varıştan hemen sonra sahnede .rol-fx (masum hariç); başka oyuncu hiçbir şey görmez; yenilemede tekrar oynamaz
        await p.waitForTimeout(150);
        const fx=await p.evaluate(()=>({n:document.querySelectorAll('#app .rol-fx').length,rol:priv.role.key}));
        assert.ok(fx.n>=1||fx.rol==='masum','rol hareketi görünmeli: '+JSON.stringify(fx));
        const other=all().find(q=>q!==p);
        assert.strictEqual(await other.evaluate(()=>document.querySelectorAll('#app .rol-fx, #app .iz').length),0,'başkası hareket/iz görmemeli');
        await p.reload();await p.waitForFunction(()=>P.phase==='night'&&typeof scene!=='undefined'&&scene&&scene.beans[myId],null,{timeout:8000});await p.waitForTimeout(800);
        assert.strictEqual(await p.evaluate(()=>document.querySelectorAll('#app .rol-fx').length),0,'yenilemede hareket tekrar oynamamalı');
        await p.waitForTimeout(4500);await p.click('text=Anladım'); // yenilemede akşam dizisi ve rol kartı yeniden gelir
        await p.waitForTimeout(400);
        { const g=await p.evaluate(()=>{const m=sel.mode||'ab';const t=local.act[m];const b=scene.beans[myId];const h=t&&scene.houses[t];const bp=beanPos(b);return{t,hedefte:!!h&&Math.hypot(bp.x-h.x,bp.y-h.y)<160,evde:Math.hypot(bp.x-scene.houses[myId].x,bp.y-scene.houses[myId].y)<60}});
          assert.ok(g.t&&g.hedefte&&!g.evde,'yenilemede gece hamlesi geri gelir, karakter hedefte: '+JSON.stringify(g))}
        // hedef değiştirme: yürürken başka ev; eski hareket silinir, yeni yürüyüş başlar (walkN), süre makul
        const evler=await p.evaluate(()=>P.players.filter(x=>x.id!==myId).map(x=>{const r=scene.houses[x.id].g.getBoundingClientRect();return{id:x.id,x:r.x+r.width/2,y:r.y+r.height/2}}));
        await p.mouse.click(evler[0].x,evler[0].y);await p.waitForTimeout(120);await p.mouse.click(evler[1].x,evler[1].y);
        const yeni=await p.evaluate(()=>({n:anim.walkN,hedef:anim.hedef,fx:document.querySelectorAll('#app .rol-fx').length,ms:anim.walkMs}));
        assert.deepStrictEqual({n:yeni.n,hedef:yeni.hedef,fx:yeni.fx},{n:2,hedef:evler[1].id,fx:0},'hedef değişince eski hareket silinmeli: '+JSON.stringify(yeni));
        assert.ok(yeni.ms>=0&&yeni.ms<=3500,'ikinci yürüyüş süresi '+yeni.ms);
        await p.waitForTimeout(yeni.ms+500);
        const varis2=await p.evaluate(()=>{const b=scene.beans[myId];const r=b.g.getBoundingClientRect();const h=scene.houses[anim.hedef].g.getBoundingClientRect();return Math.hypot((r.x+r.width/2)-(h.x+h.width/2),(r.y+r.height/2)-(h.y+h.height/2))});
        assert.ok(varis2<120,'ikinci hedefe varmalı: '+varis2);
        // vazgeç: iz silinir, karakter evine yürür
        await p.click('text=Vazgeç');
        const vaz=await p.evaluate(()=>({hedef:anim.hedef,iz:document.querySelectorAll('#app .iz').length,fx:document.querySelectorAll('#app .rol-fx').length,ms:anim.walkMs}));
        assert.deepStrictEqual({hedef:vaz.hedef,iz:vaz.iz,fx:vaz.fx},{hedef:null,iz:0,fx:0},'vazgeçte iz ve hareket silinmeli: '+JSON.stringify(vaz));
        await p.waitForTimeout(vaz.ms+500);
        const evde=await p.evaluate(()=>{const b=scene.beans[myId];const r=b.g.getBoundingClientRect();const h=scene.houses[myId].g.getBoundingClientRect();return Math.hypot((r.x+r.width/2)-(h.x+h.width/2),(r.y+r.height/2)-(h.y+h.height/2))});
        assert.ok(evde<120,'vazgeçince evine dönmeli: '+evde);
        await p.mouse.click(evler[0].x,evler[0].y); // hamle yeniden: sunucuda hamle kalsın
      }
    }
    await host.waitForTimeout(300);
    assert.ok(acted>0&&Object.keys(R.g.acts).length===acted,'sunucu gece hamlelerini almalı ('+acted+' / '+Object.keys(R.g.acts).length+')');
    const gec=Object.values(pages).find(p=>actors.includes(p)); // gece biterken hareketi süren oyuncu (ev sahibi değil)

    step('ev sahibi sekmesini kapatır; gece sonu onu bekler, sonra oyun sürer');
    await hostCtx.close();
    const watcher=pages.Ali;
    await watcher.waitForFunction(id=>!(P.online||[]).includes(id),ids.Ev,{timeout:5000}); // sunucu kapanan soketi görmüş olsun
    roomOf().game.P.ends=Date.now()-1;
    await watcher.waitForFunction(id=>P.phase==='night'&&P.waiting&&P.waiting.includes(id)&&document.body.textContent.includes('bekleniyor'),ids.Ev,{timeout:5000});
    if(gec){const at=await gec.evaluate(()=>{const t=P.players.find(x=>x.id!==myId&&x.id!==anim.hedef);const r=scene.houses[t.id].g.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});await gec.mouse.click(at.x,at.y)}
    roomOf().game.P.ends=Date.now()-1;
    await watcher.waitForFunction(()=>P.phase!=='night',null,{timeout:5000});
    assert.ok(['talk','end'].includes(await phase(watcher)));
    if(gec){await gec.waitForTimeout(1500);assert.strictEqual(await gec.evaluate(()=>document.querySelectorAll('#app .rol-fx, #app .iz').length),0,'gece biterken süren hareket sabaha kalmamalı')}

    step('ev sahipliği bağlı bir oyuncuya geçer');
    await watcher.waitForFunction(h=>P.hostId!==h,ids.Ev,{timeout:5000});
    const newHostId=await watcher.evaluate(()=>P.hostId);
    const newHostName=Object.keys(ids).find(n=>ids[n]===newHostId);
    assert.ok(newHostName&&newHostName!=='Ev');
    assert.strictEqual(await pages[newHostName].evaluate(()=>isHost),true);

    if(await phase(watcher)==='talk'){
      step('gündüz sohbeti');
      const aliveNames=[];for(const [n,p] of Object.entries(pages))if(await p.evaluate(()=>{const me=pl(myId);return !!(me&&me.alive)}))aliveNames.push(n);
      const sp=pages[aliveNames[0]];
      await sp.fill('#chatInput','merhaba kasaba');await sp.click('.chat button');
      for(const p of Object.values(pages))await p.waitForFunction(()=>(P.chat||[]).some(m=>m.t==='merhaba kasaba'));
      { const g=await sp.evaluate(()=>{const d=document.querySelector('.chat .log div');if(!d)return 'yok';const r=d.getBoundingClientRect();const log=d.closest('.chat .log').getBoundingClientRect();
          const balon=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2),bosluk=document.elementFromPoint(Math.min(log.right-4,r.right+12),r.top+r.height/2);
          return {balonTutar:!!(balon&&balon.closest('.chat .log')),boslukGecer:!(bosluk&&bosluk.closest('.chat .log')),yer:r.right+12<log.right-4}});
        assert.strictEqual(g.balonTutar,true,'balon dokunmayı alır (kaydırma/seçme çalışır)');if(g.yer)assert.strictEqual(g.boslukGecer,true,'balon dışındaki boşluk dokunmayı geçirir')}
      // hızlı ifade: ⚡ → Rolüm → Doktor → herkeste sohbette; hemen ikinci dokunuş → "Biraz bekle" uyarısı
      await sp.evaluate(()=>{window.__gonderilen=[];const o=send;send=m=>{window.__gonderilen.push(m.t);return o(m)}}); // istemci bekleme engeli: ikinci dokunuş sunucuya gitmez
      await sp.click('button.hizli');
      { const sec=await sp.$$eval('.hizli-panel button.secenek',bs=>bs.map(b=>[b.dataset.k,b.textContent]));const tur=await sp.evaluate(()=>window.KG_GAME.HIZLI_TUR);
        assert.ok(tur&&Object.keys(tur).length===sec.length,'seçenekler HIZLI_TUR\'dan: '+JSON.stringify(sec));assert.strictEqual(sec.find(x=>x[0]==='belirsiz')[1],tur.belirsiz,'etiket metni tek kaynaktan')}
      await sp.click('.hizli-panel button.secenek[data-k="rol"]');await sp.click('.hizli-panel .rol[data-rol="doktor"]');
      for(const p of Object.values(pages))await p.waitForFunction(()=>(P.chat||[]).some(m=>m.kisa==='rol'&&m.t==='🗣️ Rolüm: Doktor'),null,{timeout:5000});
      await sp.click('button.hizli');await sp.click('.hizli-panel button.secenek[data-k="koru"]');
      await sp.waitForFunction(()=>/Biraz bekle/.test((document.querySelector('.hizli-uyari')||{}).textContent||''),null,{timeout:4000});
      assert.match(await sp.textContent('button.hizli'),/⚡ \d/,'bekleme sayacı düğmede');
      assert.strictEqual(await sp.evaluate(()=>window.__gonderilen.filter(t=>t==='hizli').length),1,'bekleme sırasında ikinci ifade sunucuya gönderilmez');
      assert.strictEqual(await sp.$eval('button.hizli',b=>b.dataset.sayac),'1/4','günlük sayaç 1/4');

      step('bağlantı kopar: rozet görünür, kendiliğinden döner');
      const lost=pages[aliveNames[0]];
      await lost.evaluate(()=>ws.close());
      await lost.waitForSelector('.ov.offline',{timeout:3000});
      // diğerleri kopuk oyuncunun karakterinde KOPUK etiketini görür (gözlemci kopan sekme olmamalı)
      const lostId=await lost.evaluate(()=>myId);const observer=Object.values(pages).find(p=>p!==lost);
      await observer.waitForFunction(id=>P.online&&!P.online.includes(id)&&scene.beans[id]&&scene.beans[id].g.textContent.includes('KOPUK'),lostId,{timeout:4000}); // etiket karakterin üstünde
      await lost.waitForSelector('.ov.offline',{state:'detached',timeout:8000});
      await lost.waitForFunction(()=>(P.chat||[]).some(m=>m.t==='merhaba kasaba'));
      assert.strictEqual(await lost.evaluate(()=>P.chat.filter(m=>m.t==='merhaba kasaba').length),1,'yeniden bağlanınca sohbet çiftlenmemeli');

      step('oylama: herkes çekimser kalınca faz kendiliğinden geçer');
      roomOf().game.P.ends=Date.now()-1;
      await watcher.waitForFunction(()=>P.phase==='vote');
      await watcher.waitForTimeout(1200);
      for(const n of aliveNames)await pages[n].click('.ov.skip');
      // Ev da yaşıyorsa onun yerine süre dolsun
      if(R.P.phase==='vote')roomOf().game.P.ends=Date.now()-1;
      await watcher.waitForFunction(()=>P.phase==='night'||P.phase==='end',null,{timeout:5000});
      assert.strictEqual(await phase(watcher),'night','çekimser oylama oyunu bitirmemeli: '+JSON.stringify(roomOf().game.P.dead));
    }

    step('kopan oyuncu aynı linkle döner, rolü aynı');
    await pages.Can.close();
    pages.Can=await open(ctxs.Can,'Can',link);
    try{await pages.Can.waitForSelector('.ov.mine',{timeout:10000})}
    catch(e){const d=await pages.Can.evaluate(()=>({phase:P.phase,day:P.day,myId,rol:!!(priv&&priv.role),anim:anim.seq,ov:[...document.querySelectorAll('.ov')].map(x=>x.className),players:(P.players||[]).map(p=>p.id+':'+(p.alive?'a':'d')),online:P.online})).catch(x=>String(x));
      const R0=roomOf().game;throw new Error('kopan oyuncu dönünce .ov.mine gelmedi; durum: '+JSON.stringify(d)+' sunucu fazı: '+R0.P.phase+' gün '+R0.P.day+' ölüler '+JSON.stringify(R0.P.dead)+' günlük: '+R0.gameLog.map(e=>e.tur+' g'+e.gun+' '+JSON.stringify(e.veri).slice(0,220)).join(' | '))}
    assert.strictEqual(await pages.Can.textContent('.ov.mine b'),roles.Can);
    assert.strictEqual(await pages.Can.evaluate(()=>myId),ids.Can);

    step('eski ev sahibi de döner; rolü durur, ev sahibi değildir');
    const hostCtx2=await newCtx();
    // aynı tarayıcıyı taklit et: kimlik localStorage'da
    await hostCtx2.addInitScript(([u])=>{try{localStorage.setItem('kg_uid',JSON.stringify(u));localStorage.setItem('kg_name',JSON.stringify('Ev'))}catch(e){}},[keys.Ev]);
    host=await open(hostCtx2,'Ev',link);
    await host.waitForSelector('.ov.mine',{timeout:10000});
    assert.strictEqual(await host.textContent('.ov.mine b'),roles.Ev);
    assert.strictEqual(await host.evaluate(()=>isHost),false);

    step('oyun biter: özet, senin payın ve "Tekrar oyna"');
    { const R2=roomOf().game; // hainler dışındaki herkesi ölmüş say → bir sonraki oylama çözümünde hainler kazanır
      for(const [id,r] of Object.entries(R2.g.roles))if(r.team!=='imp')G.pl(R2,id).alive=false;
      // checkWin yalnız gece ve oylama çözümünde çalışır; hangi fazdaysak süreyi bitire bitire sona gel (gece: bekleme kuralını atla)
      for(let i=0;i<4&&R2.P.phase!=='end';i++){const ph=R2.P.phase;R2.P.waited=true;R2.P.ends=Date.now()-1;await watcher.waitForFunction(x=>P.phase!==x,ph,{timeout:5000})}
      for(const p of [host,...Object.values(pages)])await p.waitForFunction(()=>P.phase==='end'&&P.ozet&&document.querySelector('.endcard .ozet'),null,{timeout:8000});
      assert.strictEqual((await watcher.$$('.endcard .ozet > *')).length,4);
      // gazete (varsa 1–3 kart), bu akşamın skoru (4 çip, N/1), rövanş bloğu
      const gz=await watcher.$$('.endcard .gazete .kart');assert.ok(gz.length<=3,'gazete en çok 3 kart');
      if(await watcher.$('.endcard .gazete'))assert.ok(gz.length>=1,'gazete kutusu varsa kart olmalı');
      const skor=await watcher.$$eval('.endcard .skor .cip',a=>a.map(x=>x.textContent));assert.strictEqual(skor.length,4,'skor 4 oyuncu');assert.ok(skor.every(t=>/[01]\/1/.test(t)),skor.join('|'));
      // izleyici (maç sonunda katılan üye): rövanş düğmesi yok, sayaçta yalnız oyuncular sayılır
      { const ci=await newCtx();const iz=await open(ci,'Izleyici',link);await iz.waitForFunction(()=>P.phase==='end'&&document.querySelector('.endcard'),null,{timeout:8000});
        assert.strictEqual(await iz.$('.endcard button.hazir'),null,'izleyiciye rövanş düğmesi gösterilmez');assert.match(await iz.textContent('.endcard .hazir-sayac'),/^4 kişiden/,'sayaç paydası oyuncular');
        assert.match(await watcher.textContent('.endcard .hazir-sayac'),/^4 kişiden/,'izleyici paydaya girmez');await iz.close();await ci.close()}
      await watcher.click('.endcard button.hazir');
      for(const p of Object.values(pages))await p.waitForFunction(()=>/4 kişiden 1'i hazır/.test((document.querySelector('.endcard .hazir-sayac')||{}).textContent||''),null,{timeout:4000});
      assert.strictEqual(await pages[newHostName].$eval('.endcard button.rovans',b=>b.disabled),true,'1 hazırla rövanş başlamaz');
      // telefon yatay: kart ekranı aşmaz
      await watcher.setViewportSize({width:844,height:390});await watcher.waitForTimeout(400);
      const r=await watcher.$eval('.endcard',e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom}});assert.ok(r.top>=0&&r.bottom<=390,'endcard ekrana sığmalı: '+JSON.stringify(r));
      await watcher.setViewportSize({width:900,height:520});
      assert.strictEqual(await pages[newHostName].textContent('.endcard button.lobi'),'Lobiye dön');
      assert.strictEqual(await watcher.$('.endcard a.hikaye'),null,'kayıt kapalıyken hikâye linki yok');
      await pages[newHostName].click('.endcard button.lobi');
      for(const p of [host,...Object.values(pages)])await p.waitForFunction(()=>P.phase==='lobby'&&!priv.role,null,{timeout:5000});
      for(const p of Object.values(pages))assert.strictEqual(await p.evaluate(()=>hizliBugun()),0,'⚡ günlük sayaç sohbetten türer; lobide 0');
      assert.strictEqual((await watcher.$$('.lobby-skor .cip')).length,4,'lobide bu akşamın skoru görünmeli');
    }

    step('7 oyuncu, telefon yatay 844×390: evler ekrana sığar, birbirine binmez (sahne küçülür)');
    { const WebSocket=require('ws');const c7=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true});
      const p7=await open(c7,'Sığma',base);await p7.click('text=Yeni oda kur');await p7.fill('#nameInput','Ev');await p7.click('text=Lobiye gir');
      await p7.waitForFunction(()=>typeof P!=='undefined'&&!!P.room);const oda=await p7.evaluate(()=>P.room);
      const botlar=[];for(let i=1;i<7;i++){const w=new WebSocket('ws://127.0.0.1:'+srv.server.address().port+'/ws');await new Promise(r=>w.on('open',r));w.send(JSON.stringify({t:'join',room:oda,uid:'sig'+i,name:'Oyuncu'+i,color:G.COLORS[i],hat:'none'}));botlar.push(w)}
      await p7.waitForFunction(()=>P.lobby&&P.lobby.length===7);await p7.evaluate(()=>send({t:'start'}));await p7.waitForFunction(()=>P.phase==='night');await p7.waitForTimeout(1500);
      { const k=await p7.evaluate(()=>{const box=document.querySelector('.ov.box');const ev=[...document.querySelectorAll('svg.scene text')].find(t=>t.textContent==='Ev');if(!box||!ev)return 'yok';const a=box.getBoundingClientRect(),b=ev.getBoundingClientRect();return !(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top)});
        assert.strictEqual(k,false,'gece 1 balonu üstteki evin adını örtmemeli (k='+k+')')}
      await p7.waitForTimeout(1500);
      const evler=await p7.evaluate(()=>P.players.map(x=>{const r=scene.houses[x.id].g.getBoundingClientRect();return{ad:x.name,l:Math.round(r.left),t:Math.round(r.top),r:Math.round(r.right),b:Math.round(r.bottom)}}));
      for(const e of evler)assert.ok(e.l>=0&&e.r<=844&&e.t>=60&&e.b<=390,'ev ekrana sığmalı (üst şerit 60px): '+JSON.stringify(e));
      for(let i=0;i<evler.length;i++)for(let j=i+1;j<evler.length;j++){const a=evler[i],b=evler[j];const ox=Math.min(a.r,b.r)-Math.max(a.l,b.l),oy=Math.min(a.b,b.b)-Math.max(a.t,b.t);assert.ok(ox<=6||oy<=6,'evler binişiyor: '+JSON.stringify([a,b]))}
      for(const w of botlar)w.close();await c7.close();
    }

    step('eşya modu: ev sahibi açar, lobide eşya görünür; dolap premium; gece eşya düğmesi → act.esya, sabah anonim haber; kasa kartı; bayrak çizimi');
    { const WebSocket=require('ws');const ce=await newCtx();const pe=await open(ce,'Esya',base);
      await pe.click('text=Yeni oda kur');await pe.fill('#nameInput','Ev');await pe.click('text=Lobiye gir');await pe.waitForFunction(()=>typeof P!=='undefined'&&!!P.room);
      const oda=await pe.evaluate(()=>P.room);const botlar=[];
      for(let i=1;i<4;i++){const w=new WebSocket('ws://127.0.0.1:'+srv.server.address().port+'/ws');await new Promise(r=>w.on('open',r));w.send(JSON.stringify({t:'join',room:oda,uid:'esy'+i,name:'Bot'+i,color:G.COLORS[i],hat:'none'}));botlar.push(w)}
      await pe.waitForFunction(()=>P.lobby&&P.lobby.length===4);
      await pe.click('.gear');await pe.click('text=Eşya modu: kapalı');await pe.waitForFunction(()=>P.settings&&P.settings.esyaModu===true,null,{timeout:4000});
      await pe.waitForFunction(()=>/Eşyan:/.test((document.querySelector('.lobi-esya')||{}).textContent||''),null,{timeout:4000});
      { await pe.setViewportSize({width:844,height:390});await pe.waitForTimeout(300);
        const k=await pe.evaluate(()=>{const r=s=>{const e=document.querySelector(s);return e?e.getBoundingClientRect():null};const kes=(a,b)=>!!a&&!!b&&!(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);const e=r('.lobi-esya'),h=r('.ov.hint'),l=r('.lobbybar'),b=r('.ov.start');return{esyaHint:kes(e,h),esyaBar:kes(e,l),hintBar:kes(h,l),esyaStart:kes(e,b)}});
        assert.deepStrictEqual(k,{esyaHint:false,esyaBar:false,hintBar:false,esyaStart:false},'lobi: eşya kutusu, ipucu, davet şeridi ve başlat düğmesi çakışmaz (844×390)');await pe.setViewportSize({width:900,height:520}) }
      await pe.evaluate(()=>{lobiEsya={key:'zar',kaynak:'bedava'};render()});assert.match(await pe.textContent('.lobi-esya'),/Zar.*nadir/);
      // dolap: envanter gelmiş gibi (Supabase yok) → premium şapka, bayrak ve eşya seçenekleri görünür
      await pe.evaluate(()=>{envanter={yildiz:5,esyalar:{iksir:2},kozmetikler:['sapka:tac','bayrak:mavi','ev:pagoda','ev:fici-han']};ui.custom=true;render()});
      const dolap=await pe.textContent('.ov.custom');assert.match(dolap,/Taç/);assert.match(dolap,/Mavi bayrak/);assert.match(dolap,/İksir ×2/);assert.match(dolap,/Evin/);assert.match(dolap,/Varsayılan ev · Değiştir/);assert.ok(!/Bayrak yok/.test(dolap),'bayrağı olan için dükkân bağlantısı çıkmaz');
      // ev seçimi: sunucu sahipliği doğrular (envanter sunucuda), sahnede o ev çizilir; resimli ev resim olarak yüklenir
      { const odaE=[...srv.rooms.values()].find(r=>r.code===oda);const benE=await pe.evaluate(()=>myId);const memE=odaE.members.get(benE);memE.envanter={yildiz:5,esyalar:{iksir:2},kozmetikler:['sapka:tac','bayrak:mavi','ev:pagoda','ev:fici-han']};
        await pe.click('.ov.custom button.ev-sec');await pe.waitForSelector('.ov.ev-galeri',{timeout:3000});
        assert.strictEqual(await pe.evaluate(()=>document.querySelectorAll('.ev-galeri .ev-kart svg').length),3,'galeride varsayılan + 2 ev, resimleriyle');
        assert.strictEqual(await pe.evaluate(()=>{const a=document.querySelector('.ev-galeri a.ev-kart.al');return a&&a.getAttribute('href')}),'/ben','galeride dükkân kartı');
        await pe.click('.ev-galeri .ev-kart[data-key="pagoda"]');await pe.waitForFunction(()=>{const g=scene&&scene.houses[myId]&&scene.houses[myId].g;return P.lobby.find(x=>x.id===myId).ev==='pagoda'&&g&&g.getAttribute('data-ev')==='pagoda'},null,{timeout:5000});
        assert.strictEqual(await pe.evaluate(()=>scene.houses[myId].door.childElementCount),0,'modelli evde genel kapı çizilmez (kendi kapısı)');
        await pe.click('.ov.custom button.ev-sec');await pe.click('.ev-galeri .ev-kart[data-key="fici-han"]');await pe.waitForFunction(()=>{const g=scene.houses[myId].g;return g.getAttribute('data-ev')==='fici-han'&&!!g.querySelector('image')},null,{timeout:5000});
        const yuklendi=await pe.evaluate(()=>new Promise(res=>{const im=new Image();im.onload=()=>res(im.naturalWidth);im.onerror=()=>res(0);im.src=scene.houses[myId].g.querySelector('image').getAttribute('href')}));assert.ok(yuklendi>0,'ev resmi yüklenir');
        assert.ok(await pe.evaluate(()=>{const g=scene.winLights[myId];return !!g&&!!g.querySelector('image')&&/fici-han-isik\.webp/.test(g.querySelector('image').getAttribute('href'))}),'resimli evde gece ışık katmanı');
        // iPhone yatay: karakter paneli, galeri ve ayarlar menüsü ekrana sığar (taşan kısım panelin içinde kaydırılır)
        await pe.setViewportSize({width:844,height:390});await pe.waitForTimeout(200);
        const sig=s=>pe.evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1},s);
        assert.ok(await sig('.ov.custom'),'karakter paneli 844×390 sığar');await pe.click('.ov.custom button.ev-sec');assert.ok(await sig('.ov.ev-galeri'),'galeri sığar');
        await pe.evaluate(()=>{ui.evGaleri=false;envanter.kozmetikler=[...new Set([...(envanter.kozmetikler||[]),...Object.keys(KOZMETIK.ev).slice(0,12).map(x=>'ev:'+x)])];render()});await pe.click('.ov.custom button.ev-sec');await pe.waitForSelector('.ov.ev-galeri .ev-kart');
        assert.deepStrictEqual(await pe.evaluate(()=>[...document.querySelectorAll('.ev-galeri .ev-kart')].filter(k=>k.scrollHeight>k.clientHeight+1).map(k=>k.dataset.key||'al')),[],'galeri taşınca kartlar ezilmez, ev adları görünür');
        await pe.click('.ev-galeri .ev-kart[data-key="none"]');await pe.waitForFunction(()=>!document.querySelector('.ov.ev-galeri'));
        await pe.evaluate(()=>{ui.custom=false;ui.menu=true;render()});await pe.waitForSelector('.ov.menu');assert.ok(await sig('.ov.menu'),'ayarlar menüsü sığar');assert.ok(await pe.evaluate(()=>{const m=document.querySelector('.ov.menu');return m.scrollHeight<=m.clientHeight+2}),'ayarlar menüsü 844×390da kaydırmadan sığar');await pe.evaluate(()=>{ui.menu=false;render()});
        await pe.setViewportSize({width:900,height:520});await pe.evaluate(()=>{ui.custom=true;render()});await pe.waitForFunction(()=>scene.houses[myId].g.getAttribute('data-ev')==='none',null,{timeout:5000})}
      await pe.evaluate(()=>{ui.custom=false;render()});
      // bayrak çizimi: drawHouse bayrak rengini taşır
      assert.strictEqual(await pe.evaluate(()=>{const s=document.createElementNS('http://www.w3.org/2000/svg','g');const h=drawHouse(s,0,0,'x',1,'mavi');return !!s.querySelector('[fill="#3b7bff"]')}),true,'bayrak çizilir');
      await pe.evaluate(()=>send({t:'start'}));await pe.waitForFunction(()=>P.phase==='night');
      const R=[...srv.rooms.values()].find(r=>r.code===oda).game;const benId=await pe.evaluate(()=>myId);
      const botId=R.P.players.find(p=>p.id!==benId).id;
      R.g.esya[benId]=[{key:'iksir',kaynak:'bedava',kullanildi:false},{key:'kilit',kaynak:'paket',kullanildi:false}];R.P.ends=Date.now()+60000;pe.evaluate(()=>send({t:'look',name:'Ev'}));
      await pe.waitForTimeout(5500);const ok=await pe.$('.ov.box.center:not(.esya-yeni) button.ok');if(ok)await ok.click();
      // yeni eşya kartı: her eşya için bir kez, ne yapar + nasıl kullanılır; rol kartından sonra
      for(const k of ['iksir','kilit']){await pe.waitForFunction(k=>{const c=document.querySelector('.ov.esya-yeni');return c&&c.dataset.key===k},k,{timeout:5000});
        const t=await pe.textContent('.ov.esya-yeni');assert.ok(t.includes(G.ESYA[k].n)&&t.includes(G.ESYA[k].nasil),'yeni eşya kartı: '+t);await pe.click('.ov.esya-yeni button.ok')}
      await pe.waitForFunction(()=>!document.querySelector('.ov.esya-yeni'));
      // oyun içi menü: ayrı Eşyalar bağlantısı
      await pe.click('.gear');await pe.click('text=🎒 Eşyalar');await pe.waitForSelector('.ov.esyalar',{timeout:3000});assert.strictEqual(await pe.$('.ov.menu'),null,'Eşyalar açılınca menü kapanır');assert.match(await pe.textContent('.ov.esyalar'),/Senin eşyaların[\s\S]*Kilit/);await pe.click('.ov.esyalar button.kapat');
      await pe.waitForFunction(()=>document.querySelectorAll('.ov.esya-cip').length===2,null,{timeout:5000});
      const cips=await pe.$$eval('.ov.esya-cip',e=>e.map(x=>x.textContent));assert.match(cips[0],/İksir.*kendiliğinden/);assert.match(cips[1],/Kilit/);
      { const k=await pe.evaluate(()=>{const r=e=>e.getBoundingClientRect();const cs=[...document.querySelectorAll('.ov.esya-cip')].map(r);return ['.notesbtn','.ov.mine'].map(s=>{const o=r(document.querySelector(s));return cs.some(c=>!(c.right<=o.left||o.right<=c.left||c.bottom<=o.top||o.bottom<=c.top))})});
        assert.deepStrictEqual(k,[false,false],'eşya çipleri Notlar ve rol kartıyla çakışmaz')}
      assert.strictEqual(await pe.$('button.esya-kullan[data-key="iksir"]'),null,'pasif eşyada düğme yok');
      // çipe dokununca bilgi kutusu: ne yapar + nasıl kullanılır (katalogdan)
      await pe.click('button.esya-cip[data-key="kilit"]');await pe.waitForSelector('.ov.esya-bilgi',{timeout:3000});const bilgi=await pe.textContent('.ov.esya-bilgi');
      assert.match(bilgi,/Kilit/);assert.match(bilgi,/EFSANEVİ/i);assert.ok(bilgi.includes(G.ESYA.kilit.desc)&&bilgi.includes(G.ESYA.kilit.nasil),'katalog metinleri');await pe.click('.ov.esya-bilgi button:has-text("Kapat")');await pe.waitForFunction(()=>!document.querySelector('.ov.esya-bilgi'));
      const rolEski=R.g.roles[benId];R.g.roles[benId]={key:'gozcu',team:'imp',mad:null,uses:{},vest:3,planted:[]};pe.evaluate(()=>send({t:'look',name:'Ev'}));await pe.waitForFunction(()=>priv.role&&priv.role.key==='gozcu'&&priv.role.team==='imp');
      await pe.evaluate(()=>{sel.mode='ab';render()});assert.strictEqual(await pe.evaluate(()=>sel.mode),'ab','ikinci mod seçildi (Gözcü-hain: kill + ab)');
      await pe.click('button.esya-kullan[data-key="kilit"]');await pe.waitForFunction(()=>sel.mode==='esya:kilit');
      await pe.evaluate(id=>scene.houses[id].g.onclick(),botId);await pe.waitForFunction(()=>local.act&&local.act.esya==='kilit'&&!!local.act.esyaHedef);
      assert.match(await pe.textContent('button.esya-kullan[data-key="kilit"]'),/Bot/);assert.strictEqual(await pe.evaluate(()=>sel.mode),'ab','hedefli eşya seçimi önceki rol modunu geri getirir');
      await new Promise(r=>setTimeout(r,200));assert.strictEqual(R.g.acts[benId]&&R.g.acts[benId].esya,'kilit','sunucu act.esya aldı');assert.strictEqual(R.g.acts[benId].esyaHedef,botId);
      assert.ok(await pe.evaluate(()=>!!document.querySelector('svg .iz.esya')),'kapıda eşya simgesi');
      R.g.roles[benId]=rolEski; // ikinci hain oyunu bitirmesin (takım sayısı)
      R.P.waited=true;R.P.ends=Date.now()-1;await pe.waitForFunction(()=>P.phase==='talk',null,{timeout:8000});
      assert.ok(await pe.evaluate(()=>(P.morning.news||[]).some(n=>/kapısı kilitlendi/.test(n))),'sabah anonim kilit haberi');
      // kum saati: tartışmada düğme → sunucu süreyi uzatır, sohbette anonim satır
      R.g.esya[benId]=[{key:'kum',kaynak:'bedava',kullanildi:false}];pe.evaluate(()=>send({t:'look',name:'Ev'}));
      await pe.waitForSelector('button.esya-cip.kum-hazir',{timeout:5000});await pe.click('button.esya-cip.kum-hazir');await pe.waitForSelector('button.kum-kullan',{timeout:3000});const ends0=R.P.ends;await pe.click('button.kum-kullan');
      await pe.waitForFunction(()=>(P.chat||[]).some(m=>m.sys&&/kum saatini çevirdi/.test(m.t)),null,{timeout:5000});assert.strictEqual(R.P.ends,ends0+30000);
      // meydan paketi (telefon ölçüsü): sahnede görünür, sohbet/düğmelerle çakışmaz, dokununca ikinci eşya, kapanış satırı
      await pe.setViewportSize({width:844,height:390});R.g.paket={zaman:0,keys:['fis'],alanlar:[],acik:false,ends:null};
      await pe.waitForFunction(()=>P.paket&&P.paket.key==='fis'&&!!document.querySelector('svg .paket'),null,{timeout:5000});
      // rastgele yer: dört uç noktada da sohbet/Notlar/rol kartı/evlerle çakışmaz, yer değişince paket taşınır
      for(const yer of [0,1,2,3,4,5,6,7].map(i=>({x:+(0.99*Math.cos(i*Math.PI/4)).toFixed(2),y:+(0.99*Math.sin(i*Math.PI/4)).toFixed(2)}))){R.P.paket={...R.P.paket,yer};pe.evaluate(()=>send({t:'look',name:'Ev'}));
        await pe.waitForFunction(y=>P.paket&&P.paket.yer&&P.paket.yer.x===y.x&&P.paket.yer.y===y.y&&document.querySelector('svg .paket'),yer,{timeout:5000});await pe.waitForTimeout(150);
        const k=await pe.evaluate(()=>{const r=e=>e&&e.getBoundingClientRect();const c=r(document.querySelector('svg .paket circle'));const kes=o=>!!o&&!(c.right<=o.left||o.right<=c.left||c.bottom<=o.top||o.bottom<=c.top);
          const ui=['.ov.chat','.notesbtn','.ov.mine','.ov.timerbox','.ov.rolebar'].map(s=>kes(r(document.querySelector(s))));const ekranda=c.left>=0&&c.top>=0&&c.right<=innerWidth&&c.bottom<=innerHeight;return{ui,ekranda}});
        assert.deepStrictEqual(k.ui,[false,false,false,false,false],'paket sohbet/Notlar/rol kartı/sayaç/rol şeridiyle çakışmaz '+JSON.stringify(yer));assert.ok(k.ekranda,'paket ekranın içinde '+JSON.stringify(yer))}
      { const h=()=>pe.evaluate(()=>+document.querySelector('svg .paket .halka').getAttribute('stroke-dashoffset'));const h1=await h();await pe.waitForTimeout(400);const h2=await h();assert.ok(h2>h1,'paket halkası 400 ms içinde küçülür: '+h1+' → '+h2)}
      await pe.evaluate(()=>document.querySelector('svg .paket').dispatchEvent(new MouseEvent('click',{bubbles:true})));
      await pe.waitForFunction(()=>priv.esya&&priv.esya.length===2&&priv.esya[1].key==='fis',null,{timeout:5000});
      await pe.waitForFunction(()=>{const c=document.querySelector('.ov.esya-yeni');return c&&c.dataset.key==='fis'},null,{timeout:5000});await pe.click('.ov.esya-yeni button.ok');
      await pe.waitForFunction(()=>P.paket===null&&!document.querySelector('svg .paket')&&(P.chat||[]).some(m=>m.sys&&/oy fişi düştü — biri kaptı/.test(m.t)),null,{timeout:5000});
      await pe.setViewportSize({width:900,height:520});
      // son ekran: eşya sütunu (fiş yok), sonraki eşya, kasa kartı
      R.P.ozet={kazanan:{takim:'inn',metin:'Masumlar kazandı!'},oyuncular:R.P.players.map(p=>({id:p.id,ad:p.name,rol:'Masum',takim:'inn',sag:true,olum:null,esyalar:p.id===benId?[{key:'kilit',kullanildi:true,kaynak:'paket'},{key:'kum',kullanildi:false,kaynak:'bedava'}]:[]}))};
      // kasa kartı (sunucu mesajı gibi)
      R.P.phase='end';R.P.winner={team:'inn',t:'Masumlar kazandı!',kazananlar:[benId]};pe.evaluate(()=>send({t:'look',name:'Ev'}));
      await pe.waitForFunction(()=>P.phase==='end'&&document.querySelector('.endcard'),null,{timeout:8000});
      await pe.waitForFunction(()=>!!document.querySelector('.endcard .ozet .esya'),null,{timeout:8000});const es=await pe.textContent('.endcard .ozet .esya');assert.match(es,/🔒 ✓/);assert.match(es,/⏳ ✗/);
      await pe.waitForFunction(()=>/Sonraki maçta eşyan/.test((document.querySelector('.endcard .lobi-esya')||{}).textContent||''),null,{timeout:12000});
      await pe.evaluate(()=>{kasaSonuc={odul:{tur:'kozmetik',key:'sapka:tac',nadir:'efsanevi'},donustu:false,yildiz:7,rozetler:['ilk_mac']};render()});
      await pe.waitForFunction(()=>document.querySelector('.endcard .kasa'),null,{timeout:12000});const kt=await pe.textContent('.endcard .kasa');
      assert.match(kt,/Taç/);assert.match(kt,/İlk maç/);assert.match(kt,/7/);
      await pe.evaluate(()=>{ayar.eposta=true;kayitli=true;hesap.eposta=null;kasaSonuc={odul:{tur:'yildiz',adet:6},yildiz:37,dokum:[{key:'kazanma',adet:2},{key:'kurtarici',adet:1}],gununIlki:5,bagli:false,seri:3,kademeler:[{key:'kurtarici',kademe:1,odul:10},{key:'golgeler',kademe:3,odul:'ev:karanlik-kule'}]};render()});
      await pe.waitForFunction(()=>/Günün ilk maçı/.test((document.querySelector('.endcard .kasa')||{}).textContent||''),null,{timeout:5000});
      { const kd=await pe.textContent('.endcard .kasa');assert.match(kd,/\+2 Kazandın/);assert.match(kd,/\+1 Kurtarıcı/);assert.match(kd,/\+5 Günün ilk maçı/);
        assert.ok(!/🔥/.test(kd),'bağlı değilse seri satırı yok');assert.match(await pe.textContent('.endcard .hesap-hatirlat'),/Serin 3 gün; bağlarsan günün ilki büyür/,'seri hatırlatması');
        assert.match(kd,/🥉 Kurtarıcı bronz · \+10 ⭐/,'bronz satırı');assert.match(kd,/🥇 Gölgelerin efendisi altın · 🏠 Karanlık kule/,'altın satırı');assert.strictEqual(await pe.evaluate(()=>document.querySelectorAll('.endcard .kasa .kademe').length),2);
        assert.match(await pe.textContent('.endcard .hesap-hatirlat'),/⭐ 37 yıldızın yalnız bu tarayıcıda\. E-postanı bağla, kaybolmasın \(\+25 ⭐ ve ✉️ bayrak\)/,'yıldızlı hatırlatma');
        assert.strictEqual(await pe.getAttribute('.endcard .hesap-hatirlat','href'),'/?bagla=1');
        await pe.evaluate(()=>{kasaSonuc={...kasaSonuc,bagli:true};render()});assert.strictEqual(await pe.$('.endcard .hesap-hatirlat'),null,'bağlıysa hatırlatma yok');
        await pe.evaluate(()=>{kasaSonuc={...kasaSonuc,gununIlki:7,seri:3,gorevler:[{key:'kazan',odul:15},{key:'hepsi',odul:20}]};render()});assert.match(await pe.textContent('.endcard .kasa'),/🔥 3\. gün üst üste · \+7 Günün ilk maçı/,'seri satırı');{const t=await pe.textContent('.endcard .kasa');assert.match(t,/✅ 2 kez kazan · \+15 ⭐/,'görev satırı');assert.match(t,/🏆 Haftanın görevleri tamam · \+20 ⭐/,'bonus satırı')}
        await pe.evaluate(()=>{kasaSonuc={...kasaSonuc,gununIlki:5,seri:1};render()});{const t1=await pe.textContent('.endcard .kasa');assert.match(t1,/\+5 Günün ilk maçı/);assert.ok(!/🔥/.test(t1),'ilk gün seri satırı yok')}
        await pe.evaluate(()=>{kasaSonuc={odul:null,tavan:true,yildiz:37,dokum:[],gununIlki:0,bagli:true,kademeler:[{key:'bekci',kademe:2,odul:30}]};render()});assert.ok(!/\+\d Kazandın/.test(await pe.textContent('.endcard .kasa')),'tavanda döküm satırı yok');
        assert.match(await pe.textContent('.endcard .kasa .kademe'),/🥈 Bekçi gümüş · \+30 ⭐/,'tavanda da kademe satırı');
        await pe.evaluate(()=>{try{sessionStorage.removeItem('kg_bagla_kart')}catch(e){}onServerMsg({t:'baglaOdulu',d:{yildiz:30,kozmetik:'bayrak:mektup'}})});
        await pe.waitForSelector('.bagla-kart',{timeout:5000});await pe.click('.bagla-kart button');assert.strictEqual(await pe.$('.bagla-kart'),null);
        await pe.evaluate(()=>onServerMsg({t:'baglaOdulu',d:{yildiz:30}}));await pe.waitForTimeout(150);assert.strictEqual(await pe.$('.bagla-kart'),null,'kart oturumda bir kez'); }
      await pe.evaluate(()=>{kasaSonuc={tekrar:true};render()});await pe.waitForFunction(()=>/daha önce açıldı/.test((document.querySelector('.endcard .kasa')||{}).textContent||''),null,{timeout:5000});
      assert.strictEqual(await pe.$('.endcard .kasa .odul'),null,'tekrar kasada ödül satırı yok');assert.strictEqual(await pe.$('.endcard .kasa .kademe'),null,'tekrarda kademe satırı yok');
      for(const w of botlar)w.close();await ce.close();
    }

    assert.deepStrictEqual(errors,[],'sayfa hataları');
    console.log('\nE2E: tüm adımlar geçti');
  }finally{
    await browser.close();await new Promise(r=>srv.close(r));
  }
})().catch(e=>{console.error('\nE2E BAŞARISIZ:',e&&e.stack||e);process.exit(1)});
