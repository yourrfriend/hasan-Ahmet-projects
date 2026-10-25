# Sahne 2/3 — Gece Yürüyüşü ve Rol Animasyonları Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gece hamlesinde karakter mevcut konumundan hedefe mesafeye göre yürür, etiketleri onu izler; varınca rolüne özgü ~1 sn'lik hareket oynar; tuzak/mum/dinamit izleri gece boyu kalır; yalnız hamleyi yapan görür. Deneme (DENEME commit'leri) geri alınır ve yeniden yazılır.

**Architecture:** Tüm iş istemcide (`index.html`, sahne bölümü). Yeni, render'da **silinmeyen** bir `S_.aksiyon` katmanı rol hareketlerini taşır (zamanlayıcıyla eklenir/silinir); `S_.fx` bugünkü gibi her render'da yenilenir. Yürüyüş süresi `pickHouse`'ta render'dan önce hesaplanır (`anim.walkMs`), `moveBean` isteğe bağlı süre alır; etiketler karakter grubunun içine taşınır. `game.js` yalnız `priv.planted`'ı ev listesi yapar.

**Tech Stack:** Vanilla JS + SVG + CSS keyframe; Playwright e2e; Web Audio (`SFX`).

**Spec:** `docs/superpowers/specs/2026-10-24-kasaba-gecesi-sahne-design.md` (§5.2, §5.3, §5.5, §6 aşama 2, §7)

## Global Constraints

