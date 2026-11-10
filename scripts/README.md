# APK build and release

The only supported build target is official OpenWrt 25.12.4,
mediatek/filogic, aarch64_cortex-a53. The LuCI APK is noarch. This is not an
OpenWrt 24.10/opkg build, and CPU architecture alone does not imply compatibility.

Run `python3 scripts/build.py` on Linux x86_64 with the prerequisites listed in
`.github/workflows/build-apk.yml`. The work and output directories must not exist;
use `--work` and `--output` to choose fresh directories. The script never deletes
an existing SDK. Downloads under `--cache` are reusable and checked on every run.
The script extracts the SHA256-locked official SDK, uses its commit-pinned base
LuCI and packages feeds, copies only these two package sources, and runs the real SDK
package targets. Caddy is downloaded, never compiled from source.

The output contains both APKs, their actual metadata, Caddy version/modules/Go
build information, artifact-lock.json, manifest.json, release notes and
SHA256SUMS. The manifest includes source revision/dirty state, SDK and feed
commits, actual upstream and packaged binary checksums, APK checksums and run
URL. The build verifies APK integrity, architectures and the unmodified Caddy
binary; qemu-aarch64 executes that packaged binary to verify core/module versions.
It compiles the native Chinese catalog using the SDK's luci-base host po2lmo
and checks the extracted LuCI APK contains that exact catalog.
It does **not** install the APKs on a router. A successful SDK build cannot replace
installation, authenticated LuCI, configuration or certificate acceptance.

## Manual Actions build

After an authorized push, choose **Build OpenWrt APKs → Run workflow**. Download
`caddy-openwrt-25.12.4-aarch64_cortex-a53-<commit>` from the completed run. Check
`sha256sum --check SHA256SUMS` from the extracted directory, then retain the run
URL and manifest with the matching router installation evidence. No remote run
or publish is performed by local tests.

## Floating upstream download and reviewed cache

The official custom-download URL pins Cloudflare v0.2.4 but does not guarantee a
fixed Caddy core. The reviewed Caddy v2.11.8 artifact is locked by SHA256 in
artifact-lock.json and the package Makefile. A changed response or failed download
must fail the build. Never automatically change the lock to make CI green.

The Actions cache key includes artifact-lock.json. It can preserve a previously
verified download, but it is an expendable cache, not permanent artifact storage.
Retain the original reviewed executable in controlled archival storage with its
checksum and version/module/build-info evidence. For a cache miss after upstream
changes, supply that reviewed archive URL through the manual
`reviewed_caddy_url` input (or locally `--caddy-url URL`), or prepopulate
`<cache>/caddy-linux-arm64`. Mirrors still must match the same locked SHA256.
A corrupt existing cache is rejected; remove only the incorrect download in an
isolated build cache before retrying. The manifest records the requested download
URL; a cache hit may originate from an earlier verified retrieval.

For an intentional upgrade, independently review the downloaded executable on
the target, record actual core/module/build-info, update artifact-lock.json and
`packages/caddy-binary/Makefile` together (version, source name, URL and hash),
then repeat APK installation and runtime acceptance. Preserve the old artifact
for rollback. SDK updates require a new official SDK checksum and renewed target
compatibility verification. Package signatures use the SDK's ephemeral key; this
flow does not establish a trusted signing repository or reproducible output.

## Tags and releases

`v*` tags build the same attachments and publish a GitHub Release after checksum
verification. The Release contains version notes, both APKs and every
provenance/checksum attachment. Manual dispatch uploads artifacts only.

Push a release tag only after release acceptance and explicit publication
authorization. No tag, push, remote workflow run or Release is authorized by
adding this configuration. GitHub environment review can optionally be added
by a maintainer; this workflow requires no additional repository variables or
environment setup.

Keep remote Actions/download/install acceptance pending until the actual run
and target installation are recorded; local fixture success alone must not mark
it complete. SDK signing is ephemeral, so target installation requires explicit
reviewed `apk add --allow-untrusted` usage until a trusted signing process exists.
