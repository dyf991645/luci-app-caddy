import {lstat,readfile,writefile} from 'fs';
let root=ARGV[1],mode=ARGV[4],now=time()+8*86400;
let opts={root,certificate_module:ARGV[3],certificate_options:{root,now,command:ARGV[2],logfile:root+'/events'},now,webhook_command:ARGV[5]};
function manager(offset) {return loadfile(ARGV[0])()({...opts,now:now+offset});}
let m=manager(0);
assert(m.save({enabled:true,url:'http://127.0.0.1:29082/'+mode+'?token=URL_CANARY',headers:{Authorization:'Bearer HEADER_CANARY', 'X-Quoted':'a"b\\c'}}).ok,'configure controlled receiver');
assert((lstat(root+'/notifications.json').mode & 0077)==0,'private config permissions');
let r=m.check(),id=r.deliveries[0].event_id;
if(mode=='ok')assert(r.deliveries[0].delivery=='sent' && r.deliveries[0].attempts==1,'HTTP 2xx delivery succeeds');
else {
 assert(r.deliveries[0].delivery=='pending','3xx, 5xx and timeout fail delivery');
 manager(400).check();manager(800).check();r=manager(1200).check();
 assert(r.deliveries[0].delivery=='exhausted' && r.deliveries[0].attempts==3,'persistent retry budget stops after three attempts');
}
assert(manager(1600).check().deliveries[0].event_id==id,'stable event ID through retries and restart');
assert(index(sprintf('%J',m.status()),'CANARY')<0 && index(sprintf('%J',r),'a"b')<0,'secret config absent from status');
assert(!lstat(root+'/webhook-config') && !lstat(root+'/webhook-result'),'private transient files removed');
print('PASS controlled '+mode+' delivery and persistent budget\n');
