# Sahne 1/3 — Rol Dağılımı ve Denge Simülasyonu Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `autoSetup(n)` tasarımdaki eşik kurallarına göre yeniden yazılır (özel rol en fazla bir kez, hain/tarafsız/deli eşikleri, masumların %75'i yetenekli, bilgi rolü ≥ hain); kısıtlar testle kilitlenir; `test/denge.js` aracı her oyuncu sayısı için kazanma oranlarını ölçer ve tablo README'ye girer.

**Architecture:** Dağılım `game.js` içinde tek fonksiyonda kalır (`autoSetup`), çıktı biçimi değişmez (`{SETUP id: adet}`), `startGame` dokunulmaz. Simülasyon `game.js`'in dışa verdiği API ile (`createGame/startGame/act/vote/advance/privFor`) oynar; `npm test`'e girmez, komutla çalışır.

**Tech Stack:** Node 20, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-24-kasaba-gecesi-sahne-design.md` (§5.1, §5.1.1, §5.5, §6 aşama 1, §7)

## Global Constraints

- Sabitler ve kurallar yalnız `game.js`'te; `SETUP`, `ROLES`, `MADPOOL`, `INVGROUPS` değişmez.
- Deli sayımı: deli masum takımıdır ama "yetenekli masum" havuzundan değildir.
- Bilgi rolleri: Polis, Gözcü, İzci, Dedektif, İspiyoncu (masum sürümleri).
- Her değişiklikten sonra `.claude/skills/kasaba-gecesi/scripts/kontrol.sh` (e2e gerekmez; arayüz değişmiyor).
- Commit mesajları İngilizce, sonunda `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. `n=4`: 1 hain + Doktor + 2 havuz (Polis yok) → Masum 0; oyun 4 kişiyle yine başlar. → Task 1 testi.
2. `n=12`: 3 hain (en az 1 düz, en çok `floor(3/2)=1` yetenekli), 2 saldırgan tarafsız, 1 pasif, 1 deli, 5 masum (4 yetenekli + 1 Masum); `n=10`: m=4 → 4 yetenekli (Doktor, Polis, 2 bilgi), Masum 0; toplam n. → Task 1 testi.
3. Rastgelelik: aynı n'de farklı çağrılar farklı rol **kümeleri** üretir (tekdüze değil), ama kısıtlar hep tutar. → Task 1 (500 tekrar).
4. `denge.js` hiç oyunu sonsuz döngüye sokmaz (her oyun en çok 60 faz; tıkanırsa "bitmedi" sayılır). → Task 2.
5. `denge.js`'te hain hamlesi gece rolü olan haini de kapsar (yetenek yerine öldürme seçer) — yoksa yetenekli hainler ölü ağırlık olur ve oran yanlış çıkar. → Task 2.

---

### Task 1: `autoSetup(n)` yeniden ve kısıt testleri

**Files:**
- Modify: `kasaba-gecesi/sunucu/game.js` (`autoSetup`, ~satır 50–57)
- Test: `kasaba-gecesi/sunucu/test/game.test.js` (mevcut `'rol dağılımı oyuncu sayısına uyar'` testi kalır)

**Interfaces:**
- Produces: `autoSetup(n) → {[setupId]: adet}` (aynı biçim). Dışa aktarılan yeni sabitler: `DAGILIM = {hain:(n)=>…, saldirgan:(n)=>…, pasif:(n)=>…, deli:(n)=>…}` (test ve README tablo üretimi için; `return{…}` listesine `DAGILIM` eklenir).
- Kurallar (spec §5.1, kalibrasyon sonrası): hain 4–8:1, 9–12:2; saldırgan (serikatil/bombaci/hirsiz/buyucu, eşit) 9+:1, 12:2 (iki farklı rol); pasif (hayatta/hortlak, eşit) 9+:1; deli 6+:1; hain tarafı: en az 1 `hain`, en çok `floor(hain/2)` yetenekli hain (havuz: temizlikci, suclayici, polis_h, gozcu_h, dedektif_h, tuzakci_h, izci_h, ispiyoncu_h, provokator_h; tekrarsız; kalanlar `hain`); masum `m = n − hain − saldırgan − pasif − deli`; yetenekli `min(m, max(ceil(0.75·m), hain+1), 8)`: doktor hep, polis n≥5, kalan havuzdan (gozcu, izci, dedektif, tuzakci, ispiyoncu, provokator) tekrarsız ve **önce bilgi rolleri** (gozcu, izci, dedektif, ispiyoncu; polis zaten) ta ki bilgi rolü sayısı ≥ hain olana kadar, sonra karışık; gerisi `masum`. Havuz biterse `masum`.

