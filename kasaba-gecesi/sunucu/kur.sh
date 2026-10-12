#!/usr/bin/env bash
# Kasaba Gecesi sunucu kurulumu (Ubuntu / Debian).
#   sudo ./kur.sh oyun.ornek.com   → https://oyun.ornek.com (alan adının A kaydı bu sunucuyu göstermeli)
#   sudo ./kur.sh                  → http://SUNUCU_IP (alan adı yoksa; pano kopyalama ve mikrofon kısıtlanır)
# Güncellemek için: git pull && sudo ./kur.sh <aynı alan adı>
set -euo pipefail

ALAN="${1:-}"
APP=/opt/kasaba-gecesi
SERVIS=kasaba-gecesi
PORT=8787
KAYNAK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bilgi(){ printf '\033[1;32m==>\033[0m %s\n' "$*"; }
hata(){ printf '\033[1;31mHATA:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || hata "root olarak çalıştır: sudo ./kur.sh ${ALAN}"
command -v apt-get >/dev/null || hata "Bu betik Ubuntu/Debian (apt) içindir."
[ -f "$KAYNAK/../index.html" ] || hata "index.html bulunamadı; betiği depodaki kasaba-gecesi/sunucu klasöründen çalıştır."
if [ -n "$ALAN" ] && ! [[ "$ALAN" =~ ^[A-Za-z0-9.-]+$ ]]; then hata "Alan adı geçersiz: $ALAN"; fi

export DEBIAN_FRONTEND=noninteractive
bilgi "Gerekli paketler"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null

# ---------- Node 20 ----------
NODE_MAJOR=0
if command -v node >/dev/null; then NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"; fi
if [ "$NODE_MAJOR" -lt 20 ]; then
  bilgi "Node.js 20 kuruluyor"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
bilgi "Node $(node -v)"

# ---------- Caddy ----------
if ! command -v caddy >/dev/null; then
  bilgi "Caddy kuruluyor"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

# ---------- Uygulama ----------
bilgi "Oyun dosyaları $APP klasörüne kopyalanıyor"
mkdir -p "$APP/sunucu"
install -m 644 "$KAYNAK/../index.html" "$APP/index.html"
install -m 644 "$KAYNAK/server.js" "$KAYNAK/game.js" "$KAYNAK/package.json" "$KAYNAK/package-lock.json" "$APP/sunucu/"
(cd "$APP/sunucu" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)

bilgi "systemd servisi: $SERVIS"
cat > "/etc/systemd/system/$SERVIS.service" <<EOF
[Unit]
Description=Kasaba Gecesi oyun sunucusu
After=network.target

[Service]
WorkingDirectory=$APP/sunucu
ExecStart=$(command -v node) server.js
Environment=NODE_ENV=production PORT=$PORT HOST=127.0.0.1
Restart=always
RestartSec=2
DynamicUser=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --quiet "$SERVIS"
systemctl restart "$SERVIS"

# ---------- Caddyfile ----------
bilgi "Caddy ayarı"
HEDEF="${ALAN:-:80}"
sed "s/^ALAN {/$HEDEF {/; s/127.0.0.1:8787/127.0.0.1:$PORT/" "$KAYNAK/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || hata "Caddyfile geçersiz: caddy validate --config /etc/caddy/Caddyfile"
systemctl enable --quiet caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

# ---------- Güvenlik duvarı ----------
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  bilgi "ufw: 80 ve 443 açılıyor"
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

# ---------- Kontrol ----------
for _ in $(seq 1 20); do curl -fsS "http://127.0.0.1:$PORT/saglik" >/dev/null 2>&1 && break; sleep 0.5; done
curl -fsS "http://127.0.0.1:$PORT/saglik" >/dev/null || hata "Servis yanıt vermiyor. Günlük: journalctl -u $SERVIS -n 50"

if [ -n "$ALAN" ]; then ADRES="https://$ALAN"; else
  IP="$(curl -fsS -4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"; ADRES="http://$IP"; fi
echo
bilgi "Hazır: $ADRES"
echo "   Günlük:      journalctl -u $SERVIS -f"
echo "   Yeniden başlat: systemctl restart $SERVIS"
[ -n "$ALAN" ] && echo "   İlk açılışta Caddy sertifika alır; birkaç saniye sürebilir. DNS A kaydı bu sunucuyu göstermeli."
exit 0
