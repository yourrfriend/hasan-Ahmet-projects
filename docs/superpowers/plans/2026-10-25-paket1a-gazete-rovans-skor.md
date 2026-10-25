# Paket 1a — Kasaba Gazetesi, rövanş, Bu Akşamın Skoru: uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Oyun sonunda gerçek olaylardan üretilen en çok 3 gazete kartı, "Rövanşa hazırım" sayacıyla aynı odada yeni maç, oda oturumu boyunca oyuncu başına oynanan/kazanılan maç tablosu ve bunların ölçüm olayları.

**Architecture:** Kurallar `game.js`'de saf fonksiyonlar (`kazananlar`, `gazeteFor`) ve `checkWin`'de `P.winner.kazananlar`/`P.gazete`; oda düzeyi durum (`room.hazir`, `room.skor`) `server.js`'de, `state.P.hazir`/`P.skor` ile yayılır; `start` mesajı `rovans:true` ile hazır∧bağlı üyelere daralır; istemci yalnız gösterir. Ölçüm olayları `logEv` ile `R.log`'a girer, `kayit.js` yuvasına akar.

**Tech Stack:** Node 20 (`node:test`), `ws`, tek dosya istemci, Playwright e2e (`kontrol.sh --e2e`).

**Spec:** `docs/superpowers/specs/2026-10-25-kasaba-gecesi-paket1-oyun-sonu-design.md` (kaynak: kullanıcının Paket 1 belgesi).

## Global Constraints

- Gizli bilgi `P`'ye girmez; `gazete`/`kazananlar` yalnız `P.phase==='end'`de var. `SECRET_KEYS` testi geçer.
- Kazanma kuralları, rol dengesi, oy gizliliği (tek tek oylar hiçbir yerde) değişmez.
- `start` tek kapı: `startGame` dışında maç başlamaz; yeni maç her maçlık durumu sıfırlar (`R.g`, `P`).
- Hazır olmayan ya da bağlı olmayan oyuncu yeni maça alınmaz; 4–12 kuralı korunur.
- Skor kimliği `pubId`; oda ömrü boyunca; yeniden başlatmada gider (kabul).
- Metinler Türkçe, kısa, yargılayıcı değil; "kurtardı/MVP/teselli" yok. `KG_VER` artar.
- Sabitler `game.js`'de: `GAZETE_EN_COK=3`.
- Her görev: `kontrol.sh` (6. görevde `--e2e`) yeşil, sonra commit (İngilizce mesaj, Co-Authored-By satırı).

## Review Focus

1. **Eşzamanlı iki `start rovans`**: ikinci istek `phase==='night'` görür ve düşer; tek `gameId`. → Task 3 testi.
2. **Hazır ama kopuk oyuncu**: başlatmaya sayılmaz; döndüğünde süren maça girmez, `EMPTY_PRIV` alır, lobi/oyun durumunu izleyici gibi görür. → Task 3 testi.
3. **Skor iki kez işlenmez**: aynı `gameId` için iki `flush` → tek artış; oyun iptal (`cancel` süren oyunda) → artış yok. → Task 4 testi.
4. **Gazete uydurmaz**: Doktor seçti ama saldırı yok → kart yok; engellenmiş Doktor → kart yok; aday yoksa boş liste. → Task 2 testi.
5. **Ev sahibi devri sonrası**: yeni ev sahibi rövanşı başlatabilir, hazır bayrakları ve skor durur. → Task 3/4 testleri.

---

### Task 1: Kazananlar listesi (tek kaynak)

**Files:**
- Modify: `kasaba-gecesi/sunucu/game.js` (`checkWin` ~258–275, `logEv('bitis')`, exports)
- Test: `kasaba-gecesi/sunucu/test/game.test.js`

