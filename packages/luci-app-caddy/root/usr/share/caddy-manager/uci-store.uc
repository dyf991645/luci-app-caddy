'use strict';
import { cursor } from 'uci';
import { mkdir, chmod } from 'fs';

// One editable UCI package. RPC profile identifiers are derived from content;
// they are never stored as references or exposed as an extra config file.
return function(options) {
 let root=options?.root || '/etc/caddy',confdir=options?.confdir || '/etc/config';
 let session=options?.session;
 if(session!=null && !match(session,/^[a-f0-9]{32}$/))die('Invalid UCI session');
 let savedir=options?.savedir || (session ? '/var/run/rpcd/uci-'+session : '/tmp/.uci');
 let base=options?.base_savedir || root+'/uci-committed',pending={credential:{},basic:{}};
 for(let dir in [root,savedir,base]){mkdir(dir,0700);chmod(dir,0700);}
 function canonical(v){if(type(v)=='object'){let out={};for(let k in sort(keys(v)))out[k]=canonical(v[k]);return out;}return type(v)=='array'?map(v,canonical):v;}
 function equivalent(a,b){return sprintf('%J',canonical(a))==sprintf('%J',canonical(b));}
 function stamp(v){let n=1;for(let ch in split(sprintf('%J',canonical(v)),''))n=(n*31+ord(ch))%2147483647;return n || 1;}
 function reference(kind,value){let n=stamp(value);return kind=='basic'?'basic-'+n+'-0':n;}
 function list(v){return v==null?[]:type(v)=='array'?v:[v];}
 function integer(v){return type(v)=='string' && match(v,/^[0-9]+$/)?+v:v;}
 function boolean(v){return v=='1'?true:v=='0'?false:v;}
 function fields(c,id,map,booleans,numbers){let out={};for(let key,opt in map){let v=c.get('caddy',id,opt);if(v==null && c.get('caddy',id,opt+'_empty')=='1')v='';if(v!=null)out[key]=index(booleans||[],key)>=0?boolean(v):index(numbers||[],key)>=0?integer(v):v;}return out;}
 function accounts(c,id){let names=list(c.get('caddy',id,'basic_username')),hashes=list(c.get('caddy',id,'basic_hash'));return map(names,(u,i)=>({username:u,hash:hashes[i]}));}
 function secret(kind,ref){
  if(ref==null)return null;
  if(pending[kind]?.[ref]!=null)return pending[kind][ref];
  let c=cursor(confdir,savedir);
  if(kind=='credential'){let token=c.get('caddy','config','cloudflare_token');return token!=null && reference(kind,{token})==ref?{token}:null;}
  if(kind=='basic'){let found=null;let ids=['auth'];c.foreach('caddy','site',s=>push(ids,s['.name']));for(let id in ids){let users=accounts(c,id);if(length(users) && reference(kind,users)==ref)found=users;}return found;}
  return null;
 }
 function set(c,id,key,v){
  let old=c.get('caddy',id,key);
  if(v===''){c.delete('caddy',id,key);if(c.get('caddy',id,key+'_empty')!='1')c.set('caddy',id,key+'_empty','1');}
  else {c.delete('caddy',id,key+'_empty');if(v==null)c.delete('caddy',id,key);else {let value=type(v)=='bool'?(v?'1':'0'):type(v)=='array'?v:''+v;if(!equivalent(old,value))c.set('caddy',id,key,value);}}
 }
 function put(c,id,map,v){for(let key,opt in map)set(c,id,opt,v?.[key]);}
 let globals={http_port:'http_port',https_port:'https_port',email:'email',storage:'storage',default_challenge:'default_challenge',access_log:'access_log'};
 let siteFields={use_global_middlewares:'use_global_middleware',name:'name',enabled:'enabled',domain:'domain',balance:'balance',path:'path',strip:'strip',challenge:'challenge'};
 let autheliaFields={backend:'authelia_backend',uri:'authelia_uri',portal:'authelia_portal'};
 function decode(c){
  if(c.get('caddy','config','configured')!='1')return null;
  let value={version:integer(c.get('caddy','config','version')||'2'),settings:fields(c,'config',globals,['access_log'],['http_port','https_port']),sites:[]};
  let token=c.get('caddy','config','cloudflare_token');if(token!=null)value.settings.cloudflare_credential=reference('credential',{token});
  let globals=[];c.foreach('caddy','global_middleware',s=>push(globals,{id:replace(s['.name'],/^_global_/,''),snippet:s.snippet || ''}));
  if(length(globals))value.global_middlewares=globals;
  let catalog=[];c.foreach('caddy','middleware',s=>push(catalog,{id:s['.name'],snippet:s.snippet || ''}));if(length(catalog))value.middlewares=catalog;
  let wildcard=c.get('caddy','config','wildcard_domain');if(wildcard!=null)value.settings.wildcard_domains=list(wildcard);
  let mode=c.get('caddy','config','mode');if(mode!=null)value.mode=mode;
  let source=fields(c,'config',{text:'manual_caddyfile'});if(source.text!=null)value.manual_caddyfile=source.text;
  if(c.get('caddy','auth')){value.auth={};let users=accounts(c,'auth');if(length(users))value.auth.basic={profile:reference('basic',users)};let auth=fields(c,'auth',autheliaFields);if(length(keys(auth)))value.auth.authelia=auth;}
  c.foreach('caddy','site',function(s){
   let site=fields(c,s['.name'],siteFields,['enabled','strip','use_global_middlewares']);if(s.middleware!=null)site.middlewares=list(s.middleware);site.upstreams=list(s.upstream);
   let source=fields(c,s['.name'],{text:'advanced_snippet'});if(source.text!=null)site.advanced_snippet=source.text;
   if(s.auth_mode!=null){site.auth=fields(c,s['.name'],{mode:'auth_mode',source:'auth_source'});let users=accounts(c,s['.name']);if(length(users))site.auth.profile=reference('basic',users);let auth=fields(c,s['.name'],autheliaFields);if(length(keys(auth)))site.auth.authelia=auth;}
   push(value.sites,site);
  });return value;
 }
 function encode(c,value){
  // Resolve everything before changing sections, including shared profile values.
  let token=value?.settings?.cloudflare_credential!=null?secret('credential',value.settings.cloudflare_credential):null;
  let globalUsers=value?.auth?.basic?.profile?secret('basic',value.auth.basic.profile):null;
  let siteUsers=map(value?.sites || [],s=>s.auth?.profile?secret('basic',s.auth.profile):null);
  if(value?.settings?.cloudflare_credential!=null && !token)die('Missing Cloudflare credential');
  if(value?.auth?.basic?.profile && !globalUsers)die('Missing Basic Auth accounts');
  for(let i,s in value?.sites)if(s.auth?.profile && !siteUsers[i])die('Missing site Basic Auth accounts');
  function users(id,items){set(c,id,'basic_username',length(items || [])?map(items,u=>u.username):null);set(c,id,'basic_hash',length(items || [])?map(items,u=>u.hash):null);c.delete('caddy',id,'basic_profile');}
  let middlewareIds={};for(let m in value?.middlewares || [])middlewareIds[m.id]=true;for(let m in value?.global_middlewares || [])middlewareIds['_global_'+m.id]=true;
  let removed=[];for(let scope in ['middleware','global_middleware'])c.foreach('caddy',scope,m=>{if(!middlewareIds[m['.name']])push(removed,m['.name']);});for(let id in removed)c.delete('caddy',id);
  let existing={},old=[],used={};c.foreach('caddy','site',s=>{existing[s.domain]=s['.name'];push(old,s['.name']);});
  c.set('caddy','config','manager');set(c,'config','schema',3);set(c,'config','configured',value!=null);c.delete('caddy','config','revision');
  put(c,'config',globals,value?.settings);c.delete('caddy','config','middleware');set(c,'config','cloudflare_token',token?.token);c.delete('caddy','config','cloudflare_credential');
  set(c,'config','wildcard_domain',length(value?.settings?.wildcard_domains || [])?value.settings.wildcard_domains:null);
  set(c,'config','version',value?.version);set(c,'config','mode',value?.mode);set(c,'config','manual_caddyfile',value?.manual_caddyfile);c.delete('caddy','config','source');
  if(value?.auth!=null){c.set('caddy','auth','auth');put(c,'auth',autheliaFields,value.auth.authelia);users('auth',globalUsers);}else c.delete('caddy','auth');
  // Allocate all target identifiers first, then rename through temporary IDs so
  // swaps and collisions never overwrite another site's options.
  let order=[];
  for(let site in value?.sites){
   let label=split(lc(site.domain || ''),'.')[0];
   let stem=label=='*'?'wildcard':replace(replace(label,/[^a-z0-9_]+/g,'_'),/^_+|_+$/g,'') || 'site';
   if(match(stem,/^[0-9]/))stem='site_'+stem;
   let id=stem,n=2;
   while(index(['config','auth','service','notifications'],id)>=0 || used[id] || middlewareIds[id] || (c.get('caddy',id) && index(old,id)<0))id=stem+'_'+n++;
   used[id]=true;push(order,id);
  }
  let moved={};
  for(let i,site in value?.sites){
   let source=existing[site.domain],target=order[i];
   if(source && source!=target){
    let tmp='caddy_site_move_'+i;while(c.get('caddy',tmp))tmp+='_';
    if(!c.rename('caddy',source,tmp))die('Unable to rename Caddy site');
    moved[i]=tmp;
   }
  }
  for(let id in old)if(index(map(value?.sites || [],s=>existing[s.domain]),id)<0)c.delete('caddy',id);
  for(let i,tmp in moved)if(!c.rename('caddy',tmp,order[+i]))die('Unable to rename Caddy site');
  for(let m in value?.global_middlewares || []){let id='_global_'+m.id;if(c.get('caddy',id) && c.get('caddy',id)!='global_middleware')die('Global middleware identifier conflicts with a configuration section');c.set('caddy',id,'global_middleware');set(c,id,'snippet',m.snippet);}
  for(let m in value?.middlewares || []){if(c.get('caddy',m.id) && c.get('caddy',m.id)!='middleware')die('Middleware identifier conflicts with a configuration section');c.set('caddy',m.id,'middleware');set(c,m.id,'snippet',m.snippet);}
  for(let i,site in value?.sites){
   let id=order[i];
   used[id]=true;c.set('caddy',id,'site');put(c,id,siteFields,{...site,name:null});set(c,id,'upstream',site.upstreams);set(c,id,'middleware',length(site.middlewares || [])?site.middlewares:null);
   put(c,id,{mode:'auth_mode',source:'auth_source'},site.auth);put(c,id,autheliaFields,site.auth?.authelia);users(id,siteUsers[i]);
   set(c,id,'advanced_snippet',site.advanced_snippet);c.delete('caddy',id,'source');
  }
  if(!equivalent(old,order))for(let i,id in order)c.reorder('caddy',id,i);
  // UCI section order is the independent global execution order.
  let globalOrder=[];c.foreach('caddy','global_middleware',m=>push(globalOrder,m['.name']));
  let wanted=map(value?.global_middlewares || [],m=>'_global_'+m.id);
  if(!equivalent(globalOrder,wanted)){let all=[];c.foreach('caddy',s=>{if(s['.type']!='global_middleware')push(all,s['.name']);});for(let i,id in [...all,...wanted])c.reorder('caddy',id,i);}
 }
 function notifications(c){let v=fields(c,'notifications',{enabled:'enabled',url:'url',body:'body',method:'method',body_mode:'body_mode'},['enabled']),headers={},names=list(c.get('caddy','notifications','header_name')),values=list(c.get('caddy','notifications','header_value'));for(let i,name in names)headers[name]=values[i];return {enabled:v.enabled===true,url:v.url||'',headers,body:v.body||'',method:v.method||'POST',body_mode:v.body_mode||'default'};}
 function putNotifications(c,v){c.set('caddy','notifications','notifications');put(c,'notifications',{enabled:'enabled',url:'url',body:'body',method:'method',body_mode:'body_mode'},v);set(c,'notifications','header_name',length(keys(v.headers || {}))?keys(v.headers):null);set(c,'notifications','header_value',length(keys(v.headers || {}))?values(v.headers):null);c.delete('caddy','notifications','webhook');}
 function service(c){return fields(c,'service',{running:'running',enabled:'enabled'},['running','enabled']);}
 function putService(c,v){c.set('caddy','service','service');put(c,'service',{running:'running',enabled:'enabled'},v);}
 function describe(c){let config=decode(c),refs=[];if(config?.settings?.cloudflare_credential!=null)push(refs,{token:c.get('caddy','config','cloudflare_token')});if(config?.auth?.basic?.profile)push(refs,accounts(c,'auth'));for(let s in config?.sites)if(s.auth?.profile){let found=[];c.foreach('caddy','site',row=>{if(row.domain==s.domain)found=accounts(c,row['.name']);});push(refs,found);}return {config,revision:config==null?0:stamp({config,refs}),signature:stamp({config,refs,service:service(c),notifications:notifications(c)})};}
 function validate(c){
  if(c.get('caddy','config','schema')!='3' || c.get('caddy','config','revision')!=null || c.get('caddy','config','middleware')!=null)
   die('Unsupported Caddy configuration format; use the current single-file UCI format');
 }
 function initialize(){validate(cursor(confdir,base));chmod(confdir+'/caddy',0600);}
 function current(){initialize();let c=cursor(confdir,savedir);validate(c);return c;}
 return {
  initialize,secret,equivalent,
  read:()=>describe(current()),
  hasChanges:()=>length(current().changes('caddy')?.caddy||[])>0,
  write:function(v){let c=current();encode(c,v.config);if(!c.save('caddy'))die('Unable to stage Caddy UCI fields');chmod(confdir+'/caddy',0600);},
  commit:function(){let c=current(),ok=c.load('caddy') && c.commit('caddy');if(ok)chmod(confdir+'/caddy',0600);return ok;},
  saveCredential:function(token){let v={token},ref=reference('credential',v);pending.credential[ref]=v;return ref;},
  saveProfile:function(users){let ref=reference('basic',users);pending.basic[ref]=users;return ref;},
  service:()=>service(current()),
  saveService:function(v){let c=current();putService(c,v);if(!c.save('caddy'))die('Unable to stage service settings');},
  notifications:()=>notifications(current()),
  saveNotifications:function(v){let c=current();putNotifications(c,v);if(!c.save('caddy'))die('Unable to stage notifications');}
 };
};
