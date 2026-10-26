# hasan-Ahmet-projects
## Kasaba Gecesi

`kasaba-gecesi/index.html` — tarayıcıda oynanan, 4–12 kişilik, Feign tarzı bir sosyal çıkarım oyunu. Oda ve oyun mantığı küçük bir Node sunucusunda (`kasaba-gecesi/sunucu/`) yaşar; ev sahibi dahil herkes WebSocket ile bağlanır. Ev sahibi sekmeyi kapatsa da oyun sürer, kopan oyuncu aynı linkle kaldığı yerden döner.

**Oynamak için:** sunucuyu kur (aşağıda), adresini aç, "Yeni oda kur"a bas, davet linkini gönder. Telefonda yatay oynanır.

**Oyun:** tam ekran köy sahnesi; evler halka hâlinde, karakterler meydanda. Gece herkes evine girer, rolünü kullanan karakter seçtiği eve yürür (bunu sadece o oyuncu görür). Sabah cesetler ve açıklama kutusu, akşam asılan kişi meydanda. Fazlar süre dolunca kendiliğinden geçer.

**Roller (19):** Masum, Doktor, Deli, Polis, Gözcü, İzci, Dedektif, Tuzakçı, İspiyoncu, Provokatör · Hain, Temizlikçi, Suçlayıcı (+ masum rollerin hain sürümleri) · Hayatta Kalan, Seri Katil, Bombacı, Hırsız, Büyücü, Hortlak.

**Rol dağılımı** (`sunucu/game.js` `autoSetup`, tasarım `docs/superpowers/specs/2026-10-24-kasaba-gecesi-sahne-design.md` §5.1): her özel rol bir oyunda en fazla bir kez çıkar; Doktor hep, Polis 5+ kişide; bilgi rolü sayısı (Polis, Gözcü, İzci, Dedektif, İspiyoncu) hain sayısından az olmaz; 4–6 kişide Masum yok, 7+ kişide 1 Masum, geri kalan masumların hepsi yetenekli (geri bildirim paketi, `docs/superpowers/specs/2026-10-25-kasaba-gecesi-rol-dagilimi-geri-bildirim-design.md`).

| kişi | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|
| hain (tek hain %50 sürümlü; 2 hainde 1 sürümlü + 1 düz) | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 2 |
| saldırgan tarafsız (Seri Katil/Bombacı/Hırsız/Büyücü) | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 2 |
| pasif tarafsız (Hayatta Kalan/Hortlak) | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 |
| Deli | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

