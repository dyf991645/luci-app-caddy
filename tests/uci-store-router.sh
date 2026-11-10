#!/bin/sh
set -eu
modules="$1"
root="/tmp/luci-caddy-uci-r18/integration-$(date +%s)-$$"
mkdir -p "$root/www1" "$root/www2"
printf 'backend1\n' > "$root/www1/index.html"
printf 'backend2\n' > "$root/www2/index.html"
printf '{"admin":{"listen":"127.0.0.1:26019","config":{"persist":false}},"apps":{}}' > "$root/active.json"
export HOME="$root" XDG_DATA_HOME="$root/data" XDG_CONFIG_HOME="$root"
/usr/sbin/uhttpd -f -p 127.0.0.1:26081 -h "$root/www1" >"$root/b1.log" 2>&1 & b1=$!
/usr/sbin/uhttpd -f -p 127.0.0.1:26082 -h "$root/www2" >"$root/b2.log" 2>&1 & b2=$!
/usr/bin/caddy run --config "$root/active.json" >"$root/runtime.log" 2>&1 & cp=$!
trap 'kill "$b1" "$b2" "$cp" 2>/dev/null || true; wait 2>/dev/null || true' EXIT INT TERM
sleep 1
ucode "$modules/uci-store-test.uc" "$root" "$modules"

kill "$cp"; wait "$cp" 2>/dev/null || true
ucode "$modules/uci-offline.uc" "$root" "$modules"
