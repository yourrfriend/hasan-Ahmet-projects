# Yıldız ekonomisi 3b — haftalık görev (tasarım, kısa)

Tarih: 2026-10-28. Dal: `yildiz-3-gorev` (`main@ee78fc4`). Parça 3 sırası: seri ✅ → **haftalık görev** → davet → set → vitrin.

## Amaç
Haftaya bir hedef koymak ve oyuncuların birlikte konuşacağı ortak bir konu yaratmak: "Bu haftanın görevleri". Hedef sık gelmeyi ve iyi oynamayı ödüllendirmek.

## Kararlar
**Kullanıcı kararları**
- Görevler herkese aynı.
- Görevler kurala göre seçilir (yaklaşım A).
- Ödül görev başına **+15 ⭐**; üçü birden tamamlanınca bir kez daha **+20 ⭐**.
- Görevler herkese açık; e-posta bağlamak gerekmez.

**Benim kararlarım** (aşağıda ayrıca işaretli)
- Görev havuzu.
- Tavan kuralı.
- Hafta sınırı.
- Kart ve profil metinleri.

**Hafta.** Pazartesi 00:00'da başlar, pazar 23:59'da biter (Europe/Istanbul). Haftanın kimliği, o haftanın pazartesi tarihidir.

**Haftanın 3 görevi** havuzdan seçilir. Seçim, pazartesi tarihinden türetilen sayıyla deterministik yapılır (`haftaGorevleri(pazartesi)`). Aynı hafta her sunucuda ve profilde aynı üç görev çıkar. Tablo yalnız ilerlemeyi saklar; hangi görevlerin seçildiği saklanmaz.

**Havuz** — benim kararım. Görevler rolden bağımsızdır, çünkü rolü şans belirler. Görevler oya da dayanmaz: CLAUDE.md'ye göre oy bilgisi kalıcı sayaca dönüşemez.

| key | metin | hedef | sayılan |
|---|---|---|---|
| `mac` | 5 maç oyna | 5 | kasa veren maç |
| `kazan` | 2 kez kazan | 2 | kazananlar arasında olmak |
| `kalabalik` | 8+ kişilik 2 maç oyna | 2 | `P.players.length >= 8` |
| `sag_kal` | 2 maçı hayatta bitir | 2 | maç sonunda sağ olmak (taraf fark etmez) |
| `gun` | 3 farklı gün oyna | 3 | bugünün ilk gerçek kasası (bu sayıyı SQL verir) |

Eşya görevleri havuza alınmadı, çünkü eşya modunu oyuncu değil ev sahibi açar. Hedefler ve ödüller `game.js` içindeki `HAFTALIK` sabitinde tek kaynaktır. SQL bunları bilmez; sunucu her çağrıda değerleri parametre olarak gönderir.

**Tavan** — benim kararım. 24 saatte 20 kasa sınırına takılan maç göreve **sayılmaz**. Gerekçe: görev bir yıldız kaynağıdır, sınır da çok sekmeyle yıldız toplamayı kesmek için var. Başarılarda durum farklıydı: orada sınırdaki maç sayılıyordu, çünkü başarılar tek seferliktir. Aynı maçın iki kez işlenmesi (tekrar) de hiçbir şey saymaz.

**Veri.** Yeni tablo:
```
public.haftalik_gorevler(
  uye  uuid references auth.users on delete cascade,
  hafta date,
  key  text,
  sayac int not null default 0,
  tamam boolean not null default false,
  primary key (uye, hafta, key)
)
```
- RLS: her üye yalnız kendi satırlarını okur; yazma yalnız RPC'den yapılır.
- Üç görevin tamamlanma bonusu `key='hepsi'` satırında tutulur.
- `mac_sonu`'ya yeni bir parametre eklenir: `p_gorev jsonb default null`. Değeri `{key:{artis,hedef,odul}}` biçiminde haftanın 3 görevi, ayrıca `p_gorev_bonus int default 0`.
- Kontrol cüzdan kilidi altında, kasa yeni eklendiyse ve tavan yoksa yapılır:
  - Her görevin sayacı `artis` kadar artar. `gun` görevinde `artis` dikkate alınmaz; bugünün ilk gerçek kasasıysa +1 sayılır.
  - Hedefe ilk ulaşıldığında `tamam` olur ve ödül yıldızı verilir.
  - Üç görev de tamamsa ve `hepsi` satırı yoksa bonus verilir.
