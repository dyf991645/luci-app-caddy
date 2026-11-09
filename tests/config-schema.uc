// Public save/read seam must never persist unknown fields into readable drafts.
let create=loadfile(ARGV[0])();
let manager=create({root:ARGV[1],admin:'127.0.0.1:22019'});
let config={version:1,settings:{http_port:22080,https_port:22443,email:'',storage:ARGV[1]+'/data'},sites:[{domain:'proxy.example.test',backend:'http://127.0.0.1:22081',challenge:'http-01'}]};
assert(manager.draft_save({config,expected_revision:0}).ok,'known public model saves');
for (let candidate in [
	{...config,secret_canary:'not-a-public-model-field'},
	{...config,settings:{...config.settings,secret_canary:'not-a-public-model-field'}},
	{...config,sites:[{...config.sites[0],secret_canary:'not-a-public-model-field'}]}
]) {
	let rejected=manager.draft_save({config:candidate,expected_revision:1});
	assert(!rejected.ok && rejected.error=='Unsupported configuration field','unknown public-model keys are rejected');
}
let state=manager.draft_get();
assert(state.draft_revision==1 && sprintf('%J',state.draft)==sprintf('%J',config),'rejected unknown fields never reach readable draft');
print('PASS unknown model keys cannot enter readable draft\n');
