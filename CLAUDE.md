# hasan-Ahmet-projects — Claude Code notları

Bu depo Kasaba Gecesi'ni (tarayıcıda oynanan, Feign tarzı sosyal çıkarım oyunu; `kasaba-gecesi/`) barındırır.
Türkçe yazış; arayüz metinleri Türkçe ve kısa.

## Önce oku
- Mimari, dokunulmaz kurallar, test akışı: `.claude/skills/kasaba-gecesi/SKILL.md` (Skill `kasaba-gecesi`).
- **Güncel iş durumu, dallar, ertelenen bulgular:** `docs/DURUM.md`.
- Tasarım yazıları `docs/superpowers/specs/`, uygulama planları `docs/superpowers/plans/` (superpowers akışı: brainstorm → tasarım → denetleyici → plan → yerel yürütme → taze inceleme).

## Dallar
- `main`: eski tek sayfalık sürüm (sunucu yok).
- `sunucu`, `sahne`: eski canlı dallar; `gecmis` ikisini de kapsar.
- `gecmis`: **canlı** (`kasaba.munupixi.com`, 2026-10-25, **kayıt açık**); `/yayinla` buradan kurar. İçinde: geçmiş/kimlik/Supabase (Plan 1–4), Paket 1a (gazete, rövanş, skor), Paket 1b (⚡ hızlı iddia, 📘 rehber), Plan 5 sayfalar (sürüyor). Sahne Plan 3 (evler) ve Plan 6 (e-posta bağlama) de bu dalda.
Her iş kendi dalında; PR en sonda. Yeni özellik önce `kasaba-test.munupixi.com`'a (`/yayinla kasaba-test <dal>`), kullanıcı dener, sonra canlı.

## Komutlar
- Kontrol: `.claude/skills/kasaba-gecesi/scripts/kontrol.sh [--e2e]` (e2e Playwright'ı npx önbelleğinden ve sistem Chrome'undan bulur).
- Denge ölçümü: `cd kasaba-gecesi/sunucu && npm run denge`.
- Yayın: `/yayinla [AD] [SÜRÜM]`; ayarlar `.claude/yayin.env` (git dışı). Sunucuda değişiklik yapan komutu önce göster, onay al.
- Supabase (ionos, `/root/supabase-kasaba`): `kasaba-gecesi/sunucu/db/` betikleri; README "Geçmiş ve kullanıcı kaydı". Kayıt, kurulumun `/etc/games/<AD>.env` dosyasındaki `SUPABASE_URL/ANON_KEY/SERVICE_KEY/JWT_SECRET/JWT_JWKS` satırlarıyla açılır (`kur.sh` korur); satır yoksa herkes misafir.
- Sunucuda tablo sayımı: `docker exec -i supabase-db psql -tA -U postgres -d postgres -c "select count(*) from public.oyunlar"` (SQL'i dosyayla `scp`'le; ssh içinde tırnaklama bozuluyor).
- kasaba-test'te gerçek deneme: Playwright ev sahibi + `bot.js ODA SAYI` (hain botlar gece öldürür, oylamada çekimser, rol iddiası yapar, bitince "hazır" basar); betikler oturum scratchpad'inde, gerekirse yeniden yazılır (hafıza: reference-arac-ortami).

## Sabit kararlar (kullanıcı)
- Her hain gecede kendi başına öldürür; hain sayısı 4–8 kişide 1, 9–12'de 2; Bombacı ve Seri Katil Polis tarafından tutulamaz.
- Oylar oyun sonunda da yalnız toplam olarak görünür; tek tek oylar kaydedilmez.
- Kimlik: anonim Supabase kullanıcısı = kayıtlı (giriş ekranı yok); hesap bağlama **e-posta sihirli link** ile (Google yok); ikinci cihazda geçmiş birleştirilir (`hesap_birlestir`).
- E-posta: sağlayıcı Resend; tüm gönderim tek `sendTransactionalEmail()` içinde (sağlayıcı değiştirilebilir); oyun olayı için e-posta **üretilmez**, davetler link ile.
- Oda kodu 12 karakter ve yalnız sunucu üretir; IP başına 5 oda / 24 soket / 5 kurma-dk; Cloudflare `/ws` 10 sn'de 30 el sıkışma.
- Gazete/hikâye yalnız günlükteki gerçek olaylardan; niyet atfı yok ("yalan söyledi", "MVP" yok); "en çok kaybeden" tablosu yok, oranların yanında örneklem.

## Tuzaklar (bu depoya özgü)
- `index.html` uzun tek satırlardan oluşur: satır içine `// yorum` ekleme, satırın kalanını yorumlar (`node --check` yakalamaz, e2e düşer). Yorumu ayrı satıra koy.
- `kontrol.sh --e2e | grep … && git commit` deseni testler düşse de commit eder (boru çıkış kodu grep'in). Çıkış kodunu değişkene al, sonra commit.
- Paralel Bash çağrılarında `cd` kalıcıdır: ikinci komut yanlış klasörde çalışabilir; her komuta mutlak `cd` ile başla.
- `kur.sh` kurulacak dalın kendi `kur.sh`'siyle çalışmalı (sunucudaki klonu o dala al); eski `kur.sh` yeni dosyaları (kayit.js, sayfa/) kopyalamaz ve geri alma tetiklenir.
- Self-hosted Supabase v0.8 token'ları ES256 ile imzalar (JWKS); HS256 varsayma. Yerel `fetch` ilk bağlantıda ~400 ms sürebilir: testlerde sabit bekleme yerine yoklama.
- Supabase-js **gömülü** (`kasaba-gecesi/sayfa/supabase.js`, sürüm sabit); CDN yok. Sayfalar (`/oyun`, `/kasaba`) aynı origin'de olduğu için oturum paylaşılır.

## Git
- Commit mesajları İngilizce; push: `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin <dal>`.
