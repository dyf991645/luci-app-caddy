import {cursor} from 'uci';import {mkdir,writefile,readfile} from 'fs';
let root=ARGV[0],modules=ARGV[1];mkdir(root,0700);mkdir(root+'/config',0700);writefile(root+'/config/caddy',"config manager 'config'\n option schema '3'\n");
let makeStore=loadfile(modules+'/uci-store.uc')();
let store=makeStore({root,confdir:root+'/config',savedir:root+'/session'});
let create=loadfile(modules+'/config.uc')();
let manager=create({root,store,admin:'127.0.0.1:39019',bind:'127.0.0.1',internal_tls:true,command:modules+'/caddy-command'});
let base={enabled:true,upstreams:['http://127.0.0.1:39081'],balance:'round_robin',path:'',strip:false,challenge:'http-01',auth:{mode:'none'}};
let cfg={version:2,settings:{http_port:39080,https_port:39443,email:'',storage:root+'/data'},global_middlewares:[{id:'security_headers',snippet:'header +X-Order global\nheader X-Private-Middleware private-middleware-canary'}],middlewares:[
 {id:'security_headers',snippet:'header +X-Order local'},
 {id:'first',snippet:'header +X-Order first\nrewrite /original /first'},
 {id:'second',snippet:'header +X-Order second\nrewrite /first /index.html'},
 {id:'blocked',snippet:'respond "middleware blocked" 403'}
],sites:[
 {...base,domain:'global.example.test',middlewares:['security_headers','first','second'],advanced_snippet:'header +X-Order supplemental'},
 {...base,domain:'skip.example.test',use_global_middlewares:false,middlewares:['second','first']},
 {...base,domain:'stop.example.test',middlewares:['blocked']},
 {...base,domain:'path.example.test',path:'/scope/*',middlewares:['blocked']},
 {...base,domain:'auth.example.test',auth:{mode:'basic',source:'global'},middlewares:['blocked']}
]};
let hash=trim(readfile(root+'/hash'));cfg.auth={basic:{profile:store.saveProfile([{username:'alice',hash}])}};
let saved=manager.draft_save({config:cfg,expected_revision:0});assert(saved.ok,'save global/catalog/site references');
assert(index(sprintf('%J',manager.draft_get()),'private-middleware-canary')<0,'read-only state redacts middleware source');
assert(manager.draft_edit().draft.middlewares[0].snippet==cfg.middlewares[0].snippet,'authorized editor sees middleware content');
let c=cursor(root+'/config',root+'/session');assert(c.get('caddy','security_headers')=='middleware' && c.get('caddy','_global_security_headers')=='global_middleware' && c.get('caddy','config','middleware')==null,'catalog and global list are native UCI');
assert(c.get('caddy','skip','use_global_middleware')=='0' && c.get('caddy','global','middleware')[1]=='first','site reference order and opt-out are native UCI');
let other=makeStore({root,confdir:root+'/config',savedir:root+'/other'});assert(other.read().config==null,'uncommitted middleware changes isolated');
let rev=saved.draft_revision;
for(let bad in [
 {...cfg,sites:[{...cfg.sites[0],middlewares:['global_only']}]},
 {...cfg,global_middlewares:[{id:'global_only',snippet:'header X-Global only'}],sites:[{...cfg.sites[0],middlewares:['global_only']}]},
 {...cfg,global_middlewares:[...cfg.global_middlewares,...cfg.global_middlewares]},
 {...cfg,middlewares:filter(cfg.middlewares,m=>m.id!='first')},
 {...cfg,middlewares:[...cfg.middlewares,{id:'first',snippet:'header X-Test test'}]},
 {...cfg,middlewares:[{id:'config',snippet:'header X-Test test'}]},
 {...cfg,sites:[{...cfg.sites[0],middlewares:['missing']}]}
])assert(!manager.draft_save({config:bad,expected_revision:rev}).ok,'reject dangling/duplicate/reserved references before storage');
assert(manager.apply({expected_revision:rev}).ok,'real Caddy accepts composed middleware routes');
assert(other.read().config.global_middlewares[0].id=='security_headers','committed middlewares visible across sessions');
store.write({config:store.read().config});assert(!store.hasChanges(),'catalog and ordered references save idempotently');
// Requests are asserted by the shell; leave the valid runtime active for those checks.
let before=readfile(root+'/active.json');let bad=json(sprintf('%J',cfg));bad.middlewares[0].snippet='not_a_directive invalid';saved=manager.draft_save({config:bad,expected_revision:rev});assert(saved.ok,'invalid syntax remains editable');assert(!manager.apply({expected_revision:saved.draft_revision}).ok && readfile(root+'/active.json')==before,'invalid middleware syntax retains active runtime');
let restored=manager.draft_save({config:cfg,expected_revision:saved.draft_revision});assert(restored.ok && manager.apply({expected_revision:restored.draft_revision}).ok,'valid source restored');
// Save/revert affects middleware definitions and references together.
let next=store.read().config;next.middlewares[0].snippet='header X-Changed changed';next.global_middlewares=[];store.write({config:next});assert(store.hasChanges(),'native middleware edits staged');c=cursor(root+'/config',root+'/session');c.load('caddy');assert(c.revert('caddy'),'native revert');assert(store.read().config.global_middlewares[0].id=='security_headers','revert restores global references');
let collision=store.read().config;push(collision.middlewares,{id:'global',snippet:'header X-Collision safe'});store.write({config:collision});c=cursor(root+'/config',root+'/session');assert(c.get('caddy','global')=='middleware' && c.get('caddy','global_2','domain')=='global.example.test','new middleware IDs cannot overwrite site sections');assert(c.revert('caddy'),'revert catalog/site ID collision');
let ordered=store.read().config;ordered.global_middlewares=[{id:'second',snippet:'header X-Second test'},...ordered.global_middlewares];store.write({config:ordered});assert(store.commit(),'add second global');ordered.global_middlewares=reverse(ordered.global_middlewares);store.write({config:ordered});assert(store.commit() && store.read().config.global_middlewares[0].id=='security_headers','global order persists');store.write({config:store.read().config});assert(!store.hasChanges(),'global order no-op');
store.write({config:cfg});assert(store.commit(),'restore global request fixture');
print('PASS middleware UCI catalog/order/inheritance, session/commit/revert, validation, redaction, real Caddy compile and failed-apply preservation\n');
