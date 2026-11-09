'use strict';
'require view';
'require form';
'require rpc';
'require ui';

var getDraft = rpc.declare({object:'luci.caddy',method:'draft_edit',expect:{'':{}}});
var saveDraft = rpc.declare({object:'luci.caddy',method:'draft_save',params:['config','expected_revision'],expect:{'':{}}});
var preview = rpc.declare({object:'luci.caddy',method:'config_preview',params:['config'],expect:{'':{}}});
var apply = rpc.declare({object:'luci.caddy',method:'config_apply',params:['expected_revision'],expect:{'':{}}});

return view.extend({
	load: function() {return L.hasViewPermission() ? getDraft() : rpc.declare({object:'luci.caddy',method:'draft_get',expect:{'':{}}})();},
	render: function(initial) {
		var current = initial;
		var config = initial.draft || {version:1,settings:{http_port:10080,https_port:10443,email:'',storage:'/etc/caddy/data'},sites:[{domain:'',backend:'http://127.0.0.1:8080',challenge:'http-01'}]};
		var mode = config.mode || 'form';
		var manual = E('textarea',{'class':'cbi-input-textarea','rows':18,'spellcheck':'false','aria-label':_('Complete Caddyfile')},config.manual_caddyfile || '');
		var sourceStatus = E('p',{'role':'status'});
		var formNode;
		var map = new form.JSONMap({settings:Object.assign({},config.settings),site:Object.assign({},config.sites[0])}, _('HTTPS site'), _('Saving changes only updates the draft. Applying validates and hot loads Caddy; certificate issuance continues asynchronously.'));
		map.readonly = !L.hasViewPermission();
		var section = map.section(form.NamedSection,'site','site',_('Site'));
		var option = section.option(form.Value,'domain',_('Domain'));
		option.rmempty = false;
		option.validate = function(sid,value) {return /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(value) && value.split('.').every(function(label) {return label.length <= 63;}) || _('Enter a non-wildcard domain');};
		option = section.option(form.Value,'backend',_('Backend'));
		option.rmempty = false;
		option.validate = function(sid,value) {try {var u = new URL(value);return (u.protocol == 'http:' && !u.username && !u.password && u.pathname == '/' && !u.search && !u.hash && /^http:\/\/(?:[\w.-]+|\[[a-fA-F0-9:]+\]):\d+$/.test(value) && +value.split(':').pop() > 0 && +value.split(':').pop() < 65536) || _('Use http://host:port without credentials or paths');} catch(e) {return _('Invalid backend address');}};
		option = section.option(form.ListValue,'challenge',_('Verification method'));
		option.value('http-01','HTTP-01'); option.value('tls-alpn-01','TLS-ALPN-01');
		option = section.option(form.TextValue,'advanced_snippet',_('Advanced HTTP routing snippet'));option.rows=5;
		option.description=_('Additional directives inside this site and path boundary. Imports and environment expansion are unsupported.');
		section = map.section(form.NamedSection,'settings','settings',_('Global settings'));
		[['http_port',_('Internal HTTP port')],['https_port',_('Internal HTTPS port')]].forEach(function(field) {var o=section.option(form.Value,field[0],field[1]);o.datatype='port';o.rmempty=false;});
		option = section.option(form.Value,'email',_('ACME contact email'));
		option.validate = function(sid,value) {return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || _('Invalid email');};
		option = section.option(form.Value,'storage',_('Persistent storage directory'));option.rmempty=false;
		option.validate = function(sid,value) {return /^\/[a-zA-Z0-9_\/-]+$/.test(value) && !value.includes('..') && value != '/' || _('Use an absolute directory without parent segments');};
		var dirty = false, busy = false, sequence = 0;
		var status = E('p',{'role':'status','aria-live':'polite'});
		var code = E('pre',{'style':'white-space:pre-wrap;overflow-wrap:anywhere'},_('Save or preview to generate configuration.'));
		var saveButton, applyButton;
		function update() {
			sourceStatus.textContent = mode == 'manual' ? _('Source: complete Caddyfile. Retained form settings are read-only and do not participate. Service and autostart remain available on Overview.') : _('Source: form configuration. The separate manual Caddyfile is preserved.');
			manual.disabled = busy || map.readonly || mode != 'manual';
			if(formNode) formNode.querySelectorAll('input,select,textarea,button').forEach(function(field) {field.disabled = busy || map.readonly || mode == 'manual';});
			status.textContent = _('Saved draft revision') + ': ' + current.draft_revision + ' · ' + _('Active revision') + ': ' + current.active_revision + (current.pending ? ' · ' + _('Saved changes pending application') : '') + (dirty ? ' · ' + _('Unsaved edits') : '') + (current.recovery_required ? ' · ' + _('Recovery required: start or restart Caddy') : '');
			saveButton.disabled = busy || map.readonly || !dirty;
			applyButton.disabled = busy || map.readonly || (!dirty && !current.pending);
		}
		function values() {
			function get(section,key) {return map.data.get('json',section,key) || '';}
			return Object.assign({},config,{mode:mode,manual_caddyfile:manual.value,version:1,settings:{http_port:+get('settings','http_port'),https_port:+get('settings','https_port'),email:get('settings','email'),storage:get('settings','storage')},sites:[{domain:get('site','domain'),backend:get('site','backend'),challenge:get('site','challenge'),advanced_snippet:get('site','advanced_snippet')}]});
		}
		function result(response) {if (!response.ok) throw new Error(response.error || _('Configuration operation failed'));return response;}
		function showPreview(data) {var n=++sequence;return preview(data).then(result).then(function(response) {if(n==sequence) code.textContent=JSON.stringify(response.config,null,2);});}
		function perform(wantApply) {
			busy=true;update();
			return (mode == 'manual' ? Promise.resolve() : map.parse()).then(function() {
				return dirty ? saveDraft(values(),current.draft_revision).then(result).then(function(saved) {current=saved;config=values();dirty=false;}) : null;
			}).then(function() {return wantApply ? apply(current.draft_revision).then(result).then(function(active) {current=active;}) : null;})
				.then(function() {return showPreview(values());})
				.catch(function(error) {ui.addNotification(null,E('p',{},error.message),'error');return getDraft().then(function(saved) {current=saved;});})
				.finally(function() {busy=false;update();}).then(function() {return !dirty;});
		}
		saveButton=E('button',{'class':'cbi-button cbi-button-save','click':function(){return perform(false);}},_('Save'));
		applyButton=E('button',{'class':'cbi-button cbi-button-apply','click':function(){return perform(true);}},_('Save & Apply'));
		window.addEventListener('beforeunload',function(event) {if(dirty) {event.preventDefault();event.returnValue='';}});
		document.addEventListener('click',function(event) {
			var link=event.target.closest('a[href]');
			if(!dirty || !link || event.defaultPrevented || event.ctrlKey || event.metaKey || link.target=='_blank' || link.href==location.href) return;
			event.preventDefault();
			ui.showModal(_('Unsaved edits'),[E('p',{},_('Save this draft before leaving, or discard unsaved edits?')),E('div',{'class':'right'},[E('button',{'class':'cbi-button','click':ui.hideModal},_('Cancel')),' ',E('button',{'class':'cbi-button','click':function(){dirty=false;ui.hideModal();location.href=link.href;}},_('Discard and leave')),' ',E('button',{'class':'cbi-button cbi-button-save','click':function(){ui.hideModal();perform(false).then(function(saved){if(saved)location.href=link.href;});}},_('Save and leave'))])]);
		});
		update();
		return map.render().then(function(node) {
			formNode=node;update();
			manual.addEventListener('input',function(){dirty=true;update();});
			node.addEventListener('input',function(){dirty=true;update();});
			node.addEventListener('change',function(){dirty=true;update();});
			if(initial.draft && !map.readonly) showPreview(initial.draft).catch(function(){});
			return E('div',{},[
				E('ul',{'class':'cbi-tabmenu'},[E('li',{},E('a',{'href':L.url('admin/services/caddy')},_('Overview'))),E('li',{'class':'cbi-tab'},E('a',{'href':L.url('admin/services/caddy/configuration')},_('Configuration')))]),
				status,E('div',{},[E('label',{},_('Configuration source')),E('select',{'disabled':map.readonly,'change':function(event){var selected=event.target.value;event.target.value=mode;if(busy)return;if(selected==mode)return;ui.showModal(_('Switch configuration source'),[E('p',{},selected=='manual'?_('The complete Caddyfile will become the source after Save & Apply. Form content is preserved and becomes read-only.'):_('Retained form content will become the source after Save & Apply. Manual content is preserved.')),E('div',{'class':'right'},[E('button',{'class':'cbi-button','click':ui.hideModal},_('Cancel')),' ',E('button',{'class':'cbi-button cbi-button-action','click':function(){mode=selected;event.target.value=mode;dirty=true;update();ui.hideModal();}},_('Switch source'))])]);}},[E('option',{'value':'form','selected':mode=='form'},_('Form configuration')),E('option',{'value':'manual','selected':mode=='manual'},_('Complete Caddyfile'))]),sourceStatus]),node,E('label',{},_('Separate complete Caddyfile')),manual,E('p',{},_('Privileged server configuration: only trusted administrators should edit it. Local admin and managed filesystem storage are enforced; imports and environment expansion are unsupported.')), 
				E('p',{},_('Public HTTP-01 requires Internet port 80 to reach the internal HTTP port. TLS-ALPN-01 requires Internet port 443 to reach the internal HTTPS port. This application does not configure NAT, firewall, DNS or uhttpd.')),
				E('details',{},[E('summary',{},_('Redacted configuration preview')),code,E('button',{'class':'cbi-button','click':function(){return (mode=='manual'?Promise.resolve():map.parse()).then(function(){return showPreview(values());}).catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');});}},_('Refresh preview'))]),
				E('div',{'class':'cbi-page-actions','style':'position:sticky;bottom:0;background:var(--background-color,#fff);padding:1em;z-index:5'},[saveButton,' ',applyButton])
			]);
		});
	},
	handleSave:null,handleSaveApply:null,handleReset:null
});
