#!/bin/sh
set -eu
base=/tmp/luci-caddy-ticket05
root="$base/run-$(date +%s)-$$"
mkdir -p "$root"
chmod 700 "$root"
export HOME="$root" XDG_CONFIG_HOME="$root/config" XDG_DATA_HOME="$root/data"
cat > "$root/active.json" <<JSON
{"admin":{"listen":"127.0.0.1:25019","config":{"persist":false}},"apps":{}}
JSON
chmod 600 "$root/active.json"
/usr/bin/caddy run --config "$root/active.json" >"$root/caddy.log" 2>&1 &
caddy_pid=$!
trap 'kill "$caddy_pid" 2>/dev/null || true; wait "$caddy_pid" 2>/dev/null || true' EXIT INT TERM
sleep 1
ucode "$base/dns-rotation.uc" "$base/config.uc" "$root" "$base/caddy-command"
kill -0 "$caddy_pid"
# Running admin configuration must contain the selected replacement, not its
# predecessor or rejected candidate. Keep private API output off the terminal.
curl -fsS http://127.0.0.1:25019/config/ > "$root/admin-private.json"
ucode -e 'import {readfile} from "fs"; let c=json(readfile(ARGV[0])); assert(c.apps.tls.automation.policies[0].issuers[0].challenges.dns.provider.api_token=="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","running process sees replacement token");' "$root/admin-private.json"
chmod 600 "$root/admin-private.json"
if grep -q 'ticket05!invalid-replacement-canary' "$root/caddy.log"; then echo 'FAIL token leaked to daemon log'; exit 1; fi
[ "$(stat -c '%a' "$root/fixture-store.json")" = 600 ]
echo 'PASS same Caddy PID, replacement in real admin config, root-only credentials, no rejected-token log leak'
