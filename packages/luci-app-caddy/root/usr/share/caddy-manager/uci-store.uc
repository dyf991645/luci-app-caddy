'use strict';
import { cursor } from 'uci';
import { readfile, writefile, mkdir, chmod, open, glob } from 'fs';

// Public fields use rpcd's session savedir. Write-only material lives in a
// separate root-only UCI package; only immutable references enter public deltas.
return function(options) {
 let root=options?.root || '/etc/caddy', confdir=options?.confdir || '/etc/config';
 let session=options?.session;
 if(session!=null && !match(session,/^[a-f0-9]{32}$/)) die('Invalid UCI session');
 let savedir=options?.savedir || (session ? '/var/run/rpcd/uci-'+session : '/tmp/.uci');
 let base=options?.base_savedir || root+'/uci-committed';
 for(let dir in [root,savedir,base]) {mkdir(dir,0700);chmod(dir,0700);}
 function read(name,fallback) {let text=readfile(root+'/'+name);return text==null ? fallback : json(text);}
 function canonical(v) {
  if(type(v)=='object') {let out={};for(let k in sort(keys(v))) out[k]=canonical(v[k]);return out;}
  return type(v)=='array' ? map(v,canonical) : v;
 }
 function stamp(v) {let n=1;for(let ch in split(sprintf('%J',canonical(v)),'')) n=(n*31+ord(ch))%2147483647;return n;}
 function privateCursor() {
  if(readfile(confdir+'/caddy_secrets')==null) {let f=open(confdir+'/caddy_secrets','wx',0600);if(f)f.close();}
  chmod(confdir+'/caddy_secrets',0600);
  return cursor(confdir,base);
 }
 function privateID(kind,ref) {
  if(!match(''+ref,/^[a-zA-Z0-9_-]+$/)) die('Invalid private configuration reference');
  return kind+'_'+replace(''+ref,/-/g,'_');
 }
 function secret(kind,ref) {
  if(ref==null)return null;
  let c=privateCursor(),s=c.get_all('caddy_secrets',privateID(kind,ref));
  if(!s)return null;
  if(kind=='credential')return {token:s.token};
  if(kind=='source')return s.content||'';
  let list=v=>v==null?[]:type(v)=='array'?v:[v];
  if(kind=='basic') {let users=list(s.username),hashes=list(s.hash);return map(users,(u,i)=>({username:u,hash:hashes[i]}));}
  if(kind=='webhook') {let headers={},names=list(s.header_name),vals=list(s.header_value);for(let i,k in names)headers[k]=vals[i];return {url:s.url||'',headers};}
  return null;
 }
 function putSecret(kind,ref,value) {
  let c=privateCursor(),id=privateID(kind,ref);
  if(c.get('caddy_secrets',id))return; // immutable references survive rollback
  c.set('caddy_secrets',id,kind);
  if(kind=='credential')c.set('caddy_secrets',id,'token',value.token);
  if(kind=='source')c.set('caddy_secrets',id,'content',value);
  if(kind=='basic') {c.set('caddy_secrets',id,'username',map(value,u=>u.username));c.set('caddy_secrets',id,'hash',map(value,u=>u.hash));}
  if(kind=='webhook') {c.set('caddy_secrets',id,'url',value.url);if(length(keys(value.headers))) {c.set('caddy_secrets',id,'header_name',keys(value.headers));c.set('caddy_secrets',id,'header_value',values(value.headers));}}
  if(!c.commit('caddy_secrets'))die('Unable to persist private UCI configuration');
  chmod(confdir+'/caddy_secrets',0600);
 }
 function allocate(kind,value) {
  let lock=open(root+'/uci-secrets.lock','a',0600);if(!lock || !lock.lock('x'))die('Private UCI configuration is busy');
  let c=privateCursor(),n=+(c.get('caddy_secrets','sequence',kind)||0)+1;
  c.set('caddy_secrets','sequence','sequence');c.set('caddy_secrets','sequence',kind,''+n);
  if(!c.commit('caddy_secrets'))die('Unable to allocate private UCI reference');
  let ref=kind=='basic'?'basic-'+n+'-'+time():n;
  while(secret(kind,ref)!=null) {n++;ref=kind=='basic'?'basic-'+n+'-'+time():n;}
  c=privateCursor();c.set('caddy_secrets','sequence',kind,''+n);if(!c.commit('caddy_secrets'))die('Unable to reserve UCI reference');
  putSecret(kind,ref,value);lock.close();return ref;
 }
 function integer(v) {return type(v)=='string' && match(v,/^[0-9]+$/)?+v:v;}
 function boolean(v) {return v=='1'?true:v=='0'?false:v;}
 function fields(c,id,map,booleans,numbers) {
  let result={};for(let key,opt in map) {let v=c.get('caddy',id,opt);if(v==null && c.get('caddy',id,opt+'_empty')=='1')v='';if(v!=null)result[key]=index(booleans||[],key)>=0?boolean(v):index(numbers||[],key)>=0?integer(v):v;}
  return result;
 }
 let globals={http_port:'http_port',https_port:'https_port',email:'email',storage:'storage',default_challenge:'default_challenge',cloudflare_credential:'cloudflare_credential',access_log:'access_log'};
 let siteFields={name:'name',enabled:'enabled',domain:'domain',balance:'balance',path:'path',strip:'strip',challenge:'challenge'};
 let autheliaFields={backend:'authelia_backend',uri:'authelia_uri',portal:'authelia_portal'};
 function decode(c) {
  if(c.get('caddy','config','configured')!='1')return null;
  let value={version:integer(c.get('caddy','config','version')||'2'),settings:fields(c,'config',globals,['access_log'],['http_port','https_port','cloudflare_credential']),sites:[]};
  let mode=c.get('caddy','config','mode');if(mode!=null)value.mode=mode;
  let source=c.get('caddy','config','source');if(source!=null)value.manual_caddyfile=secret('source',source);
  if(c.get('caddy','auth')) {
   value.auth={};let profile=c.get('caddy','auth','basic_profile');if(profile!=null)value.auth.basic={profile};
   let a=fields(c,'auth',autheliaFields);if(length(keys(a)))value.auth.authelia=a;
  }
  c.foreach('caddy','site',function(s) {
   let site=fields(c,s['.name'],siteFields,['enabled','strip']);
   let u=s.upstream;site.upstreams=u==null?[]:type(u)=='array'?u:[u];
   if(s.source!=null)site.advanced_snippet=secret('source',s.source);
   if(s.auth_mode!=null) {
    site.auth=fields(c,s['.name'],{mode:'auth_mode',source:'auth_source',profile:'basic_profile'});
    let a=fields(c,s['.name'],autheliaFields);if(length(keys(a)))site.auth.authelia=a;
   }
   push(value.sites,site);
  });return value;
 }
 function encode(c,value) {
  if(value?.version==1)value={...value,version:2,sites:map(value.sites,s=>({...s,upstreams:[s.backend],balance:'round_robin',path:'',strip:false}))};
  function set(id,key,v) {
   if(v==='') {c.delete('caddy',id,key);c.set('caddy',id,key+'_empty','1');}
   else {c.delete('caddy',id,key+'_empty');if(v!=null)c.set('caddy',id,key,type(v)=='bool'?(v?'1':'0'):''+v);else c.delete('caddy',id,key);}
  }
  function put(id,map,v) {for(let k,opt in map)set(id,opt,v?.[k]);}
  // Preserve unrelated settings and stable named site sections where possible.
  let existing={};c.foreach('caddy','site',s=>{existing[s.domain]=s['.name'];});
  let used={},old=[];c.foreach('caddy','site',s=>push(old,s['.name']));
  c.set('caddy','config','manager');c.delete('caddy','config','revision');
  set('config','schema',2);set('config','configured',value!=null);
  put('config',globals,value?.settings);set('config','version',value?.version);set('config','mode',value?.mode);
  function source(id,text) {
   if(text==null){c.delete('caddy',id,'source');return;}
   let ref=c.get('caddy',id,'source');if(ref==null || secret('source',ref)!=text)ref=allocate('source',text);
   set(id,'source',ref);
  }
  source('config',value?.manual_caddyfile);
  if(value?.auth!=null) {c.set('caddy','auth','auth');set('auth','basic_profile',value.auth.basic?.profile);put('auth',autheliaFields,value.auth.authelia);} else c.delete('caddy','auth');
  let order=0;
  for(let site in value?.sites) {
   let id=existing[site.domain];
   if(!id || used[id]) {let n=1;while(c.get('caddy','site_'+n) || used['site_'+n])n++;id='site_'+n;}
   used[id]=true;c.set('caddy',id,'site');put(id,siteFields,site);c.set('caddy',id,'upstream',site.upstreams);
   put(id,{mode:'auth_mode',source:'auth_source',profile:'basic_profile'},site.auth);put(id,autheliaFields,site.auth?.authelia);source(id,site.advanced_snippet);
   c.reorder('caddy',id,order++);
  }
  for(let id in old)if(!used[id])c.delete('caddy',id);
 }
 function snapshot(ref) {
  if(!match(''+ref,/^[0-9]+$/))die('Invalid legacy revision');
  let value=read('config-versions/'+ref+'.json',null);if(value==null)die('Missing legacy configuration');return value;
 }
 function initialize() {
  let committed=cursor(confdir,base);
  if(committed.get('caddy','config','schema')=='2')return;
  let lock=open(root+'/uci-migration.lock','a',0600);if(!lock || !lock.lock('x'))die('UCI migration is busy');
  committed=cursor(confdir,base);
  if(committed.get('caddy','config','schema')=='2'){lock.close();return;}
  let pending=[],dirs=[savedir];
  if(root=='/etc/caddy')dirs=[...dirs,'/tmp/.uci',...glob('/var/run/rpcd/uci-*')];
  for(let dir in dirs) {
   let c=cursor(confdir,dir),ref=c.get('caddy','config','revision');
   if(ref && ref!='legacy' && length(c.changes('caddy')?.caddy||[]))push(pending,{dir,value:snapshot(ref)});
  }
  let ref=committed.get('caddy','config','revision');
  let legacy=ref && ref!='legacy'?snapshot(ref):read('draft.json',read('active-state.json',{revision:0,config:null}));
  if(readfile(root+'/uci-migration-backup')==null) {writefile(root+'/uci-migration-backup',readfile(confdir+'/caddy')||'');chmod(root+'/uci-migration-backup',0600);}
  for(let file in glob(root+'/credentials/[0-9]*.json')) {let id=match(file,/\/([0-9]+)\.json$/);if(id)putSecret('credential',id[1],json(readfile(file)));}
  for(let file in glob(root+'/basic-profiles/basic-*.json')) {let id=match(file,/\/(basic-[0-9]+-[0-9]+)\.json$/);if(id)putSecret('basic',id[1],json(readfile(file)));}
  encode(committed,legacy.config);
  committed.set('caddy','service','service');
  committed.set('caddy','service','running',root=='/etc/caddy' && system('/etc/init.d/caddy status >/dev/null 2>&1',5000)==0?'1':'0');
  committed.set('caddy','service','enabled',root=='/etc/caddy' && system('/etc/init.d/caddy enabled >/dev/null 2>&1',5000)==0?'1':'0');
  let notification=read('notifications.json',{enabled:false,url:'',headers:{}});
  committed.set('caddy','notifications','notifications');committed.set('caddy','notifications','enabled',notification.enabled?'1':'0');
  if(length(notification.url))committed.set('caddy','notifications','webhook',''+allocate('webhook',notification));
  if(!committed.commit('caddy'))die('Unable to migrate Caddy configuration to UCI');chmod(confdir+'/caddy',0600);
  for(let item in pending) {let c=cursor(confdir,item.dir);c.load('caddy');c.revert('caddy');c=cursor(confdir,item.dir);encode(c,item.value.config);if(!c.save('caddy'))die('Unable to migrate pending Caddy changes');}
  lock.close();
 }
 function current() {
  initialize();let c=cursor(confdir,savedir),ref=c.get('caddy','config','revision');
  // Recover a legacy session if migration stopped after committing the baseline.
  if(ref && ref!='legacy') {let legacy=snapshot(ref);encode(c,legacy.config);if(!c.save('caddy'))die('Unable to migrate pending session');}
  return c;
 }
 function metadata(c) {return {service:fields(c,'service',{running:'running',enabled:'enabled'},['running','enabled']),notifications:fields(c,'notifications',{enabled:'enabled',webhook:'webhook'},['enabled'])};}
 function model() {
  let c=current(),config=decode(c),refs=[];
  if(config?.settings?.cloudflare_credential!=null)push(refs,secret('credential',config.settings.cloudflare_credential));
  if(config?.auth?.basic?.profile)push(refs,secret('basic',config.auth.basic.profile));
  for(let site in config?.sites)if(site.auth?.profile)push(refs,secret('basic',site.auth.profile));
  let revision=config==null?0:stamp({config,refs});
  let extras=metadata(c);if(extras.notifications.webhook)push(refs,secret('webhook',extras.notifications.webhook));
  let signature=stamp({config,extras,refs});return {config,revision,signature};
 }
 return {
  initialize,read:model,
  hasChanges:()=>length(current().changes('caddy')?.caddy||[])>0,
  equivalent:(a,b)=>sprintf('%J',canonical(a))==sprintf('%J',canonical(b)),
  write:function(value) {let c=current();encode(c,value.config);if(!c.save('caddy'))die('Unable to stage Caddy UCI fields');chmod(confdir+'/caddy',0600);},
  commit:function() {let c=current();return c.load('caddy') && c.commit('caddy');},
  secret,putSecret,
  saveCredential:token=>allocate('credential',{token}),
  saveProfile:users=>allocate('basic',users),
  service:()=>metadata(current()).service,
  saveService:function(v) {let c=current();c.set('caddy','service','service');for(let k in ['running','enabled'])c.set('caddy','service',k,v[k]?'1':'0');if(!c.save('caddy'))die('Unable to stage service settings');},
  notifications:function() {let v=metadata(current()).notifications,target=secret('webhook',v.webhook)||{url:'',headers:{}};return {enabled:v.enabled===true,...target};},
  saveNotifications:function(v) {let c=current();c.set('caddy','notifications','notifications');c.set('caddy','notifications','enabled',v.enabled?'1':'0');let old=secret('webhook',c.get('caddy','notifications','webhook'));if(sprintf('%J',canonical(old))!=sprintf('%J',canonical({url:v.url,headers:v.headers})))c.set('caddy','notifications','webhook',''+allocate('webhook',v));if(!c.save('caddy'))die('Unable to stage notifications');}
 };
};
