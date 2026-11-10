'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require caddy.layout as layout';

var status = rpc.declare({ object: 'luci.caddy', method: 'status', expect: { '': {} } });
var draft = rpc.declare({ object: 'luci.caddy', method: 'draft_get', expect: { '': {} } });
var action = rpc.declare({ object: 'luci.caddy', method: 'action', params: ['action'], expect: { '': {} } });

return view.extend({
	load: function() { return Promise.all([status(), draft()]); },
	render: function(initial) {
		var state = E('strong', { 'role': 'status', 'aria-live': 'polite' });
		var snapshot = initial[1], config = snapshot.draft, settings = config && config.settings || {}, sites = config && config.sites || [];
		var emblem = E('span', { 'class': 'status-emblem', 'aria-hidden': 'true' });
		var info = E('div');
		var controls = E('div', { 'class': 'actions' });
		var pending = E('span', { 'role': 'status', 'aria-live': 'polite' });
		var busy = false;
		var readonly = !L.hasViewPermission();
		var buttons = {};
		var boot = E('input', { 'type': 'checkbox', 'disabled': readonly });
		function update(data) {
			state.textContent = data.running == null ? _('Unknown') : data.running ? _('Running') : _('Stopped');
			emblem.textContent = data.running ? '✓' : '□';
			if (data.error)
				state.appendChild(E('p', { 'class': 'alert-message warning' }, data.error));
			info.replaceChildren(
				layout.row(_('Caddy version'), data.version || _('Not installed')),
			layout.row(_('Cloudflare DNS'), (data.modules || []).find(function(m) { return m.indexOf('dns.providers.cloudflare') == 0; }) || _('Not installed')),
				E('details', {}, [E('summary', {}, _('Installed modules')), E('pre', { 'style': 'white-space: pre-wrap; overflow-wrap: anywhere' }, (data.modules || []).join('\n') || _('No module information available'))])
			);
			boot.checked = !!data.enabled;
			boot.disabled = busy || readonly || !data.installed;
			Object.keys(buttons).forEach(function(name) {
				buttons[name].disabled = busy || readonly || !data.installed || (name == 'reload' && !data.running);
			});
		}
		function perform(name) {
			if (busy) return;
			busy = true;
			pending.textContent = _('Working…');
			Object.keys(buttons).forEach(function(key) { buttons[key].disabled = true; });
			boot.disabled = true;
			return action(name).then(function(result) {
				if (!result.ok)
					throw new Error(result.error || _('Service operation failed'));
			}).catch(function(error) {
				ui.addNotification(null, E('p', {}, error.message), 'error');
			}).finally(function() {
				busy = false;
				pending.textContent = '';
				return status().then(update);
			});
		}
		[['start', _('Start')], ['stop', _('Stop')], ['restart', _('Restart')], ['reload', _('Reload active configuration')]].forEach(function(item) {
			buttons[item[0]] = E('button', { 'class': 'cbi-button cbi-button-action', 'click': function() { return perform(item[0]); } }, item[1]);
			controls.appendChild(buttons[item[0]]);
			controls.appendChild(document.createTextNode(' '));
		});
		controls.appendChild(pending);
		boot.addEventListener('change', function() { perform(boot.checked ? 'enable' : 'disable'); });
		update(initial[0]);
		poll.add(function() { return busy ? Promise.resolve() : status().then(update); }, 5);
		return layout.page('overview', _('Overview'), _('View service status, listener ports and configuration.'), [
			E('section', { 'class': 'status-strip' }, [
				E('div', { 'class': 'status-service' }, [emblem, E('div', {}, [E('small', {}, 'Caddy'), state])]),
				E('div', { 'class': 'status-metric' }, [E('small', {}, _('Saved sites')), E('strong', {}, String(sites.length))]),
				E('div', { 'class': 'status-metric' }, [E('small', {}, _('Active revision')), E('strong', {}, String(snapshot.active_revision))]),
				E('a', { 'class': 'button status-actions', 'href': L.url('admin/services/caddy/configuration') }, _('Manage sites'))
			]),
			E('div', { 'class': 'two-column' }, [
				layout.panel(_('Service information'), '', [info,
					layout.row(_('Start on boot'), E('label', { 'class': 'inline-check' }, [boot, _('Enabled')])),
					controls, pending
				]),
				layout.panel(_('Configuration summary'), _('Saved draft settings; service operations use the active configuration.'), [
					layout.row(_('Configuration source'), config ? (config.mode == 'manual' ? _('Complete Caddyfile') : _('Form configuration')) : _('No managed revision')),
					layout.row(_('Internal HTTP port'), settings.http_port),
					layout.row(_('Internal HTTPS port'), settings.https_port),
					layout.row(_('Persistent storage directory'), settings.storage),
					layout.row(_('Saved draft revision'), snapshot.draft_revision),
					layout.row(_('Configuration state'), snapshot.pending ? _('Pending application') : _('No pending changes')),
					E('div', { 'class': 'actions', 'style': 'margin-top:20px' }, [
						E('a', { 'class': 'button', 'href': L.url('admin/services/caddy/settings') }, _('Global settings')),
						E('a', { 'class': 'button', 'href': L.url('admin/services/caddy/tls') }, _('TLS certificates'))
					])
				])
			]),
			layout.note(_('Startup, restart and reload use the last successfully applied configuration. This application does not change uhttpd, DNS or firewall settings.'))
		]);
	},
	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