**Interfaces:**
- Produces: `kazananlar(R, w) → string[]` (pubId listesi; `w` = `checkWin`'in `{t,team,who}` nesnesi), `P.winner.kazananlar`, `bitis.veri.kazananlar`.

- [ ] **Step 1: Failing test** — `test('kazananlar: takım zaferi ölüleri kapsar; hırsız yeni takımıyla; deli masum; hayatta kalan ve hortlak eklenir; kimse yoksa boş')`:
  - `fixed(['hain','doktor','masum','masum','masum'])`, hain öldürülür (oyla) → `P.winner.kazananlar` = `['u1','u2','u3','u4']` (ölü masum dahil: önce u4'ü gece öldür).
  - Hainler kazanır: `fixed(['hain','hain','masum','masum'])`, u0 u2'yi öldürür → `kazananlar` = `['u0','u1']`.
  - Hırsız doktoru çalar, sonra masumlar kazanır → hırsız (artık inn) listede.
  - Deli (`mad`) masum zaferinde listede; hain zaferinde değil.
  - Hayatta Kalan sağ → hain zaferinde de listede; Hortlak asılmış (`hauntWins`) → listede.
  - `bitis` olayında `veri.kazananlar` aynı liste; her eleman `P.players` içinde.
- [ ] **Step 2:** Run `cd kasaba-gecesi/sunucu && node --test test/game.test.js` → FAIL (`kazananlar` undefined).
- [ ] **Step 3: Implement** `function kazananlar(R,w)` in `game.js` (team: `g.roles[id].mad?'inn':g.roles[id].team`; `neu`: `[w.who]`; `+survivors` (`key==='hayatta'&&alive`), `+g.hauntWins`; tekil). `checkWin`: `P.winner.kazananlar=kazananlar(R,w)`; `logEv('bitis', {...,kazananlar})`. Export `kazananlar`.
- [ ] **Step 4:** Tests pass. `.claude/skills/kasaba-gecesi/scripts/kontrol.sh` ✓.
- [ ] **Step 5: Commit** `Kasaba Gecesi: winners list in P.winner (single source for score and gazette)`.

### Task 2: Kasaba Gazetesi (`gazeteFor`)

**Files:**
- Modify: `kasaba-gecesi/sunucu/game.js` (`GAZETE_EN_COK`, `gazeteFor`, `checkWin` → `P.gazete`, exports)
- Test: `kasaba-gecesi/sunucu/test/game.test.js`

**Interfaces:**
- Consumes: `R.gameLog` (`gece_sonuc.veri`: `kurtaranlar[{kim,hedef}]`, `yelek[]`, `tuzak[{kim,ev,kuran}]`, `tutanlar[{kim,hedef}]`, `olenler[{kim,sekil,kimden}]`, `caldi{hirsiz,kurban,yeni_rol}`, `yildirim[]`, `bombalar`; `gunduz_sonuc.veri.asilan`), `R.g.roles[id].mad`, `P.winner`.
- Produces: `gazeteFor(R) → [{tur:'deli'|'mudahale'|'bitis', ozne:[pubId], metin}]`, `P.gazete` (yalnız `end`).

- [ ] **Step 1: Failing tests**
  - `test('gazete: deli kartı, doktor müdahalesi, en çok 3, deterministik')`: `fixed(['hain','doktor','deli','masum','masum'])` `mad='polis'`; gece 1 hain→u3, doktor→u3 (kurtaranlar) … oyun masumlarla biter. `P.gazete.length<=3`; ilk kart `tur:'deli'`, metin `/Oyuncu2 aslında Deli'ydi; kendisine Polis rolü gösteriliyordu/`; bir `mudahale` kartı `/Gece 1: Oyuncu1 bir saldırıyı önledi; Oyuncu3 sağ çıktı/`; `gazeteFor(R)` iki çağrıda `deepStrictEqual`.
  - `test('gazete: saldırı yoksa ya da doktor engellendiyse kart yok; aday yoksa boş')`: doktor u3'ü seçer, saldırı yok → `mudahale` kartı yok; polis doktoru tutar + hain u3 → `kurtaranlar` boş → kart yok; `fixed(['hain','masum','masum','masum'])` tek gündüzde hain asılır → yalnız `bitis` kartı (`/Gün 1: kasaba Oyuncu0'ı gönderdi ve oyun bitti/`).
  - `test('gazete: yelek, tuzak, hırsız, yıldırım (iki yön), patlama metinleri')`: her biri uygun `fixed` ile; yıldırım yanlış tahminde `/yıldırım kendine düştü/`.
  - `test('gazete: aynı özne iki kartı kaplamaz; sıra tür→gün→sıra')`: doktor iki gece kurtarır + tuzakçı yakalar → kartlar `[doktor g1, tuzakçı, …]`, doktor g2 atlanır.
  - `noLeak`: oyun sürerken `P.gazete` undefined; `SECRET_KEYS`'e ekleme gerekmez (gazete açık).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement** `const GAZETE_EN_COK=3;` `function gazeteFor(R)`: adaylar `{tur, oncelik, gun, sira, ozne:[...], metin}`; sırala `(oncelik, gun, sira)`; seç: `secilen=[]`, `ozneler=new Set()`; aday için `ozne.some(o=>ozneler.has(o))` ise atla (atlananlar sonda tekrar denenir yalnız `secilen.length<EN_COK` ve aday kalmadıysa); `bitis` adayı yalnız `secilen.length<EN_COK` iken eklenir. `checkWin`: `P.gazete=gazeteFor(R)`. Şablonlar spec §5.2.
- [ ] **Step 4:** Pass; `kontrol.sh` ✓.
- [ ] **Step 5: Commit** `Kasaba Gecesi: Kasaba Gazetesi — up to three cards from verified events`.

### Task 3: Rövanş (hazır bayrakları, daraltılmış başlatma)

**Files:**
- Modify: `kasaba-gecesi/sunucu/server.js` (`newRoom`, `stateMsg`, `onMessage` `case 'hazir'`, `case 'start'`, `case 'cancel'`, `detach`/`prune`, host devri)
- Test: `kasaba-gecesi/sunucu/test/server.test.js`

**Interfaces:**
- Consumes: `lobbyOf(room)`, `onlineIds(room)`, `G.startGame(R, list)`, `G.endToLobby`.
- Produces: `room.hazir: Set`, `state.P.hazir: string[]`; mesaj `{t:'hazir', v:boolean}`; `{t:'start', rovans:true}`; `err` kodu `soft` metni `Rövanş için 4–12 hazır ve bağlı oyuncu gerekir (şu an N).`

- [ ] **Step 1: Failing tests**
  - `test('rövanş: hazır yalnız end/lobby; sayaç state ile yayılır; vazgeç düşürür')`: 4 oyuncu, oyun başlar, `hazir` gece → `P.hazir` boş; oyun bitirilir (`srv.rooms.get(code).game` üzerinde `G.pl(...).alive=false` + advance) → `hazir v:true` → herkes `P.hazir` içinde görür; `v:false` çıkarır.
  - `test('rövanş: 3 hazırla başlamaz, 4 ile başlar; hazır olmayan ve kopuk oyuncu rol almaz; iki start tek maç')`: 5 üye, 4 hazır (biri hazır değil), host `start rovans` → `P.phase==='night'`, `P.players.length===4`, hazır olmayan `priv.role` yok (`EMPTY_PRIV`), `P.gameId` değişti, `room.hazir.size===0`; ardından ikinci `start rovans` → phase hâlâ night, `gameId` aynı. 3 hazırla → `errs` içinde `soft` ve metin `/4–12 hazır/`. Hazır ama soketi kapalı oyuncu sayılmaz.
  - `test('rövanş: ev sahibi devri hazırı korur; eski maçtan gecikmiş act reddedilir')`: hazırlar işaretli, host kopar, `HOST_GRACE_MS` sonra yeni host; `P.hazir` aynı; yeni host rövanşı başlatır; eski `gameId`/`d` ile `act` → `R.g.acts` boş.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**: `newRoom` → `hazir:new Set()`; `stateMsg` → `hazir:[...room.hazir]`; `case 'hazir'`: `if(['end','lobby'].includes(R.P.phase)&&room.members.has(uid)){m.v?room.hazir.add(uid):room.hazir.delete(uid);logEv? → G.logEv yok: server `R.log.push` yerine `G.olay(R,'hazir',{kim:uid,v:!!m.v})` (Task 5'te eklenir; burada `schedule(room)`)`. `case 'start'`: `if(!isHost(ws)||!['lobby','end'].includes(R.P.phase))break;` `const liste=m.rovans?lobbyOf(room).filter(p=>room.hazir.has(p.id)):lobbyOf(room);` (lobbyOf yalnız bağlı üyeler); `if(m.rovans&&(liste.length<4||liste.length>12))return send(ws,{t:'err',code:'soft',m:'Rövanş için 4–12 hazır ve bağlı oyuncu gerekir (şu an '+liste.length+').'})`; `startGame` başarılıysa `room.hazir.clear()`. `case 'cancel'`: `room.hazir.clear()`. `prune`: silinen üyeyi `hazir`'dan da sil. **Not:** `lobbyOf` oyundaki oyuncuları da içerir (üye ve bağlı oldukları için) — `end` fazında lobi listesi odadaki herkestir; doğrula, değilse `end`'de `P.players ∪ members` ile kur.
- [ ] **Step 4:** Pass; `kontrol.sh` ✓.
- [ ] **Step 5: Commit** `Kasaba Gecesi: rematch — ready flags, start with ready and connected players only`.

### Task 4: Bu Akşamın Skoru

**Files:**
- Modify: `kasaba-gecesi/sunucu/server.js` (`newRoom`, `flush`, `stateMsg`, `applyLook`)
- Test: `kasaba-gecesi/sunucu/test/server.test.js`

**Interfaces:**
- Consumes: `P.winner.kazananlar` (Task 1), `P.gameId`, `P.players`.
- Produces: `room.skor: Map<pubId,{ad,oynadi,kazandi}>`, `room.skorIslenen: Set<gameId>`, `state.P.skor: [{id,ad,oynadi,kazandi}]` (kazandı azalan, sonra ad artan); `skorIsle(room)` fonksiyonu `flush` başında.

- [ ] **Step 1: Failing tests**
  - `test('skor: maç bitince herkes oynadı, kazananlar kazandı; iki flush tek artış; kopuk oyuncu paydada; ölü kazanan sayılır')`: 4 kişi, biri kopar, oyun masum zaferiyle biter → `P.skor` 4 satır, `oynadi:1` hepsi; kazananlar `kazandi:1` (ölü masum dahil); `flush(room)` tekrar (ikinci state) → değişmez.
  - `test('skor: iptal sayılmaz; rövanşta birikir; ad değişir; host devri korur')`: oyun sürerken `cancel` → skor boş; rövanş sonrası `oynadi:2`; `look` ile ad → `P.skor[].ad` yeni; host kopup devredilince `P.skor` aynı.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement** `skorIsle(room)`: `const P=room.game.P; if(P.phase!=='end'||!P.gameId||room.skorIslenen.has(P.gameId))return; …; room.skorIslenen.add(P.gameId)`; `flush` içinde `bosalt` öncesi çağır; `stateMsg` → `skor: skorListesi(room)`; `applyLook` ad değişince `room.skor.get(uid).ad` güncelle (varsa).
- [ ] **Step 4:** Pass; `kontrol.sh` ✓.
- [ ] **Step 5: Commit** `Kasaba Gecesi: session score per room (played/won), applied once per match`.

### Task 5: Ölçüm olayları

**Files:**
- Modify: `kasaba-gecesi/sunucu/game.js` (`olay(R,tur,veri)` dışa açık sarmal: `logEv` ama `R.g` yokken de `R.log`'a yazar; `startGame(R,lobby,ek)` → `baslangic.veri.rovans/onceki`), `kasaba-gecesi/sunucu/server.js` (`case 'gordum'`, `case 'hazir'` olayı, `detach` → `kopus`, `onJoin` → `dondu`, `start rovans` → `rovans_basladi`)
- Test: `kasaba-gecesi/sunucu/test/server.test.js`, `game.test.js`

**Interfaces:**
- Produces: olaylar `son_ekran_goruldu{kim}`, `hazir{kim,v}`, `rovans_basladi{onceki,oyuncular}`, `kopus{kim,gun,faz,olu}`, `dondu{kim}`; `baslangic.veri.rovans:true, onceki:gameId`.

- [ ] **Step 1: Failing test** `test('ölçüm olayları kayıt yuvasına gider; içerik taşımaz')`: sahte `kayit` ile sunucu (`createServer({kayit:sahte})`, mevcut test deseni); akış: oyun başlar, bir oyuncu kopar (`kopus` gun/faz/olu), döner (`dondu`), oyun biter, `gordum` iki kez → tek `son_ekran_goruldu`, `hazir`, `start rovans` → `rovans_basladi{onceki}` ve yeni `baslangic.veri.rovans===true`. Olay verilerinde `JSON.stringify` içinde `rol`/`hedef`/`x` anahtarı yok.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. `gordum` tekilleştirme: `room.gorduler: Set` (startGame'de temizlenir). **Step 4:** Pass. **Step 5: Commit** `Kasaba Gecesi: measurement events (seen end screen, ready, rematch, drop/return)`.

### Task 6: İstemci — son ekran ve lobi

**Files:**
- Modify: `kasaba-gecesi/index.html` (`renderEndUI` ~890–907, `renderLobbyUI` ~809, CSS `.endcard` ~168–171, `startGame()` ~311, `KG_VER` ~205, `onServerMsg` state sonrası `gordum`)
- Test: `kasaba-gecesi/sunucu/test/e2e.js` (176–184 "oyun biter" adımı)

**Interfaces:**
- Consumes: `P.gazete`, `P.skor`, `P.hazir`, `P.online`, `P.players`, `P.lobby`; mesajlar `hazir`, `start rovans`, `gordum`.

- [ ] **Step 1: e2e assertions (fail first)**: end adımında `.endcard .gazete` var ise satır sayısı 1–3; `.endcard .skor` 4 satır "1/1" (kazananlar) ya da "0/1"; bir oyuncu "Rövanşa hazırım"a basar → herkeste `.endcard .hazir-sayac` metni `/4 kişiden 1'i hazır/`; ev sahibinin "Rövanşı başlat" düğmesi `disabled`; "Lobiye dön" mevcut akışla devam (eski `button.tekrar` → `button.lobi`). Telefon boyutunda (844×390) `.endcard` ekranı aşmaz: `getBoundingClientRect().bottom<=390`.
- [ ] **Step 2:** `kontrol.sh --e2e` FAIL.
- [ ] **Step 3: Implement**: `renderEndUI`: kazanan → gazete kutusu (`.gazete`, başlık "🗞️ KASABADA BU GECE", satır başına kart) → özet → payın → skor (`.skor`, "BU AKŞAM: " + `ad kazandi/oynadi` çipleri) → rövanş bloğu (`.rovans`: kendi düğmesi `Rövanşa hazırım`/`Vazgeç` → `send({t:'hazir',v})`; `.hazir-sayac` "N kişiden M'si hazır"; oyuncu çipleri ✅/⏳/📵 (`P.hazir`, `P.online`); ev sahibi: `Rövanşı başlat (M hazır)` → `send({t:'start',settings,rovans:true})`, `disabled` M<4 ya da >12, altında küçük neden; `Lobiye dön` → `cancel`). Lobi: skor çipleri (varsa) + hazır çipleri. `end` fazına girince bir kez `send({t:'gordum'})`. N = `P.players ∪ P.lobby` kimlikleri. CSS: `@media (max-height:450px)` içinde sıkı aralıklar. `KG_VER='2026-10-27b'`.
- [ ] **Step 4:** `kontrol.sh --e2e` ✓; telefon ekran görüntüsüne bak (Playwright 844×390, scratchpad).
- [ ] **Step 5: Commit** `Kasaba Gecesi: end screen — gazette, session score, rematch with ready flags`.

### Task 7: Belgeler ve deneme

**Files:** `docs/DURUM.md`, `.claude/skills/kasaba-gecesi/SKILL.md` (protokol: `hazir`, `start rovans`, `gordum`; `P.hazir/skor/gazete`), `README.md` (oyun sonu bölümü), `docs/kasaba-gecesi-tanitim.md` ("rolleri elle seçebilir" çıkar; gazete/rövanş/skor ekle), `docs/superpowers/specs/2026-10-24-kasaba-gecesi-gecmis-design.md` §5.7'ye not.

- [ ] Belgeleri güncelle; `kontrol.sh` ✓; commit `Docs: package 1a — gazette, rematch, session score`.
- [ ] `/yayinla kasaba-test gecmis` (komutu göster, onay al); kullanıcı telefondan dener (botlar `bot.js`'yi `hazir` mesajına göre güncelle: oyun bitince `{t:'hazir',v:true}`).
