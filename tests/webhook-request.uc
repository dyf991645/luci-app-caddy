// Isolated real UCI + real curl requests to an explicitly controlled loopback receiver.
import {mkdir,writefile,readfile,chmod} from 'fs';
import {cursor} from 'uci';
let modules=ARGV[0],base=ARGV[1],port=ARGV[2];
let fixture=base+'/certificate-fixture.uc';
writefile(fixture,"return function(){return {check:()=>({ok:true,certificates:[{domains:['quote\\\".example.test'],sites:['quote\\\".example.test'],not_before:1,not_after:2,fingerprint:'fixture',validity:'expired'}],events:{}})};};");
for(let spec in [
 {method:'POST',body_mode:'default',body:''},
 {method:'PUT',body_mode:'custom',body:'{"text":"{{summary}} / {{domains}}","domains":"{{domains}}","expiry":"{{not_after}}","date":"{{expires_at}}","private":"BODY_CANARY"}'},
 {method:'PATCH',body_mode:'custom',body:'PRIVATE_BODY_CANARY\n{{type}}: {{domains}}'},
 {method:'DELETE',body_mode:'none',body:''},
 {method:'GET',body_mode:'custom',body:'retained'},
 {method:'HEAD',body_mode:'default',body:''},
 {method:'OPTIONS',body_mode:'none',body:''}
]) {
 let root=base+'/'+spec.method;mkdir(root,0700);mkdir(root+'/config',0700);
 writefile(root+'/config/caddy',"config manager 'config'\n option schema '3'\n");
 let create=loadfile(modules+'/uci-store.uc')(),store=create({root,confdir:root+'/config',savedir:root+'/session'});
 store.initialize();
 let m=loadfile(modules+'/notifications.uc')()({root,store,now:10,certificate_module:fixture,webhook_command:modules+'/webhook-command'});
 let url='http://127.0.0.1:'+port+'/'+spec.method;
 assert(m.save({enabled:true,url,headers:{},...spec}).ok,'save '+spec.method);
 let status=m.status();assert(status.webhook.method==spec.method && status.webhook.body_mode==spec.body_mode,'public method and body mode');
 assert(index(sprintf('%J',status),'CANARY')<0 && index(sprintf('%J',status),url)<0,'write-only target/body');
 let worker=create({root,confdir:root+'/config',savedir:root+'/uci-committed'});assert(!worker.notifications().enabled,'worker ignores pending UCI');
 let c=cursor(root+'/config',root+'/session'),delta=sprintf('%J',c.changes('caddy'));assert(index(delta,'method')>=0 && index(delta,'CANARY')<0,'native delta has public method but private body absent');
 assert(store.commit(),'commit auxiliary config');assert(worker.notifications().method==spec.method,'worker sees committed method');
 assert(m.save({enabled:true,url:'',headers:{},method:spec.method,body_mode:spec.body_mode,body:''}).ok && store.notifications().body==spec.body,'blank template retains saved value');
 assert(!m.save({enabled:true,headers:{Host:'override'}}).ok && !m.save({enabled:true,headers:{'Content-Length':'1'}}).ok,'framing overrides rejected');
 for(let bad in [{method:'POST\nheader=x'},{body_mode:'invalid'},{method:'POST',body_mode:'custom',body:'{{unknown}}'},{method:'POST',body_mode:'custom',body:'unterminated {{summary'}])assert(!m.save({enabled:true,...bad}).ok,'invalid method/template rejected');
 let runtime=loadfile(modules+'/notifications.uc')()({root,store:worker,now:10,certificate_module:fixture,webhook_command:modules+'/webhook-command'});
 assert(runtime.check().deliveries[0].delivery=='sent','real controlled curl '+spec.method);
 assert(!readfile(root+'/webhook-config') && !readfile(root+'/webhook-payload.json'),'temporary request files removed');
 if(spec.body_mode=='custom') {
  assert(!m.save({enabled:true,url:url+'/changed',method:'POST',body_mode:'custom'}).ok,'retarget must supply new private template');
  assert(m.save({enabled:true,url:url+'/changed',method:'POST',body_mode:'default'}).ok && !length(store.notifications().body),'retarget clears previous body');
 }
 print('PASS UCI stage/commit, privacy, validation and real curl ',spec.method,' ',spec.body_mode,'\n');
}
