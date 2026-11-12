#!/bin/sh
set -eu
modules="$1"
base=/tmp/luci-caddy-environment/wildcard-r35
root="$base/run-$(date +%s)-$$"
mkdir -p "$root"
chmod 700 "$root"
export HOME="$root" XDG_DATA_HOME="$root/data" XDG_CONFIG_HOME="$root"
caddy=/tmp/luci-caddy-environment/latest-smoke-r34/caddy
cat > "$root/validate-command" <<'COMMAND'
#!/bin/sh
case "$1" in
 validate) exec /tmp/luci-caddy-environment/latest-smoke-r34/caddy validate --config "$2" >/dev/null 2>&1 ;;
 *) exit 1 ;;
esac
COMMAND
chmod 700 "$root/validate-command"
ucode "$modules/wildcard-certificates.uc" "$root" "$modules"
"$caddy" validate --config "$root/production-validation.json" > "$root/validation.log" 2>&1
"$caddy" run --config "$root/internal.json" > "$root/runtime.log" 2>&1 &
fixture_pid=$!
trap 'kill "$fixture_pid" 2>/dev/null || true; wait "$fixture_pid" 2>/dev/null || true' EXIT INT TERM
n=0
while ! curl --noproxy '*' -kfs --max-time 1 --resolve one.example.test:38543:127.0.0.1 https://one.example.test:38543/ > "$root/one.html"; do
 n=$((n+1)); [ "$n" -lt 25 ] || { cat "$root/runtime.log"; exit 1; }
 sleep 0.2
done
for name in one.example.test two.example.test; do
 curl --noproxy '*' -kfs --max-time 3 --resolve "$name:38543:127.0.0.1" "https://$name:38543/" > "$root/$name.html"
 grep -q '<html' "$root/$name.html"
 echo | openssl s_client -connect 127.0.0.1:38543 -servername "$name" 2>/dev/null | openssl x509 -outform PEM > "$root/$name.pem"
 openssl x509 -in "$root/$name.pem" -noout -ext subjectAltName | grep -F '*.example.test'
done
cmp "$root/one.example.test.pem" "$root/two.example.test.pem"
code=$(curl --noproxy '*' -ks --max-time 3 -o /dev/null -w '%{http_code}' --resolve unknown.example.test:38543:127.0.0.1 https://unknown.example.test:38543/)
[ "$code" = 404 ]
[ "$(curl --noproxy '*' -s --max-time 3 -o /dev/null -w '%{http_code}' -H 'Host: one.example.test' http://127.0.0.1:38580/)" = 308 ]
netstat -lnt | awk '$4 ~ /:(38519|38580|38543)$/ {print $4;if($4 !~ /^127\.0\.0\.1:/)bad=1;found++} END {exit bad || found!=3}'
echo 'PASS real latest Caddy: wildcard SAN and identical leaf for two exact routes, proxy 200, unknown host 404, redirect 308; loopback only, no public issuance'
