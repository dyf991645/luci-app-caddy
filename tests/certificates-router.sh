#!/bin/sh
# Authorized /tmp fixture only; no Caddy process, trust store or public issuance.
set -eu
base=/tmp/luci-caddy-ticket06
root="$base/run-$(date +%s)-$$"
mkdir -p "$root/data/certificates/fixture/leaf"
chmod -R 700 "$root"
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
 -keyout "$root/fixture.key" -out "$root/data/certificates/fixture/leaf/leaf.crt" \
 -days 7 -subj '/CN=Ticket06 Fixture' \
 -addext 'subjectAltName=DNS:*.example.test,DNS:other.test' 2>/dev/null
cat > "$root/active.json" <<JSON
{"storage":{"module":"file_system","root":"$root/data"},"apps":{"http":{"servers":{"test":{"routes":[{"match":[{"host":["a.example.test","other.test","a.b.example.test","example.test"]}]}]}}}}}
JSON
chmod 600 "$root/fixture.key" "$root/active.json"
for test in certificates certificate-events certificate-edge; do
 ucode "$base/$test.uc" "$base/certificates.uc" "$root" "$base/certificate-command"
done
