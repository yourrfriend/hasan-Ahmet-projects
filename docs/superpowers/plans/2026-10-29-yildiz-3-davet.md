# Yıldız ekonomisi 3c — davet — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bağlı oyuncunun kişisel/oda linkiyle yeni gelen kişi e-postasını bağlayıp bir maç oynayınca davet eden +30 ⭐, gelen +10 ⭐; 3. davette Dostluk bayrağı; en çok 10.

**Architecture:** Kod ve kayıt veritabanında (göç 019: `davet_kodlari`, `davetler`); kayıt anonim hesap açılırken sunucudan (`/hesap/anonim` gövdesi `davet`); ödül `davet_odul` ile `mac_sonu` ve `bagla_odulu` içinden, gelenin cüzdan kilidi altında. Sayılar yalnız sahibine (`davet_benim()` RPC, `envanter_oku.davet`).

**Tech Stack:** Node (node:test), Postgres 17 (`kg-pgtest`), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-29-kasaba-gecesi-yildiz-3-davet-design.md`

## Global Constraints
- Dal `yildiz-3-davet`; commit İngilizce + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `kontrol.sh [--e2e]`, ANSI temizle, çıkış kodu değişkende. Uzun satırlarda satır içi `//` yok. `KG_VER` → `2026-11-09a`.
- `YILDIZ_KAYNAK.davet={n:'Arkadaş getirdin',adet:30,gelen:10,tavan:10,kozmetik:3}`; SQL sabitleri `davet_eden_miktar 30`, `davet_gelen_miktar 10`, `davet_tavan 10`, `davet_kozmetik_esik 3` (game.test eşler).
- `KOZMETIK.bayrak.dostluk={n:'Dostluk bayrağı',nadir:'nadir',renk:<builder>,ico:'🤝',ozel:'davet'}`; `kozmetik_al` reddeder (`hata:'ozel'`).
- Kod: 8 karakter, alfabe `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, `extensions.gen_random_bytes` ile; istemci ve sunucu `/^[A-HJ-NP-Z2-9]{8}$/` ile doğrular.
- Bağlı = `auth.users.email` dolu ∧ `email_confirmed_at` dolu. Gerçek kasa = `odul->>'tavan'` doğru olmayan.
- En son tanımlar: `mac_sonu` 018, `bagla_odulu` 010, `envanter_oku` 016, `kozmetik_al` 013, `hesap_birlestir` 016 — 019 bunlardan türetilir, imzalar değişmez.

## Review Focus
1. Kendine davet: davet edenin kendi kodu kendi hesabına yazılamaz; gizli sekmede açılan hesap birleştirmeyle davet edene katılırsa kayıt düşer — test.sql 33/34.
2. Aynı davet iki kez ödül vermez (mac_sonu ve bagla_odulu ikisi de tetikler) — test.sql 33.
3. Koşul sırası: önce maç sonra bağlama da, önce bağlama sonra maç da tek ödül — test.sql 33.
4. Tavan: 10'dan sonra davet eden almaz, gelen yine +10 alır; 3'te kozmetik bir kez — test.sql 33.
5. Gizlilik: istemci `davetler`'i okuyamaz; `davet_benim` yalnız kendi sayılarını verir — test.sql 34.

---

### Task 1: Kurallar + göç 019 + test.sql
**Files:** `sunucu/game.js` (`YILDIZ_KAYNAK`, `KOZMETIK.bayrak`), `sunucu/test/game.test.js`, `sunucu/db/goc/019_davet.sql` (yeni), `sunucu/db/test.sql`.

**Produces:** tablolar `davet_kodlari(uye pk, kod unique)` (RLS kendi-oku), `davetler(davet_edilen pk, davet_eden, zaman, odul_zaman)` (hiç okuma yok); RPC `davet_kodu_uret()→text`, `davet_kaydet(p_kod text, p_yeni uuid)→boolean` (service_role), `davet_odul(p_yeni uuid)→int` (gelen ödülü; service_role, iç), `davet_benim()→jsonb {kod,gelen,odullu}` (authenticated, `auth.uid()`); `mac_sonu`/`bagla_odulu` dönüşüne `'davet', int`; `bagla_odulu` bağlanınca kod üretir; `envanter_oku.davet={kod,gelen,odullu}`; göç sonunda bağlı hesaplara kod.

- [ ] **Step 1: Failing tests.** game.test: `YILDIZ_KAYNAK.davet` deep-equal; `KOZMETIK.bayrak.dostluk.ozel==='davet'`; `ozel` değerleri `bagla|basari|davet`; kasa çekilişinde çıkmaz (mevcut 500'lük döngü kapsar); 019 sabitleri `YILDIZ_KAYNAK.davet` ile eşit; `kozmetik_al` 019'da `'bayrak:dostluk'` içerir. Mevcut sayım testi bayrak 12→13. test.sql 33 (davet eden A bağlı; gelenler anonim): `bagla_odulu(A)` sonrası `davet_kodlari` A satırı, kod biçimi; `davet_kaydet(kodA, A)` false; bilinmeyen kod false; B kaydı true, ikinci kez false; B önce maç (tavansız) → `davet` 0 (bağlı değil); B'yi bağla (email+confirmed) → `bagla_odulu(B)` → `davet` 10, A cüzdanı +30 (ve +25 bağlama), B +10+25; B yeni maç → `davet` 0; C önce bağla (maç yok) → 0, sonra maç → 10; C'nin tavan kasaları sayılmaz (yalnız tavan kasası varken bağla → 0); A 3. ödülde `bayrak:dostluk`; A'nın `odullu` 10'a çıkarılınca (elle 7 kayıt `odul_zaman` dolu) 11. davette A almaz, gelen alır. 34: birleştirme — A'nın gizli sekmesi S (A koduyla kayıtlı) `hesap_birlestir(S, A)` → `davetler`'de S/A satırı yok, A kendine davetli değil; `davet_eden=eski` olanlar yeniye geçer; eski kod silinir. RLS: authenticated `davetler` select → insufficient_privilege; `davet_benim()` kendi `{kod,gelen,odullu}`; başkasının `davet_kodlari` görünmez; `davet_kaydet` çağrılamaz.
- [ ] **Step 2: RED.** **Step 3: Uygula** (`019_davet.sql` 018/010/016/013/016 gövdelerinden; `davet_odul` gelenin cüzdanı zaten kilitliyken davet edenin cüzdanını `for update` ile kilitler). **Step 4: GREEN** game.test + `uygula.sh --test` → 34/34. **Step 5: Commit** `Invites: codes, records and reward in mac_sonu/bagla_odulu (migration 019)`.

### Task 2: Sunucu
**Files:** `sunucu/kayit.js`, `sunucu/server.js`; tests `server.test.js`, `kayit.test.js`.
**Produces:** `kayit.davetKaydet(kod,uye)` → RPC `davet_kaydet`; `/hesap/anonim` gövde `{davet}` (isteğe bağlı, ≤1 KB; geçersiz kod yok sayılır) → GoTrue 2xx ve `govde.user.id` varsa kayıt (yanıtı bekletmez); kasa mesajı `davet:number`; `/hesap/bagla-odulu` yanıtı ve `{t:'baglaOdulu'}` `davet:number`; envanter `davet` ({kod,gelen,odullu}|null).
- [ ] Failing: server.test — `/hesap/anonim` `{davet:'ABCDEFGH'}` → stub `davetKaydet('ABCDEFGH', <yeni id>)`; geçersiz kod (`'abc'`) çağırmaz; gövdesiz eski istemci çalışır; kasa stub `davet:10` → `ka.davet===10`, yoksa 0; bagla-odulu stub `davet:10` → yanıt `davet:10`; envanter beklentisine `davet:null`. kayit.test: `davet_kaydet` gövdesi `{p_kod,p_yeni}`. RED → uygula → GREEN → commit `Invites: server records invite on anonymous signup and relays rewards`.

### Task 3: İstemci
**Files:** `index.html`, `sayfa/ben.html`; test `e2e.js`.
**Produces:** `?d=KOD` → `localStorage.kg_davet` + yeni hesapta bir kez `.davet-not`; `hesap/anonim` gövdesi `{davet}`; bağlı ev sahibinin `inviteLink()` sonuna `&d=KOD` (kod envanterden); kasa kartı `🤝 Arkadaşın davetiyle · +10 ⭐`; bağlama kartına aynı ek; `/ben` `.davet` bölümü (link `.davet-link`, `Gelen: N · ödül alan: M/10`, bağlı değilse "E-postanı bağla, davet linkin açılsın"); dükkânda `ozel==='davet'` → "🤝 3 arkadaş getirince".
- [ ] Failing e2e: `?d=ABCDEFGH` ile yeni bağlamda açılış → anonim isteğin gövdesi `davet:'ABCDEFGH'`, `.davet-not` metni; kasa kartı satırı; `/ben` davet bölümü (mock `davet_benim` → `{kod:'KODKOD23',gelen:4,odullu:2}`) `/Gelen: 4 · ödül alan: 2\/10/` ve link `/\?d=KODKOD23/`; bağlı değil (mock null kod) → bağla metni; dükkânda `bayrak:dostluk` düğmesiz "3 arkadaş"; lobi: bağlı ev sahibi envanter `davet.kod` → davet linki `&d=`. RED → uygula → GREEN `kontrol.sh --e2e` → commit `Invites: invite note, link code, chest line and profile section`.

### Task 4: kasaba-test + belgeler
- [ ] Push; ionos `uygula.sh && --test` (34/34) + `kur.sh kasaba-test … --surum yildiz-3-davet`; `/saglik`; bot denemesi; DURUM, CLAUDE.md, SKILL.md; commit `Docs: invites on kasaba-test`.
