#!/bin/sh
set -eu
base=/tmp/luci-caddy-ticket07
root="$base/run-$(date +%s)-$$"
mkdir -p "$root/www"
chmod 700 "$root"
export HOME="$root" XDG_CONFIG_HOME="$root" XDG_DATA_HOME="$root/data"
printf 'authenticated backend' > "$root/www/index.html"
printf '{"admin":{"listen":"127.0.0.1:27019","config":{"persist":false}},"storage":{"module":"file_system","root":"%s/data"},"apps":{}}' "$root" > "$root/active.json"
/usr/sbin/uhttpd -f -p 127.0.0.1:27081 -h "$root/www" >"$root/backend.log" 2>&1 &
backend=$!
/usr/bin/caddy run --config "$root/active.json" >"$root/caddy.log" 2>&1 &
caddy=$!
trap 'kill "$caddy" "$backend" 2>/dev/null || true; wait "$caddy" 2>/dev/null || true; wait "$backend" 2>/dev/null || true' EXIT INT TERM
sleep 1
ucode "$base/basic-auth.uc" "$base/config.uc" "$root" "$base/basic-auth-command"
if grep -R 'basic-password-canary-' "$root" >/dev/null; then echo 'FAIL plaintext password persisted or logged'; exit 1; fi
[ ! -f "$root/password.hash" ]
find "$root/basic-profiles" -type f | while read -r file; do [ "$(stat -c %a "$file")" = 600 ]; done
netstat -lnt | awk '$4 ~ /:(27019|27080|27443|27081)$/ {if ($4 !~ /^127\.0\.0\.1:/) bad=1; found++} END {exit bad || found != 4}'
echo 'PASS no plaintext in files/logs, private profiles and loopback listeners'
