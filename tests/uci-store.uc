import {cursor} from 'uci';
import {readfile,writefile,mkdir,chmod} from 'fs';
let root=ARGV[0],modules=ARGV[1];
let configdir=root+'/config';mkdir(configdir,0700);
writefile(configdir+'/caddy',"config manager 'config'\n option revision 'legacy'\n");
let create=loadfile(modules+'/uci-store.uc')(),make=loadfile(modules+'/config.uc')();
let createOptions={root,confdir:configdir},a=create({...createOptions,savedir:root+'/session-a'}),b=create({...createOptions,savedir:root+'/session-b'});
let localOptions={root,admin:'127.0.0.1:26019',bind:'127.0.0.1',internal_tls:true,command:'/usr/share/caddy-manager/caddy-command'};
let ma=make({...localOptions,store:a}),mb=make({...localOptions,store:b});
let cfg={version:2,settings:{http_port:26080,https_port:26443,email:'',storage:root+'/data'},sites:[{domain:'uci.example.test',upstreams:['http://127.0.0.1:26081'],balance:'round_robin',path:'',strip:false,challenge:'http-01'}]};
let saved=ma.draft_save({config:cfg,expected_revision:0});assert(saved.ok,'real UCI store saves valid configuration');
let ra=saved.draft_revision,ca=cursor(configdir,root+'/session-a');
assert(length(ca.changes('caddy').caddy)>0,'save creates an actual native UCI delta');
assert(mb.draft_get().draft==null,'another session cannot see staged configuration');
assert(ma.draft_edit().draft.sites[0].upstreams[0]=='http://127.0.0.1:26081','editable backend persists in own stage');
assert(ca.revert('caddy'),'native UCI revert succeeds');
assert(ma.draft_get().draft==null && !ma.draft_get().pending,'revert returns committed baseline, not stale legacy JSON');
let next=mb.draft_save({config:cfg,expected_revision:0});assert(next.ok && next.draft_revision==ra,'identical effective fields have identical content revisions');
let rb=next.draft_revision,cb=cursor(configdir,root+'/session-b');assert(cb.load('caddy') && cb.commit('caddy'),'native apply commits staged revision');
let sync=loadfile(modules+'/uci-sync.uc')();
let opts={...localOptions,confdir:configdir,manager_module:modules+'/config.uc',store_module:modules+'/uci-store.uc'};
assert(sync(opts).ok,'same synchronization called by native procd trigger loads committed UCI revision');
assert(ma.draft_get().active_revision==rb && !ma.draft_get().pending,'all sessions see committed and active source');
assert(system(['/usr/bin/curl','-kfs','--retry','5','--retry-all-errors','--retry-delay','1','--max-time','3','--noproxy','*','--resolve','uci.example.test:26443:127.0.0.1','https://uci.example.test:26443/','-o',root+'/response'],10000)==0 && trim(readfile(root+'/response'))=='backend1','real Caddy serves committed UCI backend');
// Save a direct edit to the existing backend and apply only Caddy through manager.
cfg.sites[0].upstreams[0]='http://127.0.0.1:26082';
saved=ma.draft_save({config:cfg,expected_revision:rb});assert(saved.ok,'modified existing backend stages');
assert(ma.apply({expected_revision:saved.draft_revision}).ok,'own Apply loads and commits staged Caddy UCI source');
assert(length(cursor(configdir,root+'/session-a').changes('caddy')?.caddy || [])==0,'own Apply clears native delta');
assert(system(['/usr/bin/curl','-kfs','--retry','5','--retry-all-errors','--retry-delay','1','--max-time','3','--noproxy','*','--resolve','uci.example.test:26443:127.0.0.1','https://uci.example.test:26443/','-o',root+'/response'],10000)==0 && trim(readfile(root+'/response'))=='backend2','request reaches edited backend after Apply');
// A native rollback restores both the committed model and actual runtime.
let rollback=cursor(configdir,root+'/uci-committed');rollback.set('caddy','site_1','upstream',['http://127.0.0.1:26081']);assert(rollback.commit('caddy') && sync(opts).ok,'native field rollback synchronizes prior backend');
assert(system(['/usr/bin/curl','-kfs','--retry','5','--retry-all-errors','--retry-delay','1','--max-time','3','--noproxy','*','--resolve','uci.example.test:26443:127.0.0.1','https://uci.example.test:26443/','-o',root+'/response'],10000)==0 && trim(readfile(root+'/response'))=='backend1','rollback restores previous backend');
// Invalid changes do not create a stage or replace active runtime.
cfg.sites[0].upstreams=['bad'];assert(!ma.draft_save({config:cfg,expected_revision:rb}).ok,'invalid backend rejected before UCI staging');
assert(!ma.draft_get().pending && !length(cursor(configdir,root+'/session-a').changes('caddy')?.caddy || []),'rejected save leaves native changes and active unchanged');
// Scoped TLS/credentials also use UCI without leaking credential bytes into deltas.
let tls=ma.tls_save({default_challenge:'dns-01',expected_revision:rb});assert(tls.ok,'TLS defaults stage via UCI');
let secret='privateUciCanaryToken1234',credential=ma.credential_save({token:secret,expected_revision:tls.draft_revision});assert(credential.ok,'credentials stage via UCI references');
assert(index(sprintf('%J',cursor(configdir,root+'/session-a').changes('caddy')),secret)<0,'native changes never expose credential bytes');
let revert=cursor(configdir,root+'/session-a');assert(revert.load('caddy') && revert.revert('caddy'),'revert removes staged TLS and credential reference');
assert(ma.credential_status().configured==false && !ma.draft_get().pending,'revert restores original credential and TLS defaults');
// Native commit with invalid Caddyfile must not replace running configuration.
let bad=ma.draft_edit().draft;bad.mode='manual';bad.manual_caddyfile='http://127.0.0.1:26080 {\n invalid_caddy_directive\n}';
let broken=ma.draft_save({config:bad,expected_revision:rb});assert(broken.ok,'syntactically bounded source stages');
let commitBad=cursor(configdir,root+'/session-a');assert(commitBad.load('caddy') && commitBad.commit('caddy'),'native apply commits candidate before service trigger');
assert(!sync(opts).ok && ma.draft_get().active_revision==rb && ma.draft_get().pending,'failed native application retains previous active and reports pending');
let restore=cursor(configdir,root+'/uci-committed');restore.delete('caddy','config','mode');restore.delete('caddy','config','source');assert(restore.commit('caddy') && sync(opts).ok,'restoring fields clears failed pending source');
print('PASS real UCI staging, session isolation, native revert/commit, trigger synchronization, real Caddy requests, editable backend application, rollback and private TLS credentials\n');
// Basic passwords use the same real hashing/compiler path with private UCI accounts.
let authcfg=ma.draft_edit().draft;authcfg.sites[0].auth={mode:'basic',source:'global'};
let account=ma.basic_profile_save({scope:'global',config:authcfg,users:[{username:'uciuser',password:'privateUciPassword123'}],expected_revision:ma.draft_get().draft_revision});
assert(account.ok,'manager hashes and saves Basic accounts in private UCI');
assert(ma.apply({expected_revision:account.draft_revision}).ok,'real Caddy validates private UCI Basic accounts');
let protectedURL='https://uci.example.test:26443/';
for(let authenticated in [false,true]) {
 let args=['/usr/bin/curl','-kfs','--max-time','20','--noproxy','*','--resolve','uci.example.test:26443:127.0.0.1',protectedURL,'-o',root+'/response'];
 if(authenticated)push(args,'-u','uciuser:privateUciPassword123');
 let result=system(args,25000);assert(authenticated?result==0 && trim(readfile(root+'/response'))=='backend1':result==22,'actual private UCI Basic request result');
}
assert(index(sprintf('%J',ma.draft_edit()),'privateUciPassword123')<0 && index(sprintf('%J',ma.draft_edit()),'$2a$')<0,'account RPC responses never expose password/hash');
let notifier=loadfile(modules+'/notifications.uc')()({root,store:a});
let notice=notifier.save({enabled:false,url:'https://notify.example.test/private',headers:{Authorization:'privateUciHeader'}});
assert(notice.ok && notice.webhook.configured && index(sprintf('%J',notice),'privateUciHeader')<0,'notification save stages private target without readback');
assert(a.notifications().url=='https://notify.example.test/private' && b.notifications().url=='','notification session isolation through module');
let discard=cursor(configdir,root+'/session-a');discard.load('caddy');discard.revert('caddy');assert(a.notifications().url=='','native revert discards notification settings');
print('PASS private UCI Basic account hashing/real validation and staged notification adapter\n');