- Gizlilik: `state`/`priv` biçimi dışında hiçbir şey sunucuya eklenmez; animasyon ve izler yalnız `myId` için çizilir; başka oyuncunun sayfasında `.rol-fx` ve iz elemanı **olmaz**.
- Mesafeye bağlı süre **yalnız** gece hedef yürüyüşü (ve "Vazgeç"le eve dönüş) için; sabah/akşam dizileri, meydan hareketleri bugünkü 1 s / 0,6 s ile kalır.
- Hız 190 birim/sn; süre `clamp(500, mesafe/hız·1000, 3500)` ms; rol hareketi 800–1200 ms; `walkMs + hareket ≤ 5000`.
- `walkhop` yürüyüş boyunca sürer (`infinite`), varışta durur.
- Sahne "dokunulmaz" kuralı kullanıcı isteğiyle bu kapsamda açılmıştır; **ambiyans ve ses üretimi** (`// ---------- Ambiyans`) yalnız yeni ses eklemek için değişir.
- `KG_VER` artar (`'2026-10-25b'` → `'2026-10-26a'`); her görevden sonra `kontrol.sh`, arayüz görevlerinde `--e2e`.
- Commit mesajları İngilizce, sonunda `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **Hedef değiştirme**: yürürken başka ev seçilirse karakter bulunduğu yerden yeni hedefe yürür, eski rol hareketi iptal olur, çift ses çıkmaz. → Task 2 testi (e2e: iki tıklama).
2. **Vazgeç**: karakter evine yürür (mesafeye göre), iz (tuzak/mum/dinamit) silinir, kapı kapanır. → Task 2/3 (e2e Vazgeç).
3. **Sayfa yenileme gece ortasında**: `local.act` kaybolur ama sunucu hamleyi tutar; istemci yürüyüşü değil **varılmış** hali gösterir (hareket tekrar oynamaz), kalıcı izler `priv.planted`/`priv.candle`'dan gelir. → Task 3 (e2e: reload sonrası `.rol-fx` yok, karakter hedefte).
4. **Gece bitince**: devam eden zamanlayıcılar sabah dizisini bozmaz (`anim` yenilenince eski zamanlayıcılar işlemsiz). → Task 2 (zamanlayıcı `anim.t0` damgası kontrolü).
5. **Deli**: sandığı rolün hareketi oynar, iz bırakmaz (tuzakçı-deli tuzak çizmez mi? Çizer — Deli gerçek sanır; sunucu etkisiz sayar; iz de yalnız kendisi görür). → Task 3 (karar: Deli de izi görür).

---

### Task 0: Deneme kodunu geri al

**Files:** `kasaba-gecesi/index.html`

- [ ] **Step 1:** `git revert --no-edit a61ec30 a12bb0e` (iki DENEME commit'i). `kontrol.sh` → 3 ✓. `KG_VER` geri `'2026-10-24d'` olur; sonraki görev artırır.
- [ ] **Step 2:** Commit (revert commit'leri zaten oluşur).

---

### Task 1: `priv.planted` ev listesi (`game.js`)

**Files:**
- Modify: `kasaba-gecesi/sunucu/game.js` (`privFor`: `planted:r.planted.length` → `planted:r.planted.slice()`)
- Modify: `kasaba-gecesi/index.html` satır ~749: `(priv.planted||0)` → `(priv.planted||[]).length`
- Test: `kasaba-gecesi/sunucu/test/game.test.js`

- [ ] **Step 1: Başarısız test**

```js
test('privFor.planted dinamit konan evlerin listesidir',()=>{
  const R=fixed(['bombaci','hain','masum','masum','masum']);
  G.act(R,'u0',{ab:'u2'});G.advance(R);G.advance(R);G.advance(R); // gece 1 → gündüz → oylama → gece 2
  G.act(R,'u0',{ab:'u3'});G.advance(R);
  assert.deepStrictEqual(G.privFor(R,'u0').planted,['u2','u3']);
  assert.deepStrictEqual(G.privFor(R,'u1').planted,[]);
});
```
- [ ] **Step 2:** `node --test test/game.test.js` → 1 `not ok` (sayı dönüyor).
- [ ] **Step 3:** Uygula; istemcideki sayı kullanımını `.length` yap.
- [ ] **Step 4:** `kontrol.sh` → 3 ✓. **Step 5:** Commit `Kasaba Gecesi: priv.planted lists the mined houses`.

---

### Task 2: Yürüyüş, karakterin üstünde etiketler, ses zamanlaması

**Files:**
- Modify: `kasaba-gecesi/index.html`: CSS `.bean`, `.walking .hop`; `drawBean` (etiket alt grubu); `moveBean(b,x,y,s,fast,mode,ms)`; render döngüsü gece dalı (`entered`, etiketler); `pickHouse`; `anim` alanları.
- Test: `kasaba-gecesi/sunucu/test/e2e.js` (gece adımı genişler)

**Interfaces:**
- `walkMs(x0,y0,x1,y1) → ms` (clamp 500..3500, 190 birim/sn).
- `moveBean(b,x,y,s,fast,mode,ms)`: `ms` verilirse geçiş süresi odur (`style.transitionDuration`), yoksa bugünkü (1000 / fast 620). Yürüyüş sınıfı `ms` boyunca.
- `anim.walkMs`, `anim.walkT0` (= `anim.enteredAt`), `anim.hedef` (ev id) `pickHouse`'ta, render'dan **önce** mevcut `b.x,b.y` ile; Vazgeç'te eve dönüş için de hesaplanır (`anim.hedef=null`).
- Varış: `Date.now() ≥ anim.walkT0 + anim.walkMs`. Render'ı varışta ve hareket sonunda tetikleyen zamanlayıcılar `anim.t0` damgasıyla korunur (faz değişince işlemsiz).
- Etiketler: `drawBean` → `b.tag` (`g` + `rect` + `text`, karakterin üstünde, `y-44`), `setBeanTag(b,text,bg,fg)`; render SEN/HAİN/KOPUK için bunu kullanır (`tagAt` kalır: HEDEFİN/SENİN OYUN ev etiketleri için).
- Ses: varışta `SFX.knock()` (kapı/çalı/pencere) ya da hareket sonunda `SFX.door()` (içeri girenler).

- [ ] **Step 1: e2e'yi genişlet** (gece adımında, ev seçen ilk sayfa için):

```js
      // yürüyüş: 250 ms sonra karakter henüz hedefte değil; walkMs sonra hedefte, etiket karakterin üstünde
      const t0=Date.now();const walk=await p.evaluate(()=>anim.walkMs);assert.ok(walk>=500&&walk<=3500,'walkMs '+walk);
      const yolda=await p.evaluate(()=>{const b=scene.beans[myId];const r=b.g.getBoundingClientRect();const h=scene.houses[anim.hedef].g.getBoundingClientRect();return Math.hypot(r.x-h.x,r.y-h.y)});
      assert.ok(yolda>60,'250 ms sonra hâlâ yolda olmalı: '+yolda);
      await p.waitForTimeout(walk-(Date.now()-t0)+150);
      const varis=await p.evaluate(()=>{const b=scene.beans[myId];return{walking:b.g.classList.contains('walking'),tag:b.tag.textContent}});
      assert.strictEqual(varis.walking,false);assert.strictEqual(varis.tag,'SEN');
