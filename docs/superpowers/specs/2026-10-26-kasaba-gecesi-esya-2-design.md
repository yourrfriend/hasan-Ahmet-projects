# Kasaba Gecesi — eşya sistemi 2: katmanlar, yeni eşyalar, meydan paketi (tasarım)

Tarih: 2026-10-26. Dal: `esya-2` (`ilerleme`'den; `ilerleme` henüz canlıda değil, ikisi birlikte `main`'e gider).
Önceki tasarım: `2026-10-26-kasaba-gecesi-ilerleme-esya-design.md` (kasa, rozet, `/ben`, eşya modu v1). Bu yazı yalnız
eşya modunu değiştirir; kasa/rozet/`/ben`/veritabanı aynen kalır.

## 1. Niyet
Eşya modunu "çoğu zaman boşa giden tek eşya"dan, maç boyunca konuşulan bir katmana çevirmek: nadirlik oyunda anlam kazansın
(kasa değerli olsun), her iki tarafa da yarayan eşyalar olsun, maç sırasında herkesin yarıştığı kısa anlar doğsun.

## 2. Kullanıcı kararları (brainstorm 2026-10-26)
- **Eşyayı şans belirler.** Rol öncesi, rastgele; rol gördükten sonra seçim **yok**.
- **Meydan paketi:** maç sırasında rastgele bir anda sahneye paket düşer, **ilk dokunanlar** alır, kısa sürede kaybolur.
- Kapan kişi gizli: **"biri kaptı"** duyurulur.
- Paketteki eşya sayısı **hayatta olan** oyuncu sayısına bağlı.
- Onaylanan önerilerim (ikinci geçişle): paket yalnız tartışma fazında, faz başına en çok 1, maç başına en çok 3; paketin
  içindeki eşya türü herkese görünür; herkes en çok 2 eşya taşır; paket eşyası envantere gitmez; üç katman (bedava havuz ve
  paket sıradan + ara sıra nadir, efsanevi yalnız kasadan); yeni eşyalar kum saati, pusula, zar, vasiyet, kilit; iksir pasif;
  maç sonunda kim ne kullandı açıklanır; tek anahtar (paketler eşya modunun içinde); **kilit Bombacı ve Seri Katil'i durduramaz**
  (Polis kuralıyla aynı, sessiz).

## 3. Hedefler, hedef olmayanlar, anti-hedefler
Hedefler: eşya modu kapalıyken oyun birebir aynı; kurallar `game.js`'te saf ve testli; veritabanı ve RPC'ler değişmez;
paket mekaniği sunucu saatiyle adil; yeni oyuncu için tek kural seti (rehber tek bölüm).
Hedef olmayanlar: eşya satın alma (dükkân kozmetik kalır), takas, ev sahibinin paketleri ayrı açıp kapatması, serbest metin
vasiyet, takım eşyası, gece/oylama fazında paket.
Anti-hedefler: kalıcı güç yok (paket eşyası maçla ölür); eşya rolü ele vermez (duyurular anonim); gizli bilgi `P`'ye girmez
(kim ne taşıyor `R.g.esya`, kim kaptı `R.g.paket.alanlar`; `P.paket` yalnız tür ve süre); "kapamadın/elin dolu" gibi geri
bildirimler yalnız kişiye.

## 4. Yaklaşımlar
| | A. Tek plan, `ilerleme` üstüne (seçilen) | B. İki plan (kurallar → paketler) |
|---|---|---|
| Kapsam | katmanlar + yeni eşyalar + iki yuva + paket + istemci, tek dal | önce kurallar, sonra paket ayrı dal |
| İnceleme | tek taze inceleme, tek kasaba-test turu | iki inceleme, iki deneme; paket parçası ayrı denetlenir |
| Bağımlılık | iki yuva, katman ve paket aynı listeyi kullanır, tek seferde tutarlı | ilk plan yarım kalan yer açıcı değişiklik taşır |
Seçim A (kullanıcı "sence" dedi, önerim kabul). Riskli parça (paket: zamanlayıcı + sahne) planın son görevleri; saf kurallar
önce.

## 5. Tasarım

### 5.1 Katalog (`game.js`, tek kaynak)
`ESYA[key]={n,ico,faz,nadir,desc,hedef?,pasif?}`. `faz`: `'night'|'talk'|'vote'|'pasif'`. `hedef:true` → gece hamlesinde ev
seçilir (`act.esyaHedef`). `pasif:true` → düğme yok, koşul oluşunca kendiliğinden harcanır.

