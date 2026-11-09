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
