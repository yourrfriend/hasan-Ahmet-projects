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

# 2) İstemcideki ROLES/SETUP/COLORS/HATS, sunucudaki game.js ile aynı mı?
node -e '
const fs=require("fs");const G=require(process.argv[2]);
const s=fs.readFileSync(process.argv[1],"utf8");
const i=s.indexOf("const ROLES="),j=s.indexOf("function roleLabel",i);
if(i<0||j<0){console.error("index.html içinde ROLES…HATS bloğu bulunamadı");process.exit(1)}
const C=new Function(s.slice(i,j)+";return{ROLES,SETUP,COLORS,HATS}")();
const fark=[];
if(JSON.stringify(C.ROLES)!==JSON.stringify(G.ROLES))fark.push("ROLES");
if(JSON.stringify(C.SETUP)!==JSON.stringify(G.SETUP))fark.push("SETUP");
if(JSON.stringify(C.COLORS)!==JSON.stringify(G.COLORS))fark.push("COLORS");
if(JSON.stringify(C.HATS.map(h=>h[0]))!==JSON.stringify(G.HATS))fark.push("HATS");
if(fark.length){console.error("istemci ile sunucu farklı: "+fark.join(", "));process.exit(1)}
' "$OYUN/index.html" "$SUNUCU/game.js" || hata "index.html ve sunucu/game.js sabitleri eşleşmiyor (ikisini birlikte güncelle)"
tamam "istemci/sunucu sabitleri eşleşiyor"

# 3) Birim + sunucu testleri
(cd "$SUNUCU" && npm test --silent >/tmp/kg-test.log 2>&1) || { tail -40 /tmp/kg-test.log; hata "npm test başarısız"; }
tamam "npm test ($(grep -E '^# pass' /tmp/kg-test.log | awk '{print $3}') test)"

# 4) İsteğe bağlı: uçtan uca
if [ "${1:-}" = "--e2e" ]; then
  NP="$(npm root -g)"
  (cd "$SUNUCU" && NODE_PATH="$NP${NODE_PATH:+:$NODE_PATH}" npm run e2e --silent >/tmp/kg-e2e.log 2>&1) || { tail -40 /tmp/kg-e2e.log; hata "e2e başarısız"; }
  tamam "e2e (tarayıcı)"
fi
