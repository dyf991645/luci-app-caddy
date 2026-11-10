#!/bin/sh
# Loopback HTTP only, no ACME, no installed init actions; all state in /tmp.
set -eu
fixture="$1"
pid=''
cleanup() { if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; }
trap cleanup EXIT INT TERM
cat > "$fixture/metrics.json" <<JSON
{"admin":{"disabled":true,"config":{"persist":false}},"storage":{"module":"file_system","root":"$fixture/live-data"},"apps":{"http":{"servers":{"test":{"listen":["127.0.0.1:25997"],"routes":[{"handle":[{"handler":"static_response","body":"metrics-fixture"}]}]}}}}}
JSON
XDG_DATA_HOME="$fixture/live-data" XDG_CONFIG_HOME="$fixture/live-config" /usr/bin/caddy run --config "$fixture/metrics.json" > "$fixture/metrics.log" 2>&1 &
pid=$!
attempt=0
while [ "$attempt" -lt 30 ]; do
 if [ "$(wget -qO- http://127.0.0.1:25997 2>/dev/null || true)" = 'metrics-fixture' ]; then break; fi
 kill -0 "$pid"
 attempt=$((attempt+1))
 sleep 0.1
done
[ "$attempt" -lt 30 ]
ucode -e 'let f=loadfile(ARGV[0])();let m=f(+ARGV[1]);assert(m.uptime_seconds!=null && m.uptime_seconds>=0 && m.uptime_seconds<60,"live Caddy age");assert(m.memory_kib>0,"live Caddy RSS");printf("PASS actual loopback Caddy process metrics: %J\n",m);' "$fixture/process-metrics.uc" "$pid"
