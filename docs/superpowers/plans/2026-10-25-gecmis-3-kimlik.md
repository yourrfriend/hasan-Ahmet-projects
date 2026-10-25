# Geçmiş 3/6 — Kimlik: anonim Supabase oturumu, token ile join, profil, /ayar.json

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Oyuncu tarayıcıda anonim bir Supabase kullanıcısı olur (giriş ekranı yok); `join` o kullanıcının token'ını taşır, sunucu imzayı yerelde doğrulayıp kimliği `sub`'dan türetir; ad/renk/şapka `profiller`'e yazılır; Supabase kapalı/ayarsızken her şey bugünkü gibi misafir olarak çalışır.

**Architecture:** `server.js` ortamdan `SUPABASE_URL/ANON_KEY/JWT_SECRET/SERVICE_KEY`, `KG_KURULUM` okur; `GET /ayar.json` ve `GET /sayfa/supabase.js` (repoya gömülü UMD, CDN yok) sunar. Yeni modül `kimlik.js`: HS256 JWT doğrulama (`crypto`, bağımlılık yok). `onJoin`: geçerli imzalı `token` → `key='sb:'+sub` → `pubId`; yoksa `kg_uid` yolu. `kayit.js`: `profil(uye, {ad,renk,sapka})` — PostgREST upsert (`Prefer: resolution=merge-duplicates`), arka planda, hata oyunu etkilemez. İstemci: `supabase.js` + `/ayar.json` → `signInAnonymously`, en çok 2 sn bekler, token'ı `kg_token`'da saklar, `join{token}`; `you{id,kayitli}`; kayıtsızsa küçük "misafir" notu. `kur.sh`: `/etc/games/AD.env`'deki `SUPABASE_*`/`KG_KURULUM` satırlarını korur, `sayfa/` ve `kimlik.js`'yi kurar.

**Tech Stack:** Node 20 (`crypto`, `fetch`, `node:test`), `ws`, tek dosya istemci, `@supabase/supabase-js` 2.117.3 UMD (gömülü), Playwright e2e, bash (`kur.sh`).

**Spec:** `docs/superpowers/specs/2026-10-24-kasaba-gecesi-gecmis-design.md` §5.2 (kimlik), §5.5 (ayarlar/env, `kur.sh`), §5.6 (`/ayar.json`), §5.8, §5.9 (test), §6 aşama 3. Postgres kuralları: `supabase-postgres-best-practices` (upsert, en az yetki, `(select auth.uid())`).

## Global Constraints

- Oyun Supabase'i **beklemez**: ayar boşsa ya da oturum 2 sn içinde gelmezse misafir; oyun ortasında kimlik değişmez.
- Gizli anahtar (`kg_uid`) ve token yalnız `join`'de gider; `P`/yayınlarda uuid, token, e-posta geçmez; `pubId` = `sha256('kg:'+key)` (key `sb:<uuid>` ya da `kg_uid`).
- **Süresi dolmuş ama imzası doğru token kimlik için kabul edilir** (§5.2); imzasız/yanlış imzalı/`alg≠HS256` token reddedilir ve misafire düşülür.
- `/ayar.json` yalnız `url`, `anonKey`, `kurulum`, `kayit` (boolean) döner; servis anahtarı ve JWT gizli anahtarı asla.
- Profil yazma yalnız kayıtlı oyuncu için, `service_role` ile, upsert; başarısızlık loglanır, oyunu etkilemez; `profiller`'e **silme yok**.
- Supabase-js **gömülü**, sürüm sabit (`2.117.3`, 2026-10-07), `kasaba-gecesi/sayfa/supabase.js`; CDN yok.
- Testler: `kontrol.sh` (her görev), `--e2e` (istemci görevi); commit mesajları İngilizce + Co-Authored-By.

## Review Focus

