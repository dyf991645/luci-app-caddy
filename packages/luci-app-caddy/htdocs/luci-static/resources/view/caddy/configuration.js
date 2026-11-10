'use strict';
'require view';
'require form';
'require rpc';
'require ui';

var saveBasic = rpc.declare({object:'luci.caddy',method:'basic_profile_save',params:['scope','config','users','expected_revision'],expect:{'':{}}});
var getDraft = rpc.declare({object:'luci.caddy',method:'draft_edit',expect:{'':{}}});
var saveDraft = rpc.declare({object:'luci.caddy',method:'draft_save',params:['config','expected_revision'],expect:{'':{}}});
var preview = rpc.declare({object:'luci.caddy',method:'config_preview',params:['config'],expect:{'':{}}});
var apply = rpc.declare({object:'luci.caddy',method:'config_apply',params:['expected_revision'],expect:{'':{}}});

return view.extend({
	load: function() {return L.hasViewPermission() ? getDraft() : rpc.declare({object:'luci.caddy',method:'draft_get',expect:{'':{}}})();},
	render: function(initial) {
		var current = initial;
		var config = initial.draft || {version:2,settings:{http_port:10080,https_port:10443,email:'',storage:'/etc/caddy/data'},sites:[{domain:'',upstreams:['http://127.0.0.1:8080'],balance:'round_robin',path:'',strip:false,challenge:'http-01'}]};
		var mode = config.mode || 'form';
		var manual = E('textarea',{'class':'cbi-input-textarea','rows':18,'spellcheck':'false','aria-label':_('Complete Caddyfile')},config.manual_caddyfile || '');
		var sourceStatus = E('p',{'role':'status'});
		var formNode;
		var map = new form.JSONMap({authelia:Object.assign({backend:'',uri:'/api/authz/forward-auth',portal:''},config.auth?.authelia),settings:Object.assign({},config.settings),sites:config.sites.map(function(site) {return Object.assign({},site);})}, _('HTTPS sites'), _('Saving changes only updates the draft. Applying validates and hot loads Caddy; certificate issuance continues asynchronously.'));
		map.readonly = !L.hasViewPermission();
		var section = map.section(form.TypedSection,'sites',_('Sites'));
		section.anonymous = true; section.addremove = true;
		var option = section.option(form.Value,'domain',_('Domain'));
		option.rmempty = false;
		option.validate = function(sid,value) {return /^(?=.{1,253}$)(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(value) && value.split('.').every(function(label) {return label.length <= 63;}) || _('Enter a valid domain; wildcards require DNS-01');};
		option = section.option(form.DynamicList,'upstreams',_('Backends'),_('Use explicit ports. All backends in a site must use the same protocol. HTTPS certificates are verified.'));
		option.rmempty = false; option.default = 'http://127.0.0.1:8080';
		option.validate = function(sid,value) {try {new URL(value);} catch(e) {return _('Invalid backend address');} return /^https?:\/\/(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?|\[[a-fA-F0-9:]+\]):[0-9]{1,5}$/.test(value) && +value.split(':').pop() > 0 && +value.split(':').pop() < 65536 || _('Use http(s)://host:port without credentials or paths');};
		option = section.option(form.ListValue,'balance',_('Load balancing')); option.default='round_robin';
		option.value('round_robin',_('Round robin')); option.value('least_conn',_('Least connections')); option.value('random',_('Random'));
		option = section.option(form.Value,'path',_('Optional path'),_('Exact path or a trailing /*. /media/* matches /media/ and descendants, excludes /media and /mediaX. Other paths return 404.'));
		option.validate = function(sid,value) {return !value || (/^\/(?:[a-zA-Z0-9_~.-]+\/)*(?:[a-zA-Z0-9_~.-]+|\*)?$/.test(value) && !value.split('/').some(function(x){return x==='.' || x==='..';})) || _('Use an exact path or a trailing /*');};
		option = section.option(form.Flag,'strip',_('Remove path prefix')); option.default='0';
		option.cfgvalue = function(sid) {return [true,'true','1'].indexOf(map.data.get('json',sid,'strip')) >= 0 ? '1':'0';};
		option.write = function(sid,value) {map.data.set('json',sid,'strip',value==='1');};
		option = section.option(form.ListValue,'challenge',_('Verification method'));
		option.value('dns-01','DNS-01'); option.value('http-01','HTTP-01'); option.default=config.settings.default_challenge || 'http-01'; option.value('tls-alpn-01','TLS-ALPN-01');
		option = section.option(form.ListValue,'authMode',_('Access authentication'));option.value('none',_('No additional authentication'));option.value('basic','Basic Auth');option.value('authelia','Authelia');
		option.cfgvalue=function(sid){return map.data.get('json',sid,'auth')?.mode || 'none';};
		option.write=function(sid,value){var auth=map.data.get('json',sid,'auth') || {};map.data.set('json',sid,'auth',Object.assign({},auth,{mode:value,source:auth.source || 'global'}));};
		option = section.option(form.ListValue,'authSource',_('Authentication configuration'));option.depends('authMode','basic');option.depends('authMode','authelia');option.value('global',_('Global reference'));option.value('independent',_('Independent configuration'));
		option.cfgvalue=function(sid){return map.data.get('json',sid,'auth')?.source || 'global';};
		option.write=function(sid,value){map.data.set('json',sid,'auth',Object.assign({},map.data.get('json',sid,'auth'),{source:value}));};
		[['backend',_('Independent Authelia backend')],['uri',_('Independent authorization interface')],['portal',_('Independent login portal')]].forEach(function(field) {
			var o=section.option(form.Value,'authelia_'+field[0],field[1]);o.depends({authMode:'authelia',authSource:'independent'});o.rmempty=false;
			o.cfgvalue=function(sid){return map.data.get('json',sid,'auth')?.authelia?.[field[0]] || (field[0]=='uri'?'/api/authz/forward-auth':'');};
			o.write=function(sid,value){var auth=map.data.get('json',sid,'auth') || {};map.data.set('json',sid,'auth',Object.assign({},auth,{authelia:Object.assign({},auth.authelia,{[field[0]]:value})}));};
		});
		option = section.option(form.TextValue,'advanced_snippet',_('Advanced HTTP routing snippet'));option.rows=5;
		option.description=_('Additional directives inside this site and path boundary. Imports and environment expansion are unsupported.');
		section = map.section(form.NamedSection,'settings','settings',_('Global settings'));
		[['http_port',_('Internal HTTP port')],['https_port',_('Internal HTTPS port')]].forEach(function(field) {var o=section.option(form.Value,field[0],field[1]);o.datatype='port';o.rmempty=false;});
		option = section.option(form.Value,'email',_('ACME contact email'));
		option.validate = function(sid,value) {return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || _('Invalid email');};
		option = section.option(form.Value,'storage',_('Persistent storage directory'));option.rmempty=false;
		option.validate = function(sid,value) {return /^\/[a-zA-Z0-9_\/-]+$/.test(value) && !value.includes('..') && value != '/' || _('Use an absolute directory without parent segments');};
		section=map.section(form.NamedSection,'authelia','authelia',_('Global Authelia configuration'));
		section.description=_('Use a router-reachable HTTP(S) backend with an explicit port, /api/authz/forward-auth, and an HTTP(S) login portal URL. The portal site must use no additional authentication. Configure users, MFA, session cookie domain/authelia_url, and access policies in external Authelia. An unreachable service fails closed.');
		[['backend',_('Authelia backend')],['uri',_('Authorization interface')],['portal',_('Login portal URL')]].forEach(function(field){var o=section.option(form.Value,field[0],field[1]);o.rmempty=true;});
		var accountDirty = false;
		var dirty = false, busy = false, sequence = 0;
		var siteSection=map.children[0];
		['handleAdd','handleRemove'].forEach(function(name) {var original=siteSection[name];siteSection[name]=function() {dirty=true;update();return original.apply(this,arguments);};});
		var status = E('p',{'role':'status','aria-live':'polite'});
		var code = E('pre',{'style':'white-space:pre-wrap;overflow-wrap:anywhere'},_('Save or preview to generate configuration.'));
		var saveButton, applyButton;
		var affected=E('p',{'role':'status'});
		var accountsNode, accountRows=E('div'), scope=E('input',{'aria-label':_('Account configuration: global or site domain'),'value':'global','placeholder':_('global or site domain')});

		function accountRow(user) {
			var username=E('input',{'placeholder':_('Username'),'aria-label':_('Username'),'value':user?.username || ''});
			var password=E('input',{'type':'password','placeholder':user ? _('Keep existing password') : _('New password'),'aria-label':_('New password'),'autocomplete':'new-password'});
			var hash=E('input',{'type':'password','placeholder':_('Advanced: existing bcrypt hash'),'aria-label':_('Existing bcrypt hash'),'autocomplete':'new-password'});
			var row=E('div',{'class':'cbi-value'},[username,' ',password,' ',hash,' ',E('button',{'class':'cbi-button','click':function(){row.remove();accountDirty=true;dirty=true;update();}},_('Remove account'))]);
			row.account=function(){if(password.value && hash.value)return {username:username.value,password:password.value,hash:hash.value};return Object.assign({username:username.value},password.value ? {password:password.value} : hash.value ? {hash:hash.value} : {retain:true});};accountRows.appendChild(row);
		}
		function loadAccounts(){accountRows.replaceChildren();var selected=scope.value;var ref=selected=='global' ? config.auth?.basic?.profile : config.sites.find(function(site){return site.domain==selected;})?.auth?.profile;(current.basic_profiles?.[ref] || []).forEach(accountRow);if(!accountRows.children.length)accountRow();}
		scope.addEventListener('change',loadAccounts);accountRows.addEventListener('input',function(){accountDirty=true;dirty=true;update();});loadAccounts();
		accountsNode=E('fieldset',{},[E('legend',{},_('Basic Auth accounts')),E('p',{},_('Enter global for shared accounts, or the exact site domain for independent accounts.')),E('p',{},_('Passwords are hashed on the router. Existing passwords and hashes are never read back. Remove an account row to delete it. Save accounts updates the draft; apply activates the change.')),scope,accountRows,E('button',{'class':'cbi-button','click':function(){accountRow();accountDirty=true;dirty=true;update();}},_('Add account')),' ',E('button',{'class':'cbi-button cbi-button-save','click':function(){busy=true;update();return map.parse().then(function(){return saveBasic(scope.value,values(),Array.from(accountRows.children).map(function(row){return row.account();}),current.draft_revision);}).then(result).then(function(saved){current=saved;config=Object.assign(values(),saved.draft,{manual_caddyfile:manual.value});config.sites.forEach(function(site){map.data.sections('json','sites').forEach(function(buffer){if(buffer.domain==site.domain)map.data.set('json',buffer['.name'],'auth',site.auth);});});dirty=false;accountDirty=false;loadAccounts();}).catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');}).finally(function(){busy=false;update();});}},_('Save accounts to draft'))]);
		function update() {
			sourceStatus.textContent = mode == 'manual' ? _('Draft source: complete Caddyfile. Retained form settings are read-only and do not participate. Service and autostart remain available on Overview.') : _('Draft source: form configuration. The separate manual Caddyfile is preserved.');
			affected.textContent=current.affected_domains?.length ? _('Applying global authentication changes affects:')+' '+current.affected_domains.join(', ') : '';
			if(accountsNode) accountsNode.querySelectorAll('input,select,button').forEach(function(field){field.disabled=busy || map.readonly || mode=='manual';});
			manual.disabled = busy || map.readonly || mode != 'manual';
			if(formNode) formNode.querySelectorAll('input,select,textarea,button').forEach(function(field) {field.disabled = busy || map.readonly || mode == 'manual';});
			status.textContent = _('Saved draft revision') + ': ' + current.draft_revision + ' · ' + _('Active revision') + ': ' + current.active_revision + ' · ' + _('Active source') + ': ' + (current.active_source || _('No managed revision')) + (current.pending ? ' · ' + _('Saved changes pending application') : '') + (dirty ? ' · ' + _('Unsaved edits') : '') + (current.recovery_required ? ' · ' + _('Recovery required: start or restart Caddy') : '');
			saveButton.disabled = busy || map.readonly || !dirty;
			applyButton.disabled = busy || map.readonly || (!dirty && !current.pending);
		}
		function rememberForm() {
			// JSONMap writes remain in this editor buffer; no RPC or persistence.
			map.children.forEach(function(section) {section.cfgsections().forEach(function(sid) {section.children.forEach(function(option) {var value=option.formvalue(sid);if(value!=null) option.write(sid,value);});});});
		}
		function values() {
			function get(section,key) {return map.data.get('json',section,key) || '';}
			var auth=Object.assign({},config.auth);if(get('authelia','backend') || get('authelia','portal'))auth.authelia={backend:get('authelia','backend'),uri:get('authelia','uri') || '/api/authz/forward-auth',portal:get('authelia','portal')};else delete auth.authelia;
			return Object.assign({},config,{auth:auth,mode:mode,manual_caddyfile:manual.value,version:2,settings:Object.assign({},config.settings,{http_port:+get('settings','http_port'),https_port:+get('settings','https_port'),email:get('settings','email'),storage:get('settings','storage')}),sites:map.data.sections('json','sites').map(function(site) {return {domain:site.domain || '',upstreams:site.upstreams || [],balance:site.balance || 'round_robin',path:site.path || '',strip:site.strip === true || site.strip === 'true' || site.strip === '1',challenge:site.challenge || 'http-01',advanced_snippet:site.advanced_snippet || '',auth:site.auth || {mode:'none'}};})});
		}
		function validateConfig(data) {
			if(data.mode=='manual')return data;
			var domains={}; data.sites.forEach(function(site) {
				if(site.domain.startsWith('*.') && site.challenge!='dns-01') throw new Error(_('Wildcard domains require DNS-01'));
				if(domains[site.domain]) throw new Error(_('Each domain must have exactly one site')); domains[site.domain]=true;
				if(!site.upstreams.length || site.upstreams.some(function(url){return url.split(':')[0] !== site.upstreams[0].split(':')[0];})) throw new Error(_('Backends must use the same protocol'));
				if(site.strip && !site.path.endsWith('/*')) throw new Error(_('Prefix removal requires a path ending in /*'));
			}); if(!data.sites.length) throw new Error(_('Configure at least one site')); return data;
		}
		function result(response) {if (!response.ok) throw new Error(response.error || _('Configuration operation failed'));return response;}
		function showPreview(data) {var n=++sequence;return preview(validateConfig(data)).then(result).then(function(response) {if(n==sequence) code.textContent=JSON.stringify(response.config,null,2);});}
		function confirmImpact(){
			if(!current.affected_domains?.length)return Promise.resolve();
			update();return new Promise(function(resolve,reject){ui.showModal(_('Apply global authentication change'),[E('p',{},_('The following domains will use the updated accounts:')),E('ul',{},current.affected_domains.map(function(domain){return E('li',{},domain);})),E('div',{'class':'right'},[E('button',{'class':'cbi-button','click':function(){ui.hideModal();reject(new Error(_('Application cancelled; draft retained')));}},_('Cancel')),' ',E('button',{'class':'cbi-button cbi-button-apply','click':function(){ui.hideModal();resolve();}},_('Apply'))])]);});
		}
		function syncAuth(){config.sites.forEach(function(site){map.data.sections('json','sites').forEach(function(buffer){if(buffer.domain==site.domain)map.data.set('json',buffer['.name'],'auth',site.auth);});});}
		function perform(wantApply) {
			busy=true;update();
			return (mode == 'manual' ? Promise.resolve() : map.parse()).then(function() {
				return dirty ? (accountDirty ? saveBasic(scope.value,values(),Array.from(accountRows.children).map(function(row){return row.account();}),current.draft_revision) : saveDraft(validateConfig(values()),current.draft_revision)).then(result).then(function(saved) {current=saved;config=Object.assign(values(),saved.draft,{manual_caddyfile:manual.value});syncAuth();dirty=false;accountDirty=false;loadAccounts();}) : null;
			}).then(function() {return wantApply ? confirmImpact().then(function(){return apply(current.draft_revision);}).then(result).then(function(active) {current=active;}) : null;})
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
				E('ul',{'class':'cbi-tabmenu'},[E('li',{},E('a',{'href':L.url('admin/services/caddy')},_('Overview'))),E('li',{'class':'cbi-tab'},E('a',{'href':L.url('admin/services/caddy/configuration')},_('Configuration'))),E('li',{},E('a',{'href':L.url('admin/services/caddy/tls')},_('TLS certificates')))]),
				status,affected,E('div',{},[E('label',{},_('Configuration source')),E('select',{'disabled':map.readonly,'change':function(event){var selected=event.target.value;event.target.value=mode;if(busy)return;if(selected==mode)return;ui.showModal(_('Switch configuration source'),[E('p',{},selected=='manual'?_('The complete Caddyfile will become the source after Save & Apply. Form content is preserved and becomes read-only.'):_('Retained form content will become the source after Save & Apply. Manual content is preserved.')),E('div',{'class':'right'},[E('button',{'class':'cbi-button','click':ui.hideModal},_('Cancel')),' ',E('button',{'class':'cbi-button cbi-button-action','click':function(){if(mode=='form')rememberForm();mode=selected;event.target.value=mode;dirty=true;update();ui.hideModal();}},_('Switch source'))])]);}},[E('option',{'value':'form','selected':mode=='form'},_('Form configuration')),E('option',{'value':'manual','selected':mode=='manual'},_('Complete Caddyfile'))]),sourceStatus]),node,accountsNode,E('label',{},_('Separate complete Caddyfile')),manual,E('p',{},_('Privileged server configuration: only trusted administrators should edit it. Local admin and managed filesystem storage are enforced; imports and environment expansion are unsupported.')),
				E('p',{},_('Public HTTP-01 requires Internet port 80 to reach the internal HTTP port. TLS-ALPN-01 requires Internet port 443 to reach the internal HTTPS port. This application does not configure NAT, firewall, DNS or uhttpd.')),
				E('details',{},[E('summary',{},_('Redacted configuration preview')),code,E('button',{'class':'cbi-button','disabled':map.readonly,'click':function(){return (mode=='manual'?Promise.resolve():map.parse()).then(function(){return showPreview(values());}).catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');});}},_('Refresh preview'))]),
				E('div',{'class':'cbi-page-actions','style':'position:sticky;bottom:0;background:var(--background-color,#fff);padding:1em;z-index:5'},[saveButton,' ',applyButton])
			]);
		});
	},
	handleSave:null,handleSaveApply:null,handleReset:null
});
