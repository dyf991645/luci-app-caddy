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
function observed(epoch){return epoch==null?_('Unknown'):new Date(epoch*1000).toISOString();}

return view.extend({
	load:function(){return Promise.all([getDraft(),getCredentials(),getCertificates(),getNotifications()]);},
	render:function(initial){
		var current=initial[0], credentials=initial[1], busy=false, dirty=false, readonly=!L.hasViewPermission() || initial[0].draft && initial[0].draft.mode=='manual';
		var method=current.draft && current.draft.settings.default_challenge || 'http-01';
		var token=E('input',{'id':'caddy-cf-token','type':'password','autocomplete':'new-password','class':'cbi-input-text','disabled':readonly,'placeholder':_('Enter a new token to replace the saved credential')});
		var status=E('p',{'role':'status','aria-live':'polite'}), credentialStatus=E('p');
		var descriptions={'http-01':_('Public port 80'),'dns-01':_('Cloudflare DNS'),'tls-alpn-01':_('Public port 443')};
		var radios=['http-01','dns-01','tls-alpn-01'].map(function(value){var input=E('input',{'type':'radio','name':'default-challenge','value':value,'disabled':readonly});input.checked=method===value;input.addEventListener('change',function(){method=value;dirty=true;update();});return input;});
		var choices=E('div',{'class':'choice-grid'},radios.map(function(input){return E('label',{'class':'choice'},[E('div',{},[input,E('strong',{'class':'mono'},input.value.toUpperCase())]),E('small',{},descriptions[input.value])]);}));
		var save=E('button',{'class':'button cbi-button cbi-button-save','click':function(){return perform(false);}},_('Save'));
		var activate=E('button',{'class':'button primary cbi-button cbi-button-apply','click':function(){return perform(true);}},_('Save & Apply'));
		function update(){
			status.textContent=_('Draft revision')+': '+current.draft_revision+' · '+_('Active revision')+': '+current.active_revision+(current.pending?' · '+_('Pending application'):'');
			credentialStatus.textContent=_('Saved credential revision')+': '+(credentials.draft_revision || _('Not configured'))+' · '+_('Active credential revision')+': '+(credentials.active_revision || _('None'));
			save.disabled=readonly || busy || !dirty || !current.draft;
			activate.disabled=readonly || busy || (!dirty && !current.pending) || !current.draft;
			token.disabled=readonly || busy;
			radios.forEach(function(input){input.disabled=readonly || busy;input.checked=input.value===method;});
		}
		function checked(response){if(!response.ok)throw new Error(response.error || _('Operation failed'));return response;}
		function perform(wantApply){
			busy=true;update();
			return (dirty?saveDefault(method,current.draft_revision).then(checked).then(function(saved){current=saved;}):Promise.resolve())
				.then(function(){if(!token.value)return;var value=token.value;token.value='';return saveCredential(value,current.draft_revision).then(checked).then(function(saved){current=saved;});})
				.then(function(){dirty=false;return wantApply?caddyApply.confirmImpact(current).then(function(){return apply(current.draft_revision);}).then(checked).then(function(saved){current=saved;}):null;})
				.catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');})
				.finally(function(){return Promise.all([getDraft(),getCredentials()]).then(function(data){current=data[0];credentials=data[1];busy=false;update();});});
		}
		token.addEventListener('input',function(){dirty=true;update();});
		window.addEventListener('beforeunload',function(event){if(dirty){event.preventDefault();event.returnValue='';}});
		update();
		var inventory=initial[2] || {}, notifications=initial[3] || {};
		var certificateBody=[layout.row(_('Observed at'),observed(inventory.observed_at)),layout.note(_('Source: stored leaf certificates in the active filesystem storage. This does not verify the certificate served by a live connection. Renewal history is partial: only a bounded logd window and retained observations are available.'))];
		if(!inventory.ok || !inventory.complete)certificateBody.push(layout.note(inventory.error || _('Inventory is incomplete or storage is unsupported. Missing certificates remain unknown.')));
		(inventory.certificates || []).forEach(function(cert){certificateBody.push(layout.panel((cert.domains || []).join(', ') || _('Stored certificate'),'',[
			layout.row(_('Actual DNS coverage'),(cert.domains || []).join(', ') || _('No DNS SAN evidence')),
			layout.row(_('Associated active sites'),(cert.sites || []).join(', ') || _('None')),
			layout.row(_('Issuer'),cert.issuer || _('Unknown')),
			layout.row(_('Valid from (UTC)'),observed(cert.not_before)),layout.row(_('Expires (UTC)'),observed(cert.not_after)),
			layout.row(_('Certificate state'),({valid:_('Stored certificate is valid'),expired:_('Expired'),not_yet_valid:_('Not yet valid')})[cert.validity] || _('Unknown')),
			cert.near_expiry?layout.note(_('Near expiry')):'',layout.row(_('SHA256 fingerprint'),cert.fingerprint || _('Unknown'))
		]));});
		if(!(inventory.certificates || []).length)certificateBody.push(layout.note(_('No stored certificate was observed. Configuration and service startup do not prove issuance.')));
		(inventory.sites || []).forEach(function(site){var event=inventory.events && inventory.events[site.domain];certificateBody.push(layout.row(site.domain,({stored_valid:_('Valid stored certificate'),stored_invalid:_('Stored certificate is not currently valid')})[site.state] || _('Unknown')));if(event)certificateBody.push(layout.row(event.operation==='renewal'?_('Renewal'):_('Issuance'),({pending:_('Attempt started; outcome unknown'),issuer_error:_('Issuer error; final outcome unknown'),success:_('Success recorded in retained log')})[event.state] || _('Unknown')));if(event && event.error)certificateBody.push(layout.note(event.error));});
		var notificationBody=[layout.row(_('Last background check'),observed(notifications.last_check)),layout.row(_('Optional webhook'),notifications.ok?(notifications.webhook && notifications.webhook.enabled?_('Enabled'):_('Disabled')):_('Unknown'))];
		if(!notifications.ok)notificationBody.push(layout.note(notifications.error || _('Notification state unavailable')));
		(notifications.alerts || []).forEach(function(alert){notificationBody.push(layout.row((alert.domains || []).join(', '),({expired:_('Stored certificate expired'),near_expiry_observed_issues:_('Near expiry with repeated issuer issues; final attempt outcomes unknown'),recovered:_('Valid replacement observed')})[alert.phase] || _('Unknown')));});
		if(notifications.ok && !(notifications.alerts || []).length)notificationBody.push(layout.note(_('No retained certificate alerts. Missing evidence remains unknown.')));
		notificationBody.push(layout.note(_('Background monitoring runs independently of LuCI and the Caddy service, including complete Caddyfile mode.')));
		return layout.page('tls',_('TLS certificates'),_('Default verification method'),[
			status,
			current.draft && current.draft.mode=='manual'?layout.note(_('Complete Caddyfile mode: TLS forms and credentials are read-only. The independent manual source is not rewritten by form credentials.')):'',
			!current.draft?layout.note(_('Save a site configuration before adding credentials.')):'',
			layout.panel(_('Stored certificates'),'',certificateBody,E('a',{'class':'button','href':L.url('admin/services/caddy/certificates')},_('Stored certificates'))),
			layout.panel(_('Certificate alerts and webhook'),'',notificationBody,E('a',{'class':'button','href':L.url('admin/services/caddy/notifications')},_('Certificate alerts and webhook'))),
			layout.panel(_('Default verification method'),_('Sites using the global default follow this setting after Apply. Explicit site methods remain unchanged. Wildcard domains require DNS-01.'),[choices]),
			layout.panel(_('Cloudflare DNS credentials'),'',[
				credentialStatus,E('div',{'class':'field'},[E('label',{'for':'caddy-cf-token'},_('Cloudflare API Token')),token]),
				layout.note(_('Grant Zone DNS Edit and Zone Read only for the required zones. Tokens are write-only and never shown in previews or exports. Saving stages a private revision; successful Apply hot loads it. The active revision remains available after a failed apply. Changing the default verification method never removes credentials.')),
				layout.note(_('Removing a credential reference from a draft does not delete its private active version. Apply the new configuration before retiring an active credential.')),
				layout.note(_('DNS-01 needs Cloudflare API connectivity and authoritative DNS propagation. A successful Apply does not prove token acceptance or certificate issuance.'))
			]),E('div',{'class':'apply-bar'},[E('div',{'class':'actions'},[save,activate])])
		]);
	},handleSave:null,handleSaveApply:null,handleReset:null
});
