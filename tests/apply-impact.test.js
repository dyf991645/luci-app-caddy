import {test, expect} from 'bun:test';
import {readFileSync, existsSync} from 'node:fs';
const resources=new URL('../packages/luci-app-caddy/htdocs/luci-static/resources/',import.meta.url);
// Executes the shipped LuCI views. DOM, JSONMap and RPC are host adapters only;
// clicks, asynchronous save responses and the confirmation gate are real view code.
function harness(page, affected=['basic.example.test','authelia.example.test']) {
 const nodes=[]; let modal=null; const calls=[],notifications=[];
 function E(tag,attrs={},children=[]) {
  const node={tag,attrs,children:[],value:attrs.value || '',disabled:attrs.disabled || false,textContent:typeof children==='string'?children:'',events:{},
   addEventListener(name,fn){this.events[name]=fn;},appendChild(n){this.children.push(n);},replaceChildren(...n){this.children=n;},
   querySelectorAll(selector){return all(this).filter(n=>selector.split(',').includes(n.tag));},remove(){},click(){return this.attrs.click?.();}};
  node.children=Array.isArray(children)?children:[children]; nodes.push(node);return node;
 }
 function all(n){return typeof n==='object' && n ? [n,...(n.children || []).flatMap(all)]:[];}
 const config={version:2,settings:{http_port:10080,https_port:10443,email:'',storage:'/etc/caddy/data'},sites:[{domain:'app.example.test',upstreams:['http://localhost:8080'],balance:'round_robin',path:'',strip:false,challenge:'http-01'}]};
 let state={ok:true,draft:config,draft_revision:4,active_revision:3,pending:true,affected_domains:affected};
 const ui={showModal(title,body){modal=E('modal',{title},body);},hideModal(){modal=null;},addNotification(...args){notifications.push(args);}};
 const rpc={declare({method}){return async (...args)=>{calls.push({method,args});if(method==='credential_status')return {ok:true};if(method==='config_preview')return {ok:true,config:{}};if(method==='config_apply'){state={...state,active_revision:state.draft_revision,pending:false,affected_domains:[]};return state;}if(['tls_save','credential_save','draft_save','basic_profile_save'].includes(method))state={...state,draft_revision:state.draft_revision+1,affected_domains:['latest.example.test']};return state;};}};
 const form={JSONMap:class {
  constructor(data){this.buffer=data;this.children=[];this.data={get:(_,sid,key)=>this.buffer[sid]?.[key],set:(_,sid,key,v)=>{this.buffer[sid][key]=v;},sections:()=>this.buffer.sites.map((s,i)=>({...s,'.name':String(i)}))};this.buffer.sites.forEach((s,i)=>this.buffer[String(i)]=s);}
  section(){const s={children:[],option(){const o={value(){},depends(){}};s.children.push(o);return o;}};this.children.push(s);return s;}
  parse(){return Promise.resolve();} render(){return Promise.resolve(E('form'));}
 }};
 const values={E,_:s=>s,ui,rpc,view:{extend:x=>x},form,L:{hasViewPermission:()=>true,url:x=>x,resource:x=>x,env:{dispatchpath:['admin','services','caddy','configuration']}},window:{addEventListener(){}},document:{addEventListener(){},querySelector(){return null;},head:{appendChild(){}}},location:{href:''},baseclass:{extend:x=>x}};
 const helper=new URL('caddy/apply.js',resources);
 if(existsSync(helper))values.caddyApply=evaluate(helper);
 values.layout=evaluate(new URL('caddy/layout.js',resources));
 function evaluate(file){return new Function(...Object.keys(values),readFileSync(file,'utf8'))(...Object.values(values));}
 const view=evaluate(new URL(`view/caddy/${page}.js`,resources));
 return {async render(){await view.render(page==='tls'?[state,{ok:true}]:state);},button(label){return nodes.find(n=>n.tag==='button'&&n.textContent===label);},get modal(){return modal;},modalButton(label){return all(modal).find(n=>n.tag==='button'&&n.textContent===label);},nodes,calls,notifications};
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
  const field=h.nodes.find(n=>page==='tls' ? n.tag==='select' || n.tag==='input' && n.attrs.type==='radio' : n.tag==='form');
  field.events.change();const operation=h.button('Save & Apply').click();await tick();
  expect(JSON.stringify(h.modal)).toContain('latest.example.test');
  expect(JSON.stringify(h.modal)).not.toContain('outdated.example.test');
  expect(h.calls.filter(c=>c.method==='config_apply')).toHaveLength(0);
  h.modalButton('Apply').click();await operation;
  expect(h.calls.filter(c=>c.method==='config_apply')).toEqual([{method:'config_apply',args:[5]}]);
 });
 test(`${page} cancelling a newly saved authentication change retains its pending draft`,async()=>{
  const h=harness(page);await h.render();
  h.nodes.find(n=>page==='tls' ? n.tag==='select' || n.tag==='input' && n.attrs.type==='radio' : n.tag==='form').events.change();
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
