#!/usr/bin/env bash
# Supabase (oyun geçmişi) veritabanının günlük yedeği: pg_dump (özel biçim; yalnız bizim şemalar: public, private ve auth.
# Supabase'in kendi iç şemaları yedeğe girmez, yoksa geri yükleme öngörülemez olur) → DIZIN/kasaba-TARIH.dump; GUN günden eskiler silinir.
#   sudo ./yedek.sh [DIZIN=/var/backups/supabase-kasaba] [GUN=14]
# Geri yükleme: README "Geri yükleme" bölümü (tatbikatla doğrulanmış sıra). Özet:
#   oyun verisi: pg_restore --clean --if-exists -n public -n private   (yetkiler yedekten gelir; --no-privileges KULLANMA)
#   ardından:    uygula.sh --yeniden && uygula.sh --test                (politika/yetki tazeleme ve kanıt)
#   kullanıcılar (taze yığında): pg_restore --data-only --disable-triggers -n auth
# Konteyner adı SUPABASE_DB_KONTEYNER ile değiştirilebilir (varsayılan supabase-db).
set -euo pipefail
DIZIN="${1:-/var/backups/supabase-kasaba}"; GUN="${2:-14}"; KONT="${SUPABASE_DB_KONTEYNER:-supabase-db}"
mkdir -p "$DIZIN"; chmod 700 "$DIZIN"
DOSYA="$DIZIN/kasaba-$(date +%F-%H%M).dump"
trap 'rm -f "$DOSYA.tmp"' EXIT   # pg_dump yarıda kesilirse .tmp kalmasın (find yalnız *.dump'ı siler)
docker exec "$KONT" pg_dump -U postgres -Fc -n public -n private -n auth postgres > "$DOSYA.tmp"
mv "$DOSYA.tmp" "$DOSYA"; chmod 600 "$DOSYA"
find "$DIZIN" -name 'kasaba-*.dump' -mtime +"$GUN" -delete
echo "yedek: $DOSYA ($(du -h "$DOSYA" | cut -f1))"
