# OpenWrt RPC tests

Run on the agreed OpenWrt 25.12.4 fixture, using only an isolated `/tmp` copy of
the plugin and this harness. Do not replace live rpcd files for the baseline.

```sh
ucode /tmp/luci-caddy-ticket01/runtime.uc /tmp/luci-caddy-ticket01/luci.caddy
```

The baseline requires Caddy to be absent. It checks the public status response,
rejects an injected action, and verifies that all six valid lifecycle operations
report an unavailable service. It never installs or starts a service.

After the reviewed packages have been installed, run the read-only variant:

```sh
ucode /tmp/luci-caddy-ticket01/runtime.uc /tmp/luci-caddy-ticket01/luci.caddy installed
```

This verifies the installed executable's real version and Cloudflare module.
Actual procd start/stop/restart/reload/boot operations and authenticated LuCI ACL
checks require the separately authorized native installation fixture. Record
their results with the target version; syntax checks cannot replace them.

## Ticket02 configuration lifecycle (isolated real router)

Copy `config.uc`, `config-recovery.uc`, `config-concurrency.uc` and
`config-router.sh` into `/tmp/luci-caddy-ticket02/`; copy the installed-source
`config.uc` manager as `/tmp/luci-caddy-ticket02/config-manager.uc` and its
executable `caddy-command` into that same temporary directory. Then run:

```sh
sh /tmp/luci-caddy-ticket02/config-router.sh
```

This harness starts its own Caddy (admin22019, HTTP22080, HTTPS22443) and its own
uhttpd backend22081, all explicitly loopback only, then cleans up both processes.
It does not call installed service actions or replace installed files. HOME/XDG
and storage remain in `/tmp`. Internal CA `install_trust:false` and disabled
Caddy autosave prevent router trust-store/config changes. An expected `Killed`
line is the simulated power-cut window, not a test failure.

Coverage through the exported manager API: save/read without activation, stale
revision rejection, model validation, protected preview, real Caddy validation
of both ACME challenge configurations, real internal HTTPS proxy200, last-active
reload, rejected runtime validation, unavailable admin with explicit uncertain
outcome, recovery, cross-process concurrent save/apply rejection, and process
termination immediately after real load followed by public boot/reload recovery.
HTTP-01/TLS-ALPN-01 production configurations are only validated/provisioned:
**no public ACME issuance succeeds or is attempted by this fixture**.

`config-schema.uc` checks strict unknown-key rejection through public save/read
for top-level, settings and site properties, using a fresh temporary root.

`config-rpc.uc` additionally exercises the public plugin save/read/preview/apply
adapter using a temporary plugin copy whose manager loader is redirected to the
same `/tmp` module and a fresh `/tmp` state root. It never registers/replaces the
installed rpcd plugin. Its second argument is a unique timestamp identifier.
Installed ubus registration, native forms, APK upgrade and procd boot acceptance
remain the deployment fixture's responsibility; local tests cannot replace them.

## APK build boundary

Ticket05: copy `dns.uc`, `dns-rotation.uc`, `dns-rpc.uc`, `dns-router.sh`, the
manager `config.uc` and executable `caddy-command` into `/tmp/luci-caddy-ticket05`.
Run `ucode dns.uc config.uc <fresh-private-root> caddy-command` in that directory,
then `sh dns-router.sh`. The latter creates one short-lived loopback Caddy on
25019/25080/25443, disables certificate automation (not provider provision),
hot loads two private credential versions, rejects a malformed third version,
checks last-active reload, unchanged process PID, private file permissions and
absence of rejected-token daemon log leakage. The RPC test uses a temporary
plugin copy redirected to the same temporary manager and a fresh state root.
No installed plugin/service is changed. Public ACME issuance, Cloudflare token
acceptance/actual DNS mutations, renewal and native visual acceptance remain
explicitly deferred until final controlled public acceptance.

`tls-settings.uc` additionally exercises scoped default/credential writes after
the manual-source integration: both private sources survive, save responses
remain redacted, existing DNS sites retain their method, and manual mode refuses
both mutation methods. Run with the manager module and a fresh temporary root.

Run `python3 tests/build_test.py` on the host. It submits a changed upstream
artifact to the real build entry point and requires failure before SDK creation.
The success path uses the official SDK, not mocked make output:
`python3 scripts/build.py --cache <reviewed-download-cache> --work <new-dir> --output <new-dir>`.
The build itself checks real APK architecture/integrity, extracts the packaged
Caddy, compares its locked checksum, and executes version/modules/build-info via
qemu-aarch64. See [build instructions](../scripts/README.md) for prerequisites,
provenance and the separate router-install/remote-Actions acceptance boundary.

