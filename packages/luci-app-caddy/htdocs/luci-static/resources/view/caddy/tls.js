'use strict';
'require view';
'require rpc';
'require ui';

var getDraft=rpc.declare({object:'luci.caddy',method:'draft_get',expect:{'':{}}});
var getCredentials=rpc.declare({object:'luci.caddy',method:'credential_status',expect:{'':{}}});
var saveDefault=rpc.declare({object:'luci.caddy',method:'tls_save',params:['default_challenge','expected_revision'],expect:{'':{}}});
var saveCredential=rpc.declare({object:'luci.caddy',method:'credential_save',params:['token','expected_revision'],expect:{'':{}}});
var apply=rpc.declare({object:'luci.caddy',method:'config_apply',params:['expected_revision'],expect:{'':{}}});

return view.extend({
	load:function(){return Promise.all([getDraft(),getCredentials()]);},
	render:function(initial){
		var current=initial[0], credentials=initial[1], busy=false, dirty=false, readonly=!L.hasViewPermission() || initial[0].draft && initial[0].draft.mode=='manual';
		var method=E('select',{'class':'cbi-input-select','disabled':readonly},['http-01','dns-01','tls-alpn-01'].map(function(value){return E('option',{'value':value},value.toUpperCase());}));
		method.value=current.draft && current.draft.settings.default_challenge || 'http-01';
		var token=E('input',{'type':'password','autocomplete':'new-password','class':'cbi-input-text','disabled':readonly,'placeholder':_('Enter a new token to replace the saved credential')});
		var status=E('p',{'role':'status','aria-live':'polite'}), credentialStatus=E('p');
		var save=E('button',{'class':'cbi-button cbi-button-save','click':function(){return perform(false);}},_('Save'));
		var activate=E('button',{'class':'cbi-button cbi-button-apply','click':function(){return perform(true);}},_('Save & Apply'));
		function update(){
			status.textContent=_('Draft revision')+': '+current.draft_revision+' · '+_('Active revision')+': '+current.active_revision+(current.pending?' · '+_('Pending application'):'');
			credentialStatus.textContent=_('Saved credential revision')+': '+(credentials.draft_revision || _('Not configured'))+' · '+_('Active credential revision')+': '+(credentials.active_revision || _('None'));
			save.disabled=readonly || busy || !dirty || !current.draft;
			activate.disabled=readonly || busy || (!dirty && !current.pending) || !current.draft;
			method.disabled=readonly || busy;
			token.disabled=readonly || busy;
		}
		function checked(response){if(!response.ok)throw new Error(response.error || _('Operation failed'));return response;}
		function perform(wantApply){
			busy=true;update();
			return (dirty?saveDefault(method.value,current.draft_revision).then(checked).then(function(saved){current=saved;}):Promise.resolve())
				.then(function(){if(!token.value)return;var value=token.value;token.value='';return saveCredential(value,current.draft_revision).then(checked).then(function(saved){current=saved;});})
				.then(function(){dirty=false;return wantApply?apply(current.draft_revision).then(checked).then(function(saved){current=saved;}):null;})
				.catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');})
				.finally(function(){return Promise.all([getDraft(),getCredentials()]).then(function(data){current=data[0];credentials=data[1];busy=false;update();});});
		}
		method.addEventListener('change',function(){dirty=true;update();});
		token.addEventListener('input',function(){dirty=true;update();});
		window.addEventListener('beforeunload',function(event){if(dirty){event.preventDefault();event.returnValue='';}});
		update();
		return E('div',{'class':'cbi-map'},[
			E('h2',{},_('TLS certificates')),
			E('ul',{'class':'cbi-tabmenu'},[E('li',{},E('a',{'href':L.url('admin/services/caddy')},_('Overview'))),E('li',{},E('a',{'href':L.url('admin/services/caddy/configuration')},_('Configuration'))),E('li',{'class':'cbi-tab'},E('a',{'href':L.url('admin/services/caddy/tls')},_('TLS certificates'))),E('li',{},E('a',{'href':L.url('admin/services/caddy/certificates')},_('Stored certificates')))]),
			status,
			current.draft && current.draft.mode=='manual'?E('p',{},_('Complete Caddyfile mode: TLS forms and credentials are read-only. The independent manual source is not rewritten by form credentials.')):'',
			!current.draft?E('p',{},_('Save a site configuration before adding credentials.')):'',
			E('div',{'class':'cbi-section'},[E('h3',{},_('Default verification method')),method,E('p',{},_('Used for new sites only. Existing sites retain their verification method. Wildcard domains require DNS-01.'))]),
			E('div',{'class':'cbi-section'},[E('h3',{},_('Cloudflare DNS credentials')),credentialStatus,token,E('p',{},_('Grant Zone DNS Edit and Zone Read only for the required zones. Tokens are write-only and never shown in previews or exports. Saving stages a private revision; successful Apply hot loads it. The active revision remains available after a failed apply. Changing the default verification method never removes credentials.')),E('p',{},_('Removing a credential reference from a draft does not delete its private active version. Apply the new configuration before retiring an active credential.')),E('p',{},_('DNS-01 needs Cloudflare API connectivity and authoritative DNS propagation. A successful Apply does not prove token acceptance or certificate issuance.'))]),
			E('p',{},_('Certificate inventory and renewal evidence are provided by the certificate monitor; configuration alone does not prove issuance.')),
			E('div',{'class':'cbi-page-actions'},[save,' ',activate])
		]);
	},handleSave:null,handleSaveApply:null,handleReset:null
});
