# Kasaba Gecesi — Oyuncular, Kasaba, Geçmiş ve Hikâye

Tarih: 2026-10-24 · Dal: `gecmis` · Durum: denetleyici okudu, sorular yanıtlandı; kullanıcı onayı bekliyor

## 1. Niyet ve neden

Bugün Kasaba Gecesi bir oyun bittiğinde her şeyi unutuyor: oyuncu tarayıcıdaki rastgele bir anahtar,
oda ve oyun bellekte, servis yeniden başlayınca hepsi gidiyor. Oyunu "gerçek bir oyun" yapan şey
oyunlar arasında kalan hafızadır: kiminle oynadım, kim kazandı, dün gece aslında ne oldu, bu grupta
kim en iyi. Bu tasarım oyuna kalıcı oyuncular, grup (kasaba), oyun geçmişi ve oyun bitince izlenen
"gece gece hikâye" ekler.

Kimler oynuyor: hem sabit bir arkadaş/aile çevresi hem internetten yabancılar. Bu yüzden kimlik
sıfır sürtünmeyle başlar (giriş yok), isteyen hesabını bağlar; sıralamalar grup içinde anlamlıdır.

## 2. Hedefler, hedef olmayanlar, anti-hedefler

Hedefler (ilk sürüm):

- Oyuncu oyunlar arasında tanınır; hiçbir giriş ekranı olmadan başlar, isterse hesabını Google ile bağlar.
- Her oyun bir kasabaya yazılır. Ev sahibinin ilk odasıyla kasabası kendiliğinden kurulur, adı değiştirilebilir.
- Oyun bitince: maç özeti (kazanan, herkesin rolü ve akıbeti, oyuncunun kendi payı), büyük "Tekrar oyna",
  ve oyunun hikâyesi (gece gece kim kime gitti, kim kurtarıldı, kim yakalandı; gündüz oylar ve sonuç).
- Sayfa açılınca: "Son oyunların" listesi, satıra dokununca özet ve hikâye; kişisel kart (oyun, kazanma, en çok çıkan rol).
- Kasaba sayfası: üyeler ve sıralama (oyun, kazanma, kazanma yüzdesi, en çok çıkan rol).
- Oyun, kayıt sistemi çalışmasa da aynen oynanır.

Hedef olmayanlar (sonraya):

- Herkese açık, kasabalar arası sıralama.
- E-posta ile giriş, şifre; Google dışında sağlayıcı.
- Sohbetin saklanması.
- Tek tek oyların saklanması ya da gösterilmesi: oyun içi söz ("oylar gizli, sonunda sadece toplamlar açıklanır")
  oyun bittikten sonra da geçerlidir. Yalnız toplamlar ve asılan kaydedilir. (Kullanıcının kararı.)
- Oyun sırasında canlı izleme/replay; ölülerin hikâyeyi oyun bitmeden görmesi.
- Odaların servis yeniden başlayınca geri gelmesi (odalar bellekte kalır).

Anti-hedefler (bunlar olursa iş başarısızdır):

- Oyun sırasında gizli bilgi sızar (rol, gece hamlesi, oy hedefi). Hikâye yalnız bitmiş oyun için açılır.
- Oyun sunucusu Supabase'e bağımlı olur: Supabase yavaş ya da kapalıyken oda açılmaz, faz geçmez.
- "Tek sunucu, tek betik" taşınabilirliği bozulur: yeni sunucuya `kur.sh` + Supabase klasörü + yedekle taşınamaz hale gelir.
- Oyuncuyu giriş ekranıyla karşılamak.

## 3. Kısıtlar

- Mevcut mimari korunur: `game.js` ağdan ve veritabanından bağımsız; `server.js` tek süreç, odalar bellekte;
  istemci tek dosya `index.html`; gizli durum `R.g`'de, istemciye yalnız `P` ve `privFor` gider. (Proje
  becerisindeki "dokunulmaz kurallar" aynen geçerli.)
- Oyuncunun açık kimliği (`pubId`) tüm yayınlarda, gizli anahtar hiçbir yayında geçmez. Bu ayrım kalır.
- Kurulum: ionos (Plesk, 80/443 Apache'de), oyun Cloudflare Tunnel kipinde (`kur.sh --kip tunel`,
  Caddy `127.0.0.1:8080`). Node 20. Docker var. 13 GB boş RAM.