| key | ad | faz | nadir | etki (tek kullanımlık) | duyuru (anonim) |
|---|---|---|---|---|---|
| `fis` | 🗳️ Oy fişi | vote | sıradan | oyun 2 sayılır; eşiğe sayılmaz (v1 aynı) | oylama özeti "🗳️ Biri oy fişi kullandı" |
| `kum` | ⏳ Kum saati | talk | sıradan | tartışma **30 sn** uzar; gün başına **bir kez** işler, ikincisi sessizce boşa gider (harcanmaz) | sohbete sistem satırı "⏳ Biri kum saatini çevirdi: +30 sn" |
| `pusula` | 🧭 Pusula | night, hedef | sıradan | sabah notu: "Pusula: X bu gece evinden çıktı / çıkmadı". Çıkış = `went[X]` var; tutulan/kilitli/dumanlı → "çıkmadı" | "🧭 Bu gece biri pusulaya baktı" |
| `zar` | 🎲 Zar | — | sıradan | elde tutulmaz: maç başında (lobi zarı) ya da kapıldığı anda (paket zarı) **rastgele bir nadir eşyaya** dönüşür; sonucu yalnız sahibi görür | yok |
| `iksir` | 🧪 İksir | pasif | nadir | **pasif:** `sure` olmayan bir saldırı sana gelirse Doktor'dan sonra, yelekten önce kendiliğinden harcanır ve seni kurtarır | yalnız tetiklenince "🧪 Bu gece biri iksir içti ve saldırıdan sağ çıktı" |
| `fener` | 🏮 Fener | night | nadir | v1 aynı | v1 aynı |
| `duman` | 💨 Duman | night | nadir | v1 aynı (Gözcü, İzci, fener, **pusula** görmez) | v1 aynı |
| `maske` | 🎭 Maske | night | nadir | v1 aynı | v1 aynı |
| `vasiyet` | 📜 Vasiyet | pasif | nadir | **pasif:** ölünce (gece ya da asılma) o günün gecesine ait özel notların (`notes` içinde `Gece N:` ile başlayanlar) ilk açık bloğa **adınla** düşer: gece ölümü → sabah haberi, asılma → oylama özeti. Not yoksa "📜 X'in vasiyeti boştu." Ölümle harcanır (envantere dönmez) | "📜 X'in vasiyeti: …" (ad açık; ölü zaten açıklanıyor) |
| `kilit` | 🔒 Kilit | night, hedef | efsanevi | hedef o gece `blocked`'a girer (hamlesi iptal; Polis tutması gibi, `L.tutulan`'a **girmez**). Hedef Seri Katil ya da Bombacı ise **etkisiz ve sessiz** (sahibine aynı "Kapıyı kilitledin: X" notu). Hedefe not: "Bu gece kapın kilitliydi, evden çıkamadın." | "🔒 Bu gece birinin kapısı kilitlendi" |

- `ESYA_KATMAN(nadir) → [key]`. **Bedava havuz** (lobide eşyasız oyuncuya) = sıradan + zar, düzgün dağılım (`fis, kum, pusula, zar`).
- **Kasa** eşya dilimi (`KASA.esya` %50 aynı) içinde katman: sıradan 50, nadir 40, efsanevi 10 (`KASA_ESYA`), katman içinde düzgün.
  Zar kasadan çıkmaz (kasa nadir verir).
- **Paket** içeriği: %75 sıradan (zar dahil), %25 nadir; efsanevi çıkmaz (`PAKET={sans:0.6, sure:5000, nadirP:0.25, maxMac:3}`).
- `fis`'in `donusum`/fiyatı yok (eşya satılmaz, yıldıza dönmez; v1 aynı).

### 5.2 İki yuva ve kullanım (`game.js`)
- `R.g.esya[id]` artık **dizi** (en çok `ESYA_YUVA=2`): `[{key,kaynak:'envanter'|'bedava'|'paket',kullanildi:false}]`. Lobi eşyası
  (v1 `secenek.esyalar[id]`, yoksa bedava çekiliş) ilk eleman; `zar` ise `startGame`'de nadir eşyaya çevrilir (`kaynak` korunur,
  `zar:true` işareti kalır; sahibine 1. gece notu "🎲 Zar: 🏮 Fener çıktı").
