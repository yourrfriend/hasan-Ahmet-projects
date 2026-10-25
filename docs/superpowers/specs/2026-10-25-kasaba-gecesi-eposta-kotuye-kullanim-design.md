# Kasaba Gecesi — Plan 7: e-posta kötüye kullanımını engelleme (kod istekleri sunucudan, Turnstile, tavanlar)

Tarih: 2026-10-25. Önceki tasarım: `2026-10-25-kasaba-gecesi-eposta-kod-design.md` (Plan 6: e-posta + 6 haneli kod). Kullanıcı kararı: hem Resend kotası/gönderici itibarı korunacak **hem de** yabancılara istenmeyen kod maili gitmeyecek; yaklaşım **B** (kod istekleri kendi sunucumuzdan geçer).

## 1. Amaç ve neden

Plan 6'da kod maili üreten yollar GoTrue'nun herkese açık uçlarıdır ve anon anahtar herkeste. Bir betik farklı adreslere dağıtarak günde 100'lük Resend kotasını saatler içinde tüketebilir, `munupixi.com`'un gönderici itibarını yıpratabilir ve oyunla ilgisi olmayan kişilere mail gönderebilir. Kanca isteği kimin yaptığını bilmez (IP yok), bu yüzden kanca tarafı tavanları yetmez. Çözüm: mail üreten her istek bizim sunucumuzdan geçer (insan doğrulaması + IP/adres/küresel tavanlar), GoTrue'nun herkese açık mail uçları dış kapıda kapanır; GoTrue kodu üretmeye ve kancayla bize vermeye devam eder.

## 2. Hedefler, hedef olmayanlar, anti-hedefler

Hedefler
- Mail üreten tek herkese açık giriş: `POST /eposta/kod` (oyun sunucusu). Turnstile doğrulaması, IP / adres / küresel tavanlar, `/saglik` sayaçları ve uyarı.
- GoTrue'nun `/auth/v1/signup`, `/otp`, `/magiclink`, `/resend`, `/recover` ve `PUT /auth/v1/user` uçları dış kapıda 403. **Anonim giriş de bizim sunucumuzdan** (`POST /hesap/anonim` → yerel GoTrue `/signup {}` → oturum istemciye). E-postalı kayıt hiçbir yoldan açılamaz: "başkasının adresiyle önceden hesap açma" kökten biter (inşaatçı kontrolü: `DISABLE_SIGNUP=true` anonim girişi de kapattığı için bayrak yerine kapı+vekil).
- Oyuncu deneyimi: "Kod gönder"e dokununca görünmez Turnstile (çoğunlukla fark edilmez; ara sıra kutu); anonim giriş ve oyun akışı değişmez.
- Günlük tavan Resend ücretsiz katmanın (100/gün) altında; aşımda kullanıcıya dürüst metin ("bugünlük sınır doldu, yarın tekrar dene").

Hedef olmayanlar
- Resend bounce/complaint webhook'u (sonraki); ücretli Resend katmanı; e-posta değiştirme; SMS.

Anti-hedefler
- Anonim girişte ya da oyun açılışında gecikme/CAPTCHA (Turnstile yalnız "Kod gönder"de).
- Oyuncunun kodunu alamaması: meşru bir kişi 15 dk içinde 2–3 kez kod isteyebilmeli.
- Sunucumuzun Supabase'e ulaşamadığı anda oyun akışının bozulması (kod akışı "şu an gönderilemedi" der, oyun sürer).

## 3. Kısıtlar