```
(Bu kod ilk `at` seçen sayfa için bir kez çalışır; `p.mouse.click` sonrası 250 ms bekleyip ölçer.)

- [ ] **Step 2:** e2e → BAŞARISIZ (`anim.walkMs` undefined).
- [ ] **Step 3:** Uygula (yukarıdaki arayüzler). `.walking .hop` → `infinite`; `.bean` geçişi `linear`? **Hayır**: yürüyüş için `linear`, diğerleri için mevcut eğri — `moveBean` `ms` verildiğinde `transition-timing-function:linear` de yazar, yoksa sıfırlar.
- [ ] **Step 4:** `kontrol.sh --e2e` → 4 ✓. Telefon görüntüsü (844×390) yürüyüş ortası.
- [ ] **Step 5:** Commit `Kasaba Gecesi: night walk timed by distance, tags ride on the character`.

---

### Task 3: Rol hareketleri ve kalıcı izler

**Files:**
- Modify: `kasaba-gecesi/index.html`: `buildScene` (`aksiyon` katmanı, `S_.aksiyon`), yeni `rolHareketi(role,house,kind)` ve `izCiz()` fonksiyonları, CSS keyframe'ler, render gece dalı (`entered` = varış + hareket), `SFX` (iki yeni ses: `swish`, `ding`).
- Test: `kasaba-gecesi/sunucu/test/e2e.js`

**Interfaces:**
- `ROL_HAREKET = {hain:{kind:'enter',ms:960,ciz:(g)=>…}, serikatil:…, …}` — anahtar `ROLES` key'i (deli için `priv.role.key` zaten sandığı rol). Her kayıt: `ms` (süre), `ciz(g,house,bean)` (SVG çizer, CSS sınıfı verir), `iz` (varsa kalıcı iz çizen fonksiyon), `ses` (SFX adı).
- `S_.aksiyon`: `topLayer`'dan sonra eklenen `g`; render **silmez**. `rolHareketi` başlangıçta `S_.aksiyon`'u boşaltır (önceki hareket iptal), hareketi ekler, `ms` sonra siler ve render ister; `anim.t0` damgası ile korunur.
- Hareket tetikleme: render döngüsü gece dalında "varıldı ve hareket başlamadı" durumunda bir kez (`anim.hareketT0` yoksa) `rolHareketi` çağırır; `entered` = varış + `ms` (içeri girenler).
- Kalıcı izler (her render'da `S_.fx`'e, yalnız gece ve yalnız kendim): Tuzakçı → `local.act.ab` evinin kapısında tuzak; Hortlak → `priv.candle` evinde mum; Bombacı → `priv.planted` listesindeki evlerde dinamit; Polis → `local.act.ab` kapısında kelepçe. Vazgeç'te `local.act` sıfırlanınca Tuzakçı/Polis izi gider.
- Tablo (spec §5.3) aynen; Büyücü `kind:'home'`: yürüyüş yok (`walkMs=0`), hedef eve çizgi + parlama `S_.aksiyon`'da 1000 ms; Hayatta Kalan `self`: yelek 900 ms; Masum: yok.
- Sesler: `swish` (bıçak), `ding` (doktor) `SFX`'e eklenir (Web Audio, mevcut `tone`/`noise`).

- [ ] **Step 1: e2e'yi genişlet** (aynı sayfada, varıştan sonra):

```js
      await p.waitForTimeout(150);
      const fx=await p.evaluate(()=>({n:document.querySelectorAll('#app .rol-fx').length,rol:priv.role.key}));
      assert.ok(fx.n>=1||fx.rol==='masum','rol hareketi görünmeli: '+JSON.stringify(fx));
      // başka oyuncu hiçbir şey görmez
      const other=all().find(q=>q!==p);assert.strictEqual(await other.evaluate(()=>document.querySelectorAll('#app .rol-fx, #app .iz').length),0);
      // yenilemede hareket tekrar oynamaz, karakter hedefte kalır
      await p.reload();await p.waitForFunction(()=>P.phase==='night'&&scene&&scene.beans[myId]);await p.waitForTimeout(800);
      assert.strictEqual(await p.evaluate(()=>document.querySelectorAll('#app .rol-fx').length),0);
```
- [ ] **Step 2:** e2e → BAŞARISIZ (`.rol-fx` yok).
- [ ] **Step 3:** Uygula: katman, tablo, 17 çizim, izler, sesler. Her çizim 5–15 satır SVG; renkler sahne paletinden (`#f1e3c8`, `#5b3a27`, `#ffd766`, `#e23b3b`, `#8cff5a`).
- [ ] **Step 4:** `kontrol.sh --e2e` → 4 ✓. Betikle (scratchpad) 6 rolün hareket anı görüntüsü (hain, doktor, polis, gözcü, tuzakçı, büyücü) telefon boyutunda; bak.
- [ ] **Step 5:** `KG_VER='2026-10-26a'`; SKILL.md "Bilinen tuzaklar"a: `S_.aksiyon` render'da silinmez, `S_.fx` silinir; yürüyüş süresi render'dan önce hesaplanır. Commit `Kasaba Gecesi: role actions at the target house, persistent night marks`.

---

### Task 4: kasaba-test'e yayın ve kullanıcı denemesi

- [ ] **Step 1:** push `sahne`; `ssh ionos … kur.sh kasaba-test kasaba-test.munupixi.com --surum sahne`; `/saglik` sürüm = HEAD.
- [ ] **Step 2:** Kullanıcıya: oda kur, botlar katılır (`bot.js`), her rol için geri bildirim (§7). Geri bildirim bu planın dışında yeni görev olur.

---

## Bitiş ölçütü (spec §6 aşama 2)

`kontrol.sh --e2e` yeşil; e2e'de yürüyüş, hareket, gizlilik ve yenileme kontrolleri geçer; kasaba-test'te kullanıcı denemesi yapılmış ve geri bildirim alınmıştır.
