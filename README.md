# hasan-Ahmet-projects
## Kasaba Gecesi

`kasaba-gecesi/index.html` — tarayıcıda oynanan, 4–12 kişilik, Feign tarzı bir sosyal çıkarım oyunu. Oda ve oyun mantığı küçük bir Node sunucusunda (`kasaba-gecesi/sunucu/`) yaşar; ev sahibi dahil herkes WebSocket ile bağlanır. Ev sahibi sekmeyi kapatsa da oyun sürer, kopan oyuncu aynı linkle kaldığı yerden döner.

**Oynamak için:** sunucuyu kur (aşağıda), adresini aç, "Yeni oda kur"a bas, davet linkini gönder. Telefonda yatay oynanır.

**Oyun:** tam ekran köy sahnesi; evler halka hâlinde, karakterler meydanda. Gece herkes evine girer, rolünü kullanan karakter seçtiği eve yürür (bunu sadece o oyuncu görür). Sabah cesetler ve açıklama kutusu, akşam asılan kişi meydanda. Fazlar süre dolunca kendiliğinden geçer.

**Roller (19):** Masum, Doktor, Deli, Polis, Gözcü, İzci, Dedektif, Tuzakçı, İspiyoncu, Provokatör · Hain, Temizlikçi, Suçlayıcı (+ masum rollerin hain sürümleri) · Hayatta Kalan, Seri Katil, Bombacı, Hırsız, Büyücü, Hortlak.

**Kurallar:** her hain kendi başına öldürür, yardımcı hainler gece ya yeteneğini kullanır ya öldürür; hainler birbirini tanır ama yazışamaz ve gece birbirini göremez. Oylar gizlidir; sonunda yalnızca toplamlar açıklanır. Ölen oyuncular kendi aralarında yazışabilir.

### Sunucu kurulumu

Gerekenler: Ubuntu ya da Debian bir VPS (SSH ile sen girersin) ve tercihen bir alan adı. Alan adının (ör. `oyun.ornek.com`) A kaydını VPS'in IP adresine yönlendir.

```sh
git clone -b sunucu https://github.com/yourrfriend/hasan-Ahmet-projects.git
cd hasan-Ahmet-projects/kasaba-gecesi/sunucu
sudo ./kur.sh oyun.ornek.com
```

`kur.sh`; Node 20'yi, Caddy'yi (otomatik HTTPS) ve `kasaba-gecesi` systemd servisini kurar, oyunu `/opt/kasaba-gecesi` klasörüne kopyalar. Bittiğinde oyun `https://oyun.ornek.com` adresinde açılır. Alan adın yoksa `sudo ./kur.sh` yeter; oyun `http://SUNUCU_IP` adresinden açılır, ancak HTTPS olmadığı için tarayıcı linki panoya kopyalamaya ve mikrofona izin vermeyebilir.

- Güncelleme: `git pull && sudo ./kur.sh oyun.ornek.com`
- Günlük: `journalctl -u kasaba-gecesi -f`
- Odalar bellekte tutulur; servis yeniden başlarsa açık odalar kapanır. 2 saat kullanılmayan oda kendiliğinden silinir.
- Sayfayı GitHub Pages gibi başka bir yerden açacaksan sunucu adresini `index.html` içindeki `KG_SERVER` sabitine yaz ya da linke `?s=wss://oyun.ornek.com` ekle.

Yerelde denemek için: `cd kasaba-gecesi/sunucu && npm install && npm start`, ardından `http://localhost:8787`. Testler: `npm test` (oyun mantığı ve sunucu), `npm run e2e` (gerçek tarayıcı sekmeleriyle uçtan uca; Playwright ve Chromium gerekir).
