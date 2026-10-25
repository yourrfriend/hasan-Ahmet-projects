# Kasaba Gecesi — Paket 1b: Hızlı iddia/tepki balonları ve rol rehberi

Tarih: 2026-10-25 · Dal: `gecmis` · Durum: denetleyici okuyacak; kullanıcı "Paket 1b ve Plan 5'i yap" dedi

Kaynak: kullanıcının dış asistanla hazırladığı Paket 1 belgesi, Özellik 1 (§4) ve Özellik 5 (§8). Paket 1a
(gazete, rövanş, skor) ve gecmis Plan 3–4 (kimlik, kayıt) bitti; gazete `iddia` kart türü için üretici bu pakette gelir.

## 1. Niyet ve neden

Tartışma telefonda klavye açmadan zor: kısa, sık kullanılan sözler ("Rolüm Doktor", "Can'dan şüpheleniyorum")
tek dokunuşla gitsin, herkese normal konuşma gibi görünsün. Rol iddiaları yapılandırılmış olarak kaydedilsin ki
maç sonunda gazete "Gün 2: Hasan Doktor olduğunu söyledi; o sırada Hain'di" diyebilsin — uydurmadan, kayıttan.
Rol rehberi oyun sırasında elin altında olsun; akışı durdurmasın; o maçın gizli dağılımını açmasın.

## 2. Hedefler, hedef olmayanlar, anti-hedefler

Hedefler:
- Tartışma fazında yaşayan oyuncuya 5 hızlı ifade: **Rolüm: [Rol]** · **[Oyuncu] hakkında şüphem var** · **Bu bilgi
  kesin değil** · **Beni koruyun** · **Bir açıklama yapacağım**. Sunucu metni kurar ve sohbete oyuncunun sözü olarak
  koyar (rozet yok, doğrulanmış görünüm yok; hain de masum da aynı menüyü görür).
- Rol listesi tüm rol kataloğudur, gizli dağılıma göre daraltılmaz (o maçta olmayan rol de iddia edilebilir).
- Sunucu sınırları: faz `talk`, sağ, gün eşleşir; **8 sn bekleme**, **gün başına 4** hızlı ifade; yeniden bağlanma
  sayacı sıfırlamaz; çift dokunma aynı ifadeyi iki kez üretmez (istemci anahtarı `n`).
- Olay kaydı: rol iddiası `iddia {kim, rol_iddia, gercek_rol, gercek_takim, algilanan_rol}` (o anki gerçek rol —
  sunucu kendi durumundan); diğer hızlı ifadeler ölçüm olarak `hizli {kim, k}` (içerik/hedef yok). Sohbet metni
  kaydedilmez (önceki karar).
- Gazete `iddia` kartı: iddia, maç sonundaki değil **iddia anındaki** rolle karşılaştırılır; Deli'nin sandığı rolü
  iddia etmesi blöf sayılmaz (Deli kartı zaten var); Hırsız'ın çalma öncesi/sonrası iddiaları kendi anındaki rolle.
- Rol rehberi: üst bardan açılan, oyunu durdurmayan çekmece: taraflar, roller (simge, ad, açıklama, kısa ipucu),
  genel dağılım kuralları (oyuncu sayısına göre; herkese açık), odanın süreleri.

Hedef olmayanlar: serbest sohbetten rol çıkarımı (NLP); ölülerin hızlı ifadesi (ölü sohbeti olduğu gibi kalır);
oylama fazında hızlı ifade (ilk sürüm yalnız tartışma); "erken veda", MVP vb.; Kupa/seyirci/İlk Gece (sonraki).

Anti-hedefler: gerçek rol, Deli bilgisi, gizli dağılım ağ paketinden sızar; limitler istemcide kalır; rehber
`priv`/`R.g` okur; hızlı ifade spam'i sohbeti ezer.

## 3. Kısıtlar

