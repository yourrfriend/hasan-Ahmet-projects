# Yıldız ekonomisi 3d — setler (tasarım, kısa)

Tarih: 2026-10-29. Dal: `yildiz-3-set` (`main@0be9a47`). Parça 3 sırası: seri ✅ → görev ✅ → davet ✅ → **set** → vitrin.

## Amaç
Koleksiyona hedef ve hikâye katmak: mevcut kozmetiklerden temalı setler; tamamlayana küçük ödül ve set amblemi (vitrinin içeriği).

## Kararlar (kullanıcı onaylı: "Olsun devam et")
- 8 set, `game.js` `SETLER` tek kaynak (sıra tablo sırası):
  | key | ad | amblem | öğeler |
  |---|---|---|---|
  | `korsan` | Korsan | 🏴‍☠️ | sapka:korsan, ev:ters-kayik, ev:fici-han, bayrak:kirmizi |
  | `anadolu` | Anadolu | 🏛️ | ev:kapadokya, ev:safranbolu, ev:mardin, ev:karadeniz, ev:yoruk-cadiri |
  | `tatli` | Tatlı köşe | 🍰 | ev:kurabiye, ev:caydanlik, ev:porselen-demlik, ev:balkabagi, sapka:sef |
  | `masal` | Masal ormanı | 🍄 | ev:mantar, ev:mantar-kosk, ev:agac-ev, sapka:cicek, efekt:yaprak |
  | `buyu` | Büyü | 🧙 | sapka:cadi, ev:cadi, ev:buyucu-evi, bayrak:ay, efekt:yildiz |
  | `kuzey` | Kuzey | ❄️ | ev:igloo, ev:karli-kulube, ev:kutup-istasyonu, ev:kar-kuresi, bayrak:mavi |
  | `ejder` | Ejder | 🐉 | ev:ejder-yumurtasi, ev:ejderli-ev, bayrak:ejder, efekt:duman |
  | `gelecek` | Gelecek | 🚀 | ev:roket, ev:ucan-daire, bayrak:simsek, sapka:kask |
- Ödül: set başına bir kez **+40 ⭐** (`YILDIZ_KAYNAK.set={n:'Set tamamlandı',adet:40}`) ve amblem (ödül satırı; ayrı kozmetik değil).
- Sahip olmak yeter (giymek gerekmez); öğe birden çok sette olabilir; `ozel` öğeler sete girmez (game.test denetler). Bugün tamamlanmış bir set, oyuncunun bir sonraki kozmetik kazanımında (kasa ya da dükkân) ödülünü alır.

## Benim kararlarım
- **Yaklaşım:** ayrı, idempotent RPC `set_odul(p_uye, p_setler jsonb)` → `[{key, odul}]`. Sunucu, kozmetik kazandıran iki yoldan sonra çağırır: maç sonu kasası kozmetik verdiyse (`mac_sonu` sonrası) ve `/ben/al` başarılıysa. SQL set içeriğini bilmez: `p_setler={key:{ogeler:[...], odul:40}}` sunucudan gider; karar cüzdan kilidi altında, `setler(uye,key)` birincil anahtarına `on conflict do nothing` ile bir kez. `mac_sonu` ve `kozmetik_al` değişmez (eski kod uyumlu, imza yok). (Diğer yol — `mac_sonu`/`kozmetik_al`'a parametre — iki fonksiyonu yeniden yazar ve eşya/dönüşüm yollarını büyütür; elendi.)
- Kasa kartında `🏴‍☠️ Korsan seti tamam · +40 ⭐`; `/ben/al` yanıtı `setler` taşır, profil bildirim gösterir ("🏴‍☠️ Korsan seti tamam! +40 ⭐").
- Profil (`/ben`) "🧩 Setler" bölümü: her set satırı amblem + ad + `3/5` + eksik öğelerin adları (dükkânda alınabilir olanlar), tamamlanınca `✓`. Veri: sahip olunan kozmetikler (zaten okunuyor) + `setler` tablosu (RLS kendi-oku).
- `envanter_oku` değişmez; vitrin bir sonraki iş.
- Göç **024**: tablo + RLS + `set_odul`; `hesap_birlestir` (son gövde 019) `setler` satırlarını taşır (`on conflict do nothing`; ödül geri alınmaz).

## Hedef olmayanlar
Yeni çizim, yeni kozmetik, satılmayan set ödülü kozmetiği, sette giyinme bonusu, başkasının setlerini görme (vitrin).

## Testler
test.sql 36: eksik set ödül vermez; tamamlanan set bir kez +40; ikinci çağrı boş; iki set aynı anda; bilinmeyen öğe/biçim bozuk parametre güvenli; birleştirme; RLS (istemci okur kendi, yazamaz, `set_odul` çağıramaz). game.test: `SETLER` biçimi, öğeler katalogda ve `ozel` değil, `setParam`. server.test: kozmetik kasasından sonra ve `/ben/al` sonrası `set_odul` çağrısı ve `kasa.setler` / yanıt `setler`. e2e: kasa kartı satırı, profil Setler bölümü.