- Supabase kendi sunucuda ve **ayrı** bir kurulum olacak (mevcut `retracted-authors` kurulumuna dokunulmaz).
- Türkçe arayüz, kısa metinler, telefonda yatay.

## 4. Yaklaşımlar

| | Nasıl | Artı | Eksi |
|---|---|---|---|
| A | Aynı sunucuda SQLite (Node 22'nin yerleşik `node:sqlite`), sayfalar aynı sunucudan | Sıfır bağımlılık, yedek = dosya kopyası, en basit taşıma | Giriş için ileride yine dış servis gerekir; kim neyi görür kuralları elle yazılır |
| B | Supabase (Postgres + Auth + RLS), kendi sunucuda ayrı kurulum | Anonim kullanıcı → Google bağlama hazır; görünürlük kuralları veritabanında; panel hazır | İkinci bir sistem (Docker paketi, 2–3 GB RAM), bakım; oyun sunucusu her kayıtta ona yazar |
| C | Veritabanı yok, her oyun bir dosya | En basit başlangıç | "Ali'nin oyunları", sıralama gibi sorular için tarama; büyüyünce kendi veritabanını yazarsın |

**Seçim: B** (kullanıcının kararı; A önerilmişti, itirazlar: ikinci sistem, bakım, bağımlılık riski).
B'nin karşılığında anti-hedef olarak "oyun Supabase'e bağımlı olmaz" konuldu ve yazma kuyruklu/
arka planda yapılır (§5.5). Konum: **ionos, oyunun yanında** (benim kararım; gerekçe: yazma yerel ağdan,
taşıma tek yerden, Plesk'e dokunmadan tünel üzerinden dışarı açılır). netcup16gb1 de olurdu; o zaman
iki sunucu da ayakta olmalıydı.

Kullanıcının seçtikleri: adlı kasaba (sıfır kurulumla), gece gece hikâye, hesap bağlama isteğe bağlı.

## 5. Kararlar

### 5.1 Modüller ve aralarındaki kapılar

1. **Olay günlüğü** (`game.js`): oyun sırasında olayları `R.log` dizisine ekler. Tek kaynak budur; özet,
   hikâye, istatistik ve sıralama hep buradan türetilir, ayrıca saklanmaz.
2. **Kayıt** (`server.js` → `kayit.js`): `R.log`'u boşaltıp Supabase'e yazar; kuyruk, yeniden deneme.
   Supabase yoksa (ayar boş) hiç çalışmaz; oyun fark etmez.
3. **Kimlik** (`server.js` + istemci): Supabase Auth anonim kullanıcı; bağlama Google.
4. **Kasaba**: tablo ve kurallar veritabanında; oyun sunucusu yalnız "bu oyun şu kasabanın" der.
5. **Sayfalar**: geçmiş, oyun özeti/hikâye, kasaba; Supabase'i doğrudan okur (RLS korur).

Kural: `game.js` Supabase'i bilmez; `server.js` SQL bilmez (yalnız `kayit.js` üzerinden yazar);
sayfalar oyun sunucusuna değil Supabase'e sorar.

### 5.2 Kimlik

- İstemci açılışta `supabase-js` ile anonim oturum açar (`signInAnonymously`). Kullanıcı kimliği (uuid)
  tarayıcıda Supabase'in kendi deposunda durur; bugünkü `kg_uid` yalnız yedek olarak kalır.
- `join` mesajı `token` (Supabase access token) taşır. Sunucu token'ı yerelde doğrular (HS256, Supabase JWT
  gizli anahtarı; ağ çağrısı yok); imza doğruysa oyuncu kimliği `sub` (uuid) olur, `pubId` ondan türer.
  **Süresi dolmuş ama imzası doğru token kimlik için kabul edilir** (benim kararım): tehdit modeli bugünkü
  `kg_uid` ile aynıdır ve oyun ortasında Supabase'e ulaşılamazsa oyuncu koltuğunu kaybetmez. İstemci son
  token'ı `localStorage`'da saklar ve yenileme başarısız olsa da `join`'de onu yollar. Ayrıca GoTrue
  `JWT_EXPIRY` 1 hafta yapılır.
- Terimler: **kayıtlı** = geçerli imzalı token'ı olan oyuncu (anonim Supabase kullanıcısı dahil; Google
  bağlamış olması gerekmez). **Misafir** = token'sız oyuncu (Supabase kapalı/ayarsız ya da istemci oturum
  açamadı): bugünkü yol, `kg_uid` → `pubId`; oyunu oynar, geçmişi yazılmaz, kasaba kurmaz; istemci bunu
  küçük bir notla söyler.
