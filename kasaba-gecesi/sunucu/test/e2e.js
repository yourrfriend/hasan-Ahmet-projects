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
        const tablo={
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
          kasaba_uyeleri:[{kasaba_id:k1,uye:ben,rol:'uye',katilma:'2026-10-24T18:40:00Z'}],kasabalar:[{id:k1,ad:"Barış'ın Kasabası",sahip:'22222222-2222-4333-8444-555555555555',olusturma:'2026-10-24T18:40:00Z'}],
          kasaba_tablo:[{kasaba_id:k1,kurulum:'e2e',uye:ben,ad:'Ben',oyun:1,kazanma:1,en_cok_rol:'doktor'}],profiller:[{uye:ben,ad:'Ben',renk:'#3b7bff'}]};
        // PostgREST süzgeç taklidi: sütun=eq.x ve sütun=in.(a,b); select/order/limit yok sayılır (sıra sabit listedeki gibi)
        const suz=(satir,sp)=>{let r=satir;for(const [k,v] of sp){const m=/^(eq|in)\.(.*)$/.exec(v);if(!m)continue;const vals=m[1]==='in'?m[2].replace(/^\(|\)$/g,'').split(','):[m[2]];r=r.filter(x=>vals.includes(String(x[k])))}return r};
        const istekler=[];
        const c5=await newCtx();
        const c5Rota={desen:u=>/\/(auth|rest)\/v1\//.test(u.pathname)||u.pathname==='/ayar.json'||u.hostname==='challenges.cloudflare.com',isle:async route=>{
          if(new URL(route.request().url()).hostname==='challenges.cloudflare.com'){if(apiJsDurum!==200)return route.fulfill({status:apiJsDurum,body:''});
            return route.fulfill({status:200,contentType:'application/javascript',body:"window.turnstile={_n:0,_o:{},render(el,o){const id='w'+(++this._n);this._o[id]=o;el.setAttribute('data-widget',id);return id},execute(id){const o=this._o[id];setTimeout(()=>o.callback('sahte-'+o.action+'-'+Date.now()+'-'+(++this._n)),10)},reset(){},remove(){}}"})}
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
          const t=u.pathname.split('/').pop();istekler.push(t+'?'+u.searchParams.toString());
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
        // /oyun dalları (aynı oturum): göremediğim/olmayan oyun; süren oyun (roller gizli, kimse ölü görünmez, hikâye notu); bitmiş oyun
        const oyunSayfa=async id=>{await p5.goto(o3+'/oyun/'+id);await p5.waitForFunction(()=>document.querySelector('.not')||document.querySelector('#icerik .gun, #icerik h2'),null,{timeout:8000}); // not ya da içerik (tablo+hikâye birlikte eklenir)
          return p5.evaluate(()=>({not:[...document.querySelectorAll('.not')].map(n=>n.textContent).join(' '),icerik:document.getElementById('icerik').textContent,olu:document.querySelectorAll('#icerik tr.olu').length,satir:document.querySelectorAll('#icerik tr').length-1,gun:document.querySelectorAll('.gun').length,roller:[...document.querySelectorAll('#icerik td .tag')].map(t=>t.textContent)}))};
        const bos=await oyunSayfa(g9);assert.match(bos.not,/göremezsin/);assert.strictEqual(bos.icerik,'');
        const suren=await oyunSayfa(g4);assert.strictEqual(suren.not,'');assert.strictEqual(suren.satir,2);assert.deepStrictEqual(suren.roller,['?','?']);
        assert.strictEqual(suren.olu,0,'süren oyunda kimse ölü sınıfında olmamalı');assert.ok(!/💀/.test(suren.icerik),'süren oyunda kurukafa yok: '+suren.icerik);assert.match(suren.icerik,/Oyun sürüyor/);assert.match(suren.icerik,/Oyun bitince hikâye/);
        const biten=await oyunSayfa(g1);assert.strictEqual(biten.satir,2);assert.strictEqual(biten.olu,1);assert.deepStrictEqual(biten.roller,['Doktor','Hain']);assert.match(biten.icerik,/Ben \(sen\)/);assert.match(biten.icerik,/Masumlar kazandı/);
        assert.ok(biten.gun>=3,'bitmiş oyunda hikâye blokları: '+biten.gun);assert.match(biten.icerik,/Bot \(Hain\) Ben'in evine girdi/);assert.match(biten.icerik,/Kasaba Bot'u gönderdi \(Hain\)/);
        // /kasaba: tablo + son maçlar yalnız bu kurulumdan
        istekler.length=0;await p5.goto(o3+'/kasaba/'+k1);await p5.waitForFunction(()=>document.querySelector('.not')||[...document.querySelectorAll('#icerik h2')].some(h=>/Son maçlar/.test(h.textContent)),null,{timeout:8000});
        const ks=await p5.evaluate(()=>({t:document.querySelector('main').textContent,maclar:[...document.querySelectorAll('a[href^="/oyun/"]')].map(a=>a.getAttribute('href'))}));
        assert.match(ks.t,/Barış'ın Kasabası/);assert.match(ks.t,/Ben \(sen\)/);assert.ok(!/%/.test(ks.t),'yüzde yok');assert.deepStrictEqual(ks.maclar,['/oyun/'+g3,'/oyun/'+g1],'son maçlar: kasabanın bitmiş maçları, yeniden eskiye');
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
        await p6.fill('#hesapKod','123456');await p6.click('button.hesap-dogrula');
        await p6.waitForFunction(()=>/Hesabın: ben@ornek\.com/.test((document.querySelector('.hesap-durum')||{}).textContent||''),null,{timeout:8000});
        assert.ok(await p6.$('button.hesap-cikis'));assert.strictEqual(await p6.$('button.hesap-bagla'),null);assert.strictEqual(await p6.$('#hesapEposta'),null);
        assert.strictEqual(await p6.evaluate(()=>JSON.parse(localStorage.getItem('kg_token'))),jwtBagli,'kg_token bağlı oturuma geçer');
        assert.strictEqual(authIstekler.filter(a=>a.yol==='user').length,0,'istemci GoTrue /user ucunu doğrudan çağırmaz (şifre döndürme kalktı, bağlama sunucudan)');
        // hatırlatma yardımcısı: yalnız e-postasız kayıtlıda; son ekran bu yardımcıyı kullanır
        assert.deepStrictEqual(await p6.evaluate(()=>[hatirlatGoster({eposta:true},true,null),hatirlatGoster({eposta:true},true,'a@b.c'),hatirlatGoster({eposta:false},true,null),hatirlatGoster(null,false,null),hatirlatGoster({eposta:true},false,null)]),[true,false,false,false,false]);
        assert.ok(await p6.evaluate(()=>renderEndUI.toString().includes('hatirlatGoster(')&&renderEndUI.toString().includes('hesap-hatirlat')),'son ekran hatırlatması yardımcıya bağlı');
        await p6.click('button.hesap-cikis');await p6.waitForSelector('button.hesap-bagla',{timeout:8000});assert.deepStrictEqual(authIstekler.filter(a=>a.yol==='logout').map(a=>a.scope),['local'],'çıkış yalnız bu cihaz (scope=local)');assert.notStrictEqual(await p6.evaluate(()=>JSON.parse(localStorage.getItem('kg_token'))),jwtBagli,'çıkışta bağlı token gider; yenilemede yeni anonim oturum');
        await c6.close();
        step('e-posta: ikinci cihaz — kod ile gir, 2 oyunu ekle → /hesap/birlestir; Hayır → çağrı yok; yavaş Supabase → zaman aşımı metni');
        const c7=await newCtx();await c7.route(c5Rota.desen,c5Rota.isle);const p7=await open(c7,'İkinci',base3);
        await p7.waitForSelector('button.hesap-gir',{timeout:8000});await p7.click('button.hesap-gir');await p7.fill('#hesapEposta','ben@ornek.com');await p7.click('button.hesap-gonder');
        await kodBekle(p7,'gir');await p7.fill('#hesapKod','123456');await p7.click('button.hesap-dogrula');
        await p7.waitForSelector('.hesap-birlestir',{timeout:8000});assert.match(await p7.textContent('.hesap-birlestir'),/2 oyunu/);
        await p7.click('.hesap-birlestir button.ekle');
        await p7.waitForFunction(()=>/Hesabın: ben@ornek\.com/.test((document.querySelector('.hesap-durum')||{}).textContent||'')&&!document.querySelector('.hesap-birlestir'),null,{timeout:10000});
        assert.strictEqual(birlesmeler.length,2,'RPC + admin silme');{ const o=icIstekler.filter(i=>i.yol==='/auth/v1/otp');assert.ok(o.length>=1,'gir: sunucu POST /auth/v1/otp');assert.deepStrictEqual(o[o.length-1].govde,{email:'ben@ornek.com',create_user:false}) }assert.strictEqual(birlesmeler[0].url,'http://127.0.0.1:1/rest/v1/rpc/hesap_birlestir');assert.deepStrictEqual(birlesmeler[0].govde,{eski:ben,yeni:ben2});assert.strictEqual(birlesmeler[1].yontem,'DELETE');
        await c7.close();
        const c8=await newCtx();await c8.route(c5Rota.desen,c5Rota.isle);const p8=await open(c8,'İkinci-hayır',base3);
        await p8.waitForSelector('button.hesap-gir',{timeout:8000});await p8.click('button.hesap-gir');await p8.fill('#hesapEposta','ben@ornek.com');await p8.click('button.hesap-gonder');
        await kodBekle(p8,'gir-hayır');await p8.fill('#hesapKod','123456');await p8.click('button.hesap-dogrula');await p8.waitForSelector('.hesap-birlestir',{timeout:8000});
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
      assert.ok(r.w<0.6,'çekmece sahnenin yarısından azını kaplar');assert.strictEqual(r.roller,Object.keys(await rp.evaluate(()=>ROLES)).length,'tüm roller listelenir');assert.ok(r.dagilim);assert.strictEqual(r.ben,false);assert.strictEqual(r.gizli,false);
      await rp.evaluate(()=>{document.querySelector('.rehber').scrollTop=180});await rp.waitForTimeout(3200);assert.ok(await rp.evaluate(()=>document.querySelector('.rehber').scrollTop)>100,'rehber kaydırması render ile sıfırlanmamalı');
      await rp.click('.rehber .kapat');assert.strictEqual(await rp.$('.rehber'),null);
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
      { const gecer=await sp.evaluate(()=>{const d=document.querySelector('.chat .log div');if(!d)return 'yok';const r=d.getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !(e&&e.closest('.chat .log'))});
        assert.strictEqual(gecer,true,'sohbet günlüğü satırı dokunmayı yutmamalı (altındaki ev/çimen seçilebilir)')}
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

    assert.deepStrictEqual(errors,[],'sayfa hataları');
    console.log('\nE2E: tüm adımlar geçti');
  }finally{
    await browser.close();await new Promise(r=>srv.close(r));
  }
})().catch(e=>{console.error('\nE2E BAŞARISIZ:',e&&e.stack||e);process.exit(1)});
