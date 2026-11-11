import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
function harness(options={}) {
 const calls=[],nodes=[];let panel,changed=0,state={installed:true,running:false,enabled:false,...options.state};
 function E(tag,attrs={},children=[]) {const n={tag,attrs,children,checked:!!attrs.checked,disabled:!!attrs.disabled,events:{},addEventListener(k,f){this.events[k]=f;}};nodes.push(n);return n;}
 const rpc={declare({method}){return async(action,boot)=>{calls.push([method,action,boot]);if(method==='status')return {...state};if(options.fail)return {ok:false,error:'operation failed'};state.desired={running:action,enabled:boot};return {ok:true};};}};
 const module=new Function('baseclass','rpc','E','_','L','layout',readFileSync(new URL('../packages/luci-app-caddy/htdocs/luci-static/resources/caddy/service.js',import.meta.url),'utf8'))({extend:x=>x},rpc,E,s=>s,{hasViewPermission:()=>!options.readonly},{panel:(...a)=>E('panel',{},a)});
 return {async render(){panel=await module.controls(()=>changed++);},save(){return panel.serviceControls.save();},get pending(){return panel.serviceControls.pending();},get changed(){return changed;},calls,nodes,check(label){return nodes.find(n=>n.attrs['aria-label']===label);}};
}
test('service checkbox changes notify page without saving; shared save stages UCI only',async()=>{
 const h=harness();await h.render();h.check('Run Caddy').checked=true;h.check('Run Caddy').events.change();expect(h.changed).toBe(1);expect(h.pending).toBe(true);expect(h.calls.some(c=>c[0]==='service_save')).toBe(false);expect(h.nodes.some(n=>n.tag==='button')).toBe(false);
 await h.save();expect(h.calls.filter(c=>c[0]==='service_save')).toEqual([['service_save',true,false]]);expect(h.pending).toBe(false);
});
test('failed save retains checkbox edits for retry',async()=>{
 const h=harness({fail:true});await h.render();h.check('Start on boot').checked=true;await expect(h.save()).rejects.toThrow('operation failed');expect(h.pending).toBe(true);expect(h.check('Start on boot').disabled).toBe(false);
});
test('checkboxes reflect staged desired state independently of running state',async()=>{
 const h=harness({state:{running:true,enabled:true,desired:{running:false,enabled:false}}});await h.render();expect(h.check('Run Caddy').checked).toBe(false);expect(h.pending).toBe(false);await h.save();expect(h.calls.some(c=>c[0]==='service_save')).toBe(false);
});
test('readonly and missing binary prevent service writes',async()=>{
 for(const options of [{readonly:true},{state:{installed:false}}]){const h=harness(options);await h.render();expect(h.check('Run Caddy').disabled).toBe(true);h.check('Run Caddy').checked=true;await h.save();expect(h.calls.some(c=>c[0]==='service_save')).toBe(false);}
});
