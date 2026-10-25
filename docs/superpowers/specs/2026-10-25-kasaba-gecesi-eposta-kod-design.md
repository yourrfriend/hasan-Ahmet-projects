# Kasaba Gecesi — Plan 6: e-posta ile hesap bağlama ve ikinci cihaz (6 haneli kod)

Tarih: 2026-10-25. Önceki tasarım: `2026-10-24-kasaba-gecesi-gecmis-design.md` (§5.2 kimlik, §5.7 arayüz). Bu yazı o tasarımın "Google ile bağlama" kısmının yerine geçer; kullanıcı kararı (2026-10-25): **Google yok, e-posta var; sihirli link değil 6 haneli kod; şifre yok; sağlayıcı Resend; tüm gönderim tek `sendTransactionalEmail()` içinde; oyun olayı için e-posta üretilmez.**

## 1. Amaç

Kayıtlı oyuncu (anonim Supabase kullanıcısı) bugün yalnız o tarayıcıda tanınır: veriler silinirse ya da telefon değişirse geçmişi, kasabası ve tablodaki yeri gider. Bu plan oyuncuya e-postasını hesabına bağlama ve ikinci bir cihazda aynı hesaba girme imkânı verir; ikinci cihazda birikmiş anonim geçmiş istenirse hesaba taşınır (`hesap_birlestir`).

Neden kod, link değil: telefonda maildeki link çoğu zaman mail uygulamasının kendi tarayıcısında açılır, oturum oyunun açık olduğu tarayıcıya düşmez. Kod hangi tarayıcıda olursa olsun oyun sayfasına yazılır.

## 2. Hedefler, hedef olmayanlar, anti-hedefler