- "Hesabını bağla" (ilk cihaz): Supabase Auth `linkIdentity({provider:'google'})`; uuid aynı kalır.
  Google için Supabase'de OAuth istemci kimliği gerekir (kullanıcı Google Cloud'dan alır; §7).
- **İkinci cihaz** (Google zaten başka bir anonim kullanıcıya bağlı): `linkIdentity` çalışmaz; istemci
  `signInWithOAuth` ile girer. Girişten sonra istemci sorar: "Bu cihazdaki N oyunu hesabına ekle?" Evet
  derse `POST /hesap/birlestir {eski_token, yeni_token}` çağrılır (oyun sunucusu, `service_role`):
  iki token da doğrulanır (eski anonim uuid'nin sahipliği eski token'la kanıtlanır), `oyun_oyunculari.uye`,
  `kasabalar.sahip`, `kasaba_uyeleri` (aynı kasabada iki kayıt → tekilleştir, 'sahip' baskın) yeni uuid'ye
  taşınır, `profiller`'de yeni olan kalır, eski anonim kullanıcı Auth admin API ile silinir. Tek işlem (transaction),
  RPC fonksiyonu `hesap_birlestir(eski uuid, yeni uuid)` olarak veritabanında yazılır. (Kullanıcının kararı.)
- Görünen ad, renk, şapka: `profiller` tablosunda (uuid → ad, renk, şapka, güncellenme). Oyuncu lobide
  adını yazınca sunucu profili günceller (yalnız kayıtlı oyuncu için).
- Açık kimlik (`pubId`) uuid'nin hash'i olmaya devam eder: yayınlarda uuid geçmez.

### 5.3 Kasaba

- `kasabalar(id uuid, ad, sahip uuid, olusturma)`; `kasaba_uyeleri(kasaba_id, uye uuid, rol: 'sahip'|'uye', katilma)`.
- Kayıtlı bir ev sahibinin ilk oyunu **başladığında** kasabası yoksa kurulur: ad `"<Ad>'ın Kasabası"`
  (oda açılışında değil: boş kalan odalar kasaba üretmesin). Sonraki oyunları aynı kasabaya yazılır.
  (Bir kişinin birden çok kasabası: sonraya; şema izin verir.)
- Oyun başladığında oyundaki kayıtlı oyuncular kasabaya üye olur (yoksa). Misafirler üye olmaz.
- Kasaba sayfasında sahip adı değiştirir. Üye çıkarma, başka kasabaya taşıma: sonraya.
- Misafir ev sahibi: oyun oynanır, kasabasız; kayıt **yazılmaz** (kimse göremezdi). Oyun sonu özeti yine
  görünür, çünkü özet Supabase'den değil oyun sunucusundan gelir (§5.7).

### 5.4 Olay günlüğü (şema ve olaylar)

Tablolar:

- `oyunlar(id uuid, kasaba_id, kurulum text, oda_kodu, baslama, bitis null, sonuc: 'devam'|'bitti'|'iptal',
  kazanan_takim, kazanan_metin, oyuncu_sayisi, ayarlar jsonb)` — `kurulum`: `kur.sh` kurulum adı
  (`kasaba`, `kasaba-test`); test kurulumu aynı veritabanına yazar ama sayfalar ve görünümler kendi
  kurulumlarının oyunlarını gösterir (`/ayar.json` kurulum adını verir).
- `oyun_oyunculari(oyun_id, uye uuid null, pub_id, ad, renk, sapka, rol_key, takim, deli_gibi null,
  calinan_rol null, sonunda_sag bool, olum_gunu null, olum_sekli null)` — uuid misafirde null.
- `olaylar(oyun_id, sira int, gun int, faz, tur, veri jsonb)`; (oyun_id, sira) birincil.

Olay türleri (`tur`) ve `veri`; oyuncular her yerde `pub_id` ile geçer:

- `baslangic`: ayarlar, rol listesi (açık), oyuncu listesi.
- `gece_hamle`: `{kim, tur:'kill'|'ab'|'self'|'det'|'guess', hedef, tahmin}` — her hamle çözümde
  (`resolveNight`) etkin haliyle yazılır (hain öldürmeyi seçtiyse yetenek düşer; `R.g.acts` ham hali değil).
