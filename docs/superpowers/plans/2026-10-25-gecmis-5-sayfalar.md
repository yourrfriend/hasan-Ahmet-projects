# Geçmiş 5/6 — Sayfalar: /oyun hikâyesi, /kasaba tablosu, giriş sayfasında geçmiş

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kayıtlı oyuncu geçmişini görür: her bitmiş maçın gece gece hikâyesi (`/oyun/<id>`), kasabanın tablosu ve arkadaş karşılaştırmaları (`/kasaba/<id>`), giriş sayfasında son oyunlar ve kişisel kart; oyun sonunda "Hikâyeyi gör".

**Architecture:** Statik sayfalar `kasaba-gecesi/sayfa/{oyun,kasaba}.html` + `ortak.js` (ayar/oturum/istek yardımcıları) + `ortak.css` + saf `hikaye.js` (Node ve tarayıcı, game.js sarmalı gibi); `server.js` `/oyun/<uuid>`, `/kasaba/<uuid>` yollarını ve `/sayfa/*.{js,css}` dosyalarını sunar. Sayfalar Supabase'i doğrudan okur (anon anahtar + paylaşılan oturum; RLS). `index.html` giriş sayfasına geçmiş bloğu, son ekrana hikâye linki.

**Tech Stack:** supabase-js 2.117.3 (gömülü), PostgREST görünümleri (003), Node 20 `node:test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-24-kasaba-gecesi-gecmis-design.md` §5.6, §5.7, **§9** (Plan 5 kararları).

## Global Constraints

- Sayfalar yalnız anon anahtar + kullanıcı oturumuyla okur; servis anahtarı istemciye gitmez; yazma yalnız `kasabalar.ad` (sahip).
- Tek tek oylar hiçbir yerde; hikâye yalnız `olaylar` (bitmiş oyun; RLS) ve `oyun_oyunculari_acik`'tan.
- "En çok kaybeden" tablosu yok; yüzde yok; her oran yanında örneklem.
- Giriş sayfası Supabase'i beklemez (3 sn zaman aşımı, arka planda); oyun kurma akışı değişmez.
- Türkçe, kısa; telefon dikey/yatay okunur (`max-width`, taşmayan tablolar `overflow-x:auto`).
- `KG_VER` artar; her görev `kontrol.sh` (istemci görevleri `--e2e`).

## Review Focus

1. **Oturumsuz / kayıt kapalı:** `/oyun`, `/kasaba` ve giriş bloğu hata vermeden "kayıt kapalı / kimlik yok" der; konsolda hata yok. → Task 4/5 e2e.
2. **Yetkisiz oyun:** üyesi olmadığım kasabanın oyunu → RLS boş döner → sayfa "bu oyunu göremezsin" der (çökmez). → Task 4 (taklit veriyle birim: boş sonuç dalı).
3. **Süren oyun:** `olaylar` RLS boş (bitiş yok) → "henüz bitmedi/yazılıyor" notu; rol sütunları null → "?" gösterilir. → Task 2 (hikaye) + Task 4.
4. **Karşılaştırma örneklemi:** N<3 maçta iddialı cümle yok; "henüz az maç". → Task 3 birim testi.
5. **Hikâye gizliliği:** ölçüm olayları ve `gece_hamle` dışı iç alanlar metne girmez; Deli'nin hamleleri "etkisiz" diye işaretlenmez (Deli gerçek sanır; günlükte zaten yazılmaz). → Task 2 testi.

---

### Task 1: Sunucu yolları ve ortak dosyalar

**Files:** `kasaba-gecesi/sunucu/server.js` (statik: `/oyun/<uuid>` → `sayfa/oyun.html`, `/kasaba/<uuid>` → `sayfa/kasaba.html`; `/sayfa/*.css`), `kasaba-gecesi/sayfa/ortak.js`, `kasaba-gecesi/sayfa/ortak.css`, `kasaba-gecesi/sunucu/kur.sh` (`sayfa/*.html`, `*.css` kopyası), `test/server.test.js`

**Interfaces:**
- Produces: `ortak.js` → `window.KG_SAYFA={ayar:Promise<ayar>, oturum():Promise<{sb,session}|null> (2 sn), sorgu(sb, tablo, filtre) , tarih(iso), rolAdi(key,takim)}`; yollar `GET /oyun/<uuid>` 200 html, `/oyun/abc` 404.

- [ ] **Step 1: Failing test** `server.test`: `/oyun/<uuid>` 200 + `text/html`, `/kasaba/<uuid>` 200, `/oyun/x` 404, `/sayfa/ortak.css` 200 `text/css`, `/sayfa/../x` 404.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (+ `bash -n kur.sh`). **Step 4:** PASS. **Step 5: Commit** `Kasaba Gecesi: history page routes and shared page helpers`.

### Task 2: `hikaye.js` — günlükten gece gece hikâye (saf)

**Files:** `kasaba-gecesi/sayfa/hikaye.js` (UMD: `module.exports` / `window.KG_HIKAYE`), `kasaba-gecesi/sunucu/test/hikaye.test.js`

