# hasan-Ahmet-projects
## Kasaba Gecesi

`kasaba-gecesi/index.html` — tarayıcıda oynanan, 4–12 kişilik, Feign tarzı bir sosyal çıkarım oyunu. Oda ve oyun mantığı küçük bir Node sunucusunda (`kasaba-gecesi/sunucu/`) yaşar; ev sahibi dahil herkes WebSocket ile bağlanır. Ev sahibi sekmeyi kapatsa da oyun sürer, kopan oyuncu aynı linkle kaldığı yerden döner.

**Oynamak için:** sunucuyu kur (aşağıda), adresini aç, "Yeni oda kur"a bas, davet linkini gönder. Telefonda yatay oynanır.

**Oyun:** tam ekran köy sahnesi; evler halka hâlinde, karakterler meydanda. Gece herkes evine girer, rolünü kullanan karakter seçtiği eve yürür (bunu sadece o oyuncu görür). Sabah cesetler ve açıklama kutusu, akşam asılan kişi meydanda. Fazlar süre dolunca kendiliğinden geçer.

**Roller (19):** Masum, Doktor, Deli, Polis, Gözcü, İzci, Dedektif, Tuzakçı, İspiyoncu, Provokatör · Hain, Temizlikçi, Suçlayıcı (+ masum rollerin hain sürümleri) · Hayatta Kalan, Seri Katil, Bombacı, Hırsız, Büyücü, Hortlak.

**Kurallar:** her hain kendi başına öldürür, yardımcı hainler gece ya yeteneğini kullanır ya öldürür; hainler birbirini tanır ama yazışamaz ve gece birbirini göremez. Oylar gizlidir; sonunda yalnızca toplamlar açıklanır. Ölen oyuncular kendi aralarında yazışabilir.

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
- Sayfayı GitHub Pages gibi başka bir yerden açacaksan sunucu adresini `index.html` içindeki `KG_SERVER` sabitine yaz ya da linke `?s=wss://oyun.ornek.com` ekle.

Yerelde denemek için: `cd kasaba-gecesi/sunucu && npm install && npm start`, ardından `http://localhost:8787`. Testler: `npm test` (oyun mantığı ve sunucu), `npm run e2e` (gerçek tarayıcı sekmeleriyle uçtan uca; Playwright ve Chromium gerekir).