- `gece_sonuc`: `{ziyaretler:{ev:[gelenler]}, tutulan:[], tuzak:[{kim, ev}], kurtarilan:[], yelek:[],
  olenler:[{kim, sekil, kimden}], caldi:{hirsiz, kurban, yeni_rol}, bombalar, yildirim, ispiyon, provokasyon,
  mum, haberler:[metin]}` — bugün `M` ve notlar olarak zaten hesaplanan her şey.
- `gunduz_sonuc`: `{asilan, rol_goruntu, toplamlar:{pub_id:oy}, cekimser, provoke}` — tek tek oylar
  **yazılmaz** (§2).
- `bitis`: `{kazanan, kazanan_metin, sag_kalanlar, hortlak_kazananlar, acilis:[{kim, rol, takim}]}`.
- `iptal`: `{gun, faz}`.

Hikâye sayfası bunları gün gün metne çevirir (istemci tarafında, Türkçe şablonlarla).
Sohbet yazılmaz. Bugünkü kişisel notlar (`R.g.notes`) yazılmaz; hikâye olaylardan üretilir.

Gizlilik kuralı: `olaylar` **yalnız `oyunlar.bitis` dolu olan oyunlar** için okunabilir (RLS). Oyun sürerken
satırlar yazılır ama kimse okuyamaz. `oyun_oyunculari.rol_key` de aynı kurala bağlı.

### 5.5 Yazma yolu

- `game.js`: `R.log=[]`; `logEv(R,tur,veri)` yardımcısı; `startGame`, `resolveNight`, `resolveVote`,
  `checkWin`, `endToLobby` (iptal) içine çağrılar. Hamleler ham değil, çözümlenmiş haliyle (§5.4).
- `server.js`: `flush` ya da faz geçişi sonrası `kayit.kuyrukla(room, R.log.splice(0))`.
- `kayit.js`: tek bir arka plan kuyruğu; `service_role` anahtarıyla Supabase REST'e (`/rest/v1`) HTTP
  ile yazar (ek paket yok, `fetch`). Başarısızlıkta artan aralıkla yeniden dener; kuyruk 10 000 olayı
  aşarsa en eskiyi düşürür ve loglar. Sıra numarası `sira` oyun başına sunucuda artar.
- Oyun başlarken `oyunlar` satırı açılır (`sonuc:'devam'`); bitişte/iptalde güncellenir.
- Servis yeniden başlarsa bellekteki kuyruk gider; oyun `devam`da kalır. Temizlik: `kayit.js` açılışta 3 saatten
  eski `devam` oyunları `iptal` yapar.
