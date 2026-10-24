# Geçmiş 1/6 — Olay Günlüğü, Oyun Sonu Özeti ve "Tekrar oyna" Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Oyun sırasında olayları `R.log`'a yazmak; oyun bitince bu günlükten herkese açık maç özeti (`P.ozet`) ve kişiye özel "senin payın" (`priv.payin`) üretmek; oyun sonu ekranına özet kartı ve "Tekrar oyna" eklemek. Supabase yok; tek başına canlıya alınabilir.

**Architecture:** `game.js` ağdan bağımsız kalır: `logEv(R,tur,veri)` olayları `R.log`'a (gizli, `P`'ye girmez) ekler; `checkWin` günlükten `P.ozet`'i, `privFor` `payin`'i türetir. `server.js` her `flush`'ta `R.log`'u boşaltıp `kayit.js`'e verir; bu aşamada `kayit.js` olayları atan bir yuvadır (4. aşama Supabase'e yazacak). İstemci `renderEndUI` içinde `P.ozet` ve `priv.payin`'i gösterir, "Tekrar oyna" mevcut `cancel` mesajını yollar.

**Tech Stack:** Node 20 (`node:test`), `ws`; istemci tek dosya `index.html`; e2e Playwright (`kontrol.sh --e2e`).

**Spec:** `docs/superpowers/specs/2026-10-24-kasaba-gecesi-gecmis-design.md` (§5.1, §5.4, §5.5 "game.js" satırı, §5.7 "Oyun sonu", §5.9, §6 aşama 1)

## Global Constraints

