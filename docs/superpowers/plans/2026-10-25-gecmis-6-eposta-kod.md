# Geçmiş 6/6 — E-posta ile hesap bağlama ve ikinci cihaz (6 haneli kod)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kayıtlı oyuncu e-postasını 6 haneli kodla hesabına bağlar; ikinci cihazda aynı kodla girer ve o cihazın anonim geçmişi istenirse hesaba taşınır; tüm mail gönderimi tek `sendTransactionalEmail()` (Resend) içinden, GoTrue'nun "Send Email" kancasıyla.

**Architecture:** GoTrue kodu üretir, imzalı HTTP kancayla oyun sunucusuna (`POST /eposta/kanca`) verir; `hesap.js` imzayı doğrular ve `eposta.js` Resend API'ye yollar. Birleştirme `POST /hesap/birlestir` (iki taze token → PostgREST RPC `hesap_birlestir` → GoTrue admin silme). İstemci (`index.html` giriş sayfası) supabase-js ile `updateUser/verifyOtp/signInWithOtp`; `/ayar.json` `eposta` bayrağı düğmeleri açar.

**Tech Stack:** Node 20+ (`crypto`, `fetch`; bağımlılık yok), supabase-js 2.117.3 (gömülü), GoTrue v2.197.0 (self-hosted v0.8.3), Resend HTTP API, `node:test`, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-25-kasaba-gecesi-eposta-kod-design.md` (önceki kimlik tasarımı: `…2026-10-24-kasaba-gecesi-gecmis-design.md` §5.2).

## Global Constraints

- Gönderim yalnız `eposta.js` → `sendTransactionalEmail({to,subject,text,html})`; sağlayıcı `EPOSTA_SAGLAYICI` (varsayılan `resend`); gönderen `EPOSTA_GONDEREN` (varsayılan `Kasaba Gecesi <oyun@munupixi.com>`).
- Kod, token, imza, anahtar **hiçbir günlüğe yazılmaz**; alıcı maskeli (`a***@gmail.com`).
- Birleştirmede iki token da süresi dolmamış; `eski` anonim; `yeni` anonim değil ya da `email` dolu; `eski.sub!==yeni.sub`.
- "Hayır" → hiçbir çağrı; `N=0` → sormadan birleştir + sil. `sadeceSil` yok.
- Düğmeler yalnız `ayar.eposta` (kayıt açık ∧ `EPOSTA_KANCA_SIRRI` tanımlı) ve giriş sayfasında (`active` değilken).
- `signup`, `magiclink` → "giriş kodun"; `email_change` → "doğrulama kodun"; diğer türler 200 + mail yok.
- Kanca: Standard Webhooks imzası, ±5 dk, gövde ≤ 64 KB, `webhook-id` ile 10 dk tekilleştirme, Resend'e 4 sn, kendi yeniden denemesi yok.
- GoTrue: `ENABLE_EMAIL_SIGNUP=true`, `MAILER_OTP_EXP=900`, `MAILER_OTP_LENGTH=6`, `GOTRUE_SMTP_MAX_FREQUENCY=60s`, `GOTRUE_RATE_LIMIT_EMAIL_SENT=60`, kanca `GOTRUE_HOOK_SEND_EMAIL_*`.
- Türkçe kısa metinler; `KG_VER` artar; `kontrol.sh --e2e` her görevde; `index.html`'e satır içi `//` yorum ekleme.

## Review Focus

1. **Supabase/GoTrue yavaş ya da kapalı:** "Kod gönder" en çok ~10 sn bekler, sonra "Şu an gönderilemedi, tekrar dene"; sayfa kilitlenmez. → Task 4 e2e (`/auth/v1/user` 10 sn gecikme → hata metni).
2. **Eski anonim token süresi dolmuş (cihaz bir haftadır açılmamış):** giriş başarılı ama birleştirme 401 `eski_suresi_dolmus` → "Giriş yapıldı; bu cihazın eski geçmişi doğrulanamadığı için taşınamadı." → Task 3 testi + Task 4 e2e.
3. **GoTrue kancayı tekrar çağırır (zaman aşımı/yeniden deneme):** aynı `webhook-id` ikinci kez → mail gitmez, önceki yanıt. → Task 2 testi.
4. **`?bagla=1` kayıt kapalı kurulumda ya da odadayken:** yok sayılır, form açılmaz. → Task 4 e2e.
5. **Maç sonu hatırlatması odadan çıkarır:** metin "giriş sayfasına gider" der; yalnız e-postasız kayıtlıda görünür. → Task 4 e2e.

