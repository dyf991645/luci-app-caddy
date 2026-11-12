import {fixtureFactory} from './fixture-store.uc';
import {writefile,unlink} from 'fs';
let root=ARGV[1],days=+(ARGV[4]||7),now=time()+(days==90?77*86400:days==1?22*3600:6*86400),base=now-4000;
let opts={root,certificate_module:ARGV[3],certificate_options:{root,now,command:ARGV[2],logfile:root+'/events'},now};
function run() {return fixtureFactory(ARGV[0])(opts).check();}
function log(at,domain) {domain=domain||'a.example.test';writefile(root+'/events',sprintf('%J\n%J\n',{ts:at,logger:'tls.renew',msg:'renewing certificate',identifier:domain},{ts:at+1,logger:'tls.renew',msg:'could not get certificate from issuer',identifier:domain,error:'RAW_ERROR_CANARY'}));}
log(base);assert(!length(run().alerts),'single issuer error does not trigger near alert');
assert(!length(run().alerts),'replayed window cannot count as a second attempt');
log(base+2000,'b.example.test');assert(!length(run().alerts),'different domains do not count as repeated attempts for one domain');
log(base+2100);let r=run();
assert(r.alerts[0].phase=='near_expiry_observed_issues' && r.alerts[0].threshold==(days==90?1209600:days==1?14400:100800),'distinct observations survive checks and use actual lifetime adaptive threshold');
let id=r.alerts[0].episode_id;assert(run().alerts[0].episode_id==id,'restart near alert dedup');
assert(index(sprintf('%J',r),'RAW_ERROR_CANARY')<0,'no provider raw error in alert');
unlink(root+'/data/certificates/fixture/leaf/leaf.crt');
assert(run().alerts[0].phase!='recovered','missing certificate does not prove recovery');
print('PASS distinct partial observations, replay exclusion, adaptive threshold and missing-file non-recovery\n');
