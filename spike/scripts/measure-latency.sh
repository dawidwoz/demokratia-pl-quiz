#!/usr/bin/env bash
# Criterion 6: response time after idle. Run once after >= 30 min without requests.
# Usage: spike/scripts/measure-latency.sh https://test.example.pl [requests=20]
set -euo pipefail

base_url="${1:?usage: measure-latency.sh <base-url> [requests]}"
requests="${2:-20}"
url="${base_url%/}/api/health"

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