Mimari aynı (kurallar `game.js`, oda `server.js`, tek dosya istemci; gizli `R.g`; `KG_VER` artar); sabitler yalnız
`game.js` (`ROLES`'a `ipucu`); Türkçe, kısa; telefon yatay. Yapılandırılabilir değerler `game.js` sabitleri:
`HIZLI_BEKLE_MS=8000`, `HIZLI_GUN=4`.

## 4. Yaklaşımlar

| | Nasıl | Artı | Eksi |
|---|---|---|---|
| A | Yeni mesaj `hizli{k,rol?,hedef?,d,n}`; metni **sunucu** kurar, sohbete `{id,t,hizli:k}` satırı; iddia olayı sunucuda | Sınırlar ve kayıt sunucuda; istemci yalnız menü; metin tek yerde | Yeni protokol dalı |
| B | İstemci metni kurup normal `msg` yollar, `#rol:doktor` gibi işaret ekler | Sunucuya dokunmaz | Sınır/kayıt istemciye güvenir; işaret taklit edilir; anti-hedef |

**Seçim: A.**

## 5. Kararlar

### 5.1 Protokol ve kurallar (`game.js` `hizli(R,id,m)`, `server.js` `case 'hizli'`)

- Mesaj: `{t:'hizli', k:'rol'|'suphe'|'belirsiz'|'koru'|'aciklama', rol?, hedef?, d, n}`. `n`: istemcinin ürettiği
  kısa anahtar (çift dokunma/yeniden gönderim tekilleştirme; oyuncu başına son 20 anahtar tutulur).
- Doğrulama: `R.g` var, `P.phase==='talk'`, oyuncu sağ, `d===P.day`; `k` listeden; `rol` → `hasOwnProperty(ROLES)`
  (`deli` dahil; "Rolüm: Deli" de söylenebilir); `hedef` → sağ bir oyuncu, kendisi değil.
- Sınır: `R.g.hizli[id]={gun, n, son, anahtarlar:[]}`; `son` ile `clock()` farkı `< HIZLI_BEKLE_MS` → red `{kod:'bekle', kalan}`;
  `gun===P.day && n>=HIZLI_GUN` → red `{kod:'gun'}`. Red olunca sunucu `err soft` döner: "Biraz bekle (5 sn)" / "Bugünlük
  hızlı ifade hakkın bitti (4)". Yeniden bağlanma sayaçları etkilemez (`R.g`'de). Yeni gün sayacı sıfırlar; yeni maç
  `R.g` ile sıfırlanır.
- Sohbet satırı: `pushChat(R,{id,t,d,ts,hizli:k})`; metin (sunucu): `rol` → `🗣️ Rolüm: {ROLES[rol].n}`;
  `suphe` → `🤨 {ad} hakkında şüphem var.`; `belirsiz` → `🤷 Bu bilgi kesin değil.`; `koru` → `🛡️ Beni koruyun!`;
  `aciklama` → `📣 Bir açıklama yapacağım.` İstemci bu satırı normal satır gibi çizer (`hizli` yalnız hafif bir
  stil; rozet değil). Karakterin üstündeki balon da aynı metni gösterir (mevcut `bubbleAt`).
- Olay: `k==='rol'` → `logEv('iddia',{kim:id, rol_iddia:rol, gercek_rol:g.roles[id].key, gercek_takim:g.roles[id].team,
  algilanan_rol:g.roles[id].mad||null})`. Diğer k → `olay('hizli',{kim:id,k})` (ölçüm; hedef yazılmaz).

### 5.2 Gazete `iddia` kartı (`gazeteFor`, öncelik 2 — deli(0) → mudahale(1) → iddia(2) → bitiş)

- Her oyuncu için `iddia` olayları gün sırasıyla. Deli (`algilanan_rol` dolu) ve iddia == algılanan rol → kart yok
  (Deli kartı anlatır). Aksi halde son iddiayı o anki gerçek rolle karşılaştır:
  - Eşleşiyor: `🗣️ Gün {gun}: {ad} {Rol} olduğunu söyledi; doğruydu.`
  - Eşleşmiyor: `🗣️ Gün {gun}: {ad} {Rol} olduğunu söyledi; o sırada {GerçekRol}'dı.` (`ek(ad,'...')` gerekmez; rol
    adına ek yok — "o sırada Hain'di" yerine sabit "aslında rolü {GerçekRol} idi" biçimi: `… söyledi; o sırada rolü {GerçekRol} idi.`)
  - Birden çok farklı iddia: `🗣️ {ad} önce {Rol1}, sonra {Rol2} olduğunu söyledi; o sırada rolü {GerçekRol} idi.`
  Niyet atfı yok ("yalan söyledi", "kandırdı" yok). Özne = iddia sahibi (aynı özne kuralı geçerli). Hain kopyası
  rolleri (`polis` team imp) gerçek rol adıyla, takım eklenerek: "rolü Polis (Hain) idi" (`roleLabel`).

### 5.3 İstemci — hızlı menü

- Tartışma fazında, sağ oyuncuya sohbet giriş satırında **⚡** düğmesi (kalan bekleme varsa "⚡ 5"; gün hakkı bitince
  pasif, "0/4"). Dokununca küçük bir panel (`.hizli`, sohbet kutusunun üstünde): 5 düğme. "Rolüm" → rol ızgarası
  (20 rol: simge + ad, taraf rengi); "Şüphem var" → sağ oyuncu listesi (kendisi hariç). Seçim → `send({t:'hizli',…,n})`,
  panel kapanır. İstemci bekleme sayacını kendi tutar (gönderim anından 8 sn) ve `err soft`'u sohbet kutusunun
  üstünde 3 sn gösterir (sunucu yetkili; istemci yalnız gösterir).
- `n`: `Date.now().toString(36)+rastgele`; aynı dokunuştan iki gönderim olmaz (düğme tıklanınca 1 sn pasif).

### 5.4 Rol rehberi çekmecesi

- Üst barda (zamanlayıcının yanında, lobide de) **📘** düğmesi → sağdan açılan `.rehber` çekmecesi
  (`width:min(380px,52vw)`, kaydırılabilir, ✕ ile kapanır; oyun durmaz, taps on stage still work outside the drawer).
- İçerik (yalnız herkese açık veriler): Masumlar / Hainler / Tarafsızlar başlıkları; her rol: simge, ad, `desc`,
  `ipucu` (1 cümle: ne yapmalı, neyi kanıtlamaz; ör. İzci: "Birinin bir eve gitmesi tek başına hain olduğunu göstermez.").
  "Hain kopyaları" notu (Polis, Gözcü, İzci, Dedektif, Tuzakçı, İspiyoncu, Provokatör hain sürümüyle gelebilir).
  **Dağılım kuralları** oyuncu sayısına göre (`DAGILIM` ve `autoSetup` kuralları: hain sayısı, Deli 6+, saldırgan
  9+/12, pasif 9+, Doktor hep, Polis 5+ — bunlar genel kurallardır, gizli değildir); **bu odanın süreleri**
  (`P.settings`). Bu maçta hangi rollerin çıktığı zaten `P.roleList` ile açık (mevcut davranış, değişmez); rehber
  onu göstermez, gizli olan oyuncu–rol eşlemesine dokunmaz.
- `ipucu` metinleri `game.js` `ROLES`'a eklenir (tek kaynak); `kontrol.sh` sabit denetimi geçer.

### 5.5 Test

- `game.test.js`: `hizli` — faz/sağ/gün/`k`/`rol`/`hedef` doğrulama; 8 sn bekleme (`setClock`), gün başına 4, yeni günde
  sıfır, aynı `n` ikinci kez işlenmez; sohbet satırı metni; `iddia` olayı alanları (Deli'de `algilanan_rol`, Hırsız
  çaldıktan sonra `gercek_rol` yeni); `hizli` olayında hedef yok. Gazete: eşleşen/eşleşmeyen/çoklu iddia/Deli atlanır/
  Hırsız öncesi-sonrası/hain kopyası etiketi; sıra deli → mudahale → iddia.
- `server.test.js`: `hizli` yolu, `err soft` kodları, yeniden bağlanınca sayaç devam eder.
- `e2e.js`: tartışmada ⚡ → "Rolüm" → bir rol → diğer sekmede sohbette "🗣️ Rolüm: …" görünür; hemen ikinci dokunuş →
  "Biraz bekle" uyarısı; 📘 gece de açılır, içinde kendi rolü/`priv` verisi geçmez; telefon boyutunda taşma yok.

## 6. İnşaatçıya bırakılanlar

- Panel/çekmece CSS'i (mevcut `.ov`, `.pill`, `.custom` dili); rol ızgarasının telefon düzeni.
- `ipucu` cümlelerinin son hali (kısa, Türkçe, "neyi kanıtlamaz" vurgusu).
- `err soft` metinlerinin son sözcükleri.
