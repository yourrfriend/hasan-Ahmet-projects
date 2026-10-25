# hasan-Ahmet-projects
## Kasaba Gecesi

`kasaba-gecesi/index.html` — tarayıcıda oynanan, 4–12 kişilik, Feign tarzı bir sosyal çıkarım oyunu. Oda ve oyun mantığı küçük bir Node sunucusunda (`kasaba-gecesi/sunucu/`) yaşar; ev sahibi dahil herkes WebSocket ile bağlanır. Ev sahibi sekmeyi kapatsa da oyun sürer, kopan oyuncu aynı linkle kaldığı yerden döner.

**Oynamak için:** sunucuyu kur (aşağıda), adresini aç, "Yeni oda kur"a bas, davet linkini gönder. Telefonda yatay oynanır.

**Oyun:** tam ekran köy sahnesi; evler halka hâlinde, karakterler meydanda. Gece herkes evine girer, rolünü kullanan karakter seçtiği eve yürür (bunu sadece o oyuncu görür). Sabah cesetler ve açıklama kutusu, akşam asılan kişi meydanda. Fazlar süre dolunca kendiliğinden geçer.

**Roller (19):** Masum, Doktor, Deli, Polis, Gözcü, İzci, Dedektif, Tuzakçı, İspiyoncu, Provokatör · Hain, Temizlikçi, Suçlayıcı (+ masum rollerin hain sürümleri) · Hayatta Kalan, Seri Katil, Bombacı, Hırsız, Büyücü, Hortlak.

**Rol dağılımı** (`sunucu/game.js` `autoSetup`, tasarım `docs/superpowers/specs/2026-10-24-kasaba-gecesi-sahne-design.md` §5.1): her özel rol bir oyunda en fazla bir kez çıkar; Doktor hep, Polis 5+ kişide; bilgi rolü sayısı (Polis, Gözcü, İzci, Dedektif, İspiyoncu) hain sayısından az olmaz; masumların dörtte üçü yetenekli, gerisi Masum.

| kişi | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|
| hain (en çok yarısı yetenekli) | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 2 |
| saldırgan tarafsız (Seri Katil/Bombacı/Hırsız/Büyücü) | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 2 |
| pasif tarafsız (Hayatta Kalan/Hortlak) | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 |
| Deli | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

