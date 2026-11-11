'use strict';
import {mkdir,open} from 'fs';
mkdir('/etc/caddy',0700);
let lock=open('/etc/caddy/manager.lock','a',0600);
if(!lock || !lock.lock('x'))die('Caddy configuration migration is busy');
loadfile('/usr/share/caddy-manager/uci-store.uc')()({savedir:'/etc/caddy/uci-committed'}).initialize();
lock.close();
