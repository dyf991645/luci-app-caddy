'use strict';
import { connect } from 'ubus';
import { init_enabled, init_action } from 'luci.sys';
let store=loadfile('/usr/share/caddy-manager/uci-store.uc')()({savedir:'/etc/caddy/uci-committed'});
let apply=loadfile('/usr/share/caddy-manager/service-state.uc')();
let result=apply(store.service(),{
 observe:function() {
  let bus=connect(),services=bus?.call('service','list',{name:'caddy'});
  if(services==null){bus?.disconnect();return null;}
  let running=false;for(let name,instance in services?.caddy?.instances)if(instance.running)running=true;
  bus.disconnect();return {running,enabled:!!init_enabled('caddy')};
 },action:action=>init_action('caddy',action)
});
if(!result)exit(1);