Eşikler `npm run denge` ile ölçüldü (her kişi sayısı için 2000 oyun, basit stratejili oyuncular; gerçek oyuncuyu temsil etmez, dağılımları karşılaştırmak içindir). Her hain ayrı öldürdüğü için 2 hain ancak 9+ kişide; 6–8 kişide 2 hain oyunu ilk gece bitiriyordu. 2+ hainli satırlarda "masum %" basit oyuncuların haini bulamamasından düşüktür; o satırlarda anlamlı ölçü ilk gece ölüm ve süredir. Son ölçüm (beraberlik = herkes öldü; bitmeyen = 60 fazda sonuç yok — Polis her gece Bombacı'yı tutunca 2 kişilik kilit, kural boşluğu):

```
2000 oyun/n · strateji basit (rapor eşiği %45–55 masum; "!" bant dışı; beraberlik = herkes öldü; bitmeyen = 60 fazda sonuç yok, ör. Polis–Bombacı kilidi)
 n | masum | hain | taraf | berab | gün  | 1.gece | bitmeyen
 4 |  28% |  72% |   0% |   0% |  1.4 |  0.73 |   0 !
 5 |  35% |  65% |   0% |   0% |  2.2 |  0.66 |   0 !
 6 |  41% |  59% |   0% |   0% |  2.7 |  0.70 |   0 !
 7 |  44% |  56% |   0% |   0% |  3.3 |  0.72 |   0 !
 8 |  48% |  52% |   0% |   0% |  3.8 |  0.74 |   0  
 9 |   8% |  84% |   5% |   3% |  2.7 |  1.92 |   7 !
10 |  10% |  80% |   6% |   3% |  3.3 |  1.91 |   3 !
11 |  12% |  79% |   6% |   3% |  3.7 |  2.00 |   2 !
12 |  14% |  69% |  12% |   5% |  3.9 |  2.56 |  10 !
```

**Kurallar:** her hain kendi başına öldürür, yardımcı hainler gece ya yeteneğini kullanır ya öldürür; hainler birbirini tanır ama yazışamaz ve gece birbirini göremez. Polis, Seri Katil'i ve Bombacı'yı tutamaz (ikiye düşünce oyun kilitlenmesin diye). Oylar gizlidir; sonunda yalnızca toplamlar açıklanır. Ölen oyuncular kendi aralarında yazışabilir.

### Tartışma: hızlı ifadeler ve rol rehberi

- **⚡ Hızlı ifade** (tartışmada, sağ oyuncular): "Rolüm: …" (tüm rol kataloğu, o maçta olmayan rol de söylenebilir), "… hakkında şüphem var", "Bu bilgi kesin değil", "Beni koruyun!", "Bir açıklama yapacağım". Metni sunucu kurar ve sohbete oyuncunun sözü olarak koyar (rozet yok). Sınırlar sunucuda: 8 sn bekleme, gün başına 4; yeniden bağlanmak sıfırlamaz. Rol iddiaları o anki gerçek rolle birlikte günlüğe yazılır; gazete maç sonunda "Gün 2: Hasan Doktor olduğunu söyledi; o sırada rolü Hain idi" der (niyet atfı yok; Deli'nin sandığı rolü söylemesi blöf sayılmaz).
- **📘 Rol rehberi** (üst bar, lobi ve oyun): oyunu durdurmayan çekmece — taraflar, her rol için açıklama ve kısa ipucu, oyuncu sayısına göre genel dağılım kuralları, odanın süreleri. Yalnız herkese açık bilgi; bu maçın gizli dağılımına dokunmaz.

### Oyun sonu: gazete, rövanş, bu akşamın skoru

- **🗞️ Kasabada Bu Gece:** en çok 3 kart, yalnız oyunun gerçek olaylarından (Deli ifşası, Doktor'un önlediği saldırı, yelek, tuzak, Polis, Hırsız, Büyücü, patlama, Hortlak intikamı; yer kalırsa oyunu bitiren olay). Aynı oyun hep aynı kartları üretir; uydurma yok.
- **Rövanş:** son ekranda "Rövanşa hazırım" / "Vazgeç"; "N kişiden M'si hazır". Ev sahibi yalnız hazır **ve bağlı** 4–12 oyuncuyla "Rövanşı başlat" diyebilir (kendisi hazır sayılır); hazır olmayanlar odada bekler, süren maça girmez. "Lobiye dön" eski akıştır.
- **Bu akşam:** oda açık kaldığı sürece oyuncu başına kazanılan/oynanan maç (ör. `Ece 2/3`). Yarım kalan (iptal) maç sayılmaz; kopan oyuncu da paydada. Sunucu yeniden başlarsa tablo sıfırlanır (odalar bellekte).

### Sunucu kurulumu

Gerekenler: Ubuntu ya da Debian bir VPS (SSH ile sen girersin) ve bir alan adı. Her oyun ve her sürüm kendi alt alan adında yayınlanır (`kasaba.munupixi.com`, `kasaba-test.munupixi.com`). Adlar tek seviyelidir: Cloudflare'in ücretsiz sertifikası `a.b.munupixi.com` gibi iki seviyeli adları kapsamaz.

Sunucunun 80/443 portlarına göre iki kip var; kip sunucu başına bir kez `--kip` ile seçilir, sonra hatırlanır:

- **`--kip https`** (varsayılan, 80/443 boş bir sunucu): DNS'te joker A kaydı `*.munupixi.com` → VPS'in IP'si. Caddy sertifikayı kendisi alır.
- **`--kip tunel`** (80/443 başka bir programda, ör. Plesk): Caddy yalnız `127.0.0.1:8080`'de dinler, HTTPS'i Cloudflare Tunnel verir ve dışarıya port açılmaz. Cloudflare'de bir kez: Zero Trust → Networks → Tunnels'da tünel oluştur, yönlendirme `*.munupixi.com` → `http://localhost:8080`, DNS'te `*` → `<tünel-id>.cfargotunnel.com` (CNAME, proxied). Sunucuya `cloudflared`'ı kur ve tünel token'ıyla servisi başlat:

  ```sh
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
  sudo apt-get update && sudo apt-get install -y cloudflared
  sudo cloudflared service install TÜNEL_TOKENI
  ```

  Başka sunucuya taşımak: yeni sunucuda `cloudflared`'ı aynı token'la kur, `kur.sh`'yi çalıştır, eski sunucuda `cloudflared`'ı durdur. DNS değişmez.

```sh
git clone https://github.com/yourrfriend/hasan-Ahmet-projects.git
cd hasan-Ahmet-projects/kasaba-gecesi/sunucu
sudo ./kur.sh kasaba kasaba.munupixi.com --kip tunel                   # yayındaki sürüm (kip bir kez verilir)
sudo ./kur.sh kasaba-test kasaba-test.munupixi.com --surum sunucu      # test: bir branch
sudo ./kur.sh kasaba-v1 kasaba-v1.munupixi.com --surum v1              # eski sürüm: tag ya da commit
```

`kur.sh AD ALAN [--surum REF] [--port N] [--kip https|tunel]` Node 20'yi ve Caddy'yi kurar, oyunu `/opt/games/AD` klasörüne koyar ve `game@AD` systemd servisini başlatır. Her kurulum kendi portunu alır (8787'den başlayarak boş olan ilk port) ve Caddy'ye kendi parçasını (`/etc/caddy/games/AD.caddy`) ekler. Ana `/etc/caddy/Caddyfile`'da başka sitelerin varsa onlara dokunulmaz, yalnız `import` satırı eklenir. `--surum` verilmezse betiğin bulunduğu klasördeki dosyalar kurulur.

- Güncelleme: aynı komutu tekrar çalıştır (`git pull` sonrası ya da `--surum` ile). Port korunur. Yeni sürüm sağlık kontrolünden geçmezse eski sürüm kendiliğinden geri yüklenir.
- Kurulumlar: `sudo ./kur.sh --liste` (adres, port, sürüm, commit, durum). Kaldırmak: `sudo ./kur.sh --kaldir kasaba-test`
- Sürüm: `curl https://kasaba.munupixi.com/saglik` çalışan sürümü ve commit'i gösterir.
- Günlük: `journalctl -u game@kasaba -f`
- Claude Code ile: depoyu kendi bilgisayarına klonla, `.claude/yayin.env.ornek` dosyasını `.claude/yayin.env` olarak kopyalayıp VPS'in SSH adresini yaz, depo klasöründe `claude` çalıştır ve `/yayinla` (yayındaki sürüm), `/yayinla kasaba-test sunucu`, `/yayinla --liste` ya da `/yayinla --kaldir kasaba-test` yaz. Claude önce testleri çalıştırır, komutu gösterip onay ister, sunucuda `kur.sh`'yi çalıştırır ve adresi `/saglik` ile doğrular. VPS'e SSH anahtarıyla bağlanabilmen ve kullanıcının `root` ya da parolasız `sudo` yetkili olması gerekir.
- Eski tek oyunluk kurulum (`kasaba-gecesi` servisi) varsa ilk yeni kurulumda durdurulur; eski Caddyfile `Caddyfile.eski` olarak saklanır.
- Odalar bellekte tutulur; servis yeniden başlarsa açık odalar kapanır. 2 saat kullanılmayan oda kendiliğinden silinir.
- Sayfayı GitHub Pages gibi başka bir yerden açacaksan sunucu adresini `index.html` içindeki `KG_SERVER` sabitine yaz. Linkteki `?s=` yalnız yerel geliştirmede (localhost) ya da sayfanın kendi sunucusu için kabul edilir: oyuncunun gizli anahtarı linke yazılan yabancı bir sunucuya gitmesin.

### Geçmiş ve kullanıcı kaydı: Supabase (kendi sunucunda)

Oyun geçmişi, kasabalar ve oyuncu hesapları için oyunun yanında ayrı bir Supabase kurulumu çalışır (resmi Docker paketi). Tasarım: `docs/superpowers/specs/2026-10-24-kasaba-gecesi-gecmis-design.md`. Betikler `kasaba-gecesi/sunucu/db/` altında, hepsi sunucuda root ile ve tekrar çalıştırılabilir:

```sh
sudo db/kur-supabase.sh        # paketi /root/supabase-kasaba altına kurar (Supabase'in setup.sh'si anahtarları üretir), yalnız 127.0.0.1'de dinler, yedek zamanlayıcısını kurar
sudo db/caddy.sh               # dış kapı: kasaba-api.munupixi.com → yalnız /auth, /rest, /realtime, /storage (Studio ve pg-meta dışarıdan 404)
sudo db/uygula.sh              # şema göçleri (db/goc/*.sql); --test ile RLS senaryoları
```

- Dizin `/root` altında olmak zorunda: ionos'ta Docker snap paketidir ve snap'in compose istemcisi `/opt`'u hiç, `/home` altında da `.env` gibi gizli dosyaları okuyamaz.
- Gizli anahtarlar `/root/supabase-kasaba/.env` içinde (mod 600): `cd /root/supabase-kasaba && sh run.sh secrets`. Ağ geçidi `apikey` başlığı olmadan her yola 401 verir.
- Studio (yönetim paneli) dışarı açık değildir: `ssh -L 8000:127.0.0.1:8000 ionos` sonra `http://localhost:8000` (kullanıcı/şifre `run.sh secrets`).
- Yedek: her gün 04:10 `/var/backups/supabase-kasaba/kasaba-TARIH.dump` (14 gün; yalnız `public`, `private` ve `auth` şemaları). Elle: `sudo supabase-kasaba-yedek`.
- **Geri yükleme** (sıra tatbikatla doğrulandı; `pg_restore` Supabase'in "default privileges" satırlarında birkaç hata basar, zararsızdır — yetkileri sonraki adım tazeler):
  ```sh
  f=/var/backups/supabase-kasaba/kasaba-TARIH.dump
  docker exec -i supabase-db pg_restore -U postgres -d postgres --clean --if-exists -n public -n private < $f   # oyun verisi
  sudo db/uygula.sh --yeniden && sudo db/uygula.sh --test                                                      # yetki/politika tazeleme + kanıt (8/8)
  # yalnız TAZE yığında (kullanıcılar; auth şeması GoTrue tarafından zaten kurulmuştur):
  docker exec -i supabase-db pg_restore -U postgres -d postgres --no-owner -n auth --data-only --disable-triggers < $f
  ```
  `postgres` süper kullanıcı olmadığı için "RI_ConstraintTrigger … is a system trigger" hataları çıkar; veri yine yüklenir (tatbikatta `auth.users` satır sayısı doğrulandı). Sonunda `select count(*) from auth.users` ile karşılaştır.
  Yedeği başka bir veritabanında incelemek için: `create database deneme; create schema auth; create schema private;` sonra aynı komutlar `-d deneme` ile.
- **Taşıma** (iki yol):
  1. Soğuk (önerilen): eski sunucuda `cd /root/supabase-kasaba && sh run.sh stop`, klasörün tamamını (`.env` ve `volumes/db/data` dahil) yeni sunucuya `/root/supabase-kasaba` olarak kopyala, `sh run.sh start`, `caddy.sh`, aynı tünel token'ıyla `cloudflared`. Anahtarlar ve kullanıcılar aynen gelir.
  2. Taze kurulum + yedek: yeni sunucuda `kur-supabase.sh` (yeni şifre ve anahtarlar üretir; **`POSTGRES_PASSWORD`'ü kopyalama**, veritabanı o şifreyle kurulur) → `.env`'de yalnız `JWT_SECRET`, `JWT_KEYS`, `JWT_JWKS`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` değerlerini eski sunucudan al (oyuncuların token'ları ve oyun sunucusundaki anahtarlar geçerli kalsın) → `sh run.sh recreate` → yukarıdaki geri yükleme (auth dahil) → `caddy.sh` → `cloudflared`. DNS değişmez.
- **Oyun sunucusunu Supabase'e bağlamak:** `/etc/games/<AD>.env` dosyasına şu satırları ekle (değerler `/root/supabase-kasaba/.env`'den: `SUPABASE_URL=https://kasaba-api.munupixi.com`, `SUPABASE_ANON_KEY=<ANON_KEY>`, `SUPABASE_SERVICE_KEY=<SERVICE_ROLE_KEY>`, `SUPABASE_JWT_SECRET=<JWT_SECRET>`), sonra `systemctl restart game@<AD>`. Self-hosted Supabase v0.8+ token'ları **ES256** ile imzalar; sunucu açık anahtarları `https://kasaba-api…/auth/v1/.well-known/jwks.json`'dan alır (alınamazsa artan aralıkla yeniden dener; bilinmeyen `kid` gelince dakikada bir yeniler). Üretimde önerilen: `SUPABASE_JWT_JWKS=<JWT_JWKS'in base64'ü>` satırı (`base64 -w0 <<< "$JWT_JWKS"`), böylece açılışta Supabase/tünel beklenmez. `kur.sh` bu satırları yeniden kurulumda korur ve `KG_KURULUM=<AD>` yazar. Satırlar yoksa kurulum "kayıt kapalı" çalışır: herkes misafir, `/ayar.json` `kayit:false`. Kayıt açıkken sayfa anonim bir Supabase kullanıcısı açar (giriş ekranı yok); `join` token taşır, sunucu imzayı yerelde doğrular (GoTrue v0.8+: ES256, anahtar JWKS'ten; eski HS256 kurulumlarında `SUPABASE_JWT_SECRET`), kayıtlı oyuncunun ad/renk/şapkası `profiller`'e yazılır. Supabase'e ulaşılamazsa oyun misafir olarak aynen sürer.
- **Ne zaman yazılır:** kayıt açıkken (env'de `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`) ve ev sahibi **kayıtlı** (anonim Supabase kullanıcısı) ise her maç yazılır: maç başlarken kasaba bulunur/kurulur ("Ece'nin Kasabası"), kayıtlı oyuncular üye olur, `oyunlar` + `oyun_oyunculari` satırları açılır; her olay `olaylar`'a gider; bitişte/iptalde `oyunlar` ve rol alanları güncellenir. **Misafir ev sahibinin maçı hiç yazılmaz.** Yazım arka plandadır: Supabase yavaş/kapalıysa oyun etkilenmez; 5xx/ağ hatasında artan aralıkla yeniden denenir, 4xx'te o yazım düşer ve loglanır; servis yeniden başlarsa bellekteki kuyruk gider ve açılışta 3 saatten eski "devam" oyunları `iptal` yapılır. `/saglik` → `kayit:{kuyruk,yazilan,hata,dusen}` sayaçları. kasaba-test oyunları `kurulum='kasaba-test'` ile ayrışır.
- Kip değişikliği: `kur.sh --kip …` ile tünel/https kipi değişince Supabase parçası kendiliğinden yenilenmez; `sudo db/caddy.sh`'yi yeniden çalıştır (`kur.sh` bunu uyarır).
- Sürüm güncelleme: yedek al → `cd /root/supabase-kasaba && sh update.sh` → `sudo db/kur-supabase.sh` (port ve `.env` ayarları yeniden uygulanır) → `sudo db/uygula.sh --test`.

### Geçmiş sayfaları: hikâye, kasaba, giriş sayfası

Kayıt açıkken kayıtlı oyuncu geçmişini tarayıcıda görür (statik sayfalar `kasaba-gecesi/sayfa/`, sunucu `GET /oyun/<uuid>` ve `/kasaba/<uuid>` ile sunar; aynı origin olduğundan oyun sayfasının anonim Supabase oturumu paylaşılır, ayrıca giriş yok):

- **`/oyun/<id>`** — maç özeti (kasaba, tarih, kazanan), oyuncular (rol etiketi, akıbet) ve **gece gece hikâye**: `sayfa/hikaye.js` olay günlüğünden (`olaylar`, yalnız bitmiş oyun) gün gün blok üretir — gece hamleleri ("Ece (Hain) Can'ın evine girdi"), gece sonucu (ölüm, kurtarma, tuzak, tutma, çalma, yıldırım, patlama, hortlak), gündüz (rol iddiaları ve gerçeği, oy toplamları, asılan), bitiş. Ölçüm olayları hikâyede yok; tek tek oylar hiçbir yerde yok.
- **`/kasaba/<id>`** — kasaba adı (sahip düzenler), üyeler, **tablo** (`kasaba_tablo`: maç, zafer, en çok rol; yüzde ve "en çok kaybeden" yok, örneklem her satırda), **senin karşılaştırmaların** (`sayfa/karsilastirma.js`: üye başına birlikte N maç, aynı tarafta M zafer, karşı tarafta sen X – o Y; 3 maçtan azsa "henüz az maç"), **son maçlar** (→ `/oyun/<id>`).
- **Giriş sayfası** — kayıtlı oyuncuya "Geçmişin": kişisel kart (`oyuncu_ozet`: oyun, kazanma, en çok rol), son 10 oynadığı bitmiş maç (→ `/oyun/<id>`), kasabaları (→ `/kasaba/<id>`). Sorgular kimlikten sonra arka planda, 3 sn zaman aşımı; veri gelmezse sayfa aynen çalışır, oyun kurma beklemez.
- **Oyun sonu ekranı** — kayıt açıkken "📖 Hikâyeyi gör" (`/oyun/<oyunId>`, yeni sekme). Kayıt kuyrukta gecikmişse sayfa "henüz yazılmadı, yenile" der.
- Sayfalar yalnız anon anahtar + kullanıcı oturumuyla okur (RLS ve görünümler); tek yazma kasaba adı. Kayıt kapalı kurulumda ya da oturumsuz cihazda sayfalar "Kayıt kapalı / bu cihazda kimlik yok" der. Yerel testler: `test/hikaye.test.js`, `test/karsilastirma.test.js`, sunucu yolları `server.test.js`, e2e (Supabase yokken sayfalar ve sahte Supabase ile giriş bloğu).

Yerelde denemek için: `cd kasaba-gecesi/sunucu && npm install && npm start`, ardından `http://localhost:8787`. Testler: `npm test` (oyun mantığı ve sunucu), `npm run e2e` (gerçek tarayıcı sekmeleriyle uçtan uca; Playwright ve Chromium gerekir).
