import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
function widget(values,disabled=false) {
 let changes=0;
 function E(tag,attrs={},children=[]) {
  const node={tag,attrs,children:[],value:'',appendChild(child){this.children.push(child);child.parentNode=this;},remove(){this.parentNode.children=this.parentNode.children.filter(n=>n!==this);},dispatchEvent(){changes++;}};
  (Array.isArray(children)?children:[children]).forEach(child=>{if(typeof child==='object')node.appendChild(child);});return node;
 }
 const ui={AbstractElement:{extend(methods){class Element {constructor(...args){methods.__init__.apply(this,args);}}Object.assign(Element.prototype,methods);return Element;}},Textfield:class {
  constructor(value,options){this.options=options;this.input=E('input',{disabled:options.disabled});this.input.value=value;}
  render(){return this.input;}getValue(){return this.input.value;}triggerValidation(){this.valid=this.input.value!==''&&this.options.validate(this.input.value)===true;}
  isValid(){return this.valid;}getValidationError(){return 'Invalid backend';}
 }};
 const source=readFileSync(new URL('../packages/luci-app-caddy/htdocs/luci-static/resources/caddy/backends.js',import.meta.url),'utf8');
 const Editor=new Function('ui','dom','E','_',source)(ui,{bindClassInstance(node,instance){node.instance=instance;}},E,x=>x);
 const editor=new Editor(values,{disabled,validate:value=>/^https?:\/\/[^/]+:\d+$/.test(value)});editor.render();return {editor,get changes(){return changes;}};
}
test('existing backends can be edited in place without a delete/add cycle',()=>{
 const {editor}=widget(['http://127.0.0.1:80','http://127.0.0.2:8080']);editor.rows[0].field.input.value='http://192.168.31.1:80';
 expect(editor.getValue()).toEqual(['http://192.168.31.1:80','http://127.0.0.2:8080']);expect(editor.isValid()).toBe(true);
});
test('add/remove preserves row order and emits changes; invalid/empty rows block save',()=>{
 const h=widget(['http://127.0.0.1:80']),{editor}=h;
 editor.node.children[1].attrs.click();expect(editor.getValue()).toEqual(['http://127.0.0.1:80','']);expect(editor.isValid()).toBe(false);
 editor.rows[1].field.input.value='https://router.home:443';expect(editor.isValid()).toBe(true);
 editor.rows[0].node.children[1].attrs.click();expect(editor.getValue()).toEqual(['https://router.home:443']);
 editor.rows[0].field.input.value='invalid';expect(editor.isValid()).toBe(false);expect(editor.getValidationError()).toBe('Invalid backend');
 editor.rows[0].node.children[1].attrs.click();expect(editor.isValid()).toBe(false);expect(h.changes).toBeGreaterThan(2);
});
test('read-only widgets disable editing, adding and removing; changing input does not mutate supplied values',()=>{
 const original=['http://127.0.0.1:80'],{editor}=widget(original,true);
 expect(editor.rows[0].field.input.attrs.disabled).toBe(true);expect(editor.rows[0].node.children[1].attrs.disabled).toBe(true);expect(editor.node.children[1].attrs.disabled).toBe(true);
 editor.rows[0].field.input.value='http://127.0.0.1:81';expect(original).toEqual(['http://127.0.0.1:80']);
});

test('a scalar new-site default renders as one editable backend',()=>{const {editor}=widget('http://127.0.0.1:8080');expect(editor.getValue()).toEqual(['http://127.0.0.1:8080']);expect(editor.isValid()).toBe(true);});
