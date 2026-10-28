# hasan-Ahmet-projects — Claude Code notları

Bu depo Kasaba Gecesi'ni (tarayıcıda oynanan, Feign tarzı sosyal çıkarım oyunu; `kasaba-gecesi/`) barındırır.
Türkçe yazış; arayüz metinleri Türkçe ve kısa.

## Önce oku
- Mimari, dokunulmaz kurallar, test akışı: `.claude/skills/kasaba-gecesi/SKILL.md` (Skill `kasaba-gecesi`).
- **Güncel iş durumu, dallar, ertelenen bulgular:** `docs/DURUM.md`.
- Tasarım yazıları `docs/superpowers/specs/`, uygulama planları `docs/superpowers/plans/` (superpowers akışı: brainstorm → tasarım → denetleyici → plan → yerel yürütme → taze inceleme).

## Dallar
- `main`: **canlı** (`kasaba.munupixi.com` ve `kasaba-test`; kurulu commit `/saglik` `surum` alanında, geçmişi `docs/DURUM.md` başında); `/yayinla` buradan kurar (`CANLI_SURUM=main`). Eski tek sayfalık sürüm `v0-tek-sayfa` etiketinde.
- Bitmiş, `main`'e alınmış dallar (silinebilir): `sunucu`, `sahne`, `gecmis`, `rol-dagilimi`, `kucukler-1`, `kucukler-2`, `ilerleme`, `esya-2`, `kucukler-3`, `yildiz-1`.
Her iş `main`'den kendi dalında; bitince `main` o dala fast-forward edilir (`git merge --ff-only`; PR açılmıyor). Yeni özellik önce `kasaba-test.munupixi.com`'a (`/yayinla kasaba-test <dal>`), kullanıcı dener, sonra canlı.

## Komutlar
- Kontrol: `.claude/skills/kasaba-gecesi/scripts/kontrol.sh [--e2e]` (e2e Playwright'ı npx önbelleğinden ve sistem Chrome'undan bulur).
- Denge ölçümü: `cd kasaba-gecesi/sunucu && npm run denge`.
- Yayın: `/yayinla [AD] [SÜRÜM]`; ayarlar `.claude/yayin.env` (git dışı). Sunucuda değişiklik yapan komutu önce göster, onay al.
- Supabase (ionos, `/root/supabase-kasaba`): `kasaba-gecesi/sunucu/db/` betikleri; README "Geçmiş ve kullanıcı kaydı". Kayıt, kurulumun `/etc/games/<AD>.env` dosyasındaki `SUPABASE_URL/ANON_KEY/SERVICE_KEY/JWT_SECRET/JWT_JWKS` satırlarıyla açılır (`kur.sh` korur); satır yoksa herkes misafir.
- Sunucuda tablo sayımı: `docker exec -i supabase-db psql -tA -U postgres -d postgres -c "select count(*) from public.oyunlar"` (SQL'i dosyayla `scp`'le; ssh içinde tırnaklama bozuluyor).
- Göç testi yerelde (kurulum betiğinin kendisiyle; elle `psql` döngüsü kurma: hata durdurma, göç başına işlem ve beklenen GEÇTİ sayısı betikte):
  ```sh
  docker run -d --name kg-pgtest -e POSTGRES_PASSWORD=test supabase/postgres:17.6.1.136   # host portu VERME: 55432 başka projenin arx-shadow-pg'si, ona dokunma
  docker exec -i kg-pgtest psql -U supabase_admin -d postgres -c "alter table auth.users add column if not exists is_anonymous boolean not null default false, add column if not exists email_confirmed_at timestamptz"
  docker exec -i kg-pgtest psql -U supabase_admin -d postgres -c "create or replace function auth.uid() returns uuid language sql stable as \$\$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''), (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid \$\$"
  SUPABASE_DB_KONTEYNER=kg-pgtest kasaba-gecesi/sunucu/db/uygula.sh && SUPABASE_DB_KONTEYNER=kg-pgtest kasaba-gecesi/sunucu/db/uygula.sh --test
  docker rm -f kg-pgtest
  ```
  Bağlantı yalnız `docker exec` ile (portsuz). İmajın kendi `auth.uid()`'i `request.jwt.claims` okumaz: değiştirmezsen RLS senaryoları ilgisiz yere düşer.
- Eşya modu ölçümü: `DAGILIM_ESYA=1 npm run denge` (eşya başına kullanım ve paket kapma oranı da yazar).
- Gerçek deneme (test değil, elle): `cd kasaba-gecesi/sunucu && BASE=https://kasaba-test.munupixi.com OYUNCU=7 ESYA=1 NODE_PATH="$(npm root -g)" npm run deneme` — Playwright ev sahibi (844×390) + `test/bot.js` botları tam maç oynar; fazlar, haberler, paket/kum satırları, kasa, gazete ve sayfa hataları yazılır, ekran görüntüleri `OUT`'a. `BASE` yoksa yerel sunucu. Botlar tek başına: `WS_URL=wss://… node test/bot.js ODA [SAYI]`. Bot davranışı dosya başında; değiştirirsen gazete `iddia` kartını ve eşya/paket akışını bozmadığını `deneme` ile gör. Denge botları (`test/denge.js`) ayrıdır, eşyayı %30 kullanır.

