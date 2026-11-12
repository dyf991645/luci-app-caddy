import {fixtureFactory} from './fixture-store.uc';
import {lstat,readfile,writefile} from 'fs';
let root=ARGV[1],mode=ARGV[4],now=time()+8*86400;
let opts={root,certificate_module:ARGV[3],certificate_options:{root,now,command:ARGV[2],logfile:root+'/events'},now,webhook_command:ARGV[5]};
function manager(offset) {return fixtureFactory(ARGV[0])({...opts,now:now+offset});}
let m=manager(0);
assert(m.save({enabled:true,url:'http://127.0.0.1:29082/'+mode+'?token=URL_CANARY',headers:{Authorization:'Bearer HEADER_CANARY', 'X-Quoted':'a"b\\c'}}).ok,'configure controlled receiver');
assert((lstat(root+'/fixture-store.json').mode & 0077)==0,'private config permissions');
if(mode=='retarget')assert(m.save({enabled:true,url:'http://127.0.0.1:29082/retarget?changed=true',headers:{}}).ok,'retarget without retaining previous authorization');
let r=m.check(),id=r.deliveries[0].event_id;
if(mode=='ok' || mode=='recover' || mode=='retarget')assert(r.deliveries[0].delivery=='sent' && r.deliveries[0].attempts==1,'HTTP 2xx delivery succeeds');
else {
 assert(r.deliveries[0].delivery=='pending','3xx, 5xx and timeout fail delivery');
 manager(400).check();manager(800).check();r=manager(1200).check();
 assert(r.deliveries[0].delivery=='exhausted' && r.deliveries[0].attempts==3,'persistent retry budget stops after three attempts');
}
assert(manager(1600).check().deliveries[0].event_id==id,'stable event ID through retries and restart');
assert(index(sprintf('%J',m.status()),'CANARY')<0 && index(sprintf('%J',r),'a"b')<0,'secret config absent from status');
assert(!lstat(root+'/webhook-config') && !lstat(root+'/webhook-result'),'private transient files removed');
print('PASS controlled '+mode+' delivery and persistent budget\n');

if(mode=='recover') {
 assert(system(['/usr/bin/openssl','req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-keyout',root+'/recovery.key','-out',root+'/data/certificates/fixture/leaf/recovery.crt','-days','30','-subj','/CN=Recovery','-addext','subjectAltName=DNS:a.example.test,DNS:b.example.test'],5000)==0,'generate actual covering recovery PEM');
 let recovered=manager(2000).check();
 assert(recovered.alerts[0].phase=='recovered' && recovered.deliveries[-1].type=='recovered' && recovered.deliveries[-1].delivery=='sent','valid PEM replacement sends recovery notification');
 assert(length(manager(2400).check().deliveries)==2,'recovery not repeated');
 print('PASS controlled actual PEM recovery notification exactly one generated event\n');
}