Hedefler
- İlk cihazda "E-postanı bağla": adres → kod maili → kod → hesap kalıcı; uuid, geçmiş, kasaba, profil aynen kalır.
- İkinci cihazda "Hesabınla gir": adres → kod → oturum kalıcı hesaba geçer; o cihazdaki anonim geçmiş varsa sorulup taşınır, anonim kullanıcı silinir.
- Tüm e-posta gönderimi tek yerde: `kasaba-gecesi/sunucu/eposta.js` → `sendTransactionalEmail()` (sağlayıcı Resend, değiştirilebilir). GoTrue mail göndermez; "Send Email" kancasıyla gönderimi bize devreder.
- Türkçe, kısa mail; Türkçe, kısa arayüz; telefonda rahat (6 haneli sayısal kutu).
- Maç sonu ekranında bağlamamış kayıtlı oyuncuya tek satır hatırlatma.
- Kayıt kapalı kurulumda ve misafirde (Supabase'e ulaşılamayan) hiçbir yeni düğme görünmez; oyun akışı değişmez.

Hedef olmayanlar
- Şifre, Google/OAuth, hesap silme, e-posta **değiştirme** (bağlı adresi başka adrese taşıma) bu planda yok. (GoTrue bunlara izin verir; sonra eklenebilir.)
- Oyun olayları için e-posta (davet, maç bitti vb.) yok; davetler link ile kalır.
- Birden çok e-postayı tek hesaba bağlama yok.

Anti-hedefler (teknik olarak çalışsa da başarısızlık sayılır)
- Oyun kurma/katılma akışının Supabase'i ya da maili beklemesi.
- Oyun ortasında kimlik değişmesi (koltuk kaybı).
- Kod mailinin spam'e düşmesi ya da 1 dakikadan geç gelmesi (teslim Resend; metin sade, link yok).
- Sunucunun ya da mailin token/uuid/kod sızdırması (günlüklere kod ve token yazılmaz).

## 3. Kısıtlar

- Kimlik modeli §5.2'deki gibi: `uye` (uuid) kalıcı kimlik, `pub_id` oyun içi; süresi dolmuş token oyun için kabul, birleştirme için **iki token da taze** olmalı.
- Supabase tek (kasaba ve kasaba-test aynı GoTrue). GoTrue v2.197.0 (self-hosted v0.8.3): "Send Email" kancası ve manuel bağlama destekleniyor (`GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true` zaten açık).
- Resend: alan `munupixi.com` doğrulandı; gönderen `Kasaba Gecesi <oyun@munupixi.com>`; yalnız gönderim yetkili anahtar (yerelde `~/.resend-kasaba-key`). Ücretsiz katman ayda 3.000.
- Sunucu Node 20+, bağımlılık eklenmez (imza doğrulama ve Resend çağrısı `crypto` + `fetch` ile).
- Mevcut kurallar: gizli bilgi `P`'ye girmez; sunucu yetkili; `KG_VER` artar; Türkçe kısa metin; `kur.sh` `/etc/games/<AD>.env`'deki elle eklenen satırları korur.

## 4. Yaklaşımlar

- **A. GoTrue → SMTP (smtp.resend.com).** En az kod: GoTrue ayarı + şablon URL'si. Ama gönderim GoTrue içinde kalır, `sendTransactionalEmail()` kararı boşa düşer; şablon değişikliği GoTrue yeniden başlatma ister; sağlayıcı değişince iki yerde ayar.
- **B. GoTrue "Send Email" kancası → oyun sunucusu `/eposta/kanca` → `sendTransactionalEmail()` → Resend API.** (Seçilen.) Tüm gönderim tek fonksiyonda, Türkçe şablonlar repoda ve `node:test` ile test edilir; gönderim hatası kullanıcıya döner. Bedeli: kanca ucu + imza doğrulama; Supabase tek olduğu için kanca tek adrese gider (geliştirmede kasaba-test, yayında kasaba); paylaşılan kanca sırrı iki yerde.
- **C. Kodu kendimiz üretip saklamak, oturumu admin API ile açmak.** GoTrue'nun işini yeniden yazmak; elendi.

Kullanıcı B'yi seçti (2026-10-25): "tek gönderim fonksiyonu, sağlayıcı değişebilir, Türkçe şablon" kararlarını ancak B karşılıyor.

## 5. Kararlar

### 5.1 Akışlar

**Bağla (ilk cihaz; giriş sayfası, kayıtlı ve e-postasız oyuncu).**
1. "E-postanı bağla" → adres kutusu → "Kod gönder": istemci `sb.auth.updateUser({email})`. GoTrue adrese `email_change` türünde kod üretir ve kancayı çağırır; biz maili yollarız.
2. 6 haneli kutu → "Doğrula": `sb.auth.verifyOtp({email, token, type:'email_change'})`. Başarıda oturum yenilenir, `session.user.email` dolar, `is_anonymous` false olur; uuid değişmez. Arayüz "Hesabın: a@b.com" der.
3. Hatalar Türkçe: adres biçimi, "bu e-posta başka bir hesaba bağlı — o hesapla girmek için 'Hesabınla gir'", "kod yanlış ya da süresi dolmuş", "çok sık istek, 1 dk bekle", "mail gönderilemedi, tekrar dene". "Kodu yeniden gönder" 60 sn sonra açılır (GoTrue adres başına 60 sn).

**Gir (ikinci cihaz; giriş sayfası, kayıtlı ve e-postasız oyuncu).**
1. "Hesabınla gir" → adres → "Kod gönder": önce bu cihazın anonim kimliğinin oynadığı bitmiş maç sayısı `N` alınır (`oyun_oyunculari_acik` `uye=eq.<anon uuid>`, `count=exact`, `head`; kurulum süzgeci yok — birleştirme tüm kurulumları taşır), eski token `kg_token`'dan `eski` olarak saklanır; sonra `sb.auth.signInWithOtp({email, options:{shouldCreateUser:false}})`. Adres kayıtlı değilse GoTrue hata döner → "Bu e-posta kayıtlı değil; önce ilk cihazında bağla."
2. Kod → `sb.auth.verifyOtp({email, token, type:'email'})`. Başarıda oturum kalıcı hesaba geçer (`yeni` token).
3. `N>0` ise sor: "Bu cihazdaki N oyunu hesabına ekle? Eklemezsen bu oyunlar hesabında görünmez." [Ekle] [Hayır]. Ekle → `POST /hesap/birlestir {eski, yeni}`. Hayır → **hiçbir çağrı yok**: anonim kullanıcı ve maçları olduğu gibi kalır (silinmez; `oyun_oyunculari.uye` set null olup geri dönüşsüz sahipsiz kalmasın). `N=0` ise sormadan birleştirme çağrılır (RPC kasaba sahipliğini/üyeliğini/profili taşır, sonra anonim kullanıcı silinir; böylece `kasabalar.sahip` restrict'ine takılmaz ve yetim kullanıcı birikmez). (Benim kararım; inşaatçı sorusu 1.) `sadeceSil` seçeneği yok.
4. Sonra sayfa yenilenir; giriş bloğu (Plan 5) hesabın geçmişini gösterir. Önemli: eski `kg_uid`/`kg_room` dokunulmaz; oyun içi kimlik yeni oturumdan türer.

**Çıkış.** Bağlı hesapta "Bu cihazdan çık": `sb.auth.signOut()` + `kg_token` temizlenir (2 sn yarışında eski bağlı token'la katılmasın) + yenileme → yeni anonim kimlik. (Paylaşılan cihaz için; benim kararım.)

**Maç sonu hatırlatma.** Kayıt açık ∧ `kayitli` ∧ oturumda e-posta yok → son ekranda tek satır "💾 Geçmişini kaybetme: e-postanı bağla" → `/?bagla=1` (giriş sayfası bağlama formunu açık getirir). Bağlı oyuncuya ve misafire görünmez. Bağlama/giriş **yalnız giriş sayfasında** çalışır (`active` iken form açılmaz): oyun ortasında kimlik değişmez.

### 5.2 GoTrue ayarları (Supabase `.env` + `docker-compose.kasaba.yml`, `db/kur-supabase.sh` üretir)

- `ENABLE_EMAIL_SIGNUP=true` (e-posta sağlayıcısı açık olmadan OTP çalışmaz; kayıt üretimi istemcide `shouldCreateUser:false` ile engellenir, kötü niyetli çağrı en fazla geçmişsiz bir e-posta hesabı açar).
- `ENABLE_EMAIL_AUTOCONFIRM=false` (kalır). `MAILER_OTP_EXP=900` (15 dk), `MAILER_OTP_LENGTH=6`. `GOTRUE_SMTP_MAX_FREQUENCY=60s` (adres başına), `GOTRUE_RATE_LIMIT_EMAIL_SENT=60` (saatte, GoTrue geneli — kasaba ve kasaba-test birlikte; 12 kişilik bir masa + yeniden gönderimler 30'u aşabilirdi; Resend ücretsiz katman günde 100, ayda 3.000 — inşaatçı sorusu 5).
- `GOTRUE_HOOK_SEND_EMAIL_ENABLED=true`, `GOTRUE_HOOK_SEND_EMAIL_URI=https://<KANCA_ALANI>/eposta/kanca` (geliştirmede `kasaba-test.munupixi.com`, yayında `kasaba.munupixi.com`; `kur-supabase.sh --kanca ALAN` ile değiştirilir), `GOTRUE_HOOK_SEND_EMAIL_SECRETS=v1,whsec_<base64>` (sır `openssl rand -base64 32`; `kur-supabase.sh` üretir ya da verileni yazar; aynı değer oyun sunucusunun env'ine `EPOSTA_KANCA_SIRRI` olarak elle girilir, README anlatır).
- SMTP ayarları sahte kalır (kanca açıkken GoTrue SMTP kullanmaz). `SECURE_EMAIL_CHANGE` varsayılan (true) kalır: anonim kullanıcının mevcut e-postası olmadığı için tek adrese tek kod gider; e-posta değiştirme zaten hedef dışı.
- Kanca URI'si Cloudflare üzerinden gider (GoTrue konteynerinin dışarı erişimi var; `host.docker.internal` ve Caddy yoluna gerek yok). GoTrue kancayı 5 sn zaman aşımı ve 3 denemeyle çağırır: uç **eşzamanlı** gönderir, Resend'e en çok **4 sn** verir (yeniden denemeyi GoTrue yapar; `eposta.js` kanca yolunda kendi yeniden denemesini kapatır), `webhook-id` ile son 10 dakikanın çağrılarını tekilleştirir (aynı id → önceki sonuç, mail tekrar gitmez).

### 5.3 Kanca ucu: `POST /eposta/kanca` (`server.js`)

- Yalnız `EPOSTA_KANCA_SIRRI` tanımlıysa açılır; yoksa 404. `server.js`'teki genel "GET/HEAD dışı 405" kuralı bu uç ve `/hesap/birlestir` için açılır.
- **İmza (Standard Webhooks):** başlıklar `webhook-id`, `webhook-timestamp`, `webhook-signature`; imzalanan metin `${id}.${timestamp}.${gövde}`; HMAC-SHA256, anahtar `whsec_` sonrasının base64 çözümü; `webhook-signature` boşlukla ayrılmış birden çok `v1,<base64>` içerebilir, biri eşleşirse geçer (`timingSafeEqual`); `timestamp` şimdiden ±5 dk dışındaysa red. Birden çok sır `|` ile ayrılmış olabilir (dönüşüm için). Gövde en çok 64 KB. Red → 401 `{error:{http_code:401,message}}`.
- **Yük:** `{user:{id,email,new_email?,is_anonymous,...}, email_data:{token, token_hash, redirect_to, email_action_type, site_url, token_new, token_hash_new}}`.
  - `email_action_type==='magiclink'` (ikinci cihaz girişi): alıcı `user.email`, kod `email_data.token`, metin "giriş kodun".
  - `email_action_type==='email_change'` (bağlama): alıcı yeni adres (`user.new_email`; yoksa `user.email_change`), kod **`email_data.token`** (kasaba-test'te gerçek denemeyle doğrulandı, 2026-10-25: anonim kullanıcının e-posta bağlamasında yeni adrese giden kod `token`). Metin "doğrulama kodun".
  - `email_action_type==='signup'`: GoTrue bu türü **doğrulanmamış** e-posta kullanıcısına üretir (anon anahtarla herkes `/auth/v1/otp` `create_user:true` ile bir adrese boş kullanıcı açabilir). Sessiz atlanırsa adres kilitlenir: gerçek sahibi bağlayamaz ("zaten kayıtlı") ve giremez (kod gelmez). Bu yüzden `signup` da **"giriş kodun"** olarak gönderilir (alıcı `user.email`, kod `token`); istemci "Hesabınla gir"de `verifyOtp({type:'email'})` ile açar (GoTrue bu türle signup kodunu da kabul eder; kasaba-test'te doğrulanır). Sonuç: adresi başkası önceden açmış olsa bile sahibi girer, boş hesabı devralır, anonim geçmişini "Ekle" ile taşır. (Benim kararım; inşaatçı sorusu 2.)
  - Diğer türler (`recovery`, `invite`, `reauthentication`, bildirimler): bu kurulumda üretilmemeli; 200 döner, mail yollanmaz, sayaç artar (`/saglik` → `eposta.atlanan`).
- Gönderim `sendTransactionalEmail()` ile; başarı → `200 {}`; sağlayıcı hatası → `500 {error:{http_code:500,message:'gönderilemedi'}}` (GoTrue bunu istemciye hata olarak döner; istemci "mail gönderilemedi, tekrar dene" der).
- Günlük: `kanca ok <tür> <alıcı maskeli a***@gmail.com>`; kod, token, imza **asla** yazılmaz. `/saglik` → `eposta:{gonderilen,hata,atlanan}`.

### 5.4 `eposta.js` — `sendTransactionalEmail({to, subject, text, html})`

- Tek dışa açık fonksiyon; sağlayıcı `EPOSTA_SAGLAYICI` (varsayılan `resend`), `RESEND_API_KEY`, `EPOSTA_GONDEREN` (varsayılan `Kasaba Gecesi <oyun@munupixi.com>`). Anahtar yoksa `{ok:false, neden:'ayarsiz'}` döner (uç 500 verir; `/saglik` sayar).
- Resend: `POST https://api.resend.com/emails`, `Authorization: Bearer`, JSON `{from,to,subject,text,html}`; **4 sn** zaman aşımı (`AbortController`); 2xx → `{ok:true,id}`; başka durum → `{ok:false, neden:'saglayici', durum}`; **yeniden deneme yok** (GoTrue kancayı 3 kez dener). Günlüğe anahtar/kod yazılmaz.
- Sağlayıcı eklemek = `saglayicilar.<ad>` haritasına bir fonksiyon; dışarıya aynı imza. Test için `olustur({fetch})` ile sahte `fetch` verilir (modül `olustur(ayar)` + varsayılan örnek).
- Şablonlar aynı dosyada, saf fonksiyonlar: `kodMaili({tur:'baglama'|'giris', kod, sureDk})` → `{subject, text, html}`. Metin:
  - Konu: `Kasaba Gecesi doğrulama kodun: 123456` (giriş için `giriş kodun`).
  - Gövde (text): `Merhaba! Kasaba Gecesi'nde e-postanı bağlamak için kodun: 123456 — 15 dakika geçerli. Kodu oyun sayfasındaki kutuya yaz. Sen istemediysen bu maili yok say.` HTML aynı metin, kod büyük ve kalın, link yok, görsel yok.

### 5.5 Birleştirme ucu: `POST /hesap/birlestir` (`server.js`)

- Gövde JSON `{eski, yeni}` (token'lar). Yalnız kayıt açıkken (service key var) açılır; yoksa 404.
- Doğrulama (`kimlik.dogrula` ile, mevcut JWKS/secret): iki token da geçerli imzalı ve **süresi dolmamış**; `eski.anonim===true`; `yeni` için "anonim değil **ya da** token'ında `email` dolu" (GoTrue doğrulama sonrası `is_anonymous`'u düşürmese bile kilitlenmesin; iki kalıcı hesabı birleştirmek yine yok); `eski.sub!==yeni.sub`. Aksi 400/401, nedeni kısa kodla (`eski_suresi_dolmus`, `yeni_anonim`…), token metni günlüğe yazılmaz.
- PostgREST `POST /rest/v1/rpc/hesap_birlestir {eski, yeni}` (service_role; mevcut 004 fonksiyonu; `N=0`'da da çağrılır — sahiplik/üyelik/profil taşınır). Sonra GoTrue admin `DELETE /auth/v1/admin/users/<eski>` (service_role; `kayit.js`'in kullandığı anahtar biçimi admin API'de de geçerli mi kasaba-test'te doğrulanır). RPC başarısızsa silme yapılmaz, 502. Silme başarısızsa 200 ama `uyari:'eski kullanıcı silinemedi'` (veri taşındı; yetim kullanıcı zararsız, günlüğe yazılır).
- Yanıt `{ok:true}`; IP başına dakikada 5 (mevcut `ipKurmalar` deseni gibi ayrı sayaç). Bu uç ve kanca ucu WebSocket değil HTTP; Cloudflare hız sınırı kuralı (`/ws`) kapsamaz.

### 5.6 İstemci (`index.html`)

- `/ayar.json`'a `eposta` bayrağı eklenir: kayıt açık ∧ `EPOSTA_KANCA_SIRRI` tanımlı (kanca hedefi olan kurulum). Düğmeler yalnız `ayar.eposta` ile görünür; böylece env satırları girilmemiş bir kurulumda "mail gönderilemedi" ile biten düğme olmaz (inşaatçı sorusu 3).
- Giriş sayfası, `ayar.eposta` ve `kimlikSoz` sonrası (`sb` ve oturum varsa) üç durum:
  - **Misafir** (oturum yok): bugünkü not; düğme yok.
  - **Kayıtlı, e-postasız** (`session.user.is_anonymous`): not "Kimliğin bu tarayıcıda; veriler silinirse geçmiş gider." + iki küçük düğme: "📧 E-postanı bağla", "Hesabınla gir". ("Google ile bağlama yakında" metni kalkar.)
  - **Bağlı** (`session.user.email`): "Hesabın: a***@gmail.com" (tam adres; maskeleme yok — kendi cihazı) + "Bu cihazdan çık".
- Form tek bileşen `hesapFormu(tur)`: e-posta kutusu (`type=email`, `autocomplete=email`), "Kod gönder"; gönderildikten sonra 6 haneli kutu (`inputmode=numeric`, `autocomplete=one-time-code`, `maxlength=6`), "Doğrula", "Kodu yeniden gönder (60)" sayacı, "Vazgeç". Durum `ui.hesap={tur, adim, eposta, hata, bekle}`; yeniden çizimde kutu değerleri korunur (mevcut `keep` listesine `hesapEposta`, `hesapKod` eklenir). `?bagla=1` ile sayfa açılırsa form "bagla" adımında açık gelir (parametre temizlenir).
- `active` iken (odada) form yok. Lobide ve oyun içinde değişiklik yok; son ekranda yalnız hatırlatma satırı (`a.hesap-hatirlat`, `href="/?bagla=1"`, `target=_self`; odadan çıkmak demek olduğu için metin "giriş sayfasına gider" der).
- İkinci cihaz girişi başarınca: `N` sorgusu önceden alınmış; `N>0` → küçük onay kutusu (overlay değil, formun yerinde): "Bu cihazdaki N oyunu hesabına ekle?" [Ekle] [Hayır]. Her iki yol `/hesap/birlestir` çağırır (bkz. 5.1), sonra `location.reload()`.
- `kg_token`: `onAuthStateChange` yeni oturumu zaten yazar; giriş sayfası `token` değişkenini de günceller. `kg_kayitli` dokunulmaz.
- `KG_VER` artar. Stiller mevcut `.panel`/`.row` dili; form `max-width` ile telefonda tek sütun.

### 5.7 Güvenlik ve kötüye kullanım

- **Önceden hesap açma (pre-hijack) kapatıldı (uygulama sırasında eklendi; güvenlik taraması 2026-10-25):** e-posta sağlayıcısı açıkken biri başkasının adresiyle `/auth/v1/signup`'tan şifreli, doğrulanmamış hesap açabilir; sahibi kodla girince hesap doğrulanır ve saldırgan şifresiyle girebilirdi. İki katman: (1) `db/caddy.sh` dış kapıda `/auth/v1/token` için **izin listesi** — ham sorgu dizesi tam olarak `grant_type=refresh_token` ise geçer (CEL `expression`; `query` eşleyicisi çift parametrede herhangi biri eşleşince geçiriyordu, GoTrue ilk değeri okur), geri kalanı 403 (yasak listesi `grant_type=password` bozuk sorguyla — `&x=a;b` — aşılabiliyordu: Caddy `query` eşleyicisi çözümleme hatasında eşleşmez, GoTrue ise parametreyi okur); `/auth/v1/recover` 403; kanca `recovery` maili üretmez. (2) İstemci kodla doğrulamadan hemen sonra (bağla ve gir) hesaba **rastgele 64 karakterlik şifre** atar (`updateUser({password})`): önceden konmuş şifre geçersiz olur. Sahibi "Hesabınla gir" ile boş hesabı devralır. Doğrulama: `curl -X POST '…/auth/v1/token?grant_type=password&x=a;b'` → 403.
- **"Bu cihazdan çık" yalnız bu cihaz:** `signOut({scope:'local'})` (varsayılan `global` diğer cihazların yenileme token'larını da iptal ediyordu).
- **Kanca tekilleştirme:** süren işin promise'i saklanır (eşzamanlı tekrar tek mail), yalnız 200 sonuç 10 dk tutulur; başarısız gönderim silinir ki GoTrue'nun yeniden denemesi gerçekten yeniden göndersin.
- **Mailde tek link:** kurulumun kendi adresi (`https://<ALAN>/`, env `ALAN`), "Sayfa kapandıysa" diye; başka link yok (kullanıcı isteği, 2026-10-25).

- Kanca ucu imzasız/eski istekleri reddeder; sır yalnız env'de. Birleştirme ucu iki taze token ister; token'lar günlüğe yazılmaz.
- Kod mailini kim isteyebilir: herkes (anon anahtarla GoTrue'ya erişen). Tavan: GoTrue'da adres başına 60 sn ve kurulum geneli saatte 60; **kanca ucunda alıcı başına saatte 5** (aşımda 500 → GoTrue istemciye hata döner, mail gitmez; `/saglik eposta.sinir`). Resend ücretsiz katman günde 100 / ayda 3.000.
- `service_role` ve Resend anahtarı yalnız sunucu env'inde; `/ayar.json`'a girmez.
- Birleştirmede `eski` anonim olmalı: kalıcı bir hesabın token'ını ele geçiren kişi başka hesaba taşıyamaz (zaten o hesapla girebilirdi; ek yüzey yok).

### 5.8 Kurulum ve işletme

- `db/kur-supabase.sh`: `.env`'e 5.2'deki satırlar (`ayar` ile; sır yoksa üretir), `docker-compose.kasaba.yml`'e GoTrue `GOTRUE_HOOK_SEND_EMAIL_*`, `GOTRUE_MAILER_OTP_EXP`, `GOTRUE_SMTP_MAX_FREQUENCY` satırları; yeni seçenek `--kanca ALAN` (varsayılan `kasaba.munupixi.com`). Betik tekrar çalıştırılabilir; sırrı korur. Sonunda sırrı ve env satırlarını (maskeli) basar.
- Oyun sunucusu env (`/etc/games/<AD>.env`, `kur.sh` korur): `RESEND_API_KEY=`, `EPOSTA_GONDEREN=` (isteğe bağlı), `EPOSTA_KANCA_SIRRI=v1,whsec_…`. README "Geçmiş ve kullanıcı kaydı" altına "E-posta ile hesap bağlama" bölümü: adımlar, kanca alanını değiştirme, Resend anahtarı, deneme.
- Sıra: kasaba-test env'e anahtar+sır → `kur-supabase.sh --kanca kasaba-test.munupixi.com` → kasaba-test'e kur → gerçek deneme → canlıya alırken `--kanca kasaba.munupixi.com` + kasaba.env satırları. Canlıya çıkış `gecmis` HEAD'i taşır, yani Plan 5 sayfaları da birlikte çıkar (ayrı çıkarılamaz; Plan 5 kararı kullanıcıda — inşaatçı sorusu 4). Doğrulanacak: Cloudflare GoTrue'dan gelen POST'u (`/eposta/kanca`) engellemiyor (WAF/bot koruması); engellerse kural istisnası.
- `/saglik` sayaçları: `eposta:{gonderilen,hata,atlanan}`, `birlestirme:{ok,hata}`.

### 5.9 Test

- `test/eposta.test.js`: `kodMaili` metinleri (Türkçe, kod geçer, tek link kurulumun adresi); `sendTransactionalEmail` sahte `fetch` ile: başarı, 429 → `saglayici` (yeniden deneme yok), anahtarsız `ayarsiz`, zaman aşımı.
- `test/server.test.js`: kanca — doğru imza → 200 ve sahte sağlayıcıya giden mail (alıcı, konu kod içerir); yanlış imza/eski zaman damgası → 401; bilinmeyen tür → 200, mail yok; sağlayıcı hatası → 500. Birleştirme — sahte PostgREST/GoTrue admin (HTTP taklidi, mevcut `kayit.test` deseni): iki taze token → RPC + delete; süresi dolmuş `eski` → 401; `yeni` anonim → 400; IP sınırı.
- `test/e2e.js` (sahte Supabase `route`, Plan 5 altyapısı): kayıtlı-e-postasız giriş sayfasında iki düğme; bağla akışı (`PUT /auth/v1/user` → ok, `POST /auth/v1/verify` → e-postalı oturum) → "Hesabın: …"; ikinci cihaz (`POST /auth/v1/otp`, `/auth/v1/verify`) → N>0 sorusu → `/hesap/birlestir` çağrısı (sunucu testte sahte birleştirici ile) → yenileme; kayıt kapalıda düğme yok; `?bagla=1` formu açar; son ekranda hatırlatma yalnız e-postasız kayıtlıda.
- kasaba-test'te gerçek deneme: Playwright ile bağla → kod maili Barış'ın Gmail'ine gider; kod **Gmail bağlayıcısıyla** (claude.ai Gmail: `search_threads`/`get_message`) okunur → forma yazılır → "Hesabın" görünür; ikinci tarayıcı bağlamında "Hesabınla gir" → kod → birleştirme → `/kasaba` ve giriş bloğunda geçmiş tek hesapta; `auth.users`'ta eski anonim kullanıcı yok (psql ile sayım). Ekran görüntüleri (telefon dikey dahil).

## 6. İnşaatçıya bırakılanlar

- `server.js` içinde kanca/birleştirme uçlarının yerleşimi (ayrı modül `hesap.js` önerilir), gövde okuma sınırı, sayaç adları.
- Standard Webhooks doğrulamasının ayrıntıları (`crypto` ile; bağımlılık yok) ve test vektörleri.
- `email_change` yükünde yeni adres ve kod alanının kesinleştirilmesi (5.3'teki deneme).
- Form ve kutu görünümü (mevcut `.panel` dili), hata metinlerinin son hali, 60 sn sayacı.
- `kur-supabase.sh` seçenek adları; compose satırlarının yazımı.

## 7. Kullanıcıdan gerekenler

- Yok: Resend anahtarı elimizde, alan doğrulandı. Gerçek denemede kod maili Barış'ın Gmail'ine gidecek; Gmail bağlayıcısı bu oturumda bağlı.

## 8. Uygulama notları (2026-10-25)

- `kur.sh` artık `sunucu/*.js`'nin tamamını kopyalar (eposta.js/hesap.js eksik kalınca kasaba-test geri alınmıştı).
- Gerçek deneme kasaba-test'te: bağlama (uuid aynı), ikinci cihazda giriş + "1 oyunu ekle" → RPC + eski anonim kullanıcı silindi; `email_change` kodu `token` alanı. Gmail bağlayıcısı yetkilendirme istediği için kodlar kullanıcıdan alındı.
