# Yıldız ekonomisi 3c — davet (tasarım)

Tarih: 2026-10-29. Dal: `yildiz-3-davet` (`main@797b984`). Parça 3 sırası: seri ✅ → haftalık görev ✅ → **davet** → set → vitrin.

## Amaç
Oyuncuların arkadaşlarını oyuna getirmesini ödüllendirmek. Ödül, gerçekten yeni bir kişi geldiğinde ve bu kişi gerçek olduğunu gösterdiğinde verilir; böylece sahte hesap açarak yıldız toplanamaz.

## Kararlar
### Kullanıcı kararları
- Davetin kaydını bir **davet kodu** tutar (yaklaşım A).
- Ödül davet edene **+30 ⭐**, gelen kişiye **+10 ⭐**.
- Bir davet şu iki koşul sağlanınca sayılır: gelen kişi **e-postasını bağlar** ve **en az 1 maç** oynar. İki koşulun sırası önemli değildir.
- Davet linki yalnız e-postası bağlı hesaplara açılır (1. parça kararı).

### Benim kararlarım
- Bir oyuncu en fazla 10 ödüllü davet alabilir.
- 3. ödüllü davette oyuncuya satılmayan "Dostluk bayrağı" verilir.
- Kodun biçimi.
- Davetin kaydı yalnız **yeni açılan** bir anonim hesapta tutulur.
- Gizlilik kuralı (aşağıda).
- Profil metinleri.

## Kod
- Her bağlı üyenin bir davet kodu vardır: 8 karakter, karışmayan harf ve rakamlardan (`davet_kodlari(uye pk, kod unique)`).
- Kod e-posta bağlanınca `bagla_odulu` içinde üretilir.
- Bugün zaten bağlı olan hesaplara kod göçte üretilir.
- Kod tahmin edilemez ve üye kimliğini dışarı sızdırmaz.

## Link
- Profilde bir **kişisel link** bulunur: `/?d=KOD`.
- Ev sahibi bağlıysa, lobideki oda linkine `&d=KOD` eklenir. Böylece bugünkü WhatsApp paylaşımı kendiliğinden davet olarak sayılır.
- Sayfa açılınca `d` değeri `localStorage` içinde `kg_davet` anahtarına yazılır. Böylece oturum açılmadan önce sayfa yenilense de kod kaybolmaz.

## Kayıt
- Tarayıcıda oturum yoksa sayfa `POST /hesap/anonim` ile anonim hesap açar. İstek gövdesi `{davet: KOD}` taşır.
- Hesap açıldıktan sonra sunucu `davet_kaydet(p_kod, p_yeni)` RPC'sini çağırır.
- `davetler(davet_edilen uuid pk references auth.users on delete cascade, davet_eden uuid references auth.users on delete set null, zaman, odul_zaman timestamptz)`.
- Şu durumlarda kayıt **yapılmaz**:
  - kod bilinmiyorsa,
  - kod davet edenin kendisine aitse,
  - yeni hesabın zaten bir kaydı varsa.
- Tarayıcıda oturumu zaten olan biri linke tıklarsa hiçbir şey yazılmaz. Davet yalnız yeni gelen kişiyi sayar.

## Ödül kontrolü: `davet_odul(p_yeni)`
- `mac_sonu` (kasa yeni eklendiyse ve tavan yoksa) ve `bagla_odulu` (ödül verildiyse) içinden, gelen kişinin cüzdan kilidi altında çağrılır.
- Ödül şu koşulların hepsi tutunca verilir:
  - kayıt var ve `odul_zaman` boş,
  - gelen kişi bağlı (`email` ve `email_confirmed_at` dolu),
  - gelen kişinin en az 1 gerçek, yani tavansız kasası var,
  - davet edenin ödüllü daveti 10'dan az.
- Ödül verilince:
  - gelen kişi +10 ⭐ alır,
  - davet eden +30 ⭐ alır,
  - `odul_zaman` doldurulur,
  - davet edenin ödüllü daveti 3'e ulaştıysa kendisine `bayrak:dostluk` verilir (`on conflict do nothing`).
- Tavana ulaşmış davet edenin davetleri yine kaydedilir; gelen kişi +10 ⭐'ını yine alır.
- Dönüş değerine `'davet', 10` eklenir: `mac_sonu` için kasa kartında, `bagla_odulu` için bağlama kartında gösterilir.
- Miktarlar `game.js` içindeki `YILDIZ_KAYNAK.davet = {n:'Arkadaş getirdin', adet:30, gelen:10, tavan:10, kozmetik:3}` tek kaynağındadır. SQL'deki sabitleri `game.test` bu kaynakla karşılaştırır (`bagla_miktar` kalıbı).

