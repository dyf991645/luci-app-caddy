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
let next=mb.draft_save({config:cfg,expected_revision:0});assert(next.ok && next.draft_revision!=ra,'different sessions allocate unique immutable snapshots');
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
let committed=cursor(configdir,root+'/uci-committed');committed.set('caddy','config','revision',''+rb);assert(committed.commit('caddy') && sync(opts).ok,'native rollback synchronizes prior committed snapshot');
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
let restore=cursor(configdir,root+'/uci-committed');restore.set('caddy','config','revision',''+rb);assert(restore.commit('caddy') && sync(opts).ok,'restoring committed revision clears failed pending source');
print('PASS real UCI staging, session isolation, native revert/commit, trigger synchronization, real Caddy requests, editable backend application, rollback and private TLS credentials\n');
