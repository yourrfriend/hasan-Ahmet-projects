---
name: kasaba-gecesi
description: Kasaba Gecesi (kasaba-gecesi/ klasörü) üzerinde çalışırken kullan. Rol ekleme/değiştirme, oyun kuralları, sunucu (WebSocket, oda, faz zamanlayıcı), istemci arayüzü, sahne/animasyon/ses, testler, VPS kurulumu (kur.sh, Caddy) ya da oyunla ilgili bir hata. Mimariyi, dokunulmaz kuralları, test ve doğrulama akışını ve bilinen tuzakları anlatır.
---

# Kasaba Gecesi

4–12 kişilik, tarayıcıda oynanan sosyal çıkarım oyunu (Feign tarzı). Türkçe arayüz, telefonda yatay oynanır.
Oda ve oyun mantığı Node sunucusunda yaşar; ev sahibi dahil herkes WebSocket ile bağlanır.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `kasaba-gecesi/index.html` | İstemci: tek dosya (CSS + JS). SVG köy sahnesi, animasyon, Web Audio ile üretilen sesler, arayüz, ağ katmanı. |
| `kasaba-gecesi/sunucu/game.js` | Oyun kuralları, ağdan bağımsız: `startGame`, `setPhase`, `resolveNight`, `resolveVote`, `checkWin`, `act/vote/chat/deadChat`, `privFor`, `tick`. Tarayıcı da yükler (sabitler için). |
| `kasaba-gecesi/sunucu/server.js` | HTTP (sayfayı sunar, `/saglik`) + WebSocket (`/ws`), bellek içi odalar, 500 ms'lik zamanlayıcı. Her `flush`'ta `R.log`'u `kayit.js`'e boşaltır. |
| `kasaba-gecesi/sunucu/kayit.js` | Olay günlüğünün gittiği yuva: `olustur(opts) → {kuyrukla(room,olaylar), kapat(), sayac}`. Şimdilik sayar ve atar; geçmiş aşamasında Supabase'e yazacak (tasarım: `docs/superpowers/specs/2026-10-24-kasaba-gecesi-gecmis-design.md`). |
| `kasaba-gecesi/sunucu/test/` | `game.test.js`, `server.test.js` (`npm test`), `e2e.js` (`npm run e2e`). |
| `kasaba-gecesi/sunucu/kur.sh`, `Caddyfile` | VPS kurulumu, çok oyunlu/çok sürümlü: `kur.sh AD ALAN [--surum REF]` → `/opt/games/AD`, `/etc/games/AD.env` (PORT, ALAN, SURUM, COMMIT), systemd şablonu `game@AD`, Caddy parçası `/etc/caddy/games/AD.caddy` (`Caddyfile` bunun şablonu). |
| `kasaba-gecesi/sunucu/db/` | Supabase (geçmiş/kimlik): `kur-supabase.sh` (paket, `/root/supabase-kasaba`, yalnız yerel portlar), `caddy.sh` (dış kapı `kasaba-api.munupixi.com`, yalnız API yolları), `goc/*.sql` + `uygula.sh` (şema, RLS, görünümler, `hesap_birlestir`; `--test` RLS senaryoları), `yedek.sh` + systemd timer. Tasarım `docs/superpowers/specs/…gecmis-design.md`. |
| `kasaba-gecesi/sunucu/PLAN.md` | Sunucuya taşıma planı ve durumu. |

## Mimari ve veri akışı

- Oda nesnesi: `room.game = R = {P, g, settings}`.
  - `R.P` **herkese açık** durum; istemciye aynen gider (`{t:'state', P:{...P, lobby, hostId, room}, now}`).
  - `R.g` **gizli** durum: `roles, acts, votes, notes, dchat, candle, haunt, provoke, blame…`. Asla istemciye gitmez.
  - Kişiye özel bilgi yalnız `privFor(R, uid)` ile, yalnız o oyuncunun soketlerine gider (`{t:'priv', d}`).
