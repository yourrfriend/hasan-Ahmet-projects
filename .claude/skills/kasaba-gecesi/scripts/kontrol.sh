#!/usr/bin/env bash
# Kasaba Gecesi hızlı kontrol: birim + sunucu testleri, istemci sözdizimi, istemci/sunucu sabit eşleşmesi.
#   .claude/skills/kasaba-gecesi/scripts/kontrol.sh         → hızlı (birkaç saniye)
#   .claude/skills/kasaba-gecesi/scripts/kontrol.sh --e2e   → + gerçek tarayıcıyla uçtan uca (~40 sn)
set -euo pipefail
KOK="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
OYUN="$KOK/kasaba-gecesi"
SUNUCU="$OYUN/sunucu"
tamam(){ printf '\033[1;32m✓\033[0m %s\n' "$*"; }
hata(){ printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -d "$SUNUCU/node_modules/ws" ] || (cd "$SUNUCU" && npm install --no-audit --no-fund --loglevel=error)

# 1) İstemci betiği sözdizimi
node -e '
const s=require("fs").readFileSync(process.argv[1],"utf8");
const bloklar=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
for(const b of bloklar)new Function(b);
' "$OYUN/index.html" || hata "index.html içindeki betikte sözdizimi hatası"
tamam "index.html sözdizimi"

# 2) game.js tarayıcıda da yükleniyor mu (module yokken window.KG_GAME tanımlamalı) ve index.html onu kullanıyor mu?
node -e '
const fs=require("fs");
const src=fs.readFileSync(process.argv[2],"utf8");const w={};
new Function("window","globalThis","module",src).call(w,w,w,undefined);
for(const k of ["ROLES","SETUP","COLORS","HATS","roleLabel"])if(!w.KG_GAME||!w.KG_GAME[k]){console.error("KG_GAME."+k+" yok");process.exit(1)}
const s=fs.readFileSync(process.argv[1],"utf8");
if(!/<script src="sunucu\/game\.js(\?v=[^"]*)?"><\/script>/.test(s)){console.error("index.html sunucu/game.js dosyasını yüklemiyor");process.exit(1)}
if(/^const (ROLES|SETUP|COLORS)=/m.test(s)){console.error("index.html içinde sabitlerin kopyası var; tek kaynak sunucu/game.js");process.exit(1)}
' "$OYUN/index.html" "$SUNUCU/game.js" || hata "sunucu/game.js tarayıcı yüklemesi ya da index.html bağlantısı bozuk"
tamam "sabitler tek kaynaktan (sunucu/game.js) geliyor"

# 3) Birim + sunucu testleri
(cd "$SUNUCU" && npm test --silent >/tmp/kg-test.log 2>&1) || { tail -40 /tmp/kg-test.log; hata "npm test başarısız"; }
tamam "npm test ($(grep -E '^(# |ℹ )pass' /tmp/kg-test.log | awk '{print $NF}') test)"   # Node sürümüne göre TAP (# pass N) ya da spec (ℹ pass N)
(bash "$SUNUCU/db/test-betik.sh" >/tmp/kg-betik.log 2>&1) || { cat /tmp/kg-betik.log; hata "db betik testleri başarısız (sahte ortam)"; }
tamam "db betikleri (sahte ortam: caddy/yedek/kur-supabase/uygula)"

# 4) İsteğe bağlı: uçtan uca
if [ "${1:-}" = "--e2e" ]; then
  # Playwright: global kurulum, yoksa npx önbelleği. Tarayıcı: Playwright'ın kendi Chromium'u, yoksa sistemdeki Chrome (PW_CHROMIUM)
  NP="$(npm root -g)"
  if [ ! -d "$NP/playwright" ]; then aday="$(ls -d "$HOME"/.npm/_npx/*/node_modules/playwright 2>/dev/null | head -1 || true)"; [ -n "$aday" ] && NP="$(dirname "$aday")"; fi
  [ -d "$NP/playwright" ] || hata "Playwright bulunamadı (npm i -g playwright)"
  if [ -z "${PW_CHROMIUM:-}" ] && [ ! -d "$HOME/.cache/ms-playwright" ]; then
    for b in google-chrome google-chrome-stable chromium chromium-browser; do if command -v "$b" >/dev/null; then export PW_CHROMIUM="$(command -v "$b")"; break; fi; done
  fi
  (cd "$SUNUCU" && NODE_PATH="$NP${NODE_PATH:+:$NODE_PATH}" npm run e2e --silent >/tmp/kg-e2e.log 2>&1) || { tail -40 /tmp/kg-e2e.log; hata "e2e başarısız"; }
  tamam "e2e (tarayıcı)"
fi
