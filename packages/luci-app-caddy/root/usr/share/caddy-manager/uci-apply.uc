'use strict';
import { connect } from 'ubus';
// Only committed UCI configuration is loaded by the native config.change event.
let bus=connect(),services=bus?.call('service','list',{name:'caddy'}),instances=services?.caddy?.instances;
if(!bus || services==null) {if(bus)bus.disconnect();warn('Unable to observe Caddy service state\n');exit(1);}
let running=false;for(let name,instance in instances) if(instance.running)running=true;
bus.disconnect();
let result=loadfile('/usr/share/caddy-manager/uci-sync.uc')()({offline:!running});
if(!result.ok) {warn('Caddy UCI configuration was not loaded; check Caddy configuration status\n');exit(1);}

if(system(['/usr/bin/ucode','/usr/share/caddy-manager/uci-services.uc'],10000)!=0)exit(1);
