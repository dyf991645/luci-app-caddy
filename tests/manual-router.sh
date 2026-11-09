#!/bin/sh
set -eu
base=/tmp/luci-caddy-ticket04
root="$base/run-$(date +%s)-$$"
mkdir -p "$root"
chmod 700 "$root"
export HOME="$root" XDG_CONFIG_HOME="$root" XDG_DATA_HOME="$root/data"
cat > "$root/active.json" <<JSON
{"admin":{"listen":"127.0.0.1:24019","config":{"persist":false}},"storage":{"module":"file_system","root":"$root/data"},"apps":{}}
JSON
/usr/bin/caddy run --config "$root/active.json" >"$root/caddy.log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true' EXIT INT TERM
sleep 1
ucode "$base/manual.uc" "$base/config.uc" "$root" "$base/caddy-command"
curl -ks --noproxy '*' --resolve form.example.test:24443:127.0.0.1 -D "$root/headers" https://form.example.test:24443/ >/dev/null
grep -qi '^X-Managed-Snippet: snippet private sentinel' "$root/headers"
netstat -lnt | awk '$4 ~ /:(24019|24080|24443)$/ {if ($4 !~ /^127\.0\.0\.1:/) bad=1; found++} END {exit bad || found != 3}'
echo 'PASS real advanced snippet response header and loopback listeners'
