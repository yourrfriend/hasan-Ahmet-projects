#!/usr/bin/env bash
# Supabase (oyun geçmişi) veritabanının günlük yedeği: pg_dump (özel biçim, yalnız public + auth şemaları; Supabase'in
# kendi iç şemaları yedeğe girmez, yoksa geri yükleme öngörülemez olur) → DIZIN/kasaba-TARIH.dump; GUN günden eskiler silinir.
#   sudo ./yedek.sh [DIZIN=/var/backups/supabase-kasaba] [GUN=14]
# Geri yükleme (README "Geri yükleme" bölümü; ikisi de tatbikatla doğrulandı):
#   oyun verisi (public):  docker exec -i supabase-db pg_restore -U postgres -d postgres --clean --if-exists --no-owner --no-privileges -n public < DOSYA
#   kullanıcılar (auth):   docker exec -i supabase-db pg_restore -U postgres -d postgres --data-only --disable-triggers --no-owner --no-privileges -n auth < DOSYA   (taze yığında)
# Konteyner adı SUPABASE_DB_KONTEYNER ile değiştirilebilir (varsayılan supabase-db).
set -euo pipefail
DIZIN="${1:-/var/backups/supabase-kasaba}"; GUN="${2:-14}"; KONT="${SUPABASE_DB_KONTEYNER:-supabase-db}"
mkdir -p "$DIZIN"; chmod 700 "$DIZIN"
DOSYA="$DIZIN/kasaba-$(date +%F-%H%M).dump"
docker exec "$KONT" pg_dump -U postgres -Fc -n public -n auth postgres > "$DOSYA.tmp"
mv "$DOSYA.tmp" "$DOSYA"; chmod 600 "$DOSYA"
find "$DIZIN" -name 'kasaba-*.dump' -mtime +"$GUN" -delete
echo "yedek: $DOSYA ($(du -h "$DOSYA" | cut -f1))"