Ticket04 manual source fixture: copy `tests/manual.uc`, `tests/manual-router.sh`,
manager `config.uc` and `caddy-command` to `/tmp/luci-caddy-ticket04/`, make the
command helper executable and run `sh /tmp/luci-caddy-ticket04/manual-router.sh`.
It uses real ucode/Caddy, only loopback24019/24080/24443, mode0700 private runtime
roots and HOME/XDG directories under `/tmp`, with CA trust installation disabled.
It exercises independent source persistence, write-editor/read-state redaction,
actual manual HTTP responses, real snippet header responses, invalid/unsafe
admin/storage rejection, and import/environment rejection. No public ACME or
installed service/config mutation is performed. LuCI and preview browser
interaction acceptance remains separate from these runtime tests.

## Ticket03 upstream groups and path boundary

`upstreams.uc` tests the public manager save/preview/apply seam with real ucode
and Caddy. Copy it, `upstreams-reload.uc`, `upstreams-router.sh`, manager config.uc
(as `manager.uc`) and executable caddy-command into `/tmp/luci-caddy-ticket03`.
Run `sh /tmp/luci-caddy-ticket03/upstreams-router.sh` for the standalone fixture:
loopback admin23019, HTTP23080, HTTPS23443, backends23081/23082. It verifies real
round-robin distribution, stripped prefix, exact wildcard boundary404, separate
domain routing, invalid-input retention and real alternate-policy validation.
Version1 migration is tested without activation.

The optional `extended` fixture additionally needs controlled loopback backends:
create a one-day self-signed CA/server certificate with IP127.0.0.1 SAN; run
`python3 tests/upstreams-host.py serve <ca.pem> <key.pem>` on the host. Copy ONLY
the public ca.pem into the router fixture. Open SSH forwards
`-R 127.0.0.1:23083:127.0.0.1:23183 -R 127.0.0.1:23084:127.0.0.1:23184
-L 127.0.0.1:23444:127.0.0.1:23443`. Run the router script with `extended`, then
read `/tmp/luci-caddy-ticket03/current-root` and run
`python3 tests/upstreams-host.py client <root>` on the host. Finally touch
`/tmp/luci-caddy-ticket03/client-done`; the router script cleans its processes.
Stop the host fixture and cancel the SSH forwards. SSH client multiplexing may
retain forwards after the command exits; explicitly cancel the same forwards
with `ssh -O cancel ... router.home`.

Extended checks verify HTTPS upstream trust using process-only SSL_CERT_FILE
(no OS trust installation), TLS hostname mismatch502, Host behavior, query/path
preservation, actual WebSocket101 and bidirectional frames, and closure of an
open socket after a changed configuration reload. All storage/HOME/XDG remain
in `/tmp`; public ACME and external notifications are never attempted. Native
form visual/browser acceptance and public certificate issuance remain separate.

Ticket06 stored certificate evidence: copy `certificates.uc`, executable
`certificate-command` and `certificate-log` from the manager directory plus
`tests/{certificate-inventory,certificate-events,certificate-edge}.uc` and
`tests/certificates-router.sh` to `/tmp/luci-caddy-ticket06/` on the authorized
router. Run `sh /tmp/luci-caddy-ticket06/certificates-router.sh`. This generates
self-signed short-cycle SAN fixtures only; no Caddy process or public ACME.
Tests cover leaf metadata, one-label wildcard coverage, expiration boundaries,
relative near-expiry, malformed PEM/symlinks/unsupported storage, source-derived
issuer failure→success, replay and credential-error privacy. See
`CERTIFICATES.md` for bounded-window and local filesystem trust limitations.

Ticket09: copy manager `notifications.uc`, `notification-worker.uc`,
`certificates.uc`, executable `certificate-command` and `webhook-command` to
`/tmp/luci-caddy-ticket09/`; copy `tests/notifications.uc` as
`notifications.uc.test`, plus `notification-evidence.uc`,
`notification-delivery.uc`, `notification-argv.uc`, `notifications-router.sh`.
Run `sh /tmp/luci-caddy-ticket09/notifications-router.sh`, then the same command
with `evidence` and `worker`. These generate PEMs exclusively under `/tmp` and
never need a Caddy or LuCI process. The worker fixture executes the actual
continuous worker with a local fixture-options file and a short check interval.

For explicitly authorized controlled notifications, run
`python3 tests/webhook-receiver.py /tmp/luci-caddy-ticket09-received.jsonl` on
the host and establish only `ssh -N -R 29082:127.0.0.1:29082 router.home`.
Run the router fixture with `delivery ok`, `delivery redirect`, `delivery error`
and `delivery slow`. Verify receiver records: exactly1/3/3/3 requests,
respectively, no `/canary` redirect request, stable IDs within each episode,
and only allowlisted payload fields. The slow fixture takes about24seconds
for three bounded8-second attempts with simulated clock backoff. During it,
`ucode /tmp/luci-caddy-ticket09/notification-argv.uc` verifies the real curl
argv excludes URL/query/header canaries without printing any argv. Shut down
the host receiver and explicitly cancel `ssh -O cancel -R 29082:127.0.0.1:29082
router.home` afterward; multiplexed forwarding can outlive the initiating SSH.
No arbitrary real notification target or public ACME endpoint is exercised.
