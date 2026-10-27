# Yıldız ekonomisi 1 — maç ödülleri ve e-posta bağlama (tasarım)

Tarih: 2026-10-27. Dal: `yildiz-1` (`main@13e00b8`). Kaynak: kullanıcıyla brainstorm (bu oturum).
Bütün iş üç parçadır; bu belge yalnız **1. parça**dır. 2. parça (kademeli başarılar) ve 3. parça (haftalık görev, seri, davet, vitrin, set) ayrı tasarım olacak.

## Amaç ve neden
Bugün yıldızın tek kaynağı maç sonu kasası (%12 ihtimalle 3–5 ⭐, kopya kozmetik dönüşümü) ve kazanana +2; ortalama ~1,5 ⭐/maç, efsanevi ev (80 ⭐) ~55 maç.
Kullanıcı yıldızın dört şeyi birden teşvik etmesini istiyor: **sık gelmek, iyi oynamak, arkadaş getirmek, koleksiyonun ilerlemesi**; ayrıca **e-posta bağlamanın özellikle teşvik edilmesini** (hesap tarayıcıya bağlı; tarayıcı verisi silinince yıldız, ev, geçmiş gider).

Hedef hız (tüm parçalar bitince): haftada 10 maç oynayan biri efsanevi eve ~4 haftada; haftada 3 maç ~8 hafta; 30 maç ~2 hafta (günlük 20 kasa tavanı keser). Bu parça tek başına maç başına ~1,5 → ~3 ⭐ civarına çıkarmalı; kesin sayılar denemeden sonra ayarlanır.

## Hedefler
1. Maç sonunda, kasa ve mevcut kazanma bonusuna ek olarak şu yıldızlar (oyun sunucusu hesaplar):
   | Kaynak | Miktar | Koşul |
   |---|---|---|
   | Kazanma | +2 (bugünkü) | kazananlar listesinde |
   | Tarafsız tek kazanan | +4 (kazanmanın **yerine**) | `team==='neu'` ve `TEK_KAZANAN` rolü, kazananlarda |
   | Rol başarısı | +1 / olay, **maç başına en çok +3** | Doktor kurtardı, Polis haini evde tuttu, tuzak yakaladı, Büyücü yıldırımı isabet etti (bugünkü `rozetlerFor` olaylarının rol olanları; eşya olayları — iksir, fener — **hariç**, onlar şans) |
   | Kalabalık maç | +1 | maç 8+ oyuncuyla başladıysa (`P.players.length>=8`) |
   | Asılan haine oy | +2 / gün | o gün oylamada asılan kişi **hain takımındaysa** (`g.roles[asilan].team==='imp'`, oylama anında) ve oyuncu o gün ona oy verdiyse ve oyuncu **masum tarafındaysa** (oylama anında `team==='inn'` ya da `mad`) |
   | Günün ilk maçı | +5 | oyuncunun bu takvim gününde (Europe/Istanbul) **ilk kasası**; veritabanı karar verir |
2. **E-posta bağlama ödülü**: bir kerelik **+25 ⭐ ve yalnız bağlı hesaplara verilen kozmetik "✉️ Mühürlü mektup" bayrağı** (`bayrak:mektup`, nadirlik `nadir`, dükkânda satılmaz, kasadan çıkmaz). Daha önce bağlamış mevcut oyuncular da alır (ilk bağlantıda/girişte).
3. **Hatırlatma** (bağlı değilse):
   - Maç sonu kasa kartının altında: "⭐ N yıldızın yalnız bu tarayıcıda. E-postanı bağla, kaybolmasın → (+25 ⭐ ve ✉️ bayrak)"; dokununca mevcut hesap bağlama akışı (6 haneli kod) açılır.
   - `/ben`'de dükkândan bir şey alınca aynı satır.
   - `/ben` üstünde **hesap güvenliği kartı**: üç adım "Oyna ✓ · Yıldız kazan ✓/☐ · E-posta bağla ☐" ve ödül metni; bağlıysa kart "Hesabın güvende ✓" olur ya da hiç görünmez (builder seçer, ama bağlıyken hatırlatma **asla** görünmez).
4. Kasa kartında yıldız dökümü yalnız o oyuncuya: "Kazandın +2 · Doktor kurtarışı +1 · Asılan haine oy +2 · Günün ilk maçı +5". Döküm satırları **veritabanına yazılmaz**.

