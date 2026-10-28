# Yıldız ekonomisi 3a — seri — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Üst üste gün oynayan bağlı oyuncunun günün ilki ödülü 5→10 büyür; seri profilde görünür.

**Architecture:** Seri `seriler` tablosunda, kararı `mac_sonu` içinde cüzdan kilidi altında (göç 014). Artış/tavan `game.js` `YILDIZ_KAYNAK.seri`'den parametreyle gider; SQL sayı bilmez. Sunucu kasa mesajına `seri`, envantere `seri` ekler; istemci kart satırı ve profil satırı.

**Tech Stack:** Node (node:test), Postgres 17 (`kg-pgtest`), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-28-kasaba-gecesi-yildiz-3-seri-design.md`

## Global Constraints
- Dal `yildiz-3-seri`; her görev sonunda commit (İngilizce + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`); `kontrol.sh` (istemcide `--e2e`), ANSI temizle, çıkış kodunu değişkene al.
- Uzun satırlı JS/HTML: satır içi `//` yorum yok. `KG_VER` → `2026-11-07a`.
- Miktarlar: `YILDIZ_KAYNAK.gunun_ilki.adet=5` (değişmez), `YILDIZ_KAYNAK.seri={n:'Seri',adet:1,tavan:5}`. Günün ilki = `p_gunluk + least(greatest(seri-1,0)*p_seri_artis, p_seri_tavan)` yalnız bağlıysa (bağlı = `auth.users.email` dolu ∧ `email_confirmed_at` dolu).
- Gün = Europe/Istanbul takvim günü; seri yalnız bugünün **ilk gerçek kasası** (tavan değil, kasa yeni eklendi) ile güncellenir — `p_gunluk` 0 olsa bile.
- Göç 014 geriye uyumlu: `mac_sonu(…, p_basari jsonb default null, p_seri_artis int default 0, p_seri_tavan int default 0)`; eski 8 parametreli imza `drop function if exists`. Yerelde `kg-pgtest` (portsuz), sunucuda kasaba-test için onaysız.

## Review Focus
1. Aynı gün ikinci maç: seri artmaz, günün ilki 0 — Task 1 test.sql 28.
2. Tavana takılan bugünün ilk maçı seriyi işlemez — Task 1 test.sql 28.
3. Bağlı olmayan oyuncu: seri sayılır, ödül +5 kalır — Task 1 test.sql 28.
4. Eski 8 parametreli çağrı: seri yine güncellenir, günün ilki `p_gunluk` (artış 0) — Task 1 test.sql 28.
5. Birleştirme: iki hesabın serisi → büyük `seri`/`en_uzun`, yeni `son_gun` — Task 1 test.sql 29.

---

### Task 1: Kurallar sabiti + göç 014 + test.sql
**Files:** Modify `kasaba-gecesi/sunucu/game.js` (`YILDIZ_KAYNAK`), `kasaba-gecesi/sunucu/test/game.test.js`, `kasaba-gecesi/sunucu/db/test.sql`, `kasaba-gecesi/sunucu/test/denge.js` (hafta senaryosu); Create `kasaba-gecesi/sunucu/db/goc/014_seri.sql`.

**Produces:** `YILDIZ_KAYNAK.seri={n:'Seri',adet:1,tavan:5}`; tablo `public.seriler(uye pk, son_gun date, seri int, en_uzun int)` RLS kendi-oku; `mac_sonu` dönüşüne `'seri'` (int; seri işlenmediyse mevcut değeri, satır yoksa 0); `envanter_oku` → `'seri': {seri, en_uzun, son_gun}` ya da `null`; `hesap_birlestir` seriyi taşır.

