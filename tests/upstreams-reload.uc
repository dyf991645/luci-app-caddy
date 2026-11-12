import {fixtureFactory} from './fixture-store.uc';
let create=fixtureFactory(ARGV[0]);
let manager=create({root:ARGV[1],admin:'127.0.0.1:23019',bind:'127.0.0.1',internal_tls:true,command:ARGV[2]});
let state=manager.draft_get();
let config={...state.draft,sites:map(state.draft.sites,function(site) {return {...site,balance:'least_conn'};})};
assert(manager.draft_save({config,expected_revision:state.draft_revision}).ok,'changed strategy saves');
assert(manager.apply({expected_revision:state.draft_revision+1}).ok,'changed config actually loads');
print('PASS changed-config reload while WebSocket open\n');