---

### Task 1: `eposta.js` — tek gönderim fonksiyonu ve kod maili şablonu

**Files:**
- Create: `kasaba-gecesi/sunucu/eposta.js`
- Test: `kasaba-gecesi/sunucu/test/eposta.test.js`

**Interfaces:**
- Produces: `olustur({apiKey, gonderen, saglayici, fetch, zamanAsimiMs=4000}) → {sendTransactionalEmail(m) → Promise<{ok:true,id}|{ok:false,neden:'ayarsiz'|'zaman_asimi'|'saglayici'|'ag',durum?}>, kodMaili({tur:'baglama'|'giris',kod,sureDk=15}) → {subject,text,html}, sayac:{gonderilen,hata}}`; `module.exports={olustur, kodMaili, varsayilan: olustur({apiKey:process.env.RESEND_API_KEY, gonderen:process.env.EPOSTA_GONDEREN, saglayici:process.env.EPOSTA_SAGLAYICI})}`.
- Resend: `POST https://api.resend.com/emails`, `Authorization: Bearer <apiKey>`, JSON `{from,to:[to],subject,text,html}`; 2xx → `{ok:true,id:json.id}`; başka durum → `{ok:false,neden:'saglayici',durum}`; `AbortSignal.timeout(zamanAsimiMs)` → `zaman_asimi`; ağ hatası → `ag`. Yeniden deneme **yok** (kanca için GoTrue dener).

