'use strict';
import {open,lstat,realpath,unlink,access,readfile} from 'fs';
import {connect} from 'ubus';
// Constructor overrides are private local fixtures, never RPC parameters.
return function(options) {
 let root=options?.root || '/etc/caddy';
 let store=options?.store || loadfile(options?.store_module || '/usr/share/caddy-manager/uci-store.uc')()({root,confdir:options?.confdir,savedir:options?.savedir});
 function bounded(path,limit) {
  let s=lstat(path);if(s?.type!='file' || s.size>limit || realpath(path)!=path) return null;
  let f=open(path,'r');if(!f)return null;let data=f.read(limit+1);f.close();
  return length(data)<=limit ? data:null;
 }
 function stored(name) {try {let raw=bounded(root+'/'+name,1048576);return raw?json(raw):null;}catch(e){return null;}}
 function logs(request) {
  request ||= {};
  for(let k in request) if(index(['level','kind'],k)<0) return {ok:false,error:'Unsupported log filter'};
  if(request.level!=null && index(['all','debug','info','warn','error'],request.level)<0 || request.kind!=null && index(['all','runtime','access'],request.kind)<0) return {ok:false,error:'Unsupported log filter'};
  let path=options?.logfile || root+'/diagnostic-log-window';
  let lock;
  if(!options?.logfile) {
   lock=open(root+'/diagnostics-log.lock','a',0600);
   if(!lock || !lock.lock('xn')) {lock?.close();return {ok:false,error:'Log reader is busy'};}
   unlink(path);
   if(system([options?.command || '/usr/share/caddy-manager/diagnostic-command','logs',path],2000)!=0) {unlink(path);lock.close();return {ok:false,error:'Log source is unavailable'};}
  }
  let raw=bounded(path,131072);if(!options?.logfile)unlink(path);lock?.close();
  if(raw==null)return {ok:false,error:'Log source is unavailable or exceeds the byte limit'};
  let entries=[],omitted=0,lines=split(raw,'\n');
  for(let line in slice(lines,max(0,length(lines)-257))) {
   if(!length(line))continue;
   if(length(line)>8192){omitted++;continue;}
   let pos=index(line,'{'),e;try{e=pos>=0?json(substr(line,pos)):null;}catch(err){e=null;}
   if(type(e)!='object' || (type(e.ts)!='int' && type(e.ts)!='double') || e.ts<0 || e.ts>time()+300 || index(['debug','info','warn','error'],e.level)<0) {omitted++;continue;}
   let event=null,logger=null,kind='runtime';
   if(index(['tls.obtain','tls.renew'],e.logger)>=0) {
    logger=e.logger;
    event=e.msg=='obtaining certificate' || e.msg=='renewing certificate' ? 'certificate_pending' : e.msg=='could not get certificate from issuer' ? 'issuer_error' : e.msg=='certificate obtained successfully' || e.msg=='certificate renewed successfully' ? 'certificate_success':null;
   } else if(type(e.logger)=='string' && match(e.logger,/^http\.log\.access(\.[a-zA-Z0-9_-]{1,32})?$/)) {logger='http.log.access';event='request_completed';kind='access';}
   else if(e.logger==null && e.level=='error') {logger='caddy';event='service_error';}
   else if(index(['admin','admin.api','http','http.auto_https','tls','tls.cache.maintenance','http.log.error'],e.logger)>=0) {logger=e.logger;event=e.level=='error'?'service_error':e.level=='warn'?'service_warning':'service_event';}
   if(!event){omitted++;continue;}
   let record={ts:e.ts,level:e.level,logger,event,kind};
   if(kind=='access' && type(e.status)=='int' && e.status>=100 && e.status<=599) record.status=e.status;
   if(request.level && request.level!='all' && request.level!=record.level || request.kind && request.kind!='all' && request.kind!=kind)continue;
   push(entries,record);if(length(entries)>256)shift(entries);
  }
  let operations=stored('operation-evidence.json');
  if(type(operations)=='array')for(let e in slice(operations,-32)) {
   if((type(e.ts)!='int' && type(e.ts)!='double') || index(['info','error'],e.level)<0 || index(['config_adapt_success','config_adapt_failed','config_validate_success','config_validate_failed','config_reload_success','config_reload_failed'],e.event)<0)continue;
   if(request.level && request.level!='all' && request.level!=e.level || request.kind && request.kind!='all' && request.kind!='runtime')continue;
   push(entries,{ts:e.ts,level:e.level,logger:'manager',kind:'runtime',event:e.event});
  }
  sort(entries,(a,b)=>a.ts-b.ts);entries=slice(entries,-256);
  return {ok:true,state:length(entries)?'available':'empty',source:'bounded_logd_window',complete:false,limits:{bytes:131072,lines:256,read_timeout_ms:2000},omitted,entries};
 }

 function snapshot(operation,binary) {
  let path=root+'/diagnostic-'+operation;unlink(path);
  let code=system([options?.command || '/usr/share/caddy-manager/diagnostic-command',operation,path,binary || '/usr/bin/caddy'],2000);
  let raw=code==0?bounded(path,131072):null;unlink(path);return raw;
 }
 function private_path(path,kind) {let s=lstat(path);return s?.type==kind && s.uid==0 && !(s.mode & 0077) && realpath(path)==path;}
 function status() {
  let lock=open(root+'/diagnostics-status.lock','a',0600);
  if(!lock || !lock.lock('xn')){lock?.close();return {ok:false,error:'Diagnostics are busy'};}
  function collect() {
   let binary=options?.binary || '/usr/bin/caddy',installed=!!access(binary),version=installed?snapshot('version',binary):null,modules=installed?snapshot('modules',binary):null;
   let moduleLines=modules?filter(split(modules,'\n'),l=>!!match(l,/^[a-zA-Z0-9_.-]+( v[0-9][a-zA-Z0-9.+_-]*)?( github\.com\/[a-zA-Z0-9_./-]+)?$/)):[];
   let arch=snapshot('architecture'),archLines=arch?split(trim(arch),'\n'):[];
   let packageText=snapshot('package'),pkg=packageText?match(packageText,/^caddy-binary-([0-9][a-zA-Z0-9.+_~-]*)/):null;
   let net=snapshot('listeners'),listeners=[];
   if(net!=null)for(let line in split(net,'\n')) {
    let m=match(line,/^tcp[[:space:]]+[0-9]+[[:space:]]+[0-9]+[[:space:]]+([a-fA-F0-9:.*]+):([0-9]+)[[:space:]]+[^[:space:]]+[[:space:]]+LISTEN[[:space:]]+([^[:space:]]+)/);
    if(!m)continue;
    let owner=match(m[3],/^[0-9]+\/caddy$/)?'caddy':match(m[3],/^[0-9]+\/uhttpd$/)?'uhttpd':m[3]=='-'?'unknown':'other';
    push(listeners,{address:m[1],port:+m[2],owner});
   }
   let draft=store.read()?.config,active=stored('active.json'),ports=[];
   if(draft?.mode!='manual')for(let field in ['http_port','https_port']) {
    let port=draft?.settings?.[field];if(type(port)!='int' || port<1 || port>65535)continue;
    let found=filter(listeners,l=>l.port==port);
    push(ports,{source:'draft',protocol:field=='http_port'?'HTTP':'HTTPS',port,state:net==null?'unknown':length(filter(found,l=>index(['uhttpd','other'],l.owner)>=0))?'conflict':length(filter(found,l=>l.owner=='unknown'))?'unknown':length(found)?'own_service':'available'});
   }
   let active_ports=[];
   for(let name,server in active?.apps?.http?.servers)for(let addr in server.listen) {
    let m=type(addr)=='string'?match(addr,/^([a-fA-F0-9:.\[\]]*):([0-9]{1,5})$/):null;
    if(m && +m[2]>0 && +m[2]<=65535 && index(active_ports,+m[2])<0)push(active_ports,+m[2]);
   }
   let bus=connect(),running=null,pid=null,environment=null,firmware=null;
   if(bus) {
    let service=bus.call('service','list',{name:'caddy'});if(service!=null){running=false;for(let name,instance in service?.caddy?.instances)if(instance.running){running=true;pid=instance.pid;}}
    let board=bus.call('system','board',{});if(board?.release)firmware={version:board.release.version,target:board.release.target,revision:board.release.revision};bus.disconnect();
   }
   if(type(pid)=='int' && pid>0) {
    let env=readfile('/proc/'+pid+'/environ');
    if(env!=null) {let values=split(env,'\x00');environment={home:index(values,'HOME=/etc/caddy')>=0,data_home:index(values,'XDG_DATA_HOME=/etc/caddy/data')>=0,config_home:index(values,'XDG_CONFIG_HOME=/etc/caddy')>=0};}
   }
   let retention=snapshot('retention'),retentionLines=retention?split(trim(retention),'\n'):[];
   let cap=length(retentionLines)>0 && match(retentionLines[0],/^[0-9]{1,7}$/)?+retentionLines[0]:null;
   return {ok:true,observed_at:time(),binary:{installed,version:version && match(trim(version),/^v[0-9]+\.[0-9]+\.[0-9]+ [a-zA-Z0-9:+/=._-]+$/)?trim(version):null,modules:moduleLines,cloudflare:modules==null?null:length(filter(moduleLines,l=>index(l,'dns.providers.cloudflare ')==0))>0},architecture:{kernel:archLines[0] && match(archLines[0],/^[a-zA-Z0-9_-]{1,40}$/)?archLines[0]:null,apk:archLines[1] && match(archLines[1],/^[a-zA-Z0-9_-]{1,40}$/)?archLines[1]:null},package:{state:pkg?'installed':'unknown',version:pkg?pkg[1]:null},firmware,running,environment,permissions:{root_private:private_path(root,'directory'),active_private:private_path(root+'/active.json','file')},listeners,listeners_available:net!=null,ports,active_ports,source:draft?.mode=='manual'?'manual':'form',retention:{source:'logd_ram_ring',buffer_kib:cap,persistent_file:retentionLines[1]=='file',external_forwarding:retentionLines[2]=='remote'},public_reachability:'unverified'};
  }
  let result;try{result=collect();}catch(e){result={ok:false,error:'Deployment evidence is unavailable'};}lock.close();return result;
 }
 function probe(request) {
  if(type(request)!='object' || request.confirm!==true || length(filter(keys(request),k=>k!='confirm' && k!='offset'))>0)return {ok:false,error:'Explicit configured-backend probe confirmation is required'};
  let offset=request.offset ?? 0;
  if(type(offset)!='int' || offset<0)return {ok:false,error:'Invalid backend probe offset'};
  let draft=store.read()?.config;
  if(!draft || draft.mode=='manual')return {ok:false,error:'Configured form backends are unavailable in this source'};
  let lock=open(root+'/diagnostics-probe.lock','a',0600);
  if(!lock || !lock.lock('xn')){lock?.close();return {ok:false,error:'Backend probe is busy'};}
  let backends=[],targets={},ordered=[];
  for(let site in draft.sites)for(let url in site.upstreams) {
   let m=type(url)=='string'?match(url,/^https?:\/\/([a-zA-Z0-9][a-zA-Z0-9.-]*|\[[a-fA-F0-9:]+\]):([0-9]{1,5})$/):null;
   if(!m || +m[2]<1 || +m[2]>65535 || targets[url])continue;
   targets[url]=true;push(ordered,{url,host:m[1],port:m[2]});
  }
  for(let target in slice(ordered,offset,offset+8)) {
   let url=target.url;
   let host=replace(replace(target.host,/^\[/,''),/\]$/,'');
   let code=system([options?.command || '/usr/share/caddy-manager/diagnostic-command','probe',host,target.port],2500);
   push(backends,{url,state:code==0?'tcp_reachable':'unreachable'});
  }
  lock.close();return {ok:true,source:'configured_draft_backends_tcp_only',backends,total:length(ordered),next_offset:offset+length(backends)<length(ordered)?offset+length(backends):null,complete:offset+length(backends)>=length(ordered),public_reachability:'unverified'};
 }
 return {logs,status,probe};
};