1. **Geçersiz/yanlış imzalı token ile join:** misafir olur, hata yok, `kayitli:false`; başkasının `sub`'ını taşıyan sahte token kimlik vermez. → Task 2/3 testleri.
2. **Aynı anonim kullanıcı iki sekme/yeniden bağlanma:** aynı `pubId`, oyundaki koltuk geri gelir; süresi dolmuş token ile de. → Task 3 testi.
3. **Supabase'e ulaşılamazken** (`/ayar.json` kayıt kapalı ya da `supabase.js` yüklenemedi ya da 2 sn geçti): sayfa misafir olarak bağlanır, UI donmaz. → Task 5 e2e (yerelde Supabase yok).
4. **Profil upsert hatası** (REST 500/zaman aşımı): oyun akışı etkilenmez, log yazılır, yeniden denenmez (sonraki ad değişikliğinde tekrar). → Task 4 testi.
5. **`kur.sh` yeniden kurulum:** `SUPABASE_*` satırları korunur, `KG_KURULUM` yazılır, geri almada eski env döner. → Task 6 sahte ortam tatbikatı.

---

### Task 1: Ayar ve statik dosyalar (`/ayar.json`, `sayfa/supabase.js`)

**Files:**
- Create: `kasaba-gecesi/sayfa/supabase.js` (UMD; `curl -fsSL https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js`, başına `// @supabase/supabase-js 2.117.3 UMD — gömülü, CDN yok` satırı)
- Modify: `kasaba-gecesi/sunucu/server.js` (statik yollar ~50–66; ayar okuma)
- Test: `kasaba-gecesi/sunucu/test/server.test.js`

**Interfaces:**
- Produces: `createServer(opts)` → `opts.ayar` ya da env: `{url:SUPABASE_URL, anonKey:SUPABASE_ANON_KEY, jwtSecret:SUPABASE_JWT_SECRET, serviceKey:SUPABASE_SERVICE_KEY, kurulum:KG_KURULUM}`; `GET /ayar.json` → `{url, anonKey, kurulum, kayit}` (`kayit = !!(url&&serviceKey)`); `GET /sayfa/supabase.js` (`application/javascript`, `Cache-Control: public, max-age=86400`); diğer `/sayfa/*` 404.

- [ ] **Step 1: Failing test** `test('/ayar.json yalnız açık ayarları döner; ayarsızken kayıt kapalı; /sayfa/supabase.js sunulur')`: varsayılan `srv` (env yok) → `{url:null,anonKey:null,kurulum:null,kayit:false}`; `createServer({ayar:{url:'https://x',anonKey:'anon',serviceKey:'srv',jwtSecret:'s',kurulum:'kasaba-test'}})` → `kayit:true`, gövdede `'srv'` ve `jwtSecret` geçmez; `/sayfa/supabase.js` 200 ve `/createClient/`; `/sayfa/../server.js` 404.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; `kontrol.sh` ✓. **Step 5: Commit** `Kasaba Gecesi: /ayar.json and bundled supabase-js`.

### Task 2: `kimlik.js` — HS256 doğrulama

**Files:**
- Create: `kasaba-gecesi/sunucu/kimlik.js`
- Test: `kasaba-gecesi/sunucu/test/kimlik.test.js`

**Interfaces:**
- Produces: `dogrula(token, secret) → {sub, exp, suresiDolmus:boolean, anonim:boolean} | null` (null: biçim bozuk, `alg!=='HS256'`, imza yanlış, `sub` uuid değil); `imzala(payload, secret)` yalnız testler için (aynı dosyada, `test` amaçlı dışa açık).

- [ ] **Step 1: Failing tests** `kimlik.test.js`: doğru imza → `{sub, suresiDolmus:false}`; `exp` geçmiş → `suresiDolmus:true` (yine `sub` döner); yanlış gizli anahtar → null; `alg:'none'` → null; `sub` uuid değil → null; `is_anonymous:true` → `anonim:true`; bozuk base64 → null (fırlatmaz); `crypto.timingSafeEqual` ile karşılaştırma (uzunluk farkı güvenli).
- [ ] **Step 2:** FAIL. **Step 3:** Implement (`crypto.createHmac('sha256')`, base64url). **Step 4:** PASS. **Step 5: Commit** `Kasaba Gecesi: kimlik.js — local HS256 verification of Supabase tokens`.

### Task 3: `join{token}` → kayıtlı kimlik

**Files:**
- Modify: `kasaba-gecesi/sunucu/server.js` (`onJoin` ~130–160: key seçimi; `you` mesajı; `mem.uye`, `mem.kayitli`)
- Test: `kasaba-gecesi/sunucu/test/server.test.js`

