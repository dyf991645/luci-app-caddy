'use strict';
import { readfile, writefile, mkdir, chmod, rename, open, unlink } from 'fs';

// Options are a local test seam, never supplied by RPC callers.
return function(options) {
	let root = options?.root || '/etc/caddy';
	let admin = options?.admin || '127.0.0.1:2019';
	mkdir(root, 0700);
	chmod(root, 0700);
	function read(name, fallback) {
		let text = readfile(root + '/' + name);
		return text == null ? fallback : json(text);
	}
	function write(name, value) {
		let path = root + '/' + name;
		if (writefile(path + '.tmp', sprintf('%J', value)) == null || !chmod(path + '.tmp', 0600) || !rename(path + '.tmp', path))
			die('Unable to persist configuration');
		if (system(['/bin/sync'], 10000) != 0) die('Unable to sync configuration');
	}
	function state(private) {
		let draft = read('draft.json', { revision: 0, config: null });
		let active = read('active-state.json', { revision: 0, config: null });
		let public_config = draft.config == null ? null : json(sprintf('%J', draft.config));
		if (!private && public_config) {
			delete public_config.manual_caddyfile;
			for (let site in public_config.sites) delete site.advanced_snippet;
		}
		return { ok: true, draft: private ? draft.config : public_config, draft_revision: draft.revision, active_revision: active.revision, pending: draft.revision != active.revision, recovery_required: read('transaction.json', null) != null };
	}
	function source_check(text) {
		if (type(text) != 'string' || length(text) > 65536) return 'Caddyfile content must be text up to 64 KiB';
		// Deliberately conservative lexical boundary, not a sandbox. No escaped
		// tokens, imports or process-environment expansion, including in strings.
		if (index(text, '\\') >= 0 || index(text, '`') >= 0 || index(text, '{$') >= 0 || index(lc(text), '{env.') >= 0 || match(text, /(^|[^a-zA-Z0-9_])import([^a-zA-Z0-9_]|$)/))
			return 'Imports, escapes, backticks and environment expansion are unsupported in managed Caddyfile content';
		return null;
	}
	function check(config) {
		if (config?.mode != null && index(['form', 'manual'], config.mode) < 0) return 'Select form or manual configuration source';
		if (config?.manual_caddyfile != null) {
			let error = source_check(config.manual_caddyfile);
			if (error) return error;
		}
		for (let site in config?.sites) {
			if (site.advanced_snippet != null) {
				let error = source_check(site.advanced_snippet);
				if (error) return error;
			}
		}
		if (config?.mode == 'manual') {
			if (!length(trim(config.manual_caddyfile || ''))) return 'Enter a complete Caddyfile';
			return null;
		}
		let g = config?.settings;
		let s = config?.sites?.[0];
		if (config?.version != 1 || !g || length(config.sites) != 1 || !s)
			return 'Configure exactly one site';
		if (type(s.domain) != 'string' || length(s.domain) > 253 || !match(s.domain, /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/))
			return 'Enter a valid non-wildcard domain';
		for (let label in split(s.domain, '.'))
			if (length(label) > 63) return 'Domain labels must not exceed 63 characters';
		if (type(s.backend) != 'string' || !match(s.backend, /^http:\/\/([a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]):[0-9]{1,5}$/))
			return 'Backend must be an HTTP host and explicit port without credentials or paths';
		let port = +split(s.backend, ':')[-1];
		if (port < 1 || port > 65535) return 'Invalid backend port';
		if (index(['http-01', 'tls-alpn-01'], s.challenge) < 0) return 'Unsupported verification method';
		for (let name in ['http_port', 'https_port'])
			if (type(g[name]) != 'int' || g[name] < 1 || g[name] > 65535 || g[name] == +split(admin, ':')[1]) return 'Invalid or reserved listening port';
		if (g.http_port == g.https_port) return 'HTTP and HTTPS ports must differ';
		if (type(g.email) != 'string' || (g.email != '' && !match(g.email, /^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$/))) return 'Invalid ACME contact email';
		if (type(g.storage) != 'string' || !match(g.storage, /^\/[a-zA-Z0-9_\/-]+$/) || index(g.storage, '..') >= 0 || g.storage == '/') return 'Invalid persistent storage directory';
		return null;
	}
	function generate(config) {
		let g = config.settings, s = config.sites[0];
		let issuer = { module: 'acme', email: g.email, challenges: { http: { disabled: s.challenge != 'http-01' }, 'tls-alpn': { disabled: s.challenge != 'tls-alpn-01' } } };
		if (options?.internal_tls) issuer = {module:'internal'};
		let generated = {
			admin: { listen: admin, config: { persist: false } },
			storage: { module: 'file_system', root: g.storage },
			apps: {
				http: { http_port: g.http_port, https_port: g.https_port, servers: {
					redirect: { listen: [(options?.bind || '') + ':' + g.http_port], routes:[{match:[{host:[s.domain]}],handle:[{handler:'static_response',status_code:308,headers:{Location:['https://' + s.domain + (g.https_port == 443 ? '' : ':' + g.https_port) + '{http.request.uri}']}}]}] },
					proxy: { automatic_https:{disable_redirects:true}, listen: [(options?.bind || '') + ':' + g.https_port], routes: [
						{ match: [{host:[s.domain]}], handle: [{handler:'reverse_proxy', upstreams:[{dial:substr(s.backend,7)}]}], terminal:true },
						{handle:[{handler:'static_response',status_code:404}]}
					], tls_connection_policies:[{}] }
				} },
				tls: { automation: { policies: [{subjects:[s.domain],issuers:[issuer]}] } }
			}
		};
		if (options?.internal_tls) generated.apps.pki = {certificate_authorities:{local:{install_trust:false}}};
		return generated;
	}


	function command(action, name) {
		return system([options?.command || '/usr/share/caddy-manager/caddy-command', action, root + '/' + name, admin], 30000) == 0;
	}
	function adapt(text) {
		let path = root + '/source.caddyfile';
		if (writefile(path, text) == null || !chmod(path, 0600)) die('Unable to persist private source');
		if (!command('adapt', 'source.caddyfile')) die('Caddy rejected Caddyfile');
		return read('source.caddyfile.json', null);
	}
	function compile(config) {
		if (config.mode == 'manual') {
			let candidate = adapt(config.manual_caddyfile);
			if (type(candidate) != 'object') die('Caddy rejected Caddyfile');
			let a = candidate.admin;
			if (a && (a.disabled || (a.listen != null && a.listen != admin) || a.remote != null || a.config?.load != null || a.config?.persist == true))
				die('Unsafe admin configuration');
			candidate.admin = {listen:admin,config:{persist:false}};
			if (candidate.storage && (candidate.storage.module != 'file_system' || candidate.storage.root != root + '/data')) die('Unsupported certificate storage');
			candidate.storage = {module:'file_system',root:root + '/data'};
			candidate.apps ||= {};
			candidate.apps.pki ||= {};
			candidate.apps.pki.certificate_authorities ||= {};
			candidate.apps.pki.certificate_authorities.local ||= {};
			for (let name, ca in candidate.apps.pki.certificate_authorities) ca.install_trust = false;
			return candidate;
		}
		let generated = generate(config);
		for (let site in config.sites) {
			if (!length(trim(site.advanced_snippet || ''))) continue;
			let snippet = adapt('http://snippet.invalid {\n' + site.advanced_snippet + '\n}\n');
			if (length(keys(snippet.apps || {})) != 1 || !snippet.apps.http || length(keys(snippet.apps.http.servers || {})) != 1 || snippet.apps.http.servers.srv0.tls_connection_policies != null || snippet.apps.http.servers.srv0.automatic_https != null)
				die('Advanced snippets support HTTP routing directives only');
			let routes = snippet.apps.http.servers.srv0.routes?.[0]?.handle?.[0]?.routes;
			if (type(routes) != 'array') die('Unsupported advanced snippet');
			for (let name, server in generated.apps.http.servers) {
				for (let route in server.routes) {
					if (route.match?.[0]?.host?.[0] != site.domain || name == 'redirect') continue;
					let proxy = route.handle;
					route.handle = [{handler:'subroute',routes:[...routes,{handle:proxy}]}];
				}
			}
		}
		return generated;
	}

	function locked(fn) {
		let lock = open(root + '/manager.lock', 'a', 0600);
		if (!lock || !lock.lock('xn')) { if (lock) lock.close(); return { ok: false, error: 'Another configuration operation is running' }; }
		let result;
		try { result = fn(); }
		catch (e) { result = { ok: false, error: 'Configuration storage operation failed' }; }
		lock.close();
		return result;
	}

	function recover(load) {
		let journal = read('transaction.json', null);
		if (!journal) return {ok:true};
		// The durable active.json is the startup authority. A crash before its
		// promotion rolls back; a crash after promotion completes metadata.
		let committed = readfile(root + '/active.json') == sprintf('%J', journal.next_json);
		if (load && !command('reload', 'active.json')) return {ok:false,error:'Recovery requires the running Caddy admin endpoint; restart from active configuration'};
		write('active-state.json', committed ? journal.next : journal.previous);
		unlink(root + '/transaction.json');
		return {ok:true};
	}

	return {
		draft_get: function() { return state(false); },
		draft_edit: function() { return state(true); },
		recover: function(request) { return locked(function() { return recover(request?.load != false); }); },
		active_reload: function() {
			return locked(function() {
				let recovered = recover(true);
				if (!recovered.ok) return recovered;
				return command('reload','active.json') ? {ok:true} : {ok:false,error:'Unable to reload active configuration'};
			});
		},
		apply: function(request) {
			return locked(function() {
				let recovered = recover(true);
				if (!recovered.ok) return recovered;
				let current = state(true);
				if (request.expected_revision != current.draft_revision) return {ok:false,error:'Draft changed; reload before applying'};
				let error = check(current.draft);
				if (error) return {ok:false,error};
				let candidate;
				try { candidate = compile(current.draft); }
				catch(e) { return {ok:false,error:'Caddyfile adaptation or managed admin/storage policy rejected configuration; active configuration is unchanged'}; }
				write('candidate.json', candidate);
				if (!command('validate','candidate.json')) return {ok:false,error:'Caddy rejected the generated configuration; active configuration is unchanged'};
				let next = {revision:current.draft_revision,config:current.draft};
				let previous = read('active-state.json',{revision:0,config:null});
				write('transaction.json',{previous,next,next_json:candidate});
				if (!command('reload','candidate.json')) {
					// A timeout can happen after Caddy accepted /load. Explicitly
					// compensate instead of assuming a failed CLI means no change.
					let restored = command('reload','active.json');
					if (restored) unlink(root + '/transaction.json');
					return {ok:false,recovery_required:!restored,error:restored ? 'Caddy load failed; previous active configuration restored' : 'Caddy load outcome is uncertain; recovery required. Start or restart Caddy from the saved active configuration, then apply again'};
				}
				try {
					write('active.json',candidate);
					write('active-state.json',next);
					unlink(root + '/transaction.json');
				} catch (e) {
					// Recovery follows whichever active.json survived the failed
					// disk commit, then makes the running admin state agree.
					recover(true);
					return {ok:false,error:'Configuration commit interrupted; recovery required'};
				}
				return state();
			});
		},
		preview: function(request) {
			return locked(function() {
				let config = request.config || state(true).draft;
				let error = check(config);
				if (error) return {ok:false,error};
				if (config.mode == 'manual' || length(filter(config.sites, s => length(s.advanced_snippet || '') > 0))) {
					try {
						write('preview.json', compile(config));
						if (!command('validate','preview.json')) die('Validation failed');
					} catch(e) { return {ok:false,error:'Caddy rejected configuration or managed admin/storage policy'}; }
					return {ok:true,config:{source:config.mode || 'form',validated:true,redacted:true,admin:admin,storage:'managed filesystem'}};
				}
				return {ok:true,config:generate(config)};
			});
		},
		draft_save: function(request) {
			return locked(function() {
				let previous = state();
				if (request.expected_revision != previous.draft_revision) return { ok: false, error: 'Draft changed; reload before saving' };
				let error = check(request.config);
				if (error) return { ok: false, error };
				write('draft.json', { revision: previous.draft_revision + 1, config: request.config });
				return state();
			});
		}
	};
};
