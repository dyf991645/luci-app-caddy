'use strict';
'require view';
'require rpc';
'require ui';
'require caddy.apply as caddyApply';
'require caddy.layout as layout';

var getDraft=rpc.declare({object:'luci.caddy',method:'draft_get',expect:{'':{}}});
var getCredentials=rpc.declare({object:'luci.caddy',method:'credential_status',expect:{'':{}}});
var saveDefault=rpc.declare({object:'luci.caddy',method:'tls_save',params:['default_challenge','expected_revision'],expect:{'':{}}});
var saveCredential=rpc.declare({object:'luci.caddy',method:'credential_save',params:['token','expected_revision'],expect:{'':{}}});
var apply=rpc.declare({object:'luci.caddy',method:'config_apply',params:['expected_revision'],expect:{'':{}}});
var getCertificates=rpc.declare({object:'luci.caddy',method:'certificates',expect:{'':{}}});
var getNotifications=rpc.declare({object:'luci.caddy',method:'notification_status',expect:{'':{}}});
var saveNotifications=rpc.declare({object:'luci.caddy',method:'notification_save',params:['enabled','url','headers','method','body_mode','body'],expect:{'':{}}});
function observed(epoch){return epoch==null?_('Unknown'):new Date(epoch*1000).toLocaleString();}
function checked(response){if(!response.ok)throw new Error(response.error || _('Operation failed'));return response;}
function certificateState(cert){return ({valid:cert.near_expiry?_('Near expiry'):_('Valid'),expired:_('Expired'),not_yet_valid:_('Not yet valid')})[cert.validity] || _('Unknown');}
function alertState(value){return ({expired:_('Expired'),near_expiry_observed_issues:_('Near expiry'),recovered:_('Recovered')})[value] || _('Unknown');}

