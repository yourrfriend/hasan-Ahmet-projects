# Kasaba Gecesi — rol dağılımı geri bildirim paketi (tasarım)

Tarih: 2026-10-25. Dal: `gecmis` üzerinden yeni dal `rol-dagilimi`. Önceki dağılım tasarımı:
`2026-10-24-kasaba-gecesi-sahne-design.md` §5.1; kod `kasaba-gecesi/sunucu/game.js` (`DAGILIM`, `autoSetup`, `startGame`).

## 1. Niyet

Oyuncu geri bildirimi (2026-10-25, Barış):
1. Aynı rol üst üste aynı kişiye geliyor ("yine Masum", "yine hain").
2. Masum rolü (yeteneksiz masum) can sıkıyor; azalsın ya da kalksın.
3. Hain sürümlü roller (Polis-hain, Gözcü-hain…) daha sık, düz Hain daha seyrek çıksın.

Başarı: aynı odada arka arkaya oynanan maçlarda aynı kişiye aynı rolün gelmesi belirgin azalır; 4–6 kişide kimse
Masum olmaz; tek hainli oyunlarda hain bazen sürümlü olur; `npm run denge` ölçümünde masum kazanma bandı ve ilk gece
ölümleri bugünkünden belirgin kötüleşmez (kötüleşirse eşik kararı kullanıcınındır).

## 2. Kullanıcı kararları (bu tasarımın girdisi)

- **Masum:** 7 ve üstü oyuncuda en fazla 1 Masum; 4–6 kişide Masum yok.
- **Tek hain:** 4–8 kişilik tek hainli oyunlarda o tek hain **bazen** sürümlü olsun (Polis-hain, Gözcü-hain…).
  İki hainli oyunlarda bugünkü gibi 1 sürümlü + 1 düz Hain kalır. Olasılık **0,5**, havuz tam (temizlikçi, suçlayıcı,
  tüm `_h` sürümleri); karar kasaba-test'te gerçek maçlarla gözden geçirilir (denetleyici sonrası karar, 2026-10-25).
- **Tekrar engeli eğilimdir, kesin kural değil:** %80 olasılıkla ceza araması, %20 düz karıştırma (denetleyici sonrası
  karar, 2026-10-25). Bilinen: oyun başındaki herkese açık rol listesi sürümlü haini "Gözcü (Hain)" diye gösterir; tek
  hainli oyunda hainin yeteneği (kim olduğu değil) herkesçe bilinir; iki hainli oyunlarda bugün de böyle; kabul edildi.
- **Tekrar:** yol **C** — önce oda hafızası (A), ardından aynı planın ikinci görevi olarak Supabase'den tohumlama (B).
- Değişmeyenler (önceki kararlar): hain sayısı 4–8'de 1, 9–12'de 2; her hain ayrı öldürür; her özel rol bir oyunda en
  fazla bir kez; Bombacı ve Seri Katil Polis tarafından tutulamaz.

## 3. Hedefler, hedef olmayanlar, anti-hedefler

Hedefler: üç kuralı `game.js`'te tek yerde değiştirmek; her kuralı birim testle sabitlemek; `denge.js` ile önce/sonra
ölçmek ve README tablosunu güncellemek; tekrar cezasını geçmişin kaynağından bağımsız yazmak (oda belleği ya da
Supabase aynı fonksiyonu besler).

Hedef olmayanlar: arayüz değişikliği yok (oyuncuya "tekrar engellendi" gösterilmez); hain/saldırgan/pasif/deli eşikleri
değişmez; kasabalar arası ya da kalıcı "yasak listesi" yok; gazete/hikâye değişmez.

Anti-hedefler:
- **Dağılım tahmin edilebilir olmasın.** "X geçen maç haindi, demek ki bu maç değil" çıkarımı sosyal çıkarım oyununu
  bozar. Tekrar engeli **eğilim** olmalı, kesin kural değil (bkz. §5.3, kullanıcı kararı bekleyen nokta).
- Maç başlatma Supabase'i beklemesin; kayıt kapalıyken ya da Supabase yanıt vermezken dağılım bugünkü gibi çalışsın.
- Gizli bilgi `P`'ye girmesin: rol geçmişi gizlidir (`SECRET_KEYS`).

## 4. Kısıtlar

- `game.js` saf kalır (ağ bilmez); Node ve tarayıcı sarmalı bozulmaz; sabitler tek yerde.
- `autoSetup(n)` imzası ve dönüşü (`{id: adet}`) korunur: `denge.js`, `game.test.js` ve README buna bağlı.
- Oyuncu kimliği odada açık kimliktir (`pubId`); yeniden bağlanan aynı kimlikle döner — hafıza anahtarı budur.
- Supabase okuması yalnız sunucuda, `service_role` ile (`kayit.js` zaten bu anahtarı tutar); istemciye hiçbir şey gitmez.
- `oyun_oyunculari.rol_key/takim` yalnız **bitmiş** maçlarda doludur (iptalde boş).

