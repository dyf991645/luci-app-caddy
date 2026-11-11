import {readfile,mkdir,writefile} from 'fs';
let root=ARGV[0],modules=ARGV[1];mkdir(root,0700);mkdir(root+'/config',0700);
writefile(root+'/config/caddy',"config manager 'config'\n option schema 'legacy'\n");
let store=loadfile(modules+'/uci-store.uc')()({root,confdir:root+'/config',savedir:root+'/session'});
let manager=loadfile(modules+'/config.uc')()({root,store,offline:true,internal_tls:true,command:'/usr/share/caddy-manager/caddy-command'});
let config={version:2,settings:{http_port:28080,https_port:28443,email:'',storage:root+'/data',default_challenge:'dns-01'},sites:[{domain:'*.example.test',upstreams:['http://127.0.0.1:28081'],balance:'round_robin',path:'',strip:false,challenge:'global',advanced_snippet:'header X-Test retained'}]};
let before=manager.draft_save({config,expected_revision:0});assert(before.ok,'save initial wildcard');
let result=manager.tls_save({default_challenge:'http-01',site_challenges:{'*.example.test':'dns-01'},expected_revision:before.draft_revision});
assert(result.ok && result.draft.settings.default_challenge=='http-01' && result.draft.sites[0].challenge=='dns-01','site override and default update atomically');
assert(manager.draft_edit().draft.sites[0].advanced_snippet=='header X-Test retained','scoped TLS save retains private source');
let unchanged=manager.draft_edit();
for(let selected in [{'unknown.example.test':'dns-01'},{'*.example.test':'unsupported'},{'*.example.test':'http-01'},['dns-01']]) {
 let invalid=manager.tls_save({default_challenge:'http-01',site_challenges:selected,expected_revision:unchanged.draft_revision});assert(!invalid.ok,'reject invalid site selector or wildcard challenge');
 assert(sprintf('%J',unchanged)==sprintf('%J',manager.draft_edit()),'invalid edit leaves fields/private source unchanged');
}
assert(!manager.tls_save({default_challenge:'dns-01',site_challenges:{},expected_revision:before.draft_revision}).ok,'scoped save rejects stale revision');
assert(manager.tls_save({default_challenge:'dns-01',expected_revision:unchanged.draft_revision}).ok,'existing scoped API without site choices remains compatible');
let beforeEmail=manager.draft_get();
let withEmail=manager.tls_save({default_challenge:'dns-01',email:'owner@example.test',expected_revision:beforeEmail.draft_revision});
assert(withEmail.ok && withEmail.draft.settings.email=='owner@example.test','TLS email saved');
let retained=manager.tls_save({default_challenge:'dns-01',expected_revision:withEmail.draft_revision});assert(retained.ok && retained.draft.settings.email=='owner@example.test','older scoped clients retain email');
assert(!manager.tls_save({default_challenge:'dns-01',email:'invalid',expected_revision:retained.draft_revision}).ok,'invalid email rejected');
let cleared=manager.tls_save({default_challenge:'dns-01',email:'',expected_revision:retained.draft_revision});assert(cleared.ok && cleared.draft.settings.email=='','TLS email cleared explicitly');
assert(manager.credential_save({token:'tlsInlineTestToken',expected_revision:manager.draft_get().draft_revision}).ok,'synthetic DNS credential stays private');
assert(manager.apply({expected_revision:manager.draft_get().draft_revision}).ok,'real Caddy validates final scoped choices and retained snippet offline');
print('PASS atomic default/site TLS settings, wildcard rejection, retained private snippet and stale revision handling\n');
