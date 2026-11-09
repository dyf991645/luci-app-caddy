set -eu
base=/tmp/luci-caddy-ticket03
if [ "${1:-}" = extended ]; then rm -f "$base/ready" "$base/client-done"; fi
root="$base/run-$(date +%s)-$$"
mkdir -p "$root"
export SSL_CERT_FILE="$base/ca.pem"
export HOME="$root" XDG_DATA_HOME="$root/data" XDG_CONFIG_HOME="$root"
cat > "$root/active.json" <<JSON
{"admin":{"listen":"127.0.0.1:23019","config":{"persist":false}},"storage":{"module":"file_system","root":"$root/data"},"apps":{}}
JSON
for n in 1 2; do
 mkdir -p "$root/www$n"; printf "backend$n\n" > "$root/www$n/index.html"
done
/usr/sbin/uhttpd -f -p 127.0.0.1:23081 -h "$root/www1" >"$root/b1.log" 2>&1 & b1=$!
/usr/sbin/uhttpd -f -p 127.0.0.1:23082 -h "$root/www2" >"$root/b2.log" 2>&1 & b2=$!
/usr/bin/caddy run --config "$root/active.json" >"$root/caddy.log" 2>&1 & cp=$!
trap 'kill "$b1" "$b2" "$cp" 2>/dev/null || true; wait 2>/dev/null || true' EXIT INT TERM
sleep 1
ucode "$base/upstreams.uc" "$base/manager.uc" "$root" "$base/caddy-command" "${1:-}"
for n in 1 2 3 4; do curl -kfs --noproxy '*' --resolve group.example.test:23443:127.0.0.1 https://group.example.test:23443/media/; done > "$root/responses"
[ "$(sort -u "$root/responses" | wc -l)" = 2 ]
for path in /media /mediaX/ /other /; do
 [ "$(curl -ks --noproxy '*' --resolve group.example.test:23443:127.0.0.1 -o /dev/null -w '%{http_code}' "https://group.example.test:23443$path")" = 404 ]
done
[ "$(curl -ks --noproxy '*' --resolve whole.example.test:23443:127.0.0.1 https://whole.example.test:23443/)" = backend1 ]
netstat -lnt | awk '$4 ~ /:(23019|23080|23443|23081|23082)$/ {if ($4 !~ /^127\.0\.0\.1:/) bad=1; found++} END {exit bad || found != 5}'
echo 'PASS real round robin, strip prefix, wildcard boundary404, separate whole-domain site, loopback isolation'

if [ "${1:-}" = extended ]; then
 [ "$(curl -kfs --noproxy '*' --resolve socket.example.test:23443:127.0.0.1 https://socket.example.test:23443/media/check?x=1)" = '/check?x=1|socket.example.test:23443' ]
 [ "$(curl -kfs --noproxy '*' --resolve secure.example.test:23443:127.0.0.1 https://secure.example.test:23443/secure)" = '/secure|127.0.0.1:23084' ]
 [ "$(curl -ks --noproxy '*' --resolve untrusted.example.test:23443:127.0.0.1 -o /dev/null -w '%{http_code}' https://untrusted.example.test:23443/)" = 502 ]
 echo 'PASS TLS hostname mismatch rejected, verified HTTPS upstream, HTTP Host preserved / HTTPS Host set to upstream authority, stripped path and preserved query'
 printf '%s' "$root" > "$base/current-root"
 touch "$base/ready"
 n=0
 while [ ! -f "$base/client-done" ]; do n=$((n+1)); [ "$n" -lt 120 ] || exit 1; sleep 1; done
fi
