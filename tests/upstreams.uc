import {writefile} from 'fs';
let create=loadfile(ARGV[0])();
let manager=create({root:ARGV[1],admin:'127.0.0.1:23019',bind:'127.0.0.1',internal_tls:true,command:ARGV[2]});
let config={version:2,settings:{http_port:23080,https_port:23443,email:'',storage:ARGV[1]+'/data'},sites:[
 {domain:'group.example.test',upstreams:['http://127.0.0.1:23081','http://127.0.0.1:23082'],balance:'round_robin',path:'/media/*',strip:true,challenge:'http-01'},
 {domain:'whole.example.test',upstreams:['http://127.0.0.1:23081'],balance:'random',path:'',strip:false,challenge:'tls-alpn-01'}
]};
assert(manager.draft_save({config,expected_revision:0}).ok,'multiple sites and a backend group save through public manager');
assert(manager.apply({expected_revision:1}).ok,'real Caddy validates and loads grouped path configuration');
print('PASS multiple sites, backend group, validated apply\n');
for (let changes in [
 {upstreams:[]}, {upstreams:['http://a..b:80']}, {upstreams:['http://[::::]:80']}, {upstreams:['http://999.999.999.999:80']}, {upstreams:['http://127.0.0.1:23081','https://127.0.0.1:23082']},
 {upstreams:['http://user:password@localhost:80']}, {upstreams:['http://localhost:0']},
 {upstreams:['https://localhost:443/path']}, {upstreams:['http://localhost']},
 {balance:'injected'}, {path:'/media*'}, {path:'/media/*/x'}, {path:'/a/../b'},
 {path:'/a?x'}, {path:'/a%2fb'}, {path:'/exact',strip:true}, {token:'secret'}
]) {
 let invalid={...config,sites:[{...config.sites[0],...changes}]};
 assert(!manager.draft_save({config:invalid,expected_revision:1}).ok,'invalid group/path rejected without changing draft');
}
assert(!manager.draft_save({config:{...config,sites:[config.sites[0],config.sites[0]]},expected_revision:1}).ok,'duplicate domains rejected');
assert(manager.draft_get().draft_revision==1,'invalid saves retain draft revision');
for (let policy in ['least_conn','random']) {
 let alternate={...config,sites:[{...config.sites[0],balance:policy}]};
 let preview=manager.preview({config:alternate});
 assert(preview.ok,'alternate strategy previews');
 writefile(ARGV[1]+'/policy.json',sprintf('%J',preview.config));
 assert(system([ARGV[2],'validate',ARGV[1]+'/policy.json','127.0.0.1:23019'],30000)==0,'real Caddy accepts alternate load balancing strategy');
}
// TLS transport is also validated by real Caddy; requests are tested separately.
let secure={...config,sites:[{...config.sites[0],upstreams:['https://127.0.0.1:23084']}]};
let preview=manager.preview({config:secure});
writefile(ARGV[1]+'/secure.json',sprintf('%J',preview.config));
assert(system([ARGV[2],'validate',ARGV[1]+'/secure.json','127.0.0.1:23019'],30000)==0,'real Caddy accepts verified HTTPS upstream transport');
print('PASS invalid group/path retention, duplicate domains, real least_conn/random/HTTPS validation\n');
if (ARGV[3] == 'extended') {
 let extended={...config,sites:[
  ...config.sites,
  {domain:'secure.example.test',upstreams:['https://127.0.0.1:23084'],balance:'round_robin',path:'',strip:false,challenge:'http-01'},
  {domain:'untrusted.example.test',upstreams:['https://localhost:23084'],balance:'round_robin',path:'',strip:false,challenge:'http-01'},
  {domain:'socket.example.test',upstreams:['http://127.0.0.1:23083'],balance:'round_robin',path:'/media/*',strip:true,challenge:'http-01'}
 ]};
 assert(manager.draft_save({config:extended,expected_revision:1}).ok,'HTTP/HTTPS/WebSocket fixture sites save');
 assert(manager.apply({expected_revision:2}).ok,'HTTP/HTTPS/WebSocket fixture sites activate');
}

let legacy=create({root:ARGV[1]+'/legacy',admin:'127.0.0.1:23019'});
let v1={version:1,settings:config.settings,sites:[{domain:'legacy.example.test',backend:'http://127.0.0.1:23081',challenge:'http-01'}]};
assert(legacy.draft_save({config:v1,expected_revision:0}).ok,'version1 model saves with migration');
let migrated=legacy.draft_get();
assert(migrated.draft.version==2 && migrated.draft.sites[0].upstreams[0]=='http://127.0.0.1:23081' && migrated.draft_revision==1 && migrated.active_revision==0,'migration preserves backend and draft/active revision semantics');
assert(legacy.preview({config:v1}).ok,'version1 preview migrates without applying');
print('PASS version1 backend migrates to version2 group without activation\n');
