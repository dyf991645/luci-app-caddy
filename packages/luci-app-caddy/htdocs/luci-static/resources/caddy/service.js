'use strict';
'require baseclass';
'require rpc';
'require ui';
'require caddy.layout as layout';

var status = rpc.declare({object:'luci.caddy',method:'status',expect:{'':{}}});
var action = rpc.declare({object:'luci.caddy',method:'action',params:['action'],expect:{'':{}}});

return baseclass.extend({
	controls: function() {
		return status().then(function(initial) {
			var current=initial, busy=false, readonly=!L.hasViewPermission();
			var running=E('input',{'type':'checkbox','aria-label':_('Run Caddy'),'checked':!!initial.running});
			var boot=E('input',{'type':'checkbox','aria-label':_('Start on boot'),'checked':!!initial.enabled});
			var message=E('p',{'role':'status','aria-live':'polite'});
			function pending() {return running.checked!==!!current.running || boot.checked!==!!current.enabled;}
			function update() {
				running.disabled=boot.disabled=busy || readonly || !current.installed;
				apply.disabled=running.disabled || !pending();
				message.textContent=busy ? _('Working…') : pending() ? _('Service changes not applied') : _('Service settings applied');
			}
			function invoke(name) {return action(name).then(function(result) {if(!result.ok)throw new Error(result.error || _('Service operation failed'));});}
			var apply=E('button',{'class':'button primary','click':function() {
				if(busy || readonly || !current.installed || !pending())return Promise.resolve();
				busy=true;update();
				// Re-read actual state before acting; checkbox edits never issue RPC writes.
				return status().then(function(data) {
					current=data;
					if(!data.installed)throw new Error(_('Not installed'));
					return running.checked!==!!data.running ? invoke(running.checked?'start':'stop') : null;
				}).then(function() {return boot.checked!==!!current.enabled ? invoke(boot.checked?'enable':'disable') : null;})
					.catch(function(error) {ui.addNotification(null,E('p',{},error.message),'error');})
					.finally(function() {return status().then(function(data){current=data;}).catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');}).finally(function(){busy=false;update();});});
			}},_('Apply service settings'));
			running.addEventListener('change',update);boot.addEventListener('change',update);update();
			return layout.panel(_('Service control'),_('Select the service state, then apply. Starting uses the last applied configuration. These controls also work in manual mode.'),[
				E('div',{'class':'field'},[E('label',{'class':'inline-check'},[running,_('Run Caddy')])]),
				E('div',{'class':'field'},[E('label',{'class':'inline-check'},[boot,_('Start on boot')])]),
				E('div',{'class':'actions'},[apply]),message
			]);
		}).catch(function(error) {
			return layout.note(_('Unable to read service state')+': '+error.message);
		});
	}
});
