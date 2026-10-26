# İlerleme ve eşya modu — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her maç sonu kasa, günlükten rozetler, kişisel sayfa `/ben`, giyilen kozmetikler ve ev sahibinin açtığı eşya modu.

**Architecture:** Kurallar ve katalog `game.js`'te saf; ilerleme verisi Supabase'de (göç 008), yalnız sunucu RPC'lerle yazar;
sunucu join'de envanteri okur, maç sonunda `mac_sonu` çağırır; istemci lobi/sahne/son ekran ve `/ben` sayfası.

**Tech Stack:** Node `node:test`, Playwright e2e, Postgres 17 (Supabase imajı), PostgREST RPC.

**Spec:** `docs/superpowers/specs/2026-10-26-kasaba-gecesi-ilerleme-esya-design.md`

## Global Constraints
- Dal `ilerleme` (`main`'den). Her görev sonunda commit (İngilizce), `kontrol.sh` (istemcide `--e2e`).
- Eşya modu kapalıyken oyun bugünküyle aynı: mevcut testler değişmeden geçer (olay şeması testine yalnız `esyalar`/`fis` eklenir).
- Gizli bilgi `P`'ye girmez: `R.g.esya` `SECRET_KEYS`'e (`esya` anahtarı) eklenir; kişiye `privFor.esya`.
- İlerleme tabloları istemciye salt okunur (yalnız kendi satırı); yazma RPC (service_role).
- Sabitler `game.js`'te (katalog, nadirlik, ağırlıklar, rozetler); `index.html` ve `sayfa/ben.html` `KG_GAME`'den alır.
- `index.html` satır içi `//` yorum yok; `KG_VER` son istemci görevinde `2026-11-01a`.
- Değerler (spec): eşyalar `iksir, fener, duman, maske, fis`; nadirlik fiyat/dönüşüm 12/3, 30/8, 80/20; kasa ağırlıkları
  eşya 50, yıldız 12 (3–5), sıradan 25, nadir 10, efsanevi 3; kazanan bonusu 2 yıldız; `/ben/al` IP başına dakikada 10.

## Review Focus
1. Eşya modu kapalıyken hiçbir davranış değişmez (mevcut 133 test + e2e) → Task 2 ilk adım.
2. Aynı maç için `mac_sonu` iki kez çağrılırsa (flush tekrar, yeniden başlatma) ikinci kez ödül yok → Task 3 test.sql + Task 5 server testi.
3. Kayıtlı oyuncu sahip olmadığı premium şapkayı/eşyayı `look`/`join` ile gönderir → reddedilir (temele düşer) → Task 5.
4. Eşya kullanan oyuncu o gece ölür: kullanılmış sayılır mı? (Gece çözümünde harcanır → evet; kullanmadan ölürse harcanmaz) → Task 2 testi.
5. Hesap birleştirme: iki cihazdaki eşya adetleri ve yıldızlar toplanır, kasalar taşınır → Task 3 test.sql.

---

### Task 1: Katalog, kasa ödülü, rozetler (game.js, saf)
**Files:** `kasaba-gecesi/sunucu/game.js`, `test/game.test.js`.
**Interfaces (Produces):** `ESYA`, `KOZMETIK` (`{sapka:{key:{n,nadir}},bayrak:{…},efekt:{…}}`), `TEMEL_SAPKA` (= mevcut `HATS`),
`NADIRLIK`, `KASA`, `ROZETLER` (`{key:{n,ico,desc}}`), `kasaOdulu(rnd=Math.random) → {tur:'esya',key,adet:1}|{tur:'yildiz',adet}|{tur:'kozmetik',key:'sapka:tac',nadir}`,
`rozetlerFor(R,id) → [key]`, `kozmetikGecerli(tur,key,sahip:Set) → bool`.
- [ ] Testler: `kasaOdulu` sabit `rnd` dizileriyle her dalı döner; 10 000 çekimde oranlar ±%2; `rozetlerFor` için fixed oyunlarla
  kurtarici/bekci/tuzak_ustasi/hain_zafer/masum_zafer/sag_kalan/tek_kurt/hortlak_zafer/yildirim (eşya rozetleri Task 2'de);
  `kozmetikGecerli` temel şapka herkese, premium yalnız sahibine.
- [ ] RED → kod → GREEN; commit `Progression catalog: items, cosmetics, rarity, chest rewards, badges from the event log`.

### Task 2: Eşya modu kuralları (game.js) + hikâye
**Files:** `game.js` (`cleanSettings`, `startGame`, `act`, `vote`, `resolveNight`, `resolveVote`, `privFor`, `gazeteFor`, `esyaKullanimi`), `sayfa/hikaye.js`, `test/game.test.js`, `test/hikaye.test.js`.
- [ ] Test: eşya modu kapalı → `R.g.esya` yok, olaylarda `esyalar:[]`, `fis:null`.
- [ ] Testler (her eşya): iksir saldırıyı önler + haber; fener notu adları; duman Gözcü sayısından ve İzci'den düşer; maske
  Dedektif grubunu ve İspiyoncu açıklamasını Masum yapar; fiş oyu 2 sayar (skip'te etkisiz); kullanılan eşya tekrar
  kullanılamaz; kullanmadan ölen → `esyaKullanimi` `kullanildi:false`; `secenek.esyalar` geçersiz anahtar → bedava; gazete
  kartı adıyla; rozet `iksir_kurtardi`, `fener_gordu`; `privFor.esya`; `noLeak` (`esya` gizli).
- [ ] Hikâye: `gece_sonuc.esyalar` ve `gunduz_sonuc.fis` satırları (bitmiş oyunda adıyla).
- [ ] RED → kod → GREEN; commit `Item mode rules: potion, lantern, smoke, mask, ballot; anonymous announcements; story lines`.

### Task 3: Göç 008 (tablolar, RLS, RPC'ler, birleştirme) + test.sql
**Files:** `db/goc/008_ilerleme.sql`, `db/test.sql` (14–17), yerel Postgres tarifi (Plan kucukler-2).
- [ ] Senaryolar RED (yerel, 001–007): 14) U1 yalnız kendi `esyalar/kozmetikler/rozetler/kasalar/cuzdan` satırlarını görür,
  insert/update reddedilir; 15) `mac_sonu` ödül uygular, ikinci çağrı `{tekrar:true}`, sahip olunan kozmetik yıldıza döner,
  harcanan adet düşer, rozet ve `ilk_mac`; 16) `kozmetik_al` yetersiz bakiye/zaten var/başarı; 17) `hesap_birlestir` taşır ve toplar.
