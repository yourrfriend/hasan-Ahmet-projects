# Yıldız ekonomisi 3e — vitrin — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Oyuncu en çok 3 kazanımını (ödenmiş set, başarı kademesi, rozet) vitrinine koyar; lobide başkasının karakterine dokununca kart gösterir.

**Architecture:** Kozmetik yolu: seçim `kg_look.vitrin` (cihaz), `look.vitrin` ile sunucuya; sunucu `G.vitrinGecerli` ile envantere göre süzer (`mem.istenen` kalıbı), lobi listesi `vitrin:[id]` taşır. Envanter göç 025 ile `setler`/`rozetler` taşır.

**Tech Stack:** Node, Postgres 17 (`kg-pgtest`), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-29-kasaba-gecesi-yildiz-3-vitrin-design.md`

## Global Constraints
- Dal `yildiz-3-vitrin`; commit İngilizce + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `PW_CHROMIUM=/opt/google/chrome/chrome kontrol.sh [--e2e]`; satır içi `//` yok; `KG_VER` → `2026-11-11a`.
- `VITRIN_EN_COK=3`; kimlikler `set:<key>`, `basari:<key>`, `rozet:<key>`; `envanter_oku` son gövdesi 019.

## Review Focus
1. Sahip olunmayan/bilinmeyen parça lobiye çıkmaz (istemci elle göndermiş olsa da) — game.test + server.test.
2. Envanter sonradan gelince istenen vitrin uygulanır — server.test.
3. Misafirin vitrini boş — server.test.
4. Kart yalnız lobide ve yalnız başkasının karakterinde; kendi karakteri ayar açar — e2e.
5. Profilde 4. parça eklenemez — e2e.

---

### Task 1: Kurallar + göç 025
**Produces:** `VITRIN_EN_COK`; `vitrinParca(id)→{ico,ad}|null` (set: `ico+' '+n+' seti'`? → `{ico:S.ico, ad:S.n+' seti'}`; başarı: `{ico:KADEME_SIMGE[kademe-1], ad:B.n}` kademe envanterden ⇒ imza `vitrinParca(id, envanter)`; rozet: `{ico,ad:n}`); `vitrinGecerli(liste, envanter)→string[]` (envanter `{setler:[key], rozetler:[key], basarilar:{key:{kademe}}}`); `envanter_oku.setler`, `.rozetler`.
- [ ] Failing game.test (`vitrinGecerli`: `['set:ejder','basari:yalniz_kurt','rozet:ilk_mac','set:korsan']` + envanter {setler:['ejder'],rozetler:['ilk_mac'],basarilar:{yalniz_kurt:{kademe:3},bekci:{kademe:0}}} → `['set:ejder','basari:yalniz_kurt','rozet:ilk_mac']`; `basari:bekci`, `set:korsan` (ödenmemiş), `x:y`, tekrar, sayı olmayan düşer; 4 geçerli → ilk 3; `vitrinParca('basari:yalniz_kurt',env)` → `{ico:'🥇',ad:'Yalnız kurt'}`, `set:ejder` → `{ico:'🐉',ad:'Ejder seti'}`) ve test.sql 37 (`envanter_oku` `setler`, `rozetler`). RED → uygula → GREEN → commit `Showcase: vitrin rules and inventory sets/badges (migration 025)`.

### Task 2: Sunucu + istemci
**Produces:** `look.vitrin` → `mem.istenen.vitrin`, `mem.vitrin=G.vitrinGecerli(...)`; envanterAyarla sonrası yeniden uygulama (mevcut `applyLook(mem.istenen)`); `lobbyOf` `vitrin:[]`; envanter `setler/rozetler`; istemci `sendHello` `vitrin:myLook.vitrin||[]`; lobide başkasının gövdesine dokununca `ui.vitrinKart=id` → `.vitrin-kart` (ad, parçalar `.vitrin-parca`, boşsa "Vitrini boş", kapat düğmesi); `/ben` `.vitrin` bölümü (`.vitrin-sec[data-id]` düğmeleri "Vitrine koy"/"Vitrinde ✓", 3 doluysa diğerleri pasif ve "Vitrin dolu (en çok 3)").
- [ ] Failing server.test (envanter `{setler:['ejder'],rozetler:['ilk_mac'],basarilar:{yalniz_kurt:{kademe:3}}}`, look `vitrin:['set:ejder','set:korsan','rozet:ilk_mac']` → lobide `['set:ejder','rozet:ilk_mac']`; misafir `[]`), e2e (lobi kartı; profil seçici, 4.'de dolu). RED → uygula → GREEN → commit `Showcase: server validation, lobby card, profile picker`.

### Task 3: kasaba-test + inceleme + belgeler
- [ ] Push; göç 025; `kur.sh kasaba-test`; bot denemesi; son inceleme; DURUM/CLAUDE/bellek.
