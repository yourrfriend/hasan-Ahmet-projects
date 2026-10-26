'use strict';
// Gerçek deneme (test değil, elle çalıştırılır): Playwright ev sahibi (telefon yatay 844×390) bir oda kurar, test/bot.js botları katılır,
// tam bir maç oynanır; fazlar, sabah haberleri, sohbet sistem satırları (eşya/paket), kasa sonucu, maç sonu eşya özeti ve sayfa hataları yazılır.
//   BASE=https://kasaba-test.munupixi.com OYUNCU=7 ESYA=1 OUT=/tmp/deneme NODE_PATH="$(npm root -g)" node test/deneme.js
//   BASE yoksa yerel sunucu (http://127.0.0.1:${PORT||8787}); OUT'a deneme-paket.png ve deneme-son.png kaydedilir.
//   Playwright'ın Chromium'u yoksa PW_CHROMIUM=/usr/bin/google-chrome (kontrol.sh --e2e ile aynı arama).
// Ev sahibi: rol kartını kapatır, hainse öldürür, gece eşyasını kullanır, kum saatini çevirir, ilk paketi kapar, oylamada çekimser.
const path=require('path');const fs=require('fs');const os=require('os');const {spawn}=require('child_process');const {chromium}=require('playwright');
const BASE=(process.env.BASE||'http://127.0.0.1:'+(process.env.PORT||8787)).replace(/\/$/,'');
const WS_URL=BASE.replace(/^http/,'ws')+'/ws';const OYUNCU=+process.env.OYUNCU||7;const ESYA=!!process.env.ESYA;
const OUT=process.env.OUT||fs.mkdtempSync(path.join(os.tmpdir(),'deneme-'));fs.mkdirSync(OUT,{recursive:true});
(async()=>{
  const browser=await chromium.launch(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{});
  const ctx=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true});const p=await ctx.newPage();
  const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(BASE+'/');await p.waitForTimeout(4000);
  log('sürüm',await p.evaluate(()=>window.KG_VER),'kayıtlı',await p.evaluate(()=>!!(typeof hesap!=='undefined'&&hesap&&hesap.uuid)));
  await p.click('text=Yeni oda kur');await p.fill('#nameInput','Ev');await p.click('text=Lobiye gir');await p.waitForFunction(()=>typeof P!=='undefined'&&P.room);
  const oda=await p.evaluate(()=>P.room);log('oda',oda,'botlar',OYUNCU,'eşya modu',ESYA);
  await p.evaluate(e=>{settings={night:20,talk:25,vote:15,esyaModu:e};send({t:'settings',...settings})},ESYA);
  const bot=spawn(process.execPath,[path.join(__dirname,'bot.js'),oda,String(OYUNCU)],{env:{...process.env,WS_URL},stdio:['ignore','pipe','inherit']});
  bot.stdout.on('data',d=>{for(const t of String(d).trim().split('\n'))if(/eşya|paket|iddia|hata/.test(t))log('bot:',t)});
  try{
    await p.waitForFunction(n=>P.lobby&&P.lobby.length===n,OYUNCU+1,{timeout:30000});await p.waitForTimeout(1500);
    if(ESYA)log('lobi eşyası:',await p.evaluate(()=>JSON.stringify(lobiEsya)));
    await p.evaluate(()=>send({t:'start',settings}));await p.waitForFunction(()=>P.phase==='night');
    log('başladı; rol',await p.evaluate(()=>priv.role&&priv.role.label),'eşya',await p.evaluate(()=>JSON.stringify(priv.esya)));
    let son='',t0=Date.now(),paketGorulen=false;const satir=new Set();
    while(Date.now()-t0<10*60000){
      const d=await p.evaluate(()=>({ph:P.phase,day:P.day,me:(P.players||[]).find(x=>x.id===myId),imp:priv.role&&priv.role.team==='imp',esya:priv.esya,act:local.act,vote:local.vote,paket:P.paket,
        sys:(P.chat||[]).filter(m=>m.sys&&/📦|⏳|🗣️|Rolüm/.test(m.t||'')).map(m=>m.t),kisa:(P.chat||[]).filter(m=>m.kisa==='rol').length}));
      for(const c of d.sys)if(!satir.has(c)){satir.add(c);log('sohbet:',c)}
      const k=d.ph+d.day;if(k!==son){son=k;log('faz',k,ESYA?'eşya '+JSON.stringify((d.esya||[]).map(e=>e.key+(e.kullanildi?'✓':''))):'');
        if(d.ph==='talk')log('haber:',await p.evaluate(()=>(P.morning&&P.morning.news||[]).join(' | ')));if(d.ph==='vote')log('rol iddiası sayısı:',d.kisa)}
      if(d.ph==='end')break;
      if(d.ph==='night'&&d.me&&d.me.alive){await p.evaluate(()=>{const ok=[...document.querySelectorAll('button')].find(b=>b.textContent==='Anladım');if(ok)ok.click()});
        const e=(d.esya||[]).find(x=>!x.kullanildi&&!x.pasif&&x.key!=='fis'&&x.key!=='kum');const patch={};
        if(d.imp&&!(d.act&&d.act.kill))patch.kill=true;if(e&&!(d.act&&d.act.esya))patch.esya=e.key;
        if(patch.kill||patch.esya){await p.evaluate(x=>{const h=P.players.find(y=>y.alive&&y.id!==myId);const q={};if(x.kill)q.kill=h.id;if(x.esya){q.esya=x.esya;q.esyaHedef=ESYA[x.esya].hedef?h.id:null}submitAct(q)},patch);if(patch.esya)log('ev sahibi eşya:',patch.esya)}}
      if(d.ph==='talk'&&d.me&&d.me.alive){if((d.esya||[]).some(x=>x.key==='kum'&&!x.kullanildi)){await p.evaluate(()=>send({t:'esya',k:'kum',d:P.day,g:P.gameId}));log('ev sahibi kum çevirdi')}
        if(d.paket&&!paketGorulen){paketGorulen=true;log('paket:',JSON.stringify(d.paket));await p.screenshot({path:path.join(OUT,'deneme-paket.png')});
          await p.evaluate(()=>{const g=document.querySelector('svg .paket');if(g)g.dispatchEvent(new MouseEvent('click',{bubbles:true}))});await p.waitForTimeout(800);log('kap sonrası eşya:',await p.evaluate(()=>JSON.stringify((priv.esya||[]).map(e=>e.key))))}}
      if(d.ph==='vote'&&d.me&&d.me.alive&&!d.vote)await p.evaluate(()=>castVote('skip'));
      await p.waitForTimeout(700)}
    log('bitti:',await p.evaluate(()=>P.phase+' '+(P.winner&&P.winner.t)));
    await p.waitForFunction(()=>typeof kasaSonuc!=='undefined'&&kasaSonuc,null,{timeout:15000}).then(async()=>log('kasa:',await p.evaluate(()=>JSON.stringify(kasaSonuc)))).catch(()=>log('kasa: yok (kayıt kapalı ya da misafir)'));
    if(ESYA)log('maç sonu eşyalar:',await p.evaluate(()=>JSON.stringify((P.ozet&&P.ozet.oyuncular||[]).map(o=>o.ad+':'+(o.esyalar||[]).map(e=>e.key+(e.kullanildi?'✓':'✗')).join(',')))));
    log('gazete:',await p.evaluate(()=>JSON.stringify((P.gazete||[]).map(c=>c.metin))));
    await p.waitForTimeout(9000);await p.screenshot({path:path.join(OUT,'deneme-son.png')});
    log('ekran görüntüleri',OUT,'· sayfa hataları',errs.length?errs:'yok');
  }finally{bot.kill();await browser.close()}
  if(errs.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