- `game.js` Supabase'i, ağı ve `server.js`'i bilmez; `R.log` hiçbir yayında (`state`, `priv`) geçmez (`SECRET_KEYS`'e `log` eklenir).
- Olaylarda oyuncular `pubId` ile geçer (`P.players[].id`); gizli anahtar geçmez.
- Tek tek oylar **yazılmaz**; `gunduz_sonuc` yalnız toplamları taşır (spec §2).
- `index.html` değişince `window.KG_VER` artar (`'2026-10-24d'` → `'2026-10-25a'`).
- Sahne/animasyon/ses bölümlerine dokunulmaz; değişiklik yalnız `renderEndUI` ve ilgili CSS'te.
- Arayüz metinleri Türkçe ve kısa; mevcut üslup.
- Her değişiklikten sonra `.claude/skills/kasaba-gecesi/scripts/kontrol.sh`; arayüz değişince `--e2e`.
- Commit mesajları İngilizce, sonunda `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **Oyun iptal edilince** (`cancel` → `endToLobby`): `iptal` olayı yazılır, `P.ozet` yoktur, istemci lobide özet aramaz ve çökmez. → Task 1 (iptal testi), Task 4 (e2e lobiye dönüş zaten var).
2. **Oyun bittikten sonra yeniden bağlanan oyuncu**: `P.ozet` `state` ile, `payin` `priv` ile gelir; ekran aynı. → Task 3 (server testi: yeniden bağlanan istemci `priv.payin` alır).
3. **Hırsız rol çaldığında**: özet son rolü "(Hırsız çaldı)" ile, `payin.oldurdu` kurbanı içerir. → Task 2 testi.
4. **Deli**: hamleleri etkisizdir; `gece_hamle` yazılmaz (etkin hamle değildir), `payin` boş kalır; özet "(aslında Deli)" der. → Task 2 testi.
5. **Oyun gece ölümleriyle biter** (`checkWin` `resolveNight` içinde): sıra `gece_sonuc` → `bitis`, `gunduz_sonuc` yazılmaz; özetteki ölüm bilgisi o geceyi gösterir. → Task 1 testi.

---

### Task 1: `R.log` ve olaylar (`game.js`)

**Files:**
- Modify: `kasaba-gecesi/sunucu/game.js` (`createGame`, `startGame`, `resolveNight`, `resolveVote`, `checkWin`, `endToLobby`, dışa aktarma)
- Test: `kasaba-gecesi/sunucu/test/game.test.js`

**Interfaces:**
- Produces: `R.log: Array<{sira:number, gun:number, faz:'lobby'|'night'|'talk'|'vote'|'end', tur:string, veri:object}>`; `sira` 1'den başlar, oyun başına artar (`R.logSeq`). `startGame` `R.log=[]` **yapmaz** (sunucu boşaltır); `createGame` `log:[]`, `logSeq:0` ile başlar.
- Olay türleri ve `veri` (spec §5.4, `kim`/`hedef`/`ev` alanları `pubId`):
  - `baslangic`: `{ayarlar, roller:[{n,team}] (P.roleList), oyuncular:[{id,ad,renk,sapka}]}`
  - `gece_hamle`: `{kim, tur:'kill'|'ab'|'self'|'det'|'guess', hedef|null, tahmin|null}` — yalnız **etkin** hamleler: `resolveNight` içindeki `acts` (hainde öldürme seçildiyse yetenek düşmüş hali); `eff(kim)===null` (deli) olanlar yazılmaz; `tgt()` null dönenler yazılmaz; `guess`: büyücü için `tur:'guess'`, `hedef`, `tahmin`.
  - `gece_sonuc`: `{ziyaretler:{[ev]:[kim]}, tutulan:[kim], tuzak:[{kim, ev, kuran}], kurtarilan:[kim], yelek:[kim], olenler:[{kim, sekil, kimden:[id], kimden_ad, rol}], caldi:{hirsiz, kurban, yeni_rol}|null, bombalar:[ev], yildirim:[kim], ispiyon:[{kim, hedef, rol}], provokasyon:hedef|null, mum:[{kim, ev}], haberler:[string]}` — `tutulan` = polisin evde tuttukları (tuzağa yakalananlar hariç); `olenler.sekil` = `causes[v]`; `kimden` = `at.ids`, `kimden_ad` = `at.by`; `rol` = sabah gösterilen rol (`shown`).
  - `gunduz_sonuc`: `{asilan:id|null, rol_goruntu:string|null, toplamlar:{[id]:number}, cekimser:number, provoke:id|null}`
  - `bitis`: `{kazanan:team|null, kazanan_metin, sag_kalanlar:[ad], hortlak_kazananlar:[ad], acilis:P.reveal}`
  - `iptal`: `{gun, faz}` — yalnız `endToLobby` oyun sürerken çağrılırsa (`R.g` varken ve `P.phase` `night|talk|vote`).
- `logEv(R,tur,veri)` dışa aktarılmaz; test `R.log`'u okur.

- [ ] **Step 1: Başarısız testleri yaz** (`test/game.test.js` sonuna)

```js
test('olay günlüğü: başlangıç, etkin gece hamleleri, gece ve gündüz sonucu, bitiş; sıra artar',()=>{
  const R=fixed(['hain','doktor','masum','masum','masum']);
  assert.strictEqual(R.log[0].tur,'baslangic');assert.strictEqual(R.log[0].veri.oyuncular.length,5);
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.act(R,'u3',{ab:'u4'}); // u3 masum: yeteneği yok, yazılmaz
  G.advance(R);
  assert.deepStrictEqual(R.log.filter(e=>e.tur==='gece_hamle').map(e=>[e.veri.kim,e.veri.tur,e.veri.hedef]),[['u0','kill','u2'],['u1','ab','u2']]);
  const gs=R.log.find(e=>e.tur==='gece_sonuc');assert.strictEqual(gs.gun,1);assert.strictEqual(gs.faz,'night');
  assert.deepStrictEqual(gs.veri.kurtarilan,['u2']);assert.deepStrictEqual(gs.veri.olenler,[]);assert.deepStrictEqual(gs.veri.ziyaretler.u2.sort(),['u0','u1']);
  G.advance(R);for(const id of ['u1','u2','u3','u4'])G.vote(R,id,'u0');G.vote(R,'u0','skip');
  const gd=R.log.find(e=>e.tur==='gunduz_sonuc');assert.strictEqual(gd.veri.asilan,'u0');assert.deepStrictEqual(gd.veri.toplamlar,{u0:4});assert.strictEqual(gd.veri.cekimser,1);
  const b=R.log[R.log.length-1];assert.strictEqual(b.tur,'bitis');assert.strictEqual(b.veri.kazanan,'inn');assert.strictEqual(b.veri.acilis.length,5);
  assert.ok(R.log.every((e,i)=>e.sira===i+1),'sıra 1..n');
  noLeak(R.P);assert.ok(!JSON.stringify(R.P).includes('"log"'));
});
test('olay günlüğü: tuzak, tutma ve ölüm ayrıntıları; gece bitince sıra gece_sonuc → bitis',()=>{
  // u0 hain u3'e gider, u1 tuzakçı u3'ün kapısında, u2 polis u4'ü tutar
  let R=fixed(['hain','tuzakci','polis','masum','masum']);
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u3'});G.act(R,'u2',{ab:'u4'});G.advance(R);
  let gs=R.log.find(e=>e.tur==='gece_sonuc');
  assert.deepStrictEqual(gs.veri.tuzak,[{kim:'u0',ev:'u3',kuran:'u1'}]);assert.deepStrictEqual(gs.veri.tutulan,['u4']);
  // 2 hain + 2 masum: bir masum ölünce hain >= diğerleri → oyun gece biter (checkWin resolveNight içinde)
  R=fixed(['hain','hain','masum','masum']);G.act(R,'u0',{kill:'u2'});G.advance(R);
  assert.strictEqual(R.P.phase,'end');
  const turler=R.log.map(e=>e.tur);assert.deepStrictEqual(turler.slice(-2),['gece_sonuc','bitis']);
  gs=R.log.find(e=>e.tur==='gece_sonuc');assert.deepStrictEqual(gs.veri.olenler,[{kim:'u2',sekil:'stab',kimden:['u0'],kimden_ad:'Hain',rol:'Masum'}]);
});
test('olay günlüğü: iptal yazılır, lobide ve bitmiş oyunda yazılmaz',()=>{
  const R=fixed(['hain','masum','masum','masum']);G.advance(R);G.endToLobby(R);
  const son=R.log[R.log.length-1];assert.strictEqual(son.tur,'iptal');assert.deepStrictEqual(son.veri,{gun:1,faz:'talk'});
  const n=R.log.length;G.endToLobby(R);assert.strictEqual(R.log.length,n,'lobideyken iptal yazılmaz');
});
```

`SECRET_KEYS` dizisine `'log'` ekle.

- [ ] **Step 2: Testlerin başarısız olduğunu gör**

Run: `cd kasaba-gecesi/sunucu && node --test test/game.test.js 2>&1 | grep -E '^not ok|# fail'`
Expected: 3 `not ok` (R.log undefined).

- [ ] **Step 3: `game.js`'e günlüğü ekle**

- `createGame`: dönen nesneye `log:[],logSeq:0`.
- `function logEv(R,tur,veri){R.log.push({sira:++R.logSeq,gun:R.P.day||0,faz:R.P.phase,tur,veri})}` (`startGame` içinde `P` yeni atandıktan sonra çağrılır ki `gun:1, faz:'night'` olsun).
- `startGame`: sonunda `logEv(R,'baslangic',{ayarlar:settings,roller:R.P.roleList,oyuncular:players.map(p=>({id:p.id,ad:p.name,renk:p.color,sapka:p.hat}))})`.
- `resolveNight`: 3. adımdan (ziyaretler) önce etkin hamleleri yaz: `al` üzerinde `acts` ile; polis/tuzakçı `ab` hedefleri `tgt(id,'ab')` ile aynı kuralla. `gece_sonuc` için `tutulan`'ı toplarken trap kaynaklı `blocked` girişlerini ayır: `tuzak` listesini `nt(traps[t], …yakalandı)` yazılan yerlerde doldur, `tutulan` = cops döngüsünde `blocked.add(t)` yapılanlar. `olenler` `died` döngüsünde `at` elindeyken toplanır (`rol` 7. adımdaki `shown`). `gece_sonuc` `P.morning=M` satırından hemen sonra, `checkWin`'den önce yazılır.
- `resolveVote`: `P.evening=E` satırından sonra, `checkWin`'den önce `gunduz_sonuc`.
- `checkWin`: `P.reveal` atandıktan sonra `bitis` (`gun:P.day`, `faz:'end'` için `logEv`'i `P.phase='end'` atamasından sonra çağır).
- `endToLobby`: `if(R.g&&['night','talk','vote'].includes(R.P.phase))logEv(R,'iptal',{gun:R.P.day,faz:R.P.phase})` sonra mevcut sıfırlama.

- [ ] **Step 4: Testleri çalıştır**

Run: `node --test test/game.test.js 2>&1 | grep -E '^not ok|# (pass|fail)'`
Expected: `# fail 0` (rastgele oyun testleri de geçer; `noLeak` `log` anahtarını `P`'de aramaz çünkü `log` `R`'de).

- [ ] **Step 5: Commit**

```bash
git add kasaba-gecesi/sunucu/game.js kasaba-gecesi/sunucu/test/game.test.js
git commit -m "Kasaba Gecesi: game event log (R.log)"
```

---

### Task 2: `P.ozet` ve `priv.payin` (`game.js`)

**Files:**
- Modify: `kasaba-gecesi/sunucu/game.js` (`checkWin`, `privFor`, `EMPTY_PRIV`)
- Test: `kasaba-gecesi/sunucu/test/game.test.js`

**Interfaces:**
- Consumes: Task 1 `R.log` (`gece_sonuc.olenler`, `gunduz_sonuc.asilan`, `tuzak`, `tutulan`, `kurtarilan`, `caldi`).
- Produces:
  - `P.ozet = {kazanan:{takim:team|null, metin:string}, oyuncular:[{id, ad, rol, takim, sag:boolean, olum:{gun, faz:'gece'|'gunduz', sekil:string|null, kimden:[id]}|null}]}` — `rol`/`takim` `P.reveal` ile aynı metin ve takım; `olum.sekil` gece için `olenler.sekil`, gündüz için `'asildi'`; yalnız `phase==='end'`de vardır.
  - `privFor(R,id).payin = {oldurdu:[ad], kurtardi:[ad], yakaladi:[ad], tuttu:[ad]}` — `phase==='end'` değilse `null`. `oldurdu`: `olenler` içinde `kimden` `id`'yi içerenler (hırsızın kaybolan kurbanı dahil); `kurtardi`: `kurtarilan` içinde o gece `id`'nin `gece_hamle` `ab` hedefi olanlar (doktor); `yakaladi`: `tuzak.kuran===id` olanların `kim`'i; `tuttu`: o gece `id`'nin `ab` hedefi `tutulan`'daysa.
  - `EMPTY_PRIV` `payin:null` alanı alır.

- [ ] **Step 1: Başarısız testleri yaz**

```js
test('oyun sonu özeti ve senin payın günlükten türer',()=>{
  const R=fixed(['hain','doktor','tuzakci','masum','masum']);
  G.act(R,'u0',{kill:'u3'});G.act(R,'u1',{ab:'u3'});G.act(R,'u2',{ab:'u4'});G.advance(R); // doktor u3'ü kurtarır
  G.advance(R);for(const id of ['u0','u1','u2','u3'])G.vote(R,id,'u4');G.vote(R,'u4','skip'); // u4 asılır
  G.act(R,'u0',{kill:'u2'});G.advance(R); // gece 2: tuzakçı ölür → 1 hain, 2 masum → sürer
  G.advance(R);for(const id of ['u1','u3'])G.vote(R,id,'u0');G.vote(R,'u0','u1'); // hain asılır → masumlar
  assert.strictEqual(R.P.phase,'end');
  const oz=R.P.ozet;assert.deepStrictEqual(oz.kazanan,{takim:'inn',metin:'Masumlar kazandı!'});
  const by=Object.fromEntries(oz.oyuncular.map(o=>[o.id,o]));
  assert.deepStrictEqual(by.u4.olum,{gun:1,faz:'gunduz',sekil:'asildi',kimden:[]});
  assert.deepStrictEqual(by.u2.olum,{gun:2,faz:'gece',sekil:'stab',kimden:['u0']});
  assert.strictEqual(by.u1.olum,null);assert.strictEqual(by.u1.sag,true);assert.strictEqual(by.u0.rol,'Hain');
  assert.deepStrictEqual(G.privFor(R,'u0').payin,{oldurdu:['Oyuncu2'],kurtardi:[],yakaladi:[],tuttu:[]});
  assert.deepStrictEqual(G.privFor(R,'u1').payin.kurtardi,['Oyuncu3']);
  noLeak(R.P);
});
test('payin oyun bitmeden null; hırsız ve deli özette doğru görünür',()=>{
  let R=fixed(['hain','masum','masum','masum']);assert.strictEqual(G.privFor(R,'u0').payin,null);assert.strictEqual(R.P.ozet,undefined);
  R=fixed(['hirsiz','hain','doktor','masum','masum','masum','masum']);
  G.act(R,'u0',{ab:'u2'});G.advance(R); // hırsız doktorun rolünü çalar
  assert.strictEqual(R.g.roles.u0.key,'doktor');
  // kalan oyunu hızlıca bitir: hain ve hırsız (artık doktor) dışında herkes gece ölmüş gibi
  for(const id of ['u3','u4','u5','u6'])G.pl(R,id).alive=false;
  G.advance(R);G.advance(R); // talk → vote → çözüm (kimse oy vermez) → checkWin
  assert.strictEqual(R.P.phase,'end');
  const o=Object.fromEntries(R.P.ozet.oyuncular.map(o=>[o.id,o]));
  assert.match(o.u0.rol,/Hırsız çaldı/);assert.deepStrictEqual(G.privFor(R,'u0').payin.oldurdu,['Oyuncu2']);
  R=fixed(['hain','deli','masum','masum','masum']);R.g.roles.u1.mad='doktor';
  G.act(R,'u0',{kill:'u2'});G.act(R,'u1',{ab:'u2'});G.advance(R);
  assert.ok(!R.log.some(e=>e.tur==='gece_hamle'&&e.veri.kim==='u1'),'deli hamlesi etkin değildir');
});
```

- [ ] **Step 2: Başarısız olduğunu gör**

Run: `node --test test/game.test.js 2>&1 | grep -E '^not ok|# fail'`
Expected: 2 `not ok`.

- [ ] **Step 3: Uygula**

- `function ozetFor(R)` (dışa aktarılmaz): `P.reveal` + `R.log` üzerinden `P.ozet`; `checkWin` içinde `P.reveal` atamasından sonra `P.ozet=ozetFor(R)`, `bitis` olayından önce.
- `function payinFor(R,id)`: `R.log` üzerinden; `privFor` dönüşüne `payin:P.phase==='end'?payinFor(R,id):null`. Adlar `nameOf(R,…)`.
- İkinci testteki hızlı bitirme için kurallarda değişiklik gerekmez (`resolveVote` oy yoksa kimseyi asmaz, `checkWin` sayar).

- [ ] **Step 4: Testler**

Run: `node --test test/game.test.js 2>&1 | grep -E '^not ok|# (pass|fail)'`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add kasaba-gecesi/sunucu/game.js kasaba-gecesi/sunucu/test/game.test.js
git commit -m "Kasaba Gecesi: end-of-game summary (P.ozet) and personal share (payin)"
```

---

### Task 3: Günlüğü boşaltan yuva (`kayit.js`) ve sunucu bağlantısı

**Files:**
- Create: `kasaba-gecesi/sunucu/kayit.js`
- Modify: `kasaba-gecesi/sunucu/server.js` (`flush`, `createServer` seçenekleri)
- Test: `kasaba-gecesi/sunucu/test/server.test.js`

**Interfaces:**
- Produces: `kayit.js` → `module.exports={olustur(opts)}`; `olustur({})` → `{kuyrukla(room, olaylar), kapat()}`. Bu aşamada `kuyrukla` olayları **atar** ve `sayac` artırır (`{kuyrukla, kapat, sayac:{olay:0}}`); 4. aşama aynı imzayla Supabase'e yazar.
- `createServer(opts)` yeni seçenek: `opts.kayit` (verilmezse `require('./kayit.js').olustur({})`). Testler bellekte biriktiren sahte `kayit` verir.
- `flush(room)`: yayın yapmadan **önce** `if(R.log.length)kayit.kuyrukla(room,R.log.splice(0))`. `deleteRoom` da aynı boşaltmayı yapar (oda kapanırken kuyrukta kalan olmasın).
- `close(cb)`: `kayit.kapat()` çağırır.

- [ ] **Step 1: Başarısız testi yaz** (`server.test.js`; `createServer({quiet:true,tickMs:50,kayit:sahte})` için `test.before`'daki sunucuyu kullanmak yerine bu testte ayrı bir sunucu aç)

`client()` yardımcısını `client(uid,name,join,b=base)` yap (`new WebSocket('ws://'+b+'/ws')`). Sonra:

```js
test('sunucu olay günlüğünü her flush\'ta kayit\'a verir; log bellekte birikmez; biten oyunda priv.payin gelir',async()=>{
  const alinan=[];const sahte={kuyrukla:(room,ol)=>{alinan.push(...ol)},kapat(){}};
  const s2=createServer({quiet:true,tickMs:50,kayit:sahte});await new Promise(r=>s2.server.listen(0,'127.0.0.1',r));
  const b2='127.0.0.1:'+s2.server.address().port;
  const host=client('g0','A',{host:true},b2);await host.until(c=>c.P&&c.P.room);const room=host.P.room;
  const cs=[host,...['g1','g2','g3'].map(u=>client(u,u,{room},b2))];await host.until(c=>c.P.lobby.length===4);
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
  for(const c of [back,...cs.slice(1)])await c.close();await new Promise(r=>s2.close(r));
});
```

- [ ] **Step 2: Başarısız olduğunu gör**

Run: `node --test test/server.test.js 2>&1 | grep -E '^not ok|# fail'`
Expected: 1 `not ok` (`opts.kayit` yok sayılır, `alinan` boş).

- [ ] **Step 3: Uygula** (`kayit.js` 15 satır; `server.js`'te `flush`/`deleteRoom`/`close` ve `opts.kayit`)

- [ ] **Step 4: Testler**

Run: `node --test test/*.test.js 2>&1 | grep -E '^not ok|# (pass|fail)'`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add kasaba-gecesi/sunucu/kayit.js kasaba-gecesi/sunucu/server.js kasaba-gecesi/sunucu/test/server.test.js
git commit -m "Kasaba Gecesi: drain the event log into a kayit sink on every flush"
```

---

### Task 4: Oyun sonu ekranı — özet kartı, "senin payın", "Tekrar oyna"

**Files:**
- Modify: `kasaba-gecesi/index.html` (`renderEndUI` ~satır 751; `.endcard` CSS; `KG_VER`)
- Modify: `kasaba-gecesi/sunucu/kur.sh` satır 143 (`for f in server.js game.js …` listesine `kayit.js`)
- Modify: `.claude/skills/kasaba-gecesi/SKILL.md` (Mimari: `R.log`, `P.ozet`, `payin`, `kayit.js`)
- Test: `kasaba-gecesi/sunucu/test/e2e.js`

**Interfaces:**
- Consumes: `P.ozet` (Task 2), `priv.payin` (Task 2), mevcut `endToLobby()` istemci fonksiyonu (`{t:'cancel'}`).
- Produces (DOM): `.endcard .ozet` listesi (her oyuncu bir satır: ad, rol, akıbet metni), `.endcard .payin` (varsa), `button.ok.tekrar` metni **"Tekrar oyna"** (ev sahibi), ev sahibi değilse `p.small` "Ev sahibi yeni oyunu başlatınca lobiye dönersin."

Akıbet metni: `olum===null` → "sağ"; gece → `Gece ${gun}: ${sekilMetni}` (`stab`→"öldürüldü", `bomb`→"patladı", `bolt`→"yıldırım", `ghost`→"hortlak", `vanish`→"kayboldu"); gündüz → `Gün ${gun}: asıldı`. "Senin payın" satırları yalnız dolu listeler için: "🗡️ Öldürdün: A, B", "💉 Kurtardın: …", "🪤 Yakaladın: …", "👮 Tuttun: …"; hepsi boşsa satır yok.

- [ ] **Step 1: e2e'ye başarısız adımı ekle** (`'yeni ev sahibi oyunu iptal eder'` adımından **önce**; oyun `talk` ya da `vote` fazındayken)

```js
    step('oyun biter: özet, senin payın ve "Tekrar oyna"');
    { const R2=roomOf().game; // hainler dışındaki herkesi ölmüş say → bir sonraki oylama çözümünde hainler kazanır
      for(const [id,r] of Object.entries(R2.g.roles))if(r.team!=='imp')G.pl(R2,id).alive=false;
      // checkWin yalnız gece ve oylama çözümünde çalışır: talk'taysak önce vote'a geç, sonra vote'u da bitir
      if(R2.P.phase==='talk'){R2.P.ends=Date.now()-1;await watcher.waitForFunction(()=>P.phase!=='talk',null,{timeout:5000})}
      if(R2.P.phase==='vote')R2.P.ends=Date.now()-1;
      for(const p of [host,...Object.values(pages)])await p.waitForFunction(()=>P.phase==='end'&&P.ozet&&document.querySelector('.endcard .ozet'),null,{timeout:8000});
      assert.strictEqual((await watcher.$$('.endcard .ozet > *')).length,4);
      assert.strictEqual(await pages[newHostName].textContent('.endcard button.tekrar'),'Tekrar oyna');
      await pages[newHostName].click('.endcard button.tekrar');
      for(const p of [host,...Object.values(pages)])await p.waitForFunction(()=>P.phase==='lobby'&&!priv.role,null,{timeout:5000});
    }
```
`G` için e2e'ye `const G=require('../game.js')` ekle. Bu adım lobiye döndürdüğü için sonraki "iptal" adımını kaldır (artık lobidedir); o adımın "herkes lobiye döner" kontrolü yukarıda yapılır.

- [ ] **Step 2: e2e'nin başarısız olduğunu gör**

Run: `cd kasaba-gecesi/sunucu && NODE_PATH="$(ls -d ~/.npm/_npx/*/node_modules | head -1)" PW_CHROMIUM=/opt/google/chrome/chrome node test/e2e.js 2>&1 | tail -3`
Expected: `E2E BAŞARISIZ` (`.endcard .ozet` yok).