- [ ] **Step 1: Failing tests.** `game.test.js`: `YILDIZ_KAYNAK.seri` deep-equal `{n:'Seri',adet:1,tavan:5}`; 014 dosyası `p_seri_artis int default 0, p_seri_tavan int default 0` içerir ve sayı sabiti (`5`, `10`) içermez (`/least\(greatest\(v_seri - 1, 0\) \* p_seri_artis, p_seri_tavan\)/`). `test.sql` 28 (kullanıcı `abcdabcd-…`, bağlı: email+email_confirmed_at; ikinci `abcdabce-…` bağlı değil): `seriler` satırını `son_gun = bugün-1, seri 2, en_uzun 2` yaz → `mac_sonu(…,5,null,1,5)` → `gunun_ilki` 7, `seri` 3, `en_uzun` 3; aynı gün ikinci maç → `gunun_ilki` 0, seri 3; satırı `son_gun = bugün-2` yap, bugünün kasalarını sil → seri 1, `gunun_ilki` 5, `en_uzun` 3; `seri 9, son_gun dün` → `gunun_ilki` 10 (tavan); bağlı olmayan: `son_gun dün, seri 4` → `gunun_ilki` 5, seri 5; tavan: 20 kasa ekle (bugün 00:00 öncesi değil, `now()`) yeni üyede → seri satırı oluşmaz; eski 8 parametreli çağrı (`…,5,null`) `son_gun dün, seri 2` → seri 3, `gunun_ilki` 5. 29: x `seri 4 en_uzun 6 son_gun bugün-3`, y `seri 2 en_uzun 2 son_gun dün` → birleştir → y `seri 4, en_uzun 6, son_gun dün`; authenticated kendi satırını okur, başkasınınkini okuyamaz, yazamaz.
- [ ] **Step 2: RED** — `node --test test/game.test.js` (014 yok) ve `kg-pgtest` + `uygula.sh --test` (28 düşer).
- [ ] **Step 3: Göç 014** — tablo + RLS; `mac_sonu` 012 gövdesi + `v_ilk_mi boolean` (mevcut "bugünün ilk gerçek kasası" koşulu, `p_gunluk`'tan bağımsız), kasa yeni eklendiyse ve `v_ilk_mi`: `seriler` upsert (`son_gun = bugün` → değişmez; `= bugün-1` → `seri+1`; aksi → 1; `en_uzun = greatest`), bağlıysa `v_ilk := greatest(p_gunluk,0) + least(greatest(v_seri - 1, 0) * p_seri_artis, p_seri_tavan)`; dönüşe `'seri', v_seri`. `envanter_oku`, `hesap_birlestir` (012 gövdesi + seriler). `game.js` `YILDIZ_KAYNAK.seri`. `denge.js` hafta senaryosu: gün sayısına göre seri ödülü (`gun` gün üst üste varsayımı) toplamı ekle.
- [ ] **Step 4: GREEN** — `node --test test/game.test.js`; `uygula.sh && uygula.sh --test` → `29/29`; `npm run denge -- 300` hafta tablosu 7 gün ≈ +60/hafta günün ilki.
- [ ] **Step 5: Commit** `Streak: seriler table and first-of-day growth in mac_sonu (migration 014)`.

### Task 2: Sunucu + istemci
**Files:** Modify `kasaba-gecesi/sunucu/kayit.js:124`, `kasaba-gecesi/sunucu/server.js` (ilerlemeIsle 403/410, envanterAyarla), `kasaba-gecesi/index.html` (kasaKarti 1297, hatırlatma 1315, KG_VER), `kasaba-gecesi/sayfa/ben.html` (özet 44–46, okuma 19–24); Test `server.test.js`, `kayit.test.js`, `e2e.js`.

**Consumes:** Task 1 RPC dönüşü `seri`, envanter `seri`. **Produces:** `kayit.macSonu(…,{seriArtis,seriTavan})` → `p_seri_artis/p_seri_tavan`; `{t:'kasa',d:{…,seri:number}}`; `mem.envanter.seri`; kart satırı; `/ben` `.seri-satir`.

- [ ] **Step 1: Failing tests.** `kayit.test` gövdesi `p_seri_artis:1,p_seri_tavan:5` (çağrıda verilince) ve verilmeyince `0,0`. `server.test` yıldız testi: `I.cagri.mac[*].x.seriArtis===G.YILDIZ_KAYNAK.seri.adet`, `seriTavan===…tavan`; stub dönüşü `seri:3` → `ka.seri===3`; stub `seri` vermezse `0`. e2e kasa kartı: `kasaSonuc={…,gununIlki:7,seri:3,bagli:true}` → `/🔥 3\. gün üst üste · \+7 Günün ilk maçı/`; `seri:1` → `/\+5 Günün ilk maçı/` ve `🔥` yok; bağlı değil `seri:3,gununIlki:5` → `+5 Günün ilk maçı`, hatırlatma `/serin \+6'dan başlar/`. `/ben` tablo `seriler:[{uye:ben,seri:3,en_uzun:9,son_gun:'…'}]` → `.seri-satir` `/🔥 Seri: 3 gün · en uzun 9/`; `seri:0,en_uzun:9` → `/Seri yok · en uzun 9/`; satır yoksa `.seri-satir` yok.
- [ ] **Step 2: RED** — `node --test test/server.test.js test/kayit.test.js`; `kontrol.sh --e2e`.
- [ ] **Step 3: Uygula.** Bugünün `seri` değeri için `/ben` `sb.from('seriler').select('seri,en_uzun,son_gun')`; seri gösterimi `son_gun` bugün ya da dün değilse 0 kabul edilir (kırılmış seri) — Europe/Istanbul günü istemcide `Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'})` ile.
- [ ] **Step 4: GREEN** — `kontrol.sh --e2e` tamamen temiz.
- [ ] **Step 5: Commit** `Streak: server passes streak params and relays seri; chest line and profile row`.

### Task 3: kasaba-test + belgeler
- [ ] Push; ionos: `uygula.sh && uygula.sh --test` (29/29) + `kur.sh kasaba-test … --surum yildiz-3-seri`; `/saglik` sürüm; bot denemesi sayfa hatasız.
- [ ] DURUM (kasaba-test, şema 014, parça 3a), CLAUDE.md "Yıldız ekonomisi" satırına seri, SKILL.md satırı; commit `Docs: streak on kasaba-test`.
