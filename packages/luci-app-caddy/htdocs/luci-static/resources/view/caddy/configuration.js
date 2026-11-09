'use strict';
'require view';
'require form';
'require rpc';
'require ui';

var getDraft = rpc.declare({object:'luci.caddy',method:'draft_get',expect:{'':{}}});
var saveDraft = rpc.declare({object:'luci.caddy',method:'draft_save',params:['config','expected_revision'],expect:{'':{}}});
var preview = rpc.declare({object:'luci.caddy',method:'config_preview',params:['config'],expect:{'':{}}});
var apply = rpc.declare({object:'luci.caddy',method:'config_apply',params:['expected_revision'],expect:{'':{}}});

return view.extend({
	load: function() {return getDraft();},
	render: function(initial) {
		var current = initial;
		var config = initial.draft || {version:2,settings:{http_port:10080,https_port:10443,email:'',storage:'/etc/caddy/data'},sites:[{domain:'',upstreams:['http://127.0.0.1:8080'],balance:'round_robin',path:'',strip:false,challenge:'http-01'}]};
		var map = new form.JSONMap({settings:Object.assign({},config.settings),sites:config.sites.map(function(site) {return Object.assign({},site);})}, _('HTTPS sites'), _('Saving changes only updates the draft. Applying validates and hot loads Caddy; certificate issuance continues asynchronously.'));
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
		section = map.section(form.NamedSection,'settings','settings',_('Global settings'));
		[['http_port',_('Internal HTTP port')],['https_port',_('Internal HTTPS port')]].forEach(function(field) {var o=section.option(form.Value,field[0],field[1]);o.datatype='port';o.rmempty=false;});
		option = section.option(form.Value,'email',_('ACME contact email'));
		option.validate = function(sid,value) {return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || _('Invalid email');};
		option = section.option(form.Value,'storage',_('Persistent storage directory'));option.rmempty=false;
		option.validate = function(sid,value) {return /^\/[a-zA-Z0-9_\/-]+$/.test(value) && !value.includes('..') && value != '/' || _('Use an absolute directory without parent segments');};
		var dirty = false, busy = false, sequence = 0;
		var siteSection=map.children[0];
		['handleAdd','handleRemove'].forEach(function(name) {var original=siteSection[name];siteSection[name]=function() {dirty=true;update();return original.apply(this,arguments);};});
		var status = E('p',{'role':'status','aria-live':'polite'});
		var code = E('pre',{'style':'white-space:pre-wrap;overflow-wrap:anywhere'},_('Save or preview to generate configuration.'));
		var saveButton, applyButton;
		function update() {
			status.textContent = _('Saved draft revision') + ': ' + current.draft_revision + ' · ' + _('Active revision') + ': ' + current.active_revision + (current.pending ? ' · ' + _('Saved changes pending application') : '') + (dirty ? ' · ' + _('Unsaved edits') : '') + (current.recovery_required ? ' · ' + _('Recovery required: start or restart Caddy') : '');
			saveButton.disabled = busy || map.readonly || !dirty;
			applyButton.disabled = busy || map.readonly || (!dirty && !current.pending);
		}
		function values() {
			function get(section,key) {return map.data.get('json',section,key) || '';}
			return {version:2,settings:Object.assign({},config.settings,{http_port:+get('settings','http_port'),https_port:+get('settings','https_port'),email:get('settings','email'),storage:get('settings','storage')}),sites:map.data.sections('json','sites').map(function(site) {return {domain:site.domain || '',upstreams:site.upstreams || [],balance:site.balance || 'round_robin',path:site.path || '',strip:site.strip === true || site.strip === 'true' || site.strip === '1',challenge:site.challenge || 'http-01'};})};
		}
		function validateConfig(data) {
			var domains={}; data.sites.forEach(function(site) {
				if(site.domain.startsWith('*.') && site.challenge!='dns-01') throw new Error(_('Wildcard domains require DNS-01'));
				if(domains[site.domain]) throw new Error(_('Each domain must have exactly one site')); domains[site.domain]=true;
				if(!site.upstreams.length || site.upstreams.some(function(url){return url.split(':')[0] !== site.upstreams[0].split(':')[0];})) throw new Error(_('Backends must use the same protocol'));
				if(site.strip && !site.path.endsWith('/*')) throw new Error(_('Prefix removal requires a path ending in /*'));
			}); if(!data.sites.length) throw new Error(_('Configure at least one site')); return data;
		}
		function result(response) {if (!response.ok) throw new Error(response.error || _('Configuration operation failed'));return response;}
		function showPreview(data) {var n=++sequence;return preview(validateConfig(data)).then(result).then(function(response) {if(n==sequence) code.textContent=JSON.stringify(response.config,null,2);});}
		function perform(wantApply) {
			busy=true;update();
			return map.parse().then(function() {
				return dirty ? saveDraft(validateConfig(values()),current.draft_revision).then(result).then(function(saved) {current=saved;dirty=false;}) : null;
			}).then(function() {return wantApply ? apply(current.draft_revision).then(result).then(function(active) {current=active;}) : null;})
				.then(function() {return showPreview(values());})
				.catch(function(error) {ui.addNotification(null,E('p',{},error.message),'error');return getDraft().then(function(saved) {current=saved;});})
				.finally(function() {busy=false;update();});
		}
		saveButton=E('button',{'class':'cbi-button cbi-button-save','click':function(){return perform(false);}},_('Save'));
		applyButton=E('button',{'class':'cbi-button cbi-button-apply','click':function(){return perform(true);}},_('Save & Apply'));
		window.addEventListener('beforeunload',function(event) {if(dirty) {event.preventDefault();event.returnValue='';}});
		update();
		return map.render().then(function(node) {
			node.addEventListener('input',function(){dirty=true;update();});
			node.addEventListener('change',function(){dirty=true;update();});
			if(initial.draft) showPreview(initial.draft).catch(function(){});
			return E('div',{},[
				E('ul',{'class':'cbi-tabmenu'},[E('li',{},E('a',{'href':L.url('admin/services/caddy')},_('Overview'))),E('li',{'class':'cbi-tab'},E('a',{'href':L.url('admin/services/caddy/configuration')},_('Configuration'))),E('li',{},E('a',{'href':L.url('admin/services/caddy/tls')},_('TLS certificates')))]),
				status,node,
				E('p',{},_('Public HTTP-01 requires Internet port 80 to reach the internal HTTP port. TLS-ALPN-01 requires Internet port 443 to reach the internal HTTPS port. This application does not configure NAT, firewall, DNS or uhttpd.')),
				E('details',{},[E('summary',{},_('Generated JSON preview')),code,E('button',{'class':'cbi-button','click':function(){return map.parse().then(function(){return showPreview(values());}).catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');});}},_('Refresh preview'))]),
				E('div',{'class':'cbi-page-actions','style':'position:sticky;bottom:0;background:var(--background-color,#fff);padding:1em;z-index:5'},[saveButton,' ',applyButton])
			]);
		});
	},
	handleSave:null,handleSaveApply:null,handleReset:null
});
