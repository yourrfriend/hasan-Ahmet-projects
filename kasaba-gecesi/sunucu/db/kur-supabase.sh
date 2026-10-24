#!/usr/bin/env bash
# Kasaba Gecesi için ayrı, kendi sunucuda Supabase kurulumu (Supabase'in resmi docker/ paketi).
#
#   sudo ./kur-supabase.sh [--dizin /root/supabase-kasaba] [--alan kasaba-api.munupixi.com] [--site https://kasaba.munupixi.com]
#
# Dizin /root altında: ionos'ta Docker snap paketidir; snap'in compose istemcisi /opt'u hiç, /home altında da .env gibi gizli dosyaları okuyamaz.
# Tekrar çalıştırılabilir: paket varsa yeniden indirmez, ayarları yeniden yazar, yığını (konteynerleri yeniden
# yaratmadan) ayağa kaldırır. Portlar yalnız 127.0.0.1'de dinler; dışarıya kapı caddy.sh ile açılır.
# Gizli anahtarları Supabase'in setup.sh'si üretir ve .env'de (mod 600) durur; bu betik ekrana basmaz.
# Studio'ya erişim: ssh -L 8000:127.0.0.1:8000 SUNUCU → http://localhost:8000 (kullanıcı/şifre: sh run.sh secrets).
set -euo pipefail

DIZIN=/root/supabase-kasaba
ALAN=kasaba-api.munupixi.com
SITE=https://kasaba.munupixi.com
EK_YONLENDIRME=https://kasaba-test.munupixi.com
while [ $# -gt 0 ]; do case "$1" in
  --dizin) DIZIN="${2:-}";shift 2;;
  --alan) ALAN="${2:-}";shift 2;;
  --site) SITE="${2:-}";shift 2;;
  *) echo "Bilinmeyen seçenek: $1" >&2;exit 1;;
esac; done

