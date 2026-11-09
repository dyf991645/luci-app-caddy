#!/usr/bin/env python3
"""Build the two locked APKs in a fresh, disposable official Linux SDK."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def run(args, cwd=None, capture=False):
    print('+ ' + ' '.join(map(str, args)), flush=True)
    return subprocess.run(list(map(str, args)), cwd=cwd, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None).stdout


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def acquire(path, url, expected, label):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix('.partial')
        run(['curl', '--fail', '--location', '--retry', '3', '--connect-timeout',
             '30', '--max-time', '1800', '--output', partial, url])
        partial.replace(path)
    actual = sha(path)
    if actual != expected:
        raise ValueError(f'{label} SHA256 mismatch: expected {expected}, got {actual}; '
                         'stop and review the artifact; never update the lock automatically')


def build(args):
    lock = json.loads((ROOT / 'artifact-lock.json').read_text())
    target, core = lock['target'], lock['caddy']
    caddy = args.cache / 'caddy-linux-arm64'
    acquire(caddy, args.caddy_url or core['url'], core['sha256'], 'Caddy')
    sdk_archive = args.cache / 'sdk.tar.zst'
    sdk_url = (f"https://downloads.openwrt.org/releases/{target['openwrt']}/targets/"
               f"{target['target']}/{target['sdk']}")
    acquire(sdk_archive, sdk_url, target['sdk_sha256'], 'SDK')
    # Never silently reuse or erase another build's SDK or release output.
    args.work.mkdir(parents=True, exist_ok=False)
    args.output.mkdir(parents=True, exist_ok=False)
    run(['tar', '--zstd', '-xf', sdk_archive, '-C', args.work])
    sdk = args.work / target['sdk'].removesuffix('.tar.zst')
    feed_config = (sdk / 'feeds.conf.default').read_text()
    pins = {}
    for line in feed_config.splitlines():
        fields = line.split()
        if not fields:
            continue
        name, remote = fields[-2:]
        url, commit = remote.rsplit('^', 1)
        if not re.fullmatch(r'[0-9a-f]{40}', commit):
            raise ValueError('SDK contains an unpinned feed: ' + line)
        pins[name] = {'url': url, 'commit': commit}
    # Only feeds needed by these packages; the SDK's own commit pins are authoritative.
    for name in ['base', 'luci']:
        run(['./scripts/feeds', 'update', name], cwd=sdk)
        actual = run(['git', '-C', sdk / 'feeds' / name, 'rev-parse', 'HEAD'], capture=True).strip()
        if actual != pins[name]['commit']:
            raise ValueError('Feed commit mismatch: ' + name)
        pins[name]['checked_out_commit'] = actual
    run(['./scripts/feeds', 'install', 'luci-base', 'rpcd-mod-ucode',
         'ucode-mod-fs', 'ucode-mod-ubus'], cwd=sdk)
    for name in ['caddy-binary', 'luci-app-caddy']:
        shutil.copytree(ROOT / 'packages' / name, sdk / 'package' / name)
    dl = sdk / 'dl'
    dl.mkdir(exist_ok=True)
    shutil.copyfile(caddy, dl / f"caddy-{core['version'].lstrip('v')}-cloudflare-{core['cloudflare'].lstrip('v')}-linux-arm64")
    (sdk / '.config').write_text('CONFIG_ALL=n\nCONFIG_ALL_NONSHARED=n\nCONFIG_ALL_KMODS=n\n'
                                'CONFIG_PACKAGE_caddy-binary=m\nCONFIG_PACKAGE_luci-app-caddy=m\n')
    run(['make', 'defconfig'], cwd=sdk)
    run(['make', f'-j{args.jobs}', 'package/caddy-binary/compile',
         'package/luci-app-caddy/compile', 'V=s'], cwd=sdk)
    apk = sdk / 'staging_dir/host/bin/apk'
    packages = []
    for name, arch in [('caddy-binary', 'aarch64_cortex-a53'), ('luci-app-caddy', 'noarch')]:
        matches = list((sdk / 'bin/packages').rglob(name + '-*.apk'))
        if len(matches) != 1:
            raise ValueError(f'Expected exactly one {name} APK, found {matches}')
        path = matches[0]
        metadata = run([apk, 'adbdump', path], capture=True)
        if not re.search(r'(?m)^  arch:\s*' + re.escape(arch) + r'\s', metadata):
            raise ValueError(f'Wrong APK architecture for {name}: {metadata[:1000]}')
        (args.output / (name + '.metadata.txt')).write_text(metadata)
        run([apk, 'verify', '--allow-untrusted', path])
        extract = args.work / ('extract-' + name)
        extract.mkdir()
        run([apk, 'extract', '--allow-untrusted', '--no-chown', '--destination', extract, path])
        if name == 'caddy-binary' and sha(extract / 'usr/bin/caddy') != core['sha256']:
            raise ValueError('Packaged Caddy differs from reviewed upstream artifact')
        shutil.copyfile(path, args.output / path.name)
        packages.append({'file': path.name, 'architecture': arch, 'sha256': sha(path)})
    # Execute the actual packaged ARM64 binary via qemu on the x86_64 SDK runner.
    binary = args.work / 'extract-caddy-binary/usr/bin/caddy'
    evidence = {}
    for command in [['version'], ['list-modules', '--packages', '--versions'], ['build-info']]:
        evidence[command[0]] = run([args.caddy_runner, binary, *command], capture=True)
    if not evidence['version'].startswith(core['version'] + ' '):
        raise ValueError('Unexpected Caddy version')
    if f"dns.providers.cloudflare {core['cloudflare']} github.com/caddy-dns/cloudflare" not in evidence['list-modules']:
        raise ValueError('Unexpected Cloudflare provider version')
    for name, value in evidence.items():
        (args.output / ('caddy-' + name + '.txt')).write_text(value)
    source = run(['git', '-C', ROOT, 'rev-parse', 'HEAD'], capture=True).strip()
    dirty = bool(run(['git', '-C', ROOT, 'status', '--porcelain', '--untracked-files=normal'], capture=True).strip())
    manifest = {'schema': 1, 'built_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'source': {'commit': source, 'dirty': dirty, 'files': {str(p.relative_to(ROOT)): sha(p) for p in sorted((ROOT / 'packages').rglob('*')) if p.is_file()}}, 'target': target,
                'sdk': {'url': sdk_url, 'sha256': sha(sdk_archive), 'feeds': pins,
                        'feeds_config': feed_config, 'config_sha256': sha(sdk / '.config')},
                'caddy': {**core, 'requested_download_url': args.caddy_url or core['url'], 'packaged_sha256': sha(binary), 'evidence': evidence},
                'packages': packages, 'build': {'command': sys.argv, 'jobs': args.jobs,
                'runner': os.environ.get('RUNNER_OS', sys.platform),
                'run_url': os.environ.get('GITHUB_SERVER_URL', '') + '/' + os.environ.get('GITHUB_REPOSITORY', '') + '/actions/runs/' + os.environ.get('GITHUB_RUN_ID', '')},
                'validation': {'apk_integrity': 'passed', 'installation': 'not performed by this build',
                               'reproducible': False}}
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    shutil.copyfile(ROOT / 'artifact-lock.json', args.output / 'artifact-lock.json')
    (args.output / 'RELEASE-NOTES.md').write_text(
        f"# Caddy OpenWrt APKs\n\nSource: `{source}` (dirty: {dirty}).\n\n"
        f"Target: OpenWrt {target['openwrt']} {target['target']} {target['architecture']}; LuCI noarch.\n\n"
        f"Caddy {core['version']}, Cloudflare {core['cloudflare']}; downloaded upstream, no Caddy source compilation.\n\n"
        'See manifest.json for SDK/feed commits, input and package checksums, and actual module/build information. '
        'The custom download floats its core version; a SHA256 mismatch fails the build. '
        'Artifacts are traceable, not claimed reproducible.\n\n'
        'Build/integrity verification does not prove router installation or ticket 12 acceptance. '
        'Only publish after those checks are approved. APKs use an ephemeral SDK signing key; '
        'review SHA256SUMS and use --allow-untrusted only for these explicitly reviewed packages.\n')
    files = sorted(args.output.iterdir())
    (args.output / 'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.name}\n' for p in files))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=Path('.cache/build'))
    parser.add_argument('--work', type=Path, default=Path('/tmp/luci-caddy-sdk-build'))
    parser.add_argument('--output', type=Path, default=ROOT / 'dist-apk')
    parser.add_argument('--jobs', type=int, default=2)
    parser.add_argument('--caddy-url', default='', help='Reviewed artifact mirror; locked SHA256 is still mandatory')
    parser.add_argument('--caddy-runner', default='qemu-aarch64')
    args = parser.parse_args()
    args.cache, args.work, args.output = (p.resolve() for p in (args.cache, args.work, args.output))
    try:
        build(args)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Build failed: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
