import {test, expect} from 'bun:test';
import {readFileSync, existsSync} from 'node:fs';
const resources=new URL('../packages/luci-app-caddy/htdocs/luci-static/resources/',import.meta.url);
// Executes the shipped LuCI views. DOM, JSONMap and RPC are host adapters only;
// clicks, asynchronous save responses and the confirmation gate are real view code.
function harness(page, affected=['basic.example.test','authelia.example.test'], fixture={}) {
 const nodes=[]; let modal=null,pageRoot=null,changeRefreshes=0; const calls=[],notifications=[],clipboard=[],downloads=[];
 function E(tag,attrs={},children=[]) {
  const node={tag,attrs,children:[],value:attrs.value || (tag==='textarea'&&typeof children==='string'?children:''),disabled:attrs.disabled!=null,textContent:typeof children==='string'?children:'',events:{},
   addEventListener(name,fn){this.events[name]=fn;},appendChild(n){this.children.push(n);Object.defineProperty(n,'parentNode',{value:this,writable:true,configurable:true});},replaceChildren(...n){this.children=n;},
   querySelectorAll(selector){return all(this).filter(n=>selector.split(',').includes(n.tag));},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);},classList:{add(){}},click(){return this.attrs.click?.();}};
  node.children=Array.isArray(children)?children:[children];node.children.forEach(n=>{if(n&&typeof n==='object')Object.defineProperty(n,'parentNode',{value:node,writable:true,configurable:true});}); nodes.push(node);return node;
 }
 function all(n){return typeof n==='object' && n ? [n,...(n.children || []).flatMap(all)]:[];}
 const config={version:2,settings:{http_port:10080,https_port:10443,email:'',storage:'/etc/caddy/data'},sites:[{domain:'app.example.test',upstreams:['http://localhost:8080'],balance:'round_robin',path:'',strip:false,challenge:'http-01'}]};
 Object.assign(config,fixture.config || {});
 let state={ok:true,basic_profiles:fixture.basic_profiles || {},draft:config,draft_revision:4,active_revision:3,pending:true,affected_domains:affected};
 const ui={changes:{init(){changeRefreshes++;return Promise.resolve();}},showModal(title,body){modal=E('modal',{title},body);},hideModal(){modal=null;},addNotification(...args){notifications.push(args);}};
 const rpc={declare({method}){return async (...args)=>{calls.push({method,args});if(fixture.wait?.method===method)await fixture.wait.promise;if(fixture.fail===method)return {ok:false,error:'Revision conflict'};if(method==='status')return {installed:true,running:false,enabled:false};if(method==='credential_status')return {ok:true,configured:!!fixture.credential};if(method==='certificates')return fixture.certificates||{ok:true,complete:true,certificates:[]};if(method==='notification_status')return fixture.notification||{ok:true,webhook:{enabled:false,configured:false},alerts:[],deliveries:[]};if(method==='notification_save')return {ok:true,webhook:{enabled:args[0],configured:!!args[1]},alerts:[],deliveries:[]};if(method==='config_preview')return {ok:true,config:fixture.preview || {}};if(method==='config_apply'){state={...state,active_revision:state.draft_revision,pending:false,affected_domains:[]};return state;}if(method==='basic_profile_save'||method==='draft_save')state={...state,draft:args[method==='basic_profile_save'?1:0]};if(['tls_save','credential_save','draft_save','basic_profile_save'].includes(method))state={...state,draft_revision:state.draft_revision+1,affected_domains:['latest.example.test']};return state;};}};
 let rootMap,activeMap;
 const form={JSONMap:class {
  constructor(data){this.buffer=data;this.children=[];rootMap=this;this.data={get:(_,sid,key)=>key==null?this.buffer[sid]:this.buffer[sid]?.[key],set:(_,sid,key,v)=>{this.buffer[sid][key]=v;},sections:()=>this.buffer.sites.map((s,i)=>({...s,'.name':String(i)}))};this.buffer.sites.forEach((s,i)=>this.buffer[String(i)]=s);}
  section(type,name,sectionType,title){const m=this;const s={map:m,title,children:[],tabs:[],render(){return Promise.resolve(E('div',{},[this.title?E('h3',{},this.title):'',...this.children.map(o=>E('label',{},o.title))]));},option(type,option,title){const o={map:this.map,section:this,option,title,choices:[],dependencies:[],cbid(sid){return sid+'.'+this.option;},getValidator(sid){return this.validate.bind(this,sid);},value(v){this.choices.push(v);},depends(key,value){this.dependencies.push(typeof key==='object'?key:{[key]:value});}};this.children.push(o);return o;},tab(name){this.tabs[name]={children:[]};},taboption(tab,...args){const o=this.option(...args);this.tabs[tab].children.push(o);return o;},getActiveModalMap(){return {instance:activeMap,parentNode:modal};},handleModalCancel(){modal=null;},handleAdd(){},handleRemove(){}};this.children.push(s);return s;}
  parse(){return Promise.resolve();} render(){return fixture.route==='settings'?Promise.all(this.children.map(s=>s.render())).then(nodes=>E('form',{},nodes)):Promise.resolve(E('form'));} load(){return Promise.resolve();}reset(){return Promise.resolve();}
 }};

 const values={URL:class extends URL {static createObjectURL(){return 'blob:fixture';}static revokeObjectURL(){}},backendList:{create(value){return {render(){return E('input',{value});}};}},navigator:{clipboard:{writeText:async text=>{clipboard.push(text);}}},dom:{findClassInstance:node=>node.instance},poll:{add(){}},E,_:s=>s,ui,rpc,view:{extend:x=>x},form,L:{hasViewPermission:()=>!fixture.readonly,url:x=>x,resource:x=>x,env:{dispatchpath:['admin','services','caddy',fixture.route || 'configuration']}},window:{addEventListener(){}},document:{createTextNode:s=>({textContent:s}),addEventListener(){},querySelector(){return null;},body:{appendChild(node){downloads.push(node);}},head:{appendChild(){}}},location:{href:''},baseclass:{extend:x=>x}};
 const helper=new URL('caddy/apply.js',resources);
 if(existsSync(helper))values.caddyApply=evaluate(helper);values.applyFlow=values.caddyApply;
 values.layout=evaluate(new URL('caddy/layout.js',resources));
 values.service=evaluate(new URL('caddy/service.js',resources));
 function evaluate(file){return new Function(...Object.keys(values),readFileSync(file,'utf8'))(...Object.values(values));}
 const view=evaluate(new URL(`view/caddy/${page}.js`,resources));
 return {editGlobal(section,key,value){rootMap.data.set('json',section,key,value);all(pageRoot).find(n=>n.tag==='form').events.input();},async openSite(){
   const grid=rootMap.children[0];
   activeMap={section:'0',data:rootMap.data,parent:rootMap,readonly:false,checkDepends(){},render:()=>Promise.resolve(E('form')),parse:async()=>{for(const o of section.children){if(o.input&&o.active()){const previous=o.cfgvalue?o.cfgvalue('0'):rootMap.data.get('json','0',o.option);if(o.forcewrite||JSON.stringify(previous)!==JSON.stringify(o.input.value)){if(o.write)o.write('0',o.input.value);else rootMap.data.set('json','0',o.option,o.input.value);}}}}};
   const section={...grid,map:activeMap,children:[],tabs:[]};
   section.children=grid.children.map(o=>({...o,map:activeMap,section}));
   grid.addModalOptions(section,'0');
   const body=[];
   for(const o of section.children){
    o.active=()=>!o.dependencies.length||o.dependencies.some(dep=>Object.entries(dep).every(([key,val])=>section.children.find(other=>other.option===key)?.input?.value===val));
    if(o.option==='upstreams'){o.input=o.renderWidget('0',0,rootMap.data.get('json','0',o.option));body.push(o.input);}else if(o.renderWidget)body.push(o.renderWidget());else {o.input=E('input',{'aria-label':o.title,value:o.cfgvalue?o.cfgvalue('0'):rootMap.data.get('json','0',o.option)??o.default??''});body.push(o.input);}
   }
   ui.showModal('Edit site',body);
   return {validate(name,value){return section.children.find(o=>o.option===name).validate('0',value);},field(name){return section.children.find(o=>o.option===name).input;},visible(name){return section.children.find(o=>o.option===name).active();},button(label){return all(modal).find(n=>n.tag==='button'&&n.textContent===label);},inputs(){return all(modal).filter(n=>n.tag==='input');},save(){return grid.handleModalSave(activeMap);},cancel(){grid.handleModalCancel(activeMap);}};
  },async render(){pageRoot=await view.render(page==='tls'?[state,{ok:true,configured:!!fixture.credential},fixture.certificates||{ok:true,complete:true,certificates:[]},fixture.notification||{ok:true,webhook:{enabled:false,configured:false},alerts:[],deliveries:[]}]:page==='overview'?[{installed:true,running:false,enabled:false},state]:state);},button(label){return nodes.find(n=>n.tag==='button'&&n.textContent===label);},get modal(){return modal;},modalButton(label){return all(modal).find(n=>n.tag==='button'&&n.textContent===label);},nodes,calls,notifications,clipboard,downloads,pageNodes:()=>all(pageRoot),modalField:id=>all(modal).find(n=>n.attrs?.id===id),get changeRefreshes(){return changeRefreshes;}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('TLS pending Apply lists shared authentication impact and cancellation sends no apply',async()=>{
 const h=harness('tls');await h.render();const operation=h.button('Save & Apply').click();await tick();
 expect(h.modal?.attrs.title).toBe('Apply global authentication change');
 expect(JSON.stringify(h.modal)).toContain('basic.example.test');expect(JSON.stringify(h.modal)).toContain('authelia.example.test');
 expect(h.calls.filter(c=>c.method==='config_apply')).toHaveLength(0);
 h.modalButton('Cancel').click();await operation;
 expect(h.calls.filter(c=>c.method==='config_apply')).toHaveLength(0);
 expect(h.button('Save & Apply').disabled).toBe(false);
});
for(const page of ['configuration','tls']) {
 test(`${page} pending Apply waits for confirmation then applies the displayed revision`,async()=>{
  const h=harness(page);await h.render();const operation=h.button('Save & Apply').click();await tick();
  expect(h.modal?.attrs.title).toBe('Apply global authentication change');
  expect(h.calls.filter(c=>c.method==='config_apply')).toHaveLength(0);
  h.modalButton('Apply').click();await operation;
  expect(h.calls.filter(c=>c.method==='config_apply')).toEqual([{method:'config_apply',args:[4]}]);
  expect(h.button('Save & Apply').disabled).toBe(true);
 });
 test(`${page} pending Apply with no global authentication impact needs no modal`,async()=>{
  const h=harness(page,[]);await h.render();await h.button('Save & Apply').click();
  expect(h.modal).toBeNull();expect(h.calls.filter(c=>c.method==='config_apply')).toHaveLength(1);
 });
 test(`${page} Save & Apply confirms the latest save response rather than loaded impact`,async()=>{
  const h=harness(page,['outdated.example.test']);await h.render();
  const field=h.nodes.find(n=>page==='tls' ? n.tag==='input' && n.attrs.type==='radio' : n.tag==='form');
  field.events.change();const operation=h.button('Save & Apply').click();await tick();
  expect(JSON.stringify(h.modal)).toContain('latest.example.test');
  expect(JSON.stringify(h.modal)).not.toContain('outdated.example.test');
  expect(h.calls.filter(c=>c.method==='config_apply')).toHaveLength(0);
  h.modalButton('Apply').click();await operation;
  expect(h.calls.filter(c=>c.method==='config_apply')).toEqual([{method:'config_apply',args:[5]}]);
 });
 test(`${page} cancelling a newly saved authentication change retains its pending draft`,async()=>{
  const h=harness(page);await h.render();
  h.nodes.find(n=>page==='tls' ? n.tag==='input' && n.attrs.type==='radio' : n.tag==='form').events.change();
  const operation=h.button('Save & Apply').click();await tick();h.modalButton('Cancel').click();await operation;
  expect(h.calls.filter(c=>c.method==='config_apply')).toHaveLength(0);
  expect(h.button('Save & Apply').disabled).toBe(false);
  const retry=h.button('Save & Apply').click();await tick();
  expect(JSON.stringify(h.modal)).toContain('latest.example.test');
  h.modalButton('Apply').click();await retry;
  expect(h.calls.filter(c=>c.method==='config_apply')).toEqual([{method:'config_apply',args:[5]}]);
 });
}
test('TLS credential save confirms the newest credential response revision and impact',async()=>{
 const h=harness('tls');await h.render();
 const token=h.nodes.find(n=>n.attrs.type==='password');token.value='fixture-only';token.events.input();
 const operation=h.button('Save & Apply').click();await tick();
 expect(h.calls.filter(c=>c.method==='credential_save')).toEqual([{method:'credential_save',args:['fixture-only',5]}]);
 expect(JSON.stringify(h.modal)).toContain('latest.example.test');
 h.modalButton('Apply').click();await operation;
 expect(h.calls.filter(c=>c.method==='config_apply')).toEqual([{method:'config_apply',args:[6]}]);
});

test('reverse proxy status strip reflects the revision applied without refreshing the page',async()=>{
 const h=harness('configuration',[]);await h.render();
 const metric=h.nodes.find(n=>n.attrs['aria-label']==='Active revision');
 expect(metric.textContent).toBe('3');
 expect(h.button('Restart')).toBeUndefined();expect(h.button('Reload')).toBeDefined();expect(h.nodes.some(n=>n.tag==='a'&&n.textContent==='Configuration preview')).toBe(false);
 await h.button('Save & Apply').click();
 expect(metric.textContent).toBe('4');
});


test('site modal offers independent Basic accounts and saves passwords under its domain at the current revision',async()=>{
 const h=harness('configuration',[]);await h.render();const editor=await h.openSite();
 editor.field('authMode').value='basic';editor.field('authSource').value='independent';
 expect(editor.visible('basic_accounts')).toBe(true);
 const inputs=editor.inputs().filter(n=>n.attrs['aria-label']==='Username'||n.attrs['aria-label']==='New password');inputs[0].value='alice';inputs[1].value='secret fixture';
 editor.button('Add account').click();const all=editor.inputs().filter(n=>n.attrs['aria-label']==='Username'||n.attrs['aria-label']==='New password');all[2].value='bob';all[3].value='second fixture';
 expect(h.calls.filter(c=>c.method==='basic_profile_save')).toHaveLength(0);
 await editor.save();const call=h.calls.find(c=>c.method==='basic_profile_save');
 expect(call.args[0]).toBe('app.example.test');expect(call.args[2]).toEqual([{username:'alice',password:'secret fixture'},{username:'bob',password:'second fixture'}]);expect(call.args[3]).toBe(4);expect(call.args[1].sites[0].auth).toEqual({mode:'basic',source:'independent'});expect(h.modal).toBeNull();
 const operation=h.button('Save & Apply').click();await tick(); // saved global impact still requires confirmation
 expect(h.modal?.attrs.title).toBe('Apply global authentication change');
 h.modalButton('Apply').click();await operation;expect(h.calls.find(c=>c.method==='config_apply').args).toEqual([5]);
});

test('cancelling inline account edits sends no persistence RPC and an account save error keeps the modal open',async()=>{
 for(const cancel of [true,false]){const h=harness('configuration',[],{fail:'basic_profile_save'});await h.render();const editor=await h.openSite();editor.field('authMode').value='basic';editor.field('authSource').value='independent';if(cancel)editor.cancel();else await editor.save();expect(h.calls.filter(c=>c.method==='config_apply')).toHaveLength(0);expect(h.calls.filter(c=>c.method==='basic_profile_save')).toHaveLength(cancel?0:1);expect(h.modal===null).toBe(cancel);if(!cancel)expect(h.notifications).toHaveLength(1);}
});

test('independent existing accounts retain blank passwords and remove deleted rows',async()=>{
 const site={domain:'app.example.test',upstreams:['http://localhost:8080'],challenge:'global',auth:{mode:'basic',source:'independent',profile:'site-profile'}};
 const h=harness('configuration',[],{config:{sites:[site]},basic_profiles:{'site-profile':[{username:'alice'},{username:'bob'}]}});await h.render();const editor=await h.openSite();editor.button('Remove account').click();await editor.save();expect(h.calls.find(c=>c.method==='basic_profile_save').args[2]).toEqual([{username:'bob',retain:true}]);
});

test('Authelia independent fields are visible and persist with the site in the same modal',async()=>{
 const h=harness('configuration',[]);await h.render();const editor=await h.openSite();editor.field('authMode').value='authelia';editor.field('authSource').value='independent';expect(editor.visible('authelia_backend')).toBe(true);expect(editor.visible('basic_accounts')).toBe(false);editor.field('authelia_backend').value='http://auth.example.test:9091';editor.field('authelia_portal').value='https://auth.example.test';await editor.save();expect(h.calls.find(c=>c.method==='draft_save').args[0].sites[0].auth.authelia).toEqual({backend:'http://auth.example.test:9091',uri:'/api/authz/forward-auth',portal:'https://auth.example.test'});
});

test('new site verification inherits global default and wildcard validation resolves that default',async()=>{
 for(const challenge of ['dns-01','http-01']){const h=harness('configuration',[],{config:{settings:{http_port:10080,https_port:10443,storage:'/etc/caddy/data',default_challenge:challenge},sites:[{domain:'app.example.test',upstreams:['http://localhost:8080']}]}});await h.render();const editor=await h.openSite();expect(editor.field('challenge').value).toBe('global');editor.field('domain').value='*.example.test';await editor.save();expect(h.calls.filter(c=>c.method==='draft_save')).toHaveLength(challenge==='dns-01'?1:0);expect(h.modal===null).toBe(challenge==='dns-01');}
});


test('switching independent Basic edits to global saves only the reference and never writes an account profile',async()=>{
 const h=harness('configuration',[]);await h.render();const editor=await h.openSite();editor.field('authMode').value='basic';editor.field('authSource').value='independent';editor.inputs().find(n=>n.attrs['aria-label']==='New password').value='discarded fixture';editor.field('authSource').value='global';expect(editor.visible('global_auth_reference')).toBe(true);expect(editor.visible('basic_accounts')).toBe(false);await editor.save();expect(h.calls.filter(c=>c.method==='basic_profile_save')).toHaveLength(0);expect(h.calls.find(c=>c.method==='draft_save').args[0].sites[0].auth).toEqual({mode:'basic',source:'global'});
});

test('cancel after a rejected account save restores the original site buffer',async()=>{
 const h=harness('configuration',[],{fail:'basic_profile_save'});await h.render();const editor=await h.openSite();editor.field('authMode').value='basic';editor.field('authSource').value='independent';const password=editor.inputs().find(n=>n.attrs['aria-label']==='New password');password.value='retry fixture';await editor.save();expect(password.value).toBe('retry fixture');expect(h.modal).not.toBeNull();editor.cancel();const reopened=await h.openSite();expect(reopened.field('authMode').value).toBe('none');expect(reopened.field('authSource').value).toBe('global');expect(h.calls.filter(c=>c.method==='basic_profile_save')).toHaveLength(1);
});

test('site account editor only offers username/password and saves through the site button',async()=>{
 const h=harness('configuration',[]);await h.render();const editor=await h.openSite();editor.field('authMode').value='basic';editor.field('authSource').value='independent';expect(editor.inputs().some(n=>n.attrs['aria-label']==='Existing bcrypt hash')).toBe(false);expect(JSON.stringify(h.modal)).not.toContain('bcrypt');
 editor.inputs().find(n=>n.attrs['aria-label']==='Username').value='alice';editor.inputs().find(n=>n.attrs['aria-label']==='New password').value='new-password';await editor.save();expect(h.calls.find(c=>c.method==='basic_profile_save').args[2]).toEqual([{username:'alice',password:'new-password'}]);
});

test('overview contains no cross-page links or boot and start/stop controls',async()=>{
 const h=harness('overview');await h.render();expect(h.nodes.filter(n=>n.tag==='a')).toHaveLength(0);expect(h.nodes.filter(n=>n.attrs.type==='checkbox')).toHaveLength(0);expect(h.button('Start')).toBeUndefined();expect(h.button('Stop')).toBeUndefined();expect(h.button('Restart')).toBeUndefined();expect(h.button('Reload')).toBeDefined();
});
test('global service controls remain usable in manual mode without making the configuration draft dirty',async()=>{
 const h=harness('configuration',[],{route:'settings',config:{mode:'manual'}});await h.render();const run=h.nodes.find(n=>n.attrs['aria-label']==='Run Caddy');expect(run.disabled).toBe(false);run.checked=true;run.events.change();expect(h.nodes.filter(n=>n.tag==='button'&&n.textContent==='Save').some(n=>!n.disabled)).toBe(true);expect(h.calls.filter(c=>c.method==='action')).toHaveLength(0);
});

test('site name and disabled state persist while keeping existing settings',async()=>{
 const h=harness('configuration',[]);await h.render();const editor=await h.openSite();editor.field('name').value='家庭媒体';editor.field('enabled').value='0';await editor.save();
 const saved=h.calls.find(c=>c.method==='draft_save').args[0].sites[0];expect(saved.name).toBe('家庭媒体');expect(saved.enabled).toBe(false);expect(saved.upstreams).toEqual(['http://localhost:8080']);
});


test('name/backend search and status filter update matching count',async()=>{
 const sites=[{name:'Media',domain:'media.example.test',upstreams:['http://localhost:8080'],enabled:true,challenge:'global',balance:'round_robin',path:'',strip:false},{name:'Paused',domain:'paused.example.test',upstreams:['http://localhost:9090'],enabled:false,challenge:'http-01',balance:'round_robin',path:'',strip:false}];
 const h=harness('configuration',[],{config:{sites}});await h.render();const count=h.nodes.find(n=>n.attrs.class==='count');expect(count.textContent).toBe('Matching sites: 2 / 2');h.nodes.find(n=>n.attrs['aria-label']==='Filter site status').attrs.change({target:{value:'disabled'}});expect(count.textContent).toBe('Matching sites: 1 / 2');h.nodes.find(n=>n.attrs.type==='search').attrs.input({target:{value:'media'}});expect(count.textContent).toBe('Matching sites: 0 / 2');
});
test('configuration copy exports the server protected preview, never raw manual secrets',async()=>{
 const h=harness('configuration',[],{route:'config',config:{mode:'manual',manual_caddyfile:'private-token-canary'},preview:{source:'manual',redacted:true}});await h.render();await h.button('Copy preview').click();expect(h.clipboard).toEqual(['{\n  "source": "manual",\n  "redacted": true\n}']);expect(h.clipboard[0]).not.toContain('private-token-canary');
});

test('backend rows require explicit valid addresses',async()=>{
 const h=harness('configuration',[]);await h.render();const editor=await h.openSite();
 expect(editor.validate('upstreams','')).not.toBe(true);
 for(const address of ['http://127.0.0.1:80','https://router.home:443','http://[::1]:8080'])expect(editor.validate('upstreams',address)).toBe(true);
 for(const address of ['invalid','http://router.home','http://router.home:0','http://router.home:65536','http://router.home:80/path'])expect(editor.validate('upstreams',address)).not.toBe(true);
 await editor.save();expect(h.calls.find(c=>c.method==='draft_save').args[0].sites[0].upstreams).toEqual(['http://localhost:8080']);
});
test('removing every backend still prevents saving a site',async()=>{
 const h=harness('configuration',[]);await h.render();const editor=await h.openSite();editor.field('upstreams').value=[];
 await editor.save();expect(h.calls.some(c=>c.method==='draft_save')).toBe(false);expect(h.notifications.length).toBeGreaterThan(0);
});

test('site and TLS saves refresh the native LuCI UCI change indicator',async()=>{
 const h=harness('configuration',[]);await h.render();const editor=await h.openSite();await editor.save();expect(h.changeRefreshes).toBeGreaterThan(0);
 const tls=harness('tls',[]);await tls.render();tls.nodes.find(n=>n.tag==='input'&&n.attrs.type==='radio').events.change();await tls.button('Save').click();expect(tls.changeRefreshes).toBeGreaterThan(0);
});

test('TLS certificate inventory stays compact and opens details without navigation',async()=>{
 const cert={domains:['app.example.test'],sites:['app.example.test'],issuer:'Example CA',not_before:1700000000,not_after:1900000000,validity:'valid',fingerprint:'private-detail-fingerprint'};
 const h=harness('tls',[],{certificates:{ok:true,complete:true,certificates:[cert]}});await h.render();
 expect(h.pageNodes().filter(n=>n.tag==='a')).toHaveLength(0);expect(h.pageNodes().some(n=>n.textContent==='Example CA')).toBe(true);
 expect(h.pageNodes().some(n=>n.textContent==='private-detail-fingerprint')).toBe(false);
 expect(h.pageNodes().some(n=>n.textContent.includes('Renewal history is partial'))).toBe(false);
 h.button('Details').click();expect(h.modal.attrs.title).toBe('Certificate details');expect(JSON.stringify(h.modal)).toContain('private-detail-fingerprint');
 h.modalButton('Close').click();expect(h.modal).toBeNull();expect(h.calls.some(c=>c.method==='config_apply')).toBe(false);
});
test('TLS page opens notification settings and stages save without leaving the page',async()=>{
 const h=harness('tls',[]);await h.render();h.button('Configure').click();expect(h.modal.attrs.title).toBe('Notification settings');
 h.modalField('tls-notify-enabled').checked=true;h.modalField('tls-notify-url').value='https://notify.example.test/private';h.modalField('tls-notify-headers').value='{"Authorization":"test"}';
 expect(h.modalButton('Save').attrs.disabled==null).toBe(true);await h.modalButton('Save').click();
 expect(h.calls.filter(c=>c.method==='notification_save')).toEqual([{method:'notification_save',args:[true,'https://notify.example.test/private',{Authorization:'test'},'POST','default','']}]);
 expect(h.changeRefreshes).toBe(1);expect(h.modal).toBeNull();expect(h.calls.some(c=>c.method==='config_apply')).toBe(false);
});
test('TLS notification modal cancellation and failed saves preserve editable fields',async()=>{
 for(const fail of [false,true]) {
  const h=harness('tls',[],{fail:fail?'notification_save':null});await h.render();h.button('Configure').click();h.modalField('tls-notify-url').value='https://notify.example.test/private';
  if(!fail){h.modalButton('Cancel').click();expect(h.calls.some(c=>c.method==='notification_save')).toBe(false);expect(h.modal).toBeNull();}
  else {await h.modalButton('Save').click();expect(h.modal).not.toBeNull();expect(h.modalField('tls-notify-url').value).toBe('https://notify.example.test/private');expect(JSON.stringify(h.modal)).toContain('Revision conflict');}
 }
});
test('TLS readonly forms disable notification saves and credential inputs',async()=>{
 const h=harness('tls',[],{readonly:true});await h.render();expect(h.nodes.find(n=>n.attrs.id==='caddy-cf-token').disabled).toBe(true);
 h.button('Configure').click();expect(h.modalButton('Save').disabled).toBe(true);await h.modalButton('Save').click();expect(h.calls.some(c=>c.method==='notification_save')).toBe(false);
});
test('TLS default verification has no per-site controls or pending label',async()=>{
 const h=harness('tls',[]);await h.render();
 expect(h.pageNodes().some(n=>n.textContent==='Pending application')).toBe(false);
 expect(h.pageNodes().some(n=>n.attrs?.['aria-label']==='app.example.test Certificate verification')).toBe(false);
 const radio=h.nodes.find(n=>n.attrs.name==='default-challenge'&&n.attrs.value==='dns-01');radio.events.change();await h.button('Save').click();
 expect(h.calls.filter(c=>c.method==='tls_save')).toEqual([{method:'tls_save',args:['dns-01',4,'',true]}]);
});
test('TLS webhook sends custom method/body and hides body controls for GET and HEAD',async()=>{
 const h=harness('tls',[],{notification:{ok:true,webhook:{enabled:true,configured:true,method:'PATCH',body_mode:'custom',body_configured:true}}});await h.render();h.button('Configure').click();
 const method=h.modalField('tls-notify-method'),mode=h.modalField('tls-notify-body-mode'),body=h.modalField('tls-notify-body');
 expect(method.value).toBe('PATCH');expect(mode.value).toBe('custom');expect(body.value).toBe('');
 expect(body.attrs.placeholder).toContain('retain');body.value='{"text":"{{summary}}"}';
 for(const value of ['GET','HEAD']){method.value=value;method.events.change();expect(body.disabled).toBe(true);expect(body.parentNode.parentNode.hidden).toBe(true);}
 method.value='PUT';method.events.change();expect(body.disabled).toBe(false);expect(body.parentNode.parentNode.hidden).toBe(false);
 await h.modalButton('Save').click();expect(h.calls.find(c=>c.method==='notification_save').args).toEqual([true,'',{},'PUT','custom','{"text":"{{summary}}"}']);
});
test('TLS notification history uses a modal and empty certificate inventory stays concise',async()=>{
 const h=harness('tls',[],{notification:{ok:true,webhook:{enabled:false},alerts:[],deliveries:[{event_id:'fixture-event',type:'expired',delivery:'sent',attempts:1}]}});await h.render();
 expect(h.pageNodes().some(n=>n.textContent==='No stored certificates.')).toBe(true);h.button('History').click();expect(h.modal.attrs.title).toBe('Notification history');expect(JSON.stringify(h.modal)).toContain('Sent');
});

test('global settings render three panels and grouped fields still save through the shared map',async()=>{
 const h=harness('configuration',[],{route:'settings'});await h.render();
 expect(h.pageNodes().filter(n=>n.tag==='h2').map(n=>n.textContent)).toEqual(['Service control','Service settings','Auth configuration']);
 expect(h.pageNodes().filter(n=>n.tag==='h3').map(n=>n.textContent)).not.toContain('Global settings');
 expect(h.pageNodes().some(n=>n.tag==='label'&&n.textContent==='HTTP port')).toBe(true);
 expect(h.pageNodes().some(n=>n.tag==='label'&&n.textContent==='ACME contact email (optional)')).toBe(false);
 h.editGlobal('settings','http_port',18080);h.editGlobal('authelia','backend','http://auth.example.test:9091');h.editGlobal('authelia','portal','https://login.example.test');await h.button('Save').click();
 const saved=h.calls.find(c=>c.method==='draft_save').args[0];expect(saved.settings.http_port).toBe(18080);expect(saved.auth.authelia.backend).toBe('http://auth.example.test:9091');expect(saved.auth.authelia.uri).toBe('/api/authz/forward-auth');expect(h.calls.some(c=>c.method==='config_apply')).toBe(false);
});

for(const mode of ['form','manual'])test(`service checkboxes use page Save in ${mode} mode without rewriting the form`,async()=>{
 const h=harness('configuration',[],{route:'settings',config:{mode}});await h.render();
 expect(h.pageNodes().filter(n=>n.tag==='button'&&n.textContent==='Save')).toHaveLength(1);
 const checkbox=h.pageNodes().find(n=>n.attrs?.id==='caddy-service-running');checkbox.checked=true;checkbox.events.change();expect(h.button('Save').disabled).toBe(false);
 await h.button('Save').click();expect(h.calls.filter(c=>c.method==='service_save')).toEqual([{method:'service_save',args:[true,false]}]);
 expect(h.calls.some(c=>c.method==='draft_save'||c.method==='config_apply')).toBe(false);expect(h.button('Save').disabled).toBe(true);
});
test('failed shared service save retains edits for retry and makes no runtime call',async()=>{
 const h=harness('configuration',[],{route:'settings',fail:'service_save'});await h.render();const checkbox=h.pageNodes().find(n=>n.attrs?.id==='caddy-service-boot');checkbox.checked=true;checkbox.events.change();await h.button('Save').click();
 expect(checkbox.checked).toBe(true);expect(h.button('Save').disabled).toBe(false);expect(h.calls.some(c=>c.method==='config_apply')).toBe(false);
});
test('TLS page saves and clears the ACME email with the scoped TLS RPC',async()=>{
 const h=harness('tls',[],{config:{settings:{http_port:10080,https_port:10443,email:'old@example.test',storage:'/etc/caddy/data'}}});await h.render();const email=h.pageNodes().find(n=>n.attrs?.id==='caddy-acme-email');expect(email.value).toBe('old@example.test');
 email.value='';email.events.input();await h.button('Save').click();expect(h.calls.find(c=>c.method==='tls_save').args).toEqual(['http-01',4,'',true]);expect(h.calls.some(c=>c.method==='draft_save')).toBe(false);
});

test('service edits use shared Save & Apply after staging and do not save form fields',async()=>{
 const h=harness('configuration',[],{route:'settings'});await h.render();const checkbox=h.pageNodes().find(n=>n.attrs?.id==='caddy-service-running');checkbox.checked=true;checkbox.events.change();await h.button('Save & Apply').click();
 expect(h.calls.filter(c=>['service_save','config_apply','draft_save'].includes(c.method)).map(c=>c.method)).toEqual(['service_save','config_apply']);
});

test('global account changes only use the page save and expose no hash inputs',async()=>{
 const h=harness('configuration',[],{route:'settings'});await h.render();
 expect(h.pageNodes().filter(n=>n.tag==='button'&&n.textContent==='Save')).toHaveLength(1);expect(h.pageNodes().some(n=>n.textContent==='Save accounts to draft')).toBe(false);expect(h.pageNodes().some(n=>n.attrs?.['aria-label']==='Existing bcrypt hash')).toBe(false);
 h.pageNodes().find(n=>n.attrs?.['aria-label']==='Username').value='alice';h.pageNodes().find(n=>n.attrs?.['aria-label']==='New password').value='global-password';
 h.pageNodes().find(n=>n.children?.some(c=>c?.attrs?.class==='account-row')).events.input();await h.button('Save').click();
 const save=h.calls.find(c=>c.method==='basic_profile_save');expect(save.args[0]).toBe('global');expect(save.args[2]).toEqual([{username:'alice',password:'global-password'}]);expect(h.calls.some(c=>c.method==='config_apply')).toBe(false);
});

for(const mode of ['form','manual'])test(`configuration file controls stay interactive in ${mode} mode`,async()=>{
 const h=harness('configuration',[],{route:'config',config:{mode,manual_caddyfile:'retained-caddyfile'}});await h.render();
 const select=h.pageNodes().find(n=>n.tag==='select');expect(select.disabled).toBe(false);
 expect(select.children.filter(n=>n.attrs.selected!=null).map(n=>n.attrs.value)).toEqual([mode]);
 for(const label of ['Refresh preview','Copy preview','Download preview'])expect(h.button(label).disabled).toBe(false);
 await h.button('Refresh preview').click();expect(h.calls.some(c=>c.method==='config_preview')).toBe(true);
 select.attrs.change({target:Object.assign(select,{value:mode==='form'?'manual':'form'})});expect(h.modal.attrs.title).toBe('Switch configuration source');h.modalButton('Cancel').click();expect(h.modal).toBeNull();
 expect(h.calls.some(c=>c.method==='draft_save'||c.method==='config_apply')).toBe(false);
});
test('configuration file readonly permission disables source and export controls',async()=>{
 const h=harness('configuration',[],{route:'config',readonly:true});await h.render();expect(h.pageNodes().find(n=>n.tag==='select').disabled).toBe(true);
 for(const label of ['Refresh preview','Copy preview','Download preview'])expect(h.button(label).disabled).toBe(true);
});

test('configuration source can switch both ways and save the complete Caddyfile',async()=>{
 const h=harness('configuration',[],{route:'config',config:{mode:'form',manual_caddyfile:'retained-private-file'}});await h.render();const select=h.pageNodes().find(n=>n.tag==='select'),manual=h.pageNodes().find(n=>n.tag==='textarea');
 expect(manual.disabled).toBe(true);select.attrs.change({target:Object.assign(select,{value:'manual'})});h.modalButton('Switch source').click();expect(select.value).toBe('manual');expect(manual.disabled).toBe(false);
 manual.value='edited-private-file';manual.events.input();await h.button('Save').click();const saved=h.calls.find(c=>c.method==='draft_save').args[0];expect(saved.mode).toBe('manual');expect(saved.manual_caddyfile).toBe('edited-private-file');
 select.attrs.change({target:Object.assign(select,{value:'form'})});h.modalButton('Switch source').click();expect(select.value).toBe('form');expect(manual.disabled).toBe(true);await h.button('Save').click();expect(h.calls.filter(c=>c.method==='draft_save').at(-1).args[0].mode).toBe('form');
});
test('configuration export buttons use the protected preview for copy and download',async()=>{
 const h=harness('configuration',[],{route:'config',config:{mode:'manual',manual_caddyfile:'private-canary'},preview:{protected:true}});await h.render();await h.button('Copy preview').click();await h.button('Download preview').click();expect(h.clipboard[0]).not.toContain('private-canary');expect(h.downloads[0].attrs.download).toBe('caddy-preview.redacted.json');expect(h.notifications).toHaveLength(0);
});

test('configuration controls disable during save and recover afterward',async()=>{
 let release;const promise=new Promise(resolve=>{release=resolve;});const h=harness('configuration',[],{route:'config',config:{mode:'manual'},wait:{method:'draft_save',promise}});await h.render();
 const manual=h.pageNodes().find(n=>n.tag==='textarea');manual.value='edited';manual.events.input();const operation=h.button('Save').click();
 const select=h.pageNodes().find(n=>n.tag==='select');expect(select.disabled).toBe(true);for(const label of ['Refresh preview','Copy preview','Download preview'])expect(h.button(label).disabled).toBe(true);
 release();await operation;expect(select.disabled).toBe(false);expect(manual.disabled).toBe(false);for(const label of ['Refresh preview','Copy preview','Download preview'])expect(h.button(label).disabled).toBe(false);
});
