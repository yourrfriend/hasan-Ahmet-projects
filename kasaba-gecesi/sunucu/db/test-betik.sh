#!/usr/bin/env bash
# db betikleri sahte ortamda (root/docker/caddy gerekmez): caddy.sh atomik yazım, yedek.sh .tmp, ayar() kaçışı, apt-get update, port denetimi, pgrst reload, günlük maskeleme.
#   bash db/test-betik.sh [db klasörü]   (kontrol.sh çağırır)
DB="${1:-$(cd "$(dirname "$0")" && pwd)}"; T="$(mktemp -d)"; FB="$T/bin"; mkdir -p "$FB"; export PATH="$FB:$PATH"; basarisiz=0
ok(){ echo "PASS $1"; }; fail(){ echo "FAIL $1"; basarisiz=1; }
printf '#!/bin/sh\necho 0\n' > "$FB/id"; printf '#!/bin/sh\nexit 0\n' > "$FB/systemctl"
printf '#!/bin/sh\n[ "$1" = validate ] && [ -n "$CADDY_BOZUK" ] && exit 1\nexit 0\n' > "$FB/caddy"
chmod +x "$FB"/*
# ---- 1) caddy.sh: geçersiz ayarda eski parça korunur ----
C="$T/caddy"; mkdir -p "$C/games"; echo "import $C/games/*.caddy" > "$C/Caddyfile"; printf 'ESKI PARCA\n' > "$C/games/supabase.caddy"
mkdir -p "$T/ayar"; printf 'KIP=tunel\nTUNEL_PORT=8080\n' > "$T/ayar/.sunucu.env"
if KG_CADDY_KOK="$C" KG_AYAR_KOK="$T/ayar" bash "$DB/caddy.sh" --alan x.test >/dev/null 2>&1 && grep -q 'x.test' "$C/games/supabase.caddy"; then ok "caddy: geçerli yazım"; else fail "caddy: geçerli yazım"; fi
printf 'ESKI PARCA\n' > "$C/games/supabase.caddy"
CADDY_BOZUK=1 KG_CADDY_KOK="$C" KG_AYAR_KOK="$T/ayar" bash "$DB/caddy.sh" --alan x.test >/dev/null 2>&1 && fail "caddy: bozuk ayar hata vermeli"
if [ "$(cat "$C/games/supabase.caddy")" = "ESKI PARCA" ] && [ ! -e "$C/games/supabase.caddy.yeni" ]; then ok "caddy: bozuk ayarda eski parça korunur, .yeni kalmaz"; else fail "caddy: bozuk ayarda eski parça korunur ($(ls "$C/games"))"; fi
# ---- 2) yedek.sh: pg_dump düşerse .tmp kalmaz ----
printf '#!/bin/sh\nexit 1\n' > "$FB/docker"; chmod +x "$FB/docker"; Y="$T/yedek"
bash "$DB/yedek.sh" "$Y" 14 >/dev/null 2>&1 && fail "yedek: pg_dump düşünce hata vermeli"
if [ -z "$(ls "$Y" 2>/dev/null)" ]; then ok "yedek: .tmp artığı yok"; else fail "yedek: artık var: $(ls "$Y")"; fi
# ---- 3) ayar(): sed kaçışı ----
cd "$T"; : > .env; bilgi(){ :; }; eval "$(grep '^ayar(){' "$DB/kur-supabase.sh")"
ayar K1 'eski'; ayar K1 'a|b&c\d'; ayar K2 'x/y'
if [ "$(grep -c '^K1=' .env)" = 1 ] && [ "$(sed -n 's/^K1=//p' .env)" = 'a|b&c\d' ] && [ "$(sed -n 's/^K2=//p' .env)" = 'x/y' ]; then ok "ayar: | & \\ / karakterleri birebir"; else fail "ayar: $(cat .env | tr '\n' ' ')"; fi
# ---- 4) paket döngüsü: eksik paket varsa apt-get update bir kez ----
printf '#!/bin/sh\necho "$@" >> "%s/apt.log"\nexit 0\n' "$T" > "$FB/apt-get"; printf '#!/bin/sh\nexit 1\n' > "$FB/dpkg"; chmod +x "$FB/apt-get" "$FB/dpkg"
PATH="$FB:/usr/bin:/bin"; : > "$T/apt.log"
# gerçek jq/openssl/curl/git PATH'te olabilir: döngüyü yalnız 'yokpaket' ile çalıştır
eval "$(sed -n '/^APT_GUNCEL=0/,/^done/p' "$DB/kur-supabase.sh" | sed 's/for p in jq openssl curl ca-certificates git; do/for p in yokpaket1 yokpaket2; do/')"
if [ "$(grep -c '^update' "$T/apt.log")" = 1 ] && [ "$(grep -c '^install' "$T/apt.log")" = 2 ]; then ok "apt-get: eksik pakette update bir kez"; else fail "apt-get: $(cat "$T/apt.log" | tr '\n' ';')"; fi
# ---- 5) port denetimi: 0.0.0.0'da dinleyen port varsa HATA ----
printf '#!/bin/sh\nprintf "LISTEN 0 4096 0.0.0.0:8000 0.0.0.0:*\\nLISTEN 0 4096 127.0.0.1:5432 0.0.0.0:*\\n"\n' > "$FB/ss"; chmod +x "$FB/ss"
hata(){ echo "HATA:$*"; return 1; }
if eval "$(grep -A3 '^# ---------- port denetimi' "$DB/kur-supabase.sh" | grep -v '^#')" 2>&1 | grep -q 'HATA'; then ok "port: 0.0.0.0 görülünce HATA"; else fail "port: denetim yok ya da sessiz"; fi
# ---- 6) uygula.sh: PostgREST şema yenileme ----
grep -q "notify pgrst, 'reload schema'" "$DB/uygula.sh" && ok "uygula: pgrst reload" || fail "uygula: pgrst reload yok"
# ---- 7) kurulum günlüğü maskeleme ----
grep -q "KEY|SECRET|PASSWORD" "$DB/kur-supabase.sh" && ok "kurulum günlüğü: maskeleme" || fail "kurulum günlüğü: maskeleme yok"
rm -rf "$T"; exit $basarisiz
