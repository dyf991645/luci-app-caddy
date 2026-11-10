import {writefile,readfile,unlink} from 'fs';
let manager=loadfile(ARGV[0])()({root:ARGV[1],admin:'127.0.0.1:27019',bind:'127.0.0.1',internal_tls:true,command:ARGV[2]});
let config={version:2,settings:{http_port:27080,https_port:27443,email:'',storage:ARGV[1]+'/data'},sites:[
 {domain:'global.example.test',upstreams:['http://127.0.0.1:27081'],balance:'round_robin',path:'/private/*',strip:true,challenge:'http-01',auth:{mode:'basic',source:'global'}},
 {domain:'second.example.test',upstreams:['http://127.0.0.1:27081'],balance:'round_robin',path:'',strip:false,challenge:'http-01',auth:{mode:'basic',source:'global'}},
 {domain:'open.example.test',upstreams:['http://127.0.0.1:27081'],balance:'round_robin',path:'',strip:false,challenge:'http-01',auth:{mode:'none'}},
 {domain:'independent.example.test',upstreams:['http://127.0.0.1:27081'],balance:'round_robin',path:'',strip:false,challenge:'http-01',auth:{mode:'none'}}
]};
if(ARGV[3]=='red') {
 let result=manager.basic_profile_save({scope:'global',config,users:[{username:'alice',password:'basic-password-canary-ALICE'}],expected_revision:0});
 assert(result.ok,'server hashes password and saves private global profile through public manager');
 exit(0);
}
function response(domain,path,credentials,expected) {
 let code=system([ARGV[2],'request',ARGV[1]+'/body',domain,path,credentials || '',expected],30000);
 assert(code==0,'real HTTPS expected '+expected+' '+domain+path);
}
let saved=manager.basic_profile_save({scope:'global',config,users:[{username:'alice',password:'basic-password-canary-ALICE'},{username:'bob',password:'basic-password-canary-BOB'}],expected_revision:0});
assert(saved.ok,'two users server-hashed into global draft profile');
config=manager.draft_edit().draft;
saved=manager.basic_profile_save({scope:'independent.example.test',config,users:[{username:'solo',password:'basic-password-canary-SOLO'}],expected_revision:1});
assert(saved.ok,'independent profile saved');
assert(manager.apply({expected_revision:2}).ok,'real Caddy validates and applies Basic Auth');
response('global.example.test','/private/index.html',null,'401');
response('global.example.test','/private/index.html','alice:wrong','401');
response('global.example.test','/private/index.html','alice:basic-password-canary-ALICE','200');
response('global.example.test','/private/index.html','bob:basic-password-canary-BOB','200');
for(let path in ['/outside','/private','/privateX/index.html']) response('global.example.test',path,null,'404');
response('second.example.test','/index.html','bob:basic-password-canary-BOB','200');
response('independent.example.test','/index.html','solo:basic-password-canary-SOLO','200');
response('open.example.test','/index.html',null,'200');
let public=manager.draft_get(), editable=manager.draft_edit(), preview=manager.preview({config:editable.draft});
for(let output in [public,editable,preview]) {
 let text=sprintf('%J',output);
 assert(index(text,'basic-password-canary-')<0 && index(text,'$2a$')<0 && index(text,'$2b$')<0,'no password or hash in RPC readback or preview');
}
print('PASS two global accounts, independent credentials, scoped401/200/404, private readback\n');
// Advanced input is produced by the actual Caddy CLI, not a browser-derived hash.
assert(system([ARGV[2],'advanced-hash',ARGV[1]+'/advanced.hash'],30000)==0,'actual Caddy prepares advanced-input fixture');
let advanced=trim(readfile(ARGV[1]+'/advanced.hash'));
saved=manager.basic_profile_save({scope:'global',users:[{username:'alice',password:'basic-password-canary-UPDATED'},{username:'charlie',hash:advanced}],expected_revision:2});
assert(saved.ok,'global password update plus add/remove accounts saves');
assert(length(saved.affected_domains)==2 && index(saved.affected_domains,'global.example.test')>=0 && index(saved.affected_domains,'second.example.test')>=0 && index(saved.affected_domains,'independent.example.test')<0,'global apply impact identifies only referenced domains');
response('global.example.test','/private/index.html','alice:basic-password-canary-ALICE','200');
response('second.example.test','/index.html','bob:basic-password-canary-BOB','200');
writefile(ARGV[1]+'/reject-load','test failure');
assert(!manager.apply({expected_revision:3}).ok,'failed real candidate load preserves active credentials');
unlink(ARGV[1]+'/reject-load');
assert(manager.active_reload().ok,'restart/reload authority still uses last active auth');
response('second.example.test','/index.html','bob:basic-password-canary-BOB','200');
assert(manager.apply({expected_revision:3}).ok,'global update applies after controlled failure');
response('global.example.test','/private/index.html','alice:basic-password-canary-ALICE','401');
response('global.example.test','/private/index.html','alice:basic-password-canary-UPDATED','200');
response('second.example.test','/index.html','alice:basic-password-canary-UPDATED','200');
response('second.example.test','/index.html','bob:basic-password-canary-BOB','401');
response('second.example.test','/index.html','charlie:advanced-fixture-password','200');
response('independent.example.test','/index.html','solo:basic-password-canary-SOLO','200');
response('open.example.test','/index.html',null,'200');
let revision=manager.draft_get().draft_revision;
assert(!manager.basic_profile_save({scope:'global',users:[{username:'bad',hash:'bad-secret-canary'}],expected_revision:revision}).ok,'invalid hashes rejected');
assert(!manager.basic_profile_save({scope:'global',users:[{username:'alice',retain:true},{username:'alice',retain:true}],expected_revision:revision}).ok,'duplicate usernames rejected');
saved=manager.basic_profile_save({scope:'global',users:[{username:'alice',retain:true}],expected_revision:revision});
assert(saved.ok,'retained username keeps private password without reading it back');
assert(manager.apply({expected_revision:revision+1}).ok,'retained account applies');
response('second.example.test','/index.html','alice:basic-password-canary-UPDATED','200');
response('second.example.test','/index.html','charlie:advanced-fixture-password','401');
print('PASS global dynamic update, advanced input, deleted/retained accounts, failed-load recovery and independent stability\n');

config=manager.draft_edit().draft;config.sites[0].advanced_snippet='respond "authenticated snippet"';
revision=manager.draft_get().draft_revision;
assert(manager.draft_save({config,expected_revision:revision}).ok,'advanced snippet is retained in protected site');
assert(manager.apply({expected_revision:revision+1}).ok,'actual Caddy adapts snippet after authentication');
response('global.example.test','/private/index.html',null,'401');
response('global.example.test','/private/index.html','alice:basic-password-canary-UPDATED','200');
assert(readfile(ARGV[1]+'/body')=='authenticated snippet','authenticated snippet responds inside route');
response('global.example.test','/outside',null,'404');
assert(!manager.basic_profile_save({scope:'global',config:{...config,mode:'manual'},users:[{username:'alice',retain:true}],expected_revision:revision+1}).ok,'manual source refuses account form mutations');
print('PASS public site unauthenticated, snippet cannot bypass authentication, manual account forms read-only\n');
