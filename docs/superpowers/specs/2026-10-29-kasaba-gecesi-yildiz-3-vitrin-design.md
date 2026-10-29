# Yıldız ekonomisi 3e — vitrin (tasarım, kısa)

Tarih: 2026-10-29. Dal: `yildiz-3-vitrin` (`main@43843f8`). Parça 3'ün son işi: seri ✅ → görev ✅ → davet ✅ → set ✅ → **vitrin**.

## Amaç
Oyuncu kazandıklarından en çok 3 parçayı kendisi seçip başkalarına gösterir; kimse sıralanmaz, sayı gösterilmez ("liderlik tablosu yok" ilkesiyle uyumlu).

## Kararlar (kullanıcı: lobide kart; yaklaşım A)
- **Nerede:** lobide başkasının karakterine dokununca küçük kart (`.vitrin-kart`): ad + vitrin parçaları ya da "Vitrini boş". Kendi karakterine dokunmak bugünkü gibi görünüm ayarlarını açar. Maç sırasında kart yok.
- **Yaklaşım A:** vitrin, giyilen kozmetiklerin yolundan gider — seçim bu cihazda (`kg_look.vitrin`), `look` mesajıyla sunucuya, sunucu envanterle sahipliği doğrular, lobi listesinde dağıtır. Hesaba bağlı saklama (B) elendi: kozmetikler de cihaza özel, tutarsız olurdu.

## Benim kararlarım
- **Parçalar** (kimlik → görünüm; `game.js` `vitrinParca(id)`):
  - `set:<key>` — **ödenmiş** set (setler tablosu): `🐉 Ejder seti`.
  - `basari:<key>` — en az bronz kademe: o anki madalya + ad: `🥇 Yalnız kurt`.
  - `rozet:<key>` — tek seferlik rozet (`ROZETLER`): `👻 Mezardan zafer`.
  - En çok 3 (`VITRIN_EN_COK=3`), tekrarsız, sırası oyuncunun seçtiği sıra.
- **Doğrulama:** `vitrinGecerli(liste, envanter)` → sahip olunanlar (en çok 3); sahip olunmayan ya da bilinmeyen kimlik sessizce düşer. Envanter yüklenmeden gelen istek saklanır, envanter gelince yeniden uygulanır (kozmetiklerle aynı `mem.istenen` kalıbı). Misafir (kayıtsız) oyuncunun vitrini boş.
- **Veri:** `envanter_oku` (son gövde 019) dönüşüne `setler: [key]` ve `rozetler: [key]` eklenir (göç **025**); `basarilar` zaten var. Sunucu bunları `mem.envanter`'e alır.
- **Lobi listesi** her oyuncu için `vitrin: [id]` taşır (yalnız doğrulanmış kimlikler; parçanın metni istemcide `vitrinParca`'dan).
- **Profil (`/ben`) "🏆 Vitrin" bölümü:** sahip olunan parçaların listesi, her birinde "Vitrine koy" / "Vitrinde ✓" düğmesi; 3 doluysa "Vitrin dolu (en çok 3)". Seçim `kg_look.vitrin`'e yazılır (bugünkü "Giy" gibi bu cihazda). Profil, setleri/başarıları/rozetleri zaten okuyor.
- **Gizlilik:** yalnız oyuncunun seçtiği parçalar; sayaç, ilerleme, kademe sayısı gösterilmez.

## Hedef olmayanlar
Herkese açık profil sayfası, maç sonu listesinde amblem, hesaba bağlı vitrin, vitrine kozmetik koymak (kozmetik zaten giyilir).

## Testler
game.test: `vitrinParca` metinleri; `vitrinGecerli` (sahiplik, en çok 3, tekrarsız, bilinmeyen düşer, kademe 0 başarı düşer, ödenmemiş set düşer). test.sql 37: `envanter_oku` `setler`/`rozetler`. server.test: `look.vitrin` doğrulanıp lobide görünür; sahip olmadığı düşer; envanter sonra gelince uygulanır; misafir boş. e2e: lobide başkasına dokununca kart ve parçalar; kendi karakteri ayar açar; profilde vitrine koy → `kg_look.vitrin`, 4.'de dolu.
