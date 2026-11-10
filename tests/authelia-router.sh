set -eu
base=/tmp/luci-caddy-ticket08
root="$base/run-$(date +%s)-$$"
mkdir -p "$root"
chmod 700 "$root"
export HOME="$root" XDG_DATA_HOME="$root/data" XDG_CONFIG_HOME="$root"
cat > "$root/active.json" <<JSON
{"admin":{"listen":"127.0.0.1:28019","config":{"persist":false}},"storage":{"module":"file_system","root":"$root/data"},"apps":{}}
JSON
/usr/bin/caddy run --config "$root/active.json" >"$root/caddy.log" 2>&1 & cp=$!
trap 'kill "$cp" 2>/dev/null || true; wait 2>/dev/null || true' EXIT INT TERM
sleep 1
ucode "$base/authelia.uc" "$base/config.uc" "$root" "$base/caddy-command"
sleep 1
if [ "${1:-}" = real ]; then
 printf '%s' "$root" > "$base/current-root"
 touch "$base/real-ready"
 n=0; while [ ! -f "$base/real-done" ]; do n=$((n+1)); [ "$n" -lt 600 ] || exit 1; sleep 1; done
 exit 0
fi
request() { curl -ks --noproxy '*' --resolve app.example.test:28443:127.0.0.1 "$@"; }
url=https://app.example.test:28443
for code in 302 401 403; do
 status=$(request -H "X-Test-Auth: $code" -D "$root/headers" -o "$root/body" -w '%{http_code}' "$url/media/")
 [ "$status" = "$code" ]
 if [ "$code" = 302 ]; then grep -qi '^location: https://auth.example.test:28443/' "$root/headers"; fi
done
[ "$(request -o /dev/null -w '%{http_code}' "$url/outside")" = 404 ]
request -X POST --data 'original payload' -H 'X-Test-Method: POST' -H 'X-Test-URI: /media/item?x=1' -H 'Remote-User: forged' -H 'Remote-Groups: forged' -H 'Remote-Email: forged' -H 'Remote-Name: forged' "$url/media/item?x=1" > "$root/success.json"
ucode -e 'import {readfile} from "fs"; let r=json(readfile(ARGV[0])); assert(r.method=="POST" && r.uri=="/item?x=1" && r.body=="original payload" && r.identity["Remote-User"]=="fixture-user" && r.identity["Remote-Groups"]=="fixture-group" && r.identity["Remote-Email"]=="fixture@example.test" && r.identity["Remote-Name"]=="Fixture User");' "$root/success.json"
request -H 'X-Test-Identity: absent' -H 'Remote-User: forged' -H 'Remote-Groups: forged' -H 'Remote-Email: forged' -H 'Remote-Name: forged' "$url/media/" > "$root/absent.json"
ucode -e 'import {readfile} from "fs"; let r=json(readfile(ARGV[0])); for(let k,v in r.identity) assert(v==null,"client identity is not trusted even if auth response omits it");' "$root/absent.json"
printf '%s' "$root" > "$base/current-root"
echo 'PASS real Caddy: identity spoof scrubbing, 302 Location/401/403 preserved, original POST body, stripped path/query and outside404'

ucode "$base/authelia-update.uc" "$base/config.uc" "$root" "$base/caddy-command" changed
request "$url/media/" > "$root/changed.json"
curl -ks --noproxy '*' --resolve independent.example.test:28443:127.0.0.1 https://independent.example.test:28443/media/ > "$root/independent.json"
ucode -e 'import {readfile} from "fs"; assert(json(readfile(ARGV[0])).identity["Remote-User"]=="global-updated");assert(json(readfile(ARGV[1])).identity["Remote-User"]=="fixture-user");' "$root/changed.json" "$root/independent.json"
ucode "$base/authelia-update.uc" "$base/config.uc" "$root" "$base/caddy-command" down
[ "$(request -o /dev/null -w '%{http_code}' "$url/media/")" = 502 ]
echo 'PASS original authorization method/URI metadata, dynamic global update, independent isolation and unreachable auth fails closed502'
