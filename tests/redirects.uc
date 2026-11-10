// Public preview -> real Caddy response seam; no certificates or external DNS.
import {writefile} from 'fs';
let manager=loadfile(ARGV[0])()({root:ARGV[1],admin:'127.0.0.1:32019',bind:'127.0.0.1',internal_tls:true,disable_certificates:true});
let config={version:2,settings:{http_port:32080,https_port:+ARGV[2],email:'',storage:ARGV[1]+'/data'},sites:[]};
for(let domain in ['exact.example.test','*.example.test']) push(config.sites,{domain,upstreams:['http://127.0.0.1:32081'],balance:'round_robin',path:'',strip:false,challenge:substr(domain,0,2)=='*.'?'dns-01':'http-01'});
let response=manager.preview({config});
assert(response.ok,'valid specific and wildcard domains preview');
writefile(ARGV[1]+'/redirect.json',sprintf('%J',response.config));
