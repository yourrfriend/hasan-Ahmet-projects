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
- `gecmis` (geçmiş/kullanıcı/Supabase projesi + Paket 1a: gazete, rövanş, skor): **canlı** (`kasaba.munupixi.com`, 2026-10-25); `/yayinla` buradan kurar. Sahne Plan 3 (evler) de bu dalda yapılır.
Her iş kendi dalında; PR en sonda. Yeni özellik önce `kasaba-test.munupixi.com`'a (`/yayinla kasaba-test <dal>`), kullanıcı dener, sonra canlı.

## Komutlar
- Kontrol: `.claude/skills/kasaba-gecesi/scripts/kontrol.sh [--e2e]` (e2e Playwright'ı npx önbelleğinden ve sistem Chrome'undan bulur).
- Denge ölçümü: `cd kasaba-gecesi/sunucu && npm run denge`.
- Yayın: `/yayinla [AD] [SÜRÜM]`; ayarlar `.claude/yayin.env` (git dışı). Sunucuda değişiklik yapan komutu önce göster, onay al.
- Supabase (ionos, `/root/supabase-kasaba`): `kasaba-gecesi/sunucu/db/` betikleri; README "Geçmiş ve kullanıcı kaydı".

## Sabit kararlar (kullanıcı)
- Her hain gecede kendi başına öldürür; hain sayısı 4–8 kişide 1, 9–12'de 2; Bombacı ve Seri Katil Polis tarafından tutulamaz.
- Oylar oyun sonunda da yalnız toplam olarak görünür; tek tek oylar kaydedilmez.
- Kimlik: anonim Supabase kullanıcısı = kayıtlı; Google bağlama isteğe bağlı; ikinci cihazda geçmiş birleştirilir.

## Git
- Commit mesajları İngilizce; push: `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin <dal>`.
