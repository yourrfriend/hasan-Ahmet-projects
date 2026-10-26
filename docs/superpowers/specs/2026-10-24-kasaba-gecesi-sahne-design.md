# Kasaba Gecesi — Rol Dağılımı, Gece Yürüyüşü ve Rol Animasyonları, Evler

Tarih: 2026-10-24 · Dal: `sahne` (`sunucu`'dan) · Durum: denetleyici okudu, beş soru benim kararımla kapatıldı; uygulanıyor

## 1. Niyet ve neden

Oyuncular üç şey istedi: (1) gece hamle yapınca karakter hedefin evine "ışınlanmasın", yürüsün ve varınca
rolüne göre bir şey yapsın (Feign'deki gibi); (2) evler verilen görsele benzesin ama küçük bir farkla;
(3) rol dağılımında bazı roller gereğinden sık çıkmasın, dağılım kurallı olsun. Hepsi oyunun görünür kısmı ve
"gerçek oyun" hissi; geçmiş/Supabase işinden bağımsız, canlıya hemen çıkar.

Deneme (kasaba-test, `sahne@a61ec30`): mesafeye göre yürüyüş + kapıda bıçak. Kullanıcı yürüyüşü beğendi;
rol animasyonu Polis'te yoktu (denemede yalnız Hain vardı). Deneme kodu atılır; bu tasarım yeniden yazar.

## 2. Hedefler, hedef olmayanlar, anti-hedefler

Hedefler:
- Her rol için gece hamlesi: karakter mevcut konumundan hedefe **yürür** (hız sabit, süre mesafeye göre),
  varınca **rolüne özgü ~1 sn'lik hareket** oynar; kalıcı iz bırakan roller (tuzak, mum, dinamit) izi gece boyu
  gösterir. Yalnız hamleyi yapan görür (bugünkü gizlilik kuralı).
- Evler referans görseldeki gibi (bej duvar, koyu kahve çatı, solda pencere, sağda kapı, hafif perspektif),
  ayırt edici fark: çatıda baca + kapı üstünde küçük ad tabelası. Ev boyutu ve dokunma alanı değişmez.
- Rol dağılımı kurallı: her özel rol en fazla bir kez; hain/tarafsız sayısı formülle; formül oyun motoruyla
  simüle edilip kalibre edilir. Hedef: her oyuncu sayısında masumların kazanma oranı %45–55, ortalama 3–5 gün,
  ilk gece ölüm ≤ n/4. Hainler güçlendirilmez.

Hedef olmayanlar:
- Diğer oyuncuların gece hareketlerini görmek; sabah "izleri" (Feign'in Tracker boyası) — ayrı iş.
- Dış sprite/animasyon dosyaları, ses dosyaları; sayfa tek dosya kalır.
- Ev sahibinin rol seçme ekranı (Feign'deki gibi rolleri açıp kapatma) — ayrı iş; formül varsayılan dağılımdır.

Anti-hedefler:
- Gizli bilgi sızması: animasyon ya da iz başka oyuncuya görünmez; `state` değişmez.
- Telefonda dokunma düzeninin bozulması (bugünkü ev halkası, `ringPos`, `houseAt` korunur).
- Oyunun gece süresinin animasyon yüzünden yetmemesi: en uzun yürüyüş + hareket ≤ 5 sn; gece en az 15 sn.
- `game.js`'in görsel şeyler bilmesi: animasyon tamamen istemcide; `game.js` yalnız dağılımı değiştirir.

## 3. Kısıtlar

- Proje becerisindeki kurallar: sabitler `game.js`'te; istemci kural hesaplamaz; `KG_VER` artar; `kontrol.sh --e2e`.
- Sahne SVG (`index.html` "Köy sahnesi" bölümü); karakterler `drawBean`/`moveBean` (CSS `transform` geçişi +
  `walkhop` animasyonu), evler `drawHouse` (`nightSpot` kapı/çalı/pencere/içeri konumları, `glow`, `dim`, `doorOpen`).
- `priv.role.key` deli için "sandığı rol"dür → Deli kendiliğinden sandığı rolün animasyonunu görür (istenen davranış).
- Geçmiş dalı (`gecmis`) `game.js`'e olay günlüğü ekledi; bu iş `autoSetup` ve istemciyi değiştirir, çakışma beklenmez.

## 4. Yaklaşımlar

| Parça | Seçilen | Elenen |
|---|---|---|
| Dağılım | A: formül `autoSetup`'ta + `denge.js` simülasyon aracı + kısıt testleri | B: elle sabit tablo (yeni rolde her satır elle) |
| Yürüyüş/animasyon | A: SVG içinde elle çizilmiş küçük nesneler + CSS keyframe; mesafeye göre süre | B: sprite/Lottie dosyaları (dış dosya, lisans, yükleme) |
| Evler | A: `drawHouse` yeniden çizim, geometri aynı | — |

Kullanıcı A/A/A'yı ve önce denemeyi seçti; deneme yapıldı.

## 5. Kararlar

### 5.1 Rol dağılımı (`game.js` `autoSetup(n)`)

Formül ("tehdit bütçesi"); `n` oyuncu sayısı (4–12):
- `hain`: 4–8 kişi 1, 9–12 kişi 2; 3 hain hiç yok (kalibrasyon kararı, aşağıda). En az biri düz **Hain**; hainlerin en çok `floor(hain/2)`'si
  yetenekli (havuz: Temizlikçi, Suçlayıcı, Polis(H), Gözcü(H), Dedektif(H), Tuzakçı(H), İzci(H), İspiyoncu(H),
  Provokatör(H)); **aynı rol iki kez çıkmaz** (bugünkü "iki Temizlikçi" ve "Seri Katil çifte ağırlık" kalkar).
- Saldırgan tarafsız (Seri Katil, Bombacı, Hırsız, Büyücü; eşit olasılık): `n ≥ 9` → 1; `n = 12` → 2.
- **Kalibrasyon kararı (2026-10-24, kullanıcı):** `denge.js` ölçümü 6–8 kişide 2 bağımsız hainin oyunu ilk gece bitirdiğini
  (ilk gece ~1,3 ölüm, eşitlik hemen) gösterdi; "ekip tek kurban" kural değişikliği önerildi, kullanıcı her hainin
  ayrı öldürmesini (Feign tarzı) korumayı seçti; bunun karşılığı düşük hain sayısı. 2+ hainli oyunlarda simülasyonun
  masum kazanma yüzdesi anlamsızdır (basit oyuncular haini bulamaz); orada ölçü ilk gece ölüm ve süredir.
  (İlk taslaktaki "tehdit bütçesi" formülü eşiklerle çelişiyordu — n=7 ve 10'da tarafsızı düşürüyordu — kaldırıldı;
  dengeyi eşikler ve kalibrasyon belirler.)
- Pasif tarafsız (Hayatta Kalan, Hortlak; eşit olasılık): `n ≥ 9` → 1.
- Deli: `n ≥ 6` → 1 (masum sayılır).
- Masumlar (`m = n − hain − tarafsız − deli`): **güncel kural (2026-10-25 geri bildirim paketi):** 4–6 kişide Masum yok, 7+ kişide 1 Masum (`DAGILIM.masum`), kalan masumların hepsi yetenekli. Yetenekliler: Doktor hep; Polis `n ≥ 5`; sonra havuzdan tekrarsız (Gözcü, İzci,
  Dedektif, Tuzakçı, İspiyoncu, Provokatör), önce bilgi rolleri gelecek şekilde: **bilgi rolü sayısı ≥ hain sayısı**
  (Gözcü, İzci, Dedektif, Polis, İspiyoncu bilgi rolüdür). Tek hainli oyunda hain `DAGILIM.tekHainSurumP` (0,5) olasılıkla sürümlü.
- Eşikler `game.js` `DAGILIM`'da sabit ve donmuş (ölçüm/test için `autoSetup(n, ayar)` ile geçici üst yazım); güncel tablo README "Rol dağılımı" bölümünde, geri bildirim tasarımı `2026-10-25-kasaba-gecesi-rol-dagilimi-geri-bildirim-design.md`.

5.1.1 Kalibrasyon: `kasaba-gecesi/sunucu/test/denge.js` (komut: `node test/denge.js [oyun=2000]`):
her `n` için `createGame`/`startGame`/`act`/`vote`/`advance` ile oyunlar oynatır; basit strateji —
hainler yaşayan masum/tarafsızı öldürür, Seri Katil rastgele, Doktor rastgele korur, bilgi rolleri rastgele
hedef; gündüz: hainler masuma oy verir, masumlar şüpheliye — şüpheli = o gece ölen evin ziyaretçisi olarak
Gözcü/İzci/Dedektif notlarında geçen biri (o oyuncunun notu varsa), yoksa rastgele yaşayan biri. Çıktı tablo:
`n, masum %, hain %, tarafsız %, ort. gün, 1. gece ölüm`. **Bant (%45–55) rapor eşiğidir, otomatik hedef değil:**
rastgele/basit strateji gerçek oyuncuyu temsil etmez; araç dağılımları birbiriyle karşılaştırmak içindir. Bant dışı
satırlar işaretlenir ve eşik değişikliğine kullanıcı karar verir (§7). Araç test değildir, `npm test`'e girmez; ama `game.test.js`'te dağılım **kısıtları** test edilir: her n için 500 dağılımda özel rol tekrarı yok,
hain sayısı formüle uyar, bilgi rolü ≥ hain, toplam = n.

### 5.2 Yürüyüş (istemci)

- Hız 190 sahne birimi/sn; süre `clamp(500 ms, mesafe/hız, 3500 ms)`; yürüyüş boyunca `walkhop` sürekli,
  varınca `landed` → `idle`. Mevcut konumdan başlar (hedef değiştirirse yeni hedefe mevcut yerden yürür;
  "Vazgeç" evine yürüyerek döner). **Yalnız gece hamle yürüyüşü** mesafeye bağlıdır: `moveBean` isteğe bağlı süre
  alır; sabah/akşam dizileri ve meydan hareketleri bugünkü sabit süreyle kalır (deneme tüm hareketleri
  değiştirmişti; o kısım alınmaz).
- Süre `pickHouse` içinde **render'dan önce** hesaplanır (deneme bunu öğretti), `anim.walkMs`'e yazılır;
  varış anı `anim.enteredAt + walkMs`; sesler (kapı/tıklama) varışta.
- "SEN"/"HEDEFİN" etiketleri karakteri izler (etiket konumu karakterin görsel konumu: `getBoundingClientRect`
  yerine aynı geçiş süresiyle CSS ile taşınan bir `g`): `tagAt` yerine karakter grubunun içine bağlı etiket.
- Evdeki ışık/kapı davranışları aynı: içeri giren roller (`enter` konumu) varış + hareket süresi sonra girer.

### 5.3 Rol animasyonları (istemci; yalnız hamleyi yapan görür)

Her rol için: konum (`nightSpot` türü), nesne (SVG), hareket (CSS keyframe, ~1 sn), kalıcı iz (gece boyu).
Nesneler `S_.fx` katmanına, karakterin yanına; hareket bitince silinir (iz hariç). Deli sandığı rolünkini görür.

| Rol | Konum | Nesne / hareket | Kalıcı iz |
|---|---|---|---|
| Hain, Seri Katil | kapı → içeri | bıçak, 3 sallama (deneme) → kapı açılır, girer | — |
| Hırsız | kapı → içeri | maskeli çanta, girer; içeride "?" baloncuğu | — |
| Temizlikçi | kapı → içeri (öldürme) / kapı (temizlik) | süpürge sallama | — |
| Suçlayıcı | kapı | işaret parmağı + "!" | — |
| Doktor | kapı | iğne, evin üstünde yeşil "+" yanıp söner | — |
| Polis | kapı | kelepçe + "DUR" rozeti, kapıda bekler | kapıda kelepçe simgesi |
| Gözcü | çalı | dürbün, sağa-sola bakış | — |
| İzci | çalı | büyüteç + ayak izleri | — |
| Dedektif | pencere | fener huzmesi pencerede | — |
| İspiyoncu | pencere | fotoğraf flaşı (beyaz parlama) | — |
| Provokatör | kapı | megafon + "!!" | — |
| Tuzakçı | kapı | tuzak yerleştirme | kapı önünde tuzak |
| Bombacı | kapı | dinamit bırakma | kapı önünde dinamit; önceki gecelerinkiler de durur (`priv.planted` ev listesi olur; `game.js`'te küçük değişiklik: `privFor` `r.planted` listesini döner, istemci sayı için `.length` kullanır) |
| Hortlak | kapı | mum yakma | kapıda mum |
| Büyücü | evinde | elini kaldırır, hedef eve yıldırım çizgisi + parlama | — |
| Hayatta Kalan | evinde | yelek giyme (iki kol) | — |
| Masum | — | hareket yok ("evde kal") | — |

Hareket süreleri 0,8–1,2 sn; `walkMs + hareket ≤ 5 sn`. Ses: mevcut `SFX` (kapı, tıklama) + bıçak için kısa
"vınlama", doktor için "ding" — Web Audio ile üretilir, dosya yok.

### 5.4 Evler (`drawHouse`)

Referans: kullanıcının görseli (`/home/baris/.claude/uploads/.../f58044f2-image.jpg`). Bej duvar (`#e8d8b5`),
koyu kahve çatı (`#5a3d2b`), beyaz kenarlıklı çatı altı, solda mavi camlı tek pencere, sağda kahverengi kapı,
sağ yan duvar daha koyu (perspektif). Fark: çatıda küçük baca (duman yok) ve kapı üstünde ad tabelası (adın
kendisi tabelada değil, etiket kalır). `nightSpot` konumları, `glow`/`dim`/`doorOpen`/`winLights` arayüzü aynı;
ev kutusu (−58..76, −86..36) aynı. Mezar ve ceset çizimleri değişmez.

### 5.5 Test ve doğrulama

- `game.test.js`: dağılım kısıtları (5.1.1).
- `denge.js` çıktısı README'de tablo; kalibrasyon kararı yazıya işlenir.
- E2E (`test/e2e.js`): gece adımında ev seçildikten sonra karakter 300 ms sonra henüz hedefte değil
  (yürüyor), `walkMs` sonra hedefte ve o rolün `fx` elemanı sahnede; başka oyuncunun sayfasında `fx` yok.
- Görsel: telefon (844×390) ve masaüstü ekran görüntüleri: ev, yürüyüş ortası, 3 farklı rol hareketi.
- `kontrol.sh --e2e` yeşil; `KG_VER` artar.

## 6. Aşamalar

1. Rol dağılımı + `denge.js` + kısıt testleri + README tablosu (`game.js`; canlıya alınabilir).
2. Yürüyüş + etiketlerin karakteri izlemesi + rol animasyonları (`index.html`; kasaba-test'te kullanıcı her rolü dener).
3. Evler.

## 7. Kullanıcıdan gerekenler

- 2. aşamadan sonra kasaba-test'te rolleri deneyip beğenmediği hareketleri söylemesi.
- Kalibrasyon tablosunu onaylaması (hedef bant dışı kalan n değerleri için karar).

## 8. İnşaatçıya bırakılanlar

- SVG nesnelerinin kesin çizimi ve renkleri; keyframe'ler.
- Simülasyon stratejisinin ayrıntıları (yalnız karşılaştırma için; gerçekçilik iddiası yok).
- Büyücü yıldırım çizgisinin sahnede nasıl çizileceği (düz çizgi + parlama yeter).
