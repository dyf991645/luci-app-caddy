#!/bin/sh
# Run only in the authorized router /tmp fixture after copying this repository.
set -eu
base=/tmp/luci-caddy-ticket02
root="$base/run-$(date +%s)-$$"
mkdir -p "$root"
chmod 700 "$root"
export HOME="$root" XDG_DATA_HOME="$root/data" XDG_CONFIG_HOME="$root"
cat > "$root/active.json" <<JSON
{"admin":{"listen":"127.0.0.1:22019","config":{"persist":false}},"storage":{"module":"file_system","root":"$root/data"},"apps":{}}
JSON
mkdir -p "$root/www"
printf 'ticket02 backend success\n' > "$root/www/index.html"
/usr/sbin/uhttpd -f -p 127.0.0.1:22081 -h "$root/www" >"$root/backend.log" 2>&1 &
backend_pid=$!
/usr/bin/caddy run --config "$root/active.json" >"$root/caddy.log" 2>&1 &
caddy_pid=$!
trap 'kill "$backend_pid" 2>/dev/null || true; kill "$caddy_pid" 2>/dev/null || true; wait "$caddy_pid" 2>/dev/null || true; wait "$backend_pid" 2>/dev/null || true' EXIT INT TERM
sleep 1
ucode "$base/config.uc" "$base/config-manager.uc" "$root" "$base/caddy-command"
# Internal TLS explicitly avoids OS trust-store installation.
body=$(curl -ks --noproxy '*' --resolve proxy.example.test:22443:127.0.0.1 https://proxy.example.test:22443/)
[ "$body" = 'ticket02 backend success' ]
# All three fixture listeners must remain on loopback.
netstat -lnt | awk '$4 ~ /:(22019|22080|22443|22081)$/ { print $4; if ($4 !~ /^127\.0\.0\.1:/) bad=1; found++ } END {exit bad || found != 4}'
echo 'PASS real HTTPS reverse proxy response; all fixture listeners are loopback only'
# A second public operation must fail promptly while a real apply is in flight.
cat > "$root/slow-command" <<SH
#!/bin/sh
if [ "\$1" = validate ]; then
 touch "$root/applying"
 sleep 2
fi
exec "$base/caddy-command" "\$@"
SH
chmod 700 "$root/slow-command"
ucode "$base/config-concurrency.uc" "$base/config-manager.uc" "$root/concurrent" "$base/caddy-command" prepare
ucode "$base/config-concurrency.uc" "$base/config-manager.uc" "$root/concurrent" "$root/slow-command" apply &
apply_pid=$!
n=0
while [ ! -f "$root/applying" ]; do
 n=$((n+1)); [ "$n" -lt 40 ] || exit 1
 sleep 0.1
done
ucode "$base/config-concurrency.uc" "$base/config-manager.uc" "$root/concurrent" "$base/caddy-command" compete
wait "$apply_pid"
# Kill the manager after real /load succeeds, before disk promotion.
cat > "$root/interrupt-command" <<SH
#!/bin/sh
"$base/caddy-command" "\$@"
result=\$?
if [ "\$1" = reload ] && [ "\$result" = 0 ]; then
 kill -KILL "\$PPID"
fi
exit "\$result"
SH
chmod 700 "$root/interrupt-command"
if ucode "$base/config-recovery.uc" "$base/config-manager.uc" "$root" "$root/interrupt-command" interrupt; then
 echo 'FAIL interruption fixture unexpectedly completed' >&2; exit 1
fi
ucode "$base/config-recovery.uc" "$base/config-manager.uc" "$root" "$base/caddy-command" recover
body=$(curl -ks --noproxy '*' --resolve proxy.example.test:22443:127.0.0.1 https://proxy.example.test:22443/)
[ "$body" = 'ticket02 backend success' ]
echo 'PASS previous HTTPS proxy still works after interrupted apply recovery'