- İstemci → sunucu: `join{room,uid,name,color,hat,host?,settings?}`, `look`, `settings`, `start`, `cancel`, `close` (ev sahibi odayı siler), `act{kill,ab,guess,det,d,g}`, `vote{v,d,g}` (`g`: `P.gameId`; başka maçın gecikmiş hamlesi reddedilir), `hazir{v}` (yalnız `end`), `start{rovans:true}` (son ekrandan: yalnız hazır ∧ bağlı 4–12 üye; başlatan ev sahibi hazır sayılır), `gordum` (ölçüm: son ekran görüldü), `msg{x}`, `dmsg{x}`.
- Sunucu → istemci: `you{id}` (açık kimlik, join yanıtı), `state{P,now}`, `chat{a,init?}`, `priv{d}`, `err{m,code}`.
- Oyuncu kimliği `kg_uid` (localStorage, gizli). Yeniden bağlanan aynı anahtarla aynı oyuncu olur. Ev sahibi = `room.hostId`; 10 dk bağlı değilse bağlı bir oyuncuya geçer (`HOST_GRACE_MS`). Odalar 2 saat mesajsız kalınca silinir (`ROOM_TTL_MS`). Lobideki ya da izleyen üye kopunca `room.members`'tan silinir; oyundaki oyuncu dönebilsin diye kalır.
- Paket 1a (oyun sonu): `checkWin` → `P.winner.kazananlar` (tek kaynak), `P.gazete` (`gazeteFor`: en çok `GAZETE_EN_COK=3` kart, yalnız günlükten, deterministik, aynı özne tekrarlanmaz); `server.js` oda düzeyi `room.hazir` (`P.hazir`), `room.skor`/`skorIslenen` (`P.skor`, `skorIsle` flush+start+cancel öncesi, gameId başına bir kez; iptal sayılmaz), ölçüm olayları `G.olay` (`son_ekran_goruldu`, `hazir`, `rovans_basladi`, `kopus`, `dondu`; her günlük kaydı `oyun:gameId` taşır). Tasarım: `docs/superpowers/specs/2026-10-25-kasaba-gecesi-paket1-oyun-sonu-design.md`.
- Olay günlüğü: `game.js` her çözümde `logEv(R,tur,veri)` ile olay yazar (`baslangic`, `gece_hamle`, `gece_sonuc`, `gunduz_sonuc`, `bitis`, `iptal`; alanlar tasarım §5.4). `R.log` sunucuya giden kuyruk (her yayında boşalır), `R.gameLog` bu oyunun tam günlüğü. İkisi de gizlidir (`SECRET_KEYS`). Oyun bitince `checkWin` günlükten `P.ozet` (herkese açık: kazanan, oyuncu rol/akıbet) üretir, `privFor` `payin` (öldürdün/kurtardın/yakaladın/tuttun) ekler; istemci `renderEndUI` bunları ve "Tekrar oyna"yı (`cancel`) gösterir.
- Rol dağılımı: `autoSetup(n)` + `DAGILIM` eşikleri (`game.js`); her özel rol en fazla bir kez; eşikler `npm run denge` (test/denge.js, test değil) ile ölçülür, tablo README'de. Eşik değiştirirken `game.test.js`'teki `bekle` tablosunu ve README'yi güncelle. Kural: her hain ayrı öldürür (kullanıcı kararı; "ekip tek kurban" reddedildi).
- Faz akışı: `night → talk → vote → night…`, `checkWin` olursa `end`. Süreler `P.settings` (en az 15 sn); sabah/akşam animasyonu için `talk` +7 sn, `night` +6 sn eklenir. Herkes oy verince oylama beklemeden biter.
- Bağlantı durumu: `state.P.online` bağlı üyelerin açık kimlikleri (sunucu ekler, `game.js` bilmez); istemci kopuk oyuncunun karakterine "📡 KOPUK" etiketi koyar. Gece süresi dolduğunda kopuk yaşayan oyuncu varsa `tick(R, offline)` bir kez en çok 30 sn bekler (`P.waiting`, `P.waited`); hamlesi olup olmadığına bakılmaz (bakılsa rolü ele verirdi). Testlerde geceyi hemen bitirmek için `P.waited=true` ver.
- Dokunma: gece karartma katmanı ve ambiyans `pointer-events:none`; ev halkası `ringPos` ile görünür alana sığdırılır (kısa ekranda basılır). Oylamada karakter de hedeftir; karakter bir evin önündeyse dokunma eve gider (`houseAt`).
- İstemcide `isHost = P.hostId === myId`. Sunucu adresi: `?s=` parametresi (**yalnız** localhost'ta ya da sayfanın kendi host'u için — `sunucuIzinli`; gizli anahtar yabancı adrese gitmesin), sonra `KG_SERVER` sabiti, yoksa sayfanın kendi origin'i + `/ws`.

## Dokunulmaz kurallar