return view.extend({
 load:function(){return Promise.all([getDraft(),getCredentials(),getCertificates(),getNotifications()]);},
 render:function(initial){
  var current=initial[0],credentials=initial[1],inventory=initial[2]||{},notifications=initial[3]||{};
  var busy=false,dirty=false,permission=L.hasViewPermission(),readonly=!permission || current.draft?.mode=='manual';
  var method=current.draft?.settings.default_challenge || 'http-01';
  var token=E('input',{id:'caddy-cf-token',type:'password',autocomplete:'new-password','class':'cbi-input-text',disabled:readonly || null,placeholder:_('Leave blank to keep the saved token')});
  var credentialStatus=E('span',{'class':'muted'});
  var methodHelp=E('p',{'class':'hint'});
  var help={'http-01':_('Requires public port 80.'),'dns-01':_('Uses Cloudflare; supports wildcard domains.'),'tls-alpn-01':_('Requires public port 443 to reach Caddy directly.')};
  var descriptions={'http-01':_('Public port 80'),'dns-01':_('Cloudflare DNS'),'tls-alpn-01':_('Public port 443')};
  var radios=['http-01','dns-01','tls-alpn-01'].map(function(value){
   var input=E('input',{type:'radio',name:'default-challenge',value:value,disabled:readonly || null});
   input.checked=method===value;input.addEventListener('change',function(){method=value;dirty=true;update();});return input;
  });
  var choices=E('div',{'class':'choice-grid'},radios.map(function(input){return E('label',{'class':'choice'},[E('div',{},[input,E('strong',{},input.value.toUpperCase())]),E('small',{},descriptions[input.value])]);}));
  var save=E('button',{'class':'button cbi-button cbi-button-save',click:function(){return perform(false);}},_('Save'));
  var activate=E('button',{'class':'button primary cbi-button cbi-button-apply',click:function(){return perform(true);}},_('Save & Apply'));
  function update(){
   methodHelp.textContent=help[method];
   credentialStatus.textContent=credentials.configured?_('Configured'):_('Not configured');
   save.disabled=readonly || busy || !dirty || !current.draft;
   activate.disabled=readonly || busy || (!dirty && !current.pending) || !current.draft;
   token.disabled=readonly || busy;
   radios.forEach(function(input){input.disabled=readonly || busy;input.checked=input.value===method;});
  }
  function refreshDraft(){return Promise.all([getDraft(),getCredentials()]).then(function(data){current=data[0];credentials=data[1];update();});}
  function perform(wantApply){
   busy=true;update();
   return (dirty?saveDefault(method,current.draft_revision).then(checked).then(function(saved){current=saved;}):Promise.resolve())
    .then(function(){if(!token.value)return;var value=token.value;return saveCredential(value,current.draft_revision).then(checked).then(function(saved){token.value='';current=saved;});})
    .then(function(){dirty=false;return wantApply?caddyApply.confirmImpact(current).then(function(){return apply(current.draft_revision);}).then(checked).then(function(saved){current=saved;}):null;})
    .catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');})
    .finally(function(){return refreshDraft().finally(function(){busy=false;update();caddyApply.refreshChanges();});});
  }
  token.addEventListener('input',function(){dirty=true;update();});
  window.addEventListener('beforeunload',function(event){if(dirty){event.preventDefault();event.returnValue='';}});

  function closeButton(){return E('button',{'class':'button cbi-button',click:function(){ui.hideModal();}},_('Close'));}
  function modal(title,content,buttons){ui.showModal(title,[E('div',{'class':'caddy-app caddy-tls-modal'},content),E('div',{'class':'right'},buttons || [closeButton()])]);}
  function certificateDetails(cert){
   modal(_('Certificate details'),[
    layout.row(_('Domains'),(cert.domains||[]).join(', ')),layout.row(_('Associated active sites'),(cert.sites||[]).join(', ') || _('None')),
    layout.row(_('Issuer'),cert.issuer || _('Unknown')),layout.row(_('Valid from'),observed(cert.not_before)),layout.row(_('Expires'),observed(cert.not_after)),
    layout.row(_('Certificate state'),certificateState(cert)),layout.row(_('SHA256 fingerprint'),cert.fingerprint || _('Unknown'))
   ]);
  }
  var certificateBody=E('div',{'aria-live':'polite'}),notificationBody=E('div',{'aria-live':'polite'});
  function renderCertificates(){
   var children=[];
   if(inventory.ok===false || inventory.complete===false)children.push(layout.note(inventory.error || _('Certificate scan is incomplete.')));
   if(!(inventory.certificates||[]).length)children.push(E('p',{'class':'muted'},_('No stored certificates.')));
   else children.push(E('div',{'class':'tls-certificate-table'},E('table',{'class':'table'},[
    E('thead',{},E('tr',{},[_('Domains'),_('Issuer'),_('Expires'),_('Status'),_('Actions')].map(function(title){return E('th',{},title);}))),
    E('tbody',{},inventory.certificates.map(function(cert){return E('tr',{},[
     E('td',{},(cert.domains||[]).join(', ') || _('Unknown')),E('td',{},cert.issuer || _('Unknown')),E('td',{},observed(cert.not_after)),
     E('td',{},layout.badge(certificateState(cert),cert.validity=='valid'&&!cert.near_expiry?'':'amber')),
     E('td',{},E('button',{'class':'button small',click:function(){certificateDetails(cert);}},_('Details')))
    ]);}))
   ])));
   certificateBody.replaceChildren.apply(certificateBody,children);
  }
  function renderNotifications(){
   var children=[layout.row(_('Webhook'),notifications.ok?(notifications.webhook?.enabled?_('Enabled'):_('Disabled')):_('Unknown')),
    layout.row(_('Last background check'),observed(notifications.last_check))];
   if(notifications.ok===false)children.push(layout.note(notifications.error || _('Notification state unavailable')));
   (notifications.alerts||[]).forEach(function(alert){children.push(layout.row((alert.domains||[]).join(', '),alertState(alert.phase)));});
   if(notifications.ok && !(notifications.alerts||[]).length)children.push(E('p',{'class':'muted'},_('No certificate alerts.')));
   notificationBody.replaceChildren.apply(notificationBody,children);
  }
  function notificationSettings(){
   var saving=false,enabled=E('input',{id:'tls-notify-enabled',type:'checkbox',disabled:!permission || null});enabled.checked=!!notifications.webhook?.enabled;
   var url=E('input',{id:'tls-notify-url',type:'password',autocomplete:'new-password',disabled:!permission || null,placeholder:notifications.webhook?.configured?_('Leave blank to retain private target'):'https://…'});
   var headers=E('textarea',{id:'tls-notify-headers',rows:3,autocomplete:'off',disabled:!permission || null,placeholder:'{"Authorization":"Bearer …"}'});
   var requestMethod=E('select',{id:'tls-notify-method'},['POST','GET','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(function(value){return E('option',{value:value},value);}));
   requestMethod.value=notifications.webhook?.method || 'POST';
   var bodyMode=E('select',{id:'tls-notify-body-mode'},[['default',_('Default notification')],['none',_('No body')],['custom',_('Custom body')]].map(function(item){return E('option',{value:item[0]},item[1]);}));
   bodyMode.value=notifications.webhook?.body_mode || 'default';
   var body=E('textarea',{id:'tls-notify-body',rows:5,autocomplete:'off',placeholder:notifications.webhook?.body_configured?_('Leave blank to retain the saved body'):'{"text":"{{summary}}","domains":"{{domains}}"}'});
   var modeRow=E('div',{'class':'tls-form-row'},[E('label',{for:'tls-notify-body-mode'},_('Request body')),bodyMode]);
   var bodyRow=E('div',{'class':'tls-form-row'},[E('label',{for:'tls-notify-body'},_('Body template')),E('div',{},[body,E('details',{},[E('summary',{},_('Available variables')),E('table',{'class':'table'},[
    E('thead',{},E('tr',{},[E('th',{},_('Variable')),E('th',{},_('Description'))])),
    E('tbody',{},[
     ['summary',_('Notification summary.')],
     ['domains',_('Certificate domain names. A whole JSON value becomes an array; embedded values use comma-separated text.')],
     ['expires_at',_('Certificate expiry in UTC, for example 2026-12-01T12:00:00Z.')],
     ['type',_('Event type: expired, near_expiry_observed_issues, or recovered.')],
     ['event_id',_('Unique event ID. Retries keep the same ID for deduplication.')],
     ['not_after',_('Certificate expiry as a Unix timestamp in seconds.')],
     ['observed_at',_('Time the event was first recorded, as a Unix timestamp in seconds.')]
    ].map(function(item){return E('tr',{},[E('td',{},E('code',{},'{{'+item[0]+'}}')),E('td',{},item[1])]);}))
   ]),E('p',{'class':'hint'},_('Put variables in JSON string values. A whole timestamp variable becomes a number; embedded variables become text.'))])])]);
   function updateFields(){
    var noBody=requestMethod.value=='GET' || requestMethod.value=='HEAD';
    modeRow.hidden=noBody;bodyRow.hidden=noBody || bodyMode.value!='custom';
    requestMethod.disabled=bodyMode.disabled=saving || !permission;
    body.disabled=saving || !permission || noBody || bodyMode.value!='custom';
   }
   requestMethod.addEventListener('change',updateFields);bodyMode.addEventListener('change',updateFields);updateFields();
   var feedback=E('p',{role:'status','aria-live':'polite'});
   var cancel=E('button',{'class':'button cbi-button',click:function(){if(!saving)ui.hideModal();}},_('Cancel'));
   var submit=E('button',{'class':'button primary cbi-button cbi-button-save',disabled:!permission || null,click:function(){
    if(saving || !permission)return Promise.resolve();
    var values={};try{if(headers.value.trim())values=JSON.parse(headers.value);}catch(e){feedback.textContent=_('Headers must be a JSON object.');return Promise.resolve();}
    saving=true;submit.disabled=cancel.disabled=enabled.disabled=url.disabled=headers.disabled=true;updateFields();
    return saveNotifications(enabled.checked,url.value,values,requestMethod.value,bodyMode.value,body.value).then(checked).then(function(data){
     notifications=data;url.value='';headers.value='';body.value='';renderNotifications();ui.hideModal();
     return Promise.all([refreshDraft(),caddyApply.refreshChanges()]);
    }).catch(function(error){feedback.textContent=error.message;}).finally(function(){saving=false;cancel.disabled=false;submit.disabled=enabled.disabled=url.disabled=headers.disabled=!permission;updateFields();});
   }},_('Save'));
   modal(_('Notification settings'),[
    E('div',{'class':'tls-form-row'},[E('label',{for:'tls-notify-enabled'},_('Enable webhook')),enabled]),
    E('div',{'class':'tls-form-row'},[E('label',{for:'tls-notify-url'},_('Webhook URL')),url]),
    E('div',{'class':'tls-form-row'},[E('label',{for:'tls-notify-method'},_('HTTP method')),requestMethod]),
    E('div',{'class':'tls-form-row'},[E('label',{for:'tls-notify-headers'},_('Request headers')),headers]),modeRow,bodyRow,feedback
   ],[cancel,' ',submit]);
  }
  function notificationHistory(){
   var children=[];
   (notifications.deliveries||[]).forEach(function(event){
    var delivery=({pending:_('Pending'),sent:_('Sent'),exhausted:_('Failed'),disabled:_('Disabled')})[event.delivery] || _('Unknown');
    children.push(layout.row(alertState(event.type),delivery+' · '+_('Attempts')+': '+event.attempts+'/3'));
   });
   modal(_('Notification history'),children.length?children:[E('p',{},_('No notification history.'))]);
  }
  var refresh=E('button',{'class':'button',click:function(){
   refresh.disabled=true;
   return Promise.all([getCertificates(),getNotifications()]).then(function(data){inventory=data[0];notifications=data[1];renderCertificates();renderNotifications();})
    .catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');}).finally(function(){refresh.disabled=false;});
  }},_('Refresh'));
  renderCertificates();renderNotifications();update();
  return layout.page('tls',_('TLS certificates'),'',[
   current.draft?.mode=='manual'?layout.note(_('TLS settings are managed by the Caddyfile.')):'',
   !current.draft?layout.note(_('Save a site configuration first.')):'',
   layout.panel(_('Default verification method'),'',[
    choices,methodHelp
   ]),
   layout.panel(_('Cloudflare DNS credentials'),'',[
    E('div',{'class':'tls-form-row'},[E('label',{for:'caddy-cf-token'},_('API Token')),E('div',{},[token,credentialStatus])]),
    E('p',{'class':'hint'},_('Requires Zone DNS Edit and Zone Read for the selected zones.'))
   ]),
   layout.panel(_('Certificate notifications'),'',notificationBody,[
    E('button',{'class':'button',click:notificationSettings},_('Configure')),
    E('button',{'class':'button',click:notificationHistory},_('History'))
   ]),
   E('div',{'class':'apply-bar'},[E('div',{'class':'actions'},[save,activate])]),
   layout.panel(_('Stored certificates'),'',certificateBody,refresh)
  ]);
 },handleSave:null,handleSaveApply:null,handleReset:null
});
