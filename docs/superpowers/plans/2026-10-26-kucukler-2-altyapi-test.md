# Ertelenen küçükler 2 — altyapı ve test (uygulama planı)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kurulum/yedek/Caddy betiklerindeki sağlamlık açıklarını, şema tutarlılık kısıtlarını, eksik testleri ve belge kalıntılarını kapatmak; oyun davranışı değişmez.

**Architecture:** Betikler `bash -n` + sahte ortam/`--yalnizca-yaz` ile; şema göç 007 yerel `supabase/postgres:17.6.1.136` konteynerinde `uygula.sh` + `test.sql` ile; test görevleri mevcut `node:test` ve e2e altyapısında.

**Tech Stack:** bash, Postgres 17 (Supabase imajı), Node `node:test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-kasaba-gecesi-ertelenen-kucukler-design.md`

## Global Constraints
- Dal `kucukler-2` (`main`'den); her görev sonunda commit; sunucuda yalnız `db/uygula.sh` (göç 007) + `--test`; betik değişiklikleri bir sonraki `kur.sh`/`kur-supabase.sh` koşusunda devreye girer (sunucuda çalıştırma komutu önce gösterilir, onay alınır).
- Betikler `set -euo pipefail` ile çalışır: koşullar `if` ile; boru içindeki olmayan dosya betiği sessizce bitirir.
- Göç = yeni numaralı `db/goc/007_*.sql`; RLS/görünüm değişince `test.sql`'e senaryo.
- Yerel Postgres tarifi (önceki oturumdan): `docker run -d --name kg-pgtest -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 supabase/postgres:17.6.1.136`; `psql -U supabase_admin` ile `alter table auth.users add column if not exists is_anonymous boolean not null default false` ve `auth.uid()`'i sunucudaki tanımla değiştir (`coalesce(nullif(current_setting('request.jwt.claim.sub',true),''), (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid`); `goc/*.sql` sırayla `psql -U postgres`; `test.sql` ile GEÇTİ sayısı; iş bitince `docker rm -f kg-pgtest`.

## Review Focus
1. Göç 007 kısıtı mevcut canlı veride ihlal varsa `uygula.sh` geri alır → Task 2'de uygulamadan önce ihlal sayan `select` (sunucuda psql) ve ihlal varsa önce `update`.
2. `kasabalar.ad` 40 sınırı: istemci `maxLength=40` ile uyumlu; PostgREST'ten uzun ad → 23514 hatası, `kasaba.html` bunu "ad çok uzun" diye gösterir (Task 2 test.sql + e2e sahte-Supabase yanıtı).
3. `caddy.sh` `validate` düşerse eski parça dokunulmaz (Task 1 sahte ortam: bozuk şablonla koşu → eski dosya aynı).
4. `yedek.sh` `pg_dump` yarıda kesilirse `.tmp` kalmaz (Task 1: `pg_dump` taklidi `exit 1`).
5. `kontrol.sh` test sayısı ayrıştırması Node sürümünden bağımsız (Task 3: `--test-reporter=tap`).

---

### Task 1: Betikler (madde 52, 53, 48, 49, 45, 47, 54)
**Files:** Modify `kasaba-gecesi/sunucu/db/caddy.sh:207-208`, `db/yedek.sh:224-226`, `db/kur-supabase.sh:41-50,65,115`, `db/uygula.sh` (sonuna `notify`); Test: scratchpad sahte ortam betiği (`KG_CADDY_KOK`, PATH'e `caddy`/`pg_dump`/`apt-get` taklitleri).
- [ ] Sahte ortam: `caddy.sh --alan x.test` ile geçerli yazım → dosya oluşur; `caddy` taklidi `validate`'te `exit 1` → eski dosya byte-aynı, `.yeni` silinmiş. `yedek.sh` ile `pg_dump` taklidi `exit 1` → yedek klasöründe `*.tmp` yok. `ayar()` için `v='a|b&c\d'` → `.env` satırı birebir. `apt-get` taklidi: eksik paket varken `update` bir kez çağrılır. Port denetimi: `ss` taklidi `0.0.0.0:8000` döndürünce `HATA`.
- [ ] Çalıştır → beklenen biçimde düşer (RED). Kod: tasarım "Kararlar". `bash -n` + sahte ortam yeşil.
- [ ] `uygula.sh` sonunda `notify pgrst, 'reload schema'` (yerel konteynerde `psql` ile çalıştığı görülür). Commit: `db scripts: atomic caddy write, backup tmp cleanup, ayar() escaping, apt update, port check, log masking, pgrst reload`.

### Task 2: Göç 007 ve test.sql (madde 44, 51, 50, 43)
**Files:** Create `db/goc/007_kisitlar.sql`; Modify `db/goc/003_gorunumler.sql` (yalnız belge; 007 görünümleri yeniden tanımlar), `db/test.sql` (senaryo 10–13), `sayfa/kasaba.html` (23514 → "Ad en çok 40 karakter"); Test yerel Postgres, `test/e2e.js` (sahte Supabase 23514).
**Interfaces:** `public.kazanma(takim, rol_key, sonunda_sag, olum_sekli, kazanan_takim)` 5 parametre; `kasaba_tablo`/`oyuncu_ozet` yeni imzayla.
- [ ] `test.sql` senaryoları (RED önce yerelde): 10) yabancı `oyun_oyunculari_acik` ve `oyuncu_ozet` 0 satır; 11) `kazanma()` 5 dal (`hayatta` sağ, `hortlak` asıldı, `serikatil` tek, takım eşit, takım farklı); 12) üye `update kasabalar set ad` kendi kasabasında (sahipse) ok, 41 karakter → `check_violation`, `update sahip` → reddedilir; 13) `oyunlar` `sonuc='bitti', bitis=null` → `check_violation`; `profiller.ad` 17 karakter → `check_violation`.
- [ ] Göç 007: kısıtlar, `kazanma()` yeni imza + görünümlerin yeniden `create or replace` (parametre düşürme için önce `drop function` + görünümler), `nullif(pr.ad,'')`. Yerelde 001–007 + `test.sql` 13/13; 007 geri alınınca ilgili senaryolar düşer.
- [ ] Sunucu ön doğrulama sorgusu (psql, dosyayla `scp`): ihlal sayıları (`sonuc/bitis` tutarsız, uzun adlar) → 0 bekleniyor; >0 ise `update` ile düzelt, sonra `uygula.sh`.
- [ ] `kasaba.html`: PostgREST `code==='23514'` → "Ad en çok 40 karakter olabilir."; e2e sahte-Supabase'de 23514 yanıtı → metin.
- [ ] Commit: `db: migration 007 — sonuc/bitis consistency, name length limits, kazanma() signature, nullif profile name; RLS tests 13/13`.

