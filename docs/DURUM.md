# İş durumu

Son güncelleme: 2026-10-24 (gece). Bu dosya oturumlar arası bağlam içindir; her plan bitişinde güncelle.

## Canlı
- `kasaba.munupixi.com` ← `sahne@970bac4` (ionos, tünel kipi; 2026-10-24 gece). `kasaba-test.munupixi.com` ← `sahne@970bac4`.
- Supabase: `kasaba-api.munupixi.com` (ionos `/root/supabase-kasaba`, v0.8.3), şema 005'e kadar, RLS testleri 8/8, yedek 04:10.

## Projeler

### gecmis — oyuncular, kasaba, geçmiş, gece gece hikâye (Supabase)
Tasarım: `docs/superpowers/specs/2026-10-24-kasaba-gecesi-gecmis-design.md`.
- ✅ Plan 1 `…gecmis-1-oyun-sonu-ozeti.md`: `R.log`/`R.gameLog`, `P.ozet`, `priv.payin`, `kayit.js` yuvası, oyun sonu ekranı + "Tekrar oyna".
- ✅ Plan 2 `…gecmis-2-supabase-kurulumu.md`: kurulum, Caddy kapısı, şema/RLS/görünümler/`hesap_birlestir`, yedek+tatbikat, belgeler.
- ✅ Plan 2b (Paket 1a) `…2026-10-25-paket1a-gazete-rovans-skor.md`: `kazananlar`, Kasaba Gazetesi (`P.gazete`), rövanş (`hazir`, `start rovans`), Bu Akşamın Skoru (`P.skor`), ölçüm olayları (`oyun:gameId` damgası). Taze inceleme bekliyor; kasaba-test denemesi sonra. Kaynak: kullanıcının dış asistanla hazırladığı Paket 1 belgesi; 1b (iddia balonları + rol rehberi) ayrı plan olacak.
- ⏳ Plan 3 kimlik (anonim oturum, token ile join, `/ayar.json`), Plan 4 kayıt yazma (`kayit.js` → Supabase, `kur.sh` env koruma), Plan 5 sayfalar (`/oyun`, geçmiş, `/kasaba`), Plan 6 Google + ikinci cihaz birleştirme.
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
- `munupixi.com` kök adresi 522 (188.119.45.227, bilinmeyen sunucu); oyunla ilgisi yok.
- Simülasyonda 2+ hainli oyunlarda masum kazanma yüzdesi anlamsız (basit oyuncu); ölçü ilk gece ölüm ve süre.
