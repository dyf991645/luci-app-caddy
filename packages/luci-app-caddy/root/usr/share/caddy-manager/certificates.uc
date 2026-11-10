'use strict';
import {open,readfile,writefile,mkdir,chmod,lstat,realpath,opendir,unlink,rename} from 'fs';

// Local constructor options are never RPC arguments. See CERTIFICATES.md.
return function(options) {
 let root=options?.root || '/etc/caddy';
 let command=options?.command || '/usr/share/caddy-manager/certificate-command';
 function bounded(path,limit) {
  let s=lstat(path); if(s?.type!='file' || s.size>limit) return null;
  let f=open(path,'r'); if(!f) return null;
  let value=f.read(limit+1); f.close();
  let after=lstat(path);
  return length(value)<=limit && after?.inode==s.inode && after.size==s.size && after.mtime==s.mtime ? value : null;
 }
 function safe(path,kind) {
  let s=lstat(path);
  return s?.type==kind && s.uid==0 && !(s.mode & 0022) && realpath(path)==path;
 }
 function date(value) {
  let m=match(value,/^([0-9]{4})-([0-9]{2})-([0-9]{2}) ([0-9]{2}):([0-9]{2}):([0-9]{2})Z$/);
  if(!m) return null;
  let d={year:+m[1],mon:+m[2],mday:+m[3],hour:+m[4],min:+m[5],sec:+m[6]};
  let epoch=timegm(d),back=gmtime(epoch);
  for(let k in d) if(back[k]!=d[k]) return null;
  return epoch;
 }
 function dns(value) {
  if(type(value)!='string' || length(value)>253) return false;
  if(substr(value,0,2)=='*.') value=substr(value,2);
  for(let label in split(value,'.')) if(!length(label) || length(label)>63 || !match(label,/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)) return false;
  return true;
 }
 function normalize(value) {return lc(replace(value,/\.$/,''));}
 function covers(san,host) {
  if(san==host) return true;
  return substr(san,0,2)=='*.' && join('.',slice(split(host,'.'),1))==substr(san,2);
 }
 function hosts(value,out,depth) {
  if(depth>24) return;
  if(type(value)=='object') {
   if(type(value.host)=='array') for(let h in value.host) if(type(h)=='string' && dns(normalize(h))) out[normalize(h)]=true;
   for(let k,v in value) hosts(v,out,depth+1);
  } else if(type(value)=='array') for(let v in value) hosts(v,out,depth+1);
 }
 function parse(text,now,sites) {
  let fields={},sans=[],ips=[],inSan=false;
  for(let line in split(text,'\n')) {
   let m=match(line,/^(issuer|notBefore|notAfter|sha256 Fingerprint)=(.*)$/);
   if(m) {if(fields[m[1]]!=null) return null; fields[m[1]]=m[2]; inSan=false; continue;}
   if(trim(line)=='X509v3 Subject Alternative Name:') {inSan=true;continue;}
   if(inSan && length(trim(line))) {
    for(let part in split(trim(line),', ')) {
     let value=match(part,/^DNS:(.+)$/);
     if(value && dns(normalize(value[1]))) push(sans,normalize(value[1]));
     else if(match(part,/^IP Address:[0-9a-fA-F:.]+$/)) push(ips,substr(part,11));
     else return null;
    }
   } else if(length(trim(line))) return null;
  }
  let before=date(fields.notBefore),after=date(fields.notAfter);
  if(!length(fields.issuer) || before==null || after==null || after<=before || !match(fields['sha256 Fingerprint']||'',/^[A-F0-9]{2}(:[A-F0-9]{2}){31}$/)) return null;
  return {domains:sans,ip_addresses:ips,issuer:fields.issuer,not_before:before,not_after:after,fingerprint:fields['sha256 Fingerprint'],sites:filter(sites,h=>length(filter(sans,s=>covers(s,h)))>0),validity:now<before?'not_yet_valid':now>=after?'expired':'valid',near_expiry:now<after && after-now<=min(1209600,(after-before)/6),renewal:{state:'unknown',source:'no_retained_event_evidence'}};
 }
 function evidence(now) {
  let ledger={};
  let saved=bounded(root+'/certificate-evidence.json',131072);
  if(saved) try {ledger=json(saved);} catch(e) {ledger={};}
  let log=options?.logfile;
  if(!log) {
   log=root+'/certificate-log-window'; unlink(log);
   if(system([options?.logcommand || '/usr/share/caddy-manager/certificate-log',log],2000)!=0) return {events:ledger,history:'unavailable'};
  }
  let text=bounded(log,131072);
  if(!options?.logfile) unlink(log);
  if(text==null) return {events:ledger,history:'unavailable'};
  for(let line in split(text,'\n')) {
   if(length(line)>8192) continue;
   let start=index(line,'{');if(start<0) continue;
   let e;
   try {e=json(substr(line,start));} catch(err) {continue;}
   let domain=type(e.identifier)=='string'?normalize(e.identifier):null;
   if(!domain || !dns(domain) || index(['tls.obtain','tls.renew'],e.logger)<0 || type(e.ts)!='double' && type(e.ts)!='int' || e.ts>now+300) continue;
   let state=e.msg=='obtaining certificate' || e.msg=='renewing certificate'?'pending':e.msg=='could not get certificate from issuer'?'issuer_error':e.msg=='certificate obtained successfully' || e.msg=='certificate renewed successfully'?'success':null;
   if(!state || ledger[domain]?.observed_at>=e.ts || length(keys(ledger))>=256 && !ledger[domain]) continue;
   let previous=ledger[domain];
   ledger[domain]={state,operation:e.logger=='tls.renew'?'renewal':'issuance',observed_at:e.ts,attempt_started:state=='pending'?e.ts:previous?.attempt_started,source:'caddy_2.11.8_logd_window',error:state=='issuer_error'?'An issuer reported an error; final attempt outcome is unknown':null};
  }
  let serialized=sprintf('%J',ledger);
  if(serialized!=saved && writefile(root+'/certificate-evidence.tmp',serialized)!=null && chmod(root+'/certificate-evidence.tmp',0600)) rename(root+'/certificate-evidence.tmp',root+'/certificate-evidence.json');
  return {events:ledger,history:'partial_bounded_logd_window'};
 }
 function scan() {
  let now=options?.now ?? time();
  let result={ok:true,observed_at:now,source:'active_filesystem_stored_leaf',complete:true,certificates:[],sites:[],history:'unknown'};
  if(!safe(root,'directory')) return {...result,ok:false,complete:false,error:'Certificate manager directory is unavailable'};
  let lock=open(root+'/certificates.lock','a',0600);
  if(!lock || !lock.lock('xn')) {lock?.close();return {...result,ok:false,complete:false,error:'Certificate scan is busy'};}
  function run() { try {
   let raw=bounded(root+'/active.json',1048576),active=raw ? json(raw):null;
   let storage=active?.storage;
   if(storage?.module!='file_system' || type(storage.root)!='string' || !match(storage.root,/^\/[a-zA-Z0-9_\/-]+$/) || index(storage.root,'..')>=0) return {...result,complete:false,source:'unsupported_storage'};
   let sites={}; hosts(active?.apps?.http?.servers,sites,0);
   let siteNames=keys(sites),base=storage.root+'/certificates';
   let visited=0,total=0,count=0,start=time();
   function walk(path,depth) {
    if(time()-start>15 || !safe(path,'directory')) {result.complete=false;return;}
    let dir=opendir(path); if(!dir) {result.complete=false;return;}
    for(let name=dir.read();name!=null;name=dir.read()) {
     if(name=='.'||name=='..') continue;
     if(++visited>4096 || count>=256 || total>=8388608 || time()-start>15) {result.complete=false;break;}
     let file=path+'/'+name;
     if(depth<2) {walk(file,depth+1);continue;}
     if(!match(name,/\.crt$/)) continue;
     if(!safe(file,'file')) {result.complete=false;continue;}
     let pem=bounded(file,262144); total+=length(pem);
     if(!pem || index(pem,'PRIVATE KEY')>=0) {result.complete=false;continue;}
     let leaf=match(pem,/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+\/=\r\n]+-----END CERTIFICATE-----/);
     if(!leaf) {result.complete=false;continue;}
     count++;
     let input=root+'/certificate-snapshot.pem',output=root+'/certificate-output';
     unlink(input);unlink(output);
     if(writefile(input,leaf[0])==null || !chmod(input,0600)) {result.complete=false;continue;}
     let code=system([command,input,output],2000);
     let text=code==0 ? bounded(output,65536):null;
     unlink(input);unlink(output);
     let cert=text ? parse(text,now,siteNames):null;
     if(cert) push(result.certificates,cert);else result.complete=false;
    }
    dir.close();
   }
   if(safe(storage.root,'directory')) walk(base,0);else result.complete=false;
   let observed=evidence(now); result.events=observed.events;result.history=observed.history;
   for(let cert in result.certificates) cert.renewal={state:'unknown',source:observed.history,events:filter(map(cert.sites,h=>observed.events[h]),e=>e!=null)};
   result.sites=map(siteNames,function(domain) {
    let certificates=filter(result.certificates,c=>index(c.sites,domain)>=0);
    return {domain,state:length(filter(certificates,c=>c.validity=='valid'))?'stored_valid':length(certificates)?'stored_invalid':'unknown',fingerprints:map(certificates,c=>c.fingerprint)};
   });
   return result;
  } catch(e) {return {...result,ok:false,complete:false,error:'Certificate evidence is unavailable'};}
  }
  let answer=run(); lock.close(); return answer;
 }
 return {scan,status:scan,check:scan};
};
