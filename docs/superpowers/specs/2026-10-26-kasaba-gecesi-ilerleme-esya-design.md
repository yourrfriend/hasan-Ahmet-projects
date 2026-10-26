# Kasaba Gecesi — ilerleme ve eşya modu (tasarım)

Tarih: 2026-10-26. Dal: `ilerleme` (`main`'den). Kaynak: kullanıcıyla brainstorm (2026-10-26), kararlar aşağıda.

## 1. Niyet
Oyuncuları geri getirmek ve maçları çeşitlendirmek. Her maç sonunda bir ödül (kasa), oyundaki gerçek anlardan çıkan
rozetler, kişisel sayfa, giyilen kozmetikler ve ev sahibinin açtığı, gidişatı etkileyen **eşya modu**.

## 2. Kullanıcı kararları
- Hepsi ilk sürümde: kişisel sayfa, rozetler, kasa, dolap (kozmetik), eşya modu.
- **Kasa her maç sonunda** açılır; kazanan da kaybeden de alır (kazanan +2 yıldız).
- Kazanılan kozmetikler **oyunda herkese görünür**.
- Gidişatı etkileyen eşyalar: **kasadan kazanılır, maçta harcanır**; maç başına **en fazla bir** eşya taşınır; eşyası
  olmayana maç başında **ücretsiz rastgele** temel eşya verilir; **ev sahibi açar** (lobide eşya modu).
- Eşya kullanılınca **kullanıldığı açıklanır, kullanan gizli kalır** (sabah haberi / oylama özeti); maç sonu gazetesi kimin
  kullandığını söyler.
- Kullanılmadan ölünürse eşya **kasaya geri döner** (harcanmaz).
- **Dağıtım (kullanıcı sorusu, 2026-10-26):** eşya modu açıkken **her oyuncu tam bir eşya** alır; kaynak seçim (envanter) ya da
  aynı havuzdan rastgele ücretsiz; **rolden tamamen bağımsız**; **rol dağıtımından önce belli olur**: eşya lobide görünür (seçilen
  ya da lobide önceden çekilen rastgele eşya), rol maç başlayınca. Rastgele eşya lobide oyuncu başına çekilir ve start'ta aynen
  kullanılır (`room.lobiEsya[pubId]`, sunucu belleği; oyuncu "Yanına al" ile değiştirirse yenisi geçerli).

## 3. Hedefler, hedef olmayanlar, anti-hedefler
Hedefler: ilerleme verisi Supabase'de, yalnız sunucu yazar; kurallar `game.js`'te saf ve testli; eşya modu kapalıyken oyun
bugünküyle birebir aynı; misafir (kayıt kapalı) oyuncu eşya modunda bedava eşya alır, ilerleme kazanmaz.
Hedef olmayanlar: para ile satın alma, takas, liderlik tablosu ("en çok kaybeden" yok kuralı), ses/WhatsApp özellikleri.
Anti-hedefler:
- **Kalıcı güç yok:** eşya maç içinde tek kullanımlık; çok oynayan yalnız "seçebilir", daha güçlü başlamaz.
- **Eşya rolü ele vermez:** etkiler rol yeteneklerinin aynısı değil, tek seferlik ve anonim duyurulur.
- **Oyuncu kendi bakiyesini yazamaz:** yıldız, envanter, kozmetik, rozet, kasa tabloları istemciye salt okunur.
- Gizli bilgi `P`'ye girmez: eşya sahipliği `R.g`'de, kişiye `privFor` ile.

## 4. Yaklaşımlar
| | A. Sunucu + RPC (seçilen) | B. İstemci PostgREST yazar (RLS) | C. Yalnız bellek (oda) |
|---|---|---|---|
| Güven | sunucu yazar, tek işlem RPC | istemci bakiyeyi yazabilir → hile | kalıcı değil |
| Tekrar ödül | (uye, oyun_id) PK ile idempotent | zor | — |
| Maliyet | yeni RPC'ler + sunucu çağrıları | az kod | en az |
Seçim A: ödül ve harcama sunucuda hesaplanır ve tek `mac_sonu` RPC'siyle yazılır; istemci yalnız okur ve satın alma için
sunucu ucunu çağırır. B hileye açık, C "geri getirme" amacını karşılamaz.

## 5. Tasarım

### 5.1 Katalog (`game.js`, tek kaynak)
- `ESYA` (5): `iksir` 🧪 gece, kendini bir gece saldırılara karşı korur (yıldırım/hayalet hariç, yelek gibi);
  `fener` 🏮 gece, evine gelenlerin adlarını öğrenirsin; `duman` 💨 gece, ziyaretin Gözcü/İzci/fener'e görünmez;
  `maske` 🎭 gece, Dedektif ve İspiyoncu seni Masum görür; `fis` 🗳️ oylama, oyun 2 sayılır.
- `KOZMETIK`: `sapka` (9 yeni: cicek, parti, kask, sef — sıradan; kovboy, korsan, cadi — nadir; tac, hale — efsanevi;
  mevcut 7 şapka ücretsiz kalır), `bayrak` (evin çatısında bayrak, 8: kirmizi, mavi, yesil, mor — sıradan; yildiz, ay —
  nadir; ejder, simsek — efsanevi), `efekt` (ölüm efekti, 4: yaprak — sıradan; yildiz, duman — nadir; havaifisek — efsanevi).
- `NADIRLIK`: `{siradan:{fiyat:12,donusum:3}, nadir:{fiyat:30,donusum:8}, efsanevi:{fiyat:80,donusum:20}}` (yıldız).
- `KASA` ağırlıkları: eşya 50, yıldız 12 (3–5), sıradan kozmetik 25, nadir 10, efsanevi 3. `kasaOdulu(rnd)` saf.
- `ROZETLER` (~14): `ilk_mac`, `mac_10`, `mac_50` (sayımı RPC yapar); günlükten (`rozetlerFor(R,id)`, saf):
  `kurtarici` (Doktor olarak birini kurtardın), `bekci` (Polis olarak bir haini tuttun), `tuzak_ustasi` (tuzağın birini
  yakaladı), `hain_zafer`, `masum_zafer` (masum olarak kazandın), `sag_kalan` (sona kadar yaşadın ve kazandın),
  `tek_kurt` (tarafsız tek başına kazandın), `hortlak_zafer`, `yildirim` (Büyücü doğru tahmin), `iksir_kurtardi`
  (iksirin seni kurtardı), `fener_gordu` (fenerin bir haini gördü). Oylar tek tek kaydedilmediği için oya dayalı rozet yok.

### 5.2 Eşya modu kuralları (`game.js`)
- Ayar: `R.settings.esya` (boolean, varsayılan `false`; `cleanSettings` korur). `P.settings.esya` herkese açık.
- `startGame(R, lobby, secenek)`: eşya modu açıksa her oyuncuya `R.g.esya[id]={key,kaynak,kullanildi:false}`;
  `secenek.esyalar[pubId]={key,kaynak}` (sunucu lobide belirler: envanterden seçilen ya da lobide çekilen bedava); eksik/geçersizse
  rastgele `kaynak:'bedava'`. Rol dağıtımından bağımsız (aynı çağrıda, roller ayrıca dağıtılır).
- Kullanım: gece `act{…, esya:true}` (gece eşyaları), oylama `vote{…, esya:true}` (`fis`; yalnız birine oy verildiyse
  sayılır). Sahibi değilse/kullanılmışsa/fazı uymuyorsa yok sayılır. Gece eşyası çözümde harcanır (tutulmuş olsan da evdesin).
- Etkiler `resolveNight`'ta: iksir saldırı adımında (yelek gibi, `sure` saldırılar hariç); duman ziyaret listelerinden düşer
  (Gözcü sayısı, İzci "evinden çıkmadı", fener); maske Dedektif grubunu ve İspiyoncu açıklamasını Masum yapar; fener sahibine
  not: "Fenerinle gördün: evine X, Y geldi" (yoksa "kimse gelmedi").
- Duyuru (anonim): sabah haberine "🧪 Bu gece biri iksir içti" (+ korumuşsa "…ve saldırıdan sağ çıktı"), "🏮 Bu gece biri
  fenerle bekledi", "💨 Bu gece kasabada duman vardı", "🎭 Bu gece biri maske taktı"; oylama özetine "🗳️ Biri oy fişi kullandı".
- Günlük: `gece_sonuc.esyalar=[{kim,key,etki}]` (her zaman var, boş dizi olabilir), `gunduz_sonuc.fis=kim|null`. Gizli
  (olaylar yalnız bitişte okunur). Gazete (maç sonu) en çok bir eşya kartı: etkili olan ilk kullanım, adıyla.
- `privFor`: `esya:{key,kullanildi}`. Maç sonu: `esyaKullanimi(R)` → `{pubId:{key,kaynak,kullanildi}}` (sunucu harcama için).

### 5.3 Veri (göç 008)
- Tablolar (RLS açık; `authenticated` yalnız **kendi** satırlarını okur; yazma yalnız service_role/RPC):
  `cuzdan(uye pk, yildiz int ≥0)`, `esyalar(uye, key, adet int ≥0, pk(uye,key))`, `kozmetikler(uye, key, kazanma, pk)`,
  `rozetler(uye, key, oyun_id, kazanma, pk(uye,key))`, `kasalar(uye, oyun_id, odul jsonb, zaman, pk(uye,oyun_id))`.
  `kozmetikler.key` biçimi `tur:anahtar` (ör. `sapka:tac`).
- `mac_sonu(p_uye, p_oyun, p_odul jsonb, p_rozetler text[], p_harcanan text, p_bonus int) → jsonb` (security definer,
  yalnız service_role): `kasalar`'a ekler; çakışırsa `{tekrar:true}` döner (idempotent); harcananı düşer (adet>0);
  ödülü uygular (eşya +adet; kozmetik zaten varsa `donusum` yıldıza çevrilir, `donustu:true`; yıldız ekler); bonus;
  rozetleri ekler + maç sayısı rozetleri (`kasalar` sayımı 1/10/50); döner `{odul, donustu, yildiz, yeni_rozetler}`.
- `kozmetik_al(p_uye, p_key, p_fiyat) → jsonb` (yalnız service_role): sahipse `{hata:'var'}`, bakiye yetmezse
  `{hata:'yildiz'}`, değilse düşer + ekler, `{ok:true, yildiz}`.
- `envanter_oku(p_uye) → jsonb` (yalnız service_role): `{yildiz, esyalar:{key:adet}, kozmetikler:[key]}`.
- `hesap_birlestir` yeni tabloları da taşır (eşya adetleri ve yıldız toplanır, kozmetik/rozet birleşir, kasalar taşınır).
- `test.sql` senaryo 14–17: yabancı/başkasının satırı görünmez, istemci yazamaz; `mac_sonu` idempotent + dönüşüm;
  `kozmetik_al` bakiye; birleştirme taşır.

### 5.4 Sunucu (`server.js`, `kayit.js`)
- `kayit`: `envanterOku(uye)`, `macSonu(uye,oyunId,{odul,rozetler,harcanan,bonus})`, `kozmetikAl(uye,key,fiyat)` (RPC; hata → null).
- Join: kayıtlı üye için arka planda `envanterOku` → `mem.envanter`; sokete `{t:'envanter', d}`; istenen görünüm
  (`mem.istenen={hat,bayrak,efekt}`) sahiplikle yeniden uygulanır. Görünüm doğrulaması: temel şapkalar herkese,
  diğerleri `mem.envanter.kozmetikler` içinde varsa. `join/look`'a `bayrak`, `efekt`, `esya` (taşınacak eşya) eklenir.
- `start`: eşya modu açıksa `secenek.esyalar` = üyelerin seçtiği ve envanterde adedi >0 olan eşya.
- Maç sonu (gameId başına bir kez, `skorIsle` gibi `flush` içinde): kayıtlı her oyuncu için `kasaOdulu` + `rozetlerFor` +
  `esyaKullanimi` (yalnız `kaynak:'envanter'` ve `kullanildi`) + bonus (kazandıysa 2) → `macSonu`; sonuç sokete
  `{t:'kasa', d}`; `mem.envanter` güncellenir (yeniden `envanterOku`).
- `POST /ben/al {key}` + `Authorization: Bearer <token>`: token doğrulanır, katalog fiyatı `game.js`'ten, `kozmetikAl`.
  IP başına dakikada 10. Kayıt kapalıysa 404.
- `GET /ben` → `sayfa/ben.html`. `/saglik` → `ilerleme:{kasa,hata}`.

### 5.5 İstemci (`index.html`, `sayfa/ben.html`)
- Lobi: ev sahibi için "🎒 Eşya modu" anahtarı (herkes görür); eşya modu açıkken kayıtlı oyuncuya "Yanına al" seçimi
  (envanterdekiler + "Rastgele"); görünüm seçimleri (şapka listesine sahip olunan premium şapkalar, bayrak, efekt).
  Seçimler `localStorage` (`kg_hat`, `kg_bayrak`, `kg_efekt`, `kg_esya`) ve `look`/`join` ile gider.
- Sahne: 9 yeni şapka çizimi (`beanInner`), evin çatısında bayrak (`drawHouse`), taze ölümde efekt parçacıkları.
  (Kullanıcı yeni görsel istedi; sahne kuralı istisnası.)
- Gece: "🧪 İksiri kullan" gibi tek düğme (açık/kapalı); oylama: "🗳️ Oy fişini kullan". Rol kartı yanında eşya rozeti.
- Son ekran: 🎁 kasa kartı (ödül ya da "zaten vardı → +N ⭐"), yeni rozetler.
- Giriş sayfası: "👤 Profilim" bağlantısı (kayıt açıkken). 📘 rehbere "Eşyalar" bölümü.
- `/ben`: istatistik (`oyuncu_ozet`), rozetler (hepsi; kazanılanlar renkli), eşyalar ve adetleri, koleksiyon (sahip olunan
  ve kilitli kozmetikler, nadirlik), yıldız ve **dükkân** (kozmetik al → `/ben/al`), **dolap** (giy → localStorage).

### 5.6 Ölçüm ve deneme
`denge.js`: eşya modu açık/kapalı, botlar her gece %30 olasılıkla eşyasını kullanır; masum kazanma ve ilk gece ölüm farkı
README'ye. kasaba-test'te botlarla deneme; göç 008 ekleme amaçlı (canlıyı etkilemez), sunucuda uygulanır.

## 5.7 Denetleyici sonrası kararlar (benim, kullanıcı "sormadan yap" dedi; 2026-10-26)
1. **Oy fişi asma eşiğine sayılmaz.** Asılmak için fiş hariç toplam ≥ 2 gerekir (Provokatör +2 kuralı aynen: en az bir gerçek oy
   üstüne); fiş yalnız sıralamada/eşitlik bozmada sayılır. Fiş sayım anında sahibi birine oy vermişse harcanır; çekimsere
   döndüyse harcanmaz.
2. **Envanter eşyası maç başında bellekte ayrılır** (`mem.envanter` adedi start'ta düşer: aynı odada rövanş iki kez kullanamaz);
   veritabanında `mac_sonu` ile düşülür (kullanıldıysa). Farklı odalarda aynı anda oynama ve maç sürerken birleştirme
   yarışı kabul edildi (seyrek; en kötü sonuç bir bedava kullanım).
3. **Duman yalnız bilgi çıktılarını gizler** (Gözcü sayısı, İzci, fener); tuzak/Polis etkilenmez; gizli günlük gerçek ziyareti tutar.
4. **Kasa toplamaya tavan:** kullanıcı başına 24 saatte en çok 20 kasa (`mac_sonu` sayar; aşınca `{tavan:true}`, ödül yok,
   kayıt yine yazılır); kasa yalnız en az bir gündüz oylaması yaşanmış maçta (`P.day ≥ 2` ya da bitiş oylamada). Birleştirmede toplama kalır.
5. **İksir + Doktor aynı kişi:** Doktor önce kurtarır (haber "Doktor kurtardı", rozet `kurtarici`); iksir yine harcanır, haber
   yalnız "biri iksir içti"; `iksir_kurtardi` yalnız iksir gerçekten koruduysa. Yelek aynı gece seçildiyse hak normal düşer;
   kurtarış önceliği Doktor > iksir > yelek.
6. **Gazetede fiş kullananın adı yazılmaz** ("biri oy fişi kullandı"); gece eşyalarında ad yazılır.
Ayrıca: `cleanSettings` boolean `esya`'yı korur; `kasalar` `oyunlar`'a bağlanmaz; maç başında üye kimliği `R` dışında sunucuda
(`room.uyeler[pubId]`) tutulur, kopmuş oyuncu da kasa alır; `act` her mesajda `esya` bayrağını taşır.

## 6. Builder'a bırakılanlar
Şapka/bayrak/efekt çizimlerinin ayrıntısı; `/ben` sayfa düzeni; rozet ikon ve metinleri; RPC iç SQL'i; test adları.
