let create=loadfile(ARGV[0])();
let manager=create({root:ARGV[1],admin:'127.0.0.1:28019',bind:'127.0.0.1',internal_tls:true,command:ARGV[2]});
let global={backend:'http://127.0.0.1:28082',uri:'/api/authz/forward-auth',portal:'https://auth.example.test:28443/'};
let site={domain:'app.example.test',upstreams:['http://127.0.0.1:28081'],balance:'round_robin',path:'/media/*',strip:true,challenge:'http-01',auth:{mode:'authelia',source:'global'}};
let independent={...site,domain:'independent.example.test',auth:{mode:'authelia',source:'independent',authelia:{...global,uri:'/independent'}}};
let portal={...site,domain:'auth.example.test',path:'',strip:false,upstreams:['http://127.0.0.1:28082'],auth:{mode:'none'}};
let config={version:2,settings:{http_port:28080,https_port:28443,email:'',storage:ARGV[1]+'/data'},auth:{authelia:global},sites:[site,independent,portal]};
assert(manager.draft_save({config,expected_revision:0}).ok,'global and independent Authelia configurations save through manager');
assert(manager.apply({expected_revision:1}).ok,'real Caddy validates and applies Authelia routes');
print('PASS global and independent Authelia save/apply\n');
for(let invalid in [
 {...global,backend:'http://a..b:9091'},
 {...global,backend:'http://user:password@localhost:9091'},
 {...global,uri:'/api/authz/forward-auth?x=1'},
 {...global,portal:'https://auth.example.test:99999/'},
 {...global,portal:'https://user:password@auth.example.test/'},
 {...global,portal:'javascript:alert(1)'}
]) assert(!manager.draft_save({config:{...config,auth:{authelia:invalid}},expected_revision:1}).ok,'unsafe Authelia endpoint rejected without draft mutation');
assert(!manager.draft_save({config:{...config,sites:[site,independent,{...portal,auth:{mode:'authelia',source:'global'}}]},expected_revision:1}).ok,'self-protected portal rejected with setup guidance');
assert(manager.draft_get().draft_revision==1,'rejected endpoints preserve saved draft');
assert(!manager.draft_save({config:{...config,mode:'manual',manual_caddyfile:'http://localhost { respond "ok" }',sites:[{...site,auth:{mode:'authelia',source:'global',token:'must-not-be-accepted'}}]},expected_revision:1}).ok,'manual source still rejects unknown auth metadata');
