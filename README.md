# hasan-Ahmet-projects
## Kasaba Gecesi

`kasaba-gecesi/index.html` — tarayıcıda oynanan, 4–12 kişilik, Feign tarzı bir sosyal çıkarım oyunu. Oda ve oyun mantığı küçük bir Node sunucusunda (`kasaba-gecesi/sunucu/`) yaşar; ev sahibi dahil herkes WebSocket ile bağlanır. Ev sahibi sekmeyi kapatsa da oyun sürer, kopan oyuncu aynı linkle kaldığı yerden döner.

**Oynamak için:** sunucuyu kur (aşağıda), adresini aç, "Yeni oda kur"a bas, davet linkini gönder. Telefonda yatay oynanır.

**Oyun:** tam ekran köy sahnesi; evler halka hâlinde, karakterler meydanda. Gece herkes evine girer, rolünü kullanan karakter seçtiği eve yürür (bunu sadece o oyuncu görür). Sabah cesetler ve açıklama kutusu, akşam asılan kişi meydanda. Fazlar süre dolunca kendiliğinden geçer.

**Roller (19):** Masum, Doktor, Deli, Polis, Gözcü, İzci, Dedektif, Tuzakçı, İspiyoncu, Provokatör · Hain, Temizlikçi, Suçlayıcı (+ masum rollerin hain sürümleri) · Hayatta Kalan, Seri Katil, Bombacı, Hırsız, Büyücü, Hortlak.

**Kurallar:** her hain kendi başına öldürür, yardımcı hainler gece ya yeteneğini kullanır ya öldürür; hainler birbirini tanır ama yazışamaz ve gece birbirini göremez. Oylar gizlidir; sonunda yalnızca toplamlar açıklanır. Ölen oyuncular kendi aralarında yazışabilir.

### Sunucu kurulumu

Gerekenler: Ubuntu ya da Debian bir VPS (SSH ile sen girersin) ve bir alan adı. Her oyun ve her sürüm kendi alt alan adında yayınlanır; bunun için DNS'te bir kez joker A kaydı aç: `*.games.munupixi.com` → VPS'in IP adresi.

```sh
git clone https://github.com/yourrfriend/hasan-Ahmet-projects.git
cd hasan-Ahmet-projects/kasaba-gecesi/sunucu
sudo ./kur.sh kasaba kasaba.games.munupixi.com                                # yayındaki sürüm
sudo ./kur.sh kasaba-test kasaba-test.games.munupixi.com --surum sunucu       # test: bir branch
sudo ./kur.sh kasaba-v1 kasaba-v1.games.munupixi.com --surum v1               # eski sürüm: tag ya da commit
```

`kur.sh AD ALAN [--surum REF] [--port N]` Node 20'yi ve Caddy'yi (otomatik HTTPS) kurar, oyunu `/opt/games/AD` klasörüne koyar ve `game@AD` systemd servisini başlatır. Her kurulum kendi portunu alır (8787'den başlayarak boş olan ilk port) ve Caddy'ye kendi parçasını (`/etc/caddy/games/AD.caddy`) ekler. Ana `/etc/caddy/Caddyfile`'da başka sitelerin varsa onlara dokunulmaz, yalnız `import` satırı eklenir. `--surum` verilmezse betiğin bulunduğu klasördeki dosyalar kurulur.

- Güncelleme: aynı komutu tekrar çalıştır (`git pull` sonrası ya da `--surum` ile). Port korunur. Yeni sürüm sağlık kontrolünden geçmezse eski sürüm kendiliğinden geri yüklenir.
- Kurulumlar: `sudo ./kur.sh --liste` (adres, port, sürüm, commit, durum). Kaldırmak: `sudo ./kur.sh --kaldir kasaba-test`
- Sürüm: `curl https://kasaba.games.munupixi.com/saglik` çalışan sürümü ve commit'i gösterir.
- Günlük: `journalctl -u game@kasaba -f`
- Eski tek oyunluk kurulum (`kasaba-gecesi` servisi) varsa ilk yeni kurulumda durdurulur; eski Caddyfile `Caddyfile.eski` olarak saklanır.
- Odalar bellekte tutulur; servis yeniden başlarsa açık odalar kapanır. 2 saat kullanılmayan oda kendiliğinden silinir.
- Sayfayı GitHub Pages gibi başka bir yerden açacaksan sunucu adresini `index.html` içindeki `KG_SERVER` sabitine yaz ya da linke `?s=wss://oyun.ornek.com` ekle.

Yerelde denemek için: `cd kasaba-gecesi/sunucu && npm install && npm start`, ardından `http://localhost:8787`. Testler: `npm test` (oyun mantığı ve sunucu), `npm run e2e` (gerçek tarayıcı sekmeleriyle uçtan uca; Playwright ve Chromium gerekir).
