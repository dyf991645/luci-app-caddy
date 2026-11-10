'use strict';
'require baseclass';
'require rpc';
'require poll';
'require ui';

var serviceStatus = rpc.declare({object:'luci.caddy',method:'status',expect:{'':{}}});
var serviceAction = rpc.declare({object:'luci.caddy',method:'action',params:['action'],expect:{'':{}}});

/* Content only: LuCI owns the top navigation, theme, session and page tabs. */
return baseclass.extend({
	duration: function(seconds) {if(seconds==null)return _('Unknown');var n=Math.floor(seconds),days=Math.floor(n/86400);return (days?days+'d ':'')+[Math.floor(n/3600)%24,Math.floor(n/60)%60,n%60].map(function(x){return String(x).padStart(2,'0');}).join(':');},
	memory: function(kib) {return kib==null?_('Unknown'):(kib/1024).toFixed(1)+' MiB';},
	page: function(key, title, description, children, actions) {
		if (!document.querySelector('link[data-caddy-layout]'))
			document.head.appendChild(E('link', { 'rel': 'stylesheet', 'href': L.resource('caddy/caddy.css') + '?v=16', 'data-caddy-layout': '' }));
		return E('div', { 'class': 'caddy-app', 'data-page': key }, [
			E('div', { 'class': 'heading' }, [
				E('div', {}, [E('div', { 'class': 'heading-title' }, E('h1', {}, title)), E('p', {}, description)]),
				E('div', { 'class': 'heading-actions actions' }, actions || [])
			]),
			E('div', { 'class': 'caddy-content' }, children)
		]);
	},
	serviceStrip: function(snapshot) {
		var layoutDuration=this.duration,layoutMemory=this.memory;
		var state = E('strong', { 'role':'status', 'aria-live':'polite' }, _('Unknown'));
		var emblem = E('span', { 'class':'status-emblem', 'aria-hidden':'true' }, '□');
		var controls = E('div', { 'class':'status-actions actions' });
		var busy = false, buttons = [], current = {};
		var uptime=E('strong',{'aria-label':_('Uptime')}),memory=E('strong',{'aria-label':_('Resident memory')});
		function update(data) {
			current = data;
			uptime.textContent=data.running===false?_('Stopped'):layoutDuration(data.uptime_seconds);
			memory.textContent=data.running===false?'—':layoutMemory(data.memory_kib);
			state.textContent = data.running == null ? _('Unknown') : data.running ? _('Running') : _('Stopped');
			emblem.textContent = data.running ? '✓' : '□';
			buttons.forEach(function(button) { button.disabled = busy || !L.hasViewPermission() || !data.installed || !data.running; });
		}
		[['reload','Reload']].forEach(function(item) {
			var button = E('button', { 'class':'button small', 'disabled':true, 'click':function() {
				if (busy) return;
				busy = true; update(current);
				return serviceAction(item[0]).then(function(response) { if (!response.ok) throw new Error(response.error || _('Service operation failed')); })
					.catch(function(error) { ui.addNotification(null,E('p',{},error.message),'error'); })
					.finally(function() { busy=false; return serviceStatus().then(update); });
			} }, item[1]);
			buttons.push(button); controls.appendChild(button);
		});
		serviceStatus().then(update).catch(function() { update({}); });
		poll.add(function() { return busy ? Promise.resolve() : serviceStatus().then(update); }, 5);
		var siteCount = E('strong', {'aria-label':_('Saved sites')});
		var httpsPort=E('strong',{'aria-label':_('HTTPS port')});
		var activeRevision = E('strong', {'aria-label':_('Active revision')});
		var strip = E('section', { 'class':'status-strip' }, [
			E('div', { 'class':'status-service' }, [emblem,E('div',{},[E('small',{},'Caddy'),state])]),
			E('div', { 'class':'status-metric' }, [E('small',{},_('Enabled sites')),siteCount]),
			E('div', { 'class':'status-metric' }, [E('small',{},_('Active revision')),activeRevision]),
			E('div',{'class':'status-metric'},[E('small',{},_('HTTPS port')),httpsPort]),
			E('div',{'class':'status-metric'},[E('small',{},_('Uptime')),uptime]),
			E('div',{'class':'status-metric'},[E('small',{},_('Resident memory')),memory]),
			controls
		]);
		strip.updateSnapshot = function(value) {
			var sites=value.draft?.sites || [],manual=value.draft?.mode=='manual';
			siteCount.textContent=manual?_('Manual mode'):sites.filter(function(site){return site.enabled!==false;}).length+' / '+sites.length;
			httpsPort.textContent=manual?_('Manual mode'):String(value.draft?.settings?.https_port || '—');
			activeRevision.textContent = String(value.active_revision);
		};
		strip.updateSnapshot(snapshot);
		return strip;
	},
	panel: function(title, description, children, actions) {
		return E('section', { 'class': 'panel' }, [
			E('div', { 'class': 'panel-top' }, [E('div', {}, [E('h2', {}, title), description ? E('p', {}, description) : '']), E('div', { 'class': 'actions' }, actions || [])]),
			E('div', { 'class': 'panel-body' }, children)
		]);
	},
	note: function(text) { return E('div', { 'class': 'info-note' }, text); },
	row: function(label, value) { return E('div', { 'class': 'detail-row' }, [E('span', {}, label), E('span', {}, value == null ? _('Unknown') : value)]); },
	badge: function(text, tone) { return E('span', { 'class': 'pill ' + (tone || '') }, text); }
});
