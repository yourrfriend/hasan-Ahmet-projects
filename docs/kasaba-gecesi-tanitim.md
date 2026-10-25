# Kasaba Gecesi — oyunun tanıtımı

Bu belge, oyunu geliştirme fikirleri üretecek kişiler ve yapay zekâ asistanları içindir. Teknik ayrıntı içermez;
amacı oyunun ruhunu, karakterlerini ve bugünkü hâlini anlatmaktır. Öneriler bu çerçeveye oturmalıdır.

## Tek cümleyle

Kasaba Gecesi, 4–12 kişinin aynı anda telefonlarından oynadığı, Türkçe, sevimli bir köyde geçen **sosyal çıkarım**
oyunudur: gece herkes evine çekilir ve gizlice bir şey yapar, sabah kasaba meydanında ölüler görülür, gündüz konuşulur
ve oylamayla biri kasabadan gönderilir. Hainler saklanmaya, masumlar hainleri bulmaya, tarafsızlar kendi hedeflerine
çalışır. Esin kaynağı *Feign*; tonu neşeli ve çocuksu, kan yok, fasulye gibi tombul karakterler var.

## Nasıl oynanır

- **Oda:** biri oda kurar, 12 karakterlik bir kodla (çoğunlukla linkle) arkadaşlarını çağırır. Herkes adını, rengini ve şapkasını
  seçer (bere, kep, kedi kulağı, fiyonk, gözlük, kapüşon). Hesap, kayıt, indirme yok; tarayıcıda açılır, telefon yatay
  tutulur.
- **Köy:** evler halka biçiminde dizilidir, ortada meydan vardır. Her oyuncunun kendi evi ve evinin önünde kendi
  karakteri vardır. Gündüz kuşlar, kelebekler, tavşan; gece baykuş, ateşböcekleri ve pencerelerde ışık. Sesler
  (kapı tıkırtısı, tokmak, çan, horoz) tarayıcıda üretilir.
- **İlk gece:** herkes rol kartını görür. Hainler birbirini tanır.
- **Gece (varsayılan 30 sn):** yeteneği olan oyuncu bir ev seçer; karakteri meydandan/evinden o eve **yürür** ve rolüne
  özgü bir hareket yapar (hain bıçağını çıkarıp içeri girer, doktor iğne yapar, gözcü çalıların arasından dürbünle
  bakar, polis kelepçe gösterir, tuzakçı kapıya tuzak kurar, bombacı dinamit bırakır…). Bunu yalnız kendisi görür.
  Vazgeçerse evine döner. Gece bitince uyuyanlar beklenmez; bağlantısı kopan biri varsa en fazla 30 sn beklenir.
- **Sabah:** herkes meydana çıkar; gece ölenler evlerinin önünde görünür, rolleri açıklanır (bazı roller bunu
  gizleyebilir ya da yanıltabilir). Kimin neyi öğrendiği gizli "not defterine" yazılır.
- **Tartışma (varsayılan 2 dk):** meydanda sohbet; konuşma balonları karakterlerin üstünde çıkar. Ölüler kendi
  aralarında konuşabilir ama yaşayanlara karışamaz.
- **Oylama (45 sn):** herkes bir eve ya da karaktere dokunarak oy verir ya da çekimser kalır. En çok oyu alan — en az
  2 oy ve tek başına öndeyse — kasabadan gönderilir: meydandaki fırlatma rampasıyla gökyüzüne uçar (ölüm değil,
  "gönderilme"). Oylar yalnız toplam olarak görünür; kim kime verdi bilinmez. Eşitlikte kimse gönderilmez.
- Oyun biri kazanana kadar gece–gündüz sürer. Sonda herkesin gerçek rolü açıklanır, gecelere göre özet ve "Tekrar
  oyna" vardır.

Ev sahibi süreleri (15 sn – 10 dk) ayarlayabilir; roller her maçta otomatik ve rastgele dağıtılır (elle seçim yok). Telefon
uyursa ya da tarayıcıdan çıkılırsa oyuncu aynı linkle döner, rolü yerindedir; ev sahibi kaybolursa ev sahipliği
başka birine geçer, oyun durmaz.

## Taraflar ve karakterler

Üç taraf vardır. Masumlar hainleri bulup göndermeye, hainler masum sayısını kendilerine eşitlemeye, tarafsızlar
kendi hedeflerine çalışır.

