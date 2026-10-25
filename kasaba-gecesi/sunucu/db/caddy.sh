#!/usr/bin/env bash
# Supabase'in dış kapısı: Caddy parçası /etc/caddy/games/supabase.caddy. Yalnız API yolları geçer
# (/auth, /rest, /realtime, /storage); Studio (/) ve pg-meta (/pg) dışarıdan 404 alır. Şifreyle giriş ve şifre kurtarma 403 (Plan 6: şifre yok).
# Kip kur.sh'nin yazdığı /etc/games/.sunucu.env'den okunur (KIP=tunel|https, TUNEL_PORT); dosya yoksa https.
#
#   sudo ./caddy.sh [--alan kasaba-api.munupixi.com] [--port 8000] [--yalnizca-yaz DOSYA]   (son seçenek: Caddy'ye dokunmadan üret)
set -euo pipefail
ALAN=kasaba-api.munupixi.com; PORT=8000; YALNIZCA=""
AYAR="${KG_AYAR_KOK:-/etc/games}/.sunucu.env"; CADDY_KOK="${KG_CADDY_KOK:-/etc/caddy}"
while [ $# -gt 0 ]; do case "$1" in
  --alan) ALAN="${2:-}";shift 2;;
  --port) PORT="${2:-}";shift 2;;
  --yalnizca-yaz) YALNIZCA="${2:-}";shift 2;;
  *) echo "Bilinmeyen seçenek: $1" >&2;exit 1;;
esac; done
bilgi(){ printf '\033[1;32m==>\033[0m %s\n' "$*"; }
hata(){ printf '\033[1;31mHATA:\033[0m %s\n' "$*" >&2; exit 1; }
[[ "$ALAN" =~ ^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$ ]] || hata "Alan adı geçersiz: $ALAN"
KIP="${KIP:-}"; TUNEL_PORT="${TUNEL_PORT:-8080}"
if [ -z "$KIP" ] && [ -f "$AYAR" ]; then KIP="$(sed -n 's/^KIP=//p' "$AYAR" | head -1)"; TUNEL_PORT="$(sed -n 's/^TUNEL_PORT=//p' "$AYAR" | head -1)"; TUNEL_PORT="${TUNEL_PORT:-8080}"; fi
KIP="${KIP:-https}"

if [ "$KIP" = tunel ]; then BASLIK="http://$ALAN:$TUNEL_PORT {
	bind 127.0.0.1"; else BASLIK="$ALAN {"; fi
PARCA="# db/caddy.sh yazar: Supabase dış kapısı (kip $KIP). Yalnız API yolları; Studio ve pg-meta dışarı kapalı.
$BASLIK
	# Şifre yok (Plan 6): /auth/v1/token yalnız ham sorgu dizesi tam olarak 'grant_type=refresh_token' ise geçer (supabase-js
	# yenilemede başka parametre yollamaz). Tam eşitlik: 'query' eşleyicisi bozuk sorguda eşleşmiyor (yasak listesi fail-open) ve
	# çift parametrede (grant_type=password&grant_type=refresh_token) herhangi biri eşleşince geçiriyordu; GoTrue ilk değeri okur.
	# Şifre kurtarma 403. Biri senin adresinle önceden şifreli hesap açsa bile o şifreyle giremez; sahibi kodla girer ve hesabı devralır.
	@tokenYenile {
		path /auth/v1/token
		expression \`{http.request.uri.query} == 'grant_type=refresh_token'\`
	}
	handle @tokenYenile {
		reverse_proxy 127.0.0.1:$PORT
	}
	@tokenDiger path /auth/v1/token
	handle @tokenDiger {
		respond 403
	}
	@kurtar path /auth/v1/recover
	handle @kurtar {
		respond 403
	}
	@api path /auth/* /rest/* /realtime/* /storage/*
	handle @api {
		reverse_proxy 127.0.0.1:$PORT
	}
	handle {
		respond 404
	}
}
"
if [ -n "$YALNIZCA" ]; then printf '%s' "$PARCA" > "$YALNIZCA"; echo "yazıldı: $YALNIZCA (kip $KIP)"; exit 0; fi
[ "$(id -u)" -eq 0 ] || hata "root olarak çalıştır: sudo $0 $*"
mkdir -p "$CADDY_KOK/games"
ANA="$CADDY_KOK/Caddyfile"; IMPORT="import $CADDY_KOK/games/*.caddy"
grep -qxF "$IMPORT" "$ANA" 2>/dev/null || hata "$ANA içinde '$IMPORT' yok; önce kur.sh ile bir oyun kur."
printf '%s' "$PARCA" > "$CADDY_KOK/games/supabase.caddy"
caddy validate --config "$ANA" --adapter caddyfile >/dev/null 2>&1 || { rm -f "$CADDY_KOK/games/supabase.caddy"; hata "Caddy ayarı geçersiz; parça geri alındı."; }
systemctl reload caddy 2>/dev/null || systemctl restart caddy
bilgi "Caddy: $ALAN → 127.0.0.1:$PORT (kip $KIP)"
