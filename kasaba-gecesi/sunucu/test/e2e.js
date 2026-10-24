'use strict';
// Uçtan uca test: gerçek tarayıcı sekmeleri aynı odaya girer ve oynar.
//   npm run e2e   (Playwright ve Chromium gerekir: npm i -g playwright && npx playwright install chromium)
// Kontrol edilenler: davet linkiyle katılma, rol dağıtımı, gece hamlesi, ev sahibi sekmesi kapanınca
// oyunun sürmesi ve yetkinin devri, sohbet, gizli oy, bağlantı kopunca rozet + yeniden bağlanma,
// kopan oyuncunun (ve eski ev sahibinin) aynı linkle rolüyle geri dönmesi, oyunun iptali.
process.env.HOST_GRACE_MS=process.env.HOST_GRACE_MS||'1500';
const assert=require('node:assert');
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.error('Playwright bulunamadı: npm i -g playwright && npx playwright install chromium');process.exit(2)}
const {createServer}=require('../server.js');

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
    step('ev sahibi oda kurar');
    const hostCtx=await newCtx();let host=await open(hostCtx,'Ev',base);
    await host.click('text=Yeni oda kur');await host.fill('#nameInput','Ev');await host.click('text=Lobiye gir');
    await host.waitForSelector('.lobbybar code');
    const link=await host.textContent('.lobbybar code');assert.match(link,/\?oda=[a-z0-9]{6}$/);

    step('3 oyuncu davet linkiyle katılır');
    const ctxs={},pages={};
    for(const n of ['Ali','Ayse','Can']){ctxs[n]=await newCtx();pages[n]=await open(ctxs[n],n,link);await pages[n].fill('#nameInput',n);await pages[n].click('text=Lobiye gir')}
    await host.waitForFunction(()=>/4 \/ 12/.test(document.querySelector('.count').textContent));
    assert.strictEqual(await pages.Ali.$('.start'),null,'ev sahibi olmayanda başlat düğmesi olmamalı');

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
    let acted=0;
    for(const p of all()){
      // gerçek tıklama, ekrandaki konuma: evin üstünü örten bir katman varsa (gece karartması, ipucu) burada yakalanır
      const at=await p.evaluate(()=>{if(!canTarget())return null;const t=P.players.find(x=>x.id!==myId);const g=scene.houses[t.id].g;if(!g.onclick)throw new Error('ev tıklanamıyor');const r=g.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});
      if(!at)continue;
      await p.mouse.click(at.x,at.y);acted++;
    }
    await host.waitForTimeout(300);
    assert.ok(acted>0&&Object.keys(R.g.acts).length===acted,'sunucu gece hamlelerini almalı ('+acted+' / '+Object.keys(R.g.acts).length+')');

    step('ev sahibi sekmesini kapatır; oyun sürer');
    await hostCtx.close();
    roomOf().game.P.ends=Date.now()-1;
    const watcher=pages.Ali;
    await watcher.waitForFunction(()=>P.phase!=='night',null,{timeout:5000});
    assert.ok(['talk','end'].includes(await phase(watcher)));

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

      step('bağlantı kopar: rozet görünür, kendiliğinden döner');
      const lost=pages[aliveNames[0]];
      await lost.evaluate(()=>ws.close());
      await lost.waitForSelector('.ov.offline',{timeout:3000});
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
    }

    step('kopan oyuncu aynı linkle döner, rolü aynı');
    await pages.Can.close();
    pages.Can=await open(ctxs.Can,'Can',link);
    await pages.Can.waitForSelector('.ov.mine',{timeout:10000});
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

    step('yeni ev sahibi oyunu iptal eder, herkes lobiye döner');
    pages[newHostName].on('dialog',d=>d.accept());
    await pages[newHostName].click('.gear');await pages[newHostName].click('text=Oyunu iptal et');
    for(const p of [host,...Object.values(pages)])await p.waitForFunction(()=>P.phase==='lobby'&&!priv.role,null,{timeout:5000});

    assert.deepStrictEqual(errors,[],'sayfa hataları');
    console.log('\nE2E: tüm adımlar geçti');
  }finally{
    await browser.close();await new Promise(r=>srv.close(r));
  }
})().catch(e=>{console.error('\nE2E BAŞARISIZ:',e&&e.stack||e);process.exit(1)});