- Gece: `act{…, esya:key, esyaHedef?:id}`; `key` sahibinde, kullanılmamış, `faz==='night'`; `hedef:true` ise `esyaHedef` yaşayan
  oyuncu (kendisi dahil değil) yoksa yok sayılır. Gece başına bir eşya (tek `act.esya`). Çözümde harcanır (tutulmuş olsan da,
  v1 aynı). Eski `esya:true` kabul edilmez.
- Tartışma: yeni mesaj `esya{k:'kum', d, g}` → `G.esyaKullan(R,id,key)` → `true|false` (false = sessiz). `kum`: `R.P.ends+=30000`,
  `g.kumGun=P.day`, `pushChat(R,{sys:true,x:'⏳ Biri kum saatini çevirdi: +30 sn'})`, harcanır; aynı gün ikinci → `false`, harcanmaz.
- Oylama: `vote(R,id,v,d,gid,esya)` v1 aynı (`fis`).
- Pasif: iksir ve vasiyet için düğme yok; `privFor.esya[i].pasif=true`.
- Paket eşyası: `kap` ile eklenir (5.3). Yuva doluysa (`esya[id].length>=2`, kullanılmışlar da sayılır) `kap` `false`.
  Kullanılmış eşya yuva tutar (maç içinde yuva geri açılmaz: "kullan, sonra yine kap" ekonomisi istenmiyor).
- Maç sonu: `esyaKullanimi(R)` → `{id:[{key,kaynak,kullanildi}]}`; sunucu yalnız `kaynak==='envanter'&&kullanildi` olanı
  `mac_sonu p_harcanan` olarak verir (en çok bir tane olabilir: envanterden tek eşya gelir). Paket/bedava hiçbir zaman
  veritabanına yazılmaz.
- Ölüm: v1 kuralı "kullanmadan ölürsen geri döner" yalnız `envanter` kaynaklı eşya için anlamlı; vasiyet ölümle harcanır.

### 5.3 Meydan paketi (`game.js` + `server.js`)
- `setPhase(R,'talk')`: `g.paketSayisi<PAKET.maxMac` ve `rnd()<PAKET.sans` ise `g.paket={zaman,keys,alanlar:[],acik:false}`;
  `zaman = clock() + rnd()*(secs*1000*2/3)` (`secs` = `P.settings.talk`, animasyon payı hariç), `keys` o anda
  belirlenir (`n` = `alivePlayers(R).length>=8?2:1`, her biri bağımsız %75/%25 çekiliş), `alanlar:[]`, `acik:false`. Rastgele sayı
  `rnd` `G.setRnd(fn)` ile testte sabitlenir (`setClock` gibi; varsayılan `Math.random`).
- `tick`: tartışmada `g.paket&&!g.paket.acik&&clock()>=g.paket.zaman` → `acik=true`, `g.paket.ends=clock()+PAKET.sure`,
  `P.paket={key:keys[0], n:keys.length, ends}` (tür herkese açık; iki eşya hep **aynı tür**), `g.paketSayisi++`; `tick` →
  `true`. `clock()>=g.paket.ends` ya da herkes aldıysa (`alanlar.length===keys.length`) → kapanış: `P.paket=null`,
  `pushChat` sistem satırı "📦 Meydana 🏮 fener düştü — biri kaptı" / "— ikisini de kaptılar" / "— kimse kapmadı" (sayı: 0 → kimse,
  n=2 ve 1 alan → "biri kaptı", 2 alan → "ikisini de kaptılar"); `logEv(R,'paket',{key,n,alan:alanlar.length,alanlar})` (gizli
  günlük; `alanlar` kimlik taşır, bitişte okunur). `tick` şu anki "süre dolmadıysa false" kapısından **önce** paket kontrolü
  yapar (paket süresi faz süresinden bağımsız). Faz değişince açık paket kapanır (`setPhase` başında kapanış aynı yolla).
- `G.kap(R,id,d,gid)` → `true|false`: faz `talk`, `P.day===d`, `gameId===gid`, oyuncu yaşıyor, paket açık, `alanlar`'da yok,
  yuva boş, `alanlar.length<keys.length` → `alanlar.push(id)`, eşya eklenir (`kaynak:'paket'`; zar ise hemen nadir eşyaya,
  not "🎲 Zar: … çıktı"), `true`. Her başarısız durumda `false`, hiçbir yayın yok.
