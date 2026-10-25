# İş durumu

Son güncelleme: 2026-10-25. Bu dosya oturumlar arası bağlam içindir; her plan bitişinde güncelle.

## Canlı
- `kasaba.munupixi.com` ← `gecmis@065cbb0` (ionos, tünel kipi; 2026-10-25). `kasaba-test.munupixi.com` ← `gecmis@f831556`.
- Supabase: `kasaba-api.munupixi.com` (ionos `/root/supabase-kasaba`, v0.8.3), şema 005'e kadar, RLS testleri 8/8, yedek 04:10.

## Projeler

### gecmis — oyuncular, kasaba, geçmiş, gece gece hikâye (Supabase)
Tasarım: `docs/superpowers/specs/2026-10-24-kasaba-gecesi-gecmis-design.md`.
- ✅ Plan 1 `…gecmis-1-oyun-sonu-ozeti.md`: `R.log`/`R.gameLog`, `P.ozet`, `priv.payin`, `kayit.js` yuvası, oyun sonu ekranı + "Tekrar oyna".
- ✅ Plan 2 `…gecmis-2-supabase-kurulumu.md`: kurulum, Caddy kapısı, şema/RLS/görünümler/`hesap_birlestir`, yedek+tatbikat, belgeler.
- ✅ Plan 2b (Paket 1a) `…2026-10-25-paket1a-gazete-rovans-skor.md`: `kazananlar`, Kasaba Gazetesi (`P.gazete`), rövanş (`hazir`, `start rovans`), Bu Akşamın Skoru (`P.skor`), ölçüm olayları (`oyun:gameId` damgası); taze inceleme yapıldı, önemliler düzeltildi (Türkçe ekler `ek()`, lobide skor, sayaç tutarlılığı). kasaba-test'te botlarla iki maç + rövanş + lobi skoru denendi (2026-10-25, `deneme.js`), geçti. Sonra: davet çubuğu kod gelmeden çizilmiyor; lobide skor sol altta; **oda kodu 12 karakter ve yalnız sunucu üretir**; IP başına sınırlar (5 oda, 24 soket, 5 kurma/dk) — tünel arkasında gerçek IP doğrulandı (`f831556`, kasaba-test'te). Canlıda (2026-10-25). Kaynak: kullanıcının dış asistanla hazırladığı Paket 1 belgesi; 1b (iddia balonları + rol rehberi) ayrı plan olacak.
- ✅ Plan 3 kimlik `…2026-10-25-gecmis-3-kimlik.md`: anonim Supabase oturumu, `join{token}` (ES256 JWKS — spec HS256 demişti, self-hosted v0.8 EC anahtar kullanıyor), `profiller` upsert, `/ayar.json`, gömülü supabase-js, `kur.sh` env koruma. kasaba-test'te kayıt açık (`/etc/games/kasaba-test.env` SUPABASE_*), tarayıcıda doğrulandı; canlı `kasaba` kayıt kapalı (misafir). İnceleme geçti; önemliler düzeltildi (JWKS yeniden deneme/yenileme, env 600, dürüst misafir notu, yeniden bağlanma kimliği bekler). Ertelenen küçükler: `/sayfa/*.js` önbelleği sürüm damgasız; `kayit.js` ölü `v`; `profil` her join'de yazar (aynıysa atla); kimlik testi başlık yorumu. Üretim notu: canlıya `SUPABASE_*` açılırken `SUPABASE_JWT_JWKS` (base64) satırı da eklensin (açılışta ağ beklenmez).
- ✅ Plan 4 kayıt yazma `…2026-10-25-gecmis-4-kayit-yazma.md`: `P.oyunId`, `bitis.veri.oyuncular`, `kayit.js` kuyruğu → PostgREST (kasaba/üyelik/oyunlar/oyun_oyunculari/olaylar; yeniden deneme; açılış temizliği), `/saglik` sayaçları. Taze inceleme ve kasaba-test denemesi bekliyor., Plan 5 sayfalar (`/oyun`, geçmiş, `/kasaba`), Plan 6 Google + ikinci cihaz birleştirme.
- Paket 1a ertelenen küçükler: `gordum`/`hazir` izleyiciden de kabul (oyuncuya kısıtla, Plan 4'te karar); bıçaklanan+yıldırımlı kurban için yıldırım kartı çıkmaz (ilk neden); `skorIsle` adı maç başı adıyla yazar; `sunucu/.gitignore` `node_modules/` sembolik bağı yakalamaz; rövanş düğmeleri bazı boyutlarda kaydırma altında. `/code-review` sonrası ertelenen: `skorIsle` üç çağrı noktasında (flush/start/cancel) — tek `oyunBitti` kancası daha temiz olur; `skorListesi` her state'te yeniden sıralanıyor (önbelleklenebilir).
- Ertelenen inceleme küçükleri: büyücü tahminsiz `guess` olayı; `sira` oyun başına sıfırlanmıyor (`oyun` damgası eklendi); `flush` içindeki `bosalt` try/catch; ev sahibi olmayan oyun sonu metni; olay alanları için eksik testler; test.sql kapsamı (yabancı vs görünümler, `oyuncu_ozet`, `kazanma()`, `kasabalar` ad-only); `oyunlar` `sonuc`/`bitis` tutarlılık `check`; `update.sh` sonrası port denetimi; spec'te `/opt`/`sk-*`/3001 kalıntıları; kurulum günlüğünde anahtar maskeleme; `ayar()` sed kaçışı; `apt-get update`; `kazanma()` kullanılmayan parametre + `nullif(pr.ad,'')`; ad uzunluk sınırları; `caddy.sh` `.yeni`→`mv`; `yedek.sh` `.tmp` artıkları; PostgREST şema yenileme; `oda_kodu` süren oyunda görünür.

### sahne — rol dağılımı, gece yürüyüşü ve rol animasyonları, evler
Tasarım: `docs/superpowers/specs/2026-10-24-kasaba-gecesi-sahne-design.md`.
- ✅ Plan 1 `…sahne-1-rol-dagilimi.md`: `autoSetup` eşikleri (`DAGILIM`), 500×9 kısıt testi, `npm run denge`, README tablosu; **Bombacı Polis tarafından tutulamaz** (Polis–Bombacı kilidi kapandı).
- ✅ Plan 2 `…sahne-2-gece-yuruyus-animasyon.md`: mesafeye göre yürüyüş, karakter üstü etiketler, 17 rol hareketi + kalıcı izler, iki ses; telefon klavye/odak düzeltmesi. Taze inceleme (0 kritik, 5 önemli) düzeltildi: hedef değiştirme (yürüyüş damgası `walkN`, gerçek konumdan başlama), gece bitince hareket temizliği, Hayatta Kalan/Hırsız hareketleri, akşam dizisinde erken seçim, e2e senaryoları. Canlıda.
- ⏳ Plan 3 evler (referans görsel kullanıcıdan; bej duvar, koyu çatı, baca + tabela).
- Ertelenen küçükler: spec §5.1'de eski eşik/formül cümleleri; n=9'da Tuzakçı/Provokatör hiç çıkmıyor; test temizliği (`OZEL`, somut Masum iddiaları); `DAGILIM` dondurulmamış; **gece ortasında yenilemede karakter evde görünür** (sunucu hamleyi geri yollamaz; `priv`'e kendi hamlesi eklenirse hedefte gösterilebilir — kullanıcı kararı).

## Kullanıcıdan bekleyenler
- Cloudflare tünel token'ını yenilemesi (sohbete yapıştırılmıştı) → sonra sunucuda `cloudflared service install YENI`.
- `alt-php-internal` (Imunify) güncelleme onayı (ionos).
- Plan 6 için Google OAuth istemci kimliği.

## Diğer
- Güvenlik taraması (2026-10-24, `main...sahne`): tek bulgu — `?s=` ile gizli anahtar yabancı sunucuya gidiyordu; `sahne@2c291c0`'da düzeltildi (`sunucuIzinli`). Canlı `sahne`'ye geçince kapandı. Diğer alanlar (P/priv sızıntısı, doğrulama, XSS, dosya sunumu, kur.sh) temiz.
- Oyunu başka asistanlara anlatan teknik olmayan tanıtım: `docs/kasaba-gecesi-tanitim.md`.

## Bilinen açık konular
- Cloudflare hız sınırı kuralı var (2026-10-25): `kasaba*.munupixi.com/ws` IP başına saniyede 3 (10 sn'de 30) WebSocket el sıkışması, aşınca 10 sn engel (oyun mesajları sayılmaz); API ile yönetilir (altyapı notu hafızada).
- `munupixi.com` kök adresi 522 (188.119.45.227, bilinmeyen sunucu); oyunla ilgisi yok.
- Simülasyonda 2+ hainli oyunlarda masum kazanma yüzdesi anlamsız (basit oyuncu); ölçü ilk gece ölüm ve süre.
