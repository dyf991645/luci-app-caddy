// Execute the target's unmodified Class and L.require implementation, using
// local resource transport and small DOM/Textfield adapters; no browser needed.
// Usage: bun tests/luci-loader-test.js /path/to/target/luci.js [backends.js]
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const runtime=readFileSync(process.argv[2],'utf8');
const framework=runtime.slice(runtime.indexOf('const toCamelCase ='),runtime.indexOf('const Headers ='));
const Class=new Function(framework+';return Class;')();
const loader=runtime.slice(runtime.indexOf('require(name, from = []) {'),runtime.indexOf('/* DOM setup */',runtime.indexOf('require(name, from = []) {')));
const moduleSource=readFileSync(process.argv[3] || new URL('../packages/luci-app-caddy/htdocs/luci-static/resources/caddy/backends.js',import.meta.url),'utf8');
function E(tag,attrs={},children=[]) {
 const node={tag,attrs,children:[],appendChild(child){this.children.push(child);child.parentNode=this;},dispatchEvent(){},remove(){this.parentNode.children=this.parentNode.children.filter(child=>child!==this);}};
 for(const child of Array.isArray(children)?children:[children])if(child&&typeof child==='object')node.appendChild(child);return node;
}
const ui={AbstractElement:Class.extend({}),Textfield:Class.extend({
 __init__(value,options){this.value=value;this.options=options;},render(){return E('div',{},E('input',{value:this.value}));},getValue(){return this.value;},triggerValidation(){},isValid(){return true;}
})};
const classes={baseclass:Class,ui,dom:{bindClassInstance(node,instance){node.instance=instance;}}};
const Request={get(url){return Promise.resolve({ok:true,url,text:()=>moduleSource});}};
const LuCI={prototype:{error(...args){throw Error(args.join(' '));},raise(...args){throw Error(args.join(' '));}}};
const originalFormat=String.prototype.format;
String.prototype.format=function(...args){let i=0;return this.replace(/%s/g,()=>String(args[i++]));};
try {
 Object.assign(LuCI.prototype,new Function('Class','classes','Request','LuCI','env','window','document','E','_','toCamelCase',`return {${loader}};`)(Class,classes,Request,LuCI,{base_url:'/resources'},{},{},E,x=>x,s=>s));
 const module=await LuCI.prototype.require('caddy.backends');
 assert.equal(typeof module,'object','L.require supplies an instance');
 assert.equal(typeof module.create,'function','instance exposes widget factory');
 const a=module.create(['http://127.0.0.1:80'],{}),b=module.create(['http://127.0.0.1:81'],{});
 assert.equal(a.render().instance,a,'widget binds to its native container');assert.deepEqual(a.getValue(),['http://127.0.0.1:80']);
 assert.notEqual(a,b);assert.equal(a.rows.length,1);assert.equal(b.rows.length,0,'factory owns isolated widget state');
 assert.equal(await LuCI.prototype.require('caddy.backends'),module,'native module cache reuses service instance');
 console.log('PASS target Class/L.require loads module, caches instance and creates independent editable backend widgets');
} finally {if(originalFormat)String.prototype.format=originalFormat;else delete String.prototype.format;}
