'use strict';
import { cursor } from 'uci';
import { readfile, writefile, mkdir, chmod, rename, open } from 'fs';

// rpcd's UCI package uses /var/run/rpcd/uci-<session> (OpenWrt 25.12).
// Only private immutable snapshots live here; the native changeset holds a revision.
return function(options) {
 let root=options?.root || '/etc/caddy', confdir=options?.confdir || '/etc/config';
 let session=options?.session;
 if(session!=null && !match(session,/^[a-f0-9]{32}$/)) die('Invalid UCI session');
 let savedir=options?.savedir || (session ? '/var/run/rpcd/uci-'+session : '/tmp/.uci');
 let base=options?.base_savedir || root+'/uci-committed';
 mkdir(root,0700);chmod(root,0700);mkdir(root+'/config-versions',0700);chmod(root+'/config-versions',0700);
 mkdir(savedir,0700);chmod(savedir,0700);mkdir(base,0700);chmod(base,0700);
 function read(name,fallback) {let text=readfile(root+'/'+name);return text==null ? fallback : json(text);}
 function snapshot(ref) {
  if(type(ref)!='string' || !match(ref,/^[0-9]+$/)) die('Invalid Caddy UCI revision');
  let value=read('config-versions/'+ref+'.json',null);
  if(value==null || value.revision!=+ref) die('Missing Caddy UCI snapshot');
  return value;
 }
 function reference(dir) {let c=cursor(confdir,dir);return c.get('caddy','config','revision');}
 function persist(value) {
  let f=open(root+'/config-versions/'+value.revision+'.json','wx',0600);
  if(!f) die('Unable to create Caddy configuration snapshot');
  let text=sprintf('%J',value),written=f.write(text);f.close();
  if(written!=length(text)) die('Unable to write Caddy configuration snapshot');
 }
 function initialize() {
  let ref=reference(base);
  if(ref && ref!='legacy') return;
  // Preserve the pre-UCI saved configuration as the initial committed source.
  let legacy=read('draft.json',read('active-state.json',{revision:0,config:null}));
  let path=root+'/config-versions/'+legacy.revision+'.json';
  if(readfile(path)==null) persist(legacy);
  let c=cursor(confdir,base);
  if(!c.get('caddy','config')) c.set('caddy','config','manager');
  if(!c.set('caddy','config','revision',''+legacy.revision) || !c.commit('caddy')) die('Unable to initialize Caddy UCI source');
 }
 return {
  read:function() {
   let ref=reference(savedir);
   // Read-only requests preserve legacy state until the first explicit save/apply.
   return !ref || ref=='legacy' ? read('draft.json',{revision:0,config:null}) : snapshot(ref);
  },
  write:function(value) {
   initialize();
   // The manager's lock serializes all sessions. Allocate globally unique versions
   // so reverting one browser cannot overwrite another browser's saved snapshot.
   let sequence=read('uci-sequence.json',{revision:+reference(base)});
   value.revision=(sequence.revision>value.revision ? sequence.revision : value.revision)+1;
   persist(value);
   let path=root+'/uci-sequence.json';
   if(writefile(path+'.tmp',sprintf('%J',{revision:value.revision}))==null || !chmod(path+'.tmp',0600) || !rename(path+'.tmp',path)) die('Unable to persist UCI sequence');
   let c=cursor(confdir,savedir);
   if(!c.set('caddy','config','revision',''+value.revision) || !c.save('caddy')) die('Unable to stage Caddy UCI changes');
   if(system(['/bin/sync'],10000)!=0) die('Unable to sync UCI snapshot');
  },
  commit:function() {
   initialize();
   let c=cursor(confdir,savedir);
   return c.load('caddy') && c.commit('caddy');
  }
 };
};