**Interfaces:**
- Consumes: `kimlik.dogrula`, `opts.ayar.jwtSecret`.
- Produces: `onJoin`: `const k=ayar.jwtSecret&&typeof m.token==='string'?dogrula(m.token,ayar.jwtSecret):null; const key=k?'sb:'+k.sub:cleanUid(m.uid)`; `mem.uye=k?k.sub:null`; `send(ws,{t:'you',id:uid,kayitli:!!k})`. `jwtSecret` yokken token yok sayılır.

- [ ] **Step 1: Failing tests**: `createServer({ayar:{jwtSecret:'gizli'}})`; (a) geçerli token ile join → `you.kayitli===true`, `me` = `pubId('sb:'+sub)` (test `crypto` ile hesaplar), `uid` farklı olsa da aynı `me`; (b) süresi dolmuş token → yine aynı `me`, `kayitli:true`; (c) yanlış imzalı token → `kayitli:false`, `me` = `pubId(uid)`; (d) oyun sürerken kopup süresi dolmuş token'la dönen oyuncu rolünü geri alır; (e) `jwtSecret` yok (varsayılan `srv`) → token yok sayılır, `kayitli:false`. Durum yayınlarında `sub` geçmez (`raw` içinde uuid yok).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; `kontrol.sh` ✓. **Step 5: Commit** `Kasaba Gecesi: join accepts a Supabase token; identity from its subject`.

### Task 4: Profil yazma (`kayit.profil`)

**Files:**
- Modify: `kasaba-gecesi/sunucu/kayit.js` (`olustur(opts)` → `{kuyrukla, profil, kapat, sayac}`), `kasaba-gecesi/sunucu/server.js` (`applyLook` sonrası kayıtlı üye için `kayit.profil`)
- Test: `kasaba-gecesi/sunucu/test/kayit.test.js` (yerel `http.createServer` ile PostgREST taklidi), `server.test.js` (sahte `kayit.profil` çağrısı)

**Interfaces:**
- Produces: `profil(uye, {ad, renk, sapka})`: `POST {url}/rest/v1/profiller` başlıkları `apikey`, `Authorization: Bearer <serviceKey>`, `Content-Type: application/json`, `Prefer: resolution=merge-duplicates,return=minimal`; gövde `{uye, ad, renk, sapka, guncellenme: now}`; `AbortSignal.timeout(5000)`; aynı `uye` için 2 sn içinde tek istek (son değer kazanır); hata → `sayac.hata++` + `log`; `url`/`serviceKey` yoksa hiçbir çağrı yok. `kapat()` bekleyen zamanlayıcıları temizler.

- [ ] **Step 1: Failing tests**: taklit PostgREST (`/rest/v1/profiller` POST kaydeder, başlıkları saklar); `profil('u1',{ad:'Ece',renk:'#fff',sapka:'cap'})` → 2.5 sn sonra tek istek, `Prefer` içinde `merge-duplicates`, `apikey` servis anahtarı; aynı `uye` için iki hızlı çağrı → tek istek, son değer; sunucu 500 → `sayac.hata===1`, fırlatmaz; ayarsız `olustur({})` → `profil` çağrısı istek üretmez. `server.test`: kayıtlı oyuncu `look` ile ad değiştirince sahte `kayit.profil` `(sub, {ad:'YeniAd', …})` ile çağrılır; misafirde çağrılmaz.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (`fetch`, Node 20). **Step 4:** PASS. **Step 5: Commit** `Kasaba Gecesi: profile upsert for registered players (PostgREST, service role)`.

### Task 5: İstemci — anonim oturum, token ile join, misafir notu

