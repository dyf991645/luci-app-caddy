'use strict';
'require ui';
'require dom';
'require baseclass';

// Editable array widget. Each row is a native Textfield, so both incremental
// validation and form.parse() inspect the same inputs that are saved.
var BackendList=ui.AbstractElement.extend({
 __init__:function(values,options) {this.values=Array.isArray(values)?values:values?[values]:[];this.options=options || {};this.rows=[];},
 render:function() {
  var self=this,rows=E('div',{'class':'caddy-backend-rows'});
  var root=E('div',{'id':this.options.id,'class':'caddy-backends'},[rows,E('button',{'type':'button','class':'cbi-button','disabled':this.options.disabled || null,'click':function(){self.addRow('');}},_('Add backend'))]);
  this.node=root;dom.bindClassInstance(root,this);this.rowsNode=rows;
  this.values.forEach(function(value){self.addRow(value);});
  if(!this.rows.length)this.addRow('');
  return root;
 },
 addRow:function(value) {
  var self=this,field=new ui.Textfield(value,{
   optional:false,datatype:'string',validate:this.options.validate,
   disabled:this.options.disabled,placeholder:'http://127.0.0.1:80'
  });
  var row={field:field};
  row.node=E('div',{'class':'caddy-backend-row'},[field.render(),E('button',{
   'type':'button','class':'cbi-button','disabled':this.options.disabled || null,'aria-label':_('Remove backend'),
   'click':function(){self.rows=self.rows.filter(function(other){return other!==row;});row.node.remove();self.changed();}
  },'×')]);
  this.rows.push(row);this.rowsNode.appendChild(row.node);
  this.changed();
 },
 changed:function(){this.node.dispatchEvent(new CustomEvent('change',{bubbles:true}));},
 getValue:function(){return this.rows.map(function(row){return row.field.getValue();});},
 isValid:function(){return this.rows.length>0 && this.rows.every(function(row){row.field.triggerValidation();return row.field.isValid();});},
 getValidationError:function(){var row=this.rows.find(function(row){return !row.field.isValid();});return row?row.field.getValidationError():_('Configure at least one backend');},
 triggerValidation:function(){return this.isValid();}
});

// LuCI instantiates module exports; keep widget construction behind a factory.
return baseclass.extend({create:function(values,options){return new BackendList(values,options);}});
