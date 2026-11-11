#!/usr/bin/env python3
"""Build official-latest Caddy and LuCI APKs in a fresh, disposable official Linux SDK."""
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


def download_latest(path, url):
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix('.partial')
    run(['curl', '--fail', '--location', '--retry', '3', '--connect-timeout',
         '30', '--max-time', '1800', '--output', partial, url])
    partial.replace(path)
    path.chmod(0o755)


def inspect_caddy(path, runner):
    evidence = {command[0]: run([runner, path, *command], capture=True)
                for command in [['version'], ['list-modules', '--packages', '--versions'], ['build-info']]}
    version = re.match(r'^v([0-9]+\.[0-9]+\.[0-9]+)\s', evidence['version'])
    module = re.search(r'(?m)^dns\.providers\.cloudflare ([^ ]+) github\.com/caddy-dns/cloudflare$', evidence['list-modules'])
    if not version or not module:
        raise ValueError('Official download has no stable Caddy version or Cloudflare DNS module')
    return {'version': 'v' + version[1], 'cloudflare': module[1], 'sha256': sha(path)}, evidence


def build(args):
    lock = json.loads((ROOT / 'artifact-lock.json').read_text())
    target = lock['target']
    sdk_archive = args.cache / 'sdk.tar.zst'
    sdk_url = (f"https://downloads.openwrt.org/releases/{target['openwrt']}/targets/"
               f"{target['target']}/{target['sdk']}")
    acquire(sdk_archive, sdk_url, target['sdk_sha256'], 'SDK')
    caddy = args.cache / 'caddy-linux-arm64'
    download_latest(caddy, lock['caddy']['url'])
    core, downloaded_evidence = inspect_caddy(caddy, args.caddy_runner)
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
    for name in ['base', 'luci', 'packages']:
        run(['./scripts/feeds', 'update', name], cwd=sdk)
        actual = run(['git', '-C', sdk / 'feeds' / name, 'rev-parse', 'HEAD'], capture=True).strip()
        if actual != pins[name]['commit']:
            raise ValueError('Feed commit mismatch: ' + name)
        pins[name]['checked_out_commit'] = actual
    run(['./scripts/feeds', 'install', 'luci-base', 'rpcd-mod-ucode',
         'ucode-mod-fs', 'ucode-mod-ubus', 'ucode-mod-uci', 'curl', 'openssl-util', 'logd'], cwd=sdk)
    for name in ['caddy-binary', 'luci-app-caddy']:
        shutil.copytree(ROOT / 'packages' / name, sdk / 'package' / name)
    (sdk / 'package/caddy-binary/upstream.mk').write_text(
        'CADDY_UPSTREAM_VERSION:=' + core['version'].lstrip('v') + '\n')
    dl = sdk / 'dl'
    dl.mkdir(exist_ok=True)
    shutil.copyfile(caddy, dl / f"caddy-{core['version'].lstrip('v')}-cloudflare-linux-arm64")
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
            raise ValueError('Packaged Caddy differs from the downloaded executable')
        if name == 'luci-app-caddy':
            expected_catalog = args.work / 'caddy.zh-cn.lmo'
            run([sdk / 'staging_dir/hostpkg/bin/po2lmo',
                 ROOT / 'packages/luci-app-caddy/po/zh_Hans/caddy.po', expected_catalog])
            catalog = extract / 'usr/lib/lua/luci/i18n/caddy.zh-cn.lmo'
            if not catalog.is_file() or sha(catalog) != sha(expected_catalog):
                raise ValueError('Packaged native Chinese catalog missing or changed')
        shutil.copyfile(path, args.output / path.name)
        packages.append({'file': path.name, 'architecture': arch, 'sha256': sha(path)})
    # Execute the actual packaged ARM64 binary via qemu on the x86_64 SDK runner.
    binary = args.work / 'extract-caddy-binary/usr/bin/caddy'
    packaged, evidence = inspect_caddy(binary, args.caddy_runner)
    if packaged != core or evidence != downloaded_evidence:
        raise ValueError('Packaged executable metadata differs from the download')
    for name, value in evidence.items():
        (args.output / ('caddy-' + name + '.txt')).write_text(value)
    source = run(['git', '-C', ROOT, 'rev-parse', 'HEAD'], capture=True).strip()
    dirty = bool(run(['git', '-C', ROOT, 'status', '--porcelain', '--untracked-files=normal'], capture=True).strip())
    manifest = {'schema': 1, 'built_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'source': {'commit': source, 'dirty': dirty, 'files': {str(p.relative_to(ROOT)): sha(p) for p in sorted((ROOT / 'packages').rglob('*')) if p.is_file()}}, 'target': target,
                'sdk': {'url': sdk_url, 'sha256': sha(sdk_archive), 'feeds': pins,
                        'feeds_config': feed_config, 'config_sha256': sha(sdk / '.config')},
                'caddy': {**core, 'requested_download_url': lock['caddy']['url'], 'channel': 'latest', 'packaged_sha256': sha(binary), 'evidence': evidence},
                'packages': packages, 'build': {'command': sys.argv, 'jobs': args.jobs,
                'runner': os.environ.get('RUNNER_OS', sys.platform),
                'run_url': os.environ.get('GITHUB_SERVER_URL', '') + '/' + os.environ.get('GITHUB_REPOSITORY', '') + '/actions/runs/' + os.environ.get('GITHUB_RUN_ID', '')},
                'validation': {'apk_integrity': 'passed', 'native_chinese_catalog': 'passed',
                               'installation': 'not performed by this build',
                               'reproducible': False}}
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    shutil.copyfile(ROOT / 'artifact-lock.json', args.output / 'artifact-lock.json')
    (args.output / 'RELEASE-NOTES.md').write_text(
        f"# Caddy OpenWrt APKs\n\nSource: `{source}` (dirty: {dirty}).\n\n"
        f"Target: OpenWrt {target['openwrt']} {target['target']} {target['architecture']}; LuCI noarch.\n\n"
        f"Caddy {core['version']}, Cloudflare {core['cloudflare']}; downloaded upstream, no Caddy source compilation.\n\n"
        'See manifest.json for SDK/feed commits, input and package checksums, and actual module/build information. '
        'Official latest is downloaded on every build, without a predeclared Caddy version or input hash. '
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
