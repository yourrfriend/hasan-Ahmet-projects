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
| `kasaba-gecesi/sunucu/server.js` | HTTP (sayfayı sunar, `/saglik`, `/ayar.json`; geçmiş sayfaları `GET /oyun/<uuid>` → `sayfa/oyun.html`, `/kasaba/<uuid>` → `sayfa/kasaba.html`, `/sayfa/*.{js,css}`) + WebSocket (`/ws`), bellek içi odalar, 500 ms'lik zamanlayıcı. Her `flush`'ta `R.log`'u `kayit.js`'e boşaltır. |
| `kasaba-gecesi/sunucu/kimlik.js` | Supabase token doğrulama (`dogrula(token,{secret,jwks})`); sunucu JWKS'i env'den ya da `/auth/v1/.well-known/jwks.json`'dan alır. |
| `kasaba-gecesi/sayfa/supabase.js` | Gömülü `@supabase/supabase-js` 2.117.3 UMD (CDN yok); sayfa `/ayar.json` kayıt açıksa yükler, anonim oturum açar (2 sn bekler), token'ı `kg_token`'da saklar. |
| `kasaba-gecesi/sayfa/ortak.js`, `ortak.css` | Geçmiş sayfalarının ortak yardımcıları (Plan 5): `window.KG_SAYFA={el, ayar, oturum() (paylaşılan Supabase oturumu, 5 sn), rolAdi(p) (= `KG_GAME.rolEtiketi`), tarih, kimlik() (yoldaki uuid), not(), ROLES()}`; açık tema sayfa stili. |
| `kasaba-gecesi/sayfa/hikaye.js` | Saf UMD (`module.exports` / `window.KG_HIKAYE`): `hikaye(olaylar, oyuncular, ROLES) → [{baslik, satirlar[]}]` — `olaylar` satırlarından gece/gün/bitiş blokları; ölçüm olayları ve bilinmeyen `tur` atlanır; `rol_key` null (süren oyun) → ad yalnız. Test `test/hikaye.test.js`. |
| `kasaba-gecesi/sayfa/karsilastirma.js` | Saf UMD (`KG_KARSILASTIRMA`): `karsilastir(benUuid, oyunlar, oyuncular)` → üye başına birlikte/aynı taraf zafer/karşı taraf sayıları, `azMac` (N<3); `kazandiMi(p, oyun)` = SQL `kazanma()` kuralının JS kopyası (5 dal). Test `test/karsilastirma.test.js`. |
| `kasaba-gecesi/sayfa/oyun.html`, `kasaba.html` | `/oyun/<id>`: özet, oyuncular tablosu, gece gece hikâye; boş sonuç dalları ("bu oyunu göremezsin" / "henüz yazılmadı, yenile" / "oyun bitince"). `/kasaba/<id>`: ad (sahip düzenler, tek yazma), üyeler, `kasaba_tablo` (yüzde yok, örneklem var), karşılaştırmalar, son 20 maç. Yalnız anon anahtar + oturum (RLS). |
| `kasaba-gecesi/sunucu/eposta.js` | Tek gönderim fonksiyonu (Plan 6): `olustur({apiKey,gonderen,saglayici,fetch,zamanAsimiMs}) → {sendTransactionalEmail({to,subject,text,html}), kodMaili({tur,kod,sureDk,sayfa}), sayac}`; `varsayilan` env'den (`RESEND_API_KEY`, `EPOSTA_GONDEREN`, `EPOSTA_SAGLAYICI`). Resend HTTP API; yeniden deneme yok (GoTrue kancayı dener). |
| `kasaba-gecesi/sunucu/hesap.js` | GoTrue "Send Email" kancası ve birleştirme (saf): `imzaDogrula` (Standard Webhooks, ±5 dk, `\|` ile çoklu sır), `imzala` (test), `kancaYukunuCoz` (`magiclink`/`signup` → giriş kodu, `email_change` → bağlama kodu `token` alanı yeni adrese), `kancaIsle`, `birlestir({eski,yeni},{dogrula,url,serviceKey,fetch})` (iki taze token; `eski` anonim; RPC `hesap_birlestir` → admin DELETE), `maskele`. Yollar `server.js`'te: `POST /eposta/kanca` (sır yoksa 404; `webhook-id` 10 dk tekilleştirme), `POST /hesap/birlestir` (kayıt kapalıysa 404; IP başına 5/dk). |
| `kasaba-gecesi/sunucu/kod.js` | Kod isteği tavanları ve Turnstile (Plan 7, saf): `tavanlar({simdi,ipOn,ipSaat,adresSaat,adresGun,saat,gun,anonSaat}) → {kontrol, isaretle, geriAl (GoTrue'ya ulaşılamazsa iade), anonimKontrol, temizle, boyut, sayac}`; `turnstileDogrula({secret,response,remoteip,action,hostnames,fetch})` (siteverify; `action` ve `hostname` denetimi; ulaşılamazsa red). Yollar `server.js`'te: `POST /eposta/kod` (`{tur,email,turnstile,token?}` → sıra: biçim → ayar → IP → Turnstile → adres/kota → GoTrue yerel adres `SUPABASE_IC_URL`: bağla `PUT /auth/v1/user` oyuncunun token'ıyla, gir `POST /auth/v1/otp create_user:false`), `POST /hesap/anonim` (yerel `/signup {}`), `/ayar.json turnstile`, `/saglik kod`. Testlerde `opts.icFetch`, `opts.turnstileFetch`, `opts.kodTavan`. |
| `kasaba-gecesi/sunucu/kayit.js` | Supabase yazıcısı (PostgREST, service_role): `olustur({url,serviceKey,kurulum}) → {kuyrukla(room,olaylar), profil(uye,{ad,renk,sapka}) (aynı görünüm yeniden yazılmaz), sonRoller(uye), kapat() (async: yeni iş almaz, kuyruğu en çok 3 sn boşaltır), sayac (yazilan = başarılı yazma isteği sayısı)}`. Tek sıralı kuyruk: `baslangic` → kasaba bul/kur + üyelik + `oyunlar` + `oyun_oyunculari`; her olay → `olaylar` (`ignore-duplicates`); `bitis`/`iptal` → güncelleme. Misafir ev sahibi → maç atlanır. 5xx yeniden dener, 4xx düşer; açılışta eski `devam` oyunları iptal. Olaylar `oyunId` (uuid, `P.oyunId`) taşır; `bitis.veri.oyuncular` kapanış alanları (`kapanisFor`). Supabase'e PostgREST ile yazar (Plan 4; tasarım: `docs/superpowers/specs/2026-10-24-kasaba-gecesi-gecmis-design.md`). |
| `kasaba-gecesi/sunucu/test/` | `game.test.js`, `server.test.js` (`npm test`), `e2e.js` (`npm run e2e`). |
| `kasaba-gecesi/sunucu/kur.sh`, `Caddyfile` | VPS kurulumu, çok oyunlu/çok sürümlü: `kur.sh AD ALAN [--surum REF]` → `/opt/games/AD`, `/etc/games/AD.env` (PORT, ALAN, SURUM, COMMIT), systemd şablonu `game@AD`, Caddy parçası `/etc/caddy/games/AD.caddy` (`Caddyfile` bunun şablonu). |
| `kasaba-gecesi/sunucu/db/` | Supabase (geçmiş/kimlik): `kur-supabase.sh` (paket, `/root/supabase-kasaba`, yalnız yerel portlar), `caddy.sh` (dış kapı `kasaba-api.munupixi.com`, yalnız API yolları), `goc/*.sql` + `uygula.sh` (şema, RLS, görünümler, `hesap_birlestir`; `--test` RLS senaryoları), `yedek.sh` + systemd timer. Tasarım `docs/superpowers/specs/…gecmis-design.md`. |
| `kasaba-gecesi/sunucu/PLAN.md` | Sunucuya taşıma planı ve durumu. |

