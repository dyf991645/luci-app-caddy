import {test, expect} from 'bun:test';
import {readFileSync, existsSync} from 'node:fs';
const resources=new URL('../packages/luci-app-caddy/htdocs/luci-static/resources/',import.meta.url);
// Executes the shipped LuCI views. DOM, JSONMap and RPC are host adapters only;
// clicks, asynchronous save responses and the confirmation gate are real view code.
function harness(page, affected=['basic.example.test','authelia.example.test'], fixture={}) {
 const nodes=[]; let modal=null; const calls=[],notifications=[];
 function E(tag,attrs={},children=[]) {
  const node={tag,attrs,children:[],value:attrs.value || '',disabled:attrs.disabled || false,textContent:typeof children==='string'?children:'',events:{},
   addEventListener(name,fn){this.events[name]=fn;},appendChild(n){this.children.push(n);Object.defineProperty(n,'parentNode',{value:this,writable:true,configurable:true});},replaceChildren(...n){this.children=n;},
   querySelectorAll(selector){return all(this).filter(n=>selector.split(',').includes(n.tag));},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);},classList:{add(){}},click(){return this.attrs.click?.();}};
  node.children=Array.isArray(children)?children:[children];node.children.forEach(n=>{if(n&&typeof n==='object')Object.defineProperty(n,'parentNode',{value:node,writable:true,configurable:true});}); nodes.push(node);return node;
 }
 function all(n){return typeof n==='object' && n ? [n,...(n.children || []).flatMap(all)]:[];}
 const config={version:2,settings:{http_port:10080,https_port:10443,email:'',storage:'/etc/caddy/data'},sites:[{domain:'app.example.test',upstreams:['http://localhost:8080'],balance:'round_robin',path:'',strip:false,challenge:'http-01'}]};
 Object.assign(config,fixture.config || {});
 let state={ok:true,basic_profiles:fixture.basic_profiles || {},draft:config,draft_revision:4,active_revision:3,pending:true,affected_domains:affected};
 const ui={showModal(title,body){modal=E('modal',{title},body);},hideModal(){modal=null;},addNotification(...args){notifications.push(args);}};
 const rpc={declare({method}){return async (...args)=>{calls.push({method,args});if(fixture.fail===method)return {ok:false,error:'Revision conflict'};if(method==='status')return {installed:true,running:false,enabled:false};if(method==='credential_status')return {ok:true};if(method==='config_preview')return {ok:true,config:{}};if(method==='config_apply'){state={...state,active_revision:state.draft_revision,pending:false,affected_domains:[]};return state;}if(method==='basic_profile_save'||method==='draft_save')state={...state,draft:args[method==='basic_profile_save'?1:0]};if(['tls_save','credential_save','draft_save','basic_profile_save'].includes(method))state={...state,draft_revision:state.draft_revision+1,affected_domains:['latest.example.test']};return state;};}};
 let rootMap,activeMap;
 const form={JSONMap:class {
  constructor(data){this.buffer=data;this.children=[];rootMap=this;this.data={get:(_,sid,key)=>key==null?this.buffer[sid]:this.buffer[sid]?.[key],set:(_,sid,key,v)=>{this.buffer[sid][key]=v;},sections:()=>this.buffer.sites.map((s,i)=>({...s,'.name':String(i)}))};this.buffer.sites.forEach((s,i)=>this.buffer[String(i)]=s);}
  section(type,name){const m=this;const s={map:m,children:[],tabs:[],option(type,option,title){const o={map:this.map,section:this,option,title,choices:[],dependencies:[],value(v){this.choices.push(v);},depends(key,value){this.dependencies.push(typeof key==='object'?key:{[key]:value});}};this.children.push(o);return o;},tab(name){this.tabs[name]={children:[]};},taboption(tab,...args){const o=this.option(...args);this.tabs[tab].children.push(o);return o;},getActiveModalMap(){return {instance:activeMap,parentNode:modal};},handleModalCancel(){modal=null;},handleAdd(){},handleRemove(){}};this.children.push(s);return s;}
  parse(){return Promise.resolve();} render(){return Promise.resolve(E('form'));} load(){return Promise.resolve();}reset(){return Promise.resolve();}
 }};

 const values={dom:{findClassInstance:node=>node.instance},poll:{add(){}},E,_:s=>s,ui,rpc,view:{extend:x=>x},form,L:{hasViewPermission:()=>true,url:x=>x,resource:x=>x,env:{dispatchpath:['admin','services','caddy',fixture.route || 'configuration']}},window:{addEventListener(){}},document:{createTextNode:s=>({textContent:s}),addEventListener(){},querySelector(){return null;},head:{appendChild(){}}},location:{href:''},baseclass:{extend:x=>x}};
 const helper=new URL('caddy/apply.js',resources);
 if(existsSync(helper))values.caddyApply=evaluate(helper);
 values.layout=evaluate(new URL('caddy/layout.js',resources));
 values.service=evaluate(new URL('caddy/service.js',resources));
 function evaluate(file){return new Function(...Object.keys(values),readFileSync(file,'utf8'))(...Object.values(values));}
 const view=evaluate(new URL(`view/caddy/${page}.js`,resources));
 return {async openSite(){
   const grid=rootMap.children[0];
   activeMap={section:'0',data:rootMap.data,parent:rootMap,readonly:false,checkDepends(){},render:()=>Promise.resolve(E('form')),parse:async()=>{for(const o of section.children){if(o.input&&o.active()){const previous=o.cfgvalue?o.cfgvalue('0'):rootMap.data.get('json','0',o.option);if(o.forcewrite||JSON.stringify(previous)!==JSON.stringify(o.input.value)){if(o.write)o.write('0',o.input.value);else rootMap.data.set('json','0',o.option,o.input.value);}}}}};
   const section={...grid,map:activeMap,children:[],tabs:[]};
   section.children=grid.children.map(o=>({...o,map:activeMap,section}));
   grid.addModalOptions(section,'0');
   const body=[];
   for(const o of section.children){
    o.active=()=>!o.dependencies.length||o.dependencies.some(dep=>Object.entries(dep).every(([key,val])=>section.children.find(other=>other.option===key)?.input?.value===val));
    if(o.renderWidget)body.push(o.renderWidget());else {o.input=E('input',{'aria-label':o.title,value:o.cfgvalue?o.cfgvalue('0'):rootMap.data.get('json','0',o.option)??o.default??''});body.push(o.input);}
   }
   ui.showModal('Edit site',body);
   return {field(name){return section.children.find(o=>o.option===name).input;},visible(name){return section.children.find(o=>o.option===name).active();},button(label){return all(modal).find(n=>n.tag==='button'&&n.textContent===label);},inputs(){return all(modal).filter(n=>n.tag==='input');},save(){return grid.handleModalSave(activeMap);},cancel(){grid.handleModalCancel(activeMap);}};
  },async render(){await view.render(page==='tls'?[state,{ok:true}]:page==='overview'?[{installed:true,running:false,enabled:false},state]:state);},button(label){return nodes.find(n=>n.tag==='button'&&n.textContent===label);},get modal(){return modal;},modalButton(label){return all(modal).find(n=>n.tag==='button'&&n.textContent===label);},nodes,calls,notifications};
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

