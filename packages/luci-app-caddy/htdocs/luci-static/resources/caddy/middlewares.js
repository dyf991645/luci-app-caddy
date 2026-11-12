'use strict';
'require ui';
'require dom';
'require baseclass';

var OrderedMiddlewares=ui.AbstractElement.extend({
 __init__:function(values,catalog,options){this.values=Array.isArray(values)?values.slice():[];this.catalog=catalog || [];this.options=options || {};},
 render:function(){
  var self=this;
  this.rows=E('div',{'class':'caddy-middleware-order','role':'list'});
  this.select=E('select',{'aria-label':_('Select middleware'),'disabled':this.options.disabled || null},[]);
  this.add=E('button',{'type':'button','class':'cbi-button','disabled':this.options.disabled || null,'click':function(){var id=self.select.value;if(self.options.disabled || !id || self.values.includes(id))return;self.values.push(id);self.refresh();self.changed();}},_('Add middleware'));
  this.node=E('div',{'id':this.options.id,'class':'caddy-middlewares'},[this.rows,E('div',{'class':'actions'},[this.select,this.add])]);
  dom.bindClassInstance(this.node,this);this.refresh();return this.node;
 },
 refresh:function(){
  var self=this;
  this.rows.replaceChildren();
  this.values.forEach(function(id,index){
   var disabled=self.options.disabled;
   function button(label,fn,blocked){return E('button',{'type':'button','class':'cbi-button','aria-label':label+' '+id,'disabled':disabled || blocked || null,'click':function(){if(self.options.disabled || blocked)return;fn();self.refresh();self.changed();}},label);}
   self.rows.appendChild(E('div',{'class':'caddy-middleware-row','role':'listitem'},[
    E('span',{'class':'mono'},(index+1)+'. '+id),E('div',{'class':'actions'},[
     button(_('Move up'),function(){[self.values[index-1],self.values[index]]=[self.values[index],self.values[index-1]];},index===0),
     button(_('Move down'),function(){[self.values[index+1],self.values[index]]=[self.values[index],self.values[index+1]];},index===self.values.length-1),
     button(_('Remove'),function(){self.values.splice(index,1);},false)
    ])
   ]));
  });
  if(!this.values.length)this.rows.appendChild(E('p',{'class':'hint'},_('No middlewares selected')));
  var available=this.catalog.filter(function(m){return !self.values.includes(m.id);});
  this.select.replaceChildren.apply(this.select,available.map(function(m){return E('option',{'value':m.id},m.id);}));
  this.select.value=available[0]?.id || '';this.select.disabled=!!this.options.disabled || !available.length;this.add.disabled=this.select.disabled;
 },
 changed:function(){if(this.options.onChange)this.options.onChange(this.getValue());this.node.dispatchEvent(new CustomEvent('change',{bubbles:true}));},
 setDisabled:function(value){this.options.disabled=!!value;this.refresh();},
 getValue:function(){return this.values.slice();},
 isValid:function(){return new Set(this.values).size===this.values.length && this.values.every(id=>this.catalog.some(m=>m.id===id));},
 getValidationError:function(){return _('Referenced middleware does not exist');},
 triggerValidation:function(){return this.isValid();}
});
return baseclass.extend({create:function(values,catalog,options){return new OrderedMiddlewares(values,catalog,options);}});
