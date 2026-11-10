// Host validation at the public draft-save seam for proxy and Authelia backends.
let manager=loadfile(ARGV[0])()({root:ARGV[1],admin:'127.0.0.1:32019'});
let site={domain:'app.example.test',upstreams:['http://localhost:8080'],balance:'round_robin',path:'',strip:false,challenge:'http-01'};
let config={version:2,settings:{http_port:32080,https_port:32443,email:'',storage:ARGV[1]+'/data'},sites:[site]};
let revision=0;
for(let host in ['localhost','proxy.example.test','192.0.2.1','[::1]','[2001:db8::1]','[1:2:3:4:5:6:7:8]']) {
 let proxy={...config,sites:[{...site,upstreams:['http://'+host+':8080']}]};
 assert(manager.draft_save({config:proxy,expected_revision:revision++}).ok,'proxy accepts '+host);
 let auth={...config,auth:{authelia:{backend:'http://'+host+':9091',uri:'/api/authz/forward-auth',portal:'https://auth.example.test/'}},sites:[{...site,auth:{mode:'authelia',source:'global'}}]};
 assert(manager.draft_save({config:auth,expected_revision:revision++}).ok,'Authelia accepts '+host);
}
for(let entry in [
 ['[::::]','Invalid IPv6 backend host'],['[1:2:3]','Invalid IPv6 backend host'],['[1:2:3:4:5:6:7::8]','Invalid IPv6 backend host'],['[1:2:3:4:5:6:7:8:9]','Invalid IPv6 backend host'],
 ['a..b','Invalid backend host'],['a.-b','Invalid backend host'],[join('',map([1,2,3,4],()=> 'aaaaaaaaaaaaaaaa'))+'.test','Invalid backend host'],
 ['999.999.999.999','Invalid IPv4 backend host'],['01.2.3.4','Invalid IPv4 backend host'],['1.2.3','Invalid IPv4 backend host']
]) {
 let invalid={...config,sites:[{...site,upstreams:['http://'+entry[0]+':8080']}]};
 let rejected=manager.draft_save({config:invalid,expected_revision:revision});
 assert(!rejected.ok && rejected.error==entry[1],'proxy rejects '+entry[0]+' with existing entry diagnostic');
 let auth={...config,auth:{authelia:{backend:'http://'+entry[0]+':9091',uri:'/api/authz/forward-auth',portal:'https://auth.example.test/'}},sites:[{...site,auth:{mode:'authelia',source:'global'}}]};
 rejected=manager.draft_save({config:auth,expected_revision:revision});
 assert(!rejected.ok && rejected.error=='Authelia backend must be HTTP(S) host:port without credentials, path or query','Authelia rejects '+entry[0]+' with existing entry diagnostic');
}
assert(manager.draft_get().draft_revision==revision,'invalid host saves leave draft revision unchanged');
print('PASS proxy and Authelia IPv6/DNS/IPv4 host boundaries and entry diagnostics\n');
