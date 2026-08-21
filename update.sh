#!/usr/bin/env bash
# Refresh docs/status.json from live curls + gh api (no clones) + ranks.json.
# Writes a prose brief (not a git log). Optional: SCREENSHOT=1 ./update.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS="$ROOT/docs"
SHOTS="$DOCS/shots"
mkdir -p "$SHOTS"

/usr/bin/python3 "$ROOT/refresh.py" "$DOCS"

if [[ "${SCREENSHOT:-0}" == "1" ]]; then
  CHROME=""
  for c in google-chrome-stable google-chrome chromium chromium-browser; do
    if command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
  done
  if [[ -n "$CHROME" ]]; then
    "$CHROME" --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage \
      --hide-scrollbars --window-size=1440,900 \
      --screenshot="$SHOTS/website.png" --virtual-time-budget=12000 --timeout=20000 \
      "https://cornellphysicalintelligence.com" || true
    "$CHROME" --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage \
      --hide-scrollbars --window-size=1440,900 \
      --screenshot="$SHOTS/wiki.png" --virtual-time-budget=15000 --timeout=25000 \
      "https://wiki.cornellphysicalintelligence.com" || true
    SCREENSHOT=0 "$0"
  else
    echo "no chrome/chromium; skipped screenshots" >&2
  fi
fi
