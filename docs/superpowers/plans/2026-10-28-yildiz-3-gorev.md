# Yıldız ekonomisi 3b — haftalık görev — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Herkese aynı, haftalık 3 görev; görev başına +15 ⭐, üçü bitince +20 ⭐; kasa kartında tamamlanan satırı, profilde ilerleme.

**Architecture:** Görev seçimi `game.js`'te pazartesi tarihinden deterministik; ilerleme/ödül `mac_sonu` içinde kilit altında (göç 016, `haftalik_gorevler`). Sunucu haftanın 3 görevini `{artis,hedef,odul}` ile gönderir; SQL sayı bilmez.

**Tech Stack:** Node (node:test), Postgres 17 (`kg-pgtest`), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-28-kasaba-gecesi-yildiz-3-gorev-design.md`

## Global Constraints
- Dal `yildiz-3-gorev`; commit İngilizce + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `kontrol.sh [--e2e]`, ANSI temizle, çıkış kodu değişkende.
- Uzun satırlı JS/HTML: satır içi `//` yok. `KG_VER` → `2026-11-08a`.
- `HAFTALIK={havuz:{mac:{n:'5 maç oyna',hedef:5},kazan:{n:'2 kez kazan',hedef:2},kalabalik:{n:'8+ kişilik 2 maç oyna',hedef:2},sag_kal:{n:'2 maçı hayatta bitir',hedef:2},gun:{n:'3 farklı gün oyna',hedef:3}},odul:15,bonus:20,adet:3}`.
- Hafta = Europe/Istanbul pazartesisi (`YYYY-MM-DD`). Tavan maçı ve tekrar göreve sayılmaz; `gun` artışı SQL'de bugünün ilk gerçek kasasından.
- Göç 016 geriye uyumlu: `mac_sonu(…, p_seri_tavan int default 0, p_gorev jsonb default null, p_gorev_bonus int default 0)`; 014'ün 10 parametreli imzası `drop function if exists`. Gövde 014'ten türetilir (seri bloğu korunur); `hesap_birlestir` 015'ten türetilir.

## Review Focus
1. Hedefe ulaşan görev ikinci kez ödül vermez (sonraki maçta sayaç artsa da) — Task 1 test.sql 30.
2. Bonus tek kez, yalnız haftanın 3 görevi tamamken — test.sql 30.
3. Tavan maçında hiçbir görev sayılmaz; tekrar çağrı sayılmaz — test.sql 30.
4. Pazartesi değişince yeni haftanın satırları sıfırdan; eski hafta profilde görünmez — Task 1 game.test (seçim) + Task 2 e2e (profil yalnız bu hafta).
5. Birleştirme: aynı hafta/görevde sayaç toplanır, `tamam` OR; ödül verilmez — test.sql 31.

---

### Task 1: Kurallar + göç 016 + test.sql
**Files:** Modify `kasaba-gecesi/sunucu/game.js`, `sunucu/test/game.test.js`, `sunucu/db/test.sql`, `sunucu/test/denge.js`; Create `sunucu/db/goc/016_haftalik.sql`.

**Produces:** `HAFTALIK`; `haftaPazartesi(ms:number)→'YYYY-MM-DD'`; `haftaGorevleri(pazartesi:string)→string[3]` (havuz anahtarları, tekrarsız, deterministik); `gorevArtislari(R,id)→{mac,kazan,kalabalik,sag_kal}` (maç sonu dışında `{}`); `gorevParam(R,id,ms)→{key:{artis,hedef,odul}}` haftanın 3 görevi (`gun.artis=0`). RPC dönüşü `gorevler:[{key,odul}]` (bu maçta tamamlananlar, bonus `key:'hepsi'`); `envanter_oku.hafta={hafta,gorevler:{key:{sayac,tamam}}}`.

