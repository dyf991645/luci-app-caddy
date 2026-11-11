#!/usr/bin/ucode
'use strict';
import {readfile} from 'fs';
// An optional root-owned CLI fixture is a local integration seam, never an RPC argument.
let options=ARGV[0]?json(readfile(ARGV[0])):{};
let module=options.module || '/usr/share/caddy-manager/notifications.uc';
while(true) {
 let store=options.root?null:loadfile('/usr/share/caddy-manager/uci-store.uc')()({savedir:'/etc/caddy/uci-committed'});
 let result=loadfile(module)()({...options,store}).check();
 system(['/bin/sleep',''+(result.ok?result.interval||300:60)],301000);
}