## Sabit kararlar (kullanıcı)
- Her hain gecede kendi başına öldürür; hain sayısı 4–8 kişide 1, 9–12'de 2; Bombacı ve Seri Katil Polis tarafından tutulamaz. Provokatör'ün +2'si yalnız gerçek bir oyun üstüne eklenir (herkes çekimserse kimse asılmaz). 4–6 kişide Masum yok, 7+'da 1, 9 kişide yok (yuva Tuzakçı/Provokatör'e açılır); tek hain %50 sürümlü; rol tekrarı %80 eğilimle azaltılır (kesin yasak değil).
- Oylar oyun sonunda da yalnız toplam olarak görünür; tek tek oylar kaydedilmez.
- Kimlik: anonim Supabase kullanıcısı = kayıtlı (giriş ekranı yok); hesap bağlama **e-posta + 6 haneli kod** ile (Google yok, sihirli link yok, **şifre yok**; şifreyle giriş ve kurtarma Caddy'de 403); ikinci cihazda geçmiş sorularak birleştirilir (`hesap_birlestir`; "Hayır" → hiçbir çağrı).
- E-posta: sağlayıcı Resend; tüm gönderim tek `sendTransactionalEmail()` içinde (`sunucu/eposta.js`; GoTrue mail göndermez, "Send Email" kancasıyla `POST /eposta/kanca`'ya verir); oyun olayı için e-posta **üretilmez**, davetler link ile. Kanca tek kuruluma gider (`kur-supabase.sh --kanca`): geliştirmede kasaba-test, yayında kasaba. Kod istekleri ve anonim kimlik yalnız oyun sunucusundan (`/eposta/kod` Turnstile + tavanlar, `/hesap/anonim`); GoTrue'nun mail uçları ve `/signup` dış kapıda 403. **Turnstile betiği Cloudflare'den yüklenir: CDN'siz ilkesinin tek istisnası.**
- Oda kodu 12 karakter ve yalnız sunucu üretir; IP başına 5 oda / 24 soket / 5 kurma-dk; Cloudflare `/ws` 10 sn'de 30 el sıkışma.
- Gazete/hikâye yalnız günlükteki gerçek olaylardan; niyet atfı yok ("yalan söyledi", "MVP" yok); "en çok kaybeden" tablosu yok, oranların yanında örneklem.
- Yıldız ekonomisi (2026-10-27): ödüller cömert, hız fiyatlarla ayarlanır (25/70/180; hedef haftada 10 maçla efsanevi ~4 hafta, `npm run denge`); oya dayalı ödül yalnız "asılan haine oy" (masum taraf, bellekte, kalıcı sayaç yok); e-posta bağlama bir kez +25 ⭐ ve satılmayan `bayrak:mektup` (adres ve üye başına). Parça 2 (kademeli başarılar) ve 3 (haftalık görev, seri, davet, vitrin, set) sırada.
- Eşya sistemi: eşyayı **şans belirler** (rol sonrası seçim yok); meydan paketi "ilk dokunan alır", kapan **"biri kaptı"** diye gizli, eşya sayısı hayatta olana bağlı; paketler eşya modunun içinde (tek anahtar); oy fişi hiçbir yerde (maç sonu listesi, günlük, hikâye) kimseye bağlanmaz; kilit Seri Katil ve Bombacı'yı durduramaz ve bunu söylemez.

## Tuzaklar (bu depoya özgü)
- Bu depodaki JS/HTML dosyalarının çoğu (`index.html`, `sunucu/*.js`, `sunucu/test/*.js`, `sayfa/*.js`) uzun tek satırlardan oluşur: satır içine `// yorum` ekleme, satırın kalanını yorumlar (`node --check` çoğu zaman yakalamaz; 4 kez yaşandı). Yorumu her zaman ayrı satıra koy.
- `kontrol.sh --e2e | grep … && git commit` deseni testler düşse de commit eder (boru çıkış kodu grep'in). Çıkış kodunu değişkene al, sonra commit.
- `kontrol.sh` çıktısı ANSI renk kodlu: `grep "✗"` ile denetlerken önce `sed 's/\x1b\[[0-9;]*m//g'` ile temizle; yoksa boş eşleşme "geçti" sanılır.
- Rastgelelik/zaman bağımlı kurallar (eşya çekilişi, paket zamanı) testte `G.setRnd(fn)` + `G.setClock(fn)` ile sabitlenir, `finally`'de `G.setRnd(null)`/`G.setClock()`; `game.test.js` `esyali()` belirtilmeyen oyunculara `fis` verir (rastgele zar testi bozmasın).
- e2e/sunucu testinde `R.g.roles` elle değiştirildiyse fazı ilerletmeden eski rolü geri koy: takım sayısı değişince `checkWin` oyunu bitirir, test 8 sn beklemede düşer (kararsız görünür).
- Gizlilik (oy fişi, kim kaptı) **sunucuda, günlüğe yazmadan önce** silinir; istemci/hikâye tarafında gizlemek yetmez (günlük maç sonunda okunur). Commit başına otomatik güvenlik taraması bunu yakalıyor; bulgu bildirimi gelirse düzelt ya da gerekçesini yaz.
- Paralel Bash çağrılarında `cd` kalıcıdır: ikinci komut yanlış klasörde çalışabilir; her komuta mutlak `cd` ile başla.
- `kur.sh` kurulacak dalın kendi `kur.sh`'siyle çalışmalı (sunucudaki klonu o dala al); eski `kur.sh` yeni dosyaları kopyalamaz ve geri alma tetiklenir (artık `sunucu/*.js` tamamı kopyalanır; `sayfa/` ayrı liste).
- Self-hosted Supabase v0.8 token'ları ES256 ile imzalar (JWKS); HS256 varsayma. Yerel `fetch` ilk bağlantıda ~400 ms sürebilir: testlerde sabit bekleme yerine yoklama.
- Supabase-js **gömülü** (`kasaba-gecesi/sayfa/supabase.js`, sürüm sabit); CDN yok. Sayfalar (`/oyun`, `/kasaba`) aynı origin'de olduğu için oturum paylaşılır.

## Git
- Commit mesajları İngilizce; push: `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin <dal>`.