- [ ] **Step 1: Başarısız testleri yaz**

```js
const BILGI=['polis','gozcu','izci','dedektif','ispiyoncu'];
const OZEL=Object.keys(G.ROLES).filter(k=>!['masum','hain'].includes(k));
test('rol dağılımı: eşikler, tekrarsız özel roller, bilgi rolü ≥ hain, %75 yetenekli',()=>{
  const bekle={4:[1,0,0,0],5:[1,0,0,0],6:[2,0,0,1],7:[2,1,0,1],8:[2,1,0,1],9:[2,1,1,1],10:[3,1,1,1],11:[3,2,1,1],12:[3,2,1,1]}; // hain, saldırgan, pasif, deli
  for(let n=4;n<=12;n++){
    const kumeler=new Set();
    for(let i=0;i<500;i++){
      const c=G.autoSetup(n);const ids=Object.keys(c);
      assert.strictEqual(Object.values(c).reduce((a,b)=>a+b,0),n,'toplam '+n);
      const say=(f)=>ids.filter(f).reduce((a,id)=>a+c[id],0);
      const hain=say(id=>G.SETUP.find(s=>s.id===id).team==='imp');
      const sald=say(id=>['serikatil','bombaci','hirsiz','buyucu'].includes(id));
      const pasif=say(id=>['hayatta','hortlak'].includes(id));
      assert.deepStrictEqual([hain,sald,pasif,c.deli||0],bekle[n],'n='+n+' '+JSON.stringify(c));
      for(const id of ids)if(id!=='masum'&&id!=='hain')assert.strictEqual(c[id],1,'özel rol tekrar: '+id+' n='+n);
      assert.ok((c.hain||0)>=1,'düz hain şart');
      assert.ok(say(id=>id.endsWith('_h')||['temizlikci','suclayici'].includes(id))<=Math.floor(hain/2),'yetenekli hain sınırı n='+n);
      assert.ok(c.doktor===1,'doktor hep');assert.strictEqual(c.polis||0,n>=5?1:0,'polis 5+');
      const bilgi=say(id=>BILGI.includes(id));assert.ok(bilgi>=hain,'bilgi rolü ≥ hain n='+n+' '+JSON.stringify(c));
      const m=n-hain-sald-pasif-(c.deli||0);const yetenekli=m-(c.masum||0);
      assert.strictEqual(yetenekli,Math.min(m,Math.max(Math.ceil(0.75*m),hain+1),8),'yetenekli masum sayısı n='+n);
      kumeler.add(ids.sort().join(','));
    }
    if(n>=7)assert.ok(kumeler.size>1,'n='+n+' hep aynı küme');
  }
});
```
(Havuz üst sınırı 8 = doktor + polis + 6 havuz; `min(…,8)` bunun için.)

- [ ] **Step 2: Başarısız olduğunu gör**

