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
    { const ayar=await (await fetch(base+'ayar.json')).json();assert.deepStrictEqual(ayar,{url:null,anonKey:null,kurulum:null,kayit:false});
      const s3=createServer({quiet:true,tickMs:100,ayar:{url:'http://127.0.0.1:1',anonKey:'anon',serviceKey:'srv',jwtSecret:'x',kurulum:'e2e'}});
      await new Promise(r=>s3.server.listen(0,'127.0.0.1',r));const base3='http://127.0.0.1:'+s3.server.address().port+'/';
      const c3=await newCtx();const p3=await open(c3,'Kimlik',base3);const t0=Date.now();
      await p3.waitForSelector('.kimlik-notu',{timeout:5000});assert.match(await p3.textContent('.kimlik-notu'),/Misafir/);
      await p3.click('text=Yeni oda kur');await p3.fill('#nameInput','K');await p3.click('text=Lobiye gir');
      await p3.waitForFunction(()=>/oda=[a-z0-9]{12}/.test((document.querySelector('.lobbybar code')||{}).textContent||''),null,{timeout:6000});
      assert.ok(Date.now()-t0<9000,'ulaşılmaz Supabase oyunu bekletmemeli');assert.strictEqual(await p3.evaluate(()=>kayitli),false);
      await c3.close();await new Promise(r=>s3.close(r)); }

    step('ev sahibi oda kurar');
    const hostCtx=await newCtx();let host=await open(hostCtx,'Ev',base);
    await host.click('text=Yeni oda kur');await host.fill('#nameInput','Ev');await host.click('text=Lobiye gir');
    await host.waitForSelector('.lobbybar code');
    const link=await host.textContent('.lobbybar code');assert.match(link,/\?oda=[a-z0-9]{12}$/);
    assert.strictEqual(await host.evaluate(()=>kayitli),false);assert.strictEqual(await host.$('.kimlik-notu'),null,'kayıt kapalı kurulumda kimlik notu yok');

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
    let acted=0;const actors=[];
    for(const p of all()){
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
      await pages[newHostName].click('.endcard button.lobi');
      for(const p of [host,...Object.values(pages)])await p.waitForFunction(()=>P.phase==='lobby'&&!priv.role,null,{timeout:5000});
      assert.strictEqual((await watcher.$$('.lobby-skor .cip')).length,4,'lobide bu akşamın skoru görünmeli');
    }

    assert.deepStrictEqual(errors,[],'sayfa hataları');
    console.log('\nE2E: tüm adımlar geçti');
  }finally{
    await browser.close();await new Promise(r=>srv.close(r));
  }
})().catch(e=>{console.error('\nE2E BAŞARISIZ:',e&&e.stack||e);process.exit(1)});
