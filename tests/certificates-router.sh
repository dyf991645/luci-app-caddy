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
for test in certificate-inventory certificate-events certificate-edge; do
 ucode "$base/$test.uc" "$base/certificates.uc" "$root" "$base/certificate-command"
done
# Caddy/Go emits critical SANs for empty subjects. Keep a real OpenSSL-generated
# equivalent alongside the noncritical, wildcard and multi-SAN fixture above.
critical="$root/critical"
mkdir -p "$critical/data/certificates/fixture/leaf"
openssl req -new -key "$root/fixture.key" -subj '/' \
 -out "$root/critical.csr" 2>/dev/null
printf '%s\n' 'subjectAltName=critical,DNS:upgrade-running.example.test' > "$root/critical.ext"
openssl x509 -req -in "$root/critical.csr" \
 -CA "$root/data/certificates/fixture/leaf/leaf.crt" -CAkey "$root/fixture.key" \
 -set_serial 2 -days 7 -extfile "$root/critical.ext" \
 -out "$critical/data/certificates/fixture/leaf/leaf.crt" 2>/dev/null
cat > "$critical/active.json" <<JSON
{"storage":{"module":"file_system","root":"$critical/data"},"apps":{"http":{"servers":{"test":{"routes":[{"match":[{"host":["upgrade-running.example.test"]}]}]}}}}}
JSON
touch "$critical/events"
ucode "$base/certificate-critical-san.uc" "$base/certificates.uc" "$critical" "$base/certificate-command" 'CN=Ticket06 Fixture'
