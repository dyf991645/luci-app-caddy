#!/usr/bin/env python3
"""Isolated package/service seam, using the target's unmodified platform scripts.

Usage: python3 tests/package-lifecycle.py /path/to/platform-scripts
The directory must contain rc.common and functions.sh copied from the target.
Only paths are redirected; procd is replaced with an observable service adapter.
No installed service, package database or Caddy configuration is touched.
"""
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
PLATFORM = Path(sys.argv.pop(1))


class PackageLifecycle(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='caddy-package-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for directory in ['etc/init.d', 'etc/rc.d', 'etc/caddy', 'lib/apk/packages',
                          'lib/functions', 'var/run', 'source', 'tmp']:
            (self.root / directory).mkdir(parents=True)
        self.write('etc/caddy/active.json', '{"admin":{"listen":"127.0.0.1:2019"}}')
        self.write('lib/apk/packages/caddy-binary.list', '/etc/init.d/caddy\n')
        self.write('source/caddy', self.redirect(
            (ROOT / 'packages/caddy-binary/files/caddy.init').read_text()))
        functions = (PLATFORM / 'functions.sh').read_text()
        # Keep the target's real default_postinst logic, redirecting only paths.
        functions = self.redirect(functions).replace(
            '/rootfs-overlay', str(self.root) + '/rootfs-overlay')
        functions = functions.replace('"$i"', '"' + str(self.root) + '$i"')
        self.write('lib/functions.sh', functions)
        rc = (PLATFORM / 'rc.common').read_text()
        rc = rc.replace('$IPKG_INSTROOT/lib/', str(self.root) + '/lib/')
        rc = rc.replace('$IPKG_INSTROOT/etc/', str(self.root) + '/etc/')
        self.write('rc.common', rc)
        self.write('lib/functions/service.sh', '')
        self.write('lib/functions/procd.sh', self.redirect('''
procd_open_service() { :; }
procd_close_service() { :; }
procd_lock() { :; }
procd_open_instance() { echo start >> /tmp/events; touch /var/run/running; }
procd_close_instance() { :; }
procd_set_param() { :; }
procd_kill() { echo stop >> /tmp/events; rm -f /var/run/running; }
procd_running() { test -f /var/run/running; }
'''))
        self.write('etc/init.d/caddy', '#!/bin/sh\nexec /bin/sh ' +
                   shlex.quote(str(self.root / 'rc.common')) + ' ' +
                   shlex.quote(str(self.root / 'source/caddy')) + ' "$@"\n', 0o755)

    def redirect(self, text):
        # Do not alter grep patterns or file-list entries: these are package paths.
        return re.sub(r'(?<!\^)/(?:etc|var/run|usr/share|usr/bin|lib|tmp)/',
                      lambda match: str(self.root) + match[0], text)

    def write(self, path, content, mode=0o644):
        target = self.root / path
        target.write_text(content)
        target.chmod(mode)

    def run_shell(self, script, upgrade=False):
        environment = {**os.environ, 'PKG_UPGRADE': '1' if upgrade else '',
                       'pkgname': 'caddy-binary', 'IPKG_INSTROOT': ''}
        subprocess.run(['/bin/sh', '-c', script], env=environment,
                       check=True, capture_output=True, text=True)

    def hook(self, name, upgrade=False):
        makefile = (ROOT / 'packages/caddy-binary/Makefile').read_text()
        match = re.search(r'^define Package/caddy-binary/' + name +
                          r'\n(.*?)\nendef$', makefile, re.M | re.S)
        if match:
            self.run_shell(self.redirect(match[1].replace('$$', '$')), upgrade)

    def post_install(self, upgrade=False):
        # The SDK-generated wrapper calls default_postinst BEFORE the custom hook.
        self.run_shell('. ' + shlex.quote(str(self.root / 'lib/functions.sh')) +
                       '\ndefault_postinst', upgrade)
        self.hook('postinst', upgrade)

    def test_fresh_install_leaves_caddy_stopped_and_boot_disabled(self):
        self.hook('preinst')
        self.post_install()
        self.assertFalse((self.root / 'var/run/running').exists())
        self.assertEqual(list((self.root / 'etc/rc.d').iterdir()), [])
        self.assertFalse((self.root / 'tmp/events').exists(),
                         'Package installation must not briefly start Caddy')

    def test_upgrade_restarts_previously_running_caddy_without_enabling_boot(self):
        self.write('var/run/running', '')
        self.hook('preinst', upgrade=True)
        self.assertFalse((self.root / 'var/run/running').exists(),
                         'pre-upgrade must stop the old executable before replacement')
        self.post_install(upgrade=True)
        self.assertTrue((self.root / 'var/run/running').exists())
        self.assertEqual(list((self.root / 'etc/rc.d').iterdir()), [])
        self.assertEqual((self.root / 'tmp/events').read_text().splitlines(),
                         ['stop', 'start'])
        self.assertFalse((self.root / 'var/run/caddy-package-running').exists())

    def test_upgrade_keeps_stopped_service_stopped_for_both_boot_settings(self):
        for enabled in [False, True]:
            with self.subTest(enabled=enabled):
                boot = self.root / 'etc/rc.d/S95caddy'
                if enabled:
                    boot.symlink_to('../init.d/caddy')
                self.hook('preinst', upgrade=True)
                self.post_install(upgrade=True)
                self.assertFalse((self.root / 'var/run/running').exists())
                self.assertEqual(boot.is_symlink(), enabled)
                self.assertFalse((self.root / 'tmp/events').exists(),
                                 'Stopped Caddy must never start during upgrade')

    def test_upgrade_preserves_enabled_boot_and_active_configuration(self):
        boot = self.root / 'etc/rc.d/S95caddy'
        boot.symlink_to('../init.d/caddy')
        self.write('var/run/running', '')
        active = (self.root / 'etc/caddy/active.json').read_bytes()
        self.hook('preinst', upgrade=True)
        self.post_install(upgrade=True)
        self.assertTrue((self.root / 'var/run/running').exists())
        self.assertEqual(boot.readlink(), Path('../init.d/caddy'))
        self.assertEqual((self.root / 'etc/caddy/active.json').read_bytes(), active)
        self.assertEqual((self.root / 'tmp/events').read_text().splitlines(),
                         ['stop', 'start'])

    def test_user_can_enable_and_start_after_install(self):
        self.post_install()
        self.run_shell('unset pkgname; ' + shlex.quote(str(
            self.root / 'etc/init.d/caddy')) + ' enable; ' + shlex.quote(str(
            self.root / 'etc/init.d/caddy')) + ' start')
        self.assertTrue((self.root / 'var/run/running').exists())
        self.assertTrue((self.root / 'etc/rc.d/S95caddy').is_symlink())

    def test_stale_upgrade_marker_cannot_start_a_fresh_install(self):
        self.write('var/run/caddy-package-running', '')
        self.hook('preinst')
        self.post_install()
        self.assertFalse((self.root / 'var/run/running').exists())
        self.assertFalse((self.root / 'var/run/caddy-package-running').exists())


if __name__ == '__main__':
    unittest.main()
