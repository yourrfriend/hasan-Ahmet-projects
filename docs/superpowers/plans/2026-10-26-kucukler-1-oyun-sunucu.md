# Ertelenen küçükler 1 — oyun ve sunucu (uygulama planı)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DURUM'daki, canlı oyun davranışına dokunan ~30 küçük doğruluk/metin/sağlamlık maddesini kapatmak; kural ve düzen değişmez.

**Architecture:** Her görev bir dosya/alan; her madde kendi küçük testiyle. Rol etiketi `game.js`'e taşınır. Sunucu değişiklikleri `server.test.js`, sayfa değişiklikleri `hikaye.test.js`/`karsilastirma.test.js`, istemci metinleri `e2e.js`.

**Tech Stack:** Node 20+ `node:test`, Playwright e2e, taklit PostgREST (`test/taklit-rest.js`).

**Spec:** `docs/superpowers/specs/2026-10-26-kasaba-gecesi-ertelenen-kucukler-design.md` (madde numaraları oradaki doğrulama tablosuna/DURUM'a göre)

## Global Constraints
- Dal `kucukler-1` (`main`'den); her görev sonunda commit; sonunda kasaba-test → canlı.
- Gizli bilgi `P`'ye girmez; sunucu yetkilidir; sabitler `game.js`'te; `index.html` değişince `KG_VER` artar (tek kez, son görevde `2026-10-31g`).
- `index.html` uzun satırlar: satır içi `//` yorum yok.
- Kural/eşik/düzen değişmez. Metinler Türkçe ve kısa.
- Her görev sonunda `.claude/skills/kasaba-gecesi/scripts/kontrol.sh`; istemciye dokunan görevlerde `--e2e`.

## Review Focus
1. Hırsız'ın çaldığı rol hainken geçmiş/hikâye satırları (Task 1 hikâye `kimden`, Task 4 tohum takımı) → testlerde `calinan_rol` dolu vaka.
2. İzleyici (oyuncu olmayan üye) `hazir`/`gordum` gönderir → reddedilir ama bağlantı kopmaz (Task 5 testi).
3. Çok baytlı karakter (ör. "ğ") tam parça sınırına denk gelen POST gövdesi doğru ayrıştırılır (Task 5 `govdeOku` testi: 3 parçalı istek).
4. `hazir` 10 tavanını aşan oyuncu yine rövanşa hazır sayılır, yalnız olay yazılmaz (Task 5 testi).
5. ⚡ bekleme sırasında gönderim engeli istemcide; sunucu zaten reddediyor (e2e: ikinci dokunuşta sunucuya mesaj gitmez).

---

### Task 1: Hikâye satırları (madde 11, 12, 13-hikâye)
**Files:** Modify `kasaba-gecesi/sayfa/hikaye.js:37-40,69-81`, `kasaba-gecesi/sunucu/game.js` (yeni `rolEtiketi`, dışa aktarım), Test `kasaba-gecesi/sunucu/test/hikaye.test.js`, `test/game.test.js`.
**Interfaces:** Produces `G.rolEtiketi(rol_key, takim, deli_gibi) → string` (ör. `'Polis'`, `'Polis (Hain)'`, `'Deli (Doktor sandı)'` — mevcut üç kopyanın ortak davranışı; `index.html:976` `rolEtiket` ile `ortak.js:20` `rolAdi` arasındaki farkı builder tek kurala indirir, test adları sabitler). `hikaye.js` `rolEtiket` yerine `ROLES`'la birlikte verilen `etiket` fonksiyonunu ya da `require('../sunucu/game.js').rolEtiketi`'yi kullanır (UMD: tarayıcıda `window.KG_GAME.rolEtiketi`).
- [ ] Test `game.test.js`: `rolEtiketi('polis','inn')==='Polis'`, `('polis','imp')==='Polis (Hain)'`, `('hain','imp')==='Hain'`, `('deli','inn','doktor')` Deli etiketi (mevcut `ortak.js:20` davranışı), `null` → `'?'`.
- [ ] Test `hikaye.test.js`: `gece_hamle` `kim` Seri Katil → satır `/evine girdi/`; `gece_sonuc.olenler[{id,sekil:'knife',kimden:[hainId]}]` → ölüm satırı `/— .* öldürdü/`; `gunduz_sonuc.provoke:'u3'` → `/🔥 .* kışkırtılmıştı/`.
- [ ] Çalıştır: `npm test` → üç iddia FAIL.
- [ ] Kod: `game.js` `rolEtiketi`; `hikaye.js` HAMLE `serikatil`, ölüm satırına `kimden`, `provoke` satırı; yerel `rolEtiket` kaldır. `ortak.js` `rolAdi` ve `index.html` `rolEtiket` → `KG_GAME.rolEtiketi` (ince sarmalayıcı kalabilir).
- [ ] `npm test` PASS; `kontrol.sh --e2e` (sayfa) yeşil. Commit: `Story: who killed, provoke line, Seri Katil move; single role label helper`.

### Task 2: Karşılaştırma — iki tarafsız (madde 19)
**Files:** Modify `kasaba-gecesi/sayfa/karsilastirma.js:115`, Test `test/karsilastirma.test.js`.
- [ ] Test: ben `neu` (Hırsız), o `neu` (Bombacı), oyunu `neu` kazandı → `ayniTarafZafer` 0, `karsiTaraf` 1.
- [ ] FAIL → Kod: `ayniTaraf = b.takim===p.takim && b.takim!=='neu'`. PASS. Commit: `Comparison: two neutrals are not the same side`.

### Task 3: Oyun olayları (madde 38, 39, 32, 66)
**Files:** Modify `game.js:209` (büyücü), `startGame` (`R.logSeq=0`), `resolveNight:265/398` (çoklu neden), `rolDagit:78-84`; Test `test/game.test.js`.
- [ ] Test: büyücü hedef seçip tahmin vermezse `gece_hamle` olayı yazılmaz; iki maçlık `R`'de ikinci maçın ilk olayı `sira===1`; bıçaklanan+yıldırımlı kurban → `olenler[0].sekiller` `['knife','bolt']` içerir ve gazetede yıldırım kartı çıkar (`gazeteFor` çıktısında `tur:'yildirim'` — mevcut kart adı builder'dan); `rolDagit(bag,players,{},{deneme:0,kacinmaP:1})` dizi döner.
- [ ] FAIL → Kod: `k==='buyucu'&&!tahmin` ise loglama; `startGame` başında `R.logSeq=0` (rövanş `rovans_basladi` `start`'tan önce yazıldığı için `server.js` sırası korunur — `server.test.js` mevcut iddiası geçmeli); `olenler[].sekiller` (ilk neden `sekil` kalır, hikâye/kapanış alanları değişmez); `enIyi=shuffle(bag.slice())` başlangıç. PASS. Commit: `Game events: no empty wizard guess, per-game sira, multi-cause deaths, rolDagit fallback`.

### Task 4: Kayıt yazıcısı (madde 3, 7, 8, 63, 64, 65)
**Files:** Modify `kayit.js:30-37,92-100,113-115,120`, `server.js:287-289,398`; Test `test/kayit.test.js`, `test/server.test.js`.
- [ ] Test `kayit.test.js`: aynı `{ad,renk,sapka}` ile ikinci `profil` → istek yok; farklı → istek; `yazilan` = gerçek 2xx istek sayısı (başlangıç 4, bitişte 1+N); `kapat()` süren işi bekler (taklit 300 ms gecikme → `await k.kapat()` sonrası istek tamamlanmış); `sonRoller` `calinan_rol` dolu → `{key:'hirsiz',team:'neu'}`; URL `limit=`+`TEKRAR.gecmisUz`.
- [ ] Test `server.test.js`: geçmişi boş (`[]`) kayıtlı oyuncu ikinci join'de `sonRoller` tekrar çağrılmaz (sahte sayar).
- [ ] FAIL → Kod. `server.js` `close()`: `kayit.kapat()` promise'ini `server.close` geri çağrısından önce bekler (3 sn tavan). PASS. Commit: `kayit: skip identical profile writes, exact yazilan, kapat awaits, seed fixes`.

### Task 5: Sunucu yolları (madde 9, 31, 36, 33, 37, 40, 25, 20, 28, 22, 21)
**Files:** Modify `server.js` (`hazir` tavanı :331; `gordum/hazir` oyuncu şartı :331-332; `skorIsle` tek yer :284/316/329 + `s.ad` :90 + `skorCache` :92; `bosalt` try/catch :284; `ipBirlestirme` temizliği :161; bağla `isaretle` IC sonrası :145-149; birleştirmede JWKS yenileme :167; `govdeOku` utf8 :84), `kod.js:222` (boş hostname → `log('UYARI…')`); Test `test/server.test.js`, `test/kod.test.js`.
- [ ] Testler (her madde bir `test(...)`): izleyici `hazir` → `P.hazir` değişmez, bağlantı açık; 11 kez `hazir` aç/kapa → olay sayısı ≤10, `P.hazir` son durum; oyun bitince skor bir kez işlenir ve `start`/`cancel` ile de tek kez (sahte `kayit` olaylarından `bitis` sonrası `P.skor`); `look` ile ad değişince skor adı güncel; `stateMsg` `skorListesi` aynı `P.skor` için aynı dizi referansı (önbellek); `bosalt` fırlatırsa `flush` yine yayınlar; `ipBirlestirme` 5 dk sonra temizlenir (clock); bağla isteğinde IC 503 → `kontrol` hakkı yanmaz (ikinci istek 503 değil `ip_sinir` değil); birleştirmede bilinmeyen `kid` → `jwksGetir` bir kez çağrılır (sahte); 3 parçalı UTF-8 gövde (`'ğ'` baytları bölünmüş) doğru JSON; `kod.test.js`: `hostnames:[]` → `log` uyarısı ve doğrulama yine kabul.
- [ ] FAIL → Kod (tasarım "Kararlar"). PASS. Commit: `Server: hazir cap, players-only hazir/gordum, single score hook, body utf8, merge JWKS retry, cap after IC`.

### Task 6: E-posta metni (madde 29, 30)
**Files:** Modify `eposta.js:235-241`, Test `test/eposta.test.js`.
- [ ] Test: `kodMaili({sayfa:'https://x/<a>'})` html'de `&lt;a&gt;` kaçışlı; `text` ve `html` "Kodu kimseyle paylaşma" içerir.
- [ ] FAIL → Kod. PASS. Commit: `Mail: escape page link, add do-not-share line`.

### Task 7: İstemci (madde 69, 26, 27, 55, 56, 13-istemci)
**Files:** Modify `kasaba-gecesi/index.html` (:398 kod ekranı metni; :254/311 `hesap.anonim` kaldır; :314-326 `hesapHataMetni` `error_code` tablosu; :1095/1103 ⚡ bekleme engeli + `⚡ n/4`; :1110 etiketler `HIZLI_TUR`'dan; `KG_VER='2026-10-31g'`), Test `test/e2e.js`.
- [ ] e2e iddiaları: kod ekranında "15 dk" ve "gecikebilir" metni; ⚡ bekleme sırasında ikinci dokunuş sunucuya `hizli` mesajı göndermez (sunucu tarafı `R.g.hizli` sayacı aynı kalır) ve düğme `⚡ 1/4` gösterir; `hesapHataMetni` için `error_code:'otp_expired'` → "süresi dolmuş" metni (sahte GoTrue yanıtı); seçenek etiketleri `HIZLI_TUR` anahtar sayısına eşit.
- [ ] FAIL → Kod. `kontrol.sh --e2e` PASS. Commit: `Client: code screen hints, error-code table, quick-claim counter and guard, labels from HIZLI_TUR`.

### Task 8: Görsel üç madde (35, 70, 71) ve yayın
**Files:** scratchpad Playwright betiği (`sigma.js` benzeri), gerekirse `index.html`/`ortak.css`.
- [ ] 844×390 ve 956×440: 4 kişilik maç sonu (rövanş düğmeleri görünür mü), 7 kişi gece 1 ilk 4 sn (balon üstteki evin adını örtüyor mu), 12 kişi gündüz (sol alt ev ve sohbet çipi). Ekran görüntülerini kullanıcıya gönder.
- [ ] Sorun görülen madde için küçük düzeltme + e2e iddiası (ör. balon süresince ev adı `opacity` ya da balonun `bottom`'a alınması); yoksa DURUM'a "görüldü, sorun yok".
- [ ] `kontrol.sh --e2e`; DURUM güncelle (kapanan maddeler listeden silinir); commit; `/yayinla kasaba-test kucukler-1` (onay) → kullanıcı → canlı → PR `main`.
