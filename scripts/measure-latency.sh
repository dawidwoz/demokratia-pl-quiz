#!/usr/bin/env bash
# Response time after idle (spike criterion 6). Run once after >= 30 min without requests.
# Usage: scripts/measure-latency.sh https://test.example.pl [requests=20] [path=/api/health]
# Use path=/api/health/db to include the first database connection in the first request.
# On vh.pl more than about 25 rapid requests from one address returned HTTP 429, so about 10 is enough.
set -euo pipefail

# When started in its own window (double-click, "Run" button), keep the window open so the results can
# be copied. Applies on success and on failure, only when attached to a terminal (never in CI or pipes).
pause_before_exit() {
  if [ -t 0 ] && [ -t 1 ]; then
    read -r -p "Press Enter to close this window..." _ || true
  fi
}
trap pause_before_exit EXIT

base_url="${1:?usage: measure-latency.sh <base-url> [requests] [path]}"
requests="${2:-20}"
path="${3:-/api/health}"
url="${base_url%/}/${path#/}"

times=()
for i in $(seq 1 "$requests"); do
  t=$(curl -sS -o /dev/null -w '%{time_total}' --max-time 30 "$url")
  times+=("$t")
  echo "request $i: ${t}s"
done

printf '%s\n' "${times[@]}" | sort -n | awk '
  { v[NR] = $1 }
  END {
    p50 = v[int((NR + 1) / 2)]
    p95 = v[int(NR * 0.95 + 0.5)]
    printf "first (cold): see request 1 above\nn=%d  p50=%ss  p95=%ss  max=%ss\n", NR, p50, p95, v[NR]
  }'