### Masumlar (köylüler) 🏠
| Rol | Ruhu | Gece yaptığı |
|---|---|---|
| **Masum** 🏠 | Sıradan köylü; gücü gündüz sözündedir. | Hiçbir şey; gece evinde uyur. |
| **Doktor** 💉 | Koruyucu, sessiz kahraman. | Birini seçer; o gece saldırıya uğrarsa kurtulur. |
| **Polis** 👮 | Sert ama kuralcı. | Seçtiği kişiyi evinden çıkarmaz; o gece rolünü kullanamaz. Seri Katil'i ve Bombacı'yı tutamaz. |
| **Gözcü** 🔭 | Meraklı, çalıların arasından dürbünle bakar. | Bir evi gözetler; o gece kaç kişinin geldiğini öğrenir. |
| **İzci** 👣 | Peşine düşer, iz sürer. | Birini izler; gece hangi eve gittiğini öğrenir. |
| **Dedektif** 🔍 | Fenerle pencereden bakar, ipucu toplar. | Birinin evini arar; olabileceği üç rolü öğrenir (biri doğrudur). |
| **Tuzakçı** 🪤 | Kurnaz, sabırlı. | Bir evin kapısına tuzak kurar; o eve gelen herkes yakalanır, rolünü kullanamaz. |
| **İspiyoncu** 📣 | Bir kerelik büyük ifşa. | Bir kez: seçtiği kişinin rolünü sabah meydanda herkese açıklar. |
| **Provokatör** 🔥 | Kalabalığı kışkırtır. | Bir kez: seçtiği kişi ertesi oylamaya 2 oyla başlar. |
| **Deli** 🌀 | Kendini Doktor, Polis, Gözcü… sanır; yaptığı hiçbir şey işe yaramaz, sabah uydurma bilgi alır. | "Rolünü" kullanır, etkisizdir. Oyun sonunda ortaya çıkar. |

### Hainler 🗡️
Hainler birbirini tanır ama gece birbirini görmez; **her hain her gece kendi başına** birinin evine girip onu
öldürebilir. Bazı hainler ayrıca bir yetenek taşır ve o gece ya öldürür ya yeteneğini kullanır.

| Rol | Ruhu | Yeteneği |
|---|---|---|
| **Hain** 🗡️ | Düz katil; saklanmak işi. | Öldürür. |
| **Temizlikçi** 🧹 | İzleri süpürür. | Seçtiği kişi o gece ölürse rolü sabah gizli kalır. |
| **Suçlayıcı** 🫵 | Parmağıyla iftira atar. | Seçtiği kişi o gece ölür ya da ertesi gün gönderilirse rolü "Hain" görünür. |
| **Hain Polis / Gözcü / İzci / Dedektif / Tuzakçı / İspiyoncu / Provokatör** | Köylü yeteneğinin hain kopyası; masum gibi görünür. | İlgili yeteneğin aynısı, hain tarafı için. |

### Tarafsızlar 🎭
Kendi başlarına oynarlar; kimi herkesin düşmanıdır, kimi sadece hayatta kalmak ister.

| Rol | Ruhu | Hedefi |
|---|---|---|
| **Seri Katil** 🔪 | Yalnız avcı. | Her gece birini öldürür; Polis onu tutamaz. Tek başına kalınca kazanır. |
| **Bombacı** 🧨 | Sabırlı, patlamayı bekler. | Her gece bir eve dinamit koyar; istediği gece hepsini patlatır. Polis onu tutamaz. Herkes ölünce kazanır. |
| **Hırsız** 🎭 | Maskeli, kimlik çalar. | Birinin evine girer, onu öldürür ve rolünü çalar; artık o rolle o tarafta oynar. |
| **Büyücü** ⚡ | Evinden çıkmaz, gökten yıldırım indirir. | Birini seçip rolünü tahmin eder: doğruysa hedef yıldırımla ölür (Doktor kurtaramaz), yanlışsa kendisi ölür. Tek başına kazanır. |
| **Hayatta Kalan** 🦺 | Korkak ama dayanıklı. | 3 kez yelek giyebilir; yelekliyken ölmez. Sona kadar yaşarsa kazanan tarafla kazanır. |
| **Hortlak** 🕯️ | Gönderilmek ister. | Gece bir evin önüne mum koyar. Gündüz gönderilirse kazanır ve o gece hayalet olarak gelip mum koyduğu kişiyi öldürür. |

