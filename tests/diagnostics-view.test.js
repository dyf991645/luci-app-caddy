import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
function harness(options={}) {
 const nodes=[],calls=[],downloads=[];
 const info={ok:true,source:options.manual?'manual':'form',binary:{version:'2',modules:[],cloudflare:true},package:{version:'1'},architecture:{},permissions:{},retention:{},active_ports:[],ports:[],listeners:[]};
 function E(tag,attrs={},children=[]) {
  const n={tag,attrs,children:Array.isArray(children)?children:[children],disabled:attrs.disabled!=null,value:attrs.value??(tag==='select'?'all':''),events:{},addEventListener(k,f){this.events[k]=f;},replaceChildren(...c){this.children=c;},appendChild(c){this.children.push(c);},remove(){},click(){if(!this.disabled)return this.attrs.click?.();}};nodes.push(n);return n;
 }
 const rpc={declare({method}){return async(...args)=>{calls.push([method,...args]);if(method==='diagnostics')return info;if(method==='logs')return {ok:true,entries:(options.entries||[]).filter(e=>e.kind===args[1])};return options.result||{ok:true,backends:[]};};}};
 const layout={row:(...c)=>E('row',{},c),panel:(...c)=>E('panel',{},c),page:(...c)=>E('page',{},c)};
 const view=new Function('view','rpc','ui','layout','E','_','L','URL','Blob','document','setTimeout',readFileSync(new URL('../packages/luci-app-caddy/htdocs/luci-static/resources/view/caddy/diagnostics.js',import.meta.url),'utf8'))({extend:x=>x},rpc,{addNotification(){}},layout,E,s=>s,{hasViewPermission:()=>!options.readonly},{createObjectURL(blob){downloads.push(blob);return 'blob:test';},revokeObjectURL(){}},Blob,{body:E('body')},f=>f());
 return {calls,nodes,downloads,async render(){view.render(await view.load());},button(text){return nodes.find(n=>n.tag==='button'&&n.children.includes(text));},text(){function read(n){return typeof n==='string'?n:(Array.isArray(n)?n:(n?.children||[])).map(read).join(' ');}return nodes.filter(n=>n.tag==='page').map(read).join(' ');}};
}
test('backend checks are explicit, enabled with native boolean semantics, and show empty results',async()=>{
 const h=harness();await h.render();expect(h.calls.some(c=>c[0]==='backend_probe')).toBe(false);expect(h.text()).toContain('Not checked yet.');const b=h.button('Check backends');expect(b.disabled).toBe(false);await b.click();expect(h.calls.filter(c=>c[0]==='backend_probe')).toEqual([['backend_probe',true]]);expect(h.text()).toContain('No configured backends to check.');expect(b.disabled).toBe(false);
});
test('manual and readonly modes prevent backend checks',async()=>{
 for(const options of [{manual:true},{readonly:true}]){const h=harness(options);await h.render();expect(h.button('Check backends').disabled).toBe(true);await h.button('Check backends').click();expect(h.calls.some(c=>c[0]==='backend_probe')).toBe(false);if(options.manual)expect(h.text()).toContain('Backend checks are unavailable in Caddyfile mode.');}
});
test('probe results distinguish TCP success, failure and partial results',async()=>{
 const h=harness({result:{ok:true,complete:false,backends:[{url:'http://127.0.0.1:80',state:'tcp_reachable'},{url:'http://127.0.0.1:81',state:'unreachable'}]}});await h.render();await h.button('Check backends').click();expect(h.text()).toContain('TCP reachable');expect(h.text()).toContain('Unreachable or timed out');expect(h.text()).toContain('Only the first 8 backends');
});
test('failed probe displays the error and allows retry',async()=>{
 const h=harness({result:{ok:false,error:'probe unavailable'}});await h.render();await h.button('Check backends').click();expect(h.text()).toContain('probe unavailable');expect(h.button('Check backends').disabled).toBe(false);
});
test('runtime and access panels independently filter and export their own entries',async()=>{
 const entries=[{ts:1,level:'info',kind:'access',logger:'http.log.access',event:'request_completed',status:200},{ts:2,level:'error',kind:'runtime',logger:'admin',event:'service_error'}];
 const h=harness({entries});await h.render();expect(h.calls).toContainEqual(['logs','all','runtime']);expect(h.calls).toContainEqual(['logs','all','access']);
 expect(h.nodes.filter(n=>n.tag==='th').map(n=>n.children[0])).toEqual(['Time','Level','Source','Event','Time','Level','Source','Event']);
 expect(h.text()).toContain('Request completed · HTTP 200');expect(h.text()).toContain('Service error');
 const level=h.nodes.find(n=>n.attrs['aria-label']==='Runtime logs · Log level');level.value='error';await level.events.change();expect(h.calls).toContainEqual(['logs','error','runtime']);expect(h.calls.filter(c=>c[0]==='logs'&&c[2]==='access').length).toBe(1);
 const exports=h.nodes.filter(n=>n.tag==='button'&&n.children.includes('Export filtered logs'));exports[0].click();exports[1].click();
 expect(JSON.parse(await h.downloads[0].text())).toMatchObject({kind:'runtime',entries:[entries[1]]});expect(JSON.parse(await h.downloads[1].text())).toMatchObject({kind:'access',entries:[entries[0]]});
 expect(h.text()).not.toContain('Runtime and access logs');
});
