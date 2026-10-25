# Paket 1b — Hızlı iddia/tepki balonları ve rol rehberi: uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tartışmada tek dokunuşla 5 hızlı ifade (sunucu metni kurar, sınırları uygular, rol iddiasını gerçek rolle birlikte kaydeder), gazeteye "iddia ve gerçeklik" kartı, oyunu durdurmayan rol rehberi çekmecesi.

**Architecture:** `game.js`: `HIZLI_BEKLE_MS`, `HIZLI_GUN`, `HIZLI_TUR`, `hizli(R,id,m) → {ok}|{hata,kalan}` (doğrulama, sınır, tekilleştirme, `pushChat`, `logEv('iddia')`/`olay('hizli')`), `gazeteFor`'a `iddia` kartı, `ROLES[*].ipucu`. `server.js`: `case 'hizli'` → `G.hizli` → `schedule`/`err soft`. İstemci: ⚡ menüsü (sohbet girişinde), 📘 çekmecesi (üst bar), `KG_VER`.

**Tech Stack:** Node 20 `node:test`, `ws`, tek dosya istemci, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-25-kasaba-gecesi-paket1b-iddia-rehber-design.md`.

## Global Constraints

- Gizli bilgi `P`'ye/sohbete girmez: sohbet satırı yalnız iddia metnini taşır; gerçek rol yalnız `R.log` (`iddia` olayı).
- Sınırlar sunucuda: faz `talk`, sağ, `d===P.day`, 8 sn (`HIZLI_BEKLE_MS=8000`), gün başına 4 (`HIZLI_GUN=4`), `n` tekilleştirme (son 20).
- Rol listesi tüm `ROLES` (gizli dağılıma göre daraltma yok); rehber `priv`/`R.g` okumaz.
- Sabitler ve `ipucu` yalnız `game.js`; metinler Türkçe, kısa, niyet atfı yok; `KG_VER` artar.
- Her görev `kontrol.sh` yeşil (istemci görevleri `--e2e`); commit mesajı İngilizce + Co-Authored-By.

## Review Focus

1. **Yeniden bağlanma ile sayaç atlatma:** aynı oyuncu kopup dönünce bekleme ve gün hakkı devam eder (`R.g.hizli`). → Task 1 testi (server).
2. **Sahte alanlar:** `k` dışı, `rol` ROLES'ta olmayan, `hedef` ölü/kendisi, `d` eski → sessizce reddedilir (`false`), sohbete bir şey düşmez. → Task 1 testi.
3. **Deli'nin iddiası:** gazete blöf demez; `iddia` olayında `algilanan_rol` dolu. → Task 2 testi.
4. **Hırsız çalma öncesi/sonrası:** iki iddia, ikisi de kendi anındaki rolle; kart "önce X, sonra Y" biçimi. → Task 2 testi.
5. **Rehber sızıntısı:** çekmece DOM'unda kendi rol adı ya da `priv` alanı geçmez; gece de açılır, sahne tıklanabilir kalır. → Task 4 e2e.

---

### Task 1: `hizli` kuralı (`game.js`) ve sunucu yolu

**Files:**
- Modify: `kasaba-gecesi/sunucu/game.js` (sabitler; `hizli`; exports), `kasaba-gecesi/sunucu/server.js` (`onMessage` `case 'hizli'`)
- Test: `kasaba-gecesi/sunucu/test/game.test.js`, `test/server.test.js`

**Interfaces:**
- Produces: `HIZLI_BEKLE_MS=8000`, `HIZLI_GUN=4`, `HIZLI_TUR={rol:'🗣️ Rolüm: {rol}', suphe:'🤨 {ad} hakkında şüphem var.', belirsiz:'🤷 Bu bilgi kesin değil.', koru:'🛡️ Beni koruyun!', aciklama:'📣 Bir açıklama yapacağım.'}`; `hizli(R,id,m) → {ok:true} | {ok:false, kod:'gecersiz'|'bekle'|'gun'|'tekrar', kalan?}`; `R.g.hizli[id]={gun,n,son,anahtarlar}`; sohbet satırı `{id,t,d,ts,hizli:k}`; `iddia`/`hizli` olayları (spec §5.1). Sunucu: `ok` → `schedule(room)`; `bekle` → `err soft 'Biraz bekle ({kalan} sn).'`; `gun` → `err soft 'Bugünlük hızlı ifade hakkın bitti ({HIZLI_GUN}).'`; `gecersiz`/`tekrar` → sessiz.

- [ ] **Step 1: Failing tests** `game.test.js`: `test('hızlı ifade: doğrulama, metinler, 8 sn bekleme, gün başına 4, tekilleştirme, olaylar')` — `fixed([...])`, gece `hizli` → `gecersiz`; `advance` → talk; `hizli(R,'u1',{k:'rol',rol:'doktor',d:1,n:'a'})` → ok, `P.chat` son satırı `{id:'u1',t:'🗣️ Rolüm: Doktor',hizli:'rol'}`; aynı `n` → `tekrar`, sohbet büyümez; hemen `k:'koru'` → `bekle` (`kalan` 1–8); `G.setClock(+9000)` → ok; `rol:'yok'`, `k:'x'`, `hedef` kendisi/ölü, `d:0` → `gecersiz`; 4 dolunca → `gun`; `advance`×2 (yeni gün) → sayaç sıfır; ölü oyuncu → `gecersiz`; `iddia` olayı `{kim:'u1',rol_iddia:'doktor',gercek_rol:'masum',gercek_takim:'inn',algilanan_rol:null}`; Deli (`mad:'polis'`) rol iddiası → `algilanan_rol:'polis'`; `suphe` → `hizli` olayında `veri` `{kim,k:'suphe'}` (hedef yok); `noLeak`. `server.test.js`: `hizli` mesajı → diğer istemcilerde sohbet satırı; ikinci mesaj hemen → `err soft /Biraz bekle/`; kopup dönen aynı oyuncu yine `bekle`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; `kontrol.sh` ✓. **Step 5: Commit** `Kasaba Gecesi: quick statements — server-built chat lines with limits, role claims logged with the true role`.

### Task 2: Gazete `iddia` kartı

**Files:** `kasaba-gecesi/sunucu/game.js` (`gazeteFor`), `test/game.test.js`

- [ ] **Step 1: Failing tests** `test('gazete: iddia kartı — doğru/yanlış/çoklu iddia; Deli atlanır; Hırsız öncesi-sonrası; hain kopyası etiketi')`: senaryolar (talk fazında `hizli` ile iddia, sonra maç bitirilir): masum "Doktor" dedi → `/Gün 1: Oyuncu1 Doktor olduğunu söyledi; o sırada rolü Masum idi/`; doktor "Doktor" dedi → `/doğruydu/`; hain gün 1 "Masum", gün 2 "Doktor" → `/önce Masum, sonra Doktor olduğunu söyledi; o sırada rolü Hain idi/`; Deli (`mad:'doktor'`) "Doktor" dedi → `iddia` kartı yok (Deli kartı var); Hırsız gün 1 "Hırsız" dedi, gece doktoru çaldı, gün 2 "Doktor" dedi → `/önce Hırsız, sonra Doktor … o sırada rolü Doktor idi/`; hain polis (`polis_h`) "Polis" dedi → `/o sırada rolü Polis \(Hain\) idi/`; sıra: deli → mudahale → iddia → bitiş; aynı özne tekrarı yok; en çok 3.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (öncelik 2; "son iddia" karşılaştırması; farklı iddialar listesi). **Step 4:** PASS. **Step 5: Commit** `Kasaba Gecesi: gazette compares role claims with the role at the time`.

### Task 3: İstemci — ⚡ hızlı menü

**Files:** `kasaba-gecesi/index.html` (`renderGameUI` sohbet girişi; `.hizli` panel; `onServerMsg` `err soft` → kısa uyarı; `KG_VER`), `test/e2e.js`

- [ ] **Step 1: e2e (fail first)**: tartışma adımında (mevcut "gündüz sohbeti" adımı) bir oyuncu `button.hizli` → `text=Rolüm` → `.hizli .rol[data-rol="doktor"]` → diğer sekmede `.chat .log` içinde `/🗣️ Rolüm: Doktor/`; aynı oyuncu hemen `button.hizli` → `text=Beni koruyun` → `.hizli-uyari` `/Biraz bekle/`; `button.hizli` metni `/⚡ \d/`.
- [ ] **Step 2:** `kontrol.sh --e2e` FAIL. **Step 3:** Implement (panel: 5 düğme; rol ızgarası `ROLES` sırasıyla taraf renkli; oyuncu listesi `P.players` sağ ve kendisi hariç; `n` üretimi; yerel bekleme sayacı `hizliSon`; `err soft` 3 sn uyarı; `hizli` satırı `.chat .log div.hizli` hafif stil). `KG_VER='2026-10-29a'`. **Step 4:** `--e2e` ✓ + telefon ekran görüntüsü (844×390) panel sığar. **Step 5: Commit** `Kasaba Gecesi: quick statement menu in the discussion`.

### Task 4: Rol rehberi çekmecesi + `ipucu`

**Files:** `kasaba-gecesi/sunucu/game.js` (`ROLES[*].ipucu`, 20 cümle), `kasaba-gecesi/index.html` (📘 düğmesi lobi+oyun; `.rehber` çekmecesi; `ui.rehber`), `test/e2e.js`, `test/game.test.js` (her rolün `ipucu`'su var, ≤ 120 karakter)

- [ ] **Step 1: tests (fail first)**: `game.test`: `Object.values(G.ROLES).every(r=>typeof r.ipucu==='string'&&r.ipucu.length>10&&r.ipucu.length<=120)`. e2e: gece adımında bir oyuncu `button.rehber` → `.rehber` görünür, içinde 20 rol adı ve `/Dağılım/`, kendi rolü (`priv.role.label`) **vurgulu değil** (sadece katalog: `.rehber .ben` yok) ve `document.querySelector('.rehber').textContent` `priv.notes` içeriğini içermez; evler hâlâ tıklanabilir (`scene.houses[x].g.onclick` var); ✕ kapatır; lobide de açılır.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (çekmece sağda `width:min(380px,52vw)`, `max-height:100%`, kaydırılabilir; bölümler: Masumlar/Hainler/Tarafsızlar → rol kartları (simge, ad, desc, ipucu); "Hain kopyaları" notu; "Dağılım" (DAGILIM ile mevcut oyuncu sayısı için hain/deli/saldırgan/pasif + Doktor hep/Polis 5+); "Bu oda" (süreler)). `KG_VER='2026-10-29b'`. **Step 4:** `--e2e` ✓ + telefon ekran görüntüsü. **Step 5: Commit** `Kasaba Gecesi: role guide drawer with tips and distribution rules`.

### Task 5: Belgeler ve deneme

- README (hızlı ifadeler, sınırlar, rehber), SKILL.md (protokol `hizli`, `iddia`/`hizli` olayları, `ipucu`), DURUM.md, tanıtım dosyası (yeni özellikler); commit `Docs: package 1b`.
- kasaba-test'e kurulum (komut gösterilip onay) ve botlarla deneme: bot `hizli` göndersin (rol iddiası) → gazete iddia kartı çıksın; ekran görüntüsü.