- Sunucu: `onMessage` `kap{d,g}` → `G.kap` → `true` ise `schedule(room)` (priv değişti). Gelen mesaj sırası sunucu sırasıdır;
  aynı soketten ikinci `kap` zaten `alanlar` ile düşer.
- Ölü/kopuk: `kap` `false` (yaşamıyor / mesaj gelmez). Kopuk oyuncunun şansı yanar (kabul).

### 5.4 Duyuru, günlük, gazete, hikâye
- Sabah haberi (`P.morning.news`): pusula "🧭 Bu gece biri pusulaya baktı", kilit "🔒 Bu gece birinin kapısı kilitlendi", iksir
  yalnız tetiklendiğinde, vasiyet "📜 X'in vasiyeti: Gece 2: …" (notlar `' · '` ile birleşir). Oylama özeti: vasiyet (asılma).
- `gece_sonuc.esyalar=[{kim,key,etki,hedef?}]`: pasif iksir `etki:'korudu'` ile girer (tetiklenmediyse girmez); kilit
  `etki:'kilitledi'|'durduramadi'`; pusula `etki:'cikti'|'cikmadi'`; vasiyet `etki:'okundu'` (ölen için). `gunduz_sonuc`:
  `fis` v1, `kum:boolean`, `vasiyet:{kim}|null`. Yeni olay `paket` (5.3). Olay alan şeması testleri güncellenir.
- Gazete (maç sonu, `gazeteFor`): v1 "en çok bir eşya kartı" kalır; aday sıralaması etkili olanlar önce (iksir korudu, kilit
  kilitledi, fener hain gördü, vasiyet okundu). Paket kartı: "📦 Maçta N paket düştü, K'si kapıldı" (kimlik yok) — ayrı kart
  türü `paket`, en fazla bir.
- **Maç sonu açıklama:** `P.ozet.oyuncular[].esyalar=[{key,kullanildi,kaynak}]` — herkes görür (fiş dahil mi? **Hayır:** 5.7.6
  "fiş kullananın adı yazılmaz" kalır → fiş `key:'fis'` için `kullanildi` yerine `gizli:true`). Son ekran oyuncu tablosunda
  "🏮 ✓ · 🧭 ✗" biçiminde. Kim paket kaptı burada da açıklanır (`kaynak:'paket'` görünür; "biri kaptı" maç içinde gizli, sonra açık).
- `hikaye.js`: yeni satırlar (pusula, kilit, kum, vasiyet, paket); bitmiş oyunda adla; fiş anonim (v1).

### 5.5 İstemci (`index.html`)
- `priv.esya` dizi. Gece: her eşya için `.ov.esya-cip` (en çok 2, alt alta); aktif gece eşyasında "kullan" düğmesi; `hedef:true`
  ise düğme "ev seç" moduna girer: bir sonraki ev dokunuşu `esyaHedef`, kendi evi kapalı; seçince çip "🔒 Kilit: Ahmet ✓",
  tekrar dokununca kaldırır. Pasifler "🧪 İksir · kendiliğinden" (düğmesiz). Rol kartı açıkken v1 gibi kapalı.
- Tartışma: `⏳ Kum saati` düğmesi (yalnız sahibinde, kullanılmamışsa); basınca `send({t:'esya',k:'kum',d,g})`, `local.kum=true`
  (priv gelince ✓). Oylama: fiş v1.
- Paket: `P.paket` varken sahnede meydan ortasında (`ringPos` merkezi) SVG grup: 📦 + eşyanın ikonu + ışık halkası, 5 sn boyunca
  küçülen çember (süre), kısa `tone` (iki nota). Dokunma: yaşayan oyuncuda `send({t:'kap',d,g})`; ölü/izleyici görür, dokunamaz.
  `P.paket` düşünce grup kaybolur; kapanış satırı sohbette (sistem satırı, `sys:true` → farklı stil). Sahne/animasyon
  bölümlerine dokunulmaz: paket `S_.fx` üstünde ayrı katman (`S_.paket`), render yalnız bu grubu günceller.
