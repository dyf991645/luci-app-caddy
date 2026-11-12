import {fixtureFactory} from './fixture-store.uc';
import {writefile,readfile} from 'fs';
let create=fixtureFactory(ARGV[0]);
let root=ARGV[1];
let manager=create({root,admin:'127.0.0.1:24019',bind:'127.0.0.1',internal_tls:true,command:ARGV[2]});
let form={version:1,mode:'manual',manual_caddyfile:'http://127.0.0.1:24080 {\n bind 127.0.0.1\n respond "manual private sentinel"\n}\n',settings:{http_port:24080,https_port:24443,email:'',storage:root+'/data'},sites:[{domain:'form.example.test',backend:'http://127.0.0.1:24081',challenge:'http-01'}]};
let saved=manager.draft_save({config:form,expected_revision:0});
assert(saved.ok,'manual source saves independently of form content');
assert(manager.draft_edit().draft.manual_caddyfile==form.manual_caddyfile,'authorized editor retrieves preserved source');
assert(index(sprintf('%J',manager.draft_get()),'private sentinel')<0,'read-only draft never reveals manual secrets');
let applied=manager.apply({expected_revision:1});
assert(applied.ok,'real Caddy adapts validates and loads manual source');
assert(manager.draft_get().active_revision==1 && manager.draft_get().active_source=='manual','manual load promotes active revision and source');
let preview=manager.preview({config:form});
assert(preview.ok && index(sprintf('%J',preview),'private sentinel')<0,'preview never returns private adapted JSON');
assert(system(['/usr/bin/curl','-fsS','--noproxy','*','-o',root+'/response','http://127.0.0.1:24080/'],10000)==0 && readfile(root+'/response')=='manual private sentinel','actual manual HTTP response');
print('PASS manual source save/edit redaction and real apply\n');
let source=manager.draft_edit().draft;
for (let unsafe in [
 '{\n admin 0.0.0.0:24019\n}\nhttp://127.0.0.1:24080 { respond unsafe }',
 '{\n admin off\n}\nhttp://127.0.0.1:24080 { respond unsafe }',
 '{\n persist_config\n}\nhttp://127.0.0.1:24080 { respond unsafe }',
 '{\n storage file_system { root /tmp/unmanaged }\n}\nhttp://127.0.0.1:24080 { respond unsafe }',
 'http://127.0.0.1:24080 { not_a_directive unsafe }'
]) {
 let config={...source,manual_caddyfile:unsafe};
 let before=manager.draft_get();
 assert(manager.draft_save({config,expected_revision:before.draft_revision}).ok,'invalid runtime content remains editable saved draft');
 assert(!manager.apply({expected_revision:before.draft_revision+1}).ok,'unsafe or invalid real Caddy source rejected');
 assert(manager.draft_get().active_revision==1,'rejected source leaves last active revision');
 assert(system(['/usr/bin/curl','-fsS','--noproxy','*','-o',root+'/response','http://127.0.0.1:24080/'],10000)==0 && readfile(root+'/response')=='manual private sentinel','previous active HTTP response remains available after rejection');
}
for (let forbidden in ['import /etc/shadow','"import" /etc/shadow','respond {$SECRET}','respond {env.SECRET}','im\\port /etc/shadow']) {
 let before=manager.draft_get();
 assert(!manager.draft_save({config:{...source,manual_caddyfile:forbidden},expected_revision:before.draft_revision}).ok,'imports and environment access rejected before adaptation');
}
for (let candidate in [{...source,private_token:'never public'}, {...source,settings:{...source.settings,private_token:'never public'}}, {...source,sites:[{...source.sites[0],private_token:'never public'}]}]) {
 assert(!manager.draft_save({config:candidate,expected_revision:manager.draft_get().draft_revision}).ok,'manual source still rejects unknown private fields');
}
let before=manager.draft_get();
let formMode={...source,mode:'form',sites:[{...source.sites[0],path:'/protected/*',strip:true,advanced_snippet:'header X-Managed-Snippet "snippet private sentinel"'}]};
assert(manager.draft_save({config:formMode,expected_revision:before.draft_revision}).ok,'switch source without overwriting manual content');
assert(manager.draft_edit().draft.manual_caddyfile==source.manual_caddyfile,'manual content survives switch to form');
let applyForm=manager.apply({expected_revision:before.draft_revision+1});

assert(applyForm.ok && applyForm.active_source=='form','advanced route snippet real Caddy validation and form application');
assert(index(sprintf('%J',manager.draft_get()),'private sentinel')<0,'read-only state hides inactive manual and active snippets');
assert(manager.preview({config:formMode}).config.redacted,'advanced snippet preview is redacted');
print('PASS unsafe overrides and external source access rejected; modes preserve independent content; route snippet applies\n');
