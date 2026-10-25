# Kasaba Gecesi — Paket 1a: Kasaba Gazetesi, rövanş, Bu Akşamın Skoru

Tarih: 2026-10-25 · Dal: `gecmis` (canlı `sahne` birleştirildi) · Durum: denetleyici okudu, sorular inşaatçı kararıyla kapandı (§8); kullanıcı "Başla" dedi

Kaynak: kullanıcının dış asistanla hazırladığı "Birleştirilmiş Coding Agent Görev Belgesi" (Paket 1, beş
özellik). Bu tasarım Paket 1'in **oyun sonu üçlüsünü** kapsar: Özellik 2 (gazete), 3 (rövanş), 4 (oturum
skoru). Özellik 1 (hızlı iddia balonları) ve 5 (rol rehberi) ayrı tasarım/plandır (Paket 1b); gazetenin
"iddia ve gerçeklik" kart türü iddia kaydı gelince açılır.

## 1. Niyet ve neden

Bugün oyun bitince ekranda kazanan, herkesin rolü/akıbeti, "senin payın" ve ev sahibine "Tekrar oyna" var.
Eksik olan: maçın **hatırlanacak anları** (neden böyle bitti?), grubun **birlikte** yeni maça geçmesi (kim
hazır, kim gitti?) ve bu oturumda **kim kaç maç kazandı**. Hedef döngü: bir şey yaşadık → ne olduğunu
öğrendik → birbirimize takıldık → yeniden denedik. Bağlılık artışı ölçülecek bir hipotezdir.

## 2. Hedefler, hedef olmayanlar, anti-hedefler

Hedefler:
- Oyun sonunda "🗞️ Kasabada Bu Gece": en fazla 3 kart, yalnız motorun kesinleşmiş olaylarından, Türkçe
  şablonlarla, deterministik.
- "Rövanşa hazırım" / vazgeç; "8 kişiden 6'sı hazır"; kim hazır, kim kopuk, kim bekliyor görünür. Ev sahibi
  yalnız hazır **ve bağlı** 4–12 oyuncuyla başlatır; hazır olmayan lobide bekler, süren maça eklenmez.
- "Bu Akşamın Skoru": oda oturumu boyunca oyuncu başına oynanan/kazanılan maç; rövanş, ad değişimi, yeniden
  bağlanma ve ev sahibi devri sıfırlamaz.
- Ölçüm noktaları olay günlüğüne girer (`kayit.js` yuvası); içerik, oy ve rol bilgisi taşımaz.
- Normal tek maç deneyimi aynen kalır; kayıt sistemi olmasa da hepsi çalışır.