- Oyun sunucusu ve Supabase aynı makinede (ionos); Supabase ağ geçidi `127.0.0.1:8000`'de dinler. Dış kapı Caddy `db/caddy.sh`.
- Turnstile betiği Cloudflare'den yüklenir (`https://challenges.cloudflare.com/turnstile/v0/api.js`): bu depoda CDN'siz çalışma ilkesinin **tek istisnası**; yüklenemezse kod isteği yine çalışır ama sunucu Turnstile yokken reddeder → metin "doğrulama yüklenemedi, sayfayı yenile". (Kullanıcı Turnstile'ı seçti.)
- Bağımlılık eklenmez (`fetch` ile siteverify). Türkçe kısa metin; `KG_VER` artar; kod/token/sır günlüğe yazılmaz.
- Plan 6'nın kararları korunur: kod (link değil), şifresiz, kanca → `sendTransactionalEmail()`, "Hayır" → çağrı yok.

## 4. Yaklaşımlar

- **A. GoTrue'nun kendi CAPTCHA desteği (küresel).** Az kod ama anonim girişi de kapsar (her yeni tarayıcıda Turnstile), 2 sn kimlik yarışı misafire düşebilir; `PUT /user` yolu kapsanmayabilir.
- **B. Kod istekleri kendi sunucumuzdan (seçilen).** `POST /eposta/kod` Turnstile + tavanlar; GoTrue'ya yerel adresten istek; herkese açık mail uçları kapıda 403; `DISABLE_SIGNUP=true`. Daha çok kod, tüm denetim bizde, anonim giriş serbest.
- **C. Yalnız tavan + uyarı.** Kota korunur, yabancıya mail gitmesi engellenmez. Elendi (ikinci hedefi karşılamaz).

## 5. Kararlar

### 5.1 Akış

1. İstemci "Kod gönder": Turnstile belirteci alınır (`turnstile.render` görünmez kip, `execute`), `POST /eposta/kod {tur:'bagla'|'gir', email, turnstile, token}` — `token`: bağla için oyuncunun kendi erişim token'ı (GoTrue'ya onun adına `PUT /user` yapılacak); gir için gereksiz.
2. Sunucu sırayla: gövde/biçim → IP tavanı → Turnstile siteverify (`POST https://challenges.cloudflare.com/turnstile/v0/siteverify` `{secret, response, remoteip}`; 5 sn) → adres tavanı → küresel saatlik/günlük tavan → GoTrue'ya **yerel adres** üzerinden (`SUPABASE_IC_URL`, ör. `http://127.0.0.1:8000`; `apikey` anon) istek:
   - bağla: `PUT /auth/v1/user {email}` başlık `Authorization: Bearer <token>` (GoTrue `email_change` kodu üretir → kanca → mail).
   - gir: `POST /auth/v1/otp {email, create_user:false}` (GoTrue `magiclink` kodu → kanca → mail).