## Mimari ve veri akışı

- Oda nesnesi: `room.game = R = {P, g, settings}`.
  - `R.P` **herkese açık** durum; istemciye aynen gider (`{t:'state', P:{...P, lobby, hostId, room}, now}`).
  - `R.g` **gizli** durum: `roles, acts, votes, notes, dchat, candle, haunt, provoke, blame…`. Asla istemciye gitmez.
  - Kişiye özel bilgi yalnız `privFor(R, uid)` ile, yalnız o oyuncunun soketlerine gider (`{t:'priv', d}`).
- İstemci → sunucu: `join{room,uid,token?,name,color,hat,host?,settings?}` (`token`: Supabase erişim token'ı; `kimlik.js` imzayı yerelde doğrular — HS256 secret ya da ES256/RS256 JWKS — ve kimlik `'sb:'+sub`'dan türer; yoksa `uid`), `look`, `settings`, `start`, `cancel`, `close` (ev sahibi odayı siler), `act{kill,ab,guess,det,d,g}`, `vote{v,d,g}` (`g`: `P.gameId`; başka maçın gecikmiş hamlesi reddedilir), `hazir{v}` (yalnız `end`), `hizli{k,rol?,hedef?,d,n}` (tartışmada hızlı ifade: `game.hizli` doğrular, metni kurar, `pushChat` `{…,kisa:k}`; rol iddiası `iddia` olayı, diğerleri `hizli` ölçüm olayı; 8 sn / gün başına 4; red → `err soft`), `start{rovans:true}` (son ekrandan: yalnız hazır ∧ bağlı 4–12 üye; başlatan ev sahibi hazır sayılır), `gordum` (ölçüm: son ekran görüldü), `msg{x}`, `dmsg{x}`.
- Sunucu → istemci: `you{id,kayitli}` (açık kimlik + kayıtlı mı, join yanıtı), `state{P,now}`, `chat{a,init?}`, `priv{d}`, `err{m,code}`.
- Oyuncu kimliği `kg_uid` (localStorage, gizli). Yeniden bağlanan aynı anahtarla aynı oyuncu olur. Ev sahibi = `room.hostId`; 10 dk bağlı değilse bağlı bir oyuncuya geçer (`HOST_GRACE_MS`). Odalar 2 saat mesajsız kalınca silinir (`ROOM_TTL_MS`). Oda kodu 12 karakter ve **yalnız sunucu üretir** (istemcinin verdiği kod kullanılmaz; "Önceki odam" yalnız oda yaşıyorsa açar). IP başına frenler: `MAX_ROOMS_PER_IP` (5), `MAX_SOCKS_PER_IP` (24), `MAX_ROOMS_PER_IP_MIN` (5/dk); IP yerel vekilden gelen bağlantıda `CF-Connecting-IP`/`X-Forwarded-For`'dan alınır (`ipOf`). Aşımda `err limit`. Lobideki ya da izleyen üye kopunca `room.members`'tan silinir; oyundaki oyuncu dönebilsin diye kalır.
- Plan 7 (`index.html`): anonim oturum `POST hesap/anonim` + `sb.auth.setSession` (429/503 → misafir); `turnstileYukle/turnstileBelirtec(action)/turnstileSifirla` (betik yalnız form açıkken, widget `.hesap-turnstile` içine Managed `interaction-only`, her istek sonrası kaldırılır); `hesapKodGonder` → `POST eposta/kod`; `hesapHataMetni` önce sunucu kodlarına bakar (`limit`, `kota`, `turnstile`, `turnstile_yuk`, `turnstile_ayarsiz`, `ic`, `zaten_bagli`). Şifre döndürme yok. **Tuzak (bu oturumda 3 kez):** `server.js`'te python ile satır sonuna `// yorum` eklemek aynı satırdaki sonraki tanımları yorumlar (`kancaGorulen`, `kodSayac`); yorumu ayrı satıra koy.
- Plan 6 hesap (`index.html`): `hesap={uuid,eposta,anonim}` oturumdan (`hesapGuncelle`); `ui.hesap={tur:'bagla'|'gir',adim:'eposta'|'kod'|'birlestir',…}`; `hesapBlok(pn)` giriş sayfasında yalnız `ayar.eposta` ∧ oturum varken (misafirde yok); `hesapKodGonder` (`updateUser({email})` / `signInWithOtp({shouldCreateUser:false})`, 10 sn), `hesapDogrula` (`verifyOtp` `email_change`/`email`), `hesapBirlestir(ekle)` (`POST /hesap/birlestir {eski:kg_token, yeni:token}`; Hayır → çağrı yok; sonra reload), `hesapCikis` (signOut + `kg_token` sil + reload); `?bagla=1` formu açar; son ekranda `a.hesap-hatirlat` yalnız `hatirlatGoster(ayar,kayitli,hesap.eposta)`. Satır içi `//` yorumu eklerken dikkat: `kancaIsle` satırında tekilleştirme bir kez yorumlandı.
- Plan 5 giriş sayfası/son ekran (`index.html`): `gecmisYukle()` kimlikten sonra arka planda (3 sn zaman aşımı, hata sessiz) → `gecmis={ozet,oyunlar,kasabalar}` → `renderLanding` `gecmisPanel()` (`.gecmis`: `oyuncu_ozet` kartı, görebildiği son 30 bitmiş maçtan oynadığı 10'u `a.mac`, kasabaları `a.kasaba`); `renderEndUI` kayıt açıkken `a.hikaye` → `/oyun/<P.oyunId>`. e2e sahte Supabase'i Playwright `route` ile kurar (`/ayar.json`, `/auth/v1/*`, `/rest/v1/<görünüm>`; HS256 token sunucunun `jwtSecret`'ıyla imzalanır).
- Paket 1b: `HIZLI_BEKLE_MS/HIZLI_GUN/HIZLI_TUR`, `hizli()`, `R.g.hizli` (SECRET_KEYS); gazete `iddia` kartı (anahtar+takım karşılaştırması, çoklu iddia listesi); `ROLES[*].ipucu`; istemci ⚡ paneli (`hizliPanel`) ve 📘 çekmecesi (`rehberCekmece`, `ui.rehber`; oyun içi "Nasıl oynanır" bunun yerine geçti). Tasarım: `docs/superpowers/specs/2026-10-25-kasaba-gecesi-paket1b-iddia-rehber-design.md`.
- Paket 1a (oyun sonu): `checkWin` → `P.winner.kazananlar` (tek kaynak), `P.gazete` (`gazeteFor`: en çok `GAZETE_EN_COK=3` kart, yalnız günlükten, deterministik, aynı özne tekrarlanmaz); `server.js` oda düzeyi `room.hazir` (`P.hazir`), `room.skor`/`skorIslenen` (`P.skor`, `skorIsle` flush+start+cancel öncesi, gameId başına bir kez; iptal sayılmaz), ölçüm olayları `G.olay` (`son_ekran_goruldu`, `hazir`, `rovans_basladi`, `kopus`, `dondu`; her günlük kaydı `oyun:gameId` taşır). Tasarım: `docs/superpowers/specs/2026-10-25-kasaba-gecesi-paket1-oyun-sonu-design.md`.
- Olay günlüğü: `game.js` her çözümde `logEv(R,tur,veri)` ile olay yazar (`baslangic`, `gece_hamle`, `gece_sonuc`, `gunduz_sonuc`, `bitis`, `iptal`; alanlar tasarım §5.4). `R.log` sunucuya giden kuyruk (her yayında boşalır), `R.gameLog` bu oyunun tam günlüğü. İkisi de gizlidir (`SECRET_KEYS`). Oyun bitince `checkWin` günlükten `P.ozet` (herkese açık: kazanan, oyuncu rol/akıbet) üretir, `privFor` `payin` (öldürdün/kurtardın/yakaladın/tuttun) ekler; istemci `renderEndUI` bunları, gazeteyi, skoru ve rövanş bloğunu gösterir ("Rövanşı başlat" → `start{rovans:true}`, "Lobiye dön" → `cancel`).
- Rol dağılımı: `autoSetup(n)` + `DAGILIM` eşikleri (`game.js`); her özel rol en fazla bir kez; eşikler `npm run denge` (test/denge.js, test değil) ile ölçülür, tablo README'de. Eşik değiştirirken `game.test.js`'teki `bekle` tablosunu ve README'yi güncelle. Kural: her hain ayrı öldürür (kullanıcı kararı; "ekip tek kurban" reddedildi). Geri bildirim paketi (2026-10-25, tasarım `docs/superpowers/specs/2026-10-25-kasaba-gecesi-rol-dagilimi-geri-bildirim-design.md`): `DAGILIM.masum(n)` (4–6: 0, 7+: 1), `DAGILIM.tekHainSurumP` (0,5: tek hain sürümlü olasılığı; 2 hainde hep 1 sürümlü + 1 düz), tekrar eğilimi `TEKRAR={kacinmaP:0.8,gecmisUz:5,deneme:200,ceza}` + saf `tekrarCezasi(rol,gecmis)` / `rolDagit(bag,players,gecmis,opts?)` (torba değişmez, yalnız kim-hangi-rol seçilir); geçmiş `R.rolGecmisi` (pubId → [{key,team}…] en yeni önde, **gizli**, oda ömrünce; `SECRET_KEYS`'te). Supabase tohumu: `kayit.sonRoller(uye)` (bu kurulumdaki son 5 bitmiş maç, Hırsız → `hirsiz`) `server.js` onJoin'de arka planda, yalnız boş girdiyi doldurur; `/saglik rolGecmisi:{okunan,hata}`. `denge.js` botları hain yeteneği kullanmaz: `tekHainSurumP` tabloya etki etmez (`DAGILIM_TEKHAINSURUMP` env yine var).
- Faz akışı: `night → talk → vote → night…`, `checkWin` olursa `end`. Süreler `P.settings` (en az 15 sn); sabah/akşam animasyonu için `talk` +7 sn, `night` +6 sn eklenir. Herkes oy verince oylama beklemeden biter.
- `createServer(opts)` dönüşü `{server, wss, rooms, close, govdeOku, uyarilar}` (`govdeOku`/`uyarilar` yalnız testler için; `uyarilar` açılış uyarıları, ör. boş Turnstile hostname listesi). `hazir`/`gordum` yalnız oturan oyuncudan; `hazir` olayı üye başına maçta en çok 10. Skor tek yerde (`flush` → `skorIsle`), `start`/`cancel` önce `flush`. Oda belleği `R.rolGecmisi`'ne boş geçmiş de yazılır (tekrar sorgu yok).
- Bağlantı durumu: `state.P.online` bağlı üyelerin açık kimlikleri (sunucu ekler, `game.js` bilmez); istemci kopuk oyuncunun karakterine "📡 KOPUK" etiketi koyar. Gece süresi dolduğunda kopuk yaşayan oyuncu varsa `tick(R, offline)` bir kez en çok 30 sn bekler (`P.waiting`, `P.waited`); hamlesi olup olmadığına bakılmaz (bakılsa rolü ele verirdi). Testlerde geceyi hemen bitirmek için `P.waited=true` ver.
- Dokunma: gece karartma katmanı ve ambiyans `pointer-events:none`; ev halkası `ringPos` ile görünür alana sığdırılır (kısa ekranda basılır). Oylamada karakter de hedeftir; karakter bir evin önündeyse dokunma eve gider (`houseAt`).
- İstemcide `isHost = P.hostId === myId`. Sunucu adresi: `?s=` parametresi (**yalnız** localhost'ta ya da sayfanın kendi host'u için — `sunucuIzinli`; gizli anahtar yabancı adrese gitmesin), sonra `KG_SERVER` sabiti, yoksa sayfanın kendi origin'i + `/ws`.

## Dokunulmaz kurallar

1. **Gizli bilgi `P`'ye girmez.** Rol, gece hamlesi, oy hedefi, not, ölü sohbeti `R.g` ya da `privFor` içinde kalır. `P.morning`/`P.evening` gibi açıklanan sonuçlar hariç. Testler `state` içinde gizli anahtar arar; yeni gizli alan eklersen `test/game.test.js` içindeki `SECRET_KEYS` listesine de ekle.
2. **Sunucu yetkilidir.** Her istemci mesajı `game.js` içinde doğrulanır: faz, gün (`d`), oyuncu yaşıyor mu, hedef gerçek oyuncu mu, `guess` gerçekten `ROLES` anahtarı mı (`hasOwnProperty`). İstemciye güvenme.
3. **İstemci kural hesaplamaz.** `index.html` yalnız gösterir ve mesaj yollar; kural değişikliği `game.js`'e yapılır.
4. **Sahne, animasyon, ses kodu** (`// ---------- Köy sahnesi` ve `// ---------- Ambiyans` bölümleri) kullanıcı istemedikçe değişmez; görünüm aynı kalmalı.
5. **Sabitler tek yerde:** `ROLES`, `SETUP`, `COLORS`, `HATS`, `HIZLI_TUR/HIZLI_GUN/HIZLI_BEKLE_MS` yalnız `game.js`'te; rol etiketi `rolEtiketi(b)` (index.html, ortak.js, hikaye.js bunu çağırır). `index.html` dosyayı `<script src="sunucu/game.js">` ile yükler ve `window.KG_GAME`'den alır (şapka adları `HAT_NAMES` istemcide). `index.html`'e kopya ekleme; `kontrol.sh` kopyayı yakalar. `game.js` hem Node (`module.exports`) hem tarayıcı (`KG_GAME`) için sarmalanmıştır; dosyanın başındaki/sonundaki sarmalı bozma.
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
- Sunucu `PORT`, `HOST`, `ALAN`, `KG_SURUM`, `KG_KURULUM`, `SUPABASE_URL/ANON_KEY/SERVICE_KEY/JWT_SECRET[/JWT_JWKS]`, `RESEND_API_KEY`, `EPOSTA_KANCA_SIRRI`, `EPOSTA_GONDEREN`, `TURNSTILE_SITE/SECRET/HOSTNAMES`, `SUPABASE_IC_URL`, `KOD_GUNLUK/KOD_SAATLIK/KANCA_GUNLUK` ortam değişkenlerini okur (`/etc/games/AD.env`; `kur.sh` elle eklenen satırları korur); `/ayar.json` yalnız url/anonKey/kurulum/kayit döner; `/saglik` sürümü döner. Başka bir oyun da aynı kurala uyarsa (`sunucu/server.js`, `/saglik`) aynı `kur.sh` düzenine girer.

## Yayına alma

VPS'te (`kasaba-gecesi/sunucu` içinden): `git pull && sudo ./kur.sh kasaba kasaba.munupixi.com`. Test sürümü: `sudo ./kur.sh kasaba-test kasaba-test.munupixi.com --surum <branch>`. Liste: `sudo ./kur.sh --liste`. Günlük: `journalctl -u game@kasaba -f`. Sağlık ve sürüm: `curl https://kasaba.munupixi.com/saglik`.
