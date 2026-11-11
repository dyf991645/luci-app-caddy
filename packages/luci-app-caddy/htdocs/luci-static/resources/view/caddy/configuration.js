'use strict';
'require view';
'require form';
'require rpc';
'require ui';
'require dom';
'require caddy.apply as caddyApply';
'require caddy.backends as backendList';
'require caddy.layout as layout';
'require caddy.service as service';

var saveBasic = rpc.declare({object:'luci.caddy',method:'basic_profile_save',params:['scope','config','users','expected_revision'],expect:{'':{}}});
var getDraft = rpc.declare({object:'luci.caddy',method:'draft_edit',expect:{'':{}}});
var saveDraft = rpc.declare({object:'luci.caddy',method:'draft_save',params:['config','expected_revision'],expect:{'':{}}});
var preview = rpc.declare({object:'luci.caddy',method:'config_preview',params:['config'],expect:{'':{}}});
var apply = rpc.declare({object:'luci.caddy',method:'config_apply',params:['expected_revision'],expect:{'':{}}});

return view.extend({
	load: function() {return L.hasViewPermission() ? getDraft() : rpc.declare({object:'luci.caddy',method:'draft_get',expect:{'':{}}})();},
	render: function(initial) {
		var route = L.env && L.env.dispatchpath || [];
		var page = route.indexOf('settings') >= 0 ? 'settings' : route.indexOf('config') >= 0 ? 'config' : 'configuration';
		var current = initial;
		var config = initial.draft || {version:2,settings:{http_port:10080,https_port:10443,email:'',storage:'/etc/caddy/data'},sites:[{domain:'',upstreams:['http://127.0.0.1:8080'],balance:'round_robin',path:'',strip:false,challenge:'global'}]};
		var mode = config.mode || 'form';
		var manual = E('textarea',{'class':'cbi-input-textarea','rows':18,'spellcheck':'false','aria-label':_('Complete Caddyfile')},config.manual_caddyfile || '');
		var sourceStatus = E('p',{'role':'status'});
		var formNode, serviceStrip, searchQuery='',statusFilter='all';
		var siteCount=E('span',{'class':'count','role':'status'});
		var map = new form.JSONMap({authelia:Object.assign({backend:'',uri:'/api/authz/forward-auth',portal:''},config.auth?.authelia),settings:Object.assign({},config.settings),sites:config.sites.map(function(site) {return Object.assign({},site);})});
		map.readonly = !L.hasViewPermission();
		var section = map.section(form.GridSection,'sites',_('Sites'));
		section.anonymous = true; section.addremove = true;
		section.addbtntitle = _('Add site');
		section.modaltitle = _('Edit site');
		section.nodescriptions = true;
		section.addModalOptions = function(modalSection, sid) {
			var modalMap=modalSection.map;
			modalMap.originalSite=JSON.parse(JSON.stringify(map.data.get('json',sid)));
			modalMap.dirtyBefore=dirty;
			modalMap.readonly = map.readonly || busy || mode == 'manual';
			modalSection.tab('connection',_('Connection'));
			modalSection.tab('verification',_('Certificate request'));
			modalSection.tab('authentication',_('Access authentication'));
			modalSection.tab('advanced',_('Advanced'));
			modalSection.children.forEach(function(field) {
				// Grid-only presentation flags must not hide dependency sources in the dialog.
				field.modalonly = false;
				field.retain = true;
				field.tab = field.option=='advanced_snippet' ? 'advanced' : field.option=='challenge' ? 'verification' : /^(auth|authelia_)/.test(field.option) ? 'authentication' : 'connection';
				modalSection.tabs[field.tab].children.push(field);
			});
			var reference=modalSection.taboption('authentication',form.DummyValue,'global_auth_reference',_('Global authentication'));
			reference.depends({authMode:'basic',authSource:'global'});reference.depends({authMode:'authelia',authSource:'global'});
			reference.renderWidget=function(){return E('a',{'href':L.url('admin/services/caddy/settings')},_('Manage shared authentication in Global settings'));};
			var editor;
			var accounts=modalSection.taboption('authentication',form.DummyValue,'basic_accounts',_('Basic Auth accounts'));
			accounts.depends({authMode:'basic',authSource:'independent'});
			accounts.renderWidget=function() {
				var profile=map.data.get('json',sid,'auth')?.profile;
				editor=createAccountEditor(current.basic_profiles?.[profile] || [],modalMap.readonly);
				modalMap.accountEditor=editor;
				return editor.node;
			};
			var render=modalMap.render;
			modalMap.render=function() {return render.apply(this,arguments).then(function(node) {
				node.classList.add('caddy-app','caddy-site-editor');
				return node;
			});};
		};
		var option=section.option(form.Value,'name',_('Site name'));option.rmempty=true;option.datatype='maxlength(80)';
		option=section.option(form.Flag,'enabled',_('Enabled'));option.default='1';option.rmempty=false;option.editable=true;
		option.cfgvalue=function(sid){return this.map.data.get('json',sid,'enabled')===false?'0':'1';};
		option.write=function(sid,value){this.map.data.set('json',sid,'enabled',value==='1');};
		option = section.option(form.Value,'domain',_('Domain'));
		option.rmempty = false;
		option.textvalue=function(sid){var site=this.map.data.get('json',sid);return E('div',{'class':'site-cell'},[E('strong',{},site.name || site.domain || '—'),site.name?E('small',{'class':'hint'},site.domain):'']);};
		option.validate = function(sid,value) {return /^(?=.{1,253}$)(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(value) && value.split('.').every(function(label) {return label.length <= 63;}) || _('Enter a valid domain; wildcards require DNS-01');};
		option = section.option(form.DynamicList,'upstreams',_('Backends'),_('Use explicit ports. All backends in a site must use the same protocol. HTTPS certificates are verified.'));
		option.rmempty = false; option.default = 'http://127.0.0.1:8080';
		option.renderWidget=function(sid,index,value){return backendList.create(value!=null?value:[this.default],{id:this.cbid(sid),validate:this.getValidator(sid),disabled:this.readonly!=null?this.readonly:this.map.readonly}).render();};
		option.textvalue=function(sid){var backends=this.map.data.get('json',sid,'upstreams') || [];return E('div',{},[E('span',{},backends[0] || ''),E('small',{'class':'hint'},backends.length+' '+_('Backends')+' · '+({round_robin:_('Round robin'),least_conn:_('Least connections'),random:_('Random')}[this.map.data.get('json',sid,'balance') || 'round_robin']))]);};
		option.validate = function(sid,value) {try {new URL(value);} catch(e) {return _('Invalid backend address');} return /^https?:\/\/(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?|\[[a-fA-F0-9:]+\]):[0-9]{1,5}$/.test(value) && +value.split(':').pop() > 0 && +value.split(':').pop() < 65536 || _('Use http(s)://host:port without credentials or paths');};
		option = section.option(form.ListValue,'balance',_('Load balancing')); option.default='round_robin';
		option.value('round_robin',_('Round robin')); option.value('least_conn',_('Least connections')); option.value('random',_('Random'));
		option = section.option(form.Value,'path',_('Optional path'),_('Exact path or a trailing /*. /media/* matches /media/ and descendants, excludes /media and /mediaX. Other paths return 404.'));
		option.validate = function(sid,value) {return !value || (/^\/(?:[a-zA-Z0-9_~.-]+\/)*(?:[a-zA-Z0-9_~.-]+|\*)?$/.test(value) && !value.split('/').some(function(x){return x==='.' || x==='..';})) || _('Use an exact path or a trailing /*');};
		option = section.option(form.Flag,'strip',_('Remove path prefix')); option.default='0';
		option.cfgvalue = function(sid) {return [true,'true','1'].indexOf(map.data.get('json',sid,'strip')) >= 0 ? '1':'0';};
		option.write = function(sid,value) {map.data.set('json',sid,'strip',value==='1');};
		option = section.option(form.ListValue,'challenge',_('Certificate verification'));
		option.value('global',_('Global default')); option.value('dns-01','DNS-01'); option.value('http-01','HTTP-01'); option.default='global'; option.value('tls-alpn-01','TLS-ALPN-01');
		option.textvalue=function(sid){var selected=this.map.data.get('json',sid,'challenge') || 'global';return selected=='global'?_('Global default')+' · '+(config.settings.default_challenge || 'http-01').toUpperCase():selected.toUpperCase();};
		option = section.option(form.ListValue,'authMode',_('Access authentication'));option.value('none',_('No additional authentication'));option.value('basic','Basic Auth');option.value('authelia','Authelia');
		option.textvalue=function(sid){var mode=this.map.data.get('json',sid,'auth')?.mode;return mode=='basic'?'Basic Auth':mode=='authelia'?'Authelia':'—';};
		option.forcewrite=true;
		option.cfgvalue=function(sid){return this.map.data.get('json',sid,'auth')?.mode || 'none';};
		option.write=function(sid,value){var auth=this.map.data.get('json',sid,'auth') || {};this.map.data.set('json',sid,'auth',Object.assign({},auth,{mode:value,source:auth.source || 'global'}));};
		option = section.option(form.ListValue,'authSource',_('Authentication configuration'));option.depends('authMode','basic');option.depends('authMode','authelia');option.value('global',_('Global reference'));option.value('independent',_('Independent configuration'));
		option.forcewrite=true;
		option.cfgvalue=function(sid){return this.map.data.get('json',sid,'auth')?.source || 'global';};
		option.write=function(sid,value){this.map.data.set('json',sid,'auth',Object.assign({},this.map.data.get('json',sid,'auth'),{source:value}));};
		[['backend',_('Authelia backend')],['uri',_('Authorization interface')],['portal',_('Login portal URL')]].forEach(function(field) {
			var o=section.option(form.Value,'authelia_'+field[0],field[1]);o.depends({authMode:'authelia',authSource:'independent'});o.rmempty=false;
			o.forcewrite=true;o.retain=true;
			o.cfgvalue=function(sid){return this.map.data.get('json',sid,'auth')?.authelia?.[field[0]] || (field[0]=='uri'?'/api/authz/forward-auth':'');};
			o.write=function(sid,value){var auth=this.map.data.get('json',sid,'auth') || {};this.map.data.set('json',sid,'auth',Object.assign({},auth,{authelia:Object.assign({},auth.authelia,{[field[0]]:value})}));};
		});
		option = section.option(form.TextValue,'advanced_snippet',_('Advanced HTTP routing snippet'));option.rows=5;
		option.description=_('Additional directives inside this site and path boundary. Imports and environment expansion are unsupported.');
		var enabledField=section.children.splice(section.children.findIndex(function(field){return field.option=='enabled';}),1)[0];
		section.children.splice(section.children.findIndex(function(field){return field.option=='authMode';})+1,0,enabledField);
		section.children.forEach(function(field) {
			if(['enabled','domain','upstreams','challenge','authMode'].indexOf(field.option) < 0) field.modalonly = true;
		});
		section = map.section(form.NamedSection,'settings','settings','');
		var settingsSection=section;
		[['http_port',_('HTTP port')],['https_port',_('HTTPS port')]].forEach(function(field) {var o=section.option(form.Value,field[0],field[1]);o.datatype='port';o.rmempty=false;});
		option=section.option(form.Flag,'access_log',_('Access logs'),_('Optional status-only access evidence in the bounded system RAM log. Requests, headers and URLs are omitted from this viewer.'));
		option.cfgvalue=function(){return map.data.get('json','settings','access_log')===true ? '1':'0';};
		option.write=function(sid,value){map.data.set('json',sid,'access_log',value==='1');};
		option = section.option(form.Value,'email',_('ACME contact email (optional)'),_('Used when registering an ACME certificate account. May be left blank; this does not configure notification delivery.'));
		option.validate = function(sid,value) {return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || _('Invalid email');};
		option = section.option(form.Value,'storage',_('Persistent storage directory'),_('Stores ACME accounts, certificates and private keys. Use a directory retained across reboot and upgrades.'));option.rmempty=false;
		option.validate = function(sid,value) {return /^\/[a-zA-Z0-9_\/-]+$/.test(value) && !value.includes('..') && value != '/' || _('Use an absolute directory without parent segments');};
		section=map.section(form.NamedSection,'authelia','authelia',_('Authelia'));
		var authSection=section;
		section.description=_('Use a router-reachable HTTP(S) backend with an explicit port, /api/authz/forward-auth, and an HTTP(S) login portal URL. The portal site must use no additional authentication. Configure users, MFA, session cookie domain/authelia_url, and access policies in external Authelia. An unreachable service fails closed.');
		[['backend',_('Authelia backend')],['uri',_('Authorization interface')],['portal',_('Login portal URL')]].forEach(function(field){var o=section.option(form.Value,field[0],field[1]);o.rmempty=true;});
		var accountDirty = false;
		var dirty = false, busy = false, sequence = 0;
		var siteSection=map.children[0];
		map.children = page == 'configuration' ? [siteSection] : page == 'settings' ? map.children.slice(1) : [];
		var renderSiteModal=siteSection.renderMoreOptionsModal;
		siteSection.renderMoreOptionsModal=function() {if(accountDirty){ui.addNotification(null,E('p',{},_('Save account edits before editing a site.')),'warning');return Promise.resolve();}return Promise.resolve(renderSiteModal.apply(this,arguments)).then(function() {
			var node=siteSection.getActiveModalMap();
			var button=node && dom.findClassInstance(node).parent===map ? node.parentNode.querySelector('div.button-row > button:last-child') : null;
			if(button) {
				button.textContent=_('Save');
				var cancel=button.parentNode.querySelector('button:first-child');
				if(cancel)cancel.textContent=_('Cancel');
			}
		});};
		var cancelSiteModal=siteSection.handleModalCancel;
		siteSection.handleModalCancel=function(modalMap,ev,isSaving) {
			if(busy && !isSaving)return Promise.resolve();
			if(!isSaving && modalMap.originalSite) {
				var buffer=map.data.get('json',modalMap.section);
				Object.keys(buffer).forEach(function(key){delete buffer[key];});
				Object.assign(buffer,modalMap.originalSite);
				dirty=modalMap.dirtyBefore;
			}
			var cancelled=cancelSiteModal.apply(this,arguments);
			update();return cancelled;
		};

		siteSection.handleModalSave = function(modalMap,ev) {
			if(busy || accountDirty || map.readonly || mode=='manual')return Promise.resolve();
			var modalNode=this.getActiveModalMap();
			var activeMap=dom.findClassInstance(modalNode);
			var sid=activeMap.section;
			// Parse table edits before parsing the modal; the modal owns the final site values.
			busy=true;update();
			activeMap.checkDepends();
			var controls=Array.from(modalNode.parentNode.querySelectorAll('input,select,textarea,button')).map(function(field){var previous=field.disabled;field.disabled=true;return [field,previous];});
			return map.parse().then(function(){return activeMap.parse();}).then(function() {
				var data=validateConfig(values()),auth=map.data.get('json',sid,'auth');
				return (auth?.mode=='basic' && auth.source=='independent'
					? saveBasic(map.data.get('json',sid,'domain'),data,activeMap.accountEditor.users(),current.draft_revision)
					: saveDraft(data,current.draft_revision)).then(result);
			}).then(function(saved) {
				current=saved;config=Object.assign(values(),saved.draft,{manual_caddyfile:manual.value});syncAuth();dirty=false;
				return map.load().then(function(){return map.reset();}).catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');}).then(function(){return siteSection.handleModalCancel(modalMap,ev,true);});
			}).catch(function(error) {dirty=true;ui.addNotification(null,E('p',{},error.message),'error');})
			.finally(function(){controls.forEach(function(entry){entry[0].disabled=entry[1];});busy=false;update();caddyApply.refreshChanges();});
		};
		['handleAdd','handleRemove'].forEach(function(name) {var original=siteSection[name];siteSection[name]=function() {dirty=true;update();return Promise.resolve(original.apply(this,arguments)).then(function(result){update();return result;});};});
		var status = E('p',{'role':'status','aria-live':'polite'});
		var code = E('pre',{'style':'white-space:pre-wrap;overflow-wrap:anywhere'},_('Save or preview to generate configuration.'));
		var saveButton, applyButton;
		var affected=E('p',{'role':'status'});
		var accountsNode, accountRows=E('div'), scope={value:'global'};

		function createAccountEditor(users,readonly) {
			var rows=E('div',{'class':'caddy-account-list'});
			function add(user) {
				var username=E('input',{'class':'cbi-input-text','placeholder':_('Username'),'aria-label':_('Username'),'value':user?.username || '',disabled:readonly,'autocomplete':'off'});
				var password=E('input',{'class':'cbi-input-text','type':'password','placeholder':user ? _('Keep existing password') : _('New password'),'aria-label':_('New password'),'autocomplete':'new-password',disabled:readonly});
				var hash=E('input',{'class':'cbi-input-text','type':'password','placeholder':_('Advanced: existing bcrypt hash'),'aria-label':_('Existing bcrypt hash'),'autocomplete':'new-password',disabled:readonly});
				var row=E('div',{'class':'caddy-account-row'},[E('div',{'class':'field'},[E('label',{},_('Username')),username]),E('div',{'class':'field'},[E('label',{},_('New password')),password]),E('button',{'type':'button','class':'cbi-button','disabled':readonly,'click':function(){row.remove();}},_('Remove account')),E('details',{},[E('summary',{},_('Advanced: existing bcrypt hash')),hash])]);
				row.account=function(){if(password.value && hash.value)return {username:username.value,password:password.value,hash:hash.value};return Object.assign({username:username.value},password.value ? {password:password.value} : hash.value ? {hash:hash.value} : {retain:true});};
				rows.appendChild(row);
			}
			users.forEach(add);if(!users.length)add();
			return {node:E('div',{},[E('p',{},_('Passwords are hashed on the router. Leave an existing password blank to keep it. Saving this site updates the draft; apply activates it.')),rows,E('button',{'type':'button','class':'cbi-button','disabled':readonly,'click':function(){add();}},_('Add account'))]),users:function(){return Array.from(rows.children).map(function(row){return row.account();});}};
		}

		function accountRow(user) {
			var username=E('input',{'placeholder':_('Username'),'aria-label':_('Username'),'value':user?.username || ''});
			var password=E('input',{'type':'password','placeholder':user ? _('Keep existing password') : _('New password'),'aria-label':_('New password'),'autocomplete':'new-password'});
			var hash=E('input',{'type':'password','placeholder':_('Advanced: existing bcrypt hash'),'aria-label':_('Existing bcrypt hash'),'autocomplete':'new-password'});
			var row=E('div',{'class':'account-row'},[E('label',{'class':'field'},[E('span',{'class':'field-label'},_('Username')),username]),E('label',{'class':'field'},[E('span',{'class':'field-label'},_('New password')),password]),E('label',{'class':'field'},[E('span',{'class':'field-label'},_('Existing bcrypt hash')),hash]),E('button',{'class':'cbi-button','click':function(){row.remove();accountDirty=true;dirty=true;update();}},_('Remove account'))]);
			row.account=function(){if(password.value && hash.value)return {username:username.value,password:password.value,hash:hash.value};return Object.assign({username:username.value},password.value ? {password:password.value} : hash.value ? {hash:hash.value} : {retain:true});};accountRows.appendChild(row);
		}
		function loadAccounts(){accountRows.replaceChildren();var selected=scope.value;var ref=selected=='global' ? config.auth?.basic?.profile : config.sites.find(function(site){return site.domain==selected;})?.auth?.profile;(current.basic_profiles?.[ref] || []).forEach(accountRow);if(!accountRows.children.length)accountRow();}
		accountRows.addEventListener('input',function(){accountDirty=true;dirty=true;update();});loadAccounts();
		accountsNode=E('div',{'class':'caddy-app form-section'},[E('h3',{},_('Basic Auth accounts')),E('p',{},_('Passwords are hashed on the router. Existing passwords and hashes are never read back. Remove an account row to delete it. Save accounts updates the draft; apply activates the change.')),accountRows,E('button',{'class':'cbi-button','click':function(){accountRow();accountDirty=true;dirty=true;update();}},_('Add account')),' ',E('button',{'class':'button primary cbi-button cbi-button-save','click':function(){busy=true;update();return map.parse().then(function(){return saveBasic(scope.value,values(),Array.from(accountRows.children).map(function(row){return row.account();}),current.draft_revision);}).then(result).then(function(saved){current=saved;config=Object.assign(values(),saved.draft,{manual_caddyfile:manual.value});config.sites.forEach(function(site){map.data.sections('json','sites').forEach(function(buffer){if(buffer.domain==site.domain)map.data.set('json',buffer['.name'],'auth',site.auth);});});dirty=false;accountDirty=false;loadAccounts();}).catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');}).finally(function(){busy=false;update();caddyApply.refreshChanges();});}},_('Save accounts to draft'))]);
		function update() {
			if(serviceStrip)serviceStrip.updateSnapshot(current);
			filterSites();
			sourceStatus.textContent = mode == 'manual' ? _('Draft source: complete Caddyfile. Retained form settings are read-only and do not participate. Service and autostart remain available in Global settings.') : _('Draft source: form configuration. The separate manual Caddyfile is preserved.');
			affected.textContent=current.affected_domains?.length ? _('Applying global authentication changes affects:')+' '+current.affected_domains.join(', ') : '';
			if(accountsNode) accountsNode.querySelectorAll('input,select,button').forEach(function(field){field.disabled=busy || map.readonly || mode=='manual';});
			if(page=='config') {
				var manualPanel=manual.parentNode, previewPanel=code.parentNode;
				if(manualPanel)manualPanel.hidden=mode!='manual';
				if(previewPanel)previewPanel.hidden=mode=='manual';
			}
			manual.disabled = busy || map.readonly || mode != 'manual';
			if(formNode) formNode.querySelectorAll('input,select,textarea,button').forEach(function(field) {field.disabled = busy || map.readonly || mode == 'manual';});
			status.textContent = _('Saved draft revision') + ': ' + current.draft_revision + ' · ' + _('Active revision') + ': ' + current.active_revision + ' · ' + _('Active source') + ': ' + (current.active_source || _('No managed revision')) + (current.pending ? ' · ' + _('Saved changes pending application') : '') + (dirty ? ' · ' + _('Unsaved edits') : '') + (current.recovery_required ? ' · ' + _('Recovery required: start or restart Caddy') : '');
			saveButton.disabled = busy || map.readonly || !dirty;
			applyButton.disabled = busy || map.readonly || (!dirty && !current.pending);
		}
		function filterSites() {
			if(!formNode || page!='configuration')return;
			var sites=map.data.sections('json','sites'),matches=sites.filter(function(site){return (!searchQuery || [site.name,site.domain].concat(site.upstreams || []).join(' ').toLowerCase().includes(searchQuery)) && (statusFilter=='all' || (site.enabled!==false)==(statusFilter=='enabled'));});
			var visible=matches.map(function(site){return site['.name'];});
			formNode.querySelectorAll('.cbi-section-table-row[data-sid]').forEach(function(row){row.hidden=visible.indexOf(row.getAttribute('data-sid'))<0;});
			siteCount.textContent=_('Matching sites')+': '+matches.length+' / '+sites.length;
		}
		function rememberForm() {
			// JSONMap writes remain in this editor buffer; no RPC or persistence.
			map.children.forEach(function(section) {section.cfgsections().forEach(function(sid) {section.children.forEach(function(option) {var value=option.formvalue(sid);if(value!=null) option.write(sid,value);});});});
		}
		function values() {
			function get(section,key) {return map.data.get('json',section,key) || '';}
			var auth=Object.assign({},config.auth);if(get('authelia','backend') || get('authelia','portal'))auth.authelia={backend:get('authelia','backend'),uri:get('authelia','uri') || '/api/authz/forward-auth',portal:get('authelia','portal')};else delete auth.authelia;
			return Object.assign({},config,{auth:auth,mode:mode,manual_caddyfile:manual.value,version:2,settings:Object.assign({},config.settings,{access_log:map.data.get('json','settings','access_log')===true,http_port:+get('settings','http_port'),https_port:+get('settings','https_port'),email:get('settings','email'),storage:get('settings','storage')}),sites:map.data.sections('json','sites').map(function(site) {return {name:site.name || '',enabled:site.enabled!==false,domain:site.domain || '',upstreams:site.upstreams || [],balance:site.balance || 'round_robin',path:site.path || '',strip:site.strip === true || site.strip === 'true' || site.strip === '1',challenge:site.challenge || 'global',advanced_snippet:site.advanced_snippet || '',auth:site.auth || {mode:'none'}};})});
		}
		function validateConfig(data) {
			if(data.mode=='manual')return data;
			var domains={}; data.sites.forEach(function(site) {
				if(site.enabled!==false && site.domain.startsWith('*.') && (site.challenge=='global' ? data.settings.default_challenge || 'http-01' : site.challenge)!='dns-01') throw new Error(_('Wildcard domains require DNS-01'));
				if(domains[site.domain]) throw new Error(_('Each domain must have exactly one site')); domains[site.domain]=true;
				if(!site.upstreams.length || site.upstreams.some(function(url){return url.split(':')[0] !== site.upstreams[0].split(':')[0];})) throw new Error(_('Backends must use the same protocol'));
				if(site.strip && !site.path.endsWith('/*')) throw new Error(_('Prefix removal requires a path ending in /*'));
			}); return data;
		}
		function result(response) {if (!response.ok) throw new Error((response.error || _('Configuration operation failed'))+(response.diagnostic?.line ? ' · '+(response.diagnostic.source=='advanced_snippet'?_('Advanced snippet line'):_('Caddyfile line'))+' '+response.diagnostic.line : ''));return response;}
		function showPreview(data) {var n=++sequence;return Promise.resolve().then(function(){return preview(validateConfig(data));}).then(result).then(function(response) {if(n==sequence) code.textContent=JSON.stringify(response.config,null,2);return JSON.stringify(response.config,null,2);});}
		function exportPreview(copy) {
			if(map.readonly || busy)return Promise.resolve();
			return (mode=='manual'?Promise.resolve():map.parse()).then(function(){return showPreview(values());}).then(function(text){if(copy){if(typeof navigator!='undefined' && navigator.clipboard)return navigator.clipboard.writeText(text);var field=E('textarea',{'rows':14,'readonly':true,'aria-label':_('Protected configuration preview')},text);ui.showModal(_('Copy preview'),[field,E('button',{'class':'button','click':ui.hideModal},_('Close'))]);field.focus();field.select();return;}var url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=E('a',{'href':url,'download':'caddy-preview.redacted.json'});document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},0);}).catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');});
		}
		function syncAuth(){config.sites.forEach(function(site){map.data.sections('json','sites').forEach(function(buffer){if(buffer.domain==site.domain)map.data.set('json',buffer['.name'],'auth',site.auth);});});}
		function perform(wantApply) {
			busy=true;update();
			return (mode == 'manual' ? Promise.resolve() : map.parse()).then(function() {
				return dirty ? (accountDirty ? saveBasic(scope.value,values(),Array.from(accountRows.children).map(function(row){return row.account();}),current.draft_revision) : saveDraft(validateConfig(values()),current.draft_revision)).then(result).then(function(saved) {current=saved;config=Object.assign(values(),saved.draft,{manual_caddyfile:manual.value});syncAuth();dirty=false;accountDirty=false;loadAccounts();}) : null;
			}).then(function() {return wantApply ? caddyApply.confirmImpact(current).then(function(){return apply(current.draft_revision);}).then(result).then(function(active) {current=active;}) : null;})
				.then(function() {return showPreview(values());})
				.catch(function(error) {ui.addNotification(null,E('p',{},error.message),'error');return getDraft().then(function(saved) {current=saved;});})
				.finally(function() {busy=false;update();caddyApply.refreshChanges();}).then(function() {return !dirty;});
		}
		saveButton=E('button',{'class':'button primary cbi-button cbi-button-save','click':function(){return perform(false);}},_('Save'));
		applyButton=E('button',{'class':'button primary cbi-button cbi-button-apply','click':function(){return perform(true);}},_('Save & Apply'));
		window.addEventListener('beforeunload',function(event) {if(dirty) {event.preventDefault();event.returnValue='';}});
		document.addEventListener('click',function(event) {
			var link=event.target.closest('a[href]');
			if(!dirty || !link || event.defaultPrevented || event.ctrlKey || event.metaKey || link.target=='_blank' || link.href==location.href) return;
			event.preventDefault();
			ui.showModal(_('Unsaved edits'),[E('p',{},_('Save this draft before leaving, or discard unsaved edits?')),E('div',{'class':'right'},[E('button',{'class':'cbi-button','click':ui.hideModal},_('Cancel')),' ',E('button',{'class':'cbi-button','click':function(){dirty=false;ui.hideModal();location.href=link.href;}},_('Discard and leave')),' ',E('button',{'class':'button primary cbi-button cbi-button-save','click':function(){ui.hideModal();perform(false).then(function(saved){if(saved)location.href=link.href;});}},_('Save and leave'))])]);
		});
		update();
		if(page=='settings') {
			var renderSettings=settingsSection.render,renderAuth=authSection.render;
			settingsSection.render=function(){return Promise.resolve(renderSettings.apply(this,arguments)).then(function(node){return layout.panel(_('Service settings'),'',node);});};
			authSection.render=function(){return Promise.resolve(renderAuth.apply(this,arguments)).then(function(node){return layout.panel(_('Auth configuration'),'', [node,accountsNode]);});};
		}
		return Promise.all([map.render(),page=='settings' ? service.controls() : Promise.resolve(null)]).then(function(rendered) {
			var node=rendered[0],serviceControls=rendered[1];
			formNode=node;update();
			manual.addEventListener('input',function(){dirty=true;update();});
			node.addEventListener('input',function(){dirty=true;update();});
			node.addEventListener('change',function(){dirty=true;map.parse().then(update).catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');});});
			if(initial.draft && !map.readonly) showPreview(initial.draft).catch(function(){});
			var content;
			if(page == 'settings') {
				content = [serviceControls,E('div',{'class':'info-note','hidden':mode!='manual'}, [sourceStatus]), node,
					E('p',{'class':'info-note'},_('Public HTTP-01 requires Internet port 80 to reach the HTTP port. TLS-ALPN-01 requires Internet port 443 to reach the HTTPS port. This application does not configure NAT, firewall, DNS or uhttpd.'))];
			}
			else if(page == 'config') {
				content = [E('div',{'class':'field'},[E('label',{},_('Configuration source')),E('select',{'disabled':map.readonly,'change':function(event){var selected=event.target.value;event.target.value=mode;if(busy)return;if(selected==mode)return;ui.showModal(_('Switch configuration source'),[E('p',{},selected=='manual'?_('The complete Caddyfile will become the source after Save & Apply. Form content is preserved and becomes read-only.'):_('Retained form content will become the source after Save & Apply. Manual content is preserved.')),E('div',{'class':'right'},[E('button',{'class':'cbi-button','click':ui.hideModal},_('Cancel')),' ',E('button',{'class':'cbi-button cbi-button-action','click':function(){if(accountDirty){ui.hideModal();ui.addNotification(null,E('p',{},_('Save account edits before switching configuration source.')),'warning');return;}if(mode=='form')rememberForm();mode=selected;event.target.value=mode;dirty=true;update();ui.hideModal();}},_('Switch source'))])]);}},[E('option',{'value':'form','selected':mode=='form'},_('Form configuration')),E('option',{'value':'manual','selected':mode=='manual'},_('Complete Caddyfile'))]),sourceStatus]),
					layout.panel(_('Configuration file'), _('Form mode previews protected Caddy JSON; manual mode edits a Caddyfile. Copy and download always export the protected JSON preview.'), [
						E('div',{'class':'field','hidden':mode!='manual'}, [E('label',{},_('Separate complete Caddyfile')), manual]),
						E('div',{'class':'config-preview','hidden':mode=='manual'}, [code]),
						E('p',{'class':'info-note'},_('Privileged server configuration: only trusted administrators should edit it. Local admin and managed filesystem storage are enforced; imports and environment expansion are unsupported.'))
					], [E('button',{'class':'button','disabled':map.readonly,'click':function(){return showPreview(values()).catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');});}},_('Refresh preview')),E('button',{'class':'button','disabled':map.readonly,'click':function(){return exportPreview(true);}},_('Copy preview')),E('button',{'class':'button','disabled':map.readonly,'click':function(){return exportPreview(false);}},_('Download preview'))])];
			}
			else {
				content = [serviceStrip=layout.serviceStrip(current),E('div',{'class':'info-note','hidden':mode!='manual'}, [sourceStatus, E('a',{'href':L.url('admin/services/caddy/config')},_('Configuration file'))]),
					layout.panel(_('Site list'), _('Configure a domain, backends and certificate verification for each site.'), [
						E('div',{'class':'toolbar'}, [E('input',{'type':'search','placeholder':_('Search name, domain or backend'),'aria-label':_('Search name, domain or backend'),'input':function(event){searchQuery=event.target.value.toLowerCase();filterSites();}}),E('select',{'aria-label':_('Filter site status'),'change':function(event){statusFilter=event.target.value;filterSites();}},[E('option',{'value':'all'},_('All sites')),E('option',{'value':'enabled'},_('Enabled')),E('option',{'value':'disabled'},_('Disabled'))]),siteCount]),
						E('div',{'class':'site-table'},[node]),
						E('p',{'class':'readonly-note'},_('Certificates are issued and renewed automatically by Caddy. WebSocket upgrades are supported.'))
					])];
			}
			var title = page == 'settings' ? _('Global settings') : page == 'config' ? _('Configuration file') : _('Reverse proxies');
			var description = page == 'configuration' ? _('Connect domains to your services; Caddy manages HTTPS automatically.') : _('Saving changes updates the draft. Applying validates and hot loads Caddy.');
			update();
			return layout.page(page, title, description, content.concat([
				E('div',{'class':'apply-bar'},[E('div',{},[status,affected]),E('div',{'class':'actions'},[saveButton,applyButton])])
			]));
		});
	},
	handleSave:null,handleSaveApply:null,handleReset:null
});
