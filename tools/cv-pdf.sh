#!/usr/bin/env bash
#
# Prints the CV pages of a built site to the PDFs they link to, so the PDFs
# are always the CV the site shows. CI runs it between the build and the link
# check (.github/workflows/pages-deploy.yml); locally it is the same:
#
#   JEKYLL_ENV=production bundle exec jekyll b && tools/cv-pdf.sh [_site]
#
# What goes on paper is decided by the print rules in
# assets/css/jekyll-theme-chirpy.scss. Needs Chrome or Chromium; set CHROME
# if it is somewhere unusual.

set -euo pipefail

site="${1:-_site}"
port=4317

chrome="${CHROME:-}"
if [ -z "$chrome" ]; then
  for c in google-chrome google-chrome-stable chromium chromium-browser \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if command -v "$c" >/dev/null 2>&1; then
      chrome="$c"
      break
    fi
  done
fi
if [ -z "$chrome" ]; then
  echo "cv-pdf: no Chrome found; set CHROME" >&2
  exit 1
fi

# Served rather than opened as files: the pages link everything from the root.
# Anything already answering on the port would be printed instead, whatever
# it serves, while this server quietly failed to start.
if curl -s -o /dev/null "http://127.0.0.1:$port/"; then
  echo "cv-pdf: port $port is already taken" >&2
  exit 1
fi
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$site" >/dev/null 2>&1 &
server=$!
profile="$(mktemp -d)" # a fresh profile, so no service worker serves an old page
trap 'kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; rm -rf "$profile"' EXIT
for _ in $(seq 50); do
  curl -sf -o /dev/null "http://127.0.0.1:$port/" && break
  sleep 0.1
done
if ! kill -0 "$server" 2>/dev/null; then
  echo "cv-pdf: could not serve $site on port $port" >&2
  exit 1
fi

mkdir -p "$site/assets/pdf"
# Reduced motion, so nothing is printed halfway through an animation: the
# field, the pointer and the well stand still, as they would on paper.
#
# Chrome writes the file and then, on some systems (macOS, Chrome 154), never
# exits. So rather than wait for it, wait for the PDF to be whole, which is
# when it ends in its %%EOF trailer, and close Chrome ourselves.
print() {
  local out="$site/assets/pdf/$2"
  rm -f "$out"
  "$chrome" --headless=new --disable-gpu --no-first-run --user-data-dir="$profile" \
    --no-pdf-header-footer --virtual-time-budget=10000 --force-prefers-reduced-motion \
    --print-to-pdf="$out" "http://127.0.0.1:$port$1" 2>/dev/null &
  local pid=$!
  for _ in $(seq 600); do
    tail -c 8 "$out" 2>/dev/null | grep -q '%%EOF' && break
    sleep 0.1
  done
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  if ! tail -c 8 "$out" 2>/dev/null | grep -q '%%EOF'; then
    echo "cv-pdf: $1 did not print within a minute" >&2
    return 1
  fi
  echo "cv-pdf: $1 -> assets/pdf/$2"
}
print /cv/ CV_TABURET_Theo_English.pdf
print /fr/cv/ CV_TABURET_Theo_French.pdf
