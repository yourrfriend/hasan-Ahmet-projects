#!/usr/bin/env bash
# Oyun sunucusu kurulumu (Ubuntu / Debian). Aynı VPS'te birden çok oyun ve sürüm yan yana çalışır;
# her kurulumun bir adı, kendi alan adı, kendi portu ve kendi systemd servisi (game@AD) olur.
#
#   sudo ./kur.sh kasaba kasaba.munupixi.com                        → bu klasördeki dosyalar
#   sudo ./kur.sh kasaba-test kasaba-test.munupixi.com --surum sunucu    → git branch'i
#   sudo ./kur.sh kasaba-v1 kasaba-v1.munupixi.com --surum v1       → git tag'i ya da commit
#   sudo ./kur.sh --liste                                           → kurulu oyunlar
#   sudo ./kur.sh --kaldir kasaba-test                              → kurulumu siler
#
# Güncellemek için aynı komutu tekrar çalıştır (git pull ya da --surum ile). Port ve ayarlar korunur.
# Yeni sürüm sağlık kontrolünden geçmezse eski sürüm geri yüklenir.
# Kip (sunucu başına bir kez seçilir, sonra hatırlanır; değiştirmek için --kip ile tekrar ver):
#   --kip https  (varsayılan) Caddy 80/443'te dinler, sertifikayı kendisi alır. DNS A kaydı bu sunucuyu göstermeli.
#   --kip tunel  Caddy yalnız 127.0.0.1:8080'de dinler; HTTPS'i Cloudflare Tunnel verir (80/443 başka bir
#                sunucu programındaysa, ör. Plesk). Tünel: *.munupixi.com → http://localhost:8080.
set -euo pipefail

