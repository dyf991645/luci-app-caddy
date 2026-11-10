let plugin=loadfile(ARGV[0])()['luci.caddy'];
let root=ARGV[1];
let config={version:2,settings:{http_port:27080,https_port:27443,email:'',storage:root+'/data'},sites:[{domain:'rpc.example.test',upstreams:['http://127.0.0.1:27081'],balance:'round_robin',path:'',strip:false,challenge:'http-01',auth:{mode:'basic',source:'global'}}]};
let saved=plugin.basic_profile_save.call({args:{scope:'global',config,users:[{username:'rpc-user',password:'basic-password-canary-RPC'}],expected_revision:0}});
assert(saved.ok && saved.draft_revision==1 && saved.active_revision==0,'write RPC stages server-hashed global profile without applying');
for(let method in ['draft_get','draft_edit']) {
 let result=plugin[method].call({args:{}}),text=sprintf('%J',result);
 assert(result.ok && index(text,'basic-password-canary-')<0 && index(text,'$2')<0,'neither read nor write editor RPC discloses password/hash');
}
let failed=plugin.basic_profile_save.call({args:{scope:'global',users:[{username:'bad:name',password:'private-invalid-user-canary'}],expected_revision:1}});
assert(!failed.ok && index(sprintf('%J',failed),'private-invalid-user-canary')<0,'invalid mutation has safe RPC response');
assert(!plugin.basic_profile_save.call({args:{scope:'global',users:[{username:'rpc-user',retain:true}],expected_revision:0}}).ok,'RPC rejects stale profile mutations');
print('PASS Basic Auth write RPC hash/save and readback privacy\n');