## Kozmetik
- `KOZMETIK.bayrak.dostluk = {n:'Dostluk bayrağı', nadir:'nadir', ico:'🤝', ozel:'davet'}`.
- Satılmaz: `/ben/al` `ozel` olanları zaten reddediyor; `kozmetik_al` içindeki satılmazlar listesine eklenir.
- Kasadan çıkmaz.
- Profil dükkânında "🤝 3 arkadaş getirince" yazar.

## Profil (`/ben`)
"👥 Davet" bölümü şunları gösterir:
- kişisel link ve "Linki kopyala" düğmesi,
- `Gelen: N · ödül alan: M/10`,
- ödül kuralının tek satırlık açıklaması.

Bağlı değilse bölümde yalnız "E-postanı bağla, davet linkin açılsın" yazar.

**Gizlilik:** davet eden, getirdiği kişilerin kim olduğunu **görmez**, yalnız sayıları görür. `davetler` tablosunu kimse okuyamaz. Sayılar `envanter_oku` ile ve profildeki bir RPC ile gelir.

## Lobi
Bağlı ev sahibinin oda linki `&d=` taşır; ekranda görünen fark yalnız link metnidir. Ev sahibi bağlı değilse link bugünkü gibi kalır.

## Hesap birleştirme (`hesap_birlestir`)
- Yeni hesap kodunu korur; eski hesabın kodu silinir.
- `davetler` kayıtlarında:
  - `davet_eden = eski` olanlar yeniye geçer,
  - eski hesap davetle gelmişse kaydı (`davet_edilen = eski`) yeniye taşınır; yeni hesabın zaten bir kaydı varsa eski kayıt silinir.
- Ödüllü davet sayısı en fazla 10 kalır; birleştirmede yıldız geri alınmaz.

## Gelen kişinin görmesi
`/?d=` ile açılan sayfada küçük bir not çıkar: "Bir arkadaşın seni davet etti: e-postanı bağla ve bir maç oyna, ikiniz de yıldız kazanın (+10 ⭐ sana)". Not yalnız ilk açılışta, yalnız yeni hesapta gösterilir.

## Göç
017/018 kalıbıyla **019**:
- tablolar,
- RLS: `davet_kodlari` için üye yalnız kendi satırını okur; `davetler` için kimseye okuma izni yok,
- `davet_kaydet`, `davet_odul`, `davet_sayilari(p_uye)` RPC'leri,
- `mac_sonu`, `bagla_odulu`, `envanter_oku` (`davet: {kod, gelen, odullu}`), `kozmetik_al`, `hesap_birlestir`,
- bağlı hesaplar için kod üretimi.

Eski kod uyumlu kalır: `mac_sonu` ve `bagla_odulu` imzaları değişmez; dönüşte yeni alan eski kodda yok sayılır.

## Hedef olmayanlar
- Davet edilenlerin adlarını göstermek.
- Davet liderlik tablosu.
- E-posta ile davet göndermek (davet yalnız link; CLAUDE.md kuralı).
- Var olan hesapların sonradan davete bağlanması.

## Yaklaşımlar
- **A (seçilen):** Davet kodu kişisel link ve oda linkiyle taşınır, kayıt anonim hesap açılırken tutulur. Ödül, iki koşulun ikincisi gerçekleştiğinde veritabanında, kilit altında verilir. Kimin davet ettiği doğru kaydedilir.
- **B:** Yeni oyuncu, ilk maçını oynadığı odanın ev sahibine yazılır. Elendi: yalnız ev sahibi ödül alır ve kimin gerçekten çağırdığı bilinmez.

## Testler
- `test.sql` 33–34:
  - kod üretimi,
  - kendi koduyla kayıt yapılamaması,
  - bilinmeyen kod,
  - iki koşulun her iki sırada da ödül vermesi,
  - aynı daveti iki kez ödüllememe,
  - 10'luk tavan,
  - 3. davette kozmetik,
  - tavan kasasının sayılmaması,
  - birleştirme,
  - RLS.
- `game.test`: SQL sabitleri, `ozel:'davet'`.
- `server.test`: `/hesap/anonim` isteğinin `davet` değerini RPC'ye geçirmesi; kasa mesajındaki `davet` alanı.
- e2e:
  - `?d=` notu ve `localStorage`,
  - anonim isteğin gövdesi,
  - bağlı ev sahibinin oda linkinde `&d=`,
  - profildeki Davet bölümü,
  - kasa kartındaki davet satırı.

## Builder'a bırakılan
- Kod alfabesi.
- Not ve kart metinlerinin son hâli.
- Profil CSS'i.