## 5. Tasarım

### 5.1 Masum eşiği (`autoSetup`)

Bugün: masumların yetenekli sayısı `min(m, max(ceil(0,75·m), hain+1), 8)`, gerisi Masum → 5–12 kişide hep tam 1 Masum.
Yeni: `masum = n >= 7 ? 1 : 0`; `yetenekli = m − masum` (m = masum tarafı toplamı). Yetenekli havuz 8 rol (Doktor,
Polis, Gözcü, İzci, Dedektif, İspiyoncu, Tuzakçı, Provokatör); en büyük m 12 kişide 6, havuz yeter. Doktor hep, Polis
5+ kuralı ve "bilgi rolü sayısı ≥ hain" sırası aynen kalır.

Bilinen sonuç: 9 kişide m=4 → 3 yetenekli → Doktor, Polis + 1 bilgi rolü; Tuzakçı/Provokatör 9 kişide yine çıkmaz
(ertelenmiş küçük; bu paketin konusu değil, ölçümde görünür).

### 5.2 Tek hain sürümü (`autoSetup`)

Bugün sürümlü hain sayısı `floor(hain/2)` → tek hainli oyunda hiç. Yeni: `hain === 1` ise olasılık `TEK_HAIN_SURUM_P`
(**öneri 0,5**, `game.js` sabiti; `denge.js` `DAGILIM_*` gibi env ile geçici değiştirilebilir) ile hain sürümlü havuzdan
(`temizlikci`, `suclayici`, `DUAL` rollerinin `_h` sürümleri) bir rol; değilse düz Hain. `hain === 2` → 1 sürümlü + 1 düz
(değişmez). **Ölçüm sınırı:** `denge.js` botları hain tarafında yalnız öldürür, sürümlü hainin yeteneğini kullanmaz;
tablo bu olasılığa duyarsızdır. Bu yüzden ölçüm yalnız Masum eşiği için kullanılır; olasılık/havuz kasaba-test'te
gerçek maçlarla değerlendirilir (bota hain yeteneği eklemek ayrı iş, bu paketin dışı). Düz Hain'in
"ekip görüşü" ve sürümlü hainin yeteneği bugünkü gibi; kural motoru değişmez.

Test etkisi: `game.test.js`'teki "düz hain şart" ve "yetenekli hain ≤ floor(hain/2)" iddiaları → "sürümlü hain ≤
ceil(hain/2)" ve "hain ≥ 2 ise en az bir düz Hain".

### 5.3 Tekrar eğilimi (`startGame` + yeni saf fonksiyon)

Torba (`autoSetup` → `SETUP` sırasıyla roller) **değişmez**; yalnız kimin hangi rolü aldığı seçilir.

- **Geçmiş:** `R.rolGecmisi = { [pubId]: [{key, team}, …] }`, en yeni önde, oyuncu başına en çok 5 kayıt. Gizli:
  `SECRET_KEYS`'e eklenir; `state`/`priv`'e girmez. Oda silinince gider (bellek). `R` oda ömrünce aynı nesne
  (`endToLobby` `P`'yi sıfırlar, `R`'yi değil) — oda düzeyi bellek için ek yapı gerekmez.
- **Ceza:** oyuncu p, aday rol r, geçmiş h (en yeni önde):
  - `r.key === h[0].key` → 4 (hemen tekrar);
  - `r.key === h[1].key` ya da `h[2].key` → 1'er;
  - `r.team === 'imp'` ve `h[0].team === h[1].team === 'imp'` → 2 (üst üste üçüncü kez hain);
  - geçmişi olmayan oyuncu → 0.
  `key` karşılaştırılır (Polis ve Polis-hain aynı "Polis"; takım tekrarı ayrı sayılır). Deli için `key='deli'`
  (sandığı rol değil).
- **Seçim:** `rolDagit(bag, players, gecmis)` saf fonksiyon: torbayı `DENEME=200` kez karıştırır, toplam cezası en düşük
  dağıtımı döner; cezası 0 olan bulununca erken durur. 12 oyuncuda 200 deneme ucuzdur (maç başına bir kez).
- **Eğilim (karar verildi):** kesin kaçınma "X geçen maç haindi → bu maç değil" bilgisini herkese verirdi. Dağıtım
  `%80` olasılıkla ceza aramasıyla, `%20` düz karıştırmayla yapılır (`TEKRAR_KACINMA_P = 0.8`, `game.js` sabiti).
  Tekrar belirgin azalır ama "kesinlikle değil" denemez.
