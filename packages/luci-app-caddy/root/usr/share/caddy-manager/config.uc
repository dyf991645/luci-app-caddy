'use strict';
import { readfile, writefile, mkdir, chmod, rename, open, unlink, popen } from 'fs';

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
		if(name=='draft.json' && options?.store) {options.store.write(value);return;}
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
	function profile(ref) {
		return type(ref)=='string' && match(ref,/^basic-[0-9]+-[0-9]+$/) ? (options?.store ? options.store.secret('basic',ref) : read('basic-profiles/'+ref+'.json',null)) : null;
	}
	function state(private) {
		let draft = options?.store ? options.store.read() : read('draft.json', { revision: 0, config: null });
		let active = read('active-state.json', { revision: 0, config: null });
		draft.config = migrate(draft.config);
		let public_config = draft.config == null ? null : json(sprintf('%J', draft.config));
		if (!private && public_config) {
			delete public_config.manual_caddyfile;
			for (let site in public_config.sites) delete site.advanced_snippet;
		}
		let affected_domains=[];
		if (draft.config?.mode!='manual' && draft.config?.auth?.basic?.profile != active.config?.auth?.basic?.profile)
			for(let site in draft.config?.sites) if(site.enabled!==false && site.auth?.mode=='basic' && site.auth.source=='global') push(affected_domains,site.domain);
		if(draft.config?.mode!='manual' && sprintf('%J',draft.config?.auth?.authelia)!=sprintf('%J',active.config?.auth?.authelia))
			for(let site in draft.config?.sites) if(site.enabled!==false && site.auth?.mode=='authelia' && site.auth.source=='global') push(affected_domains,site.domain);
		let basic_profiles={};
		let refs=[draft.config?.auth?.basic?.profile];
		for (let site in draft.config?.sites) push(refs,site.auth?.profile);
		for (let ref in refs) {let users=profile(ref);if(users) basic_profiles[ref]=map(users,u=>({username:u.username}));}
		return { ok: true, basic_profiles, affected_domains, draft: private ? draft.config : public_config, draft_revision: draft.revision, active_revision: active.revision, active_source: active.config ? (active.config.mode || 'form') : null, pending: options?.store ? (draft.signature!=null && active.signature!=null ? draft.signature!=active.signature : (!options.store.equivalent(draft.config,active.config) || options.store.hasChanges())) : draft.revision != active.revision, recovery_required: read('transaction.json', null) != null };
	}
	function source_check(text) {
		if (type(text) != 'string' || length(text) > 65536) return 'Caddyfile content must be text up to 64 KiB';
		// Deliberately conservative lexical boundary, not a sandbox. No escaped
		// tokens, imports or process-environment expansion, including in strings.
		if (index(text, '\\') >= 0 || index(text, '`') >= 0 || index(text, '{$') >= 0 || index(lc(text), '{env.') >= 0 || match(text, /(^|[^a-zA-Z0-9_])import([^a-zA-Z0-9_]|$)/))
			return 'Imports, escapes, backticks and environment expansion are unsupported in managed Caddyfile content';
		return null;
	}
	function known_keys(value, allowed) {
		if (type(value) != 'object') return false;
		for (let key in value) if (index(allowed,key) < 0) return false;
		return true;
	}
	function host_error(host) {
		if(substr(host,0,1)=='[') {
			let address=substr(host,1,length(host)-2), chunks=split(address,':'), compressed=split(address,'::'), count=0;
			if(length(compressed)>2 || index(address,':::')>=0 || (length(compressed)==1 && length(chunks)!=8)) return 'Invalid IPv6 backend host';
			for(let chunk in chunks) if(chunk!='') {if(!match(chunk,/^[a-fA-F0-9]{1,4}$/)) return 'Invalid IPv6 backend host';count++;}
			return length(compressed)==2 && count>=8 ? 'Invalid IPv6 backend host' : null;
		}
		if(length(host)>253) return 'Invalid backend host';
		for(let label in split(host,'.')) if(length(label)>63 || !match(label,/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/)) return 'Invalid backend host';
		if(match(host,/^[0-9.]+$/)) {let octets=split(host,'.');if(length(octets)!=4) return 'Invalid IPv4 backend host';for(let octet in octets) if(+octet>255 || (length(octet)>1 && substr(octet,0,1)=='0')) return 'Invalid IPv4 backend host';}
		return null;
	}
	function authelia_check(auth) {
		if (!known_keys(auth,['backend','uri','portal'])) return 'Configure Authelia backend, interface and login portal';
		let backend=type(auth.backend)=='string' ? match(auth.backend,/^https?:\/\/([a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?|\[[a-fA-F0-9:]+\]):([0-9]{1,5})$/) : null;
		if (!backend || host_error(backend[1]) || +backend[3]<1 || +backend[3]>65535) return 'Authelia backend must be HTTP(S) host:port without credentials, path or query';
		if(type(auth.uri)!='string' || !match(auth.uri,/^\/([a-zA-Z0-9_~-]+\/)*[a-zA-Z0-9_~-]+$/)) return 'Authelia interface must be an absolute path without query or fragment';
		if(type(auth.portal)!='string' || !match(auth.portal,/^https?:\/\/[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?(:[0-9]{1,5})?(\/[a-zA-Z0-9_~.\/-]*)?$/) || index(auth.portal,'..')>=0) return 'Authelia portal must be an HTTP(S) URL without credentials, query or fragment';
		let portal=match(auth.portal,/^https?:\/\/([^\/:]+)(:([0-9]+))?/);
		if(host_error(portal[1]) || (portal[3] && (+portal[3]<1 || +portal[3]>65535))) return 'Invalid Authelia portal host or port';
		return null;
	}
	function encode_url(value) {
		let encoded='';
		for(let char in split(value,'')) encoded += match(char,/^[a-zA-Z0-9_.~-]$/) ? char : sprintf('%%%02X',ord(char));
		return encoded;
	}
	function authelia_handlers(auth) {
		let headers=['Remote-User','Remote-Groups','Remote-Email','Remote-Name'];
		let copy=[];
		for(let name in headers) push(copy,{handle:[{handler:'headers',request:{set:{[name]:['{http.reverse_proxy.header.'+name+'}']}}}],match:[{not:[{vars:{['{http.reverse_proxy.header.'+name+'}']:['']}}]}]});
		let proxy={handler:'reverse_proxy',upstreams:[{dial:replace(auth.backend,/^https?:\/\//,'')}],rewrite:{method:'GET',uri:auth.uri+'?authelia_url='+encode_url(auth.portal)},headers:{request:{set:{'X-Forwarded-Method':['{http.request.method}'],'X-Forwarded-Uri':['{http.request.uri}']}}},handle_response:[{match:{status_code:[2]},routes:copy}]};
		if(substr(auth.backend,0,8)=='https://') proxy.transport={protocol:'http',tls:{}};
		return [{handler:'headers',request:{delete:headers}},proxy];
	}
	function effective_challenge(site, settings) {
		return site.challenge == 'global' ? (settings.default_challenge || 'http-01') : site.challenge;
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
		let g = config?.settings;
		if (!known_keys(config,['version','settings','sites','mode','manual_caddyfile','auth']) || !known_keys(g,['http_port','https_port','email','storage','default_challenge','cloudflare_credential','access_log'])) return 'Unsupported configuration field';
		if (config.version != 2 || type(config.sites) != 'array')
			return 'Configure a site list using the supported schema';
		if(config.auth != null && !known_keys(config.auth,['basic','authelia'])) return 'Unsupported global authentication field';
		if(config.auth?.basic != null && (!known_keys(config.auth.basic,['profile']) || type(config.auth.basic.profile)!='string' || !match(config.auth.basic.profile,/^basic-[0-9]+-[0-9]+$/) || (config.mode!='manual' && !profile(config.auth.basic.profile)))) return 'Invalid global Basic Auth profile';
		if(config.auth?.authelia != null) {let error=authelia_check(config.auth.authelia);if(error) return error;}
		let domains={};
		for (let s in config.sites) {
			if (!known_keys(s,['name','enabled','domain','upstreams','balance','path','strip','challenge','advanced_snippet','auth'])) return 'Unsupported configuration field';
			if(s.name!=null && (type(s.name)!='string' || length(s.name)>240 || match(s.name,/[[:cntrl:]]/))) return 'Site name must be text up to 240 bytes without control characters';
			if(s.enabled!=null && type(s.enabled)!='bool') return 'Site enabled must be a boolean';
			if (s.auth != null) {
				if (!known_keys(s.auth,['mode','source','profile','authelia']) || index(['none','basic','authelia'],s.auth.mode)<0) return 'Unsupported access authentication';
				if(s.auth.source!=null && index(['global','independent'],s.auth.source)<0) return 'Unsupported authentication source';
				if(s.auth.profile!=null && (type(s.auth.profile)!='string' || !match(s.auth.profile,/^basic-[0-9]+-[0-9]+$/))) return 'Invalid authentication profile reference';
				if(s.auth.authelia!=null) {let error=authelia_check(s.auth.authelia);if(error) return error;}
				if(config.mode=='manual') continue;
				if (s.enabled!==false && s.auth.mode=='basic' && (index(['global','independent'],s.auth.source)<0 || !profile(s.auth.source=='global' ? config.auth?.basic?.profile : s.auth.profile))) return 'Configure the selected Basic Auth profile first';
				if(s.enabled!==false && s.auth.mode=='authelia') {
					if(index(['global','independent'],s.auth.source)<0) return 'Choose global or independent Authelia configuration';
					let auth=s.auth.source=='global' ? config.auth?.authelia : s.auth.authelia;
					let error=authelia_check(auth);if(error) return error;
					let portal=match(auth.portal,/^https?:\/\/([^\/:]+)(:[0-9]+)?(\/.*)?$/), host=lc(portal[1]), path=portal[3] || '/';
					for(let entry in config.sites) {
						let same=entry.domain==host || (substr(entry.domain,0,2)=='*.' && substr(host,-length(entry.domain)+1)==substr(entry.domain,1));
						let covers=entry.path=='' || entry.path==path || (substr(entry.path,-2)=='/*' && substr(path,0,length(entry.path)-1)==substr(entry.path,0,length(entry.path)-1));
						if(entry.enabled!==false && same && covers && entry.auth?.mode && entry.auth.mode!='none') return 'Login portal must use no additional authentication to avoid a login loop; configure Authelia session cookies and access policies externally';
					}
				}

			}
			if (config.mode == 'manual') continue;
			let domain = type(s.domain) == 'string' && substr(s.domain,0,2) == '*.' ? substr(s.domain,2) : s.domain;
			if (type(domain) != 'string' || length(s.domain) > 253 || !match(domain, /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/))
				return 'Enter a valid domain or leading wildcard domain';
			if (s.enabled!==false && domain != s.domain && effective_challenge(s,g) != 'dns-01') return 'Wildcard domains require DNS-01';
			for (let label in split(domain, '.'))
				if (length(label) > 63) return 'Domain labels must not exceed 63 characters';
			if (domains[s.domain]) return 'Each domain must have exactly one site';
			domains[s.domain]=true;
			if (type(s.upstreams) != 'array' || !length(s.upstreams)) return 'Configure at least one backend';
			let scheme=null;
			for (let backend in s.upstreams) {
				let parts=type(backend)=='string' ? match(backend, /^(https?):\/\/([a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?|\[[a-fA-F0-9:]+\]):([0-9]{1,5})$/) : null;
				if (!parts) return 'Backend must be an HTTP or HTTPS host and explicit port without credentials or paths';
				let error=host_error(parts[2]);
				if(error) return error;
				let port=+split(backend, ':')[-1];
				if (port < 1 || port > 65535) return 'Invalid backend port';
				if (scheme && scheme != parts[1]) return 'All backends in a group must use the same protocol';
				scheme=parts[1];
			}
			if (index(['round_robin','least_conn','random'],s.balance) < 0) return 'Unsupported load balancing strategy';
			if (type(s.path) != 'string' || (s.path != '' && !match(s.path,/^\/([a-zA-Z0-9_~.-]+\/)*([a-zA-Z0-9_~.-]+|\*)?$/)) || index(split(s.path,'/'),'..') >= 0 || index(split(s.path,'/'),'.') >= 0) return 'Path must be exact or end in /*, without query, encoding or parent segments';
			if (type(s.strip) != 'bool' || (s.strip && (s.path == '' || substr(s.path,-2) != '/*'))) return 'Prefix removal requires a path ending in /*';
			if (index(['global', 'http-01', 'dns-01', 'tls-alpn-01'], s.challenge) < 0) return 'Unsupported verification method';
		}
		if(g.access_log!=null && type(g.access_log)!='bool') return 'Access logging must be enabled or disabled';
		if (g.default_challenge != null && index(['http-01','dns-01','tls-alpn-01'],g.default_challenge) < 0) return 'Unsupported default verification method';
		if (g.cloudflare_credential != null && (type(g.cloudflare_credential) != 'int' || g.cloudflare_credential < 1)) return 'Invalid credential revision';
		if (config.mode == 'manual') return length(trim(config.manual_caddyfile || '')) ? null : 'Enter a complete Caddyfile';
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
			if(s.enabled===false) continue;
			let challenge=effective_challenge(s,g);
			let issuer={module:'acme',email:g.email,challenges:{http:{disabled:challenge!='http-01'},'tls-alpn':{disabled:challenge!='tls-alpn-01'}}};
			if (challenge == 'dns-01') {
				let credential = private_config ? (options?.store ? options.store.secret('credential',g.cloudflare_credential) : read('credentials/' + g.cloudflare_credential + '.json',null)) : null;
				if (private_config && !credential) die('Missing Cloudflare credential');
				issuer.challenges.dns = {provider:{name:'cloudflare',api_token:credential ? credential.token : '[REDACTED: Cloudflare credential]'}};
			}
			if (options?.internal_tls) issuer={module:'internal'};
			push(policies,{subjects:[s.domain],issuers:[issuer]});
			push(redirects,{match:[{host:[s.domain]}],handle:[{handler:'static_response',status_code:308,headers:{Location:['https://{http.request.host}'+(g.https_port==443?'':':'+g.https_port)+'{http.request.uri}']}}]});
			let proxy={handler:'reverse_proxy',upstreams:map(s.upstreams,function(url) {return {dial:replace(url,/^https?:\/\//,'')};}),load_balancing:{selection_policy:{policy:s.balance}}};
			if (substr(s.upstreams[0],0,8)=='https://') proxy.transport={protocol:'http',tls:{}};
			let handles=s.auth?.mode=='authelia' ? authelia_handlers(s.auth.source=='global' ? config.auth.authelia : s.auth.authelia) : [];
			if (s.auth?.mode=='basic') {
				let users=profile(s.auth.source=='global' ? config.auth.basic.profile : s.auth.profile);
				push(handles,{handler:'authentication',providers:{http_basic:{hash:{algorithm:'bcrypt'},accounts:map(users,u=>({username:u.username,password:private_config ? u.hash : '[private hash]'}))}}});
			}
			if (s.strip) push(handles,{handler:'rewrite',strip_path_prefix:substr(s.path,0,length(s.path)-2)});
			push(handles,proxy);
			// Authentication belongs inside this matching handler, before rewrite/proxy.
			let pathRoute={handle:handles,terminal:true};
			if (s.path != '') pathRoute.match=[{path:[s.path]}];
			push(routes,{match:[{host:[s.domain]}],handle:[{handler:'subroute',routes:[pathRoute,{handle:[{handler:'static_response',status_code:404}]}]}],terminal:true});
		}
		push(routes,{handle:[{handler:'static_response',status_code:404}]});
		let generated={admin:{listen:admin,config:{persist:false}},storage:{module:'file_system',root:g.storage},apps:{http:{http_port:g.http_port,https_port:g.https_port,servers:{redirect:{listen:[(options?.bind||'')+':'+g.http_port],routes:redirects},proxy:{automatic_https:options?.disable_certificates ? {disable_redirects:true,disable_certificates:true} : {disable_redirects:true},listen:[(options?.bind||'')+':'+g.https_port],routes,tls_connection_policies:[{}]}}},tls:{automation:{policies}}}};
		if(g.access_log)for(let name,server in generated.apps.http.servers)server.logs={};
		if (options?.internal_tls) generated.apps.pki={certificate_authorities:{local:{install_trust:false}}};
		return generated;
	}


	function command(action, name) {
		let ok=system([options?.command || '/usr/share/caddy-manager/caddy-command', action, root + '/' + name, admin], 30000) == 0;
		let evidence=[];try {evidence=read('operation-evidence.json',[]);}catch(e) {}
		if(type(evidence)!='array')evidence=[];
		push(evidence,{ts:time(),level:ok?'info':'error',logger:'manager',kind:'runtime',event:'config_'+action+(ok?'_success':'_failed')});
		try {write('operation-evidence.json',slice(evidence,-32));} catch(e) {}
		return ok;
	}
	let syntax_diagnostic=null;
	function adapt(text, source, offset) {
		syntax_diagnostic=null;
		let path = root + '/source.caddyfile';
		if (writefile(path, text) == null || !chmod(path, 0600)) die('Unable to persist private source');
		unlink(path+'.line');
		if (!command('adapt', 'source.caddyfile')) {
			unlink(path+'.stderr');
			let line=trim(readfile(path+'.line') || '');unlink(path+'.line');
			if(match(line,/^[0-9]{1,5}$/) && +line>0 && +line<=length(split(text,'\n'))) syntax_diagnostic={category:'caddyfile_syntax',source,line:max(1,+line-(offset || 0))};
			die('Caddy rejected Caddyfile');
		}
		return read('source.caddyfile.json', null);
	}
	function compile(config, private_config) {
		syntax_diagnostic=null;
		if (config.mode == 'manual') {
			let candidate = adapt(config.manual_caddyfile,'manual',0);
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
		let generated = generate(config,private_config);
		for (let site in config.sites) {
			if (site.enabled===false || !length(trim(site.advanced_snippet || ''))) continue;
			let snippet = adapt('http://snippet.invalid {\n' + site.advanced_snippet + '\n}\n','advanced_snippet',1);
			if (length(keys(snippet.apps || {})) != 1 || !snippet.apps.http || length(keys(snippet.apps.http.servers || {})) != 1 || snippet.apps.http.servers.srv0.tls_connection_policies != null || snippet.apps.http.servers.srv0.automatic_https != null)
				die('Advanced snippets support HTTP routing directives only');
			let server = snippet.apps.http.servers.srv0;
			if (sprintf('%J',server.listen) != sprintf('%J',[':80']) || length(server.routes) != 1 || server.routes[0].match?.[0]?.host?.[0] != 'snippet.invalid') die('Unsupported snippet scope');
			for (let key in keys(server)) if (index(['listen','routes'],key) < 0) die('Unsupported snippet server option');
			let routes = server.routes[0].handle?.[0]?.routes;
			if (type(routes) != 'array') die('Unsupported advanced snippet');
			for (let name, server in generated.apps.http.servers) {
				for (let route in server.routes) {
					if (route.match?.[0]?.host?.[0] != site.domain || name == 'redirect') continue;
					let scoped = route.handle[0].routes[0];
					let proxy = scoped.handle;
					let auth = [];
					while(proxy[0]?.handler=='authentication' || proxy[0]?.handler=='headers' || (proxy[0]?.handler=='reverse_proxy' && proxy[0]?.handle_response)) push(auth,shift(proxy));
					scoped.handle = [...auth,{handler:'subroute',routes:[...routes,{handle:proxy}]}];
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
		basic_profile_save: function(request) {
			return locked(function() {
				let current=state(true);
				if(request.expected_revision != current.draft_revision) return {ok:false,error:'Draft changed; reload before saving'};
				let config=migrate(request.config || current.draft);
				if (!config || config.mode=='manual') return {ok:false,error:'Authentication forms are read-only in manual mode'};
				if (request.scope!='global' && !length(filter(config.sites,s=>s.domain==request.scope))) return {ok:false,error:'Unknown authentication scope'};
				if(type(request.users)!='array' || !length(request.users) || length(request.users)>32) return {ok:false,error:'Configure between 1 and 32 accounts'};
				let oldref=request.scope=='global' ? config.auth?.basic?.profile : filter(config.sites,s=>s.domain==request.scope)[0]?.auth?.profile;
				let old=profile(oldref) || [], users=[], seen={};
				for(let user in request.users) {
					if(!known_keys(user,['username','password','hash','retain']) || type(user.username)!='string' || !match(user.username,/^[a-zA-Z0-9_.@-]{1,64}$/) || seen[user.username]) return {ok:false,error:'Account names must be unique and contain only letters, numbers, _, ., @ or -'};
					seen[user.username]=true;
					let hash=null;
					if(user.retain===true && user.password==null && user.hash==null) {
						for(let existing in old) if(existing.username==user.username) hash=existing.hash;
					} else if(type(user.hash)=='string' && user.password==null && user.retain==null) hash=user.hash;
					else if(type(user.password)=='string' && user.hash==null && user.retain==null && length(user.password)>0 && length(user.password)<=72 && index(user.password,'\n')<0 && index(user.password,'\r')<0 && index(user.password,'\u0000')<0) {
						// Password crosses stdin only: never argv, a file, diagnostic or RPC result.
						let path=root+'/password.hash';
						let quote=s=>"'"+replace(s,/'/,"'\\''")+"'";
						let pipe=popen(quote(options?.command || '/usr/share/caddy-manager/caddy-command')+' hash '+quote(path),'w');
						if(pipe) {pipe.write(user.password+'\n');if(pipe.close()==0) hash=trim(readfile(path) || '');}
						unlink(path);
					}
					if(type(hash)!='string' || !match(hash,/^\$2[aby]\$[0-9]{2}\$[a-zA-Z0-9./]{53}$/) || +substr(hash,4,2)<4 || +substr(hash,4,2)>16) return {ok:false,error:'Supply a password (1–72 bytes), retained account, or valid bcrypt hash (cost 4–16)'};
					push(users,{username:user.username,hash});
				}
				mkdir(root+'/basic-profiles',0700);chmod(root+'/basic-profiles',0700);
				let ref=options?.store ? options.store.saveProfile(users) : 'basic-'+(current.draft_revision+1)+'-'+time();
				// Exclusive file creation makes profile versions immutable even on abandoned saves.
				let file=options?.store ? null : open(root+'/basic-profiles/'+ref+'.json','wx',0600);
				if(!options?.store && !file) return {ok:false,error:'Unable to create private authentication profile'};
				if(file){file.write(sprintf('%J',users));file.close();}
				config=json(sprintf('%J',config));
				if(request.scope=='global') {config.auth ||= {};config.auth.basic={profile:ref};}
				else for(let site in config.sites) if(site.domain==request.scope) site.auth={mode:'basic',source:'independent',profile:ref};
				let error=check(config);if(error) return {ok:false,error};
				write('draft.json',{revision:current.draft_revision+1,config});
				return state();
			});
		},
		draft_get: function() { return state(false); },
		draft_edit: function() { return state(true); },
		tls_save: function(request) {
			return locked(function() {
				let current = state(true);
				if (request.expected_revision != current.draft_revision) return {ok:false,error:'Draft changed; reload before saving TLS settings'};
				if (!current.draft) return {ok:false,error:'Save a site draft before changing TLS defaults'};
				if (current.draft.mode == 'manual') return {ok:false,error:'TLS forms are read-only in complete Caddyfile mode'};
				if (index(['http-01','dns-01','tls-alpn-01'],request.default_challenge) < 0) return {ok:false,error:'Unsupported default verification method'};
				current.draft.settings.default_challenge = request.default_challenge;
				let error=check(current.draft);
				if (error) return {ok:false,error};
				write('draft.json',{revision:current.draft_revision+1,config:current.draft});
				return state();
			});
		},
		credential_status: function() {
			let draft = state().draft, active = read('active-state.json',{config:null}).config;
			return {ok:true,configured:draft?.settings?.cloudflare_credential != null,draft_revision:draft?.settings?.cloudflare_credential,active_revision:active?.settings?.cloudflare_credential};
		},
		credential_save: function(request) {
			return locked(function() {
				let current = state(true);
				if (request.expected_revision != current.draft_revision) return {ok:false,error:'Draft changed; reload before saving credentials'};
				if (!current.draft) return {ok:false,error:'Save a draft before adding credentials'};
				if (current.draft.mode == 'manual') return {ok:false,error:'Cloudflare form credentials are read-only in complete Caddyfile mode'};
				if (type(request.token) != 'string' || length(request.token) < 1 || length(request.token) > 4096 || match(request.token, /[[:space:][:cntrl:]]/)) return {ok:false,error:'Enter a Cloudflare API Token without whitespace'};
				// Immutable versions preserve the last active secret across failed applies.
				let revision;
				if(options?.store)revision=options.store.saveCredential(request.token);
				else {revision=read('credentials/sequence.json',{revision:0}).revision+1;write('credentials/sequence.json',{revision});write('credentials/'+revision+'.json',{token:request.token});}
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
				let recovered = recover(!options?.offline);
				if (!recovered.ok) return recovered;
				let current = state(true);
				if (request.expected_revision != current.draft_revision) return {ok:false,error:'Draft changed; reload before applying'};
				let error = check(current.draft);
				if (error) return {ok:false,error};
				let candidate;
				try { candidate = compile(current.draft,true); }
				catch(e) { return {ok:false,diagnostic:syntax_diagnostic,error:'Caddyfile adaptation or managed admin/storage policy rejected configuration; active configuration is unchanged'}; }
				write('candidate.json', candidate);
				if (!command('validate','candidate.json')) return {ok:false,error:'Caddy rejected the generated configuration; active configuration is unchanged'};
				let next = {revision:current.draft_revision,config:current.draft};
				if(options?.store)next.signature=options.store.read().signature;
				let previous = read('active-state.json',{revision:0,config:null});
				write('transaction.json',{previous,next,next_json:candidate});
				if (!options?.offline && !command('reload','candidate.json')) {
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
					recover(!options?.offline);
					return {ok:false,error:'Configuration commit interrupted; recovery required'};
				}
				if(options?.store && !options.store.commit()) return {ok:false,error:'Configuration loaded but UCI commit failed; saved changes retained'};
				return state();
			});
		},
		preview: function(request) {
			return locked(function() {
				let config = migrate(request.config || state(true).draft);
				let error = check(config);
				if (error) return {ok:false,error};
				if (config.mode == 'manual' || length(filter(config.sites, s => s.enabled!==false && length(s.advanced_snippet || '') > 0))) {
					try {
						write('preview.json', compile(config,true));
						if (!command('validate','preview.json')) die('Validation failed');
					} catch(e) { return {ok:false,diagnostic:syntax_diagnostic,error:'Caddy rejected configuration or managed admin/storage policy'}; }
					return {ok:true,config:{source:config.mode || 'form',validated:true,redacted:true,admin:admin,storage:'managed filesystem'}};
				}
				return {ok:true,config:generate(config)};
			});
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
