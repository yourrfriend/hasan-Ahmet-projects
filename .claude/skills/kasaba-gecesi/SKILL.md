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
| `kasaba-gecesi/sunucu/server.js` | HTTP (sayfayı sunar, `/saglik`) + WebSocket (`/ws`), bellek içi odalar, 500 ms'lik zamanlayıcı. |
| `kasaba-gecesi/sunucu/test/` | `game.test.js`, `server.test.js` (`npm test`), `e2e.js` (`npm run e2e`). |
| `kasaba-gecesi/sunucu/kur.sh`, `Caddyfile` | VPS kurulumu, çok oyunlu/çok sürümlü: `kur.sh AD ALAN [--surum REF]` → `/opt/games/AD`, `/etc/games/AD.env` (PORT, ALAN, SURUM, COMMIT), systemd şablonu `game@AD`, Caddy parçası `/etc/caddy/games/AD.caddy` (`Caddyfile` bunun şablonu). |
| `kasaba-gecesi/sunucu/PLAN.md` | Sunucuya taşıma planı ve durumu. |

## Mimari ve veri akışı

- Oda nesnesi: `room.game = R = {P, g, settings}`.
  - `R.P` **herkese açık** durum; istemciye aynen gider (`{t:'state', P:{...P, lobby, hostId, room}, now}`).
  - `R.g` **gizli** durum: `roles, acts, votes, notes, dchat, candle, haunt, provoke, blame…`. Asla istemciye gitmez.
  - Kişiye özel bilgi yalnız `privFor(R, uid)` ile, yalnız o oyuncunun soketlerine gider (`{t:'priv', d}`).
- İstemci → sunucu: `join{room,uid,name,color,hat,host?,settings?}`, `look`, `settings`, `start`, `cancel`, `close` (ev sahibi odayı siler), `act{kill,ab,guess,det,d}`, `vote{v,d}`, `msg{x}`, `dmsg{x}`.
- Sunucu → istemci: `you{id}` (açık kimlik, join yanıtı), `state{P,now}`, `chat{a,init?}`, `priv{d}`, `err{m,code}`.
- Oyuncu kimliği `kg_uid` (localStorage, gizli). Yeniden bağlanan aynı anahtarla aynı oyuncu olur. Ev sahibi = `room.hostId`; 10 dk bağlı değilse bağlı bir oyuncuya geçer (`HOST_GRACE_MS`). Odalar 2 saat mesajsız kalınca silinir (`ROOM_TTL_MS`). Lobideki ya da izleyen üye kopunca `room.members`'tan silinir; oyundaki oyuncu dönebilsin diye kalır.
- Faz akışı: `night → talk → vote → night…`, `checkWin` olursa `end`. Süreler `P.settings` (en az 15 sn); sabah/akşam animasyonu için `talk` +7 sn, `night` +6 sn eklenir. Herkes oy verince oylama beklemeden biter.
- İstemcide `isHost = P.hostId === myId`. Sunucu adresi: `?s=` parametresi, sonra `KG_SERVER` sabiti, yoksa sayfanın kendi origin'i + `/ws`.

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

- İlk gece rol kartı (`ui.roleCard`) açıkken evler tıklanmaz; testte önce "Anladım"a bas. Eylem düğmeleri gece başladıktan ~2,5 sn sonra açılır.
- Evler SVG; tıklama `scene.houses[id].g.onclick` ile bağlı.
- Playwright global kurulu (`npm root -g`); `NODE_PATH` vermeden `require('playwright')` bulunmaz. `playwright install` çalıştırma.
- `pkill -f "node server.js"` kendi kabuğunu da öldürür (komut satırında aynı metin geçer). `pkill -f "[n]ode server.js"` kullan.
- Odalar bellekte: servis yeniden başlarsa açık oyunlar kaybolur. Kalıcılık istenirse bu ayrı bir iş (PLAN.md "Sonrası").
- `kur.sh` systemd ister; konteynerde gerçek kurulum yapılamaz. Değiştirirsen `bash -n` çalıştır ve betiği sahte ortamda dene: `KG_APP_KOK`, `KG_AYAR_KOK`, `KG_CADDY_KOK`, `KG_SYSTEMD_KOK` ile yolları geçici klasöre çevir, PATH'e `systemctl` (game@AD'yi `node server.js` ile başlatan) ve `apt-get` taklitleri koy, `caddy` ikilisini GitHub sürümünden indir. Kurulum, `--surum`, aynı alan adı, geri alma, `--liste`, `--kaldir` senaryolarını dene.
- `kur.sh` `set -euo pipefail` ile çalışır: olmayan dosyayı okuyan bir boru (`cat x | sed`) ya da `[ … ] && …` ile biten bir döngü betiği sessizce bitirir. Koşulları `if` ile yaz.
- Sunucu `PORT`, `HOST` ve `KG_SURUM` ortam değişkenlerini okur; `/saglik` sürümü döner. Başka bir oyun da aynı kurala uyarsa (`sunucu/server.js`, `/saglik`) aynı `kur.sh` düzenine girer.

## Yayına alma

VPS'te (`kasaba-gecesi/sunucu` içinden): `git pull && sudo ./kur.sh kasaba kasaba.games.munupixi.com`. Test sürümü: `sudo ./kur.sh kasaba-test kasaba-test.games.munupixi.com --surum <branch>`. Liste: `sudo ./kur.sh --liste`. Günlük: `journalctl -u game@kasaba -f`. Sağlık ve sürüm: `curl https://kasaba.games.munupixi.com/saglik`.