- Ayarlar `/etc/games/<AD>.env` içinde: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`,
  `SUPABASE_ANON_KEY`. Boşsa kayıt ve kimlik doğrulama kapalı: her oyuncu misafir, hiçbir şey yazılmaz.
  `kur.sh` bugün bu dosyayı her yayında sıfırdan yazıyor ve yalnız `server.js game.js package*.json`'ı
  kopyalıyor; **değişmeli**: mevcut `SUPABASE_*` satırlarını korur, `kayit.js`, `sayfa/` ve `db/`'yi de kurar.
  `KG_KURULUM=<AD>` da env'e yazılır (`oyunlar.kurulum` ve `/ayar.json` için).

### 5.6 Okuma ve görünürlük (RLS)

- Sayfalar `supabase-js` ile anon anahtar + kullanıcının oturumuyla okur. Anon anahtar ve URL
  `GET /ayar.json` ile oyun sunucusundan alınır (`index.html` ortam bilgisi içermez).
- `profiller`: herkes okur; yalnız sahibi yazar.
- `kasabalar`, `kasaba_uyeleri`: üyeler okur; sahip adı değiştirir.
- `oyunlar`: oyunun oyuncuları ve kasaba üyeleri okur.
- `olaylar`, `oyun_oyunculari.rol_key/takim/...`: aynı kişiler, **yalnız `bitis` dolu olanlar**.
- Yazma yalnız `service_role` (sunucu). İstemciden oyun kaydı yazılamaz.
- Görünümler (view): `kasaba_tablo(kasaba_id, uye, ad, oyun, kazanma, kazanma_yuzde, en_cok_rol)`,
  `oyuncu_ozet(uye, oyun, kazanma, en_cok_rol, son_oyun)`. Kazanma: oyuncunun takımı `kazanan_takim`
  ile aynıysa; tarafsızlar: hayatta kalan sağ bitirdiyse, seri katil/bombacı/hırsız/büyücü "tek başına kazandı"ysa,
  hortlak asıldıysa. Bu kural tek yerde, görünümde durur.

### 5.7 Arayüz

- **Oyun sonu** (`index.html`, `renderEndUI`): bugünkü rol açıklaması kalır. Altına: maç özeti kartı ve
  "senin payın" (öldürdüklerin, kurtardıkların, yakaladıkların). Bunlar **Supabase'den değil, oyun sunucusundan**
  gelir: `checkWin` anında `game.js` `P.ozet` (herkese açık; oyun bitince her şey zaten açık) ve `privFor`
  içinde `payin` üretir. Böylece özet anında, misafirler dahil herkese ve Supabase kapalıyken de görünür
  (benim kararım; §6'daki ölçütleri de bu sağlar). Büyük **"Tekrar oyna"** (ev sahibi: `cancel` → lobi;
  diğerleri lobide bekler). "Hikâyeyi gör" düğmesi → `/oyun/<id>`; yalnız kayıt yazıldıysa (`P.oyunId`
  `server.js`'te `online` gibi `state`'e eklenir).
- **Giriş sayfası** (`index.html` landing): "Yeni oda kur / Önceki odam" üstte kalır. Altında kayıtlı oyuncuya:
  kişisel kart ve son 10 oyun (tarih, kasaba, kaç kişi, kazanan, senin rolün ve sonucun); satır → `/oyun/<id>`.
  Misafire: "Bu cihaza özel · Google ile bağla, geçmişin seninle gelsin" tek düğme.
- **`/oyun/<id>`**: özet + gece gece hikâye (zaman çizelgesi; her gece: hamleler, sonuçlar; her gündüz: oylar, asılan).
- **`/kasaba/<id>`**: ad (sahip düzenler), üyeler, sıralama tablosu, son oyunlar.
- Bu iki sayfa `kasaba-gecesi/sayfa/` altında ayrı HTML dosyaları; `server.js` sunar; ortak küçük CSS,
  `supabase-js` sürümü sabitlenmiş tek dosya olarak repoda (`sayfa/supabase.js`), CDN yok.
- Bağlantı rozeti, telefon düzeni gibi mevcut kurallar aynen geçerli.

### 5.8 Kurulum ve işletme

- Supabase: resmi `supabase/docker` paketi, `/opt/supabase-kasaba` içinde, kendi `.env`'i (şifreler
  `openssl rand` ile), kendi Docker ağı; GoTrue'da anonim giriş ve kimlik bağlama açık, `JWT_EXPIRY=604800`.
- Dışarıya: Caddy parçası `/etc/caddy/games/supabase.caddy` → **`kasaba-api.munupixi.com`** → `127.0.0.1:8000`
  (tünel kipinde `http://kasaba-api.munupixi.com:8080`). Ad tek seviyeli olmak zorunda: Cloudflare'in ücretsiz
  sertifikası `a.b.munupixi.com` biçimini kapsamaz (`api.kasaba.…` olmaz). Aynı ad GoTrue `API_EXTERNAL_URL`,
  `SITE_URL` ve Google yönlendirme adresinde kullanılır.
- ionos'ta başka Supabase **yok** (mevcut `retracted-authors` kurulumu netcup16gb1'de). Yine de resmi paketin
  sabit `container_name`'leri ve portları değiştirilir: `COMPOSE_PROJECT_NAME=supabase-kasaba`, konteyner
  adları `sk-*`, tüm portlar `127.0.0.1`'e bağlı; Kong 8000 (boş), Studio **3001** (3000 ionos'ta Grafana'da),
  Analytics 4000, Postgres 5432, Supavisor 6543 (hepsi boş; 3000, 3100, 9090, 9093, 8443, 8880 dolu).
- Studio'ya erişim: SSH tüneli ya da Tailscale (`flamboyant-perlman` Tailscale'de). Dışarı açılmaz.
- Şema: `kasaba-gecesi/sunucu/db/*.sql` (numaralı göçler) ve `db/uygula.sh` (Postgres konteynerinde `psql`,
  uygulananları `goc_gecmisi` tablosunda tutar). `kur.sh` bunu çağırmaz; ayrı adım, README'de.