- [ ] **Step 1: Failing tests** (`eposta.test.js`): `kodMaili({tur:'baglama',kod:'123456'})` → `subject==='Kasaba Gecesi doğrulama kodun: 123456'`, `text` `/kodun: 123456/` ve `/15 dakika/` içerir, `html` `/<b>123456<\/b>/`, `text` ve `html`'de `http` yok; `tur:'giris'` → `subject` `/giriş kodun/`. `sendTransactionalEmail`: sahte `fetch` (çağrıyı kaydeder, `{status:200,json:()=>({id:'e1'})}` döner) → `{ok:true,id:'e1'}`, istek `url==='https://api.resend.com/emails'`, `headers.Authorization==='Bearer k'`, gövde `from==='Kasaba Gecesi <oyun@munupixi.com>'`, `to:['a@b.c']`; `status:429` → `{ok:false,neden:'saglayici',durum:429}` ve `sayac.hata===1`, tek çağrı (yeniden deneme yok); `apiKey` yokken fetch çağrılmaz, `{ok:false,neden:'ayarsiz'}`; `fetch` 50 ms sonra çözülen, `zamanAsimiMs:10` → `neden:'zaman_asimi'` (fetch'e verilen `signal` iptal edilir).
- [ ] **Step 2:** `cd kasaba-gecesi/sunucu && node --test test/eposta.test.js` → FAIL (`Cannot find module`).
- [ ] **Step 3:** Implement `eposta.js` (şablon metinleri spec §5.4'ten aynen).
- [ ] **Step 4:** PASS. **Step 5: Commit** `Kasaba Gecesi: eposta.js — sendTransactionalEmail (Resend) and the Turkish code mail`.

### Task 2: Kanca ucu `POST /eposta/kanca` (`hesap.js` + `server.js`)

**Files:**
- Create: `kasaba-gecesi/sunucu/hesap.js`
- Modify: `kasaba-gecesi/sunucu/server.js` (405 kuralı; `/eposta/kanca`; `/ayar.json` `eposta`; `/saglik` `eposta` sayaçları), `kasaba-gecesi/sunucu/kimlik.js` (`dogrula` sonucuna `eposta` alanı)
- Test: `kasaba-gecesi/sunucu/test/hesap.test.js`, `kasaba-gecesi/sunucu/test/server.test.js`

**Interfaces:**
- Produces (`hesap.js`): `imzaDogrula({sirlar:string, headers, govde:string, simdiMs}) → {ok:true}|{ok:false,neden:'baslik'|'zaman'|'imza'}` — `sirlar` `v1,whsec_<b64>` (birden çok `|` ile), imzalanan `${webhook-id}.${webhook-timestamp}.${govde}`, HMAC-SHA256 (anahtar = `whsec_` sonrası base64 çözümü), `webhook-signature` içindeki boşlukla ayrılmış `v1,<b64>` girdilerinden biri `timingSafeEqual` ile eşleşir; `|timestamp*1000 - simdiMs| > 300000` → `zaman`. Test yardımcısı `imzala({sir,id,ts,govde}) → headers` de dışa verilir.
- `kancaYukunuCoz(yuk) → {tur:'giris'|'baglama'|null, alici, kod}`: `magiclink`/`signup` → `giris`, `user.email`, `email_data.token`; `email_change` → `baglama`, `user.new_email||user.email_change`, `email_data.token` (**Task 5'te kasaba-test'te doğrulanır; yanlışsa `token_new`'e çevrilir ve test güncellenir**); başka tür ya da alıcı/kod eksik → `tur:null`.
- `kancaIsle({yuk, eposta}) → Promise<{durum:200|500, govde:object}>`: `tur:null` → `{200,{}}` ve `sayac.atlanan++`; gönderim `eposta.sendTransactionalEmail(eposta.kodMaili({tur,kod}))` `to:alici`; `ok` → `{200,{}}`; değil → `{500,{error:{http_code:500,message:'gönderilemedi'}}}`.
- `server.js`: `opts.ayar.kancaSirri` (env `EPOSTA_KANCA_SIRRI`), `opts.eposta` (testte sahte; varsayılan `Eposta.varsayilan`); `ayarAcik()` → `eposta: kayit && !!ayar.kancaSirri`; `/saglik` → `eposta:{gonderilen,hata,atlanan}`; `POST /eposta/kanca` yalnız `kancaSirri` varken (yoksa 404); gövde 64 KB üstü 413; imza red 401 `{error:{http_code:401,message}}`; `webhook-id` 10 dk tekilleştirme (Map, eski kayıtlar temizlenir). Günlük `kanca <tur> <maskeli alıcı>`.
- `kimlik.js`: `dogrula` sonucuna `eposta: typeof b.email==='string'&&b.email?b.email:null`.

- [ ] **Step 1: Failing tests** `hesap.test.js`: `imzala` ile üretilen başlıklar → `imzaDogrula` `ok`; gövde değişince `imza`; `ts` 6 dk eski → `zaman`; başlık eksik → `baslik`; iki sır (`a|b`), ikinciyle imzalı → ok. `kancaYukunuCoz`: magiclink/signup/email_change/recovery dört yük. `kancaIsle`: sahte `eposta` (çağrıları kaydeder; `ok:true`) → 200 ve kaydedilen `to`, `subject` `/123456/`; `ok:false` → 500 gövdesi; `recovery` → 200, çağrı yok, `atlanan` 1.
  `server.test.js`: `createServer({quiet:true, ayar:{...,kancaSirri:SIR}, eposta:sahte})`: imzalı `POST /eposta/kanca` → 200 `{}` ve sahte gönderim 1; aynı `webhook-id` ikinci kez → 200, gönderim yine 1; imzasız → 401; `kancaSirri` yokken 404; `/ayar.json` `eposta:true` (sır + serviceKey varken) ve `false` (sır yokken); `/saglik` `eposta.gonderilen===1`; 405 kuralı diğer POST yollarında sürüyor (`POST /` → 405).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** `node --test test/hesap.test.js test/server.test.js test/kimlik.test.js` PASS; `kontrol.sh`. **Step 5: Commit** `Kasaba Gecesi: send-email hook endpoint — signed GoTrue hook → sendTransactionalEmail`.

### Task 3: Birleştirme ucu `POST /hesap/birlestir`

**Files:**
- Modify: `kasaba-gecesi/sunucu/hesap.js`, `kasaba-gecesi/sunucu/server.js`
- Test: `kasaba-gecesi/sunucu/test/hesap.test.js`, `kasaba-gecesi/sunucu/test/server.test.js` (taklit PostgREST + admin: `test/taklit-rest.js`'e `POST /rest/v1/rpc/hesap_birlestir` → 204 ve `DELETE /auth/v1/admin/users/<uuid>` → 200 dalları eklenir; istekler kaydedilir)

**Interfaces:**
- Produces: `birlestir({eski, yeni}, {dogrula:(token)=>Kimlik sonucu, url, serviceKey, fetch, simdiSn}) → Promise<{durum, govde}>`: doğrulama sırası ve kodları — `400 gecersiz_govde`; `401 eski_gecersiz|yeni_gecersiz` (imza); `401 eski_suresi_dolmus|yeni_suresi_dolmus`; `400 eski_anonim_degil` (`eski.anonim!==true`); `400 yeni_anonim` (`yeni.anonim===true && !yeni.eposta`); `400 ayni_hesap`; RPC `POST {url}/rest/v1/rpc/hesap_birlestir` `{eski:sub, yeni:sub}` (`apikey`+`Bearer` service key, `kayit.js` `istek` gibi) 2xx değilse `502 rpc` ; sonra `DELETE {url}/auth/v1/admin/users/{eski}`; silme 2xx değilse `200 {ok:true, uyari:'eski kullanıcı silinemedi'}`; başarı `200 {ok:true}`. Sayaç `birlestirme:{ok,hata}`.
- `server.js`: `POST /hesap/birlestir` yalnız kayıt açıkken (yoksa 404); JSON gövde ≤ 8 KB; IP başına dakikada 5 (`ipBirlestirme` Map, `ipKurmalar` deseni) → 429 `{error:'limit'}`; `opts.hesapFetch` (testte sahte, varsayılan global `fetch`).

- [ ] **Step 1: Failing tests** (`Kimlik.imzala` ile HS256 token'lar, `secret:'x'`): taze anonim `eski` + e-postalı `yeni` → 200, taklit istekleri sırasıyla `rpc/hesap_birlestir` (gövde `{eski,yeni}` uuid'ler) ve `DELETE …/admin/users/<eski>`; `eski` süresi dolmuş → 401 `eski_suresi_dolmus`, istek yok; `yeni` anonim ve e-postasız → 400; `eski===yeni` → 400; RPC 500 → 502, delete yok; delete 500 → 200 + `uyari`; `yeni` `is_anonymous:true` ama `email` dolu → 200 (kabul); 6. istek aynı IP → 429.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + `kontrol.sh`. **Step 5: Commit** `Kasaba Gecesi: /hesap/birlestir — two fresh tokens, RPC hesap_birlestir, delete the anonymous user`.

### Task 4: İstemci — giriş sayfası hesap formu, çıkış, maç sonu hatırlatma

**Files:**
- Modify: `kasaba-gecesi/index.html` (`renderLanding`, `renderEndUI`, `kimlikHazirla` sonrası durum, `keep` listesi, stiller), `kasaba-gecesi/sunucu/test/e2e.js` (sahte Supabase `route` bloğu genişler; s3 sunucusu `ayar.kancaSirri` + `hesapFetch` sahte ile açılır)

**Interfaces:**
- Consumes: `/ayar.json.eposta`; `POST /hesap/birlestir {eski,yeni}` (Task 3).
- Produces (istemci): `ui.hesap={tur:'bagla'|'gir'|null, adim:'eposta'|'kod'|'birlestir', eposta, hata, bekleBitis, N, eski}`; fonksiyonlar `hesapFormu(pn)`, `hesapKodGonder()`, `hesapDogrula()`, `hesapBirlestir(ekle:boolean)`, `hesapCikis()`; seçiciler: `.hesap-durum` (not metni), `button.hesap-bagla`, `button.hesap-gir`, `#hesapEposta`, `#hesapKod`, `button.hesap-gonder`, `button.hesap-dogrula`, `button.hesap-yeniden` (sayaçlı, 60 sn pasif), `button.hesap-vazgec`, `.hesap-hata`, `.hesap-birlestir` (soru + `button.ekle`/`button.hayir`), `button.hesap-cikis`, son ekranda `a.hesap-hatirlat[href="/?bagla=1"]`.
- supabase-js çağrıları: bağla `sb.auth.updateUser({email})` → `verifyOtp({email, token, type:'email_change'})`; gir: önce `N` (`sb.from('oyun_oyunculari_acik').select('oyun_id',{count:'exact',head:true}).eq('uye',anonUuid)` → `count`), `eski=ls('kg_token')`, `signInWithOtp({email, options:{shouldCreateUser:false}})` → `verifyOtp({email, token, type:'email'})`; sonra `N>0` ise soru, Ekle → `fetch('/hesap/birlestir',{method:'POST',body:{eski, yeni:session.access_token}})`; `N===0` → sormadan aynı çağrı; Hayır → çağrı yok; ardından `location.reload()`. Çıkış: `sb.auth.signOut()`, `localStorage.removeItem('kg_token')`, reload. Hata metinleri spec §5.1 (GoTrue hata kodları: `email_exists`/`user_already_exists` → "bu e-posta başka bir hesaba bağlı…", `otp_expired`/`invalid`→ "Kod yanlış ya da süresi dolmuş", `over_email_send_rate_limit`/429 → "Çok sık istek; 1 dk bekle", `signup_disabled`/`user_not_found`/`otp_disabled` → "Bu e-posta kayıtlı değil; önce ilk cihazında bağla", diğer → "Şu an gönderilemedi, tekrar dene"). Kod gönderme ve doğrulama `Promise.race` ile 10 sn.
- Durum metinleri: e-postasız kayıtlı → "Kimliğin bu tarayıcıda; veriler silinirse geçmiş gider." ("Google ile bağlama yakında" kalkar); bağlı → "Hesabın: a@b.c"; misafir metni aynen.

- [ ] **Step 1: Failing e2e** (c5 bağlamı, sahte Supabase; e2e'de `tablo` ve `suz` var): rotalar eklenir — `PUT /auth/v1/user` → `{...user, new_email:govde.email}`; `POST /auth/v1/otp` → `{}`; `POST /auth/v1/verify` → gövdedeki `token==='123456'` ise e-postalı oturum (`user.email=eposta, is_anonymous:false`, yeni HS256 token `email` alanlı), değilse 403 `{error_code:'otp_expired',msg:'Token has expired or is invalid'}`; `POST /auth/v1/logout` → 204; HEAD `oyun_oyunculari_acik` → `content-range: 0-0/2` (N=2). s3 sunucusu `ayar.kancaSirri:'v1,whsec_'+Buffer.from('s').toString('base64')` ve `hesapFetch` sahte (çağrıları `birlesmeler`'e kaydeder, 200 `{ok:true}`) ile açılır. Senaryolar: (a) giriş sayfasında `.hesap-durum` `/Kimliğin bu tarayıcıda/`, `Google` geçmez, iki düğme var; (b) bağla: e-posta `ben@ornek.com` → gönder → `#hesapKod` görünür → `999999` → `.hesap-hata` `/Kod yanlış/` → `123456` → `.hesap-durum` `/Hesabın: ben@ornek.com/`, `button.hesap-cikis` var, iki düğme yok; (c) `?bagla=1` ile açılınca form `#hesapEposta` hazır; kayıt kapalı sunucuda (base) `?bagla=1` → form yok, `.hesap-bagla` yok; (d) gir (yeni bağlam, e-postasız): e-posta → kod `123456` → `.hesap-birlestir` `/2 oyunu/` → `button.ekle` → `birlesmeler.length===1` ve gövde `{eski,yeni}` iki farklı token, sayfa yenilenmiş ve `.hesap-durum` `/Hesabın/`; (e) gir + Hayır (ayrı bağlam) → `birlesmeler` artmaz; (f) `PUT /auth/v1/user` rotası 11 sn gecikince `.hesap-hata` `/gönderilemedi/` ≤ 11 sn içinde; (g) mevcut maç sonu adımında (base sunucu, kayıt kapalı) `a.hesap-hatirlat` yok; s3'te e-postasız kayıtlı oyuncuyla kısa yol: `renderEndUI`'yi doğrudan sınamak yerine `P.phase='end'` taklidi yapılmaz — bunun yerine `hatirlatGoster()` saf yardımcısı (`ayar.eposta && kayitli && !hesapEposta`) e2e'de `page.evaluate` ile üç girdi için sınanır ve son ekranda `a.hesap-hatirlat` bu yardımcıya bağlıdır (kaynakta grep ile doğrulanır).
- [ ] **Step 2:** FAIL. **Step 3:** Implement; `KG_VER` artır. **Step 4:** `kontrol.sh --e2e` ✓; ekran görüntüleri (masaüstü 900×520, telefon dikey 390×844: form ve "Hesabın" durumu) incelenir. **Step 5: Commit** `Kasaba Gecesi: link your e-mail with a 6-digit code, sign in on a second device, merge history`.

### Task 5: Kurulum betikleri, kasaba-test gerçek denemesi, belgeler

**Files:**
- Modify: `kasaba-gecesi/sunucu/db/kur-supabase.sh` (`--kanca ALAN` [varsayılan `kasaba.munupixi.com`], `--kanca-sir SIR` [yoksa mevcut `.env`'deki korunur, o da yoksa `openssl rand -base64 32`], `ayar` satırları: `ENABLE_EMAIL_SIGNUP true`, `MAILER_OTP_EXP 900`, `MAILER_OTP_LENGTH 6`, `HOOK_SEND_EMAIL_ENABLED true`, `HOOK_SEND_EMAIL_URI https://ALAN/eposta/kanca`, `HOOK_SEND_EMAIL_SECRETS`; çıktıda sır maskeli + "oyun sunucusu env'ine `EPOSTA_KANCA_SIRRI=` olarak yaz" notu), `kasaba-gecesi/sunucu/db/docker-compose.kasaba.yml` (`auth.environment`: `GOTRUE_HOOK_SEND_EMAIL_ENABLED: ${HOOK_SEND_EMAIL_ENABLED}`, `_URI`, `_SECRETS`, `GOTRUE_MAILER_OTP_EXP: ${MAILER_OTP_EXP}`, `GOTRUE_MAILER_OTP_LENGTH`, `GOTRUE_SMTP_MAX_FREQUENCY: 60s`, `GOTRUE_RATE_LIMIT_EMAIL_SENT: "60"`), `README.md` ("E-posta ile hesap bağlama" bölümü), `.claude/skills/kasaba-gecesi/SKILL.md` (dosya tablosu: `eposta.js`, `hesap.js`; yollar; env satırları), `docs/DURUM.md`, `docs/kasaba-gecesi-tanitim.md`, `CLAUDE.md` (Sabit kararlar: kod, şifresiz).

- [ ] **Step 1:** `bash -n` iki betik; `kur-supabase.sh`'nin `.env` yazan kısmı sahte dizinde (`--dizin /tmp/x`, docker'sız) denenemiyorsa `ayar` satırlarının çıktısı `grep` ile doğrulanır.
- [ ] **Step 2: kasaba-test kurulumu** (komut gösterilir): ionos'ta `/etc/games/kasaba-test.env`'e `RESEND_API_KEY` (yerel `~/.resend-kasaba-key`), `EPOSTA_KANCA_SIRRI` satırları; `sudo db/kur-supabase.sh --kanca kasaba-test.munupixi.com` (Supabase yeniden başlar; `uygula.sh --test` 8/8 kalır); `kur.sh kasaba-test … --surum gecmis`; `/ayar.json` → `eposta:true`; `/saglik` → `eposta` sayaçları.
- [ ] **Step 3: Gerçek deneme** (Playwright, scratchpad betiği): kasaba-test'te "E-postanı bağla" → `bariskiremitci@gmail.com` → kod maili → **Gmail bağlayıcısıyla** (`search_threads` "Kasaba Gecesi doğrulama kodun", `get_message`) kod okunur → forma yazılır → "Hesabın: …". Kod yanlışsa (email_change alan karışıklığı) `hesap.js`'te `token`↔`token_new` değiştirilir, test güncellenir, yeniden kurulur. Ardından ikinci bağlam: bir bot maçı ile anonim geçmiş oluştur (Plan 5 `deneme5.js` kısaltılmış) → "Hesabınla gir" → kod (Gmail) → "N oyunu ekle" → Ekle → giriş bloğunda ve `/kasaba`'da tek hesapta; sunucuda `select count(*) from auth.users where is_anonymous` eski kullanıcı yok (SQL dosyayla `scp`). Cloudflare'in GoTrue POST'unu geçirdiği `/saglik eposta.gonderilen` ile görülür. Ekran görüntüleri (telefon dikey dahil) bakılır.
- [ ] **Step 4:** Belgeler; `kontrol.sh`. **Step 5: Commit** `Docs: e-mail linking with a code (plan 6)` (+ betik commit'i ayrı: `Kasaba Gecesi: kur-supabase.sh — send-email hook, OTP settings`).
