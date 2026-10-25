# Geçmiş 7 — E-posta kötüye kullanımını engelleme (kod istekleri sunucudan, Turnstile, tavanlar)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kod maili üreten her istek (bağla/gir) ve anonim kimlik üretimi oyun sunucusundan geçer: Turnstile (Managed) + IP/adres/kurulum/kanca tavanları; GoTrue'nun herkese açık mail uçları ve `/signup` dış kapıda kapanır; önceden hesap açma kökten biter.

**Architecture:** Saf `kod.js` (tavanlar, Turnstile siteverify) + `server.js`'te `POST /eposta/kod`, `POST /hesap/anonim` (GoTrue'ya yerel adres `SUPABASE_IC_URL`), `/ayar.json turnstile`, kanca günlük tavanı; istemci `kimlikHazirla` anonim oturumu sunucudan alır (`setSession`), `hesapKodGonder` Turnstile belirteciyle `/eposta/kod` çağırır, şifre döndürme kalkar; `db/caddy.sh` 403 kuralları + `trusted_proxies`.

**Tech Stack:** Node 20+ (`fetch`, `crypto`), supabase-js 2.117.3 (gömülü), Cloudflare Turnstile (`api.js` Cloudflare'den; Managed widget `0x4AAAAAAFlQGHDJqXliNaR0`), Caddy, `node:test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-kasaba-gecesi-eposta-kotuye-kullanim-design.md` (Plan 6 tasarımı üstüne: `…eposta-kod-design.md`).

## Global Constraints

- Mail üreten tek herkese açık giriş `POST /eposta/kod`; anonim kimlik `POST /hesap/anonim`; sunucu GoTrue'ya yalnız `SUPABASE_IC_URL` üzerinden (yoksa 503 + açılışta `UYARI`).
- Turnstile: belirteç ≤ 2048 karakter, siteverify form kodlu `secret,response,remoteip`, 10 sn, `success && action===beklenen && hostname∈TURNSTILE_HOSTNAMES` (varsayılan `ALAN`); ulaşılamazsa red. Belirteç/sır/kod günlüğe yazılmaz.
- Tavanlar (spec §5.2): IP 10 dk'da 3 ve saatte 6; adres saatte 3, günde 6; kurulum `KOD_SAATLIK` 30 / `KOD_GUNLUK` 80 (kasaba-test 20); kanca `KANCA_GUNLUK` 90; anonim IP saatte 10. Sayaçlar Turnstile **geçtikten sonra** artar.
- Metinler: 429 "Çok sık istek; biraz sonra dene.", 503 kota "Bugünlük kod sınırı doldu; yarın tekrar dene.", 403 turnstile "Doğrulama başarısız; sayfayı yenile.", turnstile ulaşılamaz "Doğrulama şu an yapılamıyor, tekrar dene.", ayarsız "Bu kurulumda doğrulama ayarlı değil.", betik yüklenemedi "Doğrulama yüklenemedi; sayfayı yenile."
- `/signup` 403 kuralı yalnız `caddy.sh --signup-kapali` ile; canlı güncellenene kadar açık (Plan 6 kurulu canlı `signInAnonymously` kullanıyor).
- Türkçe kısa metin; `KG_VER` artar; `kontrol.sh --e2e`; `index.html`'de satır içi `//` yorum yok; `sunucu/*.js` eklenince `kur.sh` otomatik kopyalar.

## Review Focus

1. **Turnstile betiği engellenmiş/yüklenmiyor (kurumsal ağ, reklam engelleyici):** "Kod gönder" kilitlenmez; "Doğrulama yüklenemedi; sayfayı yenile." → Task 3 e2e (api.js rotası 404).
2. **Aynı belirteç iki kez:** ikinci istek 403; istemci her istekten sonra `reset` yapıp yeni belirteç alır → Task 3 e2e (sahte turnstile sayaç) + Task 4 gerçek deneme.
3. **Sunucu GoTrue'ya ulaşamıyor (IC URL yok/kapalı):** `/hesap/anonim` 503 → istemci misafir olarak oyuna devam eder (bugünkü gibi); `/eposta/kod` 503 → "Şu an gönderilemedi, tekrar dene." → Task 2 testi + Task 3 e2e.
4. **Oyuncu iki dakikada 4 kez kod isteyince:** 3.'ten sonra 429 ve süre; mevcut 60 sn sayaçla çelişmez → Task 2 testi.
5. **Bağlı (e-postalı) oturum "bağla" çağırırsa:** sunucu 400 `zaten_bagli` (yeni adres değiştirme hedef dışı) → Task 2 testi.

---

### Task 1: `kod.js` — tavanlar ve Turnstile doğrulama (saf)

**Files:**
- Create: `kasaba-gecesi/sunucu/kod.js`
- Test: `kasaba-gecesi/sunucu/test/kod.test.js`

**Interfaces:**
- Produces: `tavanlar({simdi, ipOn=3, ipSaat=6, adresSaat=3, adresGun=6, saat=30, gun=80, anonSaat=10}) → {kontrol({ip,adres}) → {ok:true}|{ok:false,neden:'ip'|'adres'|'kota',sureSn}, isaretle({ip,adres}), anonimKontrol(ip) → {ok}|{ok:false,sureSn} (kontrol+işaret birlikte), temizle(), sayac:{istek,ip_sinir,adres_sinir,kota,anon_sinir}}` — pencereler `Map<anahtar, zaman[]>`; `kontrol` sırası ip → adres → kota; `sureSn` = pencerede en eski kaydın düşmesine kalan saniye; `temizle` boş listeleri siler (sunucu 10 dakikada bir çağırır).
- `turnstileDogrula({secret, response, remoteip, action, hostnames:string[], fetch, zamanAsimiMs=10000}) → Promise<{ok:true,hostname}|{ok:false,neden:'ayarsiz'|'belirtec'|'uzun'|'ag'|'basarisiz'|'action'|'hostname',kodlar?}>` — `secret` yoksa `ayarsiz`; `response` boş → `belirtec`; > 2048 → `uzun`; `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` `Content-Type: application/x-www-form-urlencoded` (`URLSearchParams`); yanıt `success!==true` → `basarisiz` (`kodlar=error-codes`); `action` eşit değil → `action`; `hostname` listede değil → `hostname`; ağ/zaman aşımı → `ag`.

- [ ] **Step 1: Failing tests** (`kod.test.js`, sahte `simdi`): IP 3. istek ok, 4. `ip` ve `sureSn` 600−geçen; 10 dk sonra tekrar ok; saatte 7. `ip`; adres 4. `adres`; günlük adres 7. `adres` (farklı saatlerde); kurulum 31. `kota` (31 farklı ip/adres); günlük 81. `kota`; `anonimKontrol` 11. `{ok:false}`; `temizle` sonrası iç `Map` boş anahtar yok (dışa `boyut()` ver). `turnstileDogrula`: sahte `fetch` (istek gövdesini kaydeder) → `{success:true,action:'kod_bagla',hostname:'kasaba-test.munupixi.com'}` → ok ve gövde `secret=s&response=t&remoteip=1.2.3.4`, `Content-Type` form; `success:false,'error-codes':['invalid-input-response']` → `basarisiz` + `kodlar`; action farklı → `action`; hostname `localhost` listede değil → `hostname`; `response` 3000 karakter → `uzun`, fetch çağrılmaz; `secret` boş → `ayarsiz`; `fetch` fırlatır → `ag`.
- [ ] **Step 2:** `cd kasaba-gecesi/sunucu && node --test test/kod.test.js` → FAIL (`Cannot find module`). **Step 3:** Implement. **Step 4:** PASS. **Step 5: Commit** `Kasaba Gecesi: kod.js — request caps and Turnstile siteverify`.

### Task 2: Sunucu uçları `POST /eposta/kod`, `POST /hesap/anonim`; `/ayar.json turnstile`; kanca günlük tavanı

**Files:**
- Modify: `kasaba-gecesi/sunucu/server.js`, `kasaba-gecesi/sunucu/test/taklit-rest.js` (GoTrue dalları: `POST /auth/v1/signup` → gövde `{}` ise 200 oturum JSON'u `{access_token:'t-anon',refresh_token:'r',user:{id:<uuid>,is_anonymous:true}}`, e-postalıysa 422 `{error_code:'signup_disabled'}`; `PUT /auth/v1/user` → `Authorization` yoksa 401, varsa 200 `{id,new_email}`; `POST /auth/v1/otp` → `create_user:false` ve `email` `yok@…` ise 422 `{error_code:'otp_disabled',msg:'Signups not allowed for otp'}` yoksa 200 `{}`; hepsi `istekler`'e kaydedilir)
- Test: `kasaba-gecesi/sunucu/test/server.test.js`

**Interfaces:**
- Consumes: Task 1 `tavanlar`, `turnstileDogrula`.
- Produces: `opts.ayar.{turnstileSite, turnstileSecret, turnstileHostnames, icUrl, kodGunluk, kodSaatlik, kancaGunluk}` (env `TURNSTILE_SITE`, `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAMES` (virgül; varsayılan `[process.env.ALAN]`), `SUPABASE_IC_URL`, `KOD_GUNLUK`, `KOD_SAATLIK`, `KANCA_GUNLUK`); `opts.turnstileFetch`, `opts.icFetch` (testte sahte; varsayılan global fetch).
- `GET /ayar.json` → `+ turnstile: turnstileSite||null`.
- `POST /eposta/kod` gövde `{tur:'bagla'|'gir', email, turnstile, token?}` (JSON ≤ 8 KB). Sıra ve yanıtlar: biçim → 400 `{error:'gecersiz_govde'}`; `turnstileSecret` yok → 503 `{error:'turnstile_ayarsiz'}`; `icUrl` yok → 503 `{error:'ic'}`; IP tavanı → 429 `{error:'limit',sureSn}`; Turnstile → 403 `{error:'turnstile',neden}` (`ag` → `neden:'ag'`); adres tavanı → 429; kota → 503 `{error:'kota'}`; `isaretle`; bağla: `token` yok → 401 `{error:'token'}`; `Kimlik.dogrula(token)` geçersiz/süresi dolmuş → 401; token `eposta` doluysa → 400 `{error:'zaten_bagli'}`; `PUT ${icUrl}/auth/v1/user` `{email}` başlıklar `apikey: anonKey`, `Authorization: Bearer <token>`, 10 sn; gir: `POST ${icUrl}/auth/v1/otp` `{email, create_user:false}` `apikey`. GoTrue 2xx → 200 `{ok:true}`; GoTrue 4xx → aynı durum + `{error_code, msg}` (gövdeden; yoksa `error:'gotrue'`); ağ → 503 `{error:'ic'}`. Günlük: `kod <tur> <maskeli adres> <durum>`.
- `POST /hesap/anonim` (gövde yok): `icUrl` yok → 503; `anonimKontrol(ip)` → 429; `POST ${icUrl}/auth/v1/signup` `{}` `apikey` → GoTrue yanıtı aynen (durum + JSON). 
- Kanca: `kancaGunluk` (varsayılan 90) günlük sayaç; aşımda 500 `gönderilemedi`, `epostaSayac.kota++`.
- `/saglik` → `kod:{istek,gonderildi,ip_sinir,adres_sinir,kota,turnstile_red,anon,anon_sinir}`; 10 dakikada bir `temizle()`.
- 405 kuralı iki yeni POST için açılır.

- [ ] **Step 1: Failing tests** (`server.test.js`, `createServer({quiet:true,jwksAlma:false,ayar:{…,jwtSecret:'x',turnstileSite:'site',turnstileSecret:'sir',turnstileHostnames:['x.test'],icUrl:rest.url,kodGunluk:5,kodSaatlik:5}, turnstileFetch:sahte, icFetch:(u,o)=>fetch(u,o)})`, taklit `rest` ile): `/ayar.json` `turnstile:'site'`; bağla: geçerli anonim token + sahte turnstile ok → 200 ve taklit isteği `PUT /auth/v1/user` `Authorization: Bearer <token>`, gövde `{email}`; e-postalı token → 400 `zaten_bagli`; token yok → 401; gir: `POST /auth/v1/otp` gövde `{email, create_user:false}` → 200; `yok@ornek.com` → 422 `error_code:'otp_disabled'`; turnstile `success:false` → 403 ve taklit isteği **yok**, sayaçlar artmaz; aynı IP 4. istek → 429 `sureSn>0`; kota (`kodGunluk:5`) 6. farklı adres → 503 `kota`; `turnstileSecret` yokken 503 `turnstile_ayarsiz`; `icUrl` yokken 503 `ic`; `/hesap/anonim` → 200 ve gövde `access_token:'t-anon'`, taklit `POST /auth/v1/signup` gövde `{}`; 11. anonim → 429; kanca `kancaGunluk:2` → 3. mail 500 ve `eposta.kota===1`; `/saglik kod` sayaçları.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** `node --test test/server.test.js test/kod.test.js` PASS; `kontrol.sh`. **Step 5: Commit** `Kasaba Gecesi: /eposta/kod and /hesap/anonim — Turnstile, caps, GoTrue over the local gateway`.

### Task 3: İstemci — anonim oturum sunucudan, Turnstile ile kod isteği, şifre döndürme kalkar

**Files:**
- Modify: `kasaba-gecesi/index.html` (`kimlikHazirla`, `hesapKodGonder`, `hesapDogrula`, `hesapBlok` form, stiller), `kasaba-gecesi/sunucu/test/e2e.js`

**Interfaces:**
- Consumes: `/ayar.json turnstile`, `POST /hesap/anonim`, `POST /eposta/kod` (Task 2).
- Produces (istemci): `kimlikHazirla`: `getSession` boşsa `POST /hesap/anonim` (10 sn) → `sb.auth.setSession({access_token,refresh_token})` → `getSession`; 429/503/ağ → misafir (`token` yok). `turnstileYukle()` (betik `https://challenges.cloudflare.com/turnstile/v0/api.js` `async defer`, bir kez; hata → `ui.hesap.hata='Doğrulama yüklenemedi; sayfayı yenile.'`), `turnstileBelirtec(action)` → Promise: `.hesap-turnstile` kapsayıcıya `turnstile.render(el,{sitekey:ayar.turnstile, action, appearance:'interaction-only', execution:'execute', callback:t=>res(t), 'error-callback':()=>rej(…)})` (widget kimliği `ui.hesap.widget`; aynı form içinde ikinci istekte `turnstile.reset(id)` + `execute(id)`), 30 sn zaman aşımı. `hesapKodGonder`: e-posta biçimi → belirteç → `POST /eposta/kod {tur,email,turnstile,token:tur==='bagla'?token:undefined}` → 200 → `adim='kod'`; hata gövdesine göre metin: `limit` → "Çok sık istek; biraz sonra dene." (`sureSn` varsa "(N sn)"), `kota` → "Bugünlük kod sınırı doldu; yarın tekrar dene.", `turnstile` → `neden==='ag'`?"Doğrulama şu an yapılamıyor, tekrar dene.":"Doğrulama başarısız; sayfayı yenile.", `turnstile_ayarsiz` → "Bu kurulumda doğrulama ayarlı değil.", `ic` → "Şu an gönderilemedi, tekrar dene.", `zaten_bagli` → "Bu hesap zaten bağlı.", GoTrue `error_code` → Plan 6 `hesapHataMetni`. İstek bitince (her durumda) `turnstile.reset`. `hesapDogrula`: `updateUser({password})` satırı kaldırılır; `rastgeleSifre` silinir. `ayar.turnstile` yoksa kapsayıcı çizilmez, "Kod gönder" doğrudan sunucuya gider (sunucu 503 `turnstile_ayarsiz` → metin).
- Seçiciler: `.hesap-turnstile` (form içinde, görünür alan; `min-height:0`, Managed kutu çıkınca büyür).

- [ ] **Step 1: Failing e2e** (c5 bağlamı ve türevleri; s3 sunucusu `ayar.{turnstileSite:'site',turnstileSecret:'sir',turnstileHostnames:[…o3 host],icUrl:'http://ic.test'}`, `icFetch` sahte: `/auth/v1/signup` → `oturum` JSON (anon), `/auth/v1/user` PUT → `{...}`, `/auth/v1/otp` → `{}`; `turnstileFetch` sahte: gövdedeki `response` daha önce görüldüyse `{success:false,'error-codes':['timeout-or-duplicate']}` yoksa `{success:true,action:gövde.action?…}` — action'ı sunucu yollamaz, Cloudflare döner: sahte `{success:true,action:'kod_'+tur,hostname:o3 host}` için `turnstileFetch` isteğin `response` değerindeki ekten türetir: istemci sahtesi `'sahte-'+action+'-'+n` üretir). Playwright rotaları: `/auth/v1/signup` artık **çağrılmamalı** (rota sayacı 0); `https://challenges.cloudflare.com/turnstile/v0/api.js` → JS gövdesi: `window.turnstile={_n:0,render(el,o){el._o=o;return 'w'+(++this._n)},execute(id){const o=document.querySelector('.hesap-turnstile')._o;setTimeout(()=>o.callback('sahte-'+o.action+'-'+(++this._n)),10)},reset(){},remove(){}}`. Senaryolar: (a) giriş sayfası açılır, `hesap.uuid` dolu (anonim oturum sunucudan: `birlesmeler` benzeri `anonimler.length===1`), `/auth/v1/signup` rotası 0 kez; (b) bağla: kod gönder → `#hesapKod`; sunucuya giden istek `tur:'bagla'`, `turnstile` `/^sahte-kod_bagla-/`, `token` anon jwt; `123456` → "Hesabın"; **`PUT /auth/v1/user` ile `password` isteği yok** (authIstekler); (c) gir + 2 oyunu ekle (Plan 6 senaryosu, `/eposta/kod` üzerinden); (d) aynı bağlamda 4. kod isteği → `.hesap-hata` `/Çok sık istek/`; (e) api.js rotası 404 → `.hesap-hata` `/yüklenemedi/` ve düğme tekrar basılabilir; (f) `icFetch` `/auth/v1/signup` 503 dönen ayrı bağlam → sayfa misafir (`.kimlik-notu` `/Misafir/`), oyun kurulabilir; (g) kayıt kapalı sunucuda hiçbir Turnstile betiği yüklenmez (rota sayacı 0).
- [ ] **Step 2:** FAIL. **Step 3:** Implement; `KG_VER` artır. **Step 4:** `kontrol.sh --e2e` ✓; ekran görüntüsü: form (Turnstile kapsayıcısı boşken görünmez). **Step 5: Commit** `Kasaba Gecesi: code requests go through the server with Turnstile; anonymous session from the server; no password rotation`.

### Task 4: Dış kapı, kurulum, kasaba-test gerçek denemesi, belgeler

**Files:**
- Modify: `kasaba-gecesi/sunucu/db/caddy.sh` (403: `/auth/v1/otp`, `/auth/v1/magiclink`, `/auth/v1/resend`, `@userYaz { path /auth/v1/user; method PUT }`; `--signup-kapali` → `/auth/v1/signup` 403; tüm `reverse_proxy` bloklarına `header_up`/`trusted_proxies private_ranges` (Caddy: `reverse_proxy 127.0.0.1:$PORT { trusted_proxies private_ranges }`)), `kasaba-gecesi/sunucu/kur.sh` (yorum: env satırları), `README.md` (E-posta bölümü: Turnstile, tavanlar, env, kontrol curl'leri, canlı adımları, Rotate secret), `.claude/skills/kasaba-gecesi/SKILL.md` (kod.js, uçlar, env), `docs/DURUM.md`, `CLAUDE.md` (sabit karar: Turnstile tek CDN istisnası), `docs/kasaba-gecesi-tanitim.md` (bir cümle)

- [ ] **Step 1:** `bash -n`; `--yalnizca-yaz` çıktısında kurallar; commit `Kasaba Gecesi: gateway closes GoTrue mail endpoints, trusted proxies`.
- [ ] **Step 2: kasaba-test** (komut gösterilir): `/etc/games/kasaba-test.env` → `TURNSTILE_SECRET` (yerel `~/.turnstile-kasaba`), `TURNSTILE_SITE=0x4AAAAAAFlQGHDJqXliNaR0`, `SUPABASE_IC_URL=http://127.0.0.1:8000`, `KOD_GUNLUK=20`; `kur.sh kasaba-test … --surum gecmis`; `db/caddy.sh` (signup açık); curl: `/otp` 403, `PUT /user` 403, `GET /user` 401 (GoTrue), `/signup {}` 200 (hâlâ açık), `/ayar.json turnstile` dolu, `/saglik kod`.
- [ ] **Step 3: Gerçek deneme:** Playwright kasaba-test: anonim oturum sunucudan (`/saglik kod.anon` artar), "E-postanı bağla" → gerçek Turnstile (Managed, görünmez geçmeli) → kod Gmail'den (kullanıcı yazar) → "Hesabın"; ikinci bağlam "Hesabınla gir" → kod → ekle; **aynı Turnstile belirteci** ile ikinci `POST /eposta/kod` (betikten curl) → 403; 4. kod isteği → 429; `auth.audit_log_entries.ip_address` son kayıtta gerçek IP (psql dosyayla); `/saglik kod` sayaçları. Ekran görüntüleri.
- [ ] **Step 4:** Belgeler; `kontrol.sh`. **Step 5: Commit** `Docs: e-mail abuse prevention (plan 7)`. Canlı adımları DURUM'a: kasaba.env satırları, `/yayinla`, sonra `caddy.sh --signup-kapali`, Rotate secret → yeni `TURNSTILE_SECRET`.
