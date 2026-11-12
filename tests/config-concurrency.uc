import {fixtureFactory} from './fixture-store.uc';
let create=fixtureFactory(ARGV[0]);
let manager=create({root:ARGV[1],admin:'127.0.0.1:22019',bind:'127.0.0.1',internal_tls:true,command:ARGV[2]});
let config={version:2,settings:{http_port:22080,https_port:22443,email:'',storage:ARGV[1]+'/data'},sites:[{domain:'proxy.example.test',upstreams:['http://127.0.0.1:22081'],balance:'round_robin',path:'',strip:false,challenge:'http-01'}]};
if (ARGV[3]=='prepare') assert(manager.draft_save({config,expected_revision:0}).ok,'concurrency draft saves');
if (ARGV[3]=='apply') assert(manager.apply({expected_revision:1}).ok,'first concurrent operation applies');
if (ARGV[3]=='compete') {
	let blocked=manager.draft_save({config,expected_revision:1});
	assert(!blocked.ok && index(blocked.error,'Another')==0,'competing save is rejected while apply owns transaction');
	print('PASS simultaneous operations cannot overwrite draft or active state\n');
}