### Task 3: Eksik testler ve araçlar (madde 10, 42, 57, 24, 60, 61, 72, 34, 4)
**Files:** Modify `test/kayit.test.js` (karışık-maç 4xx), `test/game.test.js` (olay alan şeması; `OZEL` temizliği), `server.js` + `test/server.test.js` (`opts.clock` → `G.setClock`; `hizli` 8 sn dalı sahte saatle), `test/e2e.js` (Review Focus 2: `kg_token` süresi dolmuş anonim token → kodla gir → "taşınamadı" bilgisi), `game.js:56-63` (`Object.freeze(DAGILIM)`; `denge.js:11-12` env ile `autoSetup`'a `ayar` parametresi), `.claude/skills/kasaba-gecesi/scripts/kontrol.sh:36` (`--test-reporter=tap`), `sunucu/.gitignore:1` (`node_modules`), `test/kimlik.test.js:2` (yorum).
- [ ] Testler: tek demette `bitis(OYUN1)+baslangic(OYUN2)`, OYUN2 `POST oyunlar` 409 → OYUN1 yazılır, OYUN2 `atlanan`; her olay türü için `Object.keys(veri)` sabit liste (`baslangic, gece_hamle, gece_sonuc, gunduz_sonuc, bitis, iptal, iddia, hizli`); `hizli` ikinci gönderim 8 sn sonra sahte saatle kabul; e2e süresi dolmuş token akışı; `autoSetup(n,{tekHainSurumP:1})` 500 çekimde hep sürümlü ve `DAGILIM.tekHainSurumP=0` ataması `TypeError`/etkisiz (donmuş).
- [ ] FAIL → Kod. `kontrol.sh` çıktısında "npm test (N test)" sayısı dolu. Commit: `tests: mixed-game 4xx, event field schemas, fake clock for hizli, expired-token e2e, frozen DAGILIM; kontrol.sh TAP count`.

### Task 4: Belgeler ve DURUM (madde 46, 58)
**Files:** Modify `docs/superpowers/specs/2026-10-24-kasaba-gecesi-gecmis-design.md:220,229,267`, `docs/superpowers/specs/2026-10-24-kasaba-gecesi-sahne-design.md:74-78`, `docs/DURUM.md`, `README.md` (göç 007, `kazanma()` imzası, kurulum notları), `.claude/skills/kasaba-gecesi/SKILL.md` (test.sql sayısı, `opts.clock`).
- [ ] Spec kalıntılarını güncel değerlerle değiştir (`/root/supabase-kasaba`, Studio SSH tüneli, anahtar adları; §5.1 `DAGILIM` tablosu + geri bildirim tasarımına bağlantı).
- [ ] DURUM: Plan 1 ve 2 ile kapanan maddeleri listelerden sil; kalan 5 (kararlar + kural işleri) tek satırda.
- [ ] `kontrol.sh --e2e` yeşil; commit `Docs: spec leftovers, DURUM cleanup`; sunucuda `sudo db/uygula.sh && sudo db/uygula.sh --test` (onay) → PR `main`.
