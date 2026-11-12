import {fixtureFactory} from './fixture-store.uc';
// Real Caddy validate + /load; certificate automation disabled at the local seam.
// No ACME account, DNS record or Cloudflare API request is made.
let manager=fixtureFactory(ARGV[0])({root:ARGV[1],admin:'127.0.0.1:25019',bind:'127.0.0.1',disable_certificates:true,command:ARGV[2]});
let config={version:2,settings:{http_port:25080,https_port:25443,email:'',storage:ARGV[1]+'/data'},sites:[{domain:'*.example.test',upstreams:['http://127.0.0.1:25081'],balance:'round_robin',path:'',strip:false,challenge:'dns-01'}]};
assert(manager.draft_save({config,expected_revision:0}).ok,'DNS draft saves');
assert(manager.credential_save({token:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',expected_revision:1}).ok,'first credential stages');
assert(manager.apply({expected_revision:2}).ok,'real Caddy provisions DNS provider and hot loads first credential');
assert(manager.credential_status().active_revision==1,'first credential becomes active only after load');
assert(manager.credential_save({token:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',expected_revision:2}).ok,'replacement credential stages');
assert(manager.credential_status().active_revision==1,'staging replacement preserves old active credential');
assert(manager.apply({expected_revision:3}).ok,'real Caddy validates and hot loads replacement credential');
assert(manager.credential_status().active_revision==2,'successful hot load promotes replacement revision');
assert(manager.credential_save({token:'ticket05!invalid-replacement-canary',expected_revision:3}).ok,'invalid replacement stages');
let failed=manager.apply({expected_revision:4});
assert(!failed.ok && index(sprintf('%J',failed),'ticket05!invalid-replacement-canary')<0,'provider rejection never exposes raw token');
assert(manager.credential_status().active_revision==2 && manager.draft_get().active_revision==3,'failed replacement preserves previous active version');
assert(manager.active_reload().ok,'reload still uses last successful credential');
print('PASS real DNS provider validation/hotload/rotation/failure rollback; public issuance remains pending\n');
