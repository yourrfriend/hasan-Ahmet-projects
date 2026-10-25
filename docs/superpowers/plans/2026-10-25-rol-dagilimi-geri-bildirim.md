# Rol dağılımı geri bildirim paketi — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4–6 kişide Masum yok / 7+'da 1; tek hainli oyunda hain %50 sürümlü; aynı odada (ve Supabase geçmişinden) aynı kişiye aynı rolün üst üste gelmesi %80 eğilimle azalır.

**Architecture:** Üç kural `game.js`'te (`autoSetup` + yeni saf `rolDagit`), geçmiş `R.rolGecmisi` (oda ömrünce, gizli). Supabase tohumlaması `kayit.js`'e tek okuma (`sonRoller`) + `server.js` join'de arka plan çağrısı; başlatma hiç beklemez. Ölçüm `test/denge.js`, belge README.

**Tech Stack:** Node 20+ (`node:test`), PostgREST (Supabase), taklit PostgREST (`test/taklit-rest.js`).

**Spec:** `docs/superpowers/specs/2026-10-25-kasaba-gecesi-rol-dagilimi-geri-bildirim-design.md`

## Global Constraints

- Dal `rol-dagilimi` (`gecmis` üzerinden); her görev sonunda commit (İngilizce mesaj); push ayrı karar.
- `game.js` saf kalır, Node/tarayıcı sarmalı ve `return{…}` dışa aktarımı bozulmaz; sabitler yalnız `game.js`'te.
- `autoSetup(n) → {id: adet}` imzası korunur; `DAGILIM.hain/saldirgan/pasif/deli` değişmez (`bekle` tablosu aynı).
- Gizli bilgi `P`'ye girmez: `rolGecmisi` `SECRET_KEYS`'e eklenir (`test/game.test.js:7`).
- Sabit değerler (spec): `DAGILIM.masum = n => n >= 7 ? 1 : 0`; `DAGILIM.tekHainSurumP = 0.5`; `TEKRAR = {kacinmaP: 0.8, gecmisUz: 5, deneme: 200, ceza: {hemen: 4, yakin: 1, takim: 2}}`.
- Ceza `key` üzerinden (Polis ve Polis-hain aynı), takım tekrarı yalnız `imp` için; Deli `key='deli'`; Hırsız geçmişe `hirsiz`.
- İptal edilen maç da geçmişe girer (geçmiş `startGame`'de yazılır).
- Supabase: yalnız `service_role`, 3 sn zaman aşımı, hata sessiz; kayıt kapalı/misafir → atlanır; yalnız boş girdi doldurulur.
- Her görev sonunda `.claude/skills/kasaba-gecesi/scripts/kontrol.sh` (son görevde `--e2e`).

## Review Focus

1. 12 kişide yetenekli havuz (8 rol) yeter mi: m=6, masum 1 → 5 yetenekli; 4 kişide m=3, masum 0 → Doktor + 2 (Polis yok) → Task 1 testi n=4 ve n=12 için adet ve "özel rol tekrar yok".
2. Tek hain sürümlü seçildiğinde "bilgi rolü ≥ hain" ve "her özel rol en fazla bir kez" hâlâ sağlanmalı (`gozcu` ve `gozcu_h` farklı id, ikisi de çıkabilir) → Task 2 testi 500 çekimde doğrular.
3. Geçmişi olmayan oyuncu (yeni katılan) cezasız; yalnız bazı oyuncuların geçmişi varken dağıtım yine tüm torbayı dağıtır → Task 3 testi karışık geçmiş.
4. Rövanşta oyuncu listesi değişir (biri ayrıldı, biri yeni) — geçmiş `pubId` ile eşleşir, ayrılanın kaydı kalır ve dönünce kullanılır → Task 3 testi (lobiye dön → yeni listeyle başlat).
5. Tohumlama yanıtı maç başladıktan sonra gelirse oda belleğini ezmemeli → Task 4 server testi (gecikmeli taklit).

---

### Task 0: Dal

- [ ] `git checkout -b rol-dagilimi gecmis`; `kontrol.sh` yeşil.

### Task 1: Masum eşiği

**Files:** Modify `kasaba-gecesi/sunucu/game.js` (`DAGILIM`, `autoSetup`), `kasaba-gecesi/sunucu/test/game.test.js:284` bloğu, `README.md:12-19`.

**Interfaces:** Produces `DAGILIM.masum(n)`; `autoSetup` artık `masum = DAGILIM.masum(n)`, `yetenekli = m − masum`.

- [ ] **Test:** `game.test.js` "rol dağılımı: eşikler…" bloğuna ekle: `assert.strictEqual(c.masum||0, n>=7?1:0,'masum n='+n)`; 500 çekimde her n için toplam n, özel rol tekrar yok, Doktor hep, Polis 5+, bilgi ≥ hain korunur (mevcut iddialar). "%75 yetenekli" ifadesi test adından kalkar.
- [ ] Çalıştır: `npm test` → n=5,6 için `masum` iddiası FAIL.
- [ ] **Kod:** `DAGILIM.masum=n=>n>=7?1:0`; `autoSetup`'ta `const yetenekli=m-DAGILIM.masum(n)` (eski `min(m,max(ceil(0.75m),hain+1),8)` kalkar; `Math.min(yetenekli, 8)` güvenlik için kalsın). Yorum satırındaki formülü güncelle.
- [ ] `npm test` PASS; `node -e` ile 4–12 için `masum` ortalaması 0/1 doğrula.
- [ ] README `Rol dağılımı` paragrafı: "4–6 kişide Masum yok, 7+ kişide 1 Masum, gerisi yetenekli".
- [ ] Commit: `Kasaba Gecesi: no Masum under 7 players, exactly one from 7 (feedback package 1/3)`.

### Task 2: Tek hain sürümü

**Files:** Modify `game.js` (`DAGILIM.tekHainSurumP`, `autoSetup` hain bölümü), `test/game.test.js:284` bloğu, `test/denge.js:11` (env), README tablo satırı.

**Interfaces:** Produces `DAGILIM.tekHainSurumP` (sayı); denge: `DAGILIM_TEKHAINSURUMP=0|0.5|1` env.

- [ ] **Test:** aynı blokta: sürümlü hain sayısı `≤ Math.ceil(hain/2)`; `hain>=2` ise `c.hain>=1`; n=5 için 500 çekimde sürümlü hain oranı 0,35–0,65 arası; `DAGILIM.tekHainSurumP=0` geçici verilince hep düz Hain, `=1` verilince hep sürümlü (sonra 0.5'e geri al). Eski `'düz hain şart'` ve `floor(hain/2)` iddiaları kaldır.
- [ ] `npm test` → FAIL (sürümlü oran 0).
- [ ] **Kod:** `autoSetup`'ta `const surumlu = hain===1 ? (Math.random()<DAGILIM.tekHainSurumP?1:0) : Math.floor(hain/2)`; `yh=shuffle([...]).slice(0,surumlu)`. `denge.js:11` döngüsünden sonra: `if(process.env.DAGILIM_TEKHAINSURUMP)G.DAGILIM.tekHainSurumP=+process.env.DAGILIM_TEKHAINSURUMP`.
- [ ] `npm test` PASS.
- [ ] README tablo satırı "hain (en çok yarısı yetenekli)" → "hain (tek hain %50 sürümlü; 2 hainde 1 sürümlü + 1 düz)".
- [ ] Commit: `Kasaba Gecesi: single traitor is a variant role half the time (feedback package 2/3)`.

### Task 3: Tekrar eğilimi (oda belleği)

**Files:** Modify `game.js` (`TEKRAR` sabiti, `tekrarCezasi`, `rolDagit`, `createGame`, `startGame:123-124`, dışa aktarım), `test/game.test.js` (`SECRET_KEYS`, yeni test).

**Interfaces:**
- `tekrarCezasi(rol:{key,team}, gecmis:[{key,team}] /*en yeni önde*/) → number`
- `rolDagit(bag:[{key,team}], players:[{id}], gecmis:{[id]:[{key,team}]}, opts?:{kacinmaP,deneme}) → [{key,team}]` (players ile hizalı; `opts` yalnız test/ölçüm için, varsayılan `TEKRAR`).
- `createGame` → `R.rolGecmisi = {}`; `startGame` dağıtımdan sonra `R.rolGecmisi[p.id] = [{key,team}, ...eski].slice(0, TEKRAR.gecmisUz)`.
- Dışa aktar: `TEKRAR, tekrarCezasi, rolDagit`.

- [ ] **Test `tekrarCezasi`:** boş geçmiş → 0; `h[0].key` aynı → 4; `h[1]`/`h[2]` aynı → 1'er (ikisi de aynıysa 2); `imp` + `h[0],h[1]` `imp` → 2; `h[3]` aynı → 0.
- [ ] **Test `rolDagit`:** 4 oyuncu, torba `[doktor,polis,masum,hain]`, geçmişte u0 hain, u1 masum, u2 polis, u3 doktor; `opts:{kacinmaP:1,deneme:200}` ile 50 çağrıda toplam ceza hep 0 (çevrimsel kaydırma mümkün). Varsayılan ayarla 400 çağrıda u0'ın yine hain olma oranı ≤ 0,12; geçmişsiz 400 çağrıda 0,15–0,35 (düz rastgele). Karışık: yalnız u0'ın geçmişi varken torbanın tamamı dağıtılır (`sort` edilmiş key listesi torbaya eşit).
- [ ] **Test `startGame` + geçmiş:** `fixed`/`startGame` ile 4 kişi başlat → `R.rolGecmisi[id].length===1` ve `key/team` `R.g.roles[id]` ile uyumlu; `endToLobby` sonra farklı listeyle (biri çıktı, biri yeni) başlat → ayrılanın kaydı durur, yeninin boş; 6 maç sonra uzunluk 5; `state`'te `rolGecmisi` yok (`SECRET_KEYS`'e `'rolGecmisi'` ekle, `noLeak`).
- [ ] `npm test` → FAIL (fonksiyon yok).
- [ ] **Kod:** `TEKRAR` sabiti; `tekrarCezasi`; `rolDagit`: `Math.random()<kacinmaP` değilse tek `shuffle` döner; aksi halde `deneme` kez karıştır, toplam cezayı hesapla, en düşük olanı tut, 0 bulununca dur. `startGame:123-124`: `shuffle(bag)` yerine `const sira=rolDagit(bag,players,R.rolGecmisi||{})` ve `roles[p.id]` `sira[i]`'den; ardından geçmişi güncelle. `roleList` yine `bag`'den.
- [ ] `npm test` PASS; `kontrol.sh` yeşil.
- [ ] Commit: `Kasaba Gecesi: room role memory biases assignment away from repeats (feedback package 3/3)`.

### Task 4: Supabase'den tohumlama

**Files:** Modify `kayit.js` (`sonRoller`, sayaçlar, dışa aktarım), `test/taklit-rest.js` (gömülü sorgu dalı), `test/kayit.test.js`, `server.js` (onJoin ~303-317 arası, `/saglik:209`), `test/server.test.js`.

**Interfaces:**
- `kayit.sonRoller(uye:string) → Promise<[{key,team}]|null>` (en yeni önde, en çok `TEKRAR.gecmisUz`; `calinan_rol` doluysa `key='hirsiz'`; hata/zaman aşımı/ayarsız → `null`); `kayit.sayac.gecmisOkunan`, `kayit.sayac.gecmisHata`.
- Sorgu: `GET oyun_oyunculari?select=rol_key,takim,calinan_rol,oyunlar!inner(bitis)&uye=eq.<uye>&rol_key=not.is.null&oyunlar.kurulum=eq.<kurulum>&oyunlar.sonuc=eq.bitti&order=oyunlar(bitis).desc&limit=5`. `order=oyunlar(bitis)` PostgREST'te çalışmazsa (kasaba-test'te `curl` ile dene) iki adım: önce `oyunlar?kurulum=eq.&sonuc=eq.bitti&select=id,bitis&order=bitis.desc&limit=200`, sonra `oyun_oyunculari?uye=eq.&oyun_id=in.(…)` — kararı builder verir, README'ye yazar.
- `/saglik` → yeni anahtar `rolGecmisi:{okunan,hata}` (mevcut `kayit` anahtar kümesi değişmez: `server.test.js:34`).
- `server.js` onJoin: kayıtlı üye (`mem.uye`) ve `R.rolGecmisi[uid]` yoksa ve `kayit.sonRoller` varsa → `kayit.sonRoller(mem.uye).then(h=>{if(h&&h.length&&rooms.get(room.code)===room&&!R.rolGecmisi[uid])R.rolGecmisi[uid]=h})`.

