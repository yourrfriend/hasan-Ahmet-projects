# Kasaba Gecesi — sunucuya taşıma planı (dal: `sunucu`)

## Neden
Oyun şu an ev sahibinin tarayıcısında yürüyor (PeerJS, tarayıcıdan tarayıcıya). iPad/telefon sekmeyi uyutunca oda düşüyor; operatör/NAT engelinde "Ev sahibine bağlanılıyor…" takılıyor. Çözüm: oda ve oyun mantığı bir sunucuda yaşasın; herkes (ev sahibi dahil) WebSocket ile bağlansın.

## Hedef
- Ev sahibi sekmeyi kapatsa / uygulama değiştirse oyun devam eder.
- Kopan oyuncu aynı linkle kaldığı yerden girer (oyuncu kimliği `kg_uid` ile eşleşir).
- PeerJS tamamen kalkar; "Ev sahibine bağlanılıyor" ekranı kalkar.
- Oyun dosyası (`kasaba-gecesi/index.html`) görsel olarak aynı kalır; yalnızca ağ katmanı değişir.
- Kurulum tek komut: `./kur.sh` (Node 20 + Caddy ile otomatik HTTPS + systemd servisi).

## Mimari
```
kasaba-gecesi/
  index.html        # istemci (mevcut sahne + UI). WS_URL ile sunucuya bağlanır
  sunucu/
    server.js       # Node 20, `ws` paketi. Oda yönetimi + oyun mantığı
    game.js         # index.html'deki ev sahibi mantığının taşınmış hali:
                    #   startGame, setPhase, resolveNight, resolveVote, checkWin,
                    #   privPlainFor, autoSetup, ROLES/SETUP sabitleri
    package.json
    kur.sh          # Ubuntu/Debian: node, caddy, servis, Caddyfile
    Caddyfile       # oyun.ALAN { reverse_proxy localhost:8787 ; file_server for / }
    PLAN.md
```
- Tek süreç, bellek içi odalar (`Map<kod, Oda>`). Oda 2 saat hareketsiz kalınca silinir.
- Sunucu statik dosyayı da sunar (`index.html`), yani GitHub Pages şart değil; ama Pages'teki kopya da `WS_URL` ile aynı sunucuya bağlanabilir.

## Protokol (JSON, WebSocket)
İstemci → sunucu:
- `{t:'join', room, uid, name, color, hat}` — odaya gir / yeniden bağlan. Oda yoksa ve `host:true` ise oluştur.
- `{t:'start'}` (yalnız ev sahibi), `{t:'settings', night, talk, vote}` (ev sahibi)
- `{t:'act', kill, ab, guess, det}` — gece hamlesi (sunucu gün/faz kontrolü yapar)
- `{t:'vote', v}` · `{t:'msg', x}` · `{t:'dmsg', x}` (ölüler) · `{t:'look', color, hat}` · `{t:'cancel'}` (ev sahibi)
Sunucu → istemci:
- `{t:'state', P, now}` — herkese açık durum (mevcut `P` nesnesiyle aynı şema; `votes/roles/acts/notes` asla içinde olmaz)
- `{t:'priv', d}` — kişiye özel (mevcut `privPlainFor` çıktısı)
- `{t:'err', m}`
Faz geçişleri sunucuda `setInterval` ile (mevcut `startTimer` mantığı). Ev sahibi = odayı kuran `uid`; o kopunca oda devam eder, ev sahibi düşmezse yetkisi kalır; 10 dk dönmezse sıradaki oyuncu ev sahibi olur.

## İstemci değişiklikleri (index.html)
- `openHostPeer/joinRoom/connectHost/onHostMsg/pushState/refreshPriv` ve tüm `isHost` dallanmaları kalkar; yerine tek `ws` bağlantısı + `send()`.
- `isHost` artık sunucudan gelen `P.hostId===myId` ile belirlenir (menüdeki ev sahibi düğmeleri için).
- Yerel `local.act/vote` ve animasyon durumu aynen kalır.
- Bağlantı kopunca otomatik yeniden bağlanma (1s, 2s, 4s… en çok 15s); ekranda küçük "bağlantı yok" rozeti.
- `WS_URL`: `location.origin` sunucudaysa oradan; Pages'ten açıldıysa `?s=wss://oyun.ALAN` ya da sabit.
- Ses/animasyon/sahne koduna dokunulmaz.

## Taşıma adımları
1. `game.js`: index.html'den ev sahibi mantığını ayıkla, saf fonksiyonlar hâline getir (girdi: oda durumu; çıktı: yeni durum + kişiye özel paketler). Node'da birim testi: 4/7/12 kişilik rastgele oyunlar hatasız bitmeli, `state` paketlerinde gizli alan sızmamalı (mevcut `sim.js` mantığı).
2. `server.js`: oda yönetimi, WebSocket, zamanlayıcılar, yeniden bağlanma, statik dosya.
3. `index.html`: ağ katmanını değiştir; sahne/animasyon/ses aynen.
4. `kur.sh` + `Caddyfile`; README'ye kurulum bölümü.
5. Yerel uçtan uca test: Playwright ile 2+ sekme aynı odaya, ev sahibi sekmesi kapatılınca oyunun sürmesi, kopan oyuncunun geri girmesi.
6. Kullanıcı VPS'te `git clone` + `./kur.sh` çalıştırır; alan adı DNS'i VPS'e yönlendirilmiş olmalı.

## Kullanıcıdan gerekenler
- VPS (Ubuntu/Debian), SSH ile kendisi girer; şifre sohbete yazılmaz.
- Alan adı (ör. `oyun.ALAN`) → VPS IP'sine A kaydı. Yoksa HTTP + IP ile de çalışır (pano kopyalama ve mikrofon kısıtlanır).

## Sonrası (bu dalda değil)
- Arşiv/istatistik (SQLite), oyun sonu tekrar izleme, sesli sohbet (sunucu varken SFU'suz P2P ses yine olur), yapay zekâ botlar.