- [ ] Göç yaz → 17/17; `--yeniden` sırası; commit `db: migration 008 — progression tables, read-own RLS, mac_sonu/kozmetik_al/envanter_oku RPCs, merge`.

### Task 4: kayit.js ilerleme çağrıları
**Files:** `kayit.js`, `test/taklit-rest.js` (RPC uçları), `test/kayit.test.js`.
- [ ] Testler: `envanterOku`, `macSonu`, `kozmetikAl` doğru RPC gövdesi/başlıklar; hata/zaman aşımı → null + sayaç; ayarsız → null.
- [ ] RED → kod → GREEN; commit `kayit: progression RPC calls`.

### Task 5: Sunucu (envanter, görünüm doğrulama, eşya seçimi, maç sonu kasa, /ben uçları)
**Files:** `server.js`, `test/server.test.js`.
- [ ] Testler: kayıtlı join → `{t:'envanter'}` gelir; premium şapka sahibi değilse temele düşer, sahibiyse kabul (envanter
  geldikten sonra uygulanır); eşya modu + seçili eşya → `startGame` `esyalar` (adet 0 ise bedava); maç bitince her kayıtlı
  oyuncuya bir `macSonu` ve `{t:'kasa'}`; aynı gameId için ikinci flush çağırmaz; misafire çağrı yok; `POST /ben/al` token yok →
  401, fiyat katalogdan, kayıt kapalı → 404, IP sınırı; `/ben` sayfası 200; `/saglik ilerleme`.
- [ ] RED → kod → GREEN; commit `Server: inventory on join, owned-cosmetic validation, carried item, end-of-match chest, /ben endpoints`.

### Task 6: İstemci — lobi, sahne, gece/oylama düğmeleri, son ekran, rehber, giriş bağlantısı
**Files:** `index.html`, `test/e2e.js`.
- [ ] e2e: ev sahibi eşya modunu açar, herkes görür; gece eşya düğmesi gönderir (`act.esya`), sabah haberinde duyuru;
  oylamada fiş düğmesi; son ekranda kasa kartı (sahte `{t:'kasa'}` için sunucu taklidi ya da kayıt-açık e2e sunucusu);
  premium şapka seçimi envanterde varsa görünür; bayrak evde çizilir; giriş sayfasında "Profilim"; telefon 844×390 sığma.
- [ ] RED → kod → GREEN; KG_VER; commit `Client: item mode, cosmetics (hats, flags, death effects), chest card, profile link`.

### Task 7: `/ben` sayfası
**Files:** `sayfa/ben.html`, `server.js` yolu (`/ben`), `test/e2e.js` (sahte Supabase rotası).
- [ ] e2e: istatistik, rozetler (kazanılan/kilitli), eşyalar, koleksiyon, yıldız; dükkânda al → `/ben/al` çağrısı ve bakiye
  güncellenir; dolap "giy" → `localStorage kg_look`; kayıt kapalı/oturum yok notları.
- [ ] RED → kod → GREEN; commit `Profile page /ben: stats, badges, items, collection, shop, wardrobe`.

### Task 8: Ölçüm, belgeler, yayın
**Files:** `test/denge.js`, README, SKILL, DURUM, spec sonuç notu.
- [ ] `denge.js` eşya modu (`DAGILIM_ESYA=1`, botlar %30 kullanır); açık/kapalı karşılaştırma README'ye.
- [ ] Belgeler; `kontrol.sh --e2e`; taze inceleme (fable); düzeltmeler; göç 008 sunucuda (`uygula.sh` + `--test`);
  `kasaba-test`'e kur; botlarla deneme; commit.