- [ ] **Test `taklit-rest`:** `oyun_oyunculari` GET'inde `select` `oyunlar!inner` içeriyorsa `T.oyunlar` ile `oyun_id` üzerinden birleştir, `oyunlar.kurulum`/`oyunlar.sonuc` `eq.` süzgeçlerini uygula, `order=oyunlar(bitis).desc`, `limit`; satıra `oyunlar:{bitis}` ekle. (Davranış `kayit.test.js` ile sınanır.)
- [ ] **Test `kayit.test.js`:** taklitte 7 bitmiş + 1 devam + 1 başka kurulum maçı, biri `calinan_rol` dolu → `sonRoller('u1')` 5 kayıt, en yeni önde, Hırsız `hirsiz`, devam/başka kurulum yok; 500 → `null`, `gecmisHata` 1; ayarsız (`olustur({})`) → `null` istek yok; zaman aşımı (`zamanAsimiMs:100`, taklit 300 ms gecikme) → `null`.
- [ ] `npm test` → FAIL.
- [ ] **Kod:** `kayit.js` `sonRoller`; dışa aktar. `olustur(opts)`'a `zamanAsimiMs` (varsayılan 3000).
- [ ] `npm test` PASS. Commit: `Kasaba Gecesi: kayit.sonRoller reads a player's last finished roles`.
- [ ] **Test `server.test.js`:** `createServer({kayit:sahte})` sahtede `sonRoller` → `Promise.resolve([{key:'hain',team:'imp'}])`; token'lı (kayıtlı) oyuncu join → `kadar(()=>R.rolGecmisi[pub].length===1)`; misafir join → girdi yok; gecikmeli sahte (200 ms) + o arada `startGame` → oda belleği (1 kayıt, maçın rolü) korunur, tohum ezmez; `/saglik` `rolGecmisi:{okunan,hata}` var ve `kayit` anahtarları değişmedi; `sonRoller` olmayan sahte ile join hata vermez.
- [ ] `npm test` → FAIL.
- [ ] **Kod:** `server.js` onJoin kancası ve `/saglik`.
- [ ] `npm test` PASS; `kontrol.sh` yeşil. Commit: `Kasaba Gecesi: seed room role memory from Supabase on join (background, best effort)`.

