let manager=loadfile(ARGV[0])()({root:ARGV[1],admin:'127.0.0.1:28019',bind:'127.0.0.1',internal_tls:true,command:ARGV[2]});
let current=manager.draft_edit(),config=current.draft;
if(ARGV[3]=='changed') config.auth.authelia.uri='/changed';
else config.auth.authelia.backend='http://127.0.0.1:28083';
let saved=manager.draft_save({config,expected_revision:current.draft_revision});
assert(saved.ok && length(saved.affected_domains)==1 && saved.affected_domains[0]=='app.example.test','global change lists only referencing domains before application');
assert(saved.draft.sites[1].auth.authelia.uri=='/independent','global updates preserve independent parameters');
assert(manager.apply({expected_revision:saved.draft_revision}).ok,'global update activates through normal transaction');
print('PASS dynamic global references and independent isolation\n');
