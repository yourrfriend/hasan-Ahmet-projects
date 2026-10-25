# Geçmiş 4/6 — Kayıt yazma: olay günlüğü ve maçlar Supabase'e

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kayıtlı bir ev sahibinin başlattığı her maç `oyunlar`/`oyun_oyunculari`/`olaylar`'a, kasabası `kasabalar`/`kasaba_uyeleri`'ne yazılır; Supabase kapalı/yavaşken oyun hiç etkilenmez; servis yeniden başlayınca yarım kalan "devam" oyunları iptal olur.

**Architecture:** `game.js` maça bir uuid (`P.oyunId`) verir ve `bitis` olayına oyuncu başına kapanış alanlarını ekler (`rol_key, takim, deli_gibi, calinan_rol, sag, olum_gunu, olum_sekli`). `kayit.js` tek sıralı arka plan kuyruğuyla PostgREST'e yazar (`fetch`, `service_role`): `baslangic` → kasaba bul/kur + üyelik + `oyunlar` + `oyun_oyunculari`; her olay → `olaylar` toplu insert; `bitis`/`iptal` → `oyunlar` ve `oyun_oyunculari` güncelle. Misafir ev sahibi → o maç için **hiçbir şey yazılmaz** (§5.3). Başarısızlıkta artan aralıkla yeniden deneme (5xx/ağ), 4xx'te düşür ve logla; kuyruk 10 000 olayı aşarsa en eskiyi düşür. Açılışta 3 saatten eski `devam` oyunları `iptal` yapılır. `server.js` `kuyrukla(room, olaylar)`'a dokunmaz (zaten her flush'ta çağırıyor); yalnız `room.members` üzerinden `uye` eşlemesi kuyruğa gider.

**Tech Stack:** Node 20 (`fetch`, `crypto.randomUUID`, `node:test`), PostgREST (`Prefer: resolution=merge-duplicates|ignore-duplicates`, `return=representation`, `PATCH ?id=eq.`), mevcut şema (`db/goc/001–005`, değişiklik yok), Playwright/bot denemesi.

**Spec:** `docs/superpowers/specs/2026-10-24-kasaba-gecesi-gecmis-design.md` §5.3 (kasaba), §5.4 (şema/olaylar), §5.5 (yazma yolu), §5.9, §6 aşama 4. Postgres kuralları: `supabase-postgres-best-practices` (batch insert, upsert, en az yetki — yazma yalnız service_role).

## Global Constraints