- [ ] **Step 3: `renderEndUI`'yi güncelle**

- Mevcut `P.reveal` listesi (`.roll`) yerine `P.ozet.oyuncular` ile `.ozet` listesi (ozet yoksa eski `.roll` kalsın: yeniden bağlanan eski istemci sürümü için değil, `P.ozet` her zaman gelir; yine de `P.ozet||` koruması).
- `priv.payin` varsa `.payin` bloğu.
- Düğme: `el('button','ok tekrar','Tekrar oyna')`, `onclick=endToLobby`.
- CSS: `.endcard .ozet` iki sütun (ad+rol / akıbet), telefonda tek sütun; `.endcard` `max-height:88vh; overflow:auto`.
- `KG_VER='2026-10-25a'`.

- [ ] **Step 4: Doğrula**

Run: `.claude/skills/kasaba-gecesi/scripts/kontrol.sh --e2e`
Expected: 4 ✓. Ardından 844×390'da oyun sonu ekranının görüntüsünü al ve bak (kart taşmıyor, düğme görünür).

- [ ] **Step 5: `kur.sh` ve SKILL.md**

`kur.sh` kopya listesine `kayit.js`; SKILL.md "Mimari" bölümüne: `R.log` (gizli, `kayit.js` boşaltır), `P.ozet`/`payin` oyun sonunda, olay türleri için spec §5.4'e bağlantı. `bash -n kur.sh`.

- [ ] **Step 6: Commit**

```bash
git add kasaba-gecesi/index.html kasaba-gecesi/sunucu/kur.sh kasaba-gecesi/sunucu/test/e2e.js .claude/skills/kasaba-gecesi/SKILL.md
git commit -m "Kasaba Gecesi: end screen shows the match summary, your share and Play again"
```

---

## Bitiş ölçütü (spec §6 aşama 1)

`kontrol.sh --e2e` geçer; e2e'de oyun sonu özeti görünür ve "Tekrar oyna" herkesi lobiye döndürür. Dal `gecmis`; canlıya `/yayinla kasaba gecmis` ile alınabilir (`CANLI_SURUM` değişmez; test olarak `kasaba-test gecmis` önerilir).
