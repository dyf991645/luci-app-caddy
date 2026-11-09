'use strict';
let manager = loadfile('/usr/share/caddy-manager/config.uc')()();
let result = ARGV[0] == 'reload' ? manager.active_reload() : manager.recover({load:false});
// No private Caddy diagnostics are forwarded to procd or RPC.
if (!result.ok) {
	warn('Caddy managed configuration recovery failed\n');
	exit(1);
}
