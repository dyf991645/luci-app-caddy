'use strict';
// Validate the supported UCI format without importing or rewriting old files.
loadfile('/usr/share/caddy-manager/uci-store.uc')()({savedir:'/etc/caddy/uci-committed'}).initialize();
