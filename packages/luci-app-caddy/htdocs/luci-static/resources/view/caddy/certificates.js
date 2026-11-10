'use strict';
'require view';
'require rpc';
'require ui';

var certificates = rpc.declare({object:'luci.caddy',method:'certificates',expect:{'':{}}});
function date(epoch) { return epoch == null ? _('Unknown') : new Date(epoch * 1000).toISOString(); }
function state(value) {
 return ({valid:_('Stored certificate is valid'),expired:_('Expired'),not_yet_valid:_('Not yet valid'),unknown:_('Unknown'),pending:_('Attempt started; outcome unknown'),issuer_error:_('Issuer error; final outcome unknown'),success:_('Success recorded in retained log'),stored_valid:_('Valid stored certificate'),stored_invalid:_('Stored certificate is not currently valid')})[value] || _('Unknown');
}
return view.extend({
 load:function() {return certificates();},
 render:function(initial) {
  var content=E('div',{'aria-live':'polite'}), refresh=E('button',{'class':'cbi-button cbi-button-action','type':'button'},_('Refresh certificate evidence'));
  function update(data) {
   var children=[];
   if(!data.ok || !data.complete) children.push(E('p',{'class':'alert-message warning','role':'status'}, data.error || _('Inventory is incomplete or storage is unsupported. Missing certificates remain unknown.')));
   children.push(E('p',{},[_('Observed at'),': ',date(data.observed_at)]));
   children.push(E('p',{},_('Source: stored leaf certificates in the active filesystem storage. This does not verify the certificate served by a live connection. Renewal history is partial: only a bounded logd window and retained observations are available.')));
   (data.certificates||[]).forEach(function(cert) {
    var fields=[[_('Actual DNS coverage'),cert.domains.join(', ')||_('No DNS SAN evidence')],[_('Associated active sites'),cert.sites.join(', ')||_('None')],[_('Issuer'),cert.issuer],[_('Valid from (UTC)'),date(cert.not_before)],[_('Expires (UTC)'),date(cert.not_after)],[_('Certificate state'),state(cert.validity)+(cert.near_expiry?' · '+_('Near expiry'):'')],[_('SHA256 fingerprint'),cert.fingerprint]];
    children.push(E('section',{'class':'cbi-section'},[E('h3',{},cert.domains.join(', ')||_('Stored certificate')),E('dl',{},fields.flatMap(function(field) {return [E('dt',{},field[0]),E('dd',{'style':'overflow-wrap:anywhere; margin-bottom:0.75em'},field[1])];}))]));
   });
   if(!(data.certificates||[]).length) children.push(E('p',{},_('No stored certificate was observed. Configuration and service startup do not prove issuance.')));
   children.push(E('h3',{},_('Active sites and issuance / renewal evidence')));
   (data.sites||[]).forEach(function(site) {
    var event=data.events && data.events[site.domain];
    children.push(E('section',{'class':'cbi-section'},[E('h4',{},site.domain),E('p',{},state(site.state)),E('p',{},event?[event.operation==='renewal'?_('Renewal'):_('Issuance'),': ',state(event.state),' · ',date(event.observed_at)]:_('Issuance and renewal history: unknown')),event && event.error?E('p',{'class':'alert-message warning'},event.error):E('span')]));
   });
   content.replaceChildren.apply(content,children);
  }
  refresh.addEventListener('click',function() {refresh.disabled=true;return certificates().then(update).catch(function() {ui.addNotification(null,E('p',{},_('Unable to read certificate evidence')),'error');}).finally(function() {refresh.disabled=false;});});
  update(initial);
  return E('div',{'class':'cbi-map'},[E('h2',{},_('TLS certificates')),E('ul',{'class':'cbi-tabmenu'},[['',_('Overview')],['configuration',_('Configuration')],['tls',_('Verification settings')],['certificates',_('Stored certificates')],['diagnostics',_('Logs and diagnostics')]].map(function(tab) {return E('li',{'class':tab[0]==='certificates'?'cbi-tab':'cbi-tab-disabled'},E('a',{'href':L.url('admin/services/caddy'+(tab[0]?'/'+tab[0]:''))},tab[1]));})),E('p',{},E('a',{'href':L.url('admin/services/caddy/notifications')},_('Certificate alerts and webhook'))),content,refresh]);
 },
 handleSave:null,handleSaveApply:null,handleReset:null
});