**Files:**
- Modify: `kasaba-gecesi/index.html` (`<script src="sayfa/supabase.js" defer>` + `KG_VER`; başlangıç: `/ayar.json` → `oturum()`; `connect()` join'e `token`; `onServerMsg` `you.kayitli`; landing/lobide küçük not)
- Test: `kasaba-gecesi/sunucu/test/e2e.js`

**Interfaces:**
- Consumes: `/ayar.json`, `window.supabase.createClient(url, anonKey, {auth:{persistSession:true, autoRefreshToken:true}})`, `you.kayitli`.
- Produces: `kimlikHazirla() → Promise<string|null>`: `ayar.kayit` değilse `null`; `createClient` → `getSession()`; yoksa `signInAnonymously()`; `Promise.race` ile 2 sn; token `ls('kg_token', t)`; başarısızlıkta `ls('kg_token')` (eski token; sunucu süresi dolmuşu kabul eder); `join` `{…, token: token||undefined}`; `kayitli` bayrağı; landing'de kayıtsızsa `.misafir` notu: "Misafir: geçmişin bu cihazda saklanmaz." (yalnız `ayar.kayit` ise — kayıt kapalı kurulumda not yok).

- [ ] **Step 1: e2e (fail first)**: yerel sunucuda (Supabase yok) `/ayar.json` `kayit:false`; sayfa açılışı 2 sn beklemeden oda kurar (`.lobbybar code` 3 sn içinde); `kayitli===false`; `.misafir` notu **yok** (kayıt kapalı). İkinci sunucu `createServer({ayar:{url:'http://127.0.0.1:1', anonKey:'a', serviceKey:'s', jwtSecret:'x', kurulum:'t'}})` (ulaşılmaz Supabase): sayfa 2 sn içinde misafir bağlanır, `.misafir` notu var, konsolda sayfa hatası yok.
- [ ] **Step 2:** `kontrol.sh --e2e` FAIL. **Step 3:** Implement; `KG_VER='2026-10-28a'`. **Step 4:** `kontrol.sh --e2e` ✓. **Step 5: Commit** `Kasaba Gecesi: anonymous Supabase session on the page; join carries the token`.

### Task 6: `kur.sh` — env koruma, `sayfa/` ve `kimlik.js`

**Files:**
- Modify: `kasaba-gecesi/sunucu/kur.sh` (~143 dosya kopyası; ~172–185 env yazma/geri alma), `kasaba-gecesi/sunucu/README.md`/`README.md` ("Geçmiş ve kullanıcı kaydı": env satırları, `KG_KURULUM`)

**Interfaces:**
- Produces: env dosyasında `PORT, ALAN, SURUM, COMMIT, KG_SURUM, KG_KURULUM=<AD>` + eski dosyadaki `SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_KEY|SUPABASE_JWT_SECRET` satırları aynen; `install` listesine `kimlik.js`, `sayfa/*.js` (hedef `$YENI/sayfa/`); `server.js` `INDEX` yanında `SAYFA=path.join(__dirname,'..','sayfa')` (Task 1'de).

- [ ] **Step 1:** `bash -n kur.sh`. SKILL.md'deki sahte ortam tatbikatı (`KG_APP_KOK/KG_AYAR_KOK/KG_CADDY_KOK/KG_SYSTEMD_KOK` geçici klasörler, sahte `systemctl`/`apt-get`/`caddy` PATH'te; scratchpad `kur-tatbikat.sh`): ilk kurulum → env'de `KG_KURULUM`; env'e `SUPABASE_URL=x` ekle → yeniden kurulum → satır korunur; sağlık başarısız senaryosu → eski env geri gelir.
- [ ] **Step 2:** Tatbikat çıktısını ledger'a yaz. **Step 3: Commit** `kur.sh: keep SUPABASE_* lines across installs, write KG_KURULUM, install sayfa/ and kimlik.js`.

### Task 7: kasaba-test'te açma ve belgeler

- [ ] Sunucuda (`ionos`, komut gösterilip onay alınarak): `/etc/games/kasaba-test.env`'e `SUPABASE_URL=https://kasaba-api.munupixi.com`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET` (`/root/supabase-kasaba/.env`'den, ekrana yazdırmadan) ekle; `/yayinla kasaba-test gecmis`.
- [ ] Doğrulama: `curl /ayar.json` → `kayit:true`, servis anahtarı yok; Playwright ile sayfa aç → `kayitli===true`, yenile → aynı `myId`; sunucuda `psql`: `select count(*) from profiller` artar; GoTrue `JWT_EXPIRY` 604800 (`kur-supabase.sh` zaten).
- [ ] Belgeler: SKILL.md (protokol `join{token}`, `you{kayitli}`, `/ayar.json`, `sayfa/`, `kimlik.js`), README (env satırları, misafir/kayıtlı), DURUM.md; commit `Docs: identity (plan 3)`.