**Interfaces:**
- Produces: `hikaye(olaylar, oyuncular, ROLES) → [{baslik, satirlar:[string]}]`; `oyuncular` = `oyun_oyunculari_acik` satırları (`pub_id, ad, rol_key, takim, deli_gibi, calinan_rol`); ad eşlemesi `pub_id→ad`; rol etiketi `rolAdi`. Gün blokları: "🌙 Gece 1" (hamleler: `gece_hamle` → "Ece (Hain) Can'ın evine girdi" / "Deniz (Doktor) Can'ı korudu" / "Ali (Gözcü) Can'ın evini gözetledi" …; sonuç: `gece_sonuc` → ölümler "Can öldü (Hain)", kurtarmalar, yelek, tuzak, tutma, çalma, yıldırım, patlama, hortlak), "☀️ Gün 1" (`iddia` → "Ece: «Rolüm Doktor» — o sırada Hain", `gunduz_sonuc` → "Oylar: Ece 3, Can 1, çekimser 2 · Kasaba Ece'yi gönderdi (Hain)"), "🏁 Bitiş" (`bitis.kazanan_metin`). `iptal` → "Oyun iptal edildi (Gün 2, tartışma)". Ölçüm olayları atlanır.

- [ ] **Step 1: Failing tests**: sabit günlük (6 oyuncu, 2 gece) → beklenen satırlar; `hazir/kopus/dondu/son_ekran_goruldu/rovans_basladi/hizli` satır üretmez; bilinmeyen `tur` sessizce atlanır; bilinmeyen `pub_id` → "?" ; `rol_key` null (süren oyun) → ad yalnız, rol yok.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5: Commit** `Kasaba Gecesi: hikaye.js turns the event log into a night-by-night story`.

### Task 3: `/kasaba` sayfası ve karşılaştırma hesabı (saf)

**Files:** `kasaba-gecesi/sayfa/kasaba.html`, `kasaba-gecesi/sayfa/karsilastirma.js` (UMD), `test/karsilastirma.test.js`

**Interfaces:**
- Produces: `karsilastir(benUuid, oyunlar, oyuncular) → [{uye, ad, birlikte, ayniTarafZafer, karsi:{ben,o}, azMac:boolean}]` — `oyunlar` (bitti, `kazanan_takim`), `oyuncular` (`oyun_oyunculari_acik` satırları); kazanma `kazanma()` kuralının JS kopyası `kazandiMi(p, oyun)` (test: SQL ile aynı 5 dal). Sayfa: ad (+ sahip için düzenleme: `update kasabalar set ad`), üyeler, tablo (`kasaba_tablo` `kurulum=eq.`), karşılaştırmalar (oturumdaki üye için), son maçlar (`oyunlar` `kasaba_id=eq.&sonuc=eq.bitti&order=bitis.desc&limit=20`).

- [ ] **Step 1: Failing tests** `karsilastirma.test.js`: 3 üye, 4 maç → birlikte/aynı taraf zafer/karşı taraf sayıları; N<3 → `azMac:true`; `kazandiMi` 5 dal (takım, hayatta sağ, hortlak asıldı, tek başına neu sağ, Deli inn).
- [ ] **Step 2:** FAIL. **Step 3:** Implement + sayfa HTML. **Step 4:** PASS. **Step 5: Commit** `Kasaba Gecesi: /kasaba page — table, friend comparisons, recent matches`.

### Task 4: `/oyun` sayfası

**Files:** `kasaba-gecesi/sayfa/oyun.html`, `test/e2e.js` (yerel: Supabase yok → "Kayıt kapalı" notu, konsol hatasız; `/oyun/<rastgele uuid>` 200)

- [ ] **Step 1: e2e (fail first)**: yerel sunucuda `/oyun/<uuid>` açılır, `.not` metni `/Kayıt kapalı|kimlik yok/`, `pageerror` yok; `/kasaba/<uuid>` aynı.
- [ ] **Step 2:** FAIL. **Step 3:** Implement: başlık, oyuncular tablosu, hikâye (`KG_HIKAYE`), boş sonuç dalları ("bu oyunu göremezsin" / "henüz bitmedi, yazılıyor — yenile"). **Step 4:** `--e2e` ✓. **Step 5: Commit** `Kasaba Gecesi: /oyun page — summary, players, night-by-night story`.

### Task 5: Giriş sayfası geçmişi ve son ekran linki

**Files:** `kasaba-gecesi/index.html` (`renderLanding`: `.gecmis` bloğu — `oyuncu_ozet` kartı, son 10 maç, kasaba linkleri; `renderEndUI`: "📖 Hikâyeyi gör" linki), `test/e2e.js`

- [ ] **Step 1: e2e (fail first)**: Supabase yokken giriş sayfasında `.gecmis` yok; oyun sonunda `a.hikaye` yok (kayıt kapalı). (Kayıt açık yol kasaba-test'te doğrulanır.)
- [ ] **Step 2–4:** Implement (sorgular `kimlikSoz` sonrası arka planda; 3 sn zaman aşımı; hata sessiz), `KG_VER='2026-10-30a'`, `--e2e` ✓. **Step 5: Commit** `Kasaba Gecesi: landing history block and story link at game end`.

### Task 6: kasaba-test doğrulama ve belgeler

- Kurulum (onay alınmış kalıp), bot maçı (`deneme.js`), aynı tarayıcı bağlamında `/oyun/<id>`, `/kasaba/<id>`, giriş sayfası `.gecmis` — ekran görüntüleri; telefon dikey (390×844) görünümü.
- README (sayfalar), SKILL.md (yollar, `sayfa/` dosyaları, `hikaye.js`), DURUM.md, tanıtım; commit `Docs: history pages (plan 5)`.
