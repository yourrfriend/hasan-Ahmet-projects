# Kasaba Gecesi — ertelenen küçükler (tasarım, kısa)

Tarih: 2026-10-26. Kaynak: `docs/DURUM.md`'deki "ertelenen küçükler" (72 madde), 2026-10-26'da güncel `main@1a779fa`
koduna karşı tek tek doğrulandı: 6 çoktan çözülmüş, 3 kullanıcı kararı, 3 görsel doğrulama ister, 56 geçerli.

## Niyet
Birikmiş küçük doğruluk/sağlamlık/temizlik işlerini, canlıdaki davranışı iki ayrı dalda ve ölçülü biçimde düzelterek
kapatmak; DURUM'daki listeyi sıfırlamak. Kullanıcı kararı isteyen üç madde ve iki kural işi bu kapsamın dışında.

## Kapsam ve paketleme (kullanıcı kararı 2026-10-26: "iki planla ikisini de yaz")
- **Plan 1 — oyun ve sunucu** (`docs/superpowers/plans/2026-10-26-kucukler-1-oyun-sunucu.md`): hikâye satırları, karşılaştırma
  sayımı, oyun olayları, kayıt yazıcısı, sunucu yolları, e-posta metni, istemci metin/⚡/hata tablosu, görsel üç madde.
  Canlı oyun davranışına dokunur → kasaba-test denemesi, sonra canlı.
- **Plan 2 — altyapı ve test** (`docs/superpowers/plans/2026-10-26-kucukler-2-altyapi-test.md`): kurulum/yedek/Caddy betikleri,
  göç 007 (kısıtlar, ad uzunlukları, `kazanma()`), test.sql senaryoları, eksik birim/e2e testleri, `kontrol.sh`, spec kalıntıları.
  Sunucu betiklerine dokunur → sahte ortamda ve yerel Postgres'te doğrulanır; sunucuda `uygula.sh` + `--test`.

## Hedef olmayanlar / dışarıda kalanlar
- Olayların toplu yazılması (madde 6): çalışan kuyruğu yeniden tasarlar, kazancı küçük; ertelenir.
- Kural kararları: n=9'da Tuzakçı/Provokatör hiç çıkmıyor (59); gece ortasında yenilemede karakterin hedefte gösterilmesi
  (62, `priv.hamle`). Ayrı brainstorm.
- Kullanıcı kararları: `email_change` çift onay (23; adres değiştirme kapalı, dokunulmaz), `DAGILIM_TEKHAINSURUMP`
  düğmesi (67; kaldır/bot yeteneği), `auth.users` anonim temizliği (68; betik istenirse Plan 2'ye eklenir).
- Davranış değişikliği yok: kurallar, dağılım eşikleri, arayüz düzeni aynı; yalnız doğruluk, metin ve sağlamlık.

## Yaklaşım
Tek yaklaşım: her madde kendi küçük testiyle (TDD), dosya/alan bazında görevlere gruplanmış; görsel üç madde ekran
görüntüsüyle bakılır ve yalnız sorun görülürse düzeltilir. Alternatif (tek büyük dal, testsiz "temizlik") reddedildi:
canlı oyuna dokunan ~30 değişikliği tek seferde doğrulamak mümkün değil.

## Kararlar (benim)
- Rol etiketi tek kaynak: `game.js` `rolEtiketi(rol_key, takim, deli_gibi?)` saf fonksiyon; `index.html`, `sayfa/ortak.js`,
  `sayfa/hikaye.js` bunu kullanır (hikâye Node testinde `require('../game.js')`).
- `hazir` olay tavanı: üye başına maç içinde 10 olay; sonrası durum değişir ama olay yazılmaz.
- `profil`: aynı `{ad,renk,sapka}` için yeniden yazılmaz (bellek içi son değer; süreç ömrü).
- `skorIsle` tek yer: `flush` içinde `P.phase==='end'` iken; `start`/`cancel` önce `flush(room)` çağırır.
- `govdeOku`: `req.setEncoding('utf8')`; sınır karakter sayısı (mevcut davranış korunur).
- Göç 007: `oyunlar` için `check ((sonuc='devam') = (bitis is null))`; ad sınırları `kasabalar.ad ≤ 40`,
  `profiller.ad ≤ 16`, `oyun_oyunculari.ad ≤ 16`; `kazanma()` 5 parametreye iner (çağrı noktalarıyla birlikte);
  `kasaba_tablo` `coalesce(max(nullif(pr.ad,'')), max(p.ad))`. Uygulamadan önce mevcut veri `select` ile doğrulanır.
- Betikler: `caddy.sh` `.yeni` + `validate` + `mv`; `yedek.sh` `trap … EXIT`; `kur-supabase.sh` `ayar()` sed kaçışı,
  eksik pakette bir kez `apt-get update -qq`, sonunda `0.0.0.0:(8000|5432|6543)` görülürse `hata`, kurulum günlüğü
  `KEY|SECRET|PASSWORD` maskeli; `uygula.sh` sonunda `notify pgrst, 'reload schema'`.
- `kontrol.sh` test sayısı: `npm test -- --test-reporter=tap` ile `# pass` satırı.

## Builder'a bırakılanlar
Test adları ve yerleşimi; `hizli` 0/4 sayacının istemcide nerede tutulduğu; e2e süresi dolmuş token kurgusunun ayrıntısı;
göç 007'nin veri doğrulama sorgusu.