- [ ] **Step 1: Failing tests.** `game.test`: `haftaPazartesi(Date.parse('2026-10-28T12:00:00+03:00'))==='2026-10-26'`, pazar 23:30 İstanbul → aynı pazartesi, pazartesi 00:10 İstanbul (= pazar 21:10 UTC) → yeni pazartesi; `haftaGorevleri('2026-10-26')` aynı girdide aynı, 3 tekrarsız havuz anahtarı; 20 ardışık haftada en az 4 farklı küme; `gorevArtislari` kazanan sağ 8 kişilik maçta `{mac:1,kazan:1,kalabalik:1,sag_kal:1}`, ölen kaybeden 5 kişide `{mac:1,kazan:0,kalabalik:0,sag_kal:0}`; `gorevParam` anahtarları `haftaGorevleri(haftaPazartesi(ms))`, `odul===15`, `hedef` havuzdan; 016 metni `p_gorev jsonb default null, p_gorev_bonus int default 0` içerir. `test.sql` 30 (kullanıcı `6a6a…01`): hafta görevleri `mac`(hedef 2), `kazan`(hedef 1), `gun`(hedef 2), ödül 15, bonus 20; maç 1 (`mac` 1, `kazan` 1) → `gorevler=[{kazan,15}]`, cüzdan +15; aynı oyun tekrar → değişmez; maç 2 aynı gün (`kazan` 1) → `mac` tamam, `kazan` sayaç 2 ama yeniden ödül yok → `gorevler=[{mac,15}]`; bugünkü kasaları sil, `gun` satırını sayaç 1 yap (dün oynamış gibi), maç 3 → `gun` tamam + `hepsi` → `gorevler=[{gun,15},{hepsi,20}]`, cüzdan 65; maç 4 → `gorevler=[]`; tavan: yeni üye, 20 `{"tavan":true}` kasa, `mac` artış 1 → satır yok. 31: x/y aynı hafta `mac` (1,false)/(1,true) → birleştir → y (2,true), cüzdan değişmez; RLS: kendi satırı, başkası yok, yazamaz.
- [ ] **Step 2: RED** (game.test, kg-pgtest `--test`).
- [ ] **Step 3: Uygula** `game.js` (Intl `en-CA` + `Europe/Istanbul`; seçim: pazartesi dizesinin FNV-1a özetiyle tohumlanan karıştırma), göç 016 (tablo+RLS, `mac_sonu` 014 gövdesi + görev bloğu `if not v_tavan and p_gorev is not null`, `envanter_oku`, `hesap_birlestir` 015 gövdesi + blok), test.sql 15'in imzası 12 parametre, `denge.js` hafta senaryosuna görev geliri (botların kazanma/sağ kalma oranıyla; kalabalık %50 varsayımı; tüm 3'lü kümelerin ortalaması).
- [ ] **Step 4: GREEN** — game.test; `uygula.sh --test` → 31/31; `npm run denge -- 300`.
- [ ] **Step 5: Commit** `Weekly quests: HAFTALIK pool, deterministic week pick, progress in mac_sonu (migration 016)`.

### Task 2: Sunucu + istemci
**Files:** `sunucu/kayit.js`, `sunucu/server.js`, `index.html`, `sayfa/ben.html`; tests `server.test.js`, `kayit.test.js`, `e2e.js`.

**Produces:** `kayit.macSonu(…,{gorev,gorevBonus})` → `p_gorev/p_gorev_bonus` (yoksa `null/0`); `{t:'kasa',d:{…,gorevler:[]}}`; envanter `hafta` (yoksa `null`); kart `.gorev-satir`; `/ben` `.haftalik` bölümü, `.gorev[data-key]` satırları.

- [ ] **Step 1: Failing tests.** kayit: gövdede `p_gorev:null,p_gorev_bonus:0`. server: `x.gorev` anahtarları = `G.haftaGorevleri(G.haftaPazartesi(Date.now()))`, `x.gorevBonus===20`; stub `gorevler:[{key:'mac',odul:15}]` → `ka.gorevler` aynı; stub yoksa `[]`; envanter beklentisine `hafta:null`. e2e kasa: `gorevler:[{key:'kazan',odul:15},{key:'hepsi',odul:20}]` → `/✅ 2 kez kazan · \+15 ⭐/`, `/🏆 Haftanın görevleri tamam · \+20 ⭐/`; tavan kartında da çıkmaz (tavanda RPC vermez; boş dizi → satır yok); `/ben` tablo `haftalik_gorevler` bu haftanın ilk görevi sayaç 1, ikincisi tamam ve geçen haftadan bir satır → `.haftalik` başlık `/Bu haftanın görevleri · \d gün kaldı/`, `.gorev` 3 satır, ilkinde `1/<hedef>`, ikincide `✓`, geçen haftanın satırı sayılmaz.
- [ ] **Step 2: RED.** **Step 3: Uygula.** **Step 4: GREEN** `kontrol.sh --e2e`. **Step 5: Commit** `Weekly quests: server params, chest lines, profile section`.

### Task 3: kasaba-test + belgeler
- [ ] Push; ionos `uygula.sh && --test` (31/31) + `kur.sh kasaba-test … --surum yildiz-3-gorev`; `/saglik`; bot denemesi (timeout 600).
- [ ] DURUM, CLAUDE.md "Yıldız ekonomisi" satırı, SKILL.md; commit `Docs: weekly quests on kasaba-test`.
