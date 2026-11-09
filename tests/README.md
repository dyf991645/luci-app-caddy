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

`config-rpc.uc` additionally exercises the public plugin save/read/preview/apply
adapter using a temporary plugin copy whose manager loader is redirected to the
same `/tmp` module and a fresh `/tmp` state root. It never registers/replaces the
installed rpcd plugin. Its second argument is a unique timestamp identifier.
Installed ubus registration, native forms, APK upgrade and procd boot acceptance
remain the deployment fixture's responsibility; local tests cannot replace them.

## APK build boundary

Run `python3 tests/build_test.py` on the host. It submits a changed upstream
artifact to the real build entry point and requires failure before SDK creation.
The success path uses the official SDK, not mocked make output:
`python3 scripts/build.py --cache <reviewed-download-cache> --work <new-dir> --output <new-dir>`.
The build itself checks real APK architecture/integrity, extracts the packaged
Caddy, compares its locked checksum, and executes version/modules/build-info via
qemu-aarch64. See [build instructions](../scripts/README.md) for prerequisites,
provenance and the separate router-install/remote-Actions acceptance boundary.
