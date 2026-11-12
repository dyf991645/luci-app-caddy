'use strict';
'require view';
'require rpc';
'require ui';
'require caddy.apply as caddyApply';
'require caddy.layout as layout';

var getDraft=rpc.declare({object:'luci.caddy',method:'draft_edit',expect:{'':{}}});
var readDraft=rpc.declare({object:'luci.caddy',method:'draft_get',expect:{'':{}}});
var saveDraft=rpc.declare({object:'luci.caddy',method:'draft_save',params:['config','expected_revision'],expect:{'':{}}});
var apply=rpc.declare({object:'luci.caddy',method:'config_apply',params:['expected_revision'],expect:{'':{}}});

return view.extend({
 load:function(){return L.hasViewPermission()?getDraft():readDraft();},
 render:function(initial){
  var current=initial,config=JSON.parse(JSON.stringify(initial.draft || {version:2,settings:{http_port:18080,https_port:18443,email:'',storage:'/etc/caddy/data'},sites:[]}));
  var busy=false,dirty=false,readonly=!L.hasViewPermission() || config.mode=='manual',lists={global_middlewares:E('tbody'),middlewares:E('tbody')},buttons=[];
  var status=E('p',{'role':'status','aria-live':'polite'}),saveButton,applyButton;
  function catalog(scope){return config[scope] || [];}
  function notify(error){ui.addNotification(null,E('p',{},error.message || String(error)),'error');}
  function result(response){if(!response.ok)throw new Error((response.error || _('Configuration operation failed'))+(response.diagnostic?.line?' · '+(response.diagnostic.middleware || _('Snippet'))+' '+_('Line')+' '+response.diagnostic.line:''));return response;}
  function references(id){return (config.sites || []).filter(function(site){return (site.middlewares || []).includes(id);}).map(function(site){return site.domain;});}
  function update(){saveButton.disabled=busy || readonly || !dirty;applyButton.disabled=busy || !L.hasViewPermission() || (!dirty && !current.pending);buttons.forEach(function(button){button.disabled=busy || readonly;});status.textContent=dirty?_('Unsaved edits'):current.pending?_('Saved changes pending application'):_('Configuration applied');}
  function drawRows(){
   Object.keys(lists).forEach(function(scope){
    var global=scope==='global_middlewares',list=lists[scope];list.replaceChildren();
    catalog(scope).forEach(function(m,index){
     var used=global?[]:references(m.id),blocked=used.length>0;
     var actions=[E('button',{'type':'button','class':'cbi-button','disabled':busy || readonly || null,'aria-label':_('Edit')+' '+m.id,'click':function(){edit(scope,m);}},_('Edit'))];
     if(global)[[-1,_('Move up')],[1,_('Move down')]].forEach(function(direction){
      var target=index+direction[0],disabled=target<0 || target>=catalog(scope).length;
      actions.push(E('button',{'type':'button','class':'cbi-button','aria-label':direction[1]+' '+m.id,'disabled':busy || readonly || disabled || null,'click':function(){if(busy || readonly || disabled)return;var items=catalog(scope);[items[index],items[target]]=[items[target],items[index]];dirty=true;drawRows();update();}},direction[1]));
     });
     actions.push(E('button',{'type':'button','class':'cbi-button','disabled':busy || readonly || blocked || null,'title':blocked?_('Remove references before deleting this middleware'):'','aria-label':_('Delete')+' '+m.id,'click':function(){if(busy || readonly || blocked)return;config[scope]=catalog(scope).filter(function(other){return other.id!==m.id;});dirty=true;drawRows();update();}},_('Delete')));
     var cells=[E('td',{'class':'mono'},m.id)];
     if(!global)cells.push(E('td',{},E('button',{'type':'button','class':'cbi-button','click':function(){ui.showModal(_('Referenced sites'),[E('div',{'class':'caddy-app'},[used.length?E('ul',{},used.map(function(domain){return E('li',{},domain);})):E('p',{},_('No sites reference this middleware')),E('div',{'class':'actions'},[E('button',{'class':'cbi-button','click':ui.hideModal},_('Close'))])])]);}},String(used.length))));
     cells.push(E('td',{},E('div',{'class':'actions'},actions)));list.appendChild(E('tr',{},cells));
    });
    if(!catalog(scope).length)list.appendChild(E('tr',{},E('td',{'colspan':global?2:3,'class':'empty'},_('No middlewares configured'))));
   });
  }
  function setBusy(value){busy=value;drawRows();update();}
  function persist(candidate){
   return saveDraft(candidate,current.draft_revision).then(result).then(function(saved){current=saved;config=JSON.parse(JSON.stringify(candidate));dirty=false;drawRows();update();caddyApply.refreshChanges();return saved;});
  }
  function edit(scope,existing){
   if(busy || readonly)return;
   var id=E('input',{'id':'caddy-middleware-id','type':'text','value':existing?.id || '','disabled':!!existing || null,'placeholder':'security_headers'});
   var snippet=E('textarea',{'id':'caddy-middleware-snippet','rows':12,'spellcheck':'false'},existing?.snippet || '');
   var error=E('p',{'role':'alert'}),cancel=E('button',{'type':'button','class':'cbi-button','click':function(){if(!busy)ui.hideModal();}},_('Cancel'));
   var save=E('button',{'type':'button','class':'cbi-button cbi-button-save','click':function(){
    if(busy)return;
    var key=id.value.trim();
    if(!/^[a-z][a-z0-9_]{0,63}$/.test(key) || ['config','auth','service','notifications'].includes(key)){error.textContent=_('Use an identifier starting with a lowercase letter, followed by lowercase letters, digits or underscores');return;}
    if(!existing && catalog(scope).some(function(m){return m.id===key;})){error.textContent=_('Duplicate middleware identifier');return;}
    if(!snippet.value.trim()){error.textContent=_('Enter a Caddyfile snippet');return;}
    var candidate=JSON.parse(JSON.stringify(config));candidate[scope]=existing?catalog(scope).map(function(m){return m.id===key?{id:key,snippet:snippet.value}:m;}):catalog(scope).concat([{id:key,snippet:snippet.value}]);
    setBusy(true);save.disabled=true;cancel.disabled=true;snippet.disabled=true;
    return persist(candidate).then(function(){ui.hideModal();}).catch(function(e){error.textContent=e.message;}).finally(function(){setBusy(false);save.disabled=false;cancel.disabled=false;snippet.disabled=false;});
   }},_('Save'));
   ui.showModal(existing?_('Edit middleware'):scope==='global_middlewares'?_('Add global middleware'):_('Add middleware'),[E('div',{'class':'caddy-app middleware-fields'},[
    E('div',{'class':'field'},[E('label',{'for':'caddy-middleware-id'},_('Identifier')),id]),
    E('div',{'class':'field'},[E('label',{'for':'caddy-middleware-snippet'},_('Caddyfile snippet')),snippet]),error,E('div',{'class':'actions'},[cancel,save])
   ])]);
  }
  function perform(wantApply){
   if(busy || !L.hasViewPermission())return Promise.resolve();setBusy(true);
   return (dirty?persist(config):Promise.resolve()).then(function(){return wantApply?caddyApply.confirmImpact(current).then(function(){return apply(current.draft_revision);}).then(result).then(function(active){current=active;}):null;}).catch(notify).finally(function(){setBusy(false);caddyApply.refreshChanges();});
  }
  saveButton=E('button',{'class':'cbi-button cbi-button-save','click':function(){return perform(false);}},_('Save'));
  applyButton=E('button',{'class':'cbi-button cbi-button-apply','click':function(){return perform(true);}},_('Save & Apply'));
  var panels=Object.keys(lists).map(function(scope){var global=scope==='global_middlewares';var add=E('button',{'type':'button','class':'cbi-button cbi-button-add','click':function(){edit(scope);}},global?_('Add global middleware'):_('Add middleware'));buttons.push(add);
   return layout.panel(global?_('Global middlewares'):_('Site middlewares'),global?_('Applied in order to all inheriting sites; configured separately from site middlewares.'):_('Only these definitions can be selected by individual sites.'),E('div',{'class':'table-wrap'},E('table',{},[E('thead',{},E('tr',{},[E('th',{},_('Identifier')),...(global?[]:[E('th',{},_('Referenced sites'))]),E('th',{},_('Actions'))])),lists[scope]])),[add]);
  });
  var page=layout.page('middlewares',_('Middlewares'),'',[
   readonly?E('p',{'class':'info-note'},config.mode=='manual'?_('Form configuration is read-only in Caddyfile mode'):_('Read only')):'',...panels,
   E('div',{'class':'apply-bar'},[status,E('div',{'class':'actions'},[saveButton,applyButton])])
  ]);
  window.addEventListener('beforeunload',function(event){if(dirty){event.preventDefault();event.returnValue='';}});drawRows();update();return page;
 },
 handleSave:null,handleSaveApply:null,handleReset:null
});