1. **Gizli bilgi `P`'ye girmez.** Rol, gece hamlesi, oy hedefi, not, ölü sohbeti `R.g` ya da `privFor` içinde kalır. `P.morning`/`P.evening` gibi açıklanan sonuçlar hariç. Testler `state` içinde gizli anahtar arar; yeni gizli alan eklersen `test/game.test.js` içindeki `SECRET_KEYS` listesine de ekle.
2. **Sunucu yetkilidir.** Her istemci mesajı `game.js` içinde doğrulanır: faz, gün (`d`), oyuncu yaşıyor mu, hedef gerçek oyuncu mu, `guess` gerçekten `ROLES` anahtarı mı (`hasOwnProperty`). İstemciye güvenme.
3. **İstemci kural hesaplamaz.** `index.html` yalnız gösterir ve mesaj yollar; kural değişikliği `game.js`'e yapılır.
4. **Sahne, animasyon, ses kodu** (`// ---------- Köy sahnesi` ve `// ---------- Ambiyans` bölümleri) kullanıcı istemedikçe değişmez; görünüm aynı kalmalı.
5. **Sabitler tek yerde:** `ROLES`, `SETUP`, `COLORS`, `HATS` yalnız `game.js`'te. `index.html` dosyayı `<script src="sunucu/game.js">` ile yükler ve `window.KG_GAME`'den alır (şapka adları `HAT_NAMES` istemcide). `index.html`'e kopya ekleme; `kontrol.sh` kopyayı yakalar. `game.js` hem Node (`module.exports`) hem tarayıcı (`KG_GAME`) için sarmalanmıştır; dosyanın başındaki/sonundaki sarmalı bozma.
8. **Oyuncu kimliği iki parçadır:** istemcideki `kg_uid` gizli anahtardır ve yalnız `join` ile sunucuya gider; sunucu ondan türettiği açık kimliği (`pubId`) `{t:'you',id}` ile döner ve `P.players[].id`, `P.hostId`, `lobby[].id` hep bu açık kimliktir. Gizli anahtar hiçbir yayında geçmez; istemcide `myId` açık kimliktir.
9. **Sohbet state içinde gitmez.** `P.chat` sunucuda durur ama `state` paketinden çıkarılır; her sokete yalnız görmediği satırlar `{t:'chat',a:[...]}` ile gider (satırlardaki `s` sıra numarası). İstemci `chatLog`'u biriktirir ve `P.chat` olarak bağlar; yeni oyun/lobide sıfırlar.
6. `index.html` değişince `window.KG_VER` damgasını artır (ör. `'2026-10-12s'` → yeni tarih + harf). Hata ekranı bu sürümü gösterir; önbellek sorunlarını ayırt etmeye yarar.
7. Arayüz metinleri Türkçe ve kısa; mevcut üslubu koru.

## Doğrulama akışı

Her değişiklikten sonra:

```sh
.claude/skills/kasaba-gecesi/scripts/kontrol.sh          # sözdizimi + sabit eşleşmesi + npm test
.claude/skills/kasaba-gecesi/scripts/kontrol.sh --e2e    # arayüz/ağ değiştiyse: + 4 sekmeli tarayıcı testi
```

- Kural değişikliği → `test/game.test.js`'e senaryo ekle (`fixed([...roller])` yardımcısıyla rolleri sabitleyip `act`/`advance`/`vote` çağır).
- Protokol/sunucu değişikliği → `test/server.test.js`.
- Arayüz değişikliği → `--e2e` çalıştır ve ekran görüntüsüne **bak** (aşağıdaki gibi). Görsel değişiklikte telefon yatay boyutu da dene (ör. 844×390).

Elle deneme ve ekran görüntüsü:

```sh
cd kasaba-gecesi/sunucu && PORT=8799 node server.js &      # http://127.0.0.1:8799
NODE_PATH="$(npm root -g)" node betik.js                    # Playwright betiği; çıktıyı scratchpad'e yaz
```

Playwright betiğinde süreleri beklemek yerine sunucuyu aynı süreçte `createServer({quiet:true,tickMs:100})` ile aç ve `srv.rooms.get(kod).game.P.ends = Date.now()-1` ile fazı ilerlet (`test/e2e.js` örnek).

## Sık yapılan işler

**Yeni rol eklemek**
1. `game.js` → `ROLES`'a tanım (`n, team, ico, desc, act?, pos?, once?, dual?`), gerekiyorsa `SETUP`, `MADPOOL`, `INVGROUPS`, `autoSetup`.
2. Gece etkisi `resolveNight` içindeki doğru adıma (1 tuzak · 2 polis · 3 ziyaret · 4 koruma · 5 saldırı · 6 bilgi · 7 ölümler); kazanma koşulu `checkWin`.
3. İstemci sabitleri `game.js`'ten alır, kopyalama gerekmez; özel düğme gerekiyorsa `index.html`'de `renderGameUI` (gece eylem düğmeleri) ve `modesFor`.
4. `game.test.js`'e senaryo; `kontrol.sh --e2e`.

