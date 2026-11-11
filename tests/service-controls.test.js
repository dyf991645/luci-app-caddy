import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
function harness(options={}) {
 const calls=[],nodes=[],notes=[];let state={installed:true,running:false,enabled:false,...options.state};
 function E(tag,attrs={},children=[]) {const n={tag,attrs,children,checked:!!attrs.checked,disabled:!!attrs.disabled,textContent:typeof children==='string'?children:'',events:{},addEventListener(k,f){this.events[k]=f;},click(){return this.attrs.click?.();}};nodes.push(n);return n;}
 const rpc={declare({method}){return async(action,boot)=>{calls.push([method,action,boot]);if(method==='status')return {...state};if(method==='service_save' && options.fail)return {ok:false,error:'operation failed'};if(method==='service_save')state.desired={running:action,enabled:boot};return {ok:true};};}};
 const module=new Function('baseclass','rpc','ui','E','_','L','layout','applyFlow',readFileSync(new URL('../packages/luci-app-caddy/htdocs/luci-static/resources/caddy/service.js',import.meta.url),'utf8'))({extend:x=>x},rpc,{addNotification(...a){notes.push(a);}},E,s=>s,{hasViewPermission:()=>!options.readonly},{panel:(...a)=>E('panel',{},a)},{refreshChanges:async()=>calls.push(['changes'])});
 return {async render(){return module.controls();},calls,notes,nodes,check(label){return nodes.find(n=>n.attrs['aria-label']===label);},button(){return nodes.find(n=>n.tag==='button'&&n.children==='Save');}};
}
test('service checkboxes save actual UCI desired state and refresh changes without runtime actions',async()=>{
 const h=harness();await h.render();const run=h.check('Run Caddy'),boot=h.check('Start on boot');run.checked=boot.checked=true;run.events.change();boot.events.change();
 expect(h.calls.filter(x=>x[0]==='service_save')).toEqual([]);await h.button().click();
 expect(h.calls.filter(x=>x[0]==='service_save')).toEqual([['service_save',true,true]]);expect(h.calls.some(x=>x[0]==='changes')).toBe(true);expect(h.calls.some(x=>x[0]==='action')).toBe(false);expect(h.button().disabled).toBe(true);
});
test('failed UCI save retains checkbox edits for retry',async()=>{
 const h=harness({fail:true});await h.render();h.check('Run Caddy').checked=h.check('Start on boot').checked=true;h.check('Run Caddy').events.change();await h.button().click();
 expect(h.notes.length).toBe(1);expect(h.check('Run Caddy').checked).toBe(true);expect(h.button().disabled).toBe(false);
});
test('checkboxes reflect staged UCI state independently of actual running process',async()=>{
 const h=harness({state:{running:true,enabled:true,desired:{running:false,enabled:false}}});await h.render();expect(h.check('Run Caddy').checked).toBe(false);expect(h.check('Start on boot').checked).toBe(false);expect(h.button().disabled).toBe(true);await h.button().click();expect(h.calls.some(x=>x[0]==='service_save')).toBe(false);
});
test('read-only and missing binary prevent service writes',async()=>{
 for(const options of [{readonly:true},{state:{installed:false}}]) {const h=harness(options);await h.render();expect(h.check('Run Caddy').disabled).toBe(true);h.check('Run Caddy').checked=true;await h.button().click();expect(h.calls.filter(x=>x[0]==='service_save')).toEqual([]);}
});
