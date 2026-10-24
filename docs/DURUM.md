# İş durumu

Son güncelleme: 2026-10-24 (akşam). Bu dosya oturumlar arası bağlam içindir; her plan bitişinde güncelle.

## Canlı
- `kasaba.munupixi.com` ← `sunucu@91a4aa4` (ionos, tünel kipi). `kasaba-test.munupixi.com` ← o an denenen dal.
- Supabase: `kasaba-api.munupixi.com` (ionos `/root/supabase-kasaba`, v0.8.3), şema 005'e kadar, RLS testleri 8/8, yedek 04:10.

## Projeler

### gecmis — oyuncular, kasaba, geçmiş, gece gece hikâye (Supabase)
Tasarım: `docs/superpowers/specs/2026-10-24-kasaba-gecesi-gecmis-design.md`.
- ✅ Plan 1 `…gecmis-1-oyun-sonu-ozeti.md`: `R.log`/`R.gameLog`, `P.ozet`, `priv.payin`, `kayit.js` yuvası, oyun sonu ekranı + "Tekrar oyna".
- ✅ Plan 2 `…gecmis-2-supabase-kurulumu.md`: kurulum, Caddy kapısı, şema/RLS/görünümler/`hesap_birlestir`, yedek+tatbikat, belgeler.
- ⏳ Plan 3 kimlik (anonim oturum, token ile join, `/ayar.json`), Plan 4 kayıt yazma (`kayit.js` → Supabase, `kur.sh` env koruma), Plan 5 sayfalar (`/oyun`, geçmiş, `/kasaba`), Plan 6 Google + ikinci cihaz birleştirme.
- Ertelenen inceleme küçükleri: büyücü tahminsiz `guess` olayı; `sira` oyun başına sıfırlanmıyor + olaya `gameId` damgası; `flush` içindeki `bosalt` try/catch; ev sahibi olmayan oyun sonu metni; olay alanları için eksik testler; test.sql kapsamı (yabancı vs görünümler, `oyuncu_ozet`, `kazanma()`, `kasabalar` ad-only); `oyunlar` `sonuc`/`bitis` tutarlılık `check`; `update.sh` sonrası port denetimi; spec'te `/opt`/`sk-*`/3001 kalıntıları; kurulum günlüğünde anahtar maskeleme; `ayar()` sed kaçışı; `apt-get update`; `kazanma()` kullanılmayan parametre + `nullif(pr.ad,'')`; ad uzunluk sınırları; `caddy.sh` `.yeni`→`mv`; `yedek.sh` `.tmp` artıkları; PostgREST şema yenileme; `oda_kodu` süren oyunda görünür.

### sahne — rol dağılımı, gece yürüyüşü ve rol animasyonları, evler
Tasarım: `docs/superpowers/specs/2026-10-24-kasaba-gecesi-sahne-design.md`.
- ✅ Plan 1 `…sahne-1-rol-dagilimi.md`: `autoSetup` eşikleri (`DAGILIM`), 500×9 kısıt testi, `npm run denge`, README tablosu; **Bombacı Polis tarafından tutulamaz** (Polis–Bombacı kilidi kapandı).
- 🔄 Plan 2 `…sahne-2-gece-yuruyus-animasyon.md`: Görev 0–3 bitti (`3f02a47`: deneme geri alındı, `priv.planted` liste, mesafeye göre yürüyüş + karakter üstü etiketler, 17 rol hareketi + izler, iki ses); Görev 4 kullanıcı denemesi kasaba-test'te sürüyor (Gözcü onaylandı). Sonra: geri bildirim düzeltmeleri → taze inceleme → `/yayinla`.
- ⏳ Plan 3 evler (referans görsel kullanıcıdan; bej duvar, koyu çatı, baca + tabela).
- Ertelenen küçükler: spec §5.1'de eski eşik/formül cümleleri; n=9'da Tuzakçı/Provokatör hiç çıkmıyor; test temizliği (`OZEL`, somut Masum iddiaları); `DAGILIM` dondurulmamış.

## Kullanıcıdan bekleyenler
- Cloudflare tünel token'ını yenilemesi (sohbete yapıştırılmıştı) → sonra sunucuda `cloudflared service install YENI`.
- `alt-php-internal` (Imunify) güncelleme onayı (ionos).
- Plan 6 için Google OAuth istemci kimliği.
- `sahne` dalını canlıya alma zamanı.

## Bilinen açık konular
- `munupixi.com` kök adresi 522 (188.119.45.227, bilinmeyen sunucu); oyunla ilgisi yok.
- Simülasyonda 2+ hainli oyunlarda masum kazanma yüzdesi anlamsız (basit oyuncu); ölçü ilk gece ölüm ve süre.