**Yeni istemci mesajı** → `server.js` `onMessage` içinde `switch` dalı + `game.js`'te doğrulayan fonksiyon + istemcide `send({t:…})` + `server.test.js`.

**Sunucuda yayın** → durum değişince `schedule(room)` (40 ms içinde birleşik gönderim) ya da hemen `flush(room)`. `priv` yalnız değiştiyse gider (`room.lastPriv`).

## Bilinen tuzaklar

- Gece hamlesi: `pickHouse` → `yuruyusBaslat(hedef, uygula, kind)` yürüyüş süresini (`anim.walkMs`, 190 birim/sn) **render'dan önce** hesaplar; `moveBean(...,ms)` yalnız o hareketi mesafeye göre yapar. Gece boyunca render'ın `eseq` (akşam dizisi) dalı çalışır, `night` dalı değil — konum değişikliği oraya da işlenmeli. Rol hareketleri `S_.aksiyon` katmanında (render **silmez**; `rolHareketi` kendisi siler), izler `S_.fx`'te (her render yeniden çizilir, `izCiz`). Etiketler (SEN/HAİN/KOPUK) karakter grubunun içinde (`b._tag`, `b._tag2`), `scene.labels`'da değil.
- İlk gece rol kartı (`ui.roleCard`) açıkken evler tıklanmaz; testte önce "Anladım"a bas. Eylem düğmeleri gece başladıktan ~2,5 sn sonra açılır.
- Evler SVG; tıklama `scene.houses[id].g.onclick` ile bağlı.
- Playwright global olmayabilir: `kontrol.sh --e2e` sırayla `npm root -g` ve npx önbelleğine (`~/.npm/_npx/*/node_modules`) bakar, Playwright'ın Chromium'u yoksa sistemdeki Chrome'u `PW_CHROMIUM` ile verir. `test/e2e.js`'yi elle çalıştırırken `NODE_PATH` (ve gerekirse `PW_CHROMIUM`) ver. `playwright install` çalıştırma.
- `pkill -f "node server.js"` kendi kabuğunu da öldürür (komut satırında aynı metin geçer). `pkill -f "[n]ode server.js"` kullan.
- Odalar bellekte: servis yeniden başlarsa açık oyunlar kaybolur. Kalıcılık istenirse bu ayrı bir iş (PLAN.md "Sonrası").
- `kur.sh` systemd ister; konteynerde gerçek kurulum yapılamaz. Değiştirirsen `bash -n` çalıştır ve betiği sahte ortamda dene: `KG_APP_KOK`, `KG_AYAR_KOK`, `KG_CADDY_KOK`, `KG_SYSTEMD_KOK` ile yolları geçici klasöre çevir, PATH'e `systemctl` (game@AD'yi `node server.js` ile başlatan) ve `apt-get` taklitleri koy, `caddy` ikilisini GitHub sürümünden indir. Kurulum, `--surum`, aynı alan adı, geri alma, `--liste`, `--kaldir` senaryolarını dene.
- Supabase ionos'ta `/root/supabase-kasaba` altında (Docker snap'i `/opt`'u ve `/home` altındaki dotfile'ları okuyamaz). Ağ geçidi `apikey` başlığı olmadan 401 verir; Studio dışarı kapalıdır (`ssh -L 8000:127.0.0.1:8000`). Şema değişikliği = yeni numaralı `db/goc/NNN_*.sql` + `uygula.sh`; RLS kuralı değişince `test.sql`'e senaryo ekle. `psql` için: `docker exec -i supabase-db psql -U postgres -d postgres`.
- `kur.sh` `set -euo pipefail` ile çalışır: olmayan dosyayı okuyan bir boru (`cat x | sed`) ya da `[ … ] && …` ile biten bir döngü betiği sessizce bitirir. Koşulları `if` ile yaz.
- Sunucu `PORT`, `HOST` ve `KG_SURUM` ortam değişkenlerini okur; `/saglik` sürümü döner. Başka bir oyun da aynı kurala uyarsa (`sunucu/server.js`, `/saglik`) aynı `kur.sh` düzenine girer.

## Yayına alma

VPS'te (`kasaba-gecesi/sunucu` içinden): `git pull && sudo ./kur.sh kasaba kasaba.munupixi.com`. Test sürümü: `sudo ./kur.sh kasaba-test kasaba-test.munupixi.com --surum <branch>`. Liste: `sudo ./kur.sh --liste`. Günlük: `journalctl -u game@kasaba -f`. Sağlık ve sürüm: `curl https://kasaba.munupixi.com/saglik`.
