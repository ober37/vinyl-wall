#!/bin/sh
# Smoke test: builds the preview, serves dev/ on a spare port, runs dev/test.html in headless Chrome and prints the results.
# Exits non-zero if anything fails. Set CHROME to your Chrome binary if it isn't in the usual macOS place.
cd "$(dirname "$0")" || exit 1
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-8799}"
python3 build.py >/dev/null || exit 1
python3 -I test_lookup.py || exit 1
python3 -I test_discogs.py >/dev/null || { python3 -I test_discogs.py | grep -v "^PASS"; exit 1; }
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; rm -rf "$PROFILE"' EXIT
PROFILE="$(mktemp -d)"
sleep 1
OUT="$("$CHROME" --headless=new --disable-gpu --user-data-dir="$PROFILE" --virtual-time-budget=120000 \
  --dump-dom "http://localhost:$PORT/test.html" 2>/dev/null)"
echo "$OUT" | sed -n '/<pre id="out">/,/<\/pre>/p' | sed 's/<[^>]*>//g; s/&quot;/"/g; s/&amp;/\&/g; s/&lt;/</g; s/&gt;/>/g'
echo "$OUT" | grep -q '<title>DONE all passed</title>'
