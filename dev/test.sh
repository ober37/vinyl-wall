#!/bin/sh
# Every test: the task's Python scripts, then the React page's typecheck, Vitest suite and check:cdn (the built page in
# headless Chrome, with its size and first-visit budgets). Exits non-zero if anything fails. Needs web/'s packages
# (npm ci --prefix web) and Chrome; set CHROME to your Chrome binary if it isn't in the usual macOS place.
cd "$(dirname "$0")" || exit 1
python3 -I test_lookup.py || exit 1
python3 -I test_shop_search.py >/dev/null || { python3 -I test_shop_search.py | grep -v "^PASS"; exit 1; }
python3 -I test_discogs.py >/dev/null || { python3 -I test_discogs.py | grep -v "^PASS"; exit 1; }
# the React page in web/, and its built page in Chrome (needs the network: React and appica load from jsdelivr)
[ -d ../web/node_modules ] || { echo "web/ has no packages: run npm ci --prefix web"; exit 1; }
cd ../web && npx tsc && npx vitest run --reporter=dot && npx vite build >/dev/null && npm run -s check:cdn
