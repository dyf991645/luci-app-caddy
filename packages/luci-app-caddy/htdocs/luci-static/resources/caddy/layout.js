'use strict';
'require baseclass';
'require rpc';
'require poll';
'require ui';

var serviceStatus = rpc.declare({object:'luci.caddy',method:'status',expect:{'':{}}});
var serviceAction = rpc.declare({object:'luci.caddy',method:'action',params:['action'],expect:{'':{}}});

/* Content only: LuCI owns the top navigation, theme, session and page tabs. */
return baseclass.extend({
	page: function(key, title, description, children, actions) {
		if (!document.querySelector('link[data-caddy-layout]'))
			document.head.appendChild(E('link', { 'rel': 'stylesheet', 'href': L.resource('caddy/caddy.css'), 'data-caddy-layout': '' }));
		return E('div', { 'class': 'caddy-app', 'data-page': key }, [
			E('header', { 'class': 'heading' }, [
				E('div', {}, [E('div', { 'class': 'heading-title' }, E('h1', {}, title)), E('p', {}, description)]),
				E('div', { 'class': 'heading-actions actions' }, actions || [])
			]),
			E('div', { 'class': 'caddy-content' }, children)
		]);
	},
	serviceStrip: function(snapshot) {
		var state = E('strong', { 'role':'status', 'aria-live':'polite' }, _('Unknown'));
		var emblem = E('span', { 'class':'status-emblem', 'aria-hidden':'true' }, '□');
		var controls = E('div', { 'class':'status-actions actions' });
		var busy = false, buttons = [], current = {};
		function update(data) {
			current = data;
			state.textContent = data.running == null ? _('Unknown') : data.running ? _('Running') : _('Stopped');
			emblem.textContent = data.running ? '✓' : '□';
			buttons.forEach(function(button) { button.disabled = busy || !L.hasViewPermission() || !data.installed || !data.running; });
		}
		[['reload',_('Reload active configuration')],['restart',_('Restart')]].forEach(function(item) {
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
		return E('section', { 'class':'status-strip' }, [
			E('div', { 'class':'status-service' }, [emblem,E('div',{},[E('small',{},'Caddy'),state])]),
			E('div', { 'class':'status-metric' }, [E('small',{},_('Saved sites')),E('strong',{},String(snapshot.draft && snapshot.draft.sites.length || 0))]),
			E('div', { 'class':'status-metric' }, [E('small',{},_('Active revision')),E('strong',{},String(snapshot.active_revision))]),
			controls
		]);
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
