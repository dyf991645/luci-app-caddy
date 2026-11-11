"""Build input seams; the successful packaging path uses the real SDK."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('caddy_build', ROOT / 'scripts/build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class BuildInputs(unittest.TestCase):
    def test_changed_sdk_stops_before_download_or_execution(self):
        with tempfile.TemporaryDirectory() as temp:
            cache = Path(temp) / 'cache'
            cache.mkdir()
            (cache / 'sdk.tar.zst').write_bytes(b'wrong SDK')
            result = subprocess.run(
                ['python3', str(ROOT / 'scripts/build.py'), '--cache', str(cache),
                 '--work', temp + '/sdk', '--output', temp + '/out'],
                capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('SDK SHA256 mismatch', result.stderr)
            self.assertFalse((Path(temp) / 'sdk').exists())
            self.assertFalse((cache / 'caddy-linux-arm64').exists())

    def test_latest_download_replaces_previous_binary_without_input_hash(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'caddy'
            path.write_bytes(b'old download')
            def download(args):
                Path(args[args.index('--output') + 1]).write_bytes(b'new official response')
            with patch.object(builder, 'run', side_effect=download) as request:
                builder.download_latest(path, 'https://official.example/download')
            self.assertEqual(path.read_bytes(), b'new official response')
            self.assertTrue(path.stat().st_mode & 0o111)
            self.assertEqual(request.call_count, 1)

    def test_versions_are_discovered_and_cloudflare_is_required(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'caddy'
            path.write_bytes(b'fixture')
            for version in ['v2.11.9', 'v2.12.0']:
                with patch.object(builder, 'run', side_effect=[version + ' h1:fixture\n',
                        'dns.providers.cloudflare v0.2.5 github.com/caddy-dns/cloudflare\n', 'go build info']):
                    observed, _ = builder.inspect_caddy(path, 'qemu-aarch64')
                self.assertEqual(observed['version'], version)
                self.assertEqual(observed['cloudflare'], 'v0.2.5')
            with patch.object(builder, 'run', side_effect=['v2.12.0 hash\n', '', 'info']):
                with self.assertRaisesRegex(ValueError, 'Cloudflare'):
                    builder.inspect_caddy(path, 'qemu-aarch64')


if __name__ == '__main__':
    unittest.main()
