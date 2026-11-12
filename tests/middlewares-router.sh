#!/bin/sh
set -eu
modules=${1:-/tmp/luci-caddy-environment/middlewares-r39}
root="$modules/runtime-$(date +%s)-$$"
mkdir -p "$root/www"
printf 'middleware backend success' > "$root/www/index.html"
printf '{"admin":{"listen":"127.0.0.1:39019","config":{"persist":false}},"apps":{}}' > "$root/active.json"
export HOME="$root" XDG_DATA_HOME="$root/data" XDG_CONFIG_HOME="$root"
printf '%s' 'middleware-test-password' | /usr/bin/caddy hash-password > "$root/hash" 2>/dev/null
/usr/sbin/uhttpd -f -p 127.0.0.1:39081 -h "$root/www" >"$root/backend.log" 2>&1 & backend_pid=$!
/usr/bin/caddy run --config "$root/active.json" >"$root/caddy.log" 2>&1 & caddy_pid=$!
trap 'kill "$backend_pid" "$caddy_pid" 2>/dev/null || true; wait 2>/dev/null || true' EXIT INT TERM
sleep 1
ucode "$modules/middlewares.uc" "$root" "$modules"
request() { curl -ksS --retry 5 --retry-all-errors --retry-delay 1 --max-time 3 --noproxy '*' --resolve "$1:39443:127.0.0.1" "https://$1:39443$2" -D "$root/headers" -o "$root/body" -w '%{http_code}'; }
[ "$(request global.example.test /original)" = 200 ]
[ "$(cat "$root/body")" = 'middleware backend success' ]
[ "$(grep -ic '^X-Order:' "$root/headers")" = 5 ]
awk 'tolower($0) ~ /^x-order:/ {sub(/\r$/, ""); printf "%s ", $2}' "$root/headers" > "$root/order"
[ "$(cat "$root/order")" = 'global local first second supplemental ' ]
[ "$(request skip.example.test /original)" = 404 ]
! grep -qi '^X-Private-Middleware:' "$root/headers"
[ "$(request stop.example.test /index.html)" = 403 ]
[ "$(cat "$root/body")" = 'middleware blocked' ]
[ "$(request path.example.test /outside)" = 404 ]
grep -qi '^X-Private-Middleware:' "$root/headers"
[ "$(request path.example.test /scope/test)" = 403 ]
[ "$(request auth.example.test /index.html)" = 401 ]
grep -qi '^X-Private-Middleware:' "$root/headers"
code=$(curl -sS --noproxy '*' -H 'Host: global.example.test' 'http://127.0.0.1:39080/original' -D "$root/headers" -o /dev/null -w '%{http_code}')
[ "$code" = 308 ]
grep -qi '^X-Private-Middleware:' "$root/headers"
netstat -lnt | awk '$4 ~ /:(39019|39080|39443|39081)$/ {if($4 !~ /^127\.0\.0\.1:/)bad=1;found++} END {exit bad || found!=4}'
echo 'PASS real middleware order, independent same-name global/local definitions, rewrites, opt-out, early response, auth precedence and global headers on HTTP redirect/401; loopback only'