3. GoTrue hata kodu istemciye aynen aktarılır (`error_code`/`msg`; istemci Plan 6'daki metinleri kullanır). Sunucu kendi redlerinde: `429 {error:'limit', sure:<sn>}`, `403 {error:'turnstile'}`, `503 {error:'kota'}` (günlük tavan).
4. Doğrulama değişmez: istemci `verifyOtp` ile `POST /auth/v1/verify` (herkese açık kalır; kod olmadan işe yaramaz). Şifre döndürme (`PUT /user {password}`) **kaldırılır**: e-postalı kayıt hiç açılamadığı için gereksiz (testler güncellenir).
6. **Anonim giriş:** istemci açılışta `signInAnonymously` yerine `POST /hesap/anonim {}` çağırır (10 sn; 2 sn kimlik yarışı aynen); sunucu IP tavanı (saatte 10 yeni anonim kimlik) → yerel GoTrue `POST /auth/v1/signup {}` (apikey anon) → yanıtı (session) aynen döner; istemci `sb.auth.setSession({access_token, refresh_token})` ile oturumu kurar (yenileme sonraki yüklemelerde supabase-js'te, `/token?grant_type=refresh_token` açık). Sunucuya ulaşılamazsa misafir (bugünkü gibi).
5. "Kodu yeniden gönder" aynı uçtan; 60 sn sayaç istemcide kalır, sunucu adres tavanıyla da korur.

### 5.2 Tavanlar (sunucu, bellek içi; servis yeniden başlarsa sıfırlanır — kabul)

| Anahtar | Sınır | Aşımda |
|---|---|---|
| IP | 10 dakikada 3 kod isteği, saatte 6 | 429 "Çok sık istek; biraz sonra dene." |
| Adres (küçük harf) | saatte 3, günde 6 | 429 aynı metin |
| Küresel (kurulum başına, env `KOD_GUNLUK`; kasaba 80, kasaba-test 20; saatlik `KOD_SAATLIK` 30) | Resend 100'ün altında; GoTrue saatte 60 kalır | 503 "Bugünlük kod sınırı doldu; yarın tekrar dene." + günlük `UYARI` satırı |
| Kanca (tek boğaz; `KANCA_GUNLUK` 90) | iki kurulum birlikte 100'ü aşmasın | 500 → GoTrue hata → istemci "gönderilemedi" (ikinci kat; normalde kurulum tavanları önce durdurur) |
| Anonim kimlik (`/hesap/anonim`) | IP başına saatte 10 | 429; istemci misafir kalır (bugünkü davranış) |
| Turnstile başarısız | — | 403 "Doğrulama başarısız; sayfayı yenile." |

Kanca tarafındaki alıcı başına saatte 5 kalır (ikinci kat). `/saglik` → `kod:{istek,gonderildi,ip_sinir,adres_sinir,kota,turnstile_red}`; ayrıca sunucu günlüğüne `UYARI kod kota` satırı (journald'den görülür; e-posta/uyarı kanalı yok — hedef dışı).

### 5.3 Dış kapı (`db/caddy.sh`)

- `/auth/v1/token`: yalnız ham sorgu `grant_type=refresh_token` (Plan 6, kalır).
- **403:** `/auth/v1/signup`, `/auth/v1/otp`, `/auth/v1/magiclink`, `/auth/v1/resend`, `/auth/v1/recover`, `/auth/v1/user` için **PUT** (GET kalır). Caddy: `@userYaz { path /auth/v1/user; method PUT }`.
- Açık kalanlar (inşaatçı doğruladı, supabase-js bunlara takılmaz): `POST /auth/v1/verify`, `POST /auth/v1/logout`, `GET /auth/v1/user`, `/auth/v1/settings`, `/auth/v1/health`, `/auth/v1/.well-known/jwks.json`, `/rest/*`, `/realtime/*`, `/storage/*`.
- **Gerçek IP GoTrue'ya ulaşsın:** tünel kipinde cloudflared → Caddy → api-gw zincirinde GoTrue herkesi `127.0.0.1` görüyor olabilir (IP başına `RATE_LIMIT_VERIFY`, `RATE_LIMIT_ANONYMOUS_USERS` o zaman küresel çalışır: tek saldırgan herkesin `verify`'ını kilitler). Supabase Caddy parçasına `reverse_proxy { trusted_proxies private_ranges }` eklenir; doğrulama: anonim giriş sonrası `auth.audit_log_entries.ip_address` gerçek IP'yi göstermeli (psql).
- Sunucu ↔ GoTrue: yerel adres (`SUPABASE_IC_URL`); ionos'ta `http://127.0.0.1:8000`. Tanımsızsa `/hesap/anonim` ve `/eposta/kod` 503 döner ve açılışta `UYARI` yazılır (dış adres kapalı olduğu için işe yaramaz).

### 5.4 GoTrue ayarları (`db/kur-supabase.sh`)

- Değişmez: `DISABLE_SIGNUP=false` (anonim giriş için gerekli), `ENABLE_EMAIL_SIGNUP=true` (OTP için), OTP 6 hane/15 dk, kanca, saatte 60. E-postalı kayıt dış kapıda `/signup` 403 ile kapalı; sunucumuz GoTrue'ya yalnız `{}` gövdeli (anonim) signup iletir.

### 5.5 Turnstile

- Widget **var** (kullanıcı açtı, 2026-10-25): site anahtarı `0x4AAAAAAFlQGHDJqXliNaR0` (gizli değil; `/ayar.json` → `turnstile`), gizli anahtar yerelde `~/.turnstile-kasaba` (600) ve sunucuda `/etc/games/<AD>.env` `TURNSTILE_SECRET=` (Cloudflare'in akış belgesindeki ad). Gizli anahtar sohbete yapıştırıldığı için kurulum bitince Cloudflare panelinden **Rotate secret** yapılıp yeni değer env'lere yazılmalı (kullanıcıdan gerekenler). Widget yeniden yaratılmaz; alanlar `kasaba.munupixi.com`, `kasaba-test.munupixi.com` (`localhost` üretimde yok).
- Widget türü **Managed** (kullanıcı doğruladı). İstemci (Cloudflare akış belgesi): betik `https://challenges.cloudflare.com/turnstile/v0/api.js` `async defer`, yalnız kayıt+e-posta açık kurulumda ve form açılınca yüklenir; widget **açıkça** `turnstile.render(el,{sitekey, action:'kod_bagla'|'kod_gir', appearance:'interaction-only', execution:'execute', callback, 'error-callback'})` ile formun içinde görünür bir kapsayıcıya çizilir (`display:none` olamaz; etkileşim gerekirse kutu orada çıkar), widget kimliği tutulur, her "Kod gönder"de `turnstile.execute(id)` ile belirteç alınır; belirteç tek kullanımlık — istek bitince (başarılı ya da değil) `turnstile.reset(id)`, sonra yeniden gönderime izin. Betik yüklenemezse "Doğrulama yüklenemedi; sayfayı yenile."
- Sunucu: belirteç yoksa ya da 2048 karakterden uzunsa siteverify'a gitmeden 403; `POST …/siteverify` form kodlu `secret`, `response`, `remoteip`, 10 sn; `success===true` **ve** `action` beklenen yüzeyle eşit **ve** `hostname` izin listesinde (`TURNSTILE_HOSTNAMES`, virgülle; varsayılan `ALAN`; üretimde `localhost`/`127.0.0.1` yok) değilse 403; siteverify'a ulaşılamazsa **red** (fail-closed), metin "Doğrulama şu an yapılamıyor, tekrar dene". Yanıttaki `error-codes` yalnız sayaçta (`invalid-input-response` vb.), günlükte belirteç yok.
- Testler: Turnstile sahte (`opts.turnstileDogrula` ya da `fetch` taklidi); e2e'de `window.turnstile` sahtesi (`render` → hemen `callback('sahte')`).
- Yerel geliştirme: Cloudflare'in test anahtarları (`1x00000000000000000000AA` / gizli `1x0000000000000000000000000000000AA`, her zaman geçer) `.env`'e yazılabilir; README.

### 5.6 İstemci

- `hesapKodGonder` artık `sb.auth.updateUser`/`signInWithOtp` çağırmaz; `POST /eposta/kod` çağırır (10 sn). Hata metinleri Plan 6 + yeni üç metin (limit/kota/turnstile). Form ve akışın geri kalanı aynı.
- `verifyOtp` sonrası `updateUser({password})` kaldırılır (5.1-4).
- `ayar.turnstile` yoksa (kurulumda anahtar girilmemiş) düğmeler yine görünür ama "Kod gönder" sunucudan `403 turnstile` alır → metin "Bu kurulumda doğrulama ayarlı değil" (operatör hatası görünür olsun). (Benim kararım.)

### 5.7 Güvenlik

- Mail üreten tek yol sunucumuz; Turnstile + üç tavan + kanca alıcı/günlük tavanı + GoTrue tavanı + Resend kota. Anonim kimlik üretimi de sunucumuzdan ve IP tavanlı. `verify` ucu kodsuz işe yaramaz (6 hane, 15 dk; GoTrue deneme sınırı).
- `PUT /user` dış kapıda kapalı → bağla yalnız bizim uçtan; token istemciden gövdede gelir, sunucu yalnız GoTrue'ya iletir (saklamaz, günlüğe yazmaz).
- `/signup` dış kapıda kapalı → e-postalı kayıt imkânsız → önceden hesap açma biter; `grant_type` izin listesi kalır.
- Sunucu Turnstile gizli anahtarını ve `SUPABASE_IC_URL`'i yalnız env'den okur.

### 5.8 Kurulum ve işletme

- `/etc/games/<AD>.env`: `TURNSTILE_SECRET=`, `TURNSTILE_SITE=0x4AAAAAAFlQGHDJqXliNaR0` (istemciye `/ayar.json` ile), `TURNSTILE_HOSTNAMES=` (isteğe bağlı; varsayılan `ALAN`), `SUPABASE_IC_URL=http://127.0.0.1:8000`, `KOD_GUNLUK=` (kasaba-test 20). `kur.sh` korur; dosya git dışı ve 600.
- `db/caddy.sh`: yeni 403 kuralları + `trusted_proxies`; README'ye kontrol curl'leri. **Dikkat:** `/signup` 403 kuralı yalnız sunucu `/hesap/anonim` ile kurulduktan sonra uygulanır; canlı `kasaba` (eski sürüm) `signInAnonymously` ile doğrudan `/signup`'a gittiği için **kural canlı sürüm güncellenmeden açılamaz** — Supabase kapısı tek olduğundan kasaba-test denemesi kuralı geçici olarak kapalı bırakıp (yalnız `/otp`, `PUT /user` vb. kapalı) yapılır, `/signup` 403 canlıya geçişle birlikte açılır. (Benim kararım; aksi canlıdaki oyuncuları misafire düşürürdü.)
- Sıra: kod → kasaba-test (kapı: `/signup` hariç yeni kurallar) → gerçek deneme (Turnstile gerçek, kodlar Gmail'den) → canlı: env satırları + `/yayinla` + `caddy.sh --signup-kapali` → doğrulama.

### 5.9 Test

- `test/kod.test.js` (saf `kod.js`): tavan hesapları (IP/adres/küresel, zaman pencereleri), karar sırası, metinler.
- `server.test.js`: `POST /eposta/kod` — sahte Turnstile (geçer/geçmez/ulaşılamaz) + sahte GoTrue (`taklit-rest.js`'e `/auth/v1/user` PUT ve `/auth/v1/otp` POST dalları; `Authorization` başlığı doğru token'la mı); 429/503/403 dalları; `/saglik` sayaçları; `SUPABASE_IC_URL` kullanılıyor mu.
- e2e: sahte `window.turnstile`; bağla ve gir akışı `POST /eposta/kod` üzerinden; limit metni; Turnstile betiği yüklenemezse metin.
- kasaba-test: gerçek Turnstile + gerçek kod; **aynı belirteç ikinci kez** → 403 (tek kullanımlık, Cloudflare belgesinin doğrulama adımı); dış kapı curl'leri (`/otp` 403, `PUT /user` 403; `/signup` canlı geçişine kadar açık, sonra 403 ve `/hesap/anonim` ile anonim giriş); `audit_log_entries.ip_address` gerçek IP.

## 6. İnşaatçıya bırakılanlar

- `kod.js`'in iç yapısı (sayaç pencereleri `Map` + zaman damgası listeleri, temizlik), `server.js`'te uç yerleşimi.
- Turnstile widget'ının DOM yerleşimi (görünmez; hata kutusu formun altında).
- Caddy kural yazımı ve sırası (izin listesi `handle`'ları `@api`'den önce).

## 7. Kullanıcıdan gerekenler

- ~~Turnstile widget'ı~~ alındı (2026-10-25). Kurulum bitince Cloudflare'de **Rotate secret** (anahtar sohbetten geçti) ve yeni değerin bana verilmesi (dosyaya yazılır).