- `game.js` Supabase'i bilmez; `server.js` SQL bilmez; `kayit.js` hiçbir zaman beklemez/fırlatmaz.
- Tek tek oylar hiçbir yere yazılmaz (`gunduz_sonuc.toplamlar` zaten toplam); sohbet, notlar, ölü sohbeti yazılmaz.
- Olay sırası: kuyruk oyun başına sıralı; `olaylar(oyun_id, sira)` birincil anahtar — aynı olay iki kez gönderilirse `ignore-duplicates` ile çakışma hatası olmaz (yeniden denemede güvenli).
- `P.oyunId` uuid herkese açık (Plan 5'te `/oyun/<id>` linki); gizli değil. `P.gameId` (zaman damgası) olduğu gibi kalır.
- Kasaba yalnız kayıtlı ev sahibi için ve maç **başlarken** kurulur; adı `"<Ad>'ın Kasabası"` (`ek(ad,'in')` ile: "Ece'nin Kasabası").
- kasaba-test oyunları `kurulum='kasaba-test'` ile ayrışır; canlıda `SUPABASE_*` yokken hiçbir istek yok.
- Testler: `kontrol.sh` (her görev), `--e2e` (istemci dokunulmazsa gerekmez; Task 6 bot denemesi gerçek sunucuda).

## Review Focus

1. **Misafir ev sahibi:** maç için tek bir istek bile gitmez (kasaba, oyun, olay). → Task 3 testi.
2. **Supabase 5xx/ağ hatası:** olaylar düşmez, artan aralıkla yeniden denenir, sıra bozulmaz, oyun akışı etkilenmez; 4xx (ör. FK) → o yazım düşer ve loglanır, kuyruk ilerler. → Task 2/3 testleri.
3. **Yeniden başlatma:** bellekteki kuyruk gider; açılışta 3 saatten eski `devam` oyunları `iptal`; yeni oyunlar yeni uuid ile sorunsuz. → Task 4 testi.
4. **İptal (lobiye dön / oda silme):** `oyunlar.sonuc='iptal'`, `bitis` dolu; `oyun_oyunculari` rol alanları null kalır (hikâye görünür ama rol açıklanmaz). → Task 3 testi.
5. **Rövanş:** her maç ayrı uuid, aynı kasaba; `rovans_basladi` ve `baslangic.onceki` olaylarda. → Task 3 testi.

---

### Task 1: `game.js` — `P.oyunId` ve `bitis` olayında oyuncu kapanış alanları

**Files:**
- Modify: `kasaba-gecesi/sunucu/game.js` (`startGame` ~122: `oyunId`; `checkWin`/`logEv('bitis')` ~300; yeni `kapanisFor(R)`)
- Test: `kasaba-gecesi/sunucu/test/game.test.js`

**Interfaces:**
- Produces: `P.oyunId` (uuid v4, `crypto.randomUUID` — Node ve tarayıcıda var; yoksa `'u-'+gameId`); `logEv` kayıtlarında `oyunId`; `bitis.veri.oyuncular: [{id, rol_key, takim, deli_gibi, calinan_rol, sag, olum_gunu, olum_sekli}]` (`takim`: oyun sonundaki; Deli `inn`; `calinan_rol`: Hırsız çaldıysa `'hirsiz'`→yeni rol anahtarı değil, `orig==='hirsiz'` ise çalınan `rol_key`; `olum_*` `ozetFor`'daki `olum` haritasından).

- [ ] **Step 1: Failing test** `test('oyunId her maçta yeni uuid; bitis olayında oyuncu kapanış alanları')`: `fixed(...)` → `P.oyunId` `/^[0-9a-f-]{36}$/`, ikinci `startGame` farklı; masumlar kazanır senaryosunda `bitis.veri.oyuncular` by id: hain `{rol_key:'hain',takim:'imp',sag:false,olum_gunu:1,olum_sekli:'asildi'}`, gece ölen masum `{olum_sekli:'stab',olum_gunu:1}`, deli `{rol_key:'deli',takim:'inn',deli_gibi:'doktor'}`, rol çalmış Hırsız `{rol_key:'doktor',takim:'inn',calinan_rol:'hirsiz'}` (karar: `rol_key` oyun sonundaki anahtar, `calinan_rol` = `orig` işareti). Ayrıca her `logEv` kaydı `oyunId` taşır (`iptal` olayı `endToLobby` içinde `P` sıfırlanmadan yazıldığı için dolu gelir); `noLeak(P)` oyun sürerken geçer (`oyunId` açık bilgidir).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; `kontrol.sh` ✓. **Step 5: Commit** `Kasaba Gecesi: match uuid and per-player closing fields in the bitis event`.

### Task 2: `kayit.js` — kuyruk, PostgREST yazıcı, yeniden deneme

**Files:**
- Modify: `kasaba-gecesi/sunucu/kayit.js` (`olustur(opts)`; `kuyrukla(room, olaylar)` artık kuyruğa iş ekler)
- Test: `kasaba-gecesi/sunucu/test/kayit.test.js` (taklit PostgREST: `GET/POST/PATCH` yollarını ve gövdeleri kaydeder, programlanabilir hata)

**Interfaces:**
- Consumes: `room.members` (`get(pubId).uye`), `room.code`, `room.game.P.oyunId`, olaylar (`sira, gun, faz, tur, veri, oyun`), `opts.kurulum`.
- Produces: `kuyrukla(room, olaylar)` (senkron; iş kuyruğuna `{oyunId, kurulum, oda, uyeler:{pubId→uuid}, olaylar}` kopyalar); `sayac {olay, yazilan, hata, dusen, kuyruk}`; `kapat()` kuyruğu durdurur. İşler sıralı tek işçi (`isle()`), hata → aynı iş `[1,5,15,60,300]` sn sonra tekrar (5xx/ağ), 4xx → iş düşer (`dusen++`, log), kuyruk `>10000` olay → en eski düşer.
  PostgREST çağrıları (hepsi `apikey`+`Authorization: Bearer <serviceKey>`):
  - `baslangic` (ev sahibi `uyeler[hostPub]` varsa; yoksa oyun atlanır → `atlananOyun.add(oyunId)`, sonraki olayları da atlanır): `GET /kasabalar?sahip=eq.<uuid>&select=id&limit=1` → yoksa `POST /kasabalar {ad, sahip}` `return=representation`; `POST /kasaba_uyeleri` (sahip + kayıtlı oyuncular, `Prefer: resolution=ignore-duplicates`); `POST /oyunlar {id:oyunId, kasaba_id, kurulum, oda_kodu, baslama, sonuc:'devam', oyuncu_sayisi, ayarlar}` (`ignore-duplicates`); `POST /oyun_oyunculari [{oyun_id, pub_id, uye, ad, renk, sapka}]` (`ignore-duplicates`).
  - her olay: `POST /olaylar [{oyun_id, sira, gun, faz, tur, veri}]` toplu, `ignore-duplicates`.
  - `bitis`: `PATCH /oyunlar?id=eq.<oyunId> {bitis, sonuc:'bitti', kazanan_takim, kazanan_metin}`; her oyuncu `PATCH /oyun_oyunculari?oyun_id=eq.&pub_id=eq. {rol_key, takim, deli_gibi, calinan_rol, sonunda_sag, olum_gunu, olum_sekli}`.
  - `iptal`: `PATCH /oyunlar … {bitis, sonuc:'iptal'}`.
  - Açılış (`olustur` içinde, url varsa): `PATCH /oyunlar?sonuc=eq.devam&baslama=lt.<3 saat önce> {sonuc:'iptal', bitis:now}`.
  Ev sahibi: `baslangic.veri.oyuncular[0]`? Hayır — `room.hostId` kuyruğa alınırken kopyalanır (`hostPub`).

- [ ] **Step 1: Failing tests** (taklit sunucu): (a) kayıtlı ev sahibi, 2 kayıtlı + 2 misafir oyuncu: `baslangic` → istek sırası `GET kasabalar` (boş) → `POST kasabalar` (ad `"Ece'nin Kasabası"`) → `POST kasaba_uyeleri` (3 satır: sahip + 2 uye) → `POST oyunlar` (kurulum, `sonuc:'devam'`, `oyuncu_sayisi:5`) → `POST oyun_oyunculari` (5 satır, misafirlerde `uye:null`); sonra `gece_sonuc` → `POST olaylar` (1 satır, `veri` aynen); `bitis` → `PATCH oyunlar` + 5 × `PATCH oyun_oyunculari`. (b) ikinci maç aynı ev sahibi: `GET kasabalar` dolu → `POST kasabalar` **yok**. (c) misafir ev sahibi: hiç istek yok, `sayac.dusen` değil `sayac.atlanan` artar. (d) 503 ilk denemede → aynı iş `deneme[0]` sonra tekrar, sıra korunur (ikinci olay birinciden önce gitmez); 409/400 → düşer, sonraki ilerler. (e) kuyruk sınırı: 10 001 olay → 1 düşer. (f) açılış temizliği: `olustur` → `PATCH /oyunlar?sonuc=eq.devam&baslama=lt.…`. (g) `kapat()` → işçi durur, istek gitmez.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (`oyunId` olayın kendi `oyunId` alanından okunur — `deleteRoom` `endToLobby` sonra `bosalt` çağırdığı için `room.game.P` o anda lobidir; Task 1 bunu sağlar). **Step 4:** PASS. **Step 5: Commit** `Kasaba Gecesi: kayit.js writes matches and events to Supabase through PostgREST`.

### Task 3: Sunucu bağlantısı ve uçtan uca (taklit PostgREST ile)

**Files:**
- Modify: `kasaba-gecesi/sunucu/server.js` (`Kayit.olustur({url, serviceKey, kurulum:ayar.kurulum, quiet})`; `kuyrukla` çağrısı `bosalt` içinde zaten var — `room` geçiyor; `deleteRoom` sırası doğrulanır)
- Test: `kasaba-gecesi/sunucu/test/server.test.js`

- [ ] **Step 1: Failing test** `test('kayıt: kayıtlı ev sahibinin maçı taklit Supabase\'e yazılır; misafir ev sahibininki yazılmaz; iptal ve rövanş')`: taklit PostgREST + `createServer({ayar:{url:taklit, serviceKey, jwtSecret, kurulum:'t'}, jwksAlma:false})`; ev sahibi HS256 token ile; 3 bot; `start` → `oyunlar` 1 (`kurulum:'t'`, `oda_kodu`), `oyun_oyunculari` 4, `olaylar` ≥1 (`baslangic`); `hizliBitir` → `PATCH oyunlar` `sonuc:'bitti'`, `kazanan_takim:'imp'`; rövanş → ikinci `oyunlar` farklı id, aynı `kasaba_id`, `olaylar` içinde `rovans_basladi`; `cancel` süren maçta → `sonuc:'iptal'`; misafir ev sahibi (token yok) ile yeni oda → istek sayısı değişmez.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; `kontrol.sh` ✓. **Step 5: Commit** `Kasaba Gecesi: server hands matches to the recorder; guest hosts are not recorded`.

### Task 4: Dayanıklılık — açılış temizliği, kuyruk sınırı, loglar

**Files:** `kasaba-gecesi/sunucu/kayit.js`, `test/kayit.test.js` (Task 2'de yazılan (e)/(f) burada tamamlanır), `server.js` `/saglik` → `kayit:{kuyruk, yazilan, hata, dusen}` (açık sayılar; anahtar yok).

- [ ] Testler (e), (f) ve `/saglik` sayaçları; `kontrol.sh` ✓; **Commit** `Kasaba Gecesi: recorder resilience — stale games cancelled at start, queue cap, health counters`.

### Task 5: Belgeler

- README "Geçmiş ve kullanıcı kaydı" (ne zaman yazılır, misafir ev sahibi, `/saglik` sayaçları, `kurulum`), SKILL.md (`kayit.js` arayüzü, `P.oyunId`, `bitis.veri.oyuncular`), DURUM.md; spec §5.5'e not (`oyunId` olay kaydında). **Commit** `Docs: recording (plan 4)`.

### Task 6: kasaba-test'te gerçek deneme

- [ ] Komut gösterilip onay alınarak `/yayinla kasaba-test gecmis`; `deneme.js` (bot maçı + rövanş) çalıştır; sunucuda `psql`: `oyunlar` 2 satır (`sonuc='bitti'`, `kurulum='kasaba-test'`), `oyun_oyunculari` 10, `olaylar` > 20, `kasabalar` 1 ("Barış'ın Kasabası"), `kasaba_uyeleri` 1 (botlar misafir); `/saglik` sayaçları; `journalctl` hatasız. Ölçütler DURUM'a.
