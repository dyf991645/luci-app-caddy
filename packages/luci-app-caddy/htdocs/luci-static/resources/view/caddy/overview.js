'use strict';
'require view';
'require rpc';
'require poll';
'require ui';

var status = rpc.declare({ object: 'luci.caddy', method: 'status', expect: { '': {} } });
var action = rpc.declare({ object: 'luci.caddy', method: 'action', params: ['action'], expect: { '': {} } });

return view.extend({
	load: function() { return status(); },
	render: function(initial) {
		var state = E('div', { 'role': 'status', 'aria-live': 'polite' });
		var info = E('div');
		var controls = E('div', { 'class': 'cbi-page-actions' });
		var pending = E('span', { 'role': 'status', 'aria-live': 'polite' });
		var busy = false;
		var readonly = !L.hasViewPermission();
		var buttons = {};
		var boot = E('input', { 'type': 'checkbox', 'disabled': readonly });
		function update(data) {
			state.replaceChildren(E('strong', {}, data.running == null ? _('Unknown') : data.running ? _('Running') : _('Stopped')));
			if (data.error)
				state.appendChild(E('p', { 'class': 'alert-message warning' }, data.error));
			info.replaceChildren(
				E('p', {}, [_('Caddy version'), ': ', data.version || _('Not installed')]),
				E('details', {}, [E('summary', {}, _('Installed modules')), E('pre', { 'style': 'white-space: pre-wrap; overflow-wrap: anywhere' }, data.modules.join('\n') || _('No module information available'))])
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
		update(initial);
		poll.add(function() { return busy ? Promise.resolve() : status().then(update); }, 5);
		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, 'Caddy'),
			E('ul', { 'class': 'cbi-tabmenu' }, [E('li', { 'class': 'cbi-tab' }, E('a', { 'href': L.url('admin/services/caddy') }, _('Overview'))), E('li', {}, E('a', { 'href': L.url('admin/services/caddy/configuration') }, _('Configuration')))]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Service status')), state, info,
				E('p', {}, E('label', {}, [boot, ' ', _('Start on boot')])),
				E('p', {}, _('Startup, restart and reload use the last successfully applied configuration. This application does not change uhttpd, DNS or firewall settings.'))
			]), controls
		]);
	},
	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
