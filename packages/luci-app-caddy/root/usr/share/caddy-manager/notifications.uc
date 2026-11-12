'use strict';
import {open,readfile,chmod,rename,unlink,lstat,realpath} from 'fs';
return function(options) {
 let root=options?.root || '/etc/caddy', ledger=root+'/notification-state.json';
 let store=options?.store || loadfile(options?.store_module || '/usr/share/caddy-manager/uci-store.uc')()({root,confdir:options?.confdir,savedir:options?.savedir});
 let now=options?.now ?? time();
 let runtime=options?.root?root+'/notification-runtime.json':'/var/run/caddy-monitor-status.json';
 function fail() {return {ok:false,error:'Notification state or configuration is unavailable'};}
 function read(path, fallback) {
  let s=lstat(path);if(!s) return fallback;
  if(s.type!='file' || s.size>524288 || s.uid!=0 || s.mode & 0077) die('Unsafe notification file');
  return json(readfile(path));
 }
 function putText(path,value) {
  let f=open(path+'.tmp','w',0600);if(!f) die('Notification write failed');
  f.write(value);f.close();if(!chmod(path+'.tmp',0600) || !rename(path+'.tmp',path)) die('Notification commit failed');
  if(path==ledger && system(['/bin/sync'],10000)!=0)die('Notification sync failed');
 }
 function put(path,value) {putText(path,sprintf('%J',value));}
 function locked(fn) {
  let s=lstat(root);if(s?.type!='directory' || s.uid!=0 || s.mode & 0022 || realpath(root)!=root) return fail();
  let lock=open(root+'/notifications.lock','a',0600);
  if(!lock || !lock.lock('xn')) {lock?.close();return {ok:false,error:'Notification worker is busy'};}
  let result;try {result=fn();} catch(e) {result=fail();} lock.close();return result;
 }
 function settings() {return store.notifications();}
 function state() {let s=read(ledger,{version:1,serial:0,episodes:{},events:[],observations:{},last_check:0});if(s.version!=1 || type(s.episodes)!='object' || type(s.events)!='array') die('Invalid ledger');return s;}
 function publicState(s,c) {return {ok:true,webhook:{enabled:c.enabled,configured:length(c.url)>0,method:c.method||'POST',body_mode:c.body_mode||'default',body_configured:length(c.body||'')>0},last_check:read(runtime,{last_check:s.last_check}).last_check,history:'partial_bounded_logd_window',alerts:values(s.episodes),deliveries:map(s.events,e=>({event_id:e.event_id,type:e.type,attempts:e.attempts,delivery:e.delivery,next_due:e.next_due})),interval:s.interval||300};}
 function renderBody(template,payload) {
  let date=payload.not_after?gmtime(payload.not_after):null;
  let vars={...payload,expires_at:date?sprintf('%04d-%02d-%02dT%02d:%02d:%02dZ',date.year,date.mon,date.mday,date.hour,date.min,date.sec):''};
  let names=['event_id','type','domains','not_after','observed_at','summary','expires_at'];
  function substitute(value,typed) {
   let parts=split(value,'{{'),out=parts[0];
   for(let i=1;i<length(parts);i++) {
    let end=index(parts[i],'}}');if(end<0)die('Invalid variable');
    let name=substr(parts[i],0,end);if(index(names,name)<0)die('Unknown variable');
    let v=vars[name];if(typed && length(parts)==2 && !length(parts[0]) && end+2==length(parts[i]))return v??'';
    out+=(type(v)=='array'?join(', ',v):v??'')+substr(parts[i],end+2);
   }
   return out;
  }
  function walk(value) {
   if(type(value)=='string')return substitute(value,true);
   if(type(value)=='array')return map(value,walk);
   if(type(value)=='object'){let result={};for(let k,v in value)result[k]=walk(v);return result;}
   return value;
  }
  let parsed,isjson=true;try{parsed=json(template);}catch(e){isjson=false;}
  return isjson?{body:sprintf('%J',walk(parsed)),content_type:'application/json'}:{body:substitute(template,false),content_type:'text/plain; charset=utf-8'};
 }
 function save(args) {return locked(function() {
  if(type(args)!='object' || length(filter(keys(args),k=>index(['enabled','url','headers','method','body_mode','body'],k)<0)) || type(args.enabled)!='bool') return {ok:false,error:'Invalid notification settings'};
  let old=settings(),url=length(args.url||'')?args.url:old.url,headers=args.headers && length(keys(args.headers))?args.headers:(url!=old.url?{}:old.headers);
  if(type(url)!='string' || length(url)>2048 || (length(url) && (!match(url,/^https?:\/\/[^[:space:]\/@?#]+(\/[^[:space:]#]*)?(\?[^[:space:]#]*)?$/) || match(url,/[[:cntrl:][:space:]\\]/))) || args.enabled && !length(url)) return {ok:false,error:'Use one HTTP or HTTPS URL without userinfo or fragment'};
  if(type(headers)!='object' || length(keys(headers))>8) return {ok:false,error:'Invalid webhook headers'};
  for(let k,v in headers) if(!match(k,/^[A-Za-z0-9-]{1,64}$/) || index(['host','content-length','transfer-encoding','connection'],lc(k))>=0 || type(v)!='string' || length(v)>2048 || match(v,/[[:cntrl:]]/)) return {ok:false,error:'Invalid webhook headers'};
  let method=args.method||old.method||'POST',body_mode=args.body_mode||old.body_mode||'default';
  let body=length(args.body||'')?args.body:(url!=old.url?'':old.body||'');
  if(index(['POST','GET','PUT','PATCH','DELETE','HEAD','OPTIONS'],method)<0 || index(['default','none','custom'],body_mode)<0 || type(body)!='string' || length(body)>16384 || index(body,chr(0))>=0) return {ok:false,error:'Invalid webhook method or body'};
  if(body_mode=='custom' && method!='GET' && method!='HEAD' && !length(body))return {ok:false,error:'Enter a custom request body'};
  try {renderBody(body,{});} catch(e) {return {ok:false,error:'Invalid webhook body variable'};}
  let value={enabled:args.enabled,url,headers,method,body_mode,body};
  store.saveNotifications(value);return publicState(state(),settings());
 });}
 function event(s,ep,type,cert) {
  let id=ep.episode_id+':'+type;
  if(length(s.events)>=256) {let completed=filter(s.events,e=>e.delivery=='sent' || e.delivery=='exhausted' || e.delivery=='disabled');if(!length(completed)) die('Event capacity exceeded');let oldest=completed[0].event_id;s.events=filter(s.events,e=>e.event_id!=oldest);}
  push(s.events,{event_id:id,type,created_at:now,domains:ep.domains,not_after:cert.not_after,attempts:0,next_due:now,delivery:settings().enabled?'pending':'disabled'});
 }
 function quote(v) {return '"'+replace(replace(v,/\\/g,'\\\\'),/"/g,'\\"')+'"';}
 function send(s,c) {
  if(!c.enabled) return;
  for(let e in s.events) {
   if(e.delivery!='pending' || e.next_due>now) continue;
   // Persist budget before I/O: crashes consume an attempt and retain the same event ID.
   e.attempts++;e.next_due=now+(e.attempts==1?60:300);if(e.attempts>=3)e.delivery='exhausted';put(ledger,s);
   let method=c.method||'POST',config='url = '+quote(c.url)+'\nrequest = '+quote(method)+'\n';if(method=='HEAD')config+='head\n';
   let payload={event_id:e.event_id,type:e.type,domains:e.domains,not_after:e.not_after,observed_at:e.created_at,summary:e.type=='near_expiry_observed_issues'?'Near expiry with repeated observed issuer issues; final attempt outcomes unknown':e.type=='expired'?'Stored certificate expired':'Valid replacement certificate observed'};
   let rendered={body:sprintf('%J',payload),content_type:'application/json'};
   if(c.body_mode=='custom')rendered=renderBody(c.body||'',payload);
   if(c.body_mode=='none' || method=='GET' || method=='HEAD')rendered.body='';
   let customType=false;for(let k,v in c.headers){if(lc(k)=='content-type')customType=true;config+='header = '+quote(k+': '+v)+'\n';}
   if(!customType && length(rendered.body))config+='header = '+quote('Content-Type: '+rendered.content_type)+'\n';
   putText(root+'/webhook-payload.json',rendered.body);
   let f=open(root+'/webhook-config','w',0600);if(!f)die('Webhook file unavailable');f.write(config);f.close();chmod(root+'/webhook-config',0600);
   let code=system([options?.webhook_command || '/usr/share/caddy-manager/webhook-command',root+'/webhook-config',root+'/webhook-payload.json',root+'/webhook-result'],10000);
   let result=readfile(root+'/webhook-result');unlink(root+'/webhook-config');unlink(root+'/webhook-payload.json');unlink(root+'/webhook-result');
   if(code==0 && match(result||'',/^2[0-9][0-9]$/))e.delivery='sent';put(ledger,s);break;
  }
 }
 function check() {return locked(function() {
  let s=state(),c=settings(),scan=loadfile(options?.certificate_module || '/usr/share/caddy-manager/certificates.uc')()(options?.certificate_options).check();
  if(!scan.ok) return {...publicState(s,c),ok:false,error:'Certificate evidence is unavailable'};
  let before=sprintf('%J',{serial:s.serial,episodes:s.episodes,events:s.events,observations:s.observations});
  let clockStable=now>=read(runtime,{last_check:s.last_check}).last_check;s.last_check=now;s.interval=300;
  for(let cert in scan.certificates) {
   let lifetime=cert.not_after-cert.not_before;s.interval=min(s.interval,max(15,int(lifetime/24)));
   let domains=sort(slice(cert.domains)),key=join(',',domains);if(!length(key) || !length(cert.sites))continue;
   let obs=s.observations[key];if(!obs || obs.fingerprint!=cert.fingerprint)obs={fingerprint:cert.fingerprint,attempts:{},success:{}};
   for(let domain in cert.sites) {
    let ev=scan.events?.[domain];if(!ev || ev.operation!='renewal')continue;
    if(ev.state=='success') {for(let k,v in obs.attempts)if(v.domain==domain)delete obs.attempts[k];obs.success[domain]=max(obs.success[domain]||0,ev.observed_at);}
    if(ev.state=='issuer_error' && ev.attempt_started && ev.attempt_started>(obs.success[domain]||0) && ev.attempt_started<=ev.observed_at) obs.attempts[domain+'|'+ev.attempt_started]={domain,started:ev.attempt_started,observed_at:ev.observed_at};
   }
   // Bound observations; timestamps identify distinct source attempts, never replay counts.
   let observations=sort(values(obs.attempts),(a,b)=>a.started-b.started);
   if(length(observations)>32)for(let v in slice(observations,0,length(observations)-32))delete obs.attempts[v.domain+'|'+v.started];
   s.observations[key]=obs;
   let repeated=false;
   for(let domain in cert.sites) {
    let attempts=filter(observations,v=>v.domain==domain);
    if(length(attempts)>=2 && attempts[length(attempts)-1].started-attempts[0].started>=min(1800,lifetime/24))repeated=true;
   }
   let replaced=length(filter(scan.certificates,other=>other.validity=='valid' && !other.near_expiry && other.fingerprint!=cert.fingerprint && other.not_after>cert.not_after && length(filter(cert.sites,d=>index(other.sites,d)>=0))==length(cert.sites)))>0;
   let phase=!replaced && cert.validity=='expired'?'expired':!replaced && cert.validity=='valid' && cert.near_expiry && repeated?'near_expiry_observed_issues':null;
   let ep=s.episodes[key];
   if(phase) {
    if(!ep || ep.phase=='recovered') {s.serial++;ep={episode_id:sprintf('%d-%d',now,s.serial),domains,sites:cert.sites,phase,fingerprint:cert.fingerprint,not_after:cert.not_after,threshold:min(1209600,lifetime/6),history:'partial_bounded_logd_window',first_observed:now};s.episodes[key]=ep;event(s,ep,phase,cert);}
    else if(ep.phase!='expired' && phase=='expired'){ep.phase=phase;event(s,ep,phase,cert);}
   }
  }
  // Recovery requires a different, currently valid PEM covering every affected site.
  if(clockStable)for(let key,ep in s.episodes)if(ep.phase!='recovered')for(let cert in scan.certificates)if(cert.validity=='valid' && !cert.near_expiry && cert.fingerprint!=ep.fingerprint && cert.not_after>ep.not_after && length(filter(ep.sites||ep.domains,d=>index(cert.sites,d)>=0))==length(ep.sites||ep.domains)) {ep.phase='recovered';event(s,ep,'recovered',cert);break;}
  if(length(keys(s.observations))>256 || length(keys(s.episodes))>256)die('Notification capacity exceeded');
  if(before!=sprintf('%J',{serial:s.serial,episodes:s.episodes,events:s.events,observations:s.observations}))put(ledger,s);put(runtime,{last_check:now});send(s,c);for(let e in s.events)if(c.enabled && e.delivery=='pending')s.interval=min(s.interval,max(15,e.next_due-now));if(options?.interval)s.interval=min(s.interval,options.interval);return publicState(s,c);
 });}
 return {save,status:()=>locked(()=>publicState(state(),settings())),check};
};
