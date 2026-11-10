'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require caddy.layout as layout';

var status = rpc.declare({ object: 'luci.caddy', method: 'status', expect: { '': {} } });
var draft = rpc.declare({ object: 'luci.caddy', method: 'draft_get', expect: { '': {} } });
var diagnostics=rpc.declare({object:'luci.caddy',method:'diagnostics',expect:{'':{}}});
var action = rpc.declare({ object: 'luci.caddy', method: 'action', params: ['action'], expect: { '': {} } });

return view.extend({
	load: function() { return Promise.all([status(), draft(),diagnostics()]); },
	render: function(initial) {
		var state = E('strong', { 'role': 'status', 'aria-live': 'polite' });
		var snapshot = initial[1], config = snapshot.draft, settings = config && config.settings || {}, sites = config && config.sites || [];
		var device=initial[2] || {};
		var uptime=E('strong'),memory=E('strong');
		var emblem = E('span', { 'class': 'status-emblem', 'aria-hidden': 'true' });
		var info = E('div');
		var controls = E('div', { 'class': 'actions' });
		var pending = E('span', { 'role': 'status', 'aria-live': 'polite' });
		var busy = false;
		var readonly = !L.hasViewPermission();
		var buttons = {};

		function update(data) {
			uptime.textContent=data.running===false?_('Stopped'):layout.duration(data.uptime_seconds);
			memory.textContent=data.running===false?'—':layout.memory(data.memory_kib);
			state.textContent = data.running == null ? _('Unknown') : data.running ? _('Running') : _('Stopped');
			emblem.textContent = data.running ? '✓' : '□';
			if (data.error)
				state.appendChild(E('p', { 'class': 'alert-message warning' }, data.error));
			info.replaceChildren(
				layout.row(_('OpenWrt'),device.firmware ? [device.firmware.version,device.firmware.revision].filter(Boolean).join(' · '):_('Unknown')),
				layout.row(_('Architecture (kernel / APK)'),device.architecture ? [device.architecture.kernel,device.architecture.apk].filter(Boolean).join(' / '):_('Unknown')),
				layout.row(_('Packaged core source'),_('Official Caddy custom download · Cloudflare')),
				layout.row(_('Core APK'),device.package?.version || _('Unknown')),
				layout.row(_('Caddy version'), data.version || _('Not installed')),
			layout.row(_('Cloudflare DNS'), (data.modules || []).find(function(m) { return m.indexOf('dns.providers.cloudflare') == 0; }) || _('Not installed')),
				E('details', {}, [E('summary', {}, _('Installed modules')), E('pre', { 'style': 'white-space: pre-wrap; overflow-wrap: anywhere' }, (data.modules || []).join('\n') || _('No module information available'))])
			);
			Object.keys(buttons).forEach(function(name) {
				buttons[name].disabled = busy || readonly || !data.installed || !data.running;
			});
		}
		function perform(name) {
			if (busy) return;
			busy = true;
			pending.textContent = _('Working…');
			Object.keys(buttons).forEach(function(key) { buttons[key].disabled = true; });
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
		[['restart', _('Restart')], ['reload', _('Reload active configuration')]].forEach(function(item) {
			buttons[item[0]] = E('button', { 'class': 'cbi-button cbi-button-action', 'click': function() { return perform(item[0]); } }, item[1]);
			controls.appendChild(buttons[item[0]]);
			controls.appendChild(document.createTextNode(' '));
		});
		controls.appendChild(pending);
		update(initial[0]);
		poll.add(function() { return busy ? Promise.resolve() : status().then(update); }, 5);
		return layout.page('overview', _('Overview'), _('View service status, listener ports and configuration.'), [
			E('section', { 'class': 'status-strip' }, [
				E('div', { 'class': 'status-service' }, [emblem, E('div', {}, [E('small', {}, 'Caddy'), state])]),
				E('div', { 'class': 'status-metric' }, [E('small', {}, _('Draft enabled / total sites')), E('strong', {}, config?.mode=='manual'?_('Manual mode'):sites.filter(function(site){return site.enabled!==false;}).length+' / '+sites.length)]),
				E('div', { 'class': 'status-metric' }, [E('small', {}, _('Active revision')), E('strong', {}, String(snapshot.active_revision))]),
				E('div',{'class':'status-metric'},[E('small',{},_('Draft HTTPS port')),E('strong',{},config?.mode=='manual'?_('Manual mode'):String(settings.https_port || '—'))]),
				E('div',{'class':'status-metric'},[E('small',{},_('Uptime')),uptime]),
				E('div',{'class':'status-metric'},[E('small',{},_('Resident memory')),memory])
			]),
			E('div', { 'class': 'two-column' }, [
				layout.panel(_('Service information'), '', [info,
					controls
				]),
				layout.panel(_('Configuration summary'), _('Saved draft settings; service operations use the active configuration.'), [
					layout.row(_('Configuration source'), config ? (config.mode == 'manual' ? _('Complete Caddyfile') : _('Form configuration')) : _('No managed revision')),
					layout.row(_('Internal HTTP port'), settings.http_port),
					layout.row(_('Internal HTTPS port'), settings.https_port),
					layout.row(_('Persistent storage directory'), settings.storage),
					layout.row(_('Saved draft revision'), snapshot.draft_revision),
					layout.row(_('Draft Authelia sites'),config?.mode=='manual'?_('Manual mode'):sites.filter(function(site){return site.enabled!==false && site.auth?.mode=='authelia';}).length),
					layout.row(_('Default verification method'),(settings.default_challenge || 'http-01').toUpperCase()),
					layout.row(_('Configuration state'), snapshot.pending ? _('Pending application') : _('No pending changes'))
				])
			]),
			layout.note(_('Startup, restart and reload use the last successfully applied configuration. This application does not change uhttpd, DNS or firewall settings.'))
		]);
	},
	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
