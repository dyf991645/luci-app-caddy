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

## APK build boundary

Run `python3 tests/build_test.py` on the host. It submits a changed upstream
artifact to the real build entry point and requires failure before SDK creation.
The success path uses the official SDK, not mocked make output:
`python3 scripts/build.py --cache <reviewed-download-cache> --work <new-dir> --output <new-dir>`.
The build itself checks real APK architecture/integrity, extracts the packaged
Caddy, compares its locked checksum, and executes version/modules/build-info via
qemu-aarch64. See [build instructions](../scripts/README.md) for prerequisites,
provenance and the separate router-install/remote-Actions acceptance boundary.
