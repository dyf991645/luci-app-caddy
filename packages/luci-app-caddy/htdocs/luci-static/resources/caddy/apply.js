'use strict';
'require baseclass';
'require ui';

// Shared by every page that can apply the complete saved draft.
return baseclass.extend({
	refreshChanges:function(){return ui.changes.init();},
	confirmImpact: function(current) {
		if (!current.affected_domains?.length) return Promise.resolve();
		return new Promise(function(resolve, reject) {
			ui.showModal(_('Apply global authentication change'), [
				E('p', {}, _('The following domains reference the updated global authentication configuration:')),
				E('ul', {}, current.affected_domains.map(function(domain) {return E('li', {}, domain);})),
				E('div', {'class':'right'}, [
					E('button', {'class':'cbi-button', 'click':function() {
						ui.hideModal(); reject(new Error(_('Application cancelled; draft retained')));
					}}, _('Cancel')), ' ',
					E('button', {'class':'cbi-button cbi-button-apply', 'click':function() {
						ui.hideModal(); resolve();
					}}, _('Apply'))
				])
			]);
		});
	}
});