test('inline accounts preserve the optional write-only advanced hash entry',async()=>{
 const h=harness('configuration',[]);await h.render();const editor=await h.openSite();editor.field('authMode').value='basic';editor.field('authSource').value='independent';editor.inputs().find(n=>n.attrs['aria-label']==='Username').value='alice';const hash=editor.inputs().find(n=>n.attrs['aria-label']==='Existing bcrypt hash');expect(hash.attrs.type).toBe('password');expect(hash.value).toBe('');hash.value='$2b$fixture-only';await editor.save();expect(h.calls.find(c=>c.method==='basic_profile_save').args[2]).toEqual([{username:'alice',hash:'$2b$fixture-only'}]);
});


test('overview contains no cross-page links or boot and start/stop controls',async()=>{
 const h=harness('overview');await h.render();expect(h.nodes.filter(n=>n.tag==='a')).toHaveLength(0);expect(h.nodes.filter(n=>n.attrs.type==='checkbox')).toHaveLength(0);expect(h.button('Start')).toBeUndefined();expect(h.button('Stop')).toBeUndefined();expect(h.button('Restart')).toBeDefined();expect(h.button('Reload active configuration')).toBeDefined();
});
test('global service controls remain usable in manual mode without making the configuration draft dirty',async()=>{
 const h=harness('configuration',[],{route:'settings',config:{mode:'manual'}});await h.render();const run=h.nodes.find(n=>n.attrs['aria-label']==='Run Caddy');expect(run.disabled).toBe(false);run.checked=true;run.events.change();expect(h.button('Apply service settings').disabled).toBe(false);expect(h.button('Save').disabled).toBe(true);expect(h.calls.filter(c=>c.method==='action')).toHaveLength(0);
});
