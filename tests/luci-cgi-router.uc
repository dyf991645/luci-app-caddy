'use strict';
import {connect} from 'ubus';
import {readfile,open,popen,unlink} from 'fs';
let bus=connect(),sid,success=false,root='/tmp/luci-caddy-environment',cfg=root+'/cgi-menu-r23.curl',body=root+'/cgi-menu-r23.html';
function quote(s){return "'"+replace(s,/'/g,"'\\''")+"'";}
try {
 sid=bus.call('session','create',{timeout:120}).ubus_rpc_session;
 bus.call('session','set',{ubus_rpc_session:sid,values:{username:'root',token:replace(trim(readfile('/proc/sys/kernel/random/uuid')),/-/g,'')}});
 bus.call('session','grant',{ubus_rpc_session:sid,scope:'access-group',objects:[['luci-base','read'],['luci-base','write'],['luci-app-caddy','read'],['luci-app-caddy','write'],['luci-mod-admin-full','read'],['luci-mod-admin-full','write']]});
 for(let name,view in {'':'overview','/overview':'overview','/configuration':'configuration','/tls':'tls','/settings':'configuration','/config':'configuration','/diagnostics':'diagnostics','/certificates':'tls','/notifications':'tls'}) {
  let f=open(cfg,'w',0600);assert(f,'private curl config');f.write('url = "http://127.0.0.1/cgi-bin/luci/admin/services/caddy'+name+'"\ncookie = "sysauth_http='+sid+'"\noutput = "'+body+'"\n');f.close();f=open(body,'w',0600);f.close();
  let p=popen('/usr/bin/curl -sS --max-time 10 --config '+quote(cfg)+' --write-out "%{http_code}"','r');let code=trim(p.read('all')),exit=p.close();
  print('Caddy CGI ',name || '/',' HTTP ',code,'\n');
  if(ARGV[0]=='broken')assert(code=='404','reproduce unregistered menu');
  else assert(exit==0 && code=='200' && index(readfile(body),"ui.instantiateView('caddy/"+view+"')")>=0,'authenticated CGI renders correct view');
 }
 success=true;
} catch(e) {warn('CGI menu check failed: '+e.message+'\n');}
unlink(cfg);unlink(body);if(sid)bus.call('session','destroy',{ubus_rpc_session:sid});bus.disconnect();
if(!success)exit(1);
print(ARGV[0]=='broken'?'PASS reproduced authenticated CGI 404\n':'PASS authenticated native LuCI Caddy parent, all pages and TLS aliases\n');