### Kazanma
- **Masumlar:** hain ve düşman tarafsız kalmayınca.
- **Hainler:** düşman tarafsız yokken hain sayısı diğer oyunculara eşit ya da fazla olunca.
- **Tarafsız:** Seri Katil / Bombacı / Hırsız / Büyücü tek başına kalınca; Hortlak gönderilince; Hayatta Kalan sona kadar yaşayınca (kazananla birlikte).

### Rol dağılımı (otomatik)
Oyuncu sayısına göre: 4–8 kişide **1 hain**, 9–12'de **2**; 6+ kişide bir Deli; 9+ kişide bir saldırgan tarafsız
(12'de iki) ve bir pasif tarafsız. Her özel rol en fazla bir kez çıkar; hainlerin en az biri düz Hain'dir; Doktor hep
vardır, 5+ kişide Polis de; bilgi veren rol sayısı hain sayısından az olmaz. Eşikler binlerce simüle oyunla
ayarlandı: tek hain bile ilk gecelerde yeterince tehlikelidir; iki hain küçük oyunu ilk gece bitiriyordu.

## Bugünkü hâli

- Canlıda ve oynanıyor (kasaba.munupixi.com); deneme sürümü ayrı adreste.
- Tüm yukarıdaki roller, gece yürüyüşü ve 17 rol hareketi, kalıcı gece izleri (tuzak, kelepçe, mum, dinamit),
  kopan oyuncu rozeti, telefonda yatay düzen, oyun sonu özeti; **Kasabada Bu Gece** gazetesi (en çok 3 kart, yalnız
  gerçek olaylardan), **rövanş** (hazır sayacı, aynı odada yeni maç), **Bu Akşam** skoru (oyuncu başına kazanılan/oynanan).
  Tartışmada **⚡ hızlı ifadeler** (tek dokunuşla "Rolüm: …", "… hakkında şüphem var" vb.; sınırlı, sunucu kurar) ve gazetede
  "iddia ve gerçeklik" kartı; üst barda **📘 rol rehberi** (oyunu durdurmayan çekmece: roller, ipuçları, dağılım kuralları).
- **Oyuncu geçmişi** (canlıda): herkes kayıt olmadan tanınır, maçlar ve roller saklanır; oyun sonunda "📖 Hikâyeyi gör" ile
  maçın **gece gece hikâyesi** (kim kimin evine girdi, kim kurtarıldı, kim ne iddia etti ve doğru muydu, oy toplamları);
  **kasaba sayfası** (ev sahibinin grubu: tablo — maç, zafer, en çok rol; arkadaş karşılaştırmaları; son maçlar) ve giriş
  sayfasında "Geçmişin" (kişisel kart, son oyunlar, kasabalar). Yüzde ve "en çok kaybeden" listesi bilerek yok; tek tek oylar
  hiç kaydedilmez.
- **E-posta ile hesap** (kasaba-test'te): "E-postanı bağla" → maile 6 haneli kod → kod yazılır; başka cihazda "Hesabınla gir" aynı kodla; o cihazdaki anonim maçlar istenirse hesaba taşınır. Şifre yok, Google yok, link yok. Mail kısa ve Türkçe. Kod isteğinde görünmez bir insan doğrulaması (Cloudflare Turnstile) ve adres/IP başına sınırlar var; yabancılara istenmeyen mail gitmez.
- Yapımda: evlerin yeni çizimi (bej duvar, koyu çatı, baca, tabela).

## Değişmeyecek kararlar

- Her hain kendi başına öldürür (ekipçe tek kurban yok). Hain sayısı düşük tutulur.
- Bombacı ve Seri Katil Polis tarafından tutulamaz.
- Oylar yalnız toplam olarak görünür; kim kime oy verdi hiçbir zaman kaydedilmez.
- Sevimli ton: kan, korku, gerçekçi şiddet yok. Gönderilen oyuncu rampadan uçar.
- Türkçe, kısa ve samimi arayüz metinleri; hesap açmadan oynanır.

## Ne tür katkı arıyoruz

Oyunun ruhuna uyan fikirler: yeni roller ve mevcut rollerin daha keskin kimlikleri, rol dengesi ve oyuncu sayısına
göre varyantlar, gece hareketleri ve sahne anları (sabah, oylama, zafer ekranı), ilk kez oynayanın akışı, oyun sonu
hikâye anlatımı, oyuncuları tekrar oynamaya çağıran özellikler (unvanlar, istatistikler, kasaba sayfası), sohbet ve
tartışmayı canlandıran küçük mekanikler. Teknik mimariyi değil, oyun deneyimini tartışmak istiyoruz.
