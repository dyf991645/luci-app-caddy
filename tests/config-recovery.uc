import {fixtureFactory} from './fixture-store.uc';
// Tests cross-process interruption at the real Caddy command boundary.
let create = fixtureFactory(ARGV[0]);
let manager = create({root:ARGV[1],admin:'127.0.0.1:22019',bind:'127.0.0.1',internal_tls:true,command:ARGV[2]});
if (ARGV[3] == 'interrupt') {
	let state = manager.draft_get();
	let next = {...state.draft,mode:'manual',manual_caddyfile:'http://127.0.0.1:22080 {\n bind 127.0.0.1\n respond "interrupted manual source"\n}\n',settings:{...state.draft.settings,storage:ARGV[1]+'/data'}};
	let saved = manager.draft_save({config:next,expected_revision:state.draft_revision});
	assert(saved.ok,'recovery fixture saves independent manual source');
	manager.apply({expected_revision:saved.draft_revision});
	die('fixture must interrupt the manager before disk promotion');
}
if (ARGV[3] == 'recover') {
	let state = manager.draft_get();
	assert(state.recovery_required && state.active_revision == 1,'crashed apply exposes pending recovery without promoting active');
	assert(manager.recover({load:false}).ok,'boot recovery reconciles disk without a running admin');
	assert(manager.active_reload().ok,'running admin can return to boot-authoritative active');
	state = manager.draft_get();
	assert(!state.recovery_required && state.active_revision == 1 && state.pending,'recovery retains last active and unapplied draft');
	print('PASS interrupted manual apply and boot recovery contract\n');
}
