'use strict';
import { readfile, writefile, mkdir, chmod, rename, open, unlink } from 'fs';

// Options are a local test seam, never supplied by RPC callers.
return function(options) {
	let root = options?.root || '/etc/caddy';
	let admin = options?.admin || '127.0.0.1:2019';
	mkdir(root, 0700);
	chmod(root, 0700);
	mkdir(root + '/credentials', 0700);
	chmod(root + '/credentials', 0700);
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
	function migrate(config) {
		if (config?.version != 1 || type(config.sites) != 'array') return config;
		return {...config,version:2,sites:map(config.sites,function(site) {
			let next={...site,upstreams:[site.backend],balance:'round_robin',path:'',strip:false};
			delete next.backend;
			return next;
		})};
	}
	function state() {
		let draft = read('draft.json', { revision: 0, config: null });
		let active = read('active-state.json', { revision: 0, config: null });
		return { ok: true, draft: migrate(draft.config), draft_revision: draft.revision, active_revision: active.revision, pending: draft.revision != active.revision, recovery_required: read('transaction.json', null) != null };
	}
	function keys(value, allowed) {
		if (type(value) != 'object') return false;
		for (let key in value) if (index(allowed,key) < 0) return false;
		return true;
	}
	function check(config) {
		let g = config?.settings;
		if (!keys(config,['version','settings','sites']) || !keys(g,['http_port','https_port','email','storage','default_challenge','cloudflare_credential'])) return 'Unsupported configuration field';
		if (config.version != 2 || type(config.sites) != 'array' || length(config.sites) < 1)
			return 'Configure at least one site using the supported schema';
		let domains={};
		for (let s in config.sites) {
			if (!keys(s,['domain','upstreams','balance','path','strip','challenge'])) return 'Unsupported configuration field';
			let domain = type(s.domain) == 'string' && substr(s.domain,0,2) == '*.' ? substr(s.domain,2) : s.domain;
			if (type(domain) != 'string' || length(s.domain) > 253 || !match(domain, /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/))
				return 'Enter a valid domain or leading wildcard domain';
			if (domain != s.domain && s.challenge != 'dns-01') return 'Wildcard domains require DNS-01';
			for (let label in split(domain, '.'))
				if (length(label) > 63) return 'Domain labels must not exceed 63 characters';
			if (domains[s.domain]) return 'Each domain must have exactly one site';
			domains[s.domain]=true;
			if (type(s.upstreams) != 'array' || !length(s.upstreams)) return 'Configure at least one backend';
			let scheme=null;
			for (let backend in s.upstreams) {
				let parts=type(backend)=='string' ? match(backend, /^(https?):\/\/([a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?|\[[a-fA-F0-9:]+\]):([0-9]{1,5})$/) : null;
				if (!parts) return 'Backend must be an HTTP or HTTPS host and explicit port without credentials or paths';
				let host=parts[2];
				if (substr(host,0,1)=='[') {
					let address=substr(host,1,length(host)-2), chunks=split(address,':'), compressed=split(address,'::');
					if (length(compressed)>2 || index(address,':::')>=0 || (length(compressed)==1 && length(chunks)!=8)) return 'Invalid IPv6 backend host';
					let count=0;
					for (let chunk in chunks) {if (chunk!='') {if (!match(chunk,/^[a-fA-F0-9]{1,4}$/)) return 'Invalid IPv6 backend host'; count++;}}
					if (length(compressed)==2 && count>7) return 'Invalid IPv6 backend host';
				} else {
					if (length(host)>253) return 'Invalid backend host';
					for (let label in split(host,'.')) if (length(label)>63 || !match(label,/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/)) return 'Invalid backend host';
					if (match(host,/^[0-9.]+$/)) {
						let octets=split(host,'.');
						if (length(octets)!=4) return 'Invalid IPv4 backend host';
						for (let octet in octets) if (+octet>255 || (length(octet)>1 && substr(octet,0,1)=='0')) return 'Invalid IPv4 backend host';
					}
				}
				let port=+split(backend, ':')[-1];
				if (port < 1 || port > 65535) return 'Invalid backend port';
				if (scheme && scheme != parts[1]) return 'All backends in a group must use the same protocol';
				scheme=parts[1];
			}
			if (index(['round_robin','least_conn','random'],s.balance) < 0) return 'Unsupported load balancing strategy';
			if (type(s.path) != 'string' || (s.path != '' && !match(s.path,/^\/([a-zA-Z0-9_~.-]+\/)*([a-zA-Z0-9_~.-]+|\*)?$/)) || index(split(s.path,'/'),'..') >= 0 || index(split(s.path,'/'),'.') >= 0) return 'Path must be exact or end in /*, without query, encoding or parent segments';
			if (type(s.strip) != 'bool' || (s.strip && (s.path == '' || substr(s.path,-2) != '/*'))) return 'Prefix removal requires a path ending in /*';
			if (index(['http-01', 'dns-01', 'tls-alpn-01'], s.challenge) < 0) return 'Unsupported verification method';
		}
		if (g.default_challenge != null && index(['http-01','dns-01','tls-alpn-01'],g.default_challenge) < 0) return 'Unsupported default verification method';
		if (g.cloudflare_credential != null && (type(g.cloudflare_credential) != 'int' || g.cloudflare_credential < 1)) return 'Invalid credential revision';
		for (let name in ['http_port', 'https_port'])
			if (type(g[name]) != 'int' || g[name] < 1 || g[name] > 65535 || g[name] == +split(admin, ':')[1]) return 'Invalid or reserved listening port';
		if (g.http_port == g.https_port) return 'HTTP and HTTPS ports must differ';
		if (type(g.email) != 'string' || (g.email != '' && !match(g.email, /^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$/))) return 'Invalid ACME contact email';
		if (type(g.storage) != 'string' || !match(g.storage, /^\/[a-zA-Z0-9_\/-]+$/) || index(g.storage, '..') >= 0 || g.storage == '/') return 'Invalid persistent storage directory';
		return null;
	}
	function generate(config, private_config) {
		let g=config.settings, routes=[], redirects=[], policies=[];
		for (let s in config.sites) {
			let issuer={module:'acme',email:g.email,challenges:{http:{disabled:s.challenge!='http-01'},'tls-alpn':{disabled:s.challenge!='tls-alpn-01'}}};
			if (s.challenge == 'dns-01') {
				let credential = private_config ? read('credentials/' + g.cloudflare_credential + '.json',null) : null;
				if (private_config && !credential) die('Missing Cloudflare credential');
				issuer.challenges.dns = {provider:{name:'cloudflare',api_token:credential ? credential.token : '[REDACTED: Cloudflare credential]'}};
			}
			if (options?.internal_tls) issuer={module:'internal'};
			push(policies,{subjects:[s.domain],issuers:[issuer]});
			push(redirects,{match:[{host:[s.domain]}],handle:[{handler:'static_response',status_code:308,headers:{Location:['https://'+s.domain+(g.https_port==443?'':':'+g.https_port)+'{http.request.uri}']}}]});
			let proxy={handler:'reverse_proxy',upstreams:map(s.upstreams,function(url) {return {dial:replace(url,/^https?:\/\//,'')};}),load_balancing:{selection_policy:{policy:s.balance}}};
			if (substr(s.upstreams[0],0,8)=='https://') proxy.transport={protocol:'http',tls:{}};
			let handles=[];
			if (s.strip) push(handles,{handler:'rewrite',strip_path_prefix:substr(s.path,0,length(s.path)-2)});
			push(handles,proxy);
			// Authentication belongs inside this matching handler, before rewrite/proxy.
			let pathRoute={handle:handles,terminal:true};
			if (s.path != '') pathRoute.match=[{path:[s.path]}];
			push(routes,{match:[{host:[s.domain]}],handle:[{handler:'subroute',routes:[pathRoute,{handle:[{handler:'static_response',status_code:404}]}]}],terminal:true});
		}
		push(routes,{handle:[{handler:'static_response',status_code:404}]});
		let generated={admin:{listen:admin,config:{persist:false}},storage:{module:'file_system',root:g.storage},apps:{http:{http_port:g.http_port,https_port:g.https_port,servers:{redirect:{listen:[(options?.bind||'')+':'+g.http_port],routes:redirects},proxy:{automatic_https:options?.disable_certificates ? {disable_redirects:true,disable_certificates:true} : {disable_redirects:true},listen:[(options?.bind||'')+':'+g.https_port],routes,tls_connection_policies:[{}]}}},tls:{automation:{policies}}}};
		if (options?.internal_tls) generated.apps.pki={certificate_authorities:{local:{install_trust:false}}};
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
	function command(action, name) {
		return system([options?.command || '/usr/share/caddy-manager/caddy-command', action, root + '/' + name, admin], 30000) == 0;
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
		draft_get: state,
		credential_status: function() {
			let draft = state().draft, active = read('active-state.json',{config:null}).config;
			return {ok:true,configured:draft?.settings?.cloudflare_credential != null,draft_revision:draft?.settings?.cloudflare_credential,active_revision:active?.settings?.cloudflare_credential};
		},
		credential_save: function(request) {
			return locked(function() {
				let current = state();
				if (request.expected_revision != current.draft_revision) return {ok:false,error:'Draft changed; reload before saving credentials'};
				if (!current.draft) return {ok:false,error:'Save a draft before adding credentials'};
				if (current.draft.mode == 'manual') return {ok:false,error:'Cloudflare form credentials are read-only in complete Caddyfile mode'};
				if (type(request.token) != 'string' || length(request.token) < 1 || length(request.token) > 4096 || match(request.token, /[[:space:][:cntrl:]]/)) return {ok:false,error:'Enter a Cloudflare API Token without whitespace'};
				// Immutable versions preserve the last active secret across failed applies.
				let revision = read('credentials/sequence.json',{revision:0}).revision + 1;
				write('credentials/sequence.json',{revision});
				write('credentials/' + revision + '.json',{token:request.token});
				current.draft.settings.cloudflare_credential = revision;
				write('draft.json',{revision:current.draft_revision+1,config:current.draft});
				return state();
			});
		},
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
				let current = state();
				if (request.expected_revision != current.draft_revision) return {ok:false,error:'Draft changed; reload before applying'};
				let error = check(current.draft);
				if (error) return {ok:false,error};
				if (length(filter(current.draft.sites, site => site.challenge == 'dns-01')) && !read('credentials/' + current.draft.settings.cloudflare_credential + '.json',null)) return {ok:false,error:'Save Cloudflare credentials before applying DNS-01'};
				let candidate = generate(current.draft,true);
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
			let config = migrate(request.config || state().draft);
			let error = check(config);
			return error ? { ok:false, error } : { ok:true, config:generate(config) };
		},
		draft_save: function(request) {
			return locked(function() {
				let previous = state();
				if (request.expected_revision != previous.draft_revision) return { ok: false, error: 'Draft changed; reload before saving' };
				let config = migrate(request.config);
				let error = check(config);
				if (error) return { ok: false, error };
				write('draft.json', { revision: previous.draft_revision + 1, config });
				return state();
			});
		}
	};
};
