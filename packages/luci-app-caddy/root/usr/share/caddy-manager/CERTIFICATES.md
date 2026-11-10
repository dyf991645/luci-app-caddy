# Stored certificate evidence contract (06 / 09)

`loadfile('/usr/share/caddy-manager/certificates.uc')()(options)` returns
`{scan(),status(),check()}`. All three perform the same bounded collection.
Options (`root`, `command`, `logcommand`, `logfile`, `now`) are local test seams,
never RPC parameters. Production uses `/etc/caddy`, installed fixed helpers,
OpenSSL3.5.7 and logd. RPC `certificates()` accepts no arguments and is read-ACL
protected. Its internal evidence ledger writes do not modify configuration.

Results include `ok`, `complete`, `observed_at`, `source`, `history`,
`certificates`, `sites`, and, when supported, `events`. `source` is
`active_filesystem_stored_leaf` or `unsupported_storage`. Storage and active
host matchers come from backend-only active.json; the public draft, filename,
service running and apply success never establish certificate coverage.
Unknown/custom/absent storage gives incomplete/unknown, not a guessed root.

Each certificate includes actual DNS SAN `domains`, full RFC2253 `issuer`,
UTC epoch `not_before`/`not_after`, SHA256 `fingerprint`, associated active
`sites`, `validity` (`valid`, `not_yet_valid`, `expired`) and `near_expiry`.
Near expiry uses min(14days, actual lifetime/6); this is a manager observation,
not Caddy's ARI renewal schedule. A wildcard covers exactly one additional
label. SAN absence never falls back to subject CN. Only the first PEM block
is submitted to OpenSSL. IP SAN items currently do not associate DNS sites;
unknown/malformed SAN renderings fail closed. This strict OpenSSL text parser
is for Caddy's trusted certificate storage, not a general ASN.1 import API.

Only regular `.crt` candidates in storage/certificates/issuer/name are read.
No private keys/accounts/metadata/storage export/PEM/path is returned. A scan
visits <=4096 entries, <=256 certificates, <=256KiB per PEM and <=8MiB total;
wall budget15s plus a final bounded2s helper. OpenSSL output <=64KiB, bounded
by helper RLIMIT_FSIZE and reader. Subtrees/files must be root-owned and
not group/world writable; realpath must match and lstat rejects symlinks.
Snapshots/output live in the root0700 manager directory with0600 permissions
and an exclusive nonblocking scan lock. Before/after inode/mtime/size checks
reject observed file changes. Installed ucode has no O_NOFOLLOW/openat: these
checks do **not** claim race resistance against malicious local root/Caddy
writers. Untrusted local writers must not control this storage tree.
Rejected/unreadable/truncated entries make `complete:false`; partial results
remain useful but absence is unknown. This describes stored leaf evidence,
not which certificate a live TLS connection actually serves.

`events` is a domain-keyed bounded latest-observation ledger (<=256 domains),
with `state` (`pending`, `issuer_error`, `success`), `operation` (`issuance`,
`renewal`), `observed_at`, optional `attempt_started`, fixed safe `error`,
and `source:caddy_2.11.8_logd_window`. Exact recognized messages are source-
derived from Caddy2.11.8 / CertMagic0.25.6, including **the same**
`could not get certificate from issuer` for obtain and renew. Logger decides
operation. No invented cert_renewed event or identifier-free retry attribution.
Raw errors/issuer strings/logs never cross the evidence boundary because
providers may include credentials. Later recognized success clears the error;
replayed/older timestamps do not count as new attempts. `cert.renewal.events`
contains associated observations; `cert.renewal.state` remains unknown because
this ledger cannot establish complete history or final attempt outcome.

Production reads fixed `/sbin/logread -l256 -e caddy` under a2s deadline and
128KiB file budget. The logd ring is bounded; scan results merge into a private
0600 `certificate-evidence.json` via atomic rename under the scan lock.
`history:partial_bounded_logd_window` **always** marks possible capture gaps;
`unavailable` means the current source could not be read. No cursor/full-history
claim: rotated/missed/partial/unknown events cannot prove absence of failures.
An individual issuer error may precede another issuer's success, so it is not
terminal failure and never clears a still-valid stored certificate. Future09
must not infer sustained renewal failure/failure counts from this ledger alone.
Its worker may call check without LuCI open and consume expiry evidence;
stronger terminal-failure notification needs additional attributable evidence.

Real-router tests generate only isolated self-signed fixtures in /tmp. Event
fixtures are explicitly source-derived, not captured public ACME success or
renewal logs. Public issuance/renewal, APK integration and browser visual
acceptance remain separate final checks.