BURASI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bilgi(){ printf '\033[1;32m==>\033[0m %s\n' "$*"; }
uyari(){ printf '\033[1;33m!!\033[0m %s\n' "$*"; }
hata(){ printf '\033[1;31mHATA:\033[0m %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || hata "root olarak çalıştır: sudo $0 $*"
command -v docker >/dev/null || hata "Docker kurulu değil."
docker compose version >/dev/null 2>&1 || hata "docker compose eklentisi yok."
export DEBIAN_FRONTEND=noninteractive
for p in jq openssl curl ca-certificates git; do
  if ! command -v "$p" >/dev/null 2>&1 && ! dpkg -s "$p" >/dev/null 2>&1; then bilgi "$p kuruluyor"; apt-get install -y -qq "$p" >/dev/null; fi
done

# ---------- paket: Supabase'in setup.sh'si (sparse clone + gizli anahtarlar) ----------
if [ ! -f "$DIZIN/docker-compose.yml" ]; then
  bilgi "Supabase paketi indiriliyor → $DIZIN"
  mkdir -p "$(dirname "$DIZIN")"; cd "$(dirname "$DIZIN")"
  GUNLUK="$DIZIN.kurulum.log"; : > "$GUNLUK"; chmod 600 "$GUNLUK"   # setup.sh anahtarları yazdırır: günlük yalnız root okur
  if ! curl -fsSL https://raw.githubusercontent.com/supabase/supabase/master/docker/setup.sh | sh -s -- -y --skip-deps --project-dir "$(basename "$DIZIN")" >>"$GUNLUK" 2>&1; then
    tail -30 "$GUNLUK" >&2; hata "setup.sh başarısız (günlük: $GUNLUK)"
  fi
fi
cd "$DIZIN"
[ -f .env ] || hata "$DIZIN/.env yok; setup.sh anahtar üretmemiş (günlük: $DIZIN.kurulum.log)."
chmod 600 .env

# ---------- override: portlar yalnız yerel, GoTrue bayrakları ----------
install -m 644 "$BURASI/docker-compose.kasaba.yml" ./docker-compose.kasaba.yml
if ! grep -q '^COMPOSE_FILE=.*docker-compose\.kasaba\.yml' .env; then
  sh run.sh config add docker-compose.kasaba.yml >/dev/null
fi

# ---------- .env ayarları (varsa değiştir, yoksa ekle) ----------
ayar(){ local k="$1" v="$2"; if grep -q "^$k=" .env; then sed -i "s|^$k=.*|$k=$v|" .env; else printf '%s=%s\n' "$k" "$v" >> .env; fi; }
ayar SUPABASE_PUBLIC_URL "https://$ALAN"
ayar API_EXTERNAL_URL "https://$ALAN/auth/v1"
ayar SITE_URL "$SITE"
ayar ADDITIONAL_REDIRECT_URLS "$EK_YONLENDIRME"
ayar JWT_EXPIRY 604800
ayar ENABLE_ANONYMOUS_USERS true
ayar ENABLE_EMAIL_SIGNUP false
ayar ENABLE_EMAIL_AUTOCONFIRM false
ayar ENABLE_PHONE_SIGNUP false
ayar DISABLE_SIGNUP false
ayar STUDIO_DEFAULT_PROJECT "Kasaba Gecesi"
ayar STUDIO_DEFAULT_ORGANIZATION munupixi
for k in SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY JWT_SECRET POSTGRES_PASSWORD; do
  [ -n "$(grep "^$k=" .env | cut -d= -f2-)" ] || hata ".env içinde $k boş; sh utils/generate-keys.sh ve sh utils/add-new-auth-keys.sh --update-env çalıştır."
done

# ---------- başlat ----------
bilgi "İmajlar çekiliyor (ilk seferde birkaç dakika)"
sh run.sh pull >/dev/null 2>&1 || uyari "pull sırasında uyarı; mevcut imajlarla deneniyor"
bilgi "Yığın başlatılıyor"
sh run.sh start >/dev/null 2>&1 || true   # --wait sağlıksız servis varsa 1 döner; aşağıda kendimiz bakıyoruz
# ağ geçidi apikey başlığı olmadan her şeye 401 verir; sağlık anahtarla sorulur
PUB_KEY="$(grep '^SUPABASE_PUBLISHABLE_KEY=' .env | cut -d= -f2-)"
saglikli(){ for _ in $(seq 1 60); do curl -fsS -m 3 -H "apikey: $PUB_KEY" http://127.0.0.1:8000/auth/v1/health >/dev/null 2>&1 && return 0; sleep 2; done; return 1; }
saglikli || { docker compose ps; hata "Auth 120 sn içinde yanıt vermedi (http://127.0.0.1:8000/auth/v1/health)."; }
KOTU="$(docker compose ps --format '{{.Name}} {{.Status}}' | grep -E 'unhealthy|Exited|Restarting' || true)"
[ -z "$KOTU" ] || { echo "$KOTU" >&2; hata "Sağlıksız konteyner var."; }

# ---------- yedek zamanlayıcısı (yedek.sh varsa) ----------
if [ -f "$BURASI/yedek.sh" ] && [ -f "$BURASI/supabase-kasaba-yedek.service" ]; then
  install -m 755 "$BURASI/yedek.sh" /usr/local/bin/supabase-kasaba-yedek
  install -m 644 "$BURASI/supabase-kasaba-yedek.service" "$BURASI/supabase-kasaba-yedek.timer" /etc/systemd/system/
  systemctl daemon-reload; systemctl enable --now --quiet supabase-kasaba-yedek.timer
fi

echo
bilgi "Hazır: $DIZIN (Supabase $(cat .supabase-version 2>/dev/null || echo '?'))"
echo "   Dinlenen portlar:"; ss -tln | awk '{print $4}' | grep -E ':(8000|5432|6543)$' | sed 's/^/     /'
echo "   Dış kapı:        sudo $BURASI/caddy.sh   (https://$ALAN/auth/v1/health)"
echo "   Studio:          ssh -L 8000:127.0.0.1:8000 SUNUCU → http://localhost:8000  (kullanıcı/şifre: cd $DIZIN && sh run.sh secrets)"
echo "   Durum/günlük:    cd $DIZIN && sh run.sh status | sh run.sh logs auth"
echo "   Güncelleme:      cd $DIZIN && sh update.sh"
