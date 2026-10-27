# Kasaba Gecesi — ev görselleri üretim talimatı

Bu belge, Kasaba Gecesi oyunu için **oyuncunun sahip olabileceği ev görünümlerini** üretecek görsel ajanına verilir.
Oku, sonra "Teslim" bölümündeki dosyaları üret. Bir şartı yerine getiremiyorsan üretmeye devam et, sorunu `NOTLAR.md`'ye yaz.

## 1. Oyun ve evin rolü (bağlam)

Kasaba Gecesi, telefonda yatay oynanan, 4–12 kişilik bir sosyal çıkarım oyunu (Feign / Kurt Adam tarzı). Ekranda bir köy
meydanı var. Her oyuncunun bir evi, meydanın çevresinde bir halkada duruyor. Gece oyuncular evlere gider, gündüz tartışır,
oylamayla birini gönderir.

Ev, oyuncunun kimliğidir: herkes senin evini görür. Oyuncular yeni ev görünümlerini maç sonu kasasından kazanır ya da
yıldızla satın alır. Bu yüzden her ev **bir bakışta tanınmalı ve başkalarınınkinden ayırt edilmeli**.

Teknik gerçekler (tasarımı bunlar belirler):
- Telefon ekranında bir ev yaklaşık **100–110 CSS piksel genişliğinde** görünür (2× ekranda ~220 piksel). 12 ev aynı anda
  ekranda. Küçük ayrıntılar kaybolur; siluet ve renk her şeydir.
- Sahne **gündüz** açık yeşil çimen, **gece** koyu mavi bir karartma katmanıyla gösterilir. Ev gece de okunmalı.
- Evin üstünde oyun, oyuncunun adını kendisi yazar. Görselde **hiçbir yazı, harf, rakam ya da logo olmamalı**.
- Ölen oyuncunun evi gri-kararmış gösterilir (bunu biz yaparız, ayrı görsel gerekmez).
- Sahnedeki diğer evlerle yan yana durur: bütün setin **aynı kamera açısı, aynı ışık ve aynı çizgi stili** taşıması şart.

## 2. Ekteki örnek resimler

Kullanıcının ürettiği 16 örnek (yarım ahşap kulübe, toprak damlı ev, kaya tapınak, ayaklı ev, uçan daire, mekanik mantar,
cam kubbe, hobbit evi, fıçı, metal kapsül, yarım ahşap köşk, mantar, kütük, kubbeli ev, A çatılı kulübe, kule) **stil ve
çeşitlilik için doğru yönde**. Üç sorunları var, yeni üretimlerde tekrarlanmayacak:

1. Tabelada **"SEN · DOKUN" yazısı** var → tabela boş olacak (bkz. 3.4).
2. **Düz yeşil arka plan ve kum halkası** resme gömülü → arka plan saydam olacak, kum halkası olmayacak (bkz. 3.2).
3. Boyut 2000×2000 JPEG → saydam PNG, aşağıdaki ölçüler (bkz. 3.1).

Bu 16 örneği yeni şartlarla **yeniden üret** (aynı fikir, temiz teslim), sonra yeni temalara geç.

## 3. Teknik şartlar (zorunlu)

### 3.1 Tuval ve ölçü
- **1024×1024 piksel PNG, RGBA (saydam arka plan).** JPEG yok.
- Ev tuvalin ortasında. **Taban orta noktası (evin yere değdiği yerin ortası) her görselde aynı yerde: x=512, y=900.**
- Evin en geniş yeri **700–820 piksel**; en yüksek noktası (baca dumanı hariç) y ≥ 120. Kule gibi uzun evler genişlikten
  feragat eder, yüksekliği aşmaz.
- Duman, kıvılcım gibi süs öğeleri tuvalin içinde kalır, kenara değmez.

### 3.2 Arka plan ve zemin
- Arka plan **tamamen saydam**. Yeşil kare, renk geçişi, kum halkası, yuvarlak platform **yok**.
- Evin dibinde en fazla **küçük bir çim/çiçek öbeği**, evin taban genişliğini %15'ten fazla aşmasın.
- Yere düşen uzun gölge çizme; tabanda en fazla hafif bir temas gölgesi (gölgeyi oyun çiziyor).
- Kenarlar temiz: yeşil ya da beyaz hare (halo) kalmasın, kenar yumuşatma saydamlıkla yapılsın.

### 3.3 Kamera, ışık, çizgi
- **İzometrik 3/4 görünüm**, ~30° yükseklikten. Örneklerdeki açı: **sol ön yüzde pencere ve tabela, sağ ön yüzde kapı.**
  Bütün evlerde bu düzen korunur (oyun kapı ve tabelanın yerini bilerek animasyon yapar).