Eşikler `npm run denge` ile ölçüldü (her kişi sayısı için 2000 oyun, basit stratejili oyuncular; gerçek oyuncuyu temsil etmez, dağılımları karşılaştırmak içindir). Her hain ayrı öldürdüğü için 2 hain ancak 9+ kişide; 6–8 kişide 2 hain oyunu ilk gece bitiriyordu. 2+ hainli satırlarda "masum %" basit oyuncuların haini bulamamasından düşüktür; o satırlarda anlamlı ölçü ilk gece ölüm ve süredir. Son ölçüm (2026-10-25, geri bildirim paketi sonrası — 4–6 kişide Masum yok, 7+'da 1; tek hain %50 sürümlü). Taban (paket öncesi, aynı gün): 4→%33, 5→%36, 6→%41, 7→%44, 8→%47 masum; Masum'un kalkması 5–6 kişide masum kazanmasını 1–3 puan artırdı (gürültü sınırında), ilk gece ölüm ve süre değişmedi. `DAGILIM_TEKHAINSURUMP=0` ve `=1` satırları aynı çıkar: botlar hain yeteneği kullanmaz, sürümlü hainin etkisi yalnız gerçek maçta görülür. `bitmeyen` 0: Polis–Bombacı kilidi kapandı:

```
2000 oyun/n · strateji basit (rapor eşiği %45–55 masum; "!" bant dışı; beraberlik = herkes öldü; bitmeyen = 60 fazda sonuç yok, ör. Polis–Bombacı kilidi)
 n | masum | hain | taraf | berab | gün  | 1.gece | bitmeyen
 4 |  31% |  69% |   0% |   0% |  1.4 |  0.74 |   0 !
 5 |  37% |  63% |   0% |   0% |  2.2 |  0.63 |   0 !
 6 |  44% |  56% |   0% |   0% |  2.6 |  0.69 |   0 !
 7 |  45% |  55% |   0% |   0% |  3.2 |  0.73 |   0  
 8 |  48% |  52% |   0% |   0% |  3.7 |  0.74 |   0  
 9 |   7% |  84% |   6% |   4% |  2.7 |  1.92 |   0 !
10 |  10% |  80% |   6% |   3% |  3.2 |  1.96 |   0 !
11 |  13% |  78% |   6% |   3% |  3.8 |  1.99 |   0 !
12 |  13% |  68% |  13% |   6% |  3.9 |  2.58 |   0 !
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

### E-posta ile hesap bağlama ve ikinci cihaz (6 haneli kod)

Kayıtlı oyuncu (anonim Supabase kullanıcısı) giriş sayfasında **"E-postanı bağla"** der: adresine 6 haneli kod gelir, kodu kutuya yazar; kimliği (uuid), geçmişi, kasabası, adı aynen kalır ("Hesabın: …"). Başka bir cihazda **"Hesabınla gir"**: aynı adres, kod, oturum kalıcı hesaba geçer; o cihazda anonim oynanmış maç varsa "Bu cihazdaki N oyunu hesabına ekle?" sorulur (Ekle → `hesap_birlestir` RPC + eski anonim kullanıcı silinir; Hayır → hiçbir şey). Şifre yok; Google yok; sihirli link yok (telefonda link başka tarayıcıda açılıyordu). Tasarım: `docs/superpowers/specs/2026-10-25-kasaba-gecesi-eposta-kod-design.md`.

- **Mail nasıl gider:** GoTrue mail göndermez; "Send Email" kancasıyla kodu imzalı HTTP isteğiyle (Standard Webhooks) oyun sunucusunun `POST /eposta/kanca` ucuna verir; sunucu imzayı doğrular ve **tek fonksiyon** `eposta.js` → `sendTransactionalEmail()` ile Resend API üzerinden yollar (`Kasaba Gecesi <oyun@munupixi.com>`; Türkçe, kod + 15 dk + kurulumun kendi sayfasına tek link). Sağlayıcı `EPOSTA_SAGLAYICI` ile değiştirilebilir.
- **İlerleme ve eşya modu (2026-10-26, tasarım `docs/superpowers/specs/2026-10-26-kasaba-gecesi-ilerleme-esya-design.md`):** her maç sonu kayıtlı oyuncuya **kasa** (eşya %50, yıldız %12, kozmetik sıradan/nadir/efsanevi 25/10/3; sahip olunan kozmetik yıldıza döner 3/8/20; kazanan +2 ⭐; 24 saatte en çok 20 kasa; yalnız en az bir oylama yaşanmış maçta), günlükteki gerçek olaylardan **rozetler** (14; oya dayalı yok), **`/ben`** kişisel sayfa (özet, yıldız, eşyalar, rozetler, koleksiyon, dükkân `POST /ben/al` fiyat 12/30/80 ⭐, dolap = bu cihazın `kg_look`'u). Kozmetikler (9 şapka, 8 ev bayrağı, 4 ölüm efekti) maçta herkese görünür; sunucu sahipliği doğrular. **Eşya modu** (ev sahibi ⚙️ menüden açar): herkes rol dağıtımından önce lobide bir eşya görür (envanterden seçilen ya da rastgele bedava), rolden bağımsız, tek kullanımlık: 🧪 iksir, 🏮 fener, 💨 duman, 🎭 maske, 🗳️ oy fişi (eşiğe sayılmaz). Kullanım sabah haberinde/oylama özetinde anonim, maç sonu gazetesinde gece eşyası adıyla. Envanter eşyası maç süresince sunucu çapında ayrılır, kullanıldıysa maç sonunda düşülür; kullanmadan ölünürse geri döner. Veri: göç 008 (`cuzdan`, `esyalar`, `kozmetikler`, `rozetler`, `kasalar`; yalnız kendi satırını okur; yazma `mac_sonu`/`kozmetik_al`/`envanter_oku` RPC'leri, yalnız service_role). Ölçüm v1 (tek eşya, 5 tür): masum kazanma farkı gürültü içinde (±2), ilk gece ölümü biraz düşer (iksir).
- **Eşya sistemi 2 (2026-10-26, tasarım `docs/superpowers/specs/2026-10-26-kasaba-gecesi-esya-2-design.md`, dal `esya-2`):** 10 eşya üç katmanda — sıradan 🗳️ oy fişi, ⏳ kum saati (tartışma +30 sn, günde bir), 🧭 pusula (hedef evinden çıktı mı), 🎲 zar (maç başında / kapınca nadir eşyaya döner); nadir 🧪 iksir (**pasif**: saldırıda kendiliğinden), 🏮 fener, 💨 duman, 🎭 maske, 📜 vasiyet (**pasif**: ölünce o gecenin notları sabah adla); efsanevi 🔒 kilit (hedefin hamlesi iptal; Seri Katil/Bombacı durdurulamaz, sessiz). Bedava havuz yalnız sıradan+zar; kasa eşya dilimi katman 50/40/10 (zar çıkmaz). Oyuncu başına **2 yuva**: lobi eşyası + **meydan paketi** (tartışmada %60, ilk 2/3'te, 5 sn açık, hayatta ≥8 ise 2 eşya aynı tür, maçta en çok 3; `P.paket={key,n,ends}` herkese, `kap{d,g}` ilk dokunanlar; kapanış sohbet sys satırı "biri kaptı / ikisini de kaptılar / kimse kapmadı"; `paket` olayı, fiş paketinde kapan kimliği yazılmaz). Hedefli eşya ziyaret değildir (evden işler; sahibi tutulsa da işler). `act{esya:key,esyaHedef}`, `esya{k:'kum'}`; `privFor.esya` dizi `{key,kullanildi,pasif,hedefli}`; `esyaKullanimi` dizi (zar → özgün anahtar `kaynakKey` ile düşülür). Maç sonu `P.ozet.oyuncular[].esyalar` (fiş hiç girmez: oy gizliliği); gazete en etkili eşya kartı + paket kartı. Ölçüm (`DAGILIM_ESYA=1 npm run denge`; botlar gece eşyasını %30, kum/fiş %30, paketi %50 kapar): kapalıyla fark gürültü içinde (masum ±2), ilk gece ölümü biraz düşük (pasif iksir); eşya kullanım oranları %34–61, paket başına ortalama 1,1 eşya kapılıyor:

```
2000 oyun/n · strateji basit (rapor eşiği %45–55 masum; "!" bant dışı; beraberlik = herkes öldü; bitmeyen = 60 fazda sonuç yok, ör. Polis–Bombacı kilidi)
 n | masum | hain | taraf | berab | gün  | 1.gece | bitmeyen
 4 |  30% |  70% |   0% |   0% |  1.5 |  0.69 |   0 !
 5 |  36% |  64% |   0% |   0% |  2.2 |  0.61 |   0 !
 6 |  43% |  57% |   0% |   0% |  2.8 |  0.67 |   0 !
 7 |  43% |  57% |   0% |   0% |  3.3 |  0.71 |   0 !
 8 |  51% |  49% |   0% |   0% |  3.8 |  0.70 |   0  
 9 |   8% |  83% |   6% |   3% |  2.8 |  1.79 |   0 !
10 |  10% |  79% |   8% |   3% |  3.4 |  1.86 |   0 !
11 |  13% |  77% |   7% |   3% |  3.9 |  1.88 |   0 !
12 |  15% |  66% |  14% |   5% |  4.1 |  2.47 |   0 !

eşya | taşınan | kullanılan
kum      |   41882 |  34%
fis      |   41779 |  41%
pusula   |   41633 |  50%
duman    |    9945 |  47%
fener    |    9894 |  47%
maske    |    9837 |  46%
iksir    |    9678 |  40%
vasiyet  |    9674 |  61%
paket: 26942 açıldı, 30322 eşya kapıldı (113% / paket; tek kişilik paket 1, iki kişilik 2 sayılır)
```
- **Şema ve testler:** göçler `db/goc/001…007` (`sudo db/uygula.sh`; 007: `oyunlar` sonuc/bitis tutarlılık kısıtı, ad uzunlukları 40/16/16, `kazanma()` 5 parametre, `kasaba_tablo` boş profil adını oyuncu adıyla doldurur; uygulamadan önce ihlal sayılır); RLS senaryoları `sudo db/uygula.sh --test` (13 senaryo). Betikler sahte ortamda `db/test-betik.sh` ile sınanır (`kontrol.sh` çağırır): `caddy.sh` doğrulama düşerse eski parçayı korur, `yedek.sh` `.tmp` bırakmaz, `kur-supabase.sh` eksik pakette bir kez `apt-get update`, dışarı açık port görürse durur, kurulum günlüğünde anahtarlar maskeli; `uygula.sh` sonunda PostgREST şema önbelleği tazelenir.
- **Kurulum:** Supabase tarafı `sudo db/kur-supabase.sh --kanca <oyun alanı>` (ör. `kasaba.munupixi.com`; kanca sırrını üretir/korur, GoTrue'da e-posta sağlayıcı + OTP 6 hane/15 dk + saatte 60 mail). Oyun sunucusu `/etc/games/<AD>.env`: `RESEND_API_KEY=…`, `EPOSTA_KANCA_SIRRI=<kur-supabase.sh'nin yazdığı v1,whsec_… sırrı>` (`kur.sh` korur) → `systemctl restart game@<AD>`. Supabase tek olduğundan kanca **tek kuruluma** gider: geliştirmede `kasaba-test`, yayında `kasaba` (kanca canlıya dönünce kasaba-test'te düğmeler kalır ve kod maili gelir, ama mail canlı sunucudan çıkar; kasaba-test'in `/saglik eposta` sayaçları artmaz). `/ayar.json` → `eposta:true` yalnız sırrı olan kurulumda; düğmeler ona göre görünür. `/saglik` → `eposta:{gonderilen,hata,atlanan}`, `birlestirme:{ok,hata}`.
- **Güvenlik:** `db/caddy.sh` dış kapıda `/auth/v1/token`'ı **yalnız `grant_type=refresh_token`** ile geçirir (izin listesi; başka her şey ve `/auth/v1/recover` 403). E-postalı kayıt `/signup` 403 ile (Plan 7, `--signup-kapali`) hiç açılamaz; o güne kadar kanca `signup` türünü de giriş kodu olarak yollar ki önceden açılmış boş bir hesabı sahibi kodla devralsın. GoTrue'nun IP başına sınırları (`verify`, `otp`, anonim) `RATE_LIMIT_HEADER=X-Forwarded-For` ile açıktır; Caddy bu başlığı istemciden değil Cloudflare'in `Cf-Connecting-Ip`'sinden yazar (spoof edilemez). Kontrol: `curl -H 'X-Forwarded-For: 9.9.9.9' …/auth/v1/health` sonrası GoTrue günlüğünde (`docker logs supabase-auth`) `remote_addr` gerçek IP olmalı. Kural ham sorgu dizesinin **tam eşitliğine** bakar (`grant_type=refresh_token`): bozuk sorgu (`&x=a;b`) ya da çift parametre (`grant_type=password&grant_type=refresh_token`) geçemez. Kontrol: `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'apikey: <anon>' 'https://kasaba-api.munupixi.com/auth/v1/token?grant_type=password&grant_type=refresh_token'` → `403`; `…?grant_type=refresh_token` → GoTrue cevabı (400/401). `oyunlar.oda_kodu` yalnız `service_role` okur (göç 006, sütun düzeyinde grant): oda kodu bir yetkidir, kasaba üyelerine sızmasın; istemci `oyunlar` sorgularında sütunları adıyla seçer (`select('*')` kullanma). Birleştirme iki **taze** token ister (`eski` anonim, `yeni` e-postalı); IP başına dakikada 5; kanca alıcı başına saatte 5 mail. Kod/token/imza günlüğe yazılmaz. "Bu cihazdan çık" yalnız o cihazın oturumunu kapatır.
- **Kötüye kullanım (Plan 7):** kod maili üreten her istek oyun sunucusunun `POST /eposta/kod` ucundan geçer — Cloudflare **Turnstile** (Managed widget, görünmez; betik Cloudflare'den yüklenir, bu depoda CDN'siz ilkesinin tek istisnası), tavanlar (IP 10 dk'da 3 / saatte 6; adres saatte 3 / günde 6; kurulum `KOD_SAATLIK` 30 / `KOD_GUNLUK` 80; kanca `KANCA_GUNLUK` 90 — Resend'in günlük 100'ünün altında), aşımda dürüst Türkçe metin; anonim kimlik de `POST /hesap/anonim` ile sunucudan (IP başına saatte 10). Sunucu GoTrue'ya **yerel adresten** konuşur (`SUPABASE_IC_URL=http://127.0.0.1:8000`); dış kapıda `/auth/v1/otp`, `/magiclink`, `/resend`, `PUT /auth/v1/user` 403, `caddy.sh --signup-kapali` ile `/auth/v1/signup` da 403 (yalnız canlı bu sürüme geçince; eski istemci doğrudan `/signup` kullanır). Env: `TURNSTILE_SITE=`, `TURNSTILE_SECRET=`, `TURNSTILE_HOSTNAMES=` (isteğe bağlı; varsayılan `ALAN`), `SUPABASE_IC_URL=`, `KOD_GUNLUK=` (kasaba-test 20). `/saglik` → `kod:{istek,gonderildi,ip_sinir,adres_sinir,kota,turnstile_red,anon,anon_sinir}`; kota dolunca günlükte `UYARI`. Caddy `trusted_proxies private_ranges` ile GoTrue gerçek IP'yi görür (kendi IP sınırları anlamlı olsun). Yerel geliştirme: Cloudflare test anahtarları (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`).
- Testler: `test/eposta.test.js`, `test/hesap.test.js`, `test/kod.test.js`, `server.test.js` (kanca, birleştirme, kod ucu, anonim), e2e (sahte GoTrue ve sahte Turnstile ile bağla/gir/birleştir/tavan/betik yok/sunucu yok). kasaba-test'te gerçek deneme yapıldı (2026-10-25): bağlama, ikinci cihaz girişi, 1 maçın taşınması, eski anonim kullanıcının silinmesi.

### Geçmiş sayfaları: hikâye, kasaba, giriş sayfası

Kayıt açıkken kayıtlı oyuncu geçmişini tarayıcıda görür (statik sayfalar `kasaba-gecesi/sayfa/`, sunucu `GET /oyun/<uuid>` ve `/kasaba/<uuid>` ile sunar; aynı origin olduğundan oyun sayfasının anonim Supabase oturumu paylaşılır, ayrıca giriş yok):

- **`/oyun/<id>`** — maç özeti (kasaba, tarih, kazanan), oyuncular (rol etiketi, akıbet) ve **gece gece hikâye**: `sayfa/hikaye.js` olay günlüğünden (`olaylar`, yalnız bitmiş oyun) gün gün blok üretir — gece hamleleri ("Ece (Hain) Can'ın evine girdi"), gece sonucu (ölüm, kurtarma, tuzak, tutma, çalma, yıldırım, patlama, hortlak), gündüz (rol iddiaları ve gerçeği, oy toplamları, asılan), bitiş. Ölçüm olayları hikâyede yok; tek tek oylar hiçbir yerde yok.
- **`/kasaba/<id>`** — kasaba adı (sahip düzenler), üyeler, **tablo** (`kasaba_tablo`: maç, zafer, en çok rol; yüzde ve "en çok kaybeden" yok, örneklem her satırda), **senin karşılaştırmaların** (`sayfa/karsilastirma.js`: üye başına birlikte N maç, aynı tarafta M zafer, karşı tarafta sen X – o Y; 3 maçtan azsa "henüz az maç"), **son maçlar** (→ `/oyun/<id>`).
- **Giriş sayfası** — kayıtlı oyuncuya "Geçmişin": kişisel kart (`oyuncu_ozet`: oyun, kazanma, en çok rol), son 10 oynadığı bitmiş maç (→ `/oyun/<id>`), kasabaları (→ `/kasaba/<id>`). Sorgular kimlikten sonra arka planda, 3 sn zaman aşımı; veri gelmezse sayfa aynen çalışır, oyun kurma beklemez.
- **Oyun sonu ekranı** — kayıt açıkken "📖 Hikâyeyi gör" (`/oyun/<oyunId>`, yeni sekme). Kayıt kuyrukta gecikmişse sayfa "henüz yazılmadı, yenile" der.
- Sayfalar yalnız anon anahtar + kullanıcı oturumuyla okur (RLS ve görünümler); tek yazma kasaba adı. Kayıt kapalı kurulumda ya da oturumsuz cihazda sayfalar "Kayıt kapalı / bu cihazda kimlik yok" der. Yerel testler: `test/hikaye.test.js`, `test/karsilastirma.test.js`, sunucu yolları `server.test.js`, e2e (Supabase yokken sayfalar ve sahte Supabase ile giriş bloğu).

Yerelde denemek için: `cd kasaba-gecesi/sunucu && npm install && npm start`, ardından `http://localhost:8787`. Testler: `npm test` (oyun mantığı ve sunucu), `npm run e2e` (gerçek tarayıcı sekmeleriyle uçtan uca; Playwright ve Chromium gerekir).
