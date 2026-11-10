// Public manager seam; command fixture validates only and never loads Caddy.
import { readfile } from 'fs';
let manager=loadfile(ARGV[0])()({root:ARGV[1],admin:'127.0.0.1:25019',command:ARGV[2],disable_certificates:true});
let config={version:2,mode:'form',settings:{http_port:25080,https_port:25443,email:'',storage:ARGV[1]+'/data'},sites:[{domain:'global.example.test',upstreams:['http://127.0.0.1:25081'],balance:'round_robin',path:'',strip:false,challenge:'global'}]};
let saved=manager.draft_save({config,expected_revision:0});
assert(saved.ok && saved.draft.sites[0].challenge=='global','global reference saves without materializing fallback');
let preview=manager.preview({});
assert(preview.ok,'global reference previews');
let issuer=preview.config.apps.tls.automation.policies[0].issuers[0];
assert(!issuer.challenges.http.disabled && issuer.challenges['tls-alpn'].disabled && !issuer.challenges.dns,'missing global default resolves to HTTP-01');
config.settings.default_challenge='dns-01';
config.sites[0].domain='*.global.example.test';
assert(manager.draft_save({config,expected_revision:1}).ok,'inherited DNS allows wildcard');
let before=manager.draft_edit();
let rejected=manager.tls_save({default_challenge:'http-01',expected_revision:2});
assert(!rejected.ok && rejected.error=='Wildcard domains require DNS-01','incompatible global default edit is rejected');
assert(sprintf('%J',before)==sprintf('%J',manager.draft_edit()),'rejected global default edit leaves private draft and revision unchanged');
assert(!manager.apply({expected_revision:2}).ok && manager.draft_get().active_revision==0,'inherited DNS requires a private credential before apply');
assert(readfile(ARGV[1]+'/candidate.json')==null && readfile(ARGV[1]+'/active.json')==null && sprintf('%J',before)==sprintf('%J',manager.draft_edit()),'missing credential leaves candidate, active state and saved draft untouched');
let token='globalPrivateTokenCanary0123456789ABCDEFGH';
let credential=manager.credential_save({token,expected_revision:2});
assert(credential.ok && credential.draft_revision==3,'inherited DNS uses staged credential');
preview=manager.preview({});
issuer=preview.config.apps.tls.automation.policies[0].issuers[0];
assert(issuer.challenges.http.disabled && issuer.challenges['tls-alpn'].disabled && issuer.challenges.dns.provider.api_token=='[REDACTED: Cloudflare credential]','inherited DNS disables HTTP and ALPN and redacts provider credential');
assert(index(sprintf('%J',[credential,manager.draft_get(),preview]),token)<0,'private token stays out of public responses');
assert(manager.apply({expected_revision:3}).ok,'inherited DNS applies using real Caddy validation without certificate issuance');
let active=json(readfile(ARGV[1]+'/active.json'));
assert(active.apps.tls.automation.policies[0].issuers[0].challenges.dns.provider.api_token==token,'private candidate receives inherited DNS credential');
let explicitWildcard={...config,settings:{...config.settings,default_challenge:'http-01'},sites:[{...config.sites[0],challenge:'dns-01'}]};
assert(manager.preview({config:explicitWildcard}).ok,'explicit wildcard DNS remains valid under global HTTP');
config=manager.draft_edit().draft;
config.sites[0].domain='global.example.test';
for (let method in ['http-01','dns-01','tls-alpn-01'])
	push(config.sites,{...config.sites[0],domain:method+'.example.test',challenge:method});
assert(manager.draft_save({config,expected_revision:3}).ok,'mixed inherited and explicit sites save');
for (let method in ['http-01','tls-alpn-01','dns-01']) {
	let previous=manager.draft_get();
	assert(!manager.tls_save({default_challenge:method,expected_revision:previous.draft_revision-1}).ok,'scoped default save honors revision lock');
	let changed=manager.tls_save({default_challenge:method,expected_revision:previous.draft_revision});
	assert(changed.ok && changed.pending && changed.active_revision==3 && changed.draft.sites[0].challenge=='global','default edit stages reference without touching active revision');
	preview=manager.preview({});
	let policies=preview.config.apps.tls.automation.policies;
	for (let i=0;i<4;i++) {
		let wanted=i==0 ? method : ['http-01','dns-01','tls-alpn-01'][i-1];
		issuer=policies[i].issuers[0];
		assert(issuer.challenges.http.disabled==(wanted!='http-01') && issuer.challenges['tls-alpn'].disabled==(wanted!='tls-alpn-01') && !!issuer.challenges.dns==(wanted=='dns-01'),'global changes inherited selector while explicit selectors stay fixed');
	}
	active=json(readfile(ARGV[1]+'/active.json'));
	assert(active.apps.tls.automation.policies[0].subjects[0]=='*.global.example.test','staging a global change preserves active generated configuration');
}
let current=manager.draft_edit();
for (let invalid in ['global','unsupported','',false]) {
	assert(!manager.tls_save({default_challenge:invalid,expected_revision:current.draft_revision}).ok,'invalid global default rejected by scoped save');
	let candidate={...current.draft,settings:{...current.draft.settings,default_challenge:invalid}};
	assert(!manager.draft_save({config:candidate,expected_revision:current.draft_revision}).ok && !manager.preview({config:candidate}).ok,'invalid global default rejected by save and preview');
}
assert(sprintf('%J',current)==sprintf('%J',manager.draft_edit()),'invalid and stale saves preserve draft revision and content');
assert(!manager.apply({expected_revision:current.draft_revision-1}).ok,'apply honors revision lock');
assert(manager.apply({expected_revision:current.draft_revision}).ok,'latest global default applies');
active=json(readfile(ARGV[1]+'/active.json'));
assert(active.apps.tls.automation.policies[0].subjects[0]=='global.example.test' && active.apps.tls.automation.policies[0].issuers[0].challenges.dns.provider.api_token==token,'successful apply promotes latest resolved global policy');
let legacy={version:1,settings:{http_port:25080,https_port:25443,email:'',storage:ARGV[1]+'/data',default_challenge:'dns-01'},sites:[{domain:'legacy.example.test',backend:'http://127.0.0.1:25081',challenge:'tls-alpn-01'}]};
let migrated=manager.draft_save({config:legacy,expected_revision:current.draft_revision});
assert(migrated.ok && migrated.draft.version==2 && migrated.draft.sites[0].challenge=='tls-alpn-01','legacy explicit method survives migration');
config=migrated.draft;
config.mode='manual';
config.manual_caddyfile='http://127.0.0.1:25999 {\n respond "manual-source"\n}';
config.sites[0].challenge='global';
let manual=manager.draft_save({config,expected_revision:migrated.draft_revision});
assert(manual.ok && !manager.tls_save({default_challenge:'http-01',expected_revision:manual.draft_revision}).ok,'complete Caddyfile keeps TLS forms read-only');
assert(manager.draft_edit().draft.manual_caddyfile==config.manual_caddyfile,'manual source preserved');
print('PASS inherited selectors, explicit overrides, fallback, wildcard atomic rejection, private credential, staged/apply revisions, legacy migration and manual source\n');
