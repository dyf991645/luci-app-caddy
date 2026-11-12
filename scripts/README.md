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
URL. The build verifies APK integrity, architectures and the unmodified downloaded Caddy
binary; qemu-aarch64 executes it to discover and verify actual core/module versions.
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

## Official latest download

Every build downloads the official Linux ARM64 custom executable with the
Cloudflare module, without pinning the core/module version or an input SHA256.
Caddy downloads are not restored from the Actions cache. The build runs the
actual executable through qemu-aarch64 to obtain its core/module/build versions,
generates upstream.mk in the temporary SDK package directory, and uses the
observed core version for APK metadata. No Caddy source is compiled.

The manifest and SHA256SUMS still record actual bytes. The packaged executable
must be identical to this build's download; these checks detect packaging changes,
not upstream updates. The official OpenWrt SDK checksum and SDK feed commit pins
remain fixed for the target firmware. Preserve completed build artifacts for
rollback: a later latest download may contain a different Caddy version.

Ordinary branch pushes (including integration/caddy-v1), pull requests and schedules
do not trigger this workflow. Manual dispatch builds attachments only, even when
run against a tag; it requires the workflow on the default branch. Only v* tag
push events build and create a draft Release. Same-ref builds queue instead of cancelling
a running build. No automatic retries are configured.

## Tags and releases

`v*` tags build the same attachments and create a draft GitHub Release after checksum
verification. Download that run's artifacts, verify and install those exact APKs on
the target router, then publish the draft after acceptance. Publishing the draft
does not trigger this workflow, so acceptance and publication use one build.
The Release contains version notes, both APKs and every provenance/checksum
attachment. Manual dispatch uploads artifacts only.

Push a release tag only after release acceptance and explicit publication
authorization. No tag, push, remote workflow run or Release is authorized by
adding this configuration. GitHub environment review can optionally be added
by a maintainer; this workflow requires no additional repository variables or
environment setup.

Keep remote Actions/download/install acceptance pending until the actual run
and target installation are recorded; local fixture success alone must not mark
it complete. SDK signing is ephemeral, so target installation requires explicit
reviewed `apk add --allow-untrusted` usage until a trusted signing process exists.