- Işık **sol üstten**, yumuşak, tek kaynak.
- Çizgi stili: koyu kahverengi (#3a2a1e civarı) kontur, 4–6 px (1024'te), düz renk + iki ton gölge (cel-shading).
  Örneklerdeki "sıcak, hafif çocuk kitabı" havası. Fotogerçekçi doku, 3D render görünümü, gradyan parlama yok.
- Renkler doygun ama yumuşak; gece karartmasında kaybolmayacak kadar kontrastlı (koyu evlerde parlak pencere, açık kenar).

### 3.4 Tabela, kapı, pencere (oyunun kullandığı noktalar)
- **Tabela:** sol ön yüzde, yatay, boş (ahşap ya da tema malzemesi), yazı alanı en az **260×70 piksel**, düz ön yüze
  yakın açıda. Üstüne oyun oyuncunun adını yazabilir; o yüzden içi düz ve açık tonlu olsun.
- **Kapı:** sağ ön yüzde, net görünen, kapı kolu/halkası olan. Kapı evin en çok "dokunulacak" yeri.
- **Pencere:** en az bir tane, gece içeriden yandığında görünecek. Pencere içi **sarımsı sıcak ışık** ile çizilsin
  (gündüz de hafif sıcak ton kalabilir).
- Kapı yanında küçük bir **fener** olabilir (örneklerdeki gibi); zorunlu değil.

### 3.5 İçerik kuralları
- Yazı, harf, rakam, logo, marka, telif karakteri (ör. bilinen film/oyun evleri birebir) **yok**. Esinlenme serbest,
  kopya değil.
- Tarihî/kültürel esinlenmede saygılı ol: karikatürleştirme, kalıp yargı, dinî yapıyı ev olarak kullanma (cami, kilise,
  tapınak iç mekânı) **yok**. Mimari üslup, malzeme ve süsleme kullanılabilir.
- Korku öğeleri hafif ve sevimli olabilir (oyun gece geçiyor), kan, ölüm, iskelet yok.

## 4. Katmanlar (nadirlik)

Oyunda üç katman var. Görsel karmaşıklık katmanla artsın, ama siluet her katmanda okunaklı kalsın.

| Katman | Oran (set içinde) | Görsel düzey |
|---|---|---|
| Sıradan | ~%45 | Tanıdık köy evleri, tek ana malzeme, sade süs |
| Nadir | ~%35 | Belirgin tarihî/kültürel üslup ya da ilginç biçim, bir iki özel ayrıntı |
| Efsanevi | ~%20 | Fantastik/yenilikçi, ışık efekti (parlayan kristal, büyü, neon), çarpıcı siluet |

## 5. Tema havuzu (tarih + yenilik + farklı tarzlar)

Hepsini üretmek zorunda değilsin; **en az 30 ev** hedefle, her gruptan dağıt. Her biri birbirinden siluetle ayrılmalı.

**Anadolu ve yakın coğrafya (öncelikli, oyun Türkçe)**
- Safranbolu / Osmanlı ahşap konağı, cumbalı (nadir)
- Kapadokya peri bacası evi, kayaya oyulmuş kapı (nadir)
- Karadeniz serender'i, taş ayaklar üstünde ahşap ambar-ev (sıradan)
- Ege badem/zeytin köyü taş evi, çivit mavi pencere (sıradan)
- Mardin taş evi, kemerli, açık sarı kalker (nadir)
- Göçebe yörük çadırı / keçe yurt (sıradan)
- Selçuklu kümbet biçiminde kule ev (konik çatı, geometrik taş süsleme; dinî değil, sivil yapı) (efsanevi)
- Kerpiç düz damlı köy evi, damda kuruyan biber dizisi (sıradan)

**Dünya tarihinden**
- Viking uzun evi, çim çatı, oyma ejder başlıklı mertek (nadir)
- Japon machiya / minka, kâğıt sürgü pencere, sazdan çatı (nadir)
- Roma villası cephesi, kırmızı kiremit, sütunlu giriş (nadir)
- Mısır kerpiç evi, papirüs süsleme (sıradan)
- Maya taş evi, basamaklı taban, oymalı friz (efsanevi)
- Orta Çağ yarım ahşap köşk (sıradan)
- İzlanda çim evi (sıradan)
- Venedik dar kanal evi, kemerli pencere (nadir)
- Fas riad girişi, çini ve kemer (nadir)
- Moğol ger (sıradan; yörük çadırından farklı siluet)
- Deniz feneri ev (nadir)
- Yel değirmeni ev (nadir)
- Kale burcu / küçük kule (sıradan)

**Masal ve doğa**
- Mantar ev (sıradan) · kütük ev (sıradan) · ağaç kovuğu ev (nadir) · fıçı ev (sıradan)
- Kabak ev, gece için hafif cadılar bayramı havası (nadir)
- Kuş yuvası / dev ağaç dalı üstünde ev (efsanevi)
- Çaydanlık ev (nadir) · ayakkabı ev (nadir)
- Cadı kulübesi, eğri baca, iksir kazanı kapıda (nadir; oyunun gece temasına uygun)

**Yenilikçi ve fantastik**
- Cam kubbe sera ev, içinde parlayan bitkiler (efsanevi)
- Steampunk dişli ev, bakır borular, buhar (efsanevi)
- Kristal mağara ev, parlayan kristal baca (efsanevi)
- Uzay kapsülü / uçan daire (efsanevi)
- Saat kulesi ev (efsanevi)
- Yüzen ada ev, altında küçük taş parçaları (efsanevi; taban kuralına uy: ada tabanı y=900'de)
- Bulut ev (efsanevi)

## 6. İsteğe bağlı ek katman: gece ışığı

Her ev için ayrıca `<anahtar>-isik.png` üret: aynı tuval, **yalnız pencere ve fener ışıkları** (sarı-turuncu, yumuşak
kenar), geri kalan her yer saydam. Oyun bunu gece evin üstüne ekleyip pencereleri yakacak. Zorunlu değil ama çok değerli.

## 7. Teslim

Bir klasör, içinde:

1. **`ev-<anahtar>.png`** — ana görsel (3.1–3.5). `anahtar` küçük harf, Türkçe karaktersiz, tireli (ör. `ev-safranbolu-konak`).
2. **`ev-<anahtar>-isik.png`** — isteğe bağlı gece ışığı (6).
3. **`katalog.json`** — her ev için bir kayıt:
   ```json
   [
     {
       "key": "safranbolu-konak",
       "ad": "Safranbolu konağı",
       "nadir": "nadir",
       "ilham": "Osmanlı ahşap konakları, cumba",
       "tabela": {"x": 230, "y": 420, "w": 280, "h": 74, "aci": -4},
       "kapi": {"x": 690, "y": 760},
       "pencereler": [{"x": 330, "y": 560}],
       "isik": true
     }
   ]
   ```
   - `ad`: Türkçe, **en çok 18 karakter**, oyunda dükkânda görünür.
   - `nadir`: `siradan` | `nadir` | `efsanevi`.
   - `tabela`: tabelanın yazı alanı, 1024 tuvalinde piksel (sol üst köşe + genişlik/yükseklik), `aci` derece (sağa yükselen +).
   - `kapi`: kapının orta-alt noktası. `pencereler`: gece ışığının merkezleri.
4. **`ozet.png`** — bütün evlerin 6'lı ızgarada, açık yeşil (#7cc36a) zemin üstünde küçük (256 px) önizlemesi; altında `ad`.
   Bir de aynı ızgaranın koyu mavi (#1d2a4a) zeminlisi: gece okunurluğu için.
5. **`NOTLAR.md`** — yerine getiremediğin şartlar, yaptığın tercihler.

## 8. Kabul ölçütleri (kendin kontrol et)

- [ ] Arka plan saydam; köşe pikselleri alfa = 0; kenarda yeşil/beyaz hare yok.
- [ ] Taban orta noktası x=512, y=900 (±10 px); yükseklik y ≥ 120; genişlik ≤ 820.
- [ ] Kapı sağ ön yüzde, tabela sol ön yüzde, tabela boş ve yazı alanı ≥ 260×70.
- [ ] Hiçbir yazı/harf/rakam yok (tabela dahil).
- [ ] 256 px'e küçültüldüğünde ev tanınıyor; 12'si yan yana konduğunda hiçbiri diğerine benzemiyor.
- [ ] Gece zemininde (#1d2a4a) siluet ve pencere seçiliyor.
- [ ] Aynı açı, aynı ışık yönü, aynı kontur stili: set yan yana konduğunda tek bir oyundan çıkmış gibi.
- [ ] `katalog.json` geçerli JSON; her PNG'nin bir kaydı var; `ad` ≤ 18 karakter.

## 9. İstem şablonu (İngilizce, görsel modeline)

```
Isometric 3/4 view game asset of a small {THEME} house for a cozy night-village social deduction game.
Hand-drawn cartoon style, dark brown outlines (4-6px), flat colors with two-tone cel shading, warm saturated palette,
soft light from top-left. Front-left face: one window with warm yellow interior light and a BLANK wooden signboard
(no text, no letters). Front-right face: a clearly visible door with a handle, small lantern beside it.
Small grass tuft at the base only. Transparent background, no ground circle, no sand ring, no cast shadow, no text,
no logos. Centered, base touching the ground at the bottom center of a square 1024x1024 canvas.
Inspired by {HISTORICAL OR CULTURAL REFERENCE}, {RARITY: simple / distinctive / legendary with glowing magical details}.
```

Arka planı model saydam veremiyorsa: **düz, tek renk, evde hiç geçmeyen bir renk** (#ff00ff macenta) arka planla üret,
sonra o rengi saydamlığa çevir ve kenarlardaki macenta hareyi temizle. Yeşil arka plan kullanma (çim ve yapraklarla karışır).
