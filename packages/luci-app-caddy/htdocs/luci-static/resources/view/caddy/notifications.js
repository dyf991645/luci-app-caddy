'use strict';
'require view';
'require rpc';
'require ui';
var status=rpc.declare({object:'luci.caddy',method:'notification_status',expect:{'':{}}});
var save=rpc.declare({object:'luci.caddy',method:'notification_save',params:['enabled','url','headers'],expect:{'':{}}});
function phase(value) {return ({expired:_('Stored certificate expired'),near_expiry_observed_issues:_('Near expiry with repeated issuer issues; final attempt outcomes unknown'),recovered:_('Valid replacement observed')})[value]||_('Unknown');}
return view.extend({
 load:function() {return status();},
 render:function(initial) {
  var enabled=E('input',{type:'checkbox',id:'notify-enabled'}),url=E('input',{type:'password',id:'notify-url',autocomplete:'new-password',placeholder:_('Leave blank to retain private target')}),headers=E('textarea',{id:'notify-headers',rows:3,autocomplete:'off',placeholder:'{"Authorization":"Bearer …"}'}),alerts=E('div',{'aria-live':'polite'}),feedback=E('p',{role:'status'}),button=E('button',{type:'button','class':'cbi-button cbi-button-save'},_('Save notification settings'));
  function update(data) {
   enabled.checked=!!data.webhook?.enabled;
   var children=[E('p',{},data.ok?_(data.webhook?.configured?'A private webhook target is configured.':'No webhook target configured.'):data.error||_('Notification state unavailable')),E('p',{},_('Last background check')+': '+(data.last_check?new Date(data.last_check*1000).toISOString():_('Not yet observed')))];
   (data.alerts||[]).forEach(function(a) {children.push(E('section',{'class':'cbi-section'},[E('h3',{},a.domains.join(', ')),E('p',{'class':a.phase==='recovered'?'alert-message success':'alert-message warning'},phase(a.phase)),E('p',{},_('Episode')+': '+a.episode_id)]));});
   if(!(data.alerts||[]).length)children.push(E('p',{},_('No retained certificate alerts. Missing evidence remains unknown.')));
   (data.deliveries||[]).forEach(function(e) {children.push(E('p',{},e.event_id+' · '+e.delivery+' · '+_('Attempts')+': '+e.attempts+'/3'));});
   alerts.replaceChildren.apply(alerts,children);
  }
  button.addEventListener('click',function() {
   var h={};try {if(headers.value.trim())h=JSON.parse(headers.value);}catch(e){feedback.textContent=_('Headers must be a JSON object.');headers.focus();return;}
   button.disabled=true;feedback.textContent=_('Saving…');
   save(enabled.checked,url.value,h).then(function(data) {if(!data.ok)throw Error(data.error);url.value='';headers.value='';update(data);feedback.textContent=_('Notification settings saved.');}).catch(function(e){feedback.textContent=e.message||_('Unable to save notification settings');}).finally(function(){button.disabled=false;});
  });
  update(initial);
  var refresh=E('button',{type:'button','class':'cbi-button'},_('Refresh background status'));
  refresh.addEventListener('click',function(){refresh.disabled=true;status().then(update).finally(function(){refresh.disabled=false;});});
  return E('div',{'class':'cbi-map'},[E('h2',{},_('Certificate alerts and webhook')),E('p',{},_('Background monitoring runs independently of LuCI and the Caddy service, including complete Caddyfile mode. Expiry uses actual stored PEM. Renewal history is partial. Near expiry requires distinct repeated observed renewal issues; issuer errors do not prove terminal failure.')),alerts,E('section',{'class':'cbi-section'},[E('h3',{},_('Optional webhook')),E('label',{for:'notify-enabled'},[enabled,' '+_('Enable external notification (off by default)')]),E('p',{},[E('label',{for:'notify-url'},_('Private HTTP or HTTPS webhook URL')),url]),E('p',{},[E('label',{for:'notify-headers'},_('Private headers (JSON object)')),headers]),E('p',{},_('URL, query and headers are write-only. Blank fields retain existing values; changing the target clears old headers unless new headers are supplied. Requests never follow redirects. Delivery has a timeout and a persistent three-attempt budget. Event IDs remain stable across restart; receivers should deduplicate retries.')),feedback,button,refresh])]);
 },handleSave:null,handleSaveApply:null,handleReset:null
});
