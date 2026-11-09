#!/bin/sh
# Run only on the explicitly authorized native installation fixture.
set -eu

status() { ubus call luci.caddy status '{}'; }
field() { jsonfilter -e "@.$1"; }
action() {
	response=$(ubus call luci.caddy action "{\"action\":\"$1\"}")
	[ "$(printf '%s' "$response" | field ok)" = true ] || {
		printf 'FAIL: %s: %s\n' "$1" "$response" >&2
		exit 1
	}
}
pid() { ubus call service list '{"name":"caddy"}' | jsonfilter -e '@.caddy.instances.caddy.pid'; }
wait_running() {
	count=0
	while [ "$(status | field running)" != "$1" ]; do
		count=$((count + 1))
		[ "$count" -lt 10 ] || { printf 'FAIL: running did not become %s\n' "$1" >&2; exit 1; }
		sleep 1
	done
}

# Also proves rpcd registered the package's public object.
[ "$(ubus list luci.caddy)" = luci.caddy ]
initial=$(status)
initial_running=$(printf '%s' "$initial" | field running)
initial_enabled=$(printf '%s' "$initial" | field enabled)
restore() {
	if [ "$initial_enabled" = true ]; then action enable; else action disable; fi
	if [ "$initial_running" = true ]; then action start; else action stop; fi
}
trap restore EXIT

action start
wait_running true
first_pid=$(pid)
[ -n "$first_pid" ]
curl --fail --silent --max-time 5 --output /dev/null http://127.0.0.1:2019/config/
netstat -lnt | awk '$4 ~ /:2019$/ { found=1; if ($4 != "127.0.0.1:2019") bad=1 } END { exit (!found || bad) }'
printf 'PASS: native RPC starts procd Caddy and admin listens only on loopback\n'

action reload
wait_running true
[ "$(pid)" = "$first_pid" ]
printf 'PASS: reload preserves the Caddy process\n'

action restart
wait_running true
[ "$(pid)" != "$first_pid" ]
printf 'PASS: restart replaces the Caddy process\n'

action enable
[ "$(status | field enabled)" = true ]
action disable
[ "$(status | field enabled)" = false ]
printf 'PASS: boot setting follows the native init service\n'

action stop
wait_running false
printf 'PASS: native RPC stops procd Caddy\n'