- Dönüşe `'gorevler': [{key, odul}]` eklenir; içinde yalnız bu maçta tamamlananlar bulunur ve bonus `key:'hepsi'` olarak gelir.
- `envanter_oku` → `'hafta': {hafta, gorevler:{key:{sayac,tamam}}}`.
- `hesap_birlestir`: aynı hafta ve aynı görevde sayaçlar toplanır, `tamam` değerlerinden biri doğruysa sonuç doğrudur. Birleştirme sırasında ödül verilmez; tamamlanma bir sonraki maçta yakalanır.
- Göç 015 → **016**. Eski kod uyumludur: parametre `null` gelirse görev sayılmaz.

**Hafta kimliği.** SQL haftayı kendisi hesaplar: Europe/Istanbul pazartesisi. Sunucu, kendi saatine göre o haftanın görevlerini gönderir. Pazartesi 00:00 sınırındaki birkaç saniyede sunucu ile veritabanı farklı haftayı görebilir. Bu kabul edildi; sonucu en fazla bir maçın yanlış haftaya sayılmasıdır.

**Kasa kartı.** Yalnız tamamlanan görevler için satır çıkar:
- `✅ 2 kez kazan · +15 ⭐`
- `🏆 Haftanın görevleri tamam · +20 ⭐`

İlerleme kartta gösterilmez; kart kısa kalsın diye.

**Profil (`/ben`).** "📅 Bu haftanın görevleri · N gün kaldı" bölümü. Her görev bir satırdır: metin, ilerleme çubuğu, `3/5` ya da `✓`. Üç görev bittiyse bölümde "🏆 Hepsi tamam" yazar.

**Lobi.** Görevler maç başlamadan görünmez; görmek için profile bakılır. Lobide göstermek ileriki bir iş.

**Ölçüm.** `denge.js` haftalık senaryosuna görev geliri eklenir. Haftada 10 maç oynayan biri tipik olarak 2–3 görevi bitirir; ekleyeceği yaklaşık 45–65 ⭐ olur.

## Hedef olmayanlar
- Kişiye özel görevler.
- Görev değiştirme ya da yenileme.
- Rol, oy veya eşya görevleri.
- Lobide görev listesi.
- Geçmiş haftaların arşivi.

## Yaklaşımlar
- **A (seçilen):** görevler kurala göre deterministik seçilir; ilerleme ve ödül `mac_sonu` içinde, kilit altında hesaplanır. Bakım istemez ve başarılar ile serideki kalıbın aynısıdır.
- **B:** her hafta görevleri kullanıcı seçer ve bir tabloya yazılır. Elendi, çünkü her hafta elle iş gerektirir ve yönetim arayüzü ister.

## Nasıl
- `game.js`:
  - `HAFTALIK = {havuz:{…}, odul:15, bonus:20, adet:3}`
  - `haftaPazartesi(ms)`: Europe/Istanbul tarihi, `YYYY-MM-DD` biçiminde.
  - `haftaGorevleri(pazartesi)`: 3 görev, deterministik.
  - `gorevArtislari(R, id)`: `{mac, kazan, kalabalik, sag_kal}`; `gun` burada yer almaz.
  - `gorevParam(R, id, ms)`.
- `kayit.js` ve `server.js`: parametreler gönderilir; `kasa` mesajına `gorevler`, `envanter` mesajına `hafta` eklenir.
- `index.html`: kart satırları ve `KG_VER` güncellemesi.
- `ben.html`: haftanın görevleri bölümü.
- Göç `016_haftalik.sql`.
- Testler:
  - `test.sql` 30–31: sayım, tamamlanma, bonus, tavan, tekrar, `gun`, birleştirme, RLS.
  - `game.test`: aynı hafta aynı görevler; haftalar arasında farklı seçim; hedef ve ödül biçimi; SQL'de sayı olmaması.
  - `server.test`.
  - e2e: kart satırları ve profil bölümü.

## Builder'a bırakılan
- Seçim için hash yöntemi.
- Görev metinlerinin son hâli.
- Profil CSS'i.
