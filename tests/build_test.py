"""Build-interface checks; the successful path is exercised with the real SDK."""
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class BuildInputs(unittest.TestCase):
    def test_changed_upstream_artifact_stops_before_sdk_execution(self):
        with tempfile.TemporaryDirectory() as temp:
            cache = pathlib.Path(temp) / 'cache'
            cache.mkdir()
            (cache / 'caddy-linux-arm64').write_bytes(b'changed upstream download')
            result = subprocess.run(
                ['python3', str(ROOT / 'scripts/build.py'), '--cache', str(cache),
                 '--work', temp + '/sdk', '--output', temp + '/out'],
                capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Caddy SHA256 mismatch', result.stderr)
            self.assertFalse((pathlib.Path(temp) / 'sdk').exists())


if __name__ == '__main__':
    unittest.main()
