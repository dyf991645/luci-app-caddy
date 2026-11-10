'use strict';
'require view';
'require rpc';
'require ui';
'require caddy.layout as layout';

var certificates = rpc.declare({object:'luci.caddy',method:'certificates',expect:{'':{}}});
function date(epoch) { return epoch == null ? _('Unknown') : new Date(epoch * 1000).toISOString(); }
function state(value) {
 return ({valid:_('Stored certificate is valid'),expired:_('Expired'),not_yet_valid:_('Not yet valid'),unknown:_('Unknown'),pending:_('Attempt started; outcome unknown'),issuer_error:_('Issuer error; final outcome unknown'),success:_('Success recorded in retained log'),stored_valid:_('Valid stored certificate'),stored_invalid:_('Stored certificate is not currently valid')})[value] || _('Unknown');
}
return view.extend({
 load:function() {return certificates();},
 render:function(initial) {
  var content=E('div',{'aria-live':'polite'}), refresh=E('button',{'class':'button cbi-button cbi-button-action','type':'button'},_('Refresh certificate evidence'));
  function update(data) {
   var children=[];
   if(!data.ok || !data.complete) children.push(E('p',{'class':'alert-message warning','role':'status'}, data.error || _('Inventory is incomplete or storage is unsupported. Missing certificates remain unknown.')));
   children.push(layout.row(_('Observed at'),date(data.observed_at)));
   children.push(E('p',{},_('Source: stored leaf certificates in the active filesystem storage. This does not verify the certificate served by a live connection. Renewal history is partial: only a bounded logd window and retained observations are available.')));
   (data.certificates||[]).forEach(function(cert) {
    var fields=[[_('Actual DNS coverage'),cert.domains.join(', ')||_('No DNS SAN evidence')],[_('Associated active sites'),cert.sites.join(', ')||_('None')],[_('Issuer'),cert.issuer],[_('Valid from (UTC)'),date(cert.not_before)],[_('Expires (UTC)'),date(cert.not_after)],[_('Certificate state'),state(cert.validity)+(cert.near_expiry?' · '+_('Near expiry'):'')],[_('SHA256 fingerprint'),cert.fingerprint]];
    children.push(layout.panel(cert.domains.join(', ')||_('Stored certificate'),'',fields.map(function(field){return layout.row(field[0],field[1]);})));
   });
   if(!(data.certificates||[]).length) children.push(E('p',{},_('No stored certificate was observed. Configuration and service startup do not prove issuance.')));
   children.push(E('h3',{},_('Active sites and issuance / renewal evidence')));
   (data.sites||[]).forEach(function(site) {
    var event=data.events && data.events[site.domain];
    children.push(layout.panel(site.domain,'',[layout.row(_('Certificate state'),state(site.state)),layout.row(_('Active sites and issuance / renewal evidence'),event?[event.operation==='renewal'?_('Renewal'):_('Issuance'),': ',state(event.state),' · ',date(event.observed_at)].join(''):_('Unknown')),event && event.error?layout.note(event.error):'']));
   });
   content.replaceChildren.apply(content,children);
  }
  refresh.addEventListener('click',function() {refresh.disabled=true;return certificates().then(update).catch(function() {ui.addNotification(null,E('p',{},_('Unable to read certificate evidence')),'error');}).finally(function() {refresh.disabled=false;});});
  update(initial);
  return layout.page('tls',_('Stored certificates'),_('Actual DNS coverage'),[layout.panel(_('Stored certificates'),'',content,refresh),E('a',{'class':'button','href':L.url('admin/services/caddy/tls')},_('TLS certificates'))]);

 },
 handleSave:null,handleSaveApply:null,handleReset:null
});
