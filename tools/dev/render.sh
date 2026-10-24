#!/usr/bin/env bash
# Render app routes in headless Chrome: dumps the DOM (reports JS errors captured in #errlog) and saves screenshots.
# Usage: tools/dev/render.sh <outdir> route [route...]     e.g. tools/dev/render.sh /tmp/shots today predict area/65
# Env:   HEIGHT=1600 (screenshot height), WIDTH=1400
set -u
OUT="$1"; shift
mkdir -p "$OUT"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="file:///$(cygpath -m "$ROOT" 2>/dev/null || echo "$ROOT")/index.html${QUERY:-}"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
[ -x "$CHROME" ] || CHROME="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
for r in "$@"; do
  slug=$(echo "$r" | tr '/%' '__')
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=8000 --window-size=${WIDTH:-1400},1800 \
    --user-data-dir="$OUT/profile" --dump-dom "$APP#/$r" > "$OUT/$slug.html" 2>/dev/null
  errs=$(python -c "import re,sys,html;t=open(sys.argv[1],encoding='utf-8',errors='replace').read();m=re.search(r'<pre id=\"errlog\"[^>]*>(.*?)</pre>',t,re.S);print(html.unescape(m.group(1)).strip() if m else 'NO ERRLOG (app did not boot?)')" "$OUT/$slug.html")
  echo "[$r] size=$(wc -c < "$OUT/$slug.html") errors: ${errs:-none}"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=8000 --window-size=${WIDTH:-1400},${HEIGHT:-1600} \
    --user-data-dir="$OUT/profile" --screenshot="$(cygpath -w "$OUT/$slug.png" 2>/dev/null || echo "$OUT/$slug.png")" "$APP#/$r" >/dev/null 2>&1
done
