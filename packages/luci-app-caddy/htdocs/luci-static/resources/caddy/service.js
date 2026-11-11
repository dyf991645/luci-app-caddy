'use strict';
'require baseclass';
'require rpc';
'require ui';
'require caddy.layout as layout';
'require caddy.apply as applyFlow';

var status = rpc.declare({object:'luci.caddy',method:'status',expect:{'':{}}});
var save = rpc.declare({object:'luci.caddy',method:'service_save',params:['running','enabled'],expect:{'':{}}});

return baseclass.extend({
	controls: function() {
		return status().then(function(initial) {
			var current=initial.desired || initial, busy=false, readonly=!L.hasViewPermission();
			var running=E('input',{'id':'caddy-service-running','type':'checkbox','aria-label':_('Run Caddy'),'checked':current.running || null});
			var boot=E('input',{'id':'caddy-service-boot','type':'checkbox','aria-label':_('Start on boot'),'checked':current.enabled || null});
			var message=E('p',{'role':'status','aria-live':'polite'});
			function pending() {return running.checked!==!!current.running || boot.checked!==!!current.enabled;}
			function update() {
				running.disabled=boot.disabled=busy || readonly || !initial.installed;
				apply.disabled=running.disabled || !pending();
				message.textContent=busy ? _('Working…') : pending() ? _('Service changes not saved') : _('Service settings saved');
			}
			var apply=E('button',{'class':'button primary','click':function() {
				if(busy || readonly || !initial.installed || !pending())return Promise.resolve();
				busy=true;update();
				return save(running.checked,boot.checked).then(function(result) {
					if(!result.ok)throw new Error(result.error || _('Service operation failed'));
					current={running:running.checked,enabled:boot.checked};return applyFlow.refreshChanges();
				}).catch(function(error) {ui.addNotification(null,E('p',{},error.message),'error');})
					.finally(function(){busy=false;update();});
			}},_('Save'));
			running.addEventListener('change',update);boot.addEventListener('change',update);update();
			return layout.panel(_('Service control'),_('Save service settings, then use LuCI Save & Apply to apply them. Starting uses the applied configuration.'),[
				E('div',{'class':'settings-control-row'},[E('label',{'for':'caddy-service-running'},_('Run Caddy')),running]),
				E('div',{'class':'settings-control-row'},[E('label',{'for':'caddy-service-boot'},_('Start on boot')),boot]),
				E('div',{'class':'actions'},[apply]),message
			]);
		}).catch(function(error) {
			return layout.note(_('Unable to read service state')+': '+error.message);
		});
	}
});