- Lobi: "Eşyan: 🎲 Zar" olabilir; açıklama "maç başında nadir bir eşyaya dönüşür". Dolap "Yanına al" v1.
- Son ekran: oyuncu tablosuna eşya sütunu (5.4). Rehber "Eşyalar": katmanlar (sıradan/nadir/efsanevi), 10 eşya tek satır,
  paket kuralı ("tartışmada meydana paket düşer, ilk dokunan alır, en çok 2 eşya taşırsın"). `KG_VER` artar.
- 844×390'da 12 oyuncuda paket, sohbet kutusu ve düğmelerle çakışmaz (e2e dikdörtgen testi, v1 çip testi gibi).

### 5.6 Ölçüm ve deneme
- `denge.js` `DAGILIM_ESYA=1`: botlar gece eşyasını %30 (hedefli eşyada rastgele yaşayan hedef), kum %30, fiş %30, paketi
  açıldığında %50 kapmayı dener (sırayla, `kap` sırası rastgele). Çıktı: eşya başına kullanım oranı, paket kapma oranı, masum
  kazanma ve ilk gece ölümü (v1 ile aynı tablo + eşya satırları). README'ye açık/kapalı/v1 karşılaştırma.
- e2e: eşya modu adımı genişler: iki çip; hedefli eşya ev seçimi → `act.esya/esyaHedef`; kum düğmesi → `P.ends` uzar + sohbet
  satırı; paket: sunucu tarafında `R.g.paket` zamanı 0'a çekilip tick ile açılır, ev sahibi dokunur → priv'de yeni eşya, sohbette
  "biri kaptı"; ikinci dokunuş etkisiz; telefon ölçüsü çakışma testi.
- kasaba-test'te botla gerçek maç (bot.js: paket mesajını görünce %50 `kap`).

## 5.7 Kararlarım (kullanıcı "sormadan yap"; denetleyici sonrası eklenir)
1. Paket iki eşya ise ikisi aynı tür (tek `P.paket.key`); tür açık, sayı açık, kalan sayı **açık değil** (kapma anı sızmasın).
2. Kullanılmış eşya yuvayı tutar; maç içinde yuva boşalmaz.
3. Zar lobide "🎲 Zar" görünür, sonucu rol kartıyla birlikte 1. gece notunda; paket zarı anında dönüşür.
4. Kum saati için `R.P.ends` uzatılır, `P.settings.talk` değişmez; istemci sayaç `P.ends`'ten okur (zaten öyle).
5. Vasiyet notları olduğu gibi (sistem metni; serbest metin yok); Deli'nin rastgele notu da okunur (eğlenceli ve zararsız).
6. Kilit `L.tutulan`'a girmez: `bekci` rozeti ve "Polis tuttu" gazete kartı yalnız Polis için.
7. **Hedefli eşya ziyaret değildir** (denetleyici sorusu): kilit ve pusula evden işler; sahibi `visits`/`went`'e girmez, Gözcü
   saymaz, İzci "çıkmadı" der, hedefin feneri görmez, tuzağa yakalanmaz. Sahibi tutulmuş/kilitli olsa da eşya işler (v1 gece
   eşyaları gibi; karşılıklı kilit döngüsü böylece yok). Çözüm adımı: 1. adımdan (tuzak/Polis) **önce**, `blocked`'a yazılır.
   Sahnede karakter yürümez; seçilen evin kapısına kilit/pusula simgesi (`S_.fx` izi gibi) çizilir.
8. **Vasiyet ölümden sonra yazılan bilgi notlarını da içerir** (denetleyici sorusu): notlar 7. adımda (ölüm haberleri) toplanır,
   yani gece öldürülen Gözcü/İzci/Dedektif/Polis'in o geceki sonucu sabah herkese açıklanır. Gerekçe: "ölürken son sözünü
   söylemek" eşyanın anlamı; bilgi rolünü öldürmek haine bir bedel getirir, nadir katmanda bu kabul edilebilir. Yanlışsa bedel:
   vasiyet fazla güçlü çıkar, ölçümde görülür ve toplama 5. adıma alınır (tek satır).

## 6. Builder'a bırakılanlar
Paket SVG çizimi ve ses; çip yerleşimi; test adları; `denge.js` çıktı biçimi; rehber metninin tam sözleri; hikâye satırlarının
tam metni; `KASA_ESYA`/`PAKET` sabitlerinin dosyadaki yeri (katalogun yanı).
