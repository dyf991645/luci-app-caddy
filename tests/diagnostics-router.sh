#!/bin/sh
set -eu
cd /tmp/luci-caddy-ticket10
chmod 700 /tmp/luci-caddy-ticket10
mkdir -p server-home
chmod 700 server-home
cat > server.json <<'JSON'
{"admin":{"disabled":true,"config":{"persist":false}},"apps":{"http":{"servers":{"fixture":{"listen":["127.0.0.1:30081"],"automatic_https":{"disable":true},"logs":{},"routes":[{"handle":[{"handler":"static_response","body":"diagnostic fixture"}]}]}}}}}
JSON
chmod 600 server.json
(umask 077; ulimit -f 128; HOME=/tmp/luci-caddy-ticket10/server-home XDG_DATA_HOME=/tmp/luci-caddy-ticket10/server-home XDG_CONFIG_HOME=/tmp/luci-caddy-ticket10/server-home exec /usr/bin/caddy run --config server.json >server.log 2>&1) &
fixture_pid=$!
trap 'kill "$fixture_pid" 2>/dev/null || true' EXIT INT TERM
sleep 1
ucode tests/diagnostics-logs.uc diagnostics.uc "/tmp/luci-caddy-ticket10/logs-$$"
ucode tests/diagnostics-status.uc diagnostics.uc "/tmp/luci-caddy-ticket10/status-$$" /tmp/luci-caddy-ticket10/diagnostic-command
/bin/uclient-fetch -q -T 2 --no-proxy -O /dev/null --header 'Authorization: Bearer FIXTURE_HEADER_CANARY' 'http://127.0.0.1:30081/?token=FIXTURE_QUERY_CANARY'
ucode tests/diagnostics-real-access.uc diagnostics.uc