### Task 5: Ölçüm, belge, deneme

**Files:** Modify `README.md` (tablo + ölçüm bloğu), `.claude/skills/kasaba-gecesi/SKILL.md:48`, `docs/DURUM.md`, spec §5.5 (sonuç notu).

- [ ] `npm run denge` (2000) → README ölçüm bloğunu yeni çıktıyla değiştir; taban (2026-10-25: 4→%33, 5→%36, 6→%41, 7→%44, 8→%47) ile farkı bir cümleyle yaz. `DAGILIM_TEKHAINSURUMP=0` ve `=1` satırlarının aynı çıktığını (bot sınırı) not et.
- [ ] SKILL.md Rol dağılımı satırı: `DAGILIM.masum/tekHainSurumP`, `TEKRAR`, `rolDagit`, `R.rolGecmisi` gizli, `kayit.sonRoller`.
- [ ] DURUM.md: paket bitti, kasaba-test denemesi bekliyor; ertelenen küçükler (varsa).
- [ ] `kontrol.sh --e2e` yeşil (çıkış kodunu değişkene al, sonra commit).
- [ ] Commit: `Docs: role distribution package — measurement, README, SKILL, DURUM`.
- [ ] Kullanıcıya: `/yayinla kasaba-test rol-dagilimi` (onay), telefondan birkaç maç + rövanş; sonra taze inceleme (fable) ve canlı.