Run: `cd kasaba-gecesi/sunucu && node --test test/game.test.js 2>&1 | grep -E '^not ok|# fail'`
Expected: 1 `not ok` (mevcut dağılım: n=7'de deli/hain farkı ya da yetenekli sayısı).

- [ ] **Step 3: `autoSetup`'ı spec'e göre yeniden yaz; `DAGILIM` sabitini ekle ve dışa aktar**

- [ ] **Step 4: Testler**

Run: `node --test test/game.test.js 2>&1 | grep -E '^not ok|# (pass|fail)'`
Expected: `# fail 0` (rastgele oyun testleri 4/7/12 yeni dağılımla da biter).

- [ ] **Step 5: Commit**

```bash
git add kasaba-gecesi/sunucu/game.js kasaba-gecesi/sunucu/test/game.test.js
git commit -m "Kasaba Gecesi: rule-based role distribution (unique special roles, thresholds)"
```

---

### Task 2: `test/denge.js` simülasyon aracı ve README tablosu

**Files:**
- Create: `kasaba-gecesi/sunucu/test/denge.js`
- Modify: `kasaba-gecesi/sunucu/package.json` (`"denge": "node test/denge.js"` script)
- Modify: `README.md` ("Roller" paragrafından sonra "Rol dağılımı" alt bölümü: eşik tablosu + simülasyon tablosu + "ölçüm aracı" notu)
- Modify: `.claude/skills/kasaba-gecesi/SKILL.md` (Mimari: dağılım kuralı ve `denge.js`)

**Interfaces:**
- Consumes: `G.createGame, startGame, act, vote, advance, privFor, alivePlayers, ROLES, SETUP, DAGILIM`.
- Komut: `node test/denge.js [oyun=2000] [n=4-12]` → stdout tablo (sabit genişlik): `n | masum% | hain% | tarafsız% | ort.gün | 1.gece ölüm | bitmeyen` ve bant dışı satırlarda `!` işareti. `process.exit(0)` her durumda (rapor aracı).
- Strateji (spec §5.1.1): gece — hain `kill` yaşayan masum/tarafsız rastgele (yetenekli hain de `kill`); serikatil/hirsiz `ab` rastgele; bombaci her gece `ab` rastgele, 3. geceden sonra `det`; buyucu `ab` rastgele + `guess` rastgele rol; doktor/polis/gozcu/izci/dedektif/tuzakci/ispiyoncu/provokator `ab` rastgele (kendisi hariç); hayatta `ab:'self'` ilk 3 gece; hortlak `ab` rastgele. Gündüz — her yaşayan oyuncu oy verir: hain → rastgele masum/tarafsız; diğerleri → şüpheli: `privFor(id).notes` içinde "evine bu gece N kişi geldi" ya da "evine gitti" geçen bir **ad** (nameOf ile id'ye çevrilir) ve o kişi o gece ölen evlerle ilişkiliyse; yoksa rastgele yaşayan (kendisi hariç). Oylar `G.vote` ile; faz `G.advance` ile. Oyun 60 faz geçişinde bitmezse `bitmeyen` sayılır.

- [ ] **Step 1: Aracı yaz**; `node test/denge.js 200` ile hızlı deneme.

Run: `cd kasaba-gecesi/sunucu && node test/denge.js 200 | head -12`
Expected: 9 satır (n=4..12), her satırda yüzdeler toplamı ≈ 100, `bitmeyen` 0.

- [ ] **Step 2: Tam koşum** — `node test/denge.js 2000` (süre: < 60 sn). Çıktıyı README tablosuna yapıştır; bant dışı satırları yazıda belirt ("rapor eşiği; eşik değişikliği kullanıcı kararı").

- [ ] **Step 3: `kontrol.sh`** → Expected: 3 ✓ (testler değişmedi).

- [ ] **Step 4: Commit**

```bash
git add kasaba-gecesi/sunucu/test/denge.js kasaba-gecesi/sunucu/package.json README.md .claude/skills/kasaba-gecesi/SKILL.md
git commit -m "Kasaba Gecesi: balance simulation tool and distribution table"
```

---

## Bitiş ölçütü (spec §6 aşama 1)

`kontrol.sh` yeşil; `autoSetup` kısıt testi 500×9 geçer; `npm run denge` tablo üretir ve README'de durur. Canlıya `/yayinla kasaba sahne` ile alınabilir (önce kullanıcı tabloyu onaylar; §7).
