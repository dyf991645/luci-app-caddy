import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
function widget(values=[],disabled=false){
 let changes=0;
 function E(tag,attrs={},children=[]){const node={tag,attrs,disabled:attrs.disabled!=null,children:[],value:attrs.value || '',appendChild(child){this.children.push(child);},replaceChildren(...children){this.children=children;},dispatchEvent(){changes++;}};node.children=Array.isArray(children)?children:[children];return node;}
 const ui={AbstractElement:{extend(methods){class Element{constructor(...args){methods.__init__.apply(this,args);}}Object.assign(Element.prototype,methods);return Element;}}};
 const baseclass={extend(methods){class Module{}Object.assign(Module.prototype,methods);return Module;}};
 const source=readFileSync(new URL('../packages/luci-app-caddy/htdocs/luci-static/resources/caddy/middlewares.js',import.meta.url),'utf8');
 const Export=new Function('ui','dom','baseclass','E','_',source)(ui,{bindClassInstance(){}},baseclass,E,x=>x);
 const editor=new Export().create(values,[{id:'headers'},{id:'dav'},{id:'auth'}],{disabled});editor.render();return {editor,get changes(){return changes;}};
}
test('middleware selector adds unique references and reorders/removes without mutating supplied values',()=>{
 const original=['headers','dav'],h=widget(original),e=h.editor;
 e.rows.children[1].children[1].children[0].attrs.click();expect(e.getValue()).toEqual(['dav','headers']);
 e.select.value='auth';e.add.attrs.click();expect(e.getValue()).toEqual(['dav','headers','auth']);expect(e.add.disabled).toBe(true);
 e.rows.children[1].children[1].children[2].attrs.click();expect(e.getValue()).toEqual(['dav','auth']);expect(e.select.value).toBe('headers');expect(original).toEqual(['headers','dav']);expect(h.changes).toBe(3);
});
test('middleware selector respects readonly/busy and recovers after saving',()=>{
 const {editor:e}=widget(['headers','dav'],true);expect(e.rows.children[0].children[1].children[1].disabled).toBe(true);e.rows.children[0].children[1].children[1].attrs.click();expect(e.getValue()).toEqual(['headers','dav']);
 e.setDisabled(false);expect(e.rows.children[0].children[1].children[1].disabled).toBe(false);e.rows.children[0].children[1].children[1].attrs.click();expect(e.getValue()).toEqual(['dav','headers']);expect(e.rows.children[0].children[1].children[0].disabled).toBe(true);
});
test('unknown middleware references fail validation while an empty list is valid',()=>{
 expect(widget(['missing']).editor.isValid()).toBe(false);expect(widget([]).editor.isValid()).toBe(true);
});
