'use strict';
'require baseclass';

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
