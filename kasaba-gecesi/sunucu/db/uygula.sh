#!/usr/bin/env bash
# Şema göçlerini (db/goc/*.sql, ad sırasıyla) Supabase'in Postgres konteynerinde uygular; uygulananlar
# public.goc_gecmisi tablosunda durur, her göç tek işlemde (transaction) çalışır.
#
#   sudo ./uygula.sh            # bekleyen göçleri uygula
#   sudo ./uygula.sh --test     # test.sql'i çalıştır (RLS senaryoları; hep geri alınır, veri bırakmaz)
#   sudo ./uygula.sh --yeniden  # TÜM göçleri yeniden çalıştır (hepsi idempotent): geri yükleme sonrası yetki/politika tazeleme
#
# Konteyner adı SUPABASE_DB_KONTEYNER ile değiştirilebilir (varsayılan supabase-db).
set -euo pipefail
BURASI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KONT="${SUPABASE_DB_KONTEYNER:-supabase-db}"
hata(){ printf '\033[1;31mHATA:\033[0m %s\n' "$*" >&2; exit 1; }
docker inspect -f '{{.State.Running}}' "$KONT" 2>/dev/null | grep -q true || hata "$KONT konteyneri çalışmıyor."
psql_(){ docker exec -i "$KONT" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres "$@"; }

if [ "${1:-}" = "--test" ]; then
  OUT="$(psql_ < "$BURASI/test.sql" 2>&1)" || { printf '%s\n' "$OUT" | tail -25; echo "RLS testleri: BAŞARISIZ"; exit 1; }
  GECTI="$(printf '%s\n' "$OUT" | grep -c 'GEÇTİ' || true)"
  BEKLENEN="$(grep -c "raise notice 'GEÇTİ" "$BURASI/test.sql" || true)"
  printf '%s\n' "$OUT" | grep -E 'GEÇTİ|BAŞARISIZ' | sed 's/^NOTICE:  //'
  [ "$GECTI" -eq "$BEKLENEN" ] || { echo "RLS testleri: BAŞARISIZ ($GECTI/$BEKLENEN)"; exit 1; }
  echo "RLS testleri: $GECTI/$BEKLENEN geçti"; exit 0
fi

psql_ <<'SQL'
create table if not exists public.goc_gecmisi (ad text primary key, uygulama timestamptz not null default now());
revoke all on public.goc_gecmisi from public, anon, authenticated;
SQL
YENIDEN=0; [ "${1:-}" = "--yeniden" ] && YENIDEN=1
n=0
for f in "$BURASI"/goc/*.sql; do
  ad="$(basename "$f")"
  if [ "$YENIDEN" = 1 ] || [ "$(psql_ -tA -c "select count(*) from public.goc_gecmisi where ad = '$ad'")" = "0" ]; then
    { echo "begin;"; cat "$f"; printf "insert into public.goc_gecmisi (ad) values ('%s') on conflict (ad) do nothing;\ncommit;\n" "$ad"; } | psql_ || hata "$ad uygulanamadı (geri alındı)."
    echo "uygulandı: $ad"; n=$((n+1))
  fi
done
echo "$n göç uygulandı"
psql_ -c "notify pgrst, 'reload schema'" >/dev/null   # PostgREST şema önbelleğini tazele (yeni sütun/fonksiyon/görünüm hemen görünsün)
