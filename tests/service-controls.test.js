import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
function harness(options={}) {
 const calls=[],nodes=[],notes=[];let state={installed:true,running:false,enabled:false,...options.state};
 function E(tag,attrs={},children=[]) {const n={tag,attrs,children,checked:!!attrs.checked,disabled:!!attrs.disabled,textContent:typeof children==='string'?children:'',events:{},addEventListener(k,f){this.events[k]=f;},click(){return this.attrs.click?.();}};nodes.push(n);return n;}
 const rpc={declare({method}){return async(action)=>{calls.push([method,action]);if(method==='status')return {...state};if(action===options.fail)return {ok:false,error:'operation failed'};if(action==='start')state.running=true;if(action==='stop')state.running=false;if(action==='enable')state.enabled=true;if(action==='disable')state.enabled=false;return {ok:true};};}};
 const module=new Function('baseclass','rpc','ui','E','_','L','layout',readFileSync(new URL('../packages/luci-app-caddy/htdocs/luci-static/resources/caddy/service.js',import.meta.url),'utf8'))({extend:x=>x},rpc,{addNotification(...a){notes.push(a);}},E,s=>s,{hasViewPermission:()=>!options.readonly},{panel:(...a)=>E('panel',{},a)});
 return {async render(){return module.controls();},calls,notes,nodes,check(label){return nodes.find(n=>n.attrs['aria-label']===label);},button(){return nodes.find(n=>n.tag==='button'&&n.children==='Apply service settings');}};
}
test('service checkboxes stage edits until explicit apply and then persist runtime and boot state',async()=>{
 const h=harness();await h.render();const run=h.check('Run Caddy'),boot=h.check('Start on boot');run.checked=boot.checked=true;run.events.change();boot.events.change();
 expect(h.calls.filter(x=>x[0]==='action')).toEqual([]);await h.button().click();
 expect(h.calls.filter(x=>x[0]==='action')).toEqual([['action','start'],['action','enable']]);expect(h.button().disabled).toBe(true);
});
test('failed start keeps requested checkboxes for retry and does not enable boot',async()=>{
 const h=harness({fail:'start'});await h.render();h.check('Run Caddy').checked=h.check('Start on boot').checked=true;h.check('Run Caddy').events.change();await h.button().click();
 expect(h.calls.filter(x=>x[0]==='action')).toEqual([['action','start']]);expect(h.notes.length).toBe(1);expect(h.check('Run Caddy').checked).toBe(true);expect(h.button().disabled).toBe(false);
});
test('unchecking running and boot stops and disables; unchanged state sends no action',async()=>{
 const h=harness({state:{running:true,enabled:true}});await h.render();expect(h.check('Run Caddy').checked).toBe(true);h.check('Run Caddy').checked=h.check('Start on boot').checked=false;h.check('Run Caddy').events.change();await h.button().click();await h.button().click();
 expect(h.calls.filter(x=>x[0]==='action')).toEqual([['action','stop'],['action','disable']]);
});
test('read-only and missing binary prevent service writes',async()=>{
 for(const options of [{readonly:true},{state:{installed:false}}]) {const h=harness(options);await h.render();expect(h.check('Run Caddy').disabled).toBe(true);h.check('Run Caddy').checked=true;await h.button().click();expect(h.calls.filter(x=>x[0]==='action')).toEqual([]);}
});