- Yedek: günlük `pg_dump` → `/var/backups/supabase-kasaba/`, 14 gün tutulur (systemd timer, `db/yedek.sh`).
- Taşıma: yeni sunucuda Supabase paketi + `.env` + son yedek geri yükleme + `kur.sh` + aynı tünel token'ı.
- `README` ve `.claude/skills/kasaba-gecesi/SKILL.md` güncellenir; `/yayinla` değişmez.

### 5.9 Test

- `game.test.js`: her faz için `R.log`'a doğru olayların yazıldığı; `olaylar`'da gizli alan olmadığı
  (`SECRET_KEYS` kontrolü `R.log`'a da uygulanmaz — log zaten gizli bilgi içerir ve istemciye gitmez;
  bunun yerine `R.log`'un `P`'ye sızmadığı kontrol edilir: `SECRET_KEYS`'e `log` eklenir).
- `server.test.js`: sahte `kayit` (bellekte) ile oyun boyunca yazılan olaylar; Supabase ayarı yokken
  hiçbir çağrı yapılmadığı; geçersiz token'ın misafire düştüğü; `/ayar.json`.
- `kayit.test.js`: kuyruk, yeniden deneme, sıra numarası (HTTP taklidi).
- RLS: `db/test.sql` — iki kullanıcı, biten/bitmeyen oyun, kasaba dışı kullanıcı; `uygula.sh --test`
  ile konteynerde çalışır.
- E2E: oyun sonu ekranında özet ve "Tekrar oyna" (Supabase'siz çalışır); sayfalar için ayrı küçük e2e
  (Supabase olmadan sayfa "kayıt kapalı" uyarısını gösterir).
- Birleştirme: `db/test.sql` içinde `hesap_birlestir` senaryosu (iki kasaba üyeliği tekilleşir, sahiplik taşınır).

## 6. Aşamalar (sıra)

1. Oyun sonu özeti ve "Tekrar oyna" (`P.ozet`, `payin`; Supabase gerekmez). Ölçüt: e2e'de özet görünür. Canlıya alınabilir.
2. Supabase kurulumu (ionos), Caddy parçası, şema göçleri, yedek. Ölçüt: `https://kasaba-api.munupixi.com/rest/v1/` yanıt verir.
3. Kimlik: anonim oturum, token ile `join`, profil, `/ayar.json`. Ölçüt: sayfa yenilenince aynı uuid; Supabase kapalıyken misafir olarak oynanır.
4. Olay günlüğü (`game.js`) + `kayit.js` + sunucu bağlantısı + `kur.sh` değişiklikleri. Ölçüt: canlıda bir oyun oynanır, `oyunlar`/`olaylar`/`kasabalar` dolar; `kasaba-test` oyunları ayrı görünür.
5. Sayfalar: `/oyun` hikâyesi, giriş sayfası geçmişi ve kişisel kart, `/kasaba`.
6. Google ile bağlama ve ikinci cihazda birleştirme (OAuth kimliği kullanıcıdan).

Her aşama ayrı commit dizisi, `gecmis` dalında; 1. ve 4. aşamadan sonra canlıya alınabilir.

## 7. Kullanıcıdan gerekenler

- Google OAuth istemci kimliği ve gizli anahtarı (Google Cloud Console → OAuth consent + Credentials;
  yönlendirme adresi `https://kasaba-api.munupixi.com/auth/v1/callback`). 6. aşamaya kadar gerekmez.
- ionos'ta 2–3 GB RAM'in Supabase'e ayrılması ve `/opt/supabase-kasaba` için onay.

## 8. İnşaatçıya bırakılanlar

- Hikâye metin şablonlarının tam listesi (Türkçe, kısa; mevcut sabah haberleri üslubunda).
- Tablo ve görünümlerin kesin SQL'i, indeksler (`olaylar(oyun_id, sira)`, `oyun_oyunculari(uye)`).
- `kayit.js` kuyruk parametreleri (deneme aralığı, üst sınır) — makul varsayılanlar, env ile ayarlanabilir.
- Sayfa düzeni ve CSS; mevcut oyun görünümünün üslubuna uyması yeter.
- JWT doğrulama için kütüphane kullanmadan HS256 doğrulaması (`crypto`), ya da küçük bir bağımlılık; tercih inşaatçının.
- Hırsızın kazanma sayımı (çaldığı rolün takımıyla), `P.ozet`'in tam alan listesi, resmi Supabase paketinden hangi
  konteynerlerin kapatılacağı (ör. `imgproxy`, `edge-functions` gereksiz).
