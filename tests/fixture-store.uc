'use strict';
import {readfile,writefile,mkdir,chmod} from 'fs';
// Test-only persistence seam for isolated manager/notification/diagnostic tests.
// Production always uses native UCI; this helper is never packaged.
export function fixtureStore(root) {
 mkdir(root,0700);chmod(root,0700);
 let path=root+'/fixture-store.json';
 function get(){let text=readfile(path);return text?json(text):{revision:0,config:null,credentials:{},profiles:{},notifications:{enabled:false,url:'',headers:{}}};}
 function put(v){assert(writefile(path,sprintf('%J',v))!=null && chmod(path,0600),'fixture write');}
 return {
  read:()=>({revision:get().revision,config:get().config}),
  write:function(v){put({...get(),revision:v.revision,config:v.config});},
  equivalent:(a,b)=>sprintf('%J',a)==sprintf('%J',b),hasChanges:()=>false,commit:()=>true,
  saveCredential:function(token){let v=get(),id=length(keys(v.credentials))+1;v.credentials[id]={token};put(v);return id;},
  saveProfile:function(users){let v=get(),id='basic-'+(length(keys(v.profiles))+1)+'-0';v.profiles[id]=users;put(v);return id;},
  secret:(kind,id)=>kind=='credential'?get().credentials[id]:get().profiles[id],
  notifications:()=>get().notifications,
  saveNotifications:function(value){let v=get();v.notifications=value;put(v);}
 };
};
export function fixtureFactory(module) {
 let create=loadfile(module)();
 return options=>create({...options,store:options?.store || fixtureStore(options.root)});
};