- **Güncelleme:** `startGame` dağıtımdan sonra her oyuncunun geçmişinin önüne `{key, team}` ekler (5'te keser). İptal
  edilen maç da geçmişe girer (rol görüldü, tekrar hissi aynı); **bu benim kararım**, builder değiştirmesin.
- Test: 4 kişide geçmiş verilip 300 başlatmada "hemen tekrar" oranı düz karıştırmaya göre belirgin düşük (ör. %20
  olasılıkla düz karıştırmada ≈ ¼·0,2 ≈ %5 üst sınır bandı); cezası 0 dağıtım varken `rolDagit`'in (deneme sayısı
  yüksek) onu bulduğu; geçmiş 5'te kesiliyor; `state`'te `rolGecmisi` yok.

### 5.4 Supabase'den tohumlama (ikinci görev, isteğe bağlı; kayıt açıkken)

Amaç: akşamlar arası tekrar. Kaynak `oyun_oyunculari` (bitmiş maçlar, `rol_key`, `takim`).
- `kayit.js`'e okuma: `sonRoller(uye, kurulum) → [{key, team}, …]` (en yeni önde, en çok 5; `oyunlar` ile iç birleşim
  `sonuc = 'bitti'`, aynı `kurulum`; sıralama bitiş zamanına göre — PostgREST'te gömülü sütunla sıralama
  `order=oyunlar(bitis).desc` çalışmazsa builder `oyunlar` üzerinden iki adımda çeker). 3 sn zaman aşımı; hata sessiz,
  `/saglik` sayacı (`rolGecmisi:{okunan,hata}`).
- Ne zaman: `join` ile kayıtlı bir oyuncu odaya girdiğinde, `R.rolGecmisi[pubId]` yoksa arka planda çekilir ve
  **yalnız hâlâ boşsa** yazılır (o arada maç başlayıp oda belleği dolduysa oda belleği kazanır). `start` hiçbir zaman
  beklemez. Misafir (token yok) ve kayıt kapalı kurulum: atlanır.
- Kasaba süzgeci **yok**: oyuncunun bu kurulumdaki son 5 bitmiş maçı, hangi odada olursa olsun ("yine hain" hissi odadan
  bağımsız) — benim kararım.
- Hırsız: Supabase'deki `rol_key` çalınan roldür; geçmişe `calinan_rol || rol_key`… hayır: oyuncunun **başladığı** rol
  `hirsiz`'dır, `calinan_rol` doluysa `rol_key` çalınan rol → geçmişe `calinan_rol ? 'hirsiz' : rol_key` yazılır (benim
  kararım; "yine Hırsız" hissi başlangıç rolüne aittir).
- Sunucu testlerindeki taklit kayıt nesnesinde `sonRoller` yoksa çağrı atlanır (isteğe bağlı yöntem).
- Test: `kayit.test.js` taklit PostgREST ile (`taklit-rest.js`), `server.test.js`'te join sonrası `R.rolGecmisi` dolar,
  hata/zaman aşımı sessiz.

### 5.5 Ölçüm ve belge

- `npm run denge` önce (HEAD; taban 2026-10-25: 4→%33, 5→%36, 6→%41, 7→%44, 8→%47 masum; bitmeyen 0) ve sonra (Masum
  eşiği etkisi); README "Rol dağılımı" tablosu ve ölçüm bloğu güncellenir; `game.test.js` `bekle` tablosu (hain/saldırgan/pasif/deli değişmez) ve Masum/sürüm iddiaları.
- SKILL.md "Rol dağılımı" satırı ve `docs/DURUM.md`.
- Yayın sırası: `kasaba-test` → kullanıcı birkaç maç dener (rövanşta rol tekrarına bakar) → `/yayinla`.

## 6. Yaklaşımlar (değerlendirilenler)

| | A. Oda belleği | B. Supabase geçmişi | C. A + B tohumlama (seçilen) |
|---|---|---|---|
| Kapsam | aynı oda oturumu | akşamlar arası, yalnız kayıtlı | ikisi |
| Bağımlılık | yok | ağ, kayıt açık | A tek başına çalışır |
| Misafir | kapsar | kapsamaz | A kapsar |
| Risk | başka gün yakalamaz | start gecikmesi, tek DB başka odayı etkiler | tohumlama arka planda, yalnız boş girdiyi doldurur |

Elenen: torbayı oyuncuya göre değiştirmek (denge bozulur); istemcide hafıza (sunucu yetkilidir, istemciye güvenilmez);
kalıcı "yasak" listesi (anti-hedef: tahmin edilebilirlik).

## 7. Builder'a bırakılanlar

`rolDagit`'in deneme sayısı ve erken durma; `kayit.js` sorgusunun tam biçimi; `/saglik` sayaç adları; test dosyası
yerleşimi; `denge.js`'e `TEK_HAIN_SURUM_P` env geçişi; README tablosunun biçimi.

## 8. Kararlar (denetleyici turu, 2026-10-25)

1. Tekrar engeli **eğilim**, %80 (§5.3).
2. Tek hain sürüm olasılığı **0,5**, havuz tam; ölçüm yerine kasaba-test denemesiyle gözden geçirilir (§5.2).
