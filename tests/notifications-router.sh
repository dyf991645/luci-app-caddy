#!/bin/sh
set -eu
base=/tmp/luci-caddy-ticket09
root="$base/run-$(date +%s)-$$"
mkdir -p "$root/data/certificates/fixture/leaf"
chmod -R 700 "$root"
days=7
case "${1:-}" in threshold90) days=90;; threshold1) days=1;; esac
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
 -keyout "$root/fixture.key" -out "$root/data/certificates/fixture/leaf/leaf.crt" \
 -days "$days" -subj '/CN=Ticket09 Fixture' -addext 'subjectAltName=DNS:a.example.test,DNS:b.example.test' 2>/dev/null
cat > "$root/active.json" <<JSON
{"storage":{"module":"file_system","root":"$root/data"},"apps":{"http":{"servers":{"test":{"routes":[{"match":[{"host":["a.example.test","b.example.test"]}]}]}}}}}
JSON
chmod 600 "$root/fixture.key" "$root/active.json"
printf '' > "$root/events"
if [ "${1:-}" = rpc ]; then
 sed "s@loadfile('/usr/share/caddy-manager/notifications.uc')()()@loadfile('$base/notifications.uc')()({root:'$root'})@g" "$base/luci.caddy" > "$root/rpc-plugin"
 ucode "$base/notification-rpc.uc" "$root/rpc-plugin" "$root"
 exit
fi
if [ "${1:-}" = delivery ]; then
 ucode "$base/notification-delivery.uc" "$base/notifications.uc" "$root" "$base/certificate-command" "$base/certificates.uc" "$2" "$base/webhook-command"
 exit
fi
if [ "${1:-}" = worker ]; then
 cat > "$root/worker-options.json" <<JSON
{"module":"$base/notifications.uc","root":"$root","interval":1,"now":$(( $(date +%s) + 691200 )),"certificate_module":"$base/certificates.uc","certificate_options":{"root":"$root","now":$(( $(date +%s) + 691200 )),"command":"$base/certificate-command","logfile":"$root/events"}}
JSON
 ucode "$base/notification-worker.uc" "$root/worker-options.json" &
 pid=$!
 sleep 3
 kill "$pid"
 wait "$pid" || true
 ucode -e 'import {readfile} from "fs"; let s=json(readfile(ARGV[0])); assert(length(s.events)==1 && s.events[0].type=="expired", "closed UI worker persists expiry event"); print("PASS independent continuously running worker with no LuCI/Caddy session\n");' "$root/notification-state.json"
 exit
fi
if [ "${1:-}" = evidence ] || [ "${1:-}" = threshold90 ] || [ "${1:-}" = threshold1 ]; then
 ucode "$base/notification-evidence.uc" "$base/notifications.uc" "$root" "$base/certificate-command" "$base/certificates.uc" "$days"
 exit
fi
ucode "$base/notifications.uc.test" "$base/notifications.uc" "$root" "$base/certificate-command" "$base/certificates.uc"
