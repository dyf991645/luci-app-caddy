#!/bin/sh
# Copy manager + this test under this authorized /tmp root. No installed config changes.
set -eu
base=/tmp/luci-caddy-review-fixes
root="$base/redirect-$(date +%s)-$$"
mkdir -p "$root"
chmod 700 "$root"
export XDG_DATA_HOME="$root/data" XDG_CONFIG_HOME="$root"
caddy_pid=''
trap '[ -z "$caddy_pid" ] || { kill "$caddy_pid" 2>/dev/null || true; wait "$caddy_pid" 2>/dev/null || true; }' EXIT INT TERM
for port in 32443 443; do
 ucode "$base/redirects.uc" "$base/config-manager.uc" "$root" "$port"
 # The 443 case only exercises HTTP redirects: never listen on system HTTPS.
 if [ "$port" = 443 ]; then
  sed 's/127.0.0.1:443/127.0.0.1:32443/g' "$root/redirect.json" > "$root/port.json"
  mv "$root/port.json" "$root/redirect.json"
 fi
 /usr/bin/caddy run --config "$root/redirect.json" > "$root/caddy.log" 2>&1 &
 caddy_pid=$!
 sleep 1
 for host in exact.example.test foo.example.test; do
  headers=$(curl -sS --noproxy '*' -D - -o /dev/null -H "Host: $host:32080" 'http://127.0.0.1:32080/a%20b/c?x=one%2Ftwo&y=2')
  expected="https://$host/a%20b/c?x=one%2Ftwo&y=2"
  [ "$port" = 443 ] || expected="https://$host:32443/a%20b/c?x=one%2Ftwo&y=2"
  printf '%s\n' "$headers" | tr -d '\r' | grep -Fx "Location: $expected" || { printf 'FAIL wrong redirect for %s HTTPS %s\n' "$host" "$port"; exit 1; }
  printf '%s\n' "$headers" | grep -q ' 308 '
 done
 netstat -lnt | awk '$4 ~ /:(32019|32080|32443)$/ {if ($4 !~ /^127\.0\.0\.1:/) bad=1; found++} END {exit bad || found != 3}'
 kill "$caddy_pid"; wait "$caddy_pid" || true; caddy_pid=''
done
echo 'PASS real Caddy specific/wildcard redirects preserve host, URI/query and HTTPS port'