Hedef olmayanlar (Paket 1b ve sonrası):
- İddia balonları, rol rehberi, Kupa, Seyirci Dedektifi, İlk Gece modu, Supabase'e yazma (Plan 4), sayfalar.
- Skorun sunucu yeniden başlatmasına dayanması (odalar bellekte; Plan 4'te kayda da yazılır).
- "Erken veda" manşeti, MVP/teselli etiketleri.

Anti-hedefler:
- Süren maçın gizli bilgisi (rol, hamle, oy hedefi, Deli'nin gerçek rolü) herhangi bir yoldan sızar.
- Gazete kayıtta olmayan bir şey iddia eder ("herkesi kandırdı", "kurtardı" ama saldırı yoktu).
- Tek tek oylar herhangi bir yerde saklanır/gösterilir.
- Oyuncu yenilgiden kaçmak için iptal yolu bulur (kopmak iptal değildir; maç normal biterse sayılır).
- Çift başlatma iki maç üretir; hazır olmayan oyuncu sessizce maça girer.

## 3. Kısıtlar

- Mimari aynı: kurallar `game.js` (ağdan bağımsız), odalar `server.js` bellekte, tek dosya istemci. Gizli durum
  `R.g`; istemciye `P` ve `privFor`. SKILL.md "dokunulmaz kurallar" geçerli; `KG_VER` artar.
- Kazanma kuralları ve rol dengesi değişmez. Oyuncu kimliği `pubId` (gizli `kg_uid`'den türetilir); yeni
  kimlik sistemi yok.
- Türkçe, kısa metinler; telefonda yatay (844×390) taşma yok.
- Yapılandırılabilir değerler tek yerde (`game.js` sabitleri).

## 4. Yaklaşımlar

| | Nasıl | Artı | Eksi |
|---|---|---|---|
| A | Gazete, hazır durumu ve skor **sunucuda**: `game.js` gazete+kazananlar (saf fonksiyonlar, günlükten), `server.js` oda düzeyinde hazır kümesi ve skor; istemci gösterir | Tek doğruluk kaynağı, test edilebilir (`npm test`), istemci değiştirilse de kurallar geçerli, yeniden bağlanan aynı veriyi görür | `P`'ye üç alan daha |
| B | Gazete ve skor **istemcide** (`P.ozet`/`P.reveal`'dan), hazır durumu sohbet mesajıyla | Sunucuya dokunmaz | Her istemci farklı sayabilir; skor sayfa yenilenince gider; hazır sayacı tutarsız; "tek skor artışı" garantisi yok |
| C | Skor/hazır Supabase'de (Plan 3–4 öne alınır) | Kalıcı | Kimlik ve yazma yolu bitmeden yapılamaz; oyun Supabase'e bağımlı olur (anti-hedef) |

**Seçim: A.** B anti-hedefleri karşılamaz, C sırayı bozar. A'nın `P` alanları bitmiş maç ya da lobi/oturum
bilgisidir; gizli değildir.

## 5. Kararlar

### 5.1 Kazananlar listesi (tek kaynak)

`checkWin` kazananı belirledikten sonra **bir kez** `P.winner.kazananlar: [pubId]` üretir (`game.js`,
yeni saf fonksiyon `kazananlar(R,w)`):
- `inn`/`imp` zaferi: o takımdaki **tüm** katılımcılar (ölü, kopuk dahil). Takım, oyun sonundaki roldür
  (Hırsız çaldıysa yeni tarafı; Deli masumdur).
- `neu` tek başına zaferi: `w.who`.
- Hayatta Kalan: sağsa kazananlara eklenir (mevcut `survivors`). Hortlak: `hauntWins` içindekiler eklenir.
- `Kimse kazanamadı`: yalnız asılmış Hortlaklar (varsa); yoksa boş liste. (Hortlak asılınca kazanmıştır; §8.)
`bitis` olayına `kazananlar` alanı eklenir. Skor ve gazete bu listeyi kullanır, yeniden hesaplamaz.
Çelişki (kazanan katılımcı değil) `logEv('hata')` yerine test ile engellenir: `kazananlar ⊆ players`.

### 5.2 Kasaba Gazetesi

`gazeteFor(R) → [{tur, metin}]` (`game.js`, saf; `R.gameLog` + `R.g.roles` + `P.reveal`), `checkWin`
içinde `P.gazete` olarak yazılır; `ozetFor` gibi yalnız `end`'de var. Sabit `GAZETE_EN_COK=3`.

Kart türleri ve şablonlar (sıra: öncelik):
1. **Deli ifşası** (`deli`): `g.roles[id].mad` olan her oyuncu için: "🌀 {ad} aslında Deli'ydi; kendisine
   {gösterilen rol} rolü gösteriliyordu." (Deli'nin rolü oyun boyunca değişmez: Hırsız Deli'yi çalarsa Masum
   olur, Deli'nin kaydı `mad` kalır — metin yine doğrudur.)
2. **Gece müdahalesi** (`mudahale`), gerçekleşen olaylardan, her biri ayrı aday:
   - `kurtaranlar` kaydı: "💉 Gece {gun}: {doktor} bir saldırıyı önledi; {hedef} sağ çıktı." (`kurtaranlar`
     yalnız gerçek saldırı + etkili koruma olduğunda yazılır — mevcut davranış.)
   - `yelek`: "🦺 Gece {gun}: {ad} yelek sayesinde saldırıdan sağ çıktı."
   - `tuzak`: "🪤 Gece {gun}: {kuran}'ın tuzağı {kim}'i {ev} kapısında yakaladı." (birden fazlaysa adlar
     virgülle; Deli'nin tuzağı `gece_hamle`'ye yazılmadığı gibi `tuzak` listesine de girmez — mevcut.)
   - `tutanlar`: "👮 Gece {gun}: Polis {kim}, {hedef}'i evde tuttu."
   - Hortlak intikamı (`olenler[].sekil==='ghost'`): "🕯️ Gece {gun}: {hortlak} hayalet olarak döndü; {kim}
     mumun bedelini ödedi."
   - `caldi`: "🎭 Gece {gun}: {hirsiz} {kurban}'ın rolünü çaldı; artık {yeni_rol}."
   - `yildirim` (Büyücü doğru tahmin): "⚡ Gece {gun}: Büyücü {kim}'in rolünü doğru tahmin etti; yıldırım
     düştü." Yanlış tahmin (Büyücü öldü, `sekil==='bolt'` ve kim===büyücü): "⚡ Gece {gun}: Büyücü yanlış
     tahmin etti; yıldırım kendine düştü."
   - patlama (`olenler[].sekil==='bomb'`; günlükteki `bombalar` alanı o gece *koyulan* dinamitlerdir, patlama değil): "🧨 Gece {gun}: dinamitler patladı; {adlar} evleriyle uçtu."
3. **İddia ve gerçeklik** (`iddia`): Paket 1b'de; bu planda tür tanımlı ama üretici yok.
4. **Bitiş** (`bitis`, yalnız kart kalırsa): oyunu bitiren olay: son gündüz asılan ("⚖️ Gün {gun}: kasaba
   {ad}'ı gönderdi ve oyun bitti.") ya da son gece ölümleri ("🌙 Gece {gun}: {adlar} öldü ve oyun bitti.").

Seçim kuralı (deterministik): adaylar [tür önceliği, gün artan, günlük sırası] ile sıralanır; en çok 3 alınır;
**aynı oyuncu** iki kartta "özne" olursa ikincisi atlanır ve sıradaki aday gelir (tek aday kalırsa kural
gevşer). Aynı günlük aynı kartları üretir. Hiç aday yoksa gazete boş liste → istemci alanı göstermez.
Yargılayıcı sözcük yok; "kurtardı" yalnız `kurtaranlar` kaydı için, "önledi" biçiminde.

İstemci: `renderEndUI`'de kazanan satırının altına "🗞️ KASABADA BU GECE" kutusu, kart başına bir satır.
Mevcut özet ve payın aynen kalır. Yeniden bağlanan aynı `P.gazete`'yi görür (state'te).

### 5.3 Rövanş

Sunucu (`server.js`, oda düzeyi): `room.hazir: Set<pubId>`; `state.P.hazir: [pubId]` (`online` gibi).
- Yeni mesaj `{t:'hazir', v:true|false}`: **yalnız `P.phase==='end'`de**, odanın üyesi için kabul; aksi yoksayılır.
  `flush` ile yayılır. Lobideki normal "Oyunu başlat" değişmez (hazır kapısı yok; §8).
- Sıfırlama: `startGame` başarıyla çağrılınca `hazir.clear()`; oyun iptal (`cancel`) de temizler.
  Üye odadan kesin ayrılırsa (`leave`, lobide kopan üye silinir — mevcut) hazır kümesinden de düşer.
  Oyundaki oyuncu kopunca kaydı durur (mevcut) → hazır bayrağı durur ama **bağlı değilse başlatmaya sayılmaz**.
- Gösterge: son ekranda "N kişiden M'si hazır" (N = odanın üyeleri: oyundaki oyuncular + lobideki
  üyeler; ayrılanlar yok). Oyuncu satırlarında: ✅ hazır · ⏳ bekliyor · 📵 kopuk.
- Başlatma: **mevcut "Tekrar oyna" akışı genişletilir**: ev sahibi son ekranda "Rövanşı başlat (M hazır)"
  görür; `{t:'start', rovans:true}`: sunucu `lobbyOf(room)`'u **hazır ∧ bağlı** üyelere daraltır (başlatan ev sahibi
  hazır sayılır: düğmeye basması hazır olmasıdır; §8); 4–12 değilse
  `err soft` "Rövanş için 4–12 hazır oyuncu gerekir (şu an M)." Lobiye dönmeden doğrudan yeni maç başlar
  (`startGame` yeni `gameId`); hazır olmayanlar/kopuklar odada kalır, `P.players` dışında olduğu için izleyici
  gibi lobi/oyun durumunu görür (mevcut izleyici davranışı; `EMPTY_PRIV`). Ev sahibi "Lobiye dön"ü de
  (mevcut `cancel`) kullanabilir.
- Çift başlatma: `start` yalnız `phase∈{lobby,end}` iken ve `startGame` eşzamanlı olmayan tek süreçte
  çalışır; ikinci istek `phase==='night'` görür ve düşer. Eski maçın gecikmiş `act/vote` zaten `d`/`gameId`
  ile reddedilir (mevcut; test eklenir).
- Ev sahibi devri `room.hazir`'a dokunmaz. Yeniden bağlanan `P.hazir`'dan kendi durumunu görür.
- Yeni maç sıfırlaması zaten `startGame`'de (`R.g` yeniden kurulur, `P` yeniden yazılır); `P.gazete`,
  `P.ozet`, `P.winner` yeni `P`'de yoktur. Oda ayarları (`R.settings`) ve `room.skor` korunur.

### 5.4 Bu Akşamın Skoru

`room.skor: Map<pubId,{ad, oynadi, kazandi}>`, `room.skorIslenen: Set<gameId>`; `state.P.skor: [{id, ad,
oynadi, kazandi}]` (kazandı azalan, sonra ad). Oturum = oda nesnesinin ömrü; oda silinince gider.
- Tek fonksiyon `skorIsle(room)`: `P.phase==='end' && P.gameId && !skorIslenen.has(gameId)` ise işler; `flush`
  başında **ve** `start`/`cancel` işlenmeden önce çağrılır (oylama → flush arasındaki 40 ms'de ev sahibi başlatırsa
  skor kaçmasın; §8): her `P.players` için
  `oynadi++`; `P.winner.kazananlar` içindekiler `kazandi++`; `skorIslenen.add(gameId)`. Tek süreç, tek nokta
  → idempotent. İptal (`endToLobby` süren oyundan) skor işlemez (phase `end` olmaz).
- Ad: son bilinen ad (`look` ile değişirse güncellenir); kimlik `pubId`.
- Gösterim: son ekranda ve lobide küçük tablo "Bu akşam: Ece 3/5 · Hasan 2/5 · Ahmet 2/4" (kazandı/oynadı).
  Yüzde, sıra numarası, "kaybeden" etiketi yok. Tek maç oynandıysa da gösterilir (1/1).
- `bitis` olayına `kazananlar` zaten girer; ayrıca `kayit` için `skor` olayı gerekmez (günlükten türetilir).

### 5.5 Ölçüm olayları (`logEv`, `kayit.js` yuvasına akar; Plan 4'te veritabanına)

- `son_ekran_goruldu {kim}`: istemci `{t:'gordum'}` yollar (end fazında, kişi başı bir kez; sunucu tekilleştirir).
- `hazir {kim, v}`; `rovans_basladi {onceki_gameId, oyuncular:[id]}` (yeni maçın `baslangic` olayına
  `rovans:true, onceki:gameId` alanı).
- `ayrildi {kim, gun, faz, olu:bool, saniye_once_oldu}`: oyundaki oyuncunun soketi kopup EMPTY/HOST süresi
  beklenmeden `leave` yoksa — oyundaki oyuncu kopunca kaydı durduğu için "ayrılma" = kopuş; `kopus {kim,
  gun, faz, olu}` olarak yazılır (dönüş `dondu {kim}`). Erken elenen ayrılma oranı bu ikisinden türetilir.
İçerik yok: sohbet, oy hedefi, rol, hamle bu olaylarda geçmez. Bu olaylar `R.log`'a girer ama oyun sürerken
`gameLog` dışı tutulmaz (günlük zaten gizli; `SECRET_KEYS`).

### 5.6 Arayüz (istemci)

- Son ekran: kazanan → **gazete** → özet → payın → **skor tablosu** → **rövanş bloğu**: "Rövanşa hazırım" /
  "Vazgeç" (kendi durumu), "8 kişiden 6'sı hazır", oyuncu çipleri (✅/⏳/📵), ev sahibine "Rövanşı başlat
  (6 hazır)" (4'ten azsa pasif, nedeni altında) ve "Lobiye dön". Ev sahibi olmayana "Ev sahibi başlatınca
  oyun başlar."
- Lobide skor tablosu (varsa); hazır çipleri yalnız son ekranda.
- Telefon yatay: son ekran kaydırılabilir (`.endcard` zaten `overflow:auto`), düğmeler alt sabit değil, içerikte.
- Metinler Türkçe, kısa. `KG_VER` artar.

### 5.7 Test

- `game.test.js`: `kazananlar` (takım zaferi ölüleri kapsar, Hırsız çalınca yeni takım, Deli masum, Hayatta
  Kalan eklenir, Hortlak eklenir, kimse kazanmadı boş); `gazeteFor` sabit senaryolarla (deli kartı, doktor
  kurtaranlar var/yok — engellenmiş doktor kart üretmez, yelek, tuzak, hırsız, yıldırım iki yön, patlama,
  bitiş kartı yalnız boşluk varsa, en çok 3, aynı günlük aynı sonuç, aynı özne tekrarı), `noLeak` oyun
  sürerken `gazete`/`kazananlar` yok.
- `server.test.js`: hazır mesajı yalnız end/lobby; `start rovans` 3 hazırla reddeder, 4 ile başlar, hazır
  olmayan rol almaz ve `EMPTY_PRIV` alır; kopuk hazır sayılmaz; iki ardışık `start` tek maç; eski `gameId`
  ile `act` reddedilir; skor: bir kez işlenir (iki flush), kopuk oyuncu paydada, kazanan ölü oyuncu `kazandi`
  alır, iptal sayılmaz, ad değişince ad güncellenir, host devri skoru/hazırı korur; `gordum` tekil.
- `e2e.js`: maç sonu ekranında gazete kutusu (varsa), hazır bas → sayaç "4 kişiden 1'i", ev sahibi 1
  hazırla başlatamaz; mevcut akış bozulmaz. Telefon boyutunda ekran görüntüsüne bakılır.

## 6. İnşaatçıya bırakılanlar

- Gazete metinlerinin son söz dizimi ve emoji seçimi (şablon anlamı yukarıda sabit).
- Skor tablosunun ve hazır çiplerinin CSS'i (mevcut `.endcard`, `.tag` dili).
- `flush` içinde skor işleme ile `bosalt` sırası (günlük önce boşalır; skor günlükten bağımsız).
- `kopus/dondu` olaylarının `detach`/`onJoin` içindeki tam yeri.

## 7. Kaynak belgeyle farklar (rapor)

- Tanıtımda "rolleri elle seçebilir" yazıyor; kodda elle rol seçimi **yok** (yalnız `autoSetup`); `ui.custom`
  avatar seçimidir. Tanıtım düzeltilecek. Dolayısıyla "geçersiz manuel rol seti" senaryosu uygulanamaz.
- Hırsız: kodda çelişki yok (§ önceki mesaj): çalmadan önce tek başına kazanır, çalınca yeni tarafıyla.
- Belge "ayrılan üyeler hazır sayacından çıkar, geçmiş skorları silinmez" — oynadığı maçlar skorda kalır (evet).

## 8. Denetleyici soruları ve inşaatçı kararları

1. Hazır kapısı lobideki "Oyunu başlat"a uygulanmaz; `hazir` yalnız `end` fazında kabul edilir, lobide çip yok. Normal
   tek maç akışı aynen kalır. — Yanlışsa maliyet: ilk maçta "hazır" hissi yok; sonra eklenebilir.
2. "Rövanşı başlat"a basan ev sahibi hazır sayılır (`hazir ∪ {host}`); M sayacı ve 4 eşiği onu içerir.
3. Ölçüm olayları `oyun: P.gameId` damgası taşır (tüm `logEv` kayıtlarına üst düzey `oyun` alanı eklenir; DURUM'daki
   ertelenmiş "olaya gameId damgası" bulgusu böylece kapanır). `hazir`/`son_ekran_goruldu` bitmiş maçın `gameId`'siyle
   yazılır; lobide hazır kabul edilmediği için oyunsuz olay yoktur. `kopus/dondu` yalnız oyun sürerken.
4. Asılmış Hortlak her bitişte kazananlardadır ("Asıldın, kazandın!"); "kimse kazanamadı" yalnız o yoksa boştur.
5. Patlama kartı `olenler[].sekil==='bomb'`'dan; `skorIsle` `flush`+`start`+`cancel` öncesi.