## Hedef olmayanlar
Başarılar/sayaçlar (parça 2); haftalık görev, seri, davet ödülü, vitrin, set (parça 3); dükkân fiyatlarını veya kasa olasılıklarını değiştirmek; bağlı olmayana bir şeyi kapatmak (bu parçada kapanan bir şey yok — seri ve davet parça 3'te yalnız bağlılara açılacak).

## Anti-hedefler (çalışsa bile başarısızlık sayılır)
- **Oy gizliliği delinir**: kimin kime oy verdiği herhangi bir kalıcı yere (günlük `R.gameLog`, `kasalar`, `cuzdan` dışında yeni bir tablo/sayaç, sunucu logu) yazılırsa. Hain oyu ödülü yalnız bellekte hesaplanır; cüzdana **toplam** içinde girer; "doğru oy" adlı kalıcı sayaç **yok**.
- Ödül oyuncuyu kötü oynamaya iter: hayatta kalma ödülü, çekimser kalmayı ödüllendirme, rastgele oy atmayı kârlı kılma (bu yüzden hain oyu yalnız hain **asılınca**), hainin ortağına oy vererek kazanması (yalnız masum taraf).
- Utandırıcı ölçü ya da yanlış oya ceza.
- Bağlama ödülünün iki kez alınması (adres değiştirerek, hesap birleştirerek, iki cihazda).

## Sabit kısıtlar
- Oyun kuralları değişmez; kazanma, oylama, roller aynı. Oylar oyun sonunda da yalnız toplam görünür (kullanıcı kararı).
- Kimlik: anonim Supabase kullanıcısı = kayıtlı; bağlama yalnız e-posta + 6 haneli kod (şifre, Google, sihirli link yok).
- Veritabanı işlemlerini yalnız oyun sunucusu çağırır (`service_role`); istemci doğrudan RPC çağırmaz.
- Günlük 20 kasa tavanı ve "en az bir oylama" şartı kalır. Tavana ulaşıldığında **hiçbir yıldız verilmez** (bugünkü `p_bonus` davranışı).
- `index.html` ve `sunucu/*.js` uzun satırlar: satır içi `//` yorum yok. `KG_VER` artırılır.
- Supabase-js gömülü, CDN yok.

## Yaklaşımlar (kullanıcı A'yı seçti)
- **A (seçilen): Maç ödüllerini oyun sunucusu, günün-ilki ve bağlama ödülünü veritabanı verir.** Kurallar `game.js`'te saf fonksiyonda, birim testli; veritabanına oyuncu başına tek toplam gider (bugünkü `p_bonus`). "Bugün ilk mi" ve "bağlama ödülü bir kez" kararları cüzdan satırı kilidi altında veritabanında (birden çok oyun sunucusunda da doğru). Çok kullanıcıda yük oyun sunucusunda (çoğaltılabilir) kalır; veritabanına maç başına oyuncu başı bir çağrı (bugünkü kadar).
- B: Kuralları SQL uygular, sunucu ham olayları gönderir. Kurallar iki yerde yaşar, oylar ham olay olarak veritabanına gider (gizlilik), tek veritabanı darboğazı ağırlaşır. Reddedildi.
- C: Bağlama ödülü `auth.users` tetikleyicisiyle. Supabase iç şemasına bağımlı, sürüm yükseltmelerinde kırılgan, ödülü gösterecek an yok. Reddedildi.

## Kararlaştırılan nasıl
### Oyun kuralı (`sunucu/game.js`)
- Yeni saf fonksiyon `yildizDokumu(R, id) → [{key, adet}]` (örn. `{key:'kazanma',adet:2}`, `{key:'rol_basari',adet:1}`…); `rozetlerFor` ile aynı yerde, aynı günlük olaylarından. Toplam = satırların toplamı. Katalog `YILDIZ_KAYNAK` (anahtar → Türkçe kısa ad, miktar) tek kaynak; istemci de oradan okur.
- Hain oyu sayacı: `resolveVote` içinde, asılan hain ise o gün ona oy vermiş masum taraf oyuncuları için **`R.g`** içinde bellek sayacı (`g.hainOyu[id]++`). `R.g` hiçbir zaman istemciye ya da günlüğe gitmez. `logEv('gunduz_sonuc', …)` **değişmez**. Oy fişi (`fis`) kullanan da oy vermiş sayılır (fişin kendisi değil, oy sayılır; ek ödül yok).
- `KOZMETIK.bayrak.mektup = {n:'Mühürlü mektup', nadir:'nadir', renk:…, ico:'✉️', ozel:'bagla'}`. `ozel` alanı olan öğe: `kasaOdulu` havuzlarına girmez, dükkân satmaz (`/dukkan` 400), `/ben`'de fiyat yerine "E-postanı bağlayınca" yazar.

### Sunucu (`sunucu/server.js`, `kayit.js`)
- `ilerlemeIsle`: `bonus` artık `toplam(yildizDokumu(R,p.id))`; `kasa` mesajına `dokum` (satırlar) eklenir; RPC'nin döndürdüğü `gunun_ilki` (miktar) da karta gider.
- Bağlama ödülü: sunucu bir üyenin **bağlı** olduğunu öğrendiğinde (envanter okunurken veritabanı `bagli:true, bagla_odulu:false` döndürürse) `bagla_odulu(p_uye)` RPC'sini bir kez çağırır; başarılıysa üyenin soketlerine `{t:'baglaOdulu', d:{yildiz, kozmetik:'bayrak:mektup'}}` gönderir ve envanteri yeniler. İstemci kod doğrulaması `bagla` ile bitince sunucuya `{t:'envanterYenile'}` (ya da mevcut eşdeğeri) gönderir; böylece ödül hemen gelir. Mevcut bağlı oyuncular bir sonraki girişlerinde alır.

### Veritabanı (göç `010_yildiz_1.sql`)
- `mac_sonu`: kilit altındaki tavan sayımının yanında, **ekleme yapılmadan önce** "bu üyenin bugün (`Europe/Istanbul` takvim günü) kasası var mı" bakılır; yoksa ve tavan değilse cüzdana +5; dönüşe `'gunun_ilki', 5|0`. İmza değişmez (sunucu ve testler bozulmasın); miktar SQL'de sabit, `game.js`'teki `YILDIZ_KAYNAK.gunun_ilki` ile eşit olduğu test edilir.
- Yeni tablo `bagla_odulleri(uye uuid pk references uyeler, eposta_ozet text unique not null, zaman timestamptz default now())`; RLS açık, hiçbir role okuma yok (yalnız RPC).
- `bagla_odulu(p_uye uuid) returns jsonb`, `security definer`, yalnız `service_role`: `auth.users`'tan `p_uye`'nin e-postası okunur; e-posta yoksa ya da kullanıcı anonimse `{'hata':'bagli_degil'}`. Özet `encode(sha256(lower(email)::bytea),'hex')`. Cüzdan satırı kilitlenir; `uye` **ya da** `eposta_ozet` zaten varsa `{'tekrar':true}`; yoksa satır eklenir, cüzdana +25, `kozmetikler`'e `bayrak:mektup` (varsa dokunmaz). Dönüş `{ok, yildiz}`.
- `envanter_oku` dönüşüne `bagli` (e-posta var ve anonim değil) ve `bagla_odulu` (satır var) eklenir.
- `hesap_birlestir`: eski üyenin `bagla_odulleri` satırı varsa ve yeni üyenin yoksa yeniye taşınır (yoksa silinir); böylece "bir kez" kuralı birleştirmeden sonra da geçerli.
- `test.sql`'e senaryolar: günün ilki iki maçta yalnız birincide; tavanda günün ilki yok; bağlama ödülü ikinci çağrıda `tekrar`; aynı e-posta özetiyle başka üye `tekrar`; anonim/e-postasız `bagli_degil`; birleştirmeden sonra yeni üye tekrar alamaz; `bagla_odulleri` `authenticated` için okunamaz.

### İstemci (`index.html`, `sayfa/ben.html`)
- Kasa kartı: döküm satırları (Türkçe kısa adlar `YILDIZ_KAYNAK`'tan), günün ilki satırı, bağlı değilse hatırlatma satırı + bağla düğmesi.
- `baglaOdulu` mesajında tek seferlik kart: "✉️ Hesabın güvende! +25 ⭐ ve Mühürlü mektup bayrağı" (yeni eşya kartı gibi, `sessionStorage` ile tekrar etmez).
- `/ben`: hesap güvenliği kartı (üstte), dükkân satın almasından sonra hatırlatma, `ozel` öğelerde fiyat yerine kilit metni.

### Ölçüm
- `npm run denge` çıktısına "ortalama ⭐/maç (kasa hariç döküm)" ve kaynak başına ortalama eklenir; botlar oy verdiği için hain oyu ödülü de ölçülür.

## Builder'a kalanlar
Kartların görsel düzeni ve tam metinleri (kısa, Türkçe); `mektup` bayrağının rengi; döküm satırlarının sırası; testlerin dosya içindeki yeri; `envanterYenile` mesajının adı ya da mevcut bir mesajın yeniden kullanımı; hesap güvenliği kartının bağlıyken gizlenmesi mi "güvende ✓" mi göstermesi.

## Kararlarım (kullanıcının açıkça söylemediği, benim seçtiklerim)
- Rol başarısı maç başına en çok +3 (bir Doktor her gece kurtararak şişirmesin); eşya olayları hariç.
- Tarafsız tek kazanan +4 kazanmanın yerine (üstüne değil).
- Gün sınırı Europe/Istanbul takvim günü (24 saatlik kayan pencere değil: "bugün" oyuncunun anladığı şey).
- Bağlama kozmetiği bir bayrak (yeni ev çizimi gerektirmez); ileride bağlılara özel ev eklenebilir.
- Bağlama ödülü uye **ve** e-posta özeti başına bir kez.