APP_KOK="${KG_APP_KOK:-/opt/games}"            # /opt/games/AD          oyun dosyaları
AYAR_KOK="${KG_AYAR_KOK:-/etc/games}"          # /etc/games/AD.env      PORT, ALAN, SURUM, COMMIT
CADDY_KOK="${KG_CADDY_KOK:-/etc/caddy}"        # /etc/caddy/games/AD.caddy
SYSTEMD_KOK="${KG_SYSTEMD_KOK:-/etc/systemd/system}"
ILK_PORT=8787
SUNUCU_AYAR=.sunucu                              # /etc/games/.sunucu.env   KIP, TUNEL_PORT (tüm kurulumlar için)
KAYNAK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bilgi(){ printf '\033[1;32m==>\033[0m %s\n' "$*"; }
uyari(){ printf '\033[1;33m!!\033[0m %s\n' "$*"; }
hata(){ printf '\033[1;31mHATA:\033[0m %s\n' "$*" >&2; exit 1; }
kullanim(){ sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
ad_gecerli(){ [[ "$1" =~ ^[a-z0-9][a-z0-9-]{0,30}$ ]]; }
portu_kullanan(){ (echo >"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
ayar_oku(){ [ -f "$AYAR_KOK/$1.env" ] || return 0; sed -n "s/^$2=//p" "$AYAR_KOK/$1.env" | head -1; }
git_(){ git -c safe.directory='*' -C "$KAYNAK" "$@"; } # root, kullanıcının klonunda çalışır

# ---------- argümanlar ----------
[ $# -gt 0 ] || kullanim 1
case "$1" in -h|--help|--yardim) kullanim 0;; esac
[ "$(id -u)" -eq 0 ] || hata "root olarak çalıştır: sudo $0 $*"

if [ "$1" = "--liste" ]; then
  printf '%-16s %-40s %-6s %-14s %-9s %s\n' AD ADRES PORT SURUM COMMIT DURUM
  for f in "$AYAR_KOK"/*.env; do [ -e "$f" ] || continue; a="$(basename "$f" .env)"
    printf '%-16s %-40s %-6s %-14s %-9s %s\n' "$a" "https://$(ayar_oku "$a" ALAN)" "$(ayar_oku "$a" PORT)" \
      "$(ayar_oku "$a" SURUM)" "$(ayar_oku "$a" COMMIT)" "$(systemctl is-active "game@$a" 2>/dev/null || true)"
  done; exit 0
fi

if [ "$1" = "--kaldir" ]; then
  AD="${2:-}";ad_gecerli "$AD" || hata "Kaldırılacak kurulumun adını ver: $0 --kaldir AD"
  [ -f "$AYAR_KOK/$AD.env" ] || hata "$AD diye bir kurulum yok ($0 --liste)"
  bilgi "$AD kaldırılıyor"
  systemctl disable --now --quiet "game@$AD" 2>/dev/null || true
  rm -f "$CADDY_KOK/games/$AD.caddy" "$AYAR_KOK/$AD.env"; rm -rf "${APP_KOK:?}/$AD"
  systemctl reload caddy 2>/dev/null || true
  bilgi "Tamam."; exit 0
fi

AD="$1";ALAN="${2:-}";shift $(( $# >= 2 ? 2 : $# ))
SURUM="";PORT="";KIP=""
while [ $# -gt 0 ]; do case "$1" in
  --surum) SURUM="${2:-}";shift 2;;
  --port) PORT="${2:-}";shift 2;;
  --kip) KIP="${2:-}";shift 2;;
  *) hata "Bilinmeyen seçenek: $1";;
esac; done
if [[ "$AD" == *.* ]]; then hata "İlk argüman kurulum adı olmalı, alan adı ikinci: sudo $0 kasaba $AD"; fi
ad_gecerli "$AD" || hata "Ad geçersiz: '$AD' (küçük harf, rakam ve tire; ör. kasaba, kasaba-test)"
[[ "$ALAN" =~ ^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$ ]] || hata "Alan adı eksik ya da geçersiz: '$ALAN' (ör. $AD.munupixi.com)"
ALAN="${ALAN,,}"
[ -z "$PORT" ] || [[ "$PORT" =~ ^[0-9]{4,5}$ ]] || hata "Port geçersiz: $PORT"
[ -n "$KIP" ] || KIP="$(ayar_oku "$SUNUCU_AYAR" KIP)";KIP="${KIP:-https}"
case "$KIP" in https|tunel) ;; *) hata "Kip geçersiz: '$KIP' (https ya da tunel)";; esac
TUNEL_PORT="$(ayar_oku "$SUNUCU_AYAR" TUNEL_PORT)";TUNEL_PORT="${TUNEL_PORT:-8080}"
for f in "$AYAR_KOK"/*.env; do [ -e "$f" ] || continue; a="$(basename "$f" .env)"; [ "$a" = "$AD" ] && continue
  if [ "$(ayar_oku "$a" ALAN)" = "$ALAN" ]; then hata "$ALAN zaten '$a' kurulumunda kullanılıyor.";fi
  if [ -n "$PORT" ] && [ "$(ayar_oku "$a" PORT)" = "$PORT" ]; then hata "$PORT portu zaten '$a' kurulumunda kullanılıyor.";fi
done
command -v apt-get >/dev/null || hata "Bu betik Ubuntu/Debian (apt) içindir."

# ---------- kaynak dosyalar: çalışma klasörü ya da git sürümü ----------
GECICI="$(mktemp -d)";POLICY_RC=""
trap 'rm -rf "$GECICI"; [ -z "$POLICY_RC" ] || rm -f "$POLICY_RC"' EXIT
if [ -n "$SURUM" ]; then
  command -v git >/dev/null || hata "--surum için git gerekli."
  git_ rev-parse --git-dir >/dev/null 2>&1 || hata "--surum için betiği git deposunun içinden çalıştır."
  bilgi "git: $SURUM getiriliyor"
  git_ fetch --quiet --tags origin 2>/dev/null || uyari "git fetch başarısız; yereldeki $SURUM kullanılacak."
  REF=""
  for r in "origin/$SURUM" "refs/tags/$SURUM" "$SURUM"; do
    if git_ rev-parse --verify --quiet "$r^{commit}" >/dev/null; then REF="$r";break;fi; done
  [ -n "$REF" ] || hata "Sürüm bulunamadı: $SURUM (branch, tag ya da commit olmalı)"
  COMMIT="$(git_ rev-parse --short "$REF^{commit}")"
  ALT="$(git_ rev-parse --show-prefix)";ALT="${ALT%sunucu/}" # depodaki oyun klasörü, ör. kasaba-gecesi/
  git -c safe.directory='*' -C "$(git_ rev-parse --show-toplevel)" archive "$REF" -- "${ALT:-.}" | tar -x -C "$GECICI"
  OYUN="$GECICI/${ALT%/}"
  [ -f "$OYUN/sunucu/server.js" ] || hata "$SURUM sürümünde sunucu yok (sunucu/server.js bulunamadı)."
else
  OYUN="$(cd "$KAYNAK/.." && pwd)"
  SURUM="yerel";COMMIT="$(git_ rev-parse --short HEAD 2>/dev/null || echo '-')"
  if git_ rev-parse --git-dir >/dev/null 2>&1 && [ -n "$(git_ status --porcelain -- "$OYUN")" ]; then COMMIT="$COMMIT+";fi
fi
[ -f "$OYUN/index.html" ] && [ -f "$OYUN/sunucu/package-lock.json" ] || hata "Oyun dosyaları eksik ($OYUN)."

# ---------- port: varsa eskisi, yoksa boş olan ilk port ----------
[ -n "$PORT" ] || PORT="$(ayar_oku "$AD" PORT)"
if [ -z "$PORT" ]; then
  KULLANILAN=" ";for f in "$AYAR_KOK"/*.env; do [ -e "$f" ] || continue; KULLANILAN+="$(ayar_oku "$(basename "$f" .env)" PORT) ";done
  PORT=$ILK_PORT
  while [[ "$KULLANILAN" == *" $PORT "* ]] || portu_kullanan "$PORT"; do PORT=$((PORT+1)); done
fi

# ---------- Node 20 ve Caddy ----------
export DEBIAN_FRONTEND=noninteractive
NODE_MAJOR=0;command -v node >/dev/null && NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ] || ! command -v caddy >/dev/null; then
  bilgi "Gerekli paketler"
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null
fi
if [ "$NODE_MAJOR" -lt 20 ]; then
  bilgi "Node.js 20 kuruluyor"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  bilgi "Caddy kuruluyor"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  # paket kurulunca Caddy kendi örnek ayarıyla :80'de açılmaya çalışır; 80 doluysa (tünel kipi) kurulum
  # takılmasın diye servis burada başlatılmaz, aşağıda bizim ayarla başlar
  if [ ! -e /usr/sbin/policy-rc.d ]; then POLICY_RC=/usr/sbin/policy-rc.d;printf '#!/bin/sh\nexit 101\n' >"$POLICY_RC";chmod +x "$POLICY_RC";fi
  apt-get install -y -qq caddy >/dev/null
  if [ -n "$POLICY_RC" ]; then rm -f "$POLICY_RC";POLICY_RC="";fi
fi

# ---------- oyun dosyaları: önce yan klasöre, hazır olunca yer değiştir ----------
HEDEF="$APP_KOK/$AD";YENI="$APP_KOK/.$AD.yeni";ESKI="$APP_KOK/.$AD.eski"
bilgi "$AD: dosyalar hazırlanıyor ($SURUM, $COMMIT)"
rm -rf "$YENI" "$ESKI";mkdir -p "$YENI/sunucu"
install -m 644 "$OYUN/index.html" "$YENI/index.html"
for f in server.js game.js kayit.js package.json package-lock.json; do [ -f "$OYUN/sunucu/$f" ] && install -m 644 "$OYUN/sunucu/$f" "$YENI/sunucu/" || true; done # eski sürümlerde kayit.js yok
# Caddy şablonu da sürümle birlikte durur: parça hep kurulu sürümün şablonundan üretilir (eski sürümlerde yoksa bu klasördeki)
[ -f "$OYUN/sunucu/Caddyfile" ] && install -m 644 "$OYUN/sunucu/Caddyfile" "$YENI/sunucu/" || true
(cd "$YENI/sunucu" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)

# ---------- systemd: tek şablon, her kurulum game@AD ----------
mkdir -p "$AYAR_KOK"
cat > "$SYSTEMD_KOK/game@.service" <<EOF
# kur.sh yazar. Her kurulum: /opt/games/%i (dosyalar) + /etc/games/%i.env (PORT, ALAN, SURUM)
[Unit]
Description=Oyun sunucusu %i
After=network.target

[Service]
WorkingDirectory=$APP_KOK/%i/sunucu
EnvironmentFile=$AYAR_KOK/%i.env
Environment=NODE_ENV=production HOST=127.0.0.1
ExecStart=$(command -v node) server.js
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
ENV_ESKI="$GECICI/env.eski";[ -f "$AYAR_KOK/$AD.env" ] && cp "$AYAR_KOK/$AD.env" "$ENV_ESKI"
printf 'PORT=%s\nALAN=%s\nSURUM=%s\nCOMMIT=%s\nKG_SURUM=%s\n' "$PORT" "$ALAN" "$SURUM" "$COMMIT" "$SURUM@$COMMIT" > "$AYAR_KOK/$AD.env"

saglikli(){ for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/saglik" >/dev/null 2>&1 && return 0; sleep 0.5; done; return 1; }
systemctl daemon-reload
[ -d "$HEDEF" ] && mv "$HEDEF" "$ESKI"
mv "$YENI" "$HEDEF"
systemctl enable --quiet "game@$AD"
systemctl restart "game@$AD"
if ! saglikli; then
  if [ -d "$ESKI" ]; then
    uyari "Yeni sürüm yanıt vermedi; eski sürüm geri yükleniyor."
    rm -rf "$HEDEF";mv "$ESKI" "$HEDEF"
    if [ -f "$ENV_ESKI" ]; then cp "$ENV_ESKI" "$AYAR_KOK/$AD.env";PORT="$(ayar_oku "$AD" PORT)";fi # eski sürüm eski portunda; sağlık da orada bakılır
    systemctl restart "game@$AD"
    saglikli && hata "Yeni sürüm ($SURUM@$COMMIT) çalışmadı; eski sürüm geri yüklendi ve çalışıyor. Günlük: journalctl -u game@$AD -n 50"
  fi
  hata "Servis yanıt vermiyor. Günlük: journalctl -u game@$AD -n 50"
fi
rm -rf "$ESKI"

# ---------- Caddy: ana dosya yalnız games/*.caddy içe aktarır, her kurulum kendi parçasını yazar ----------
if [ "$KIP" = tunel ]; then bilgi "Caddy (tünel): $ALAN → 127.0.0.1:$TUNEL_PORT → 127.0.0.1:$PORT"
else bilgi "Caddy: $ALAN → 127.0.0.1:$PORT";fi
printf 'KIP=%s\nTUNEL_PORT=%s\n' "$KIP" "$TUNEL_PORT" > "$AYAR_KOK/$SUNUCU_AYAR.env"
ANA="$CADDY_KOK/Caddyfile";IMPORT="import $CADDY_KOK/games/*.caddy"
mkdir -p "$CADDY_KOK/games"
if [ ! -s "$ANA" ] || grep -q '^# Kasaba Gecesi — Caddy ayarı' "$ANA" || grep -q 'root \* /usr/share/caddy' "$ANA"; then
  # boş, paketle gelen örnek ya da eski tek oyunluk kurulum: yerine ana dosyayı yaz
  [ -s "$ANA" ] && cp "$ANA" "$ANA.eski"
  printf '# kur.sh yazar. Her oyun kurulumu %s/games/AD.caddy dosyasında.\n# Başka siteler eklemek istersen bu satırın altına yazabilirsin.\n%s\n' "$CADDY_KOK" "$IMPORT" > "$ANA"
elif ! grep -qxF "$IMPORT" "$ANA"; then
  printf '\n# kur.sh: oyun kurulumları\n%s\n' "$IMPORT" >> "$ANA"   # kullanıcının kendi ayarına dokunmadan ekle
fi
# kip tüm kurulumlar için ortak: her kurulumun parçası yeniden yazılır (kip değişince hepsi birlikte geçer)
for f in "$AYAR_KOK"/*.env; do [ -e "$f" ] || continue; a="$(basename "$f" .env)"
  a_alan="$(ayar_oku "$a" ALAN)";a_port="$(ayar_oku "$a" PORT)"
  if [ "$KIP" = tunel ]; then site="http:\/\/$a_alan:$TUNEL_PORT {\n\tbind 127.0.0.1";else site="$a_alan {";fi
  sablon="$APP_KOK/$a/sunucu/Caddyfile";[ -f "$sablon" ] || sablon="$KAYNAK/Caddyfile"
  sed "s/^ALAN {/$site/; s/127.0.0.1:8787/127.0.0.1:$a_port/" "$sablon" > "$CADDY_KOK/games/$a.caddy"
done
caddy validate --config "$ANA" --adapter caddyfile >"$GECICI/caddy.log" 2>&1 || { cat "$GECICI/caddy.log" >&2; hata "Caddy ayarı geçersiz: $ANA"; }
systemctl enable --quiet caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy
if [ "$KIP" = tunel ]; then
  caddy_saglikli(){ for _ in $(seq 1 20); do curl -fsS -H "Host: $ALAN" "http://127.0.0.1:$TUNEL_PORT/saglik" >/dev/null 2>&1 && return 0; sleep 0.5; done; return 1; }
  caddy_saglikli || uyari "Oyun çalışıyor ama Caddy 127.0.0.1:$TUNEL_PORT üzerinden yanıt vermiyor. Günlük: journalctl -u caddy -n 40"
fi

# eski tek oyunluk kurulum (kasaba-gecesi servisi, /opt/kasaba-gecesi) artık Caddy'den erişilmiyor
if [ -f "$SYSTEMD_KOK/kasaba-gecesi.service" ]; then
  uyari "Eski kurulum (kasaba-gecesi servisi) durduruluyor; dosyaları /opt/kasaba-gecesi içinde duruyor."
  systemctl disable --now --quiet kasaba-gecesi 2>/dev/null || true
  rm -f "$SYSTEMD_KOK/kasaba-gecesi.service";systemctl daemon-reload
fi

# ---------- güvenlik duvarı (tünel kipinde dışarıya port açılmaz) ----------
if [ "$KIP" = https ] && command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

echo
bilgi "Hazır: https://$ALAN   ($AD · $SURUM@$COMMIT · port $PORT)"
echo "   Günlük:          journalctl -u game@$AD -f"
echo "   Yeniden başlat:  systemctl restart game@$AD"
echo "   Kurulumlar:      sudo $0 --liste"
if [ "$KIP" = tunel ]; then
  echo "   Tünel kipi: Cloudflare Tunnel $ALAN adresini http://localhost:$TUNEL_PORT adresine yönlendirmeli."
  if ! systemctl is-active --quiet cloudflared 2>/dev/null; then uyari "cloudflared servisi çalışmıyor (README: Cloudflare Tunnel)."; fi
else
  echo "   İlk açılışta Caddy sertifika alır; birkaç saniye sürebilir. DNS A kaydı bu sunucuyu göstermeli."
fi
exit 0
