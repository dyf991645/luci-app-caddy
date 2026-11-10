'use strict';
import {mkdir,chmod,writefile} from 'fs';
let root=ARGV[1];mkdir(root,0700);chmod(root,0700);
let lines=[
 {ts:1700000000,level:'error',logger:'tls.obtain',msg:'could not get certificate from issuer',error:'Token VERY_PRIVATE_TOKEN https://provider/?token=QUERY_SECRET',identifier:'HEADER_SECRET'},
 {ts:1700000001,level:'info',logger:'http.log.access.log0',msg:'handled request',status:401,duration:0.01,size:12,request:{uri:'/?token=QUERY_SECRET',headers:{Authorization:['Basic HEADER_SECRET']}}},
 {ts:1700000002,level:'info',logger:'admin',msg:'stopped previous server',extra:'PRIVATE_KEY_CANARY'},
 {ts:1700000003,level:'error',logger:'unknown.PRIVATE_TOKEN',msg:'ARBITRARY_SECRET'},
 {ts:1700000004,level:'info',logger:'tls.obtain',msg:'certificate obtained successfully'}
];
writefile(root+'/log',join('\n',map(lines,e=>'daemon.err caddy[123]: '+sprintf('%J',e)))+'\nraw PRIVATE_KEY_CANARY\n');
let api=loadfile(ARGV[0])()({root,logfile:root+'/log'});
let result=api.logs({});
assert(result.ok && length(result.entries)==4,'real structured events have safe event records; unknown records omitted');
assert(result.entries[0].event=='issuer_error' && result.entries[0].ts==1700000000,'issuer error preserves actual evidence time without provider text');
assert(result.entries[1].status==401 && result.entries[1].kind=='access','optional access evidence retains status');
let serialized=sprintf('%J',result);
for(let secret in ['VERY_PRIVATE_TOKEN','QUERY_SECRET','HEADER_SECRET','PRIVATE_KEY_CANARY','ARBITRARY_SECRET','"request":','identifier']) assert(index(serialized,secret)<0,'RPC/export must omit raw message/private fields');
assert(length(api.logs({level:'error'}).entries)==1,'level filter selects error evidence');
assert(length(api.logs({kind:'access'}).entries)==1,'kind filter selects access evidence');
assert(api.logs({level:'error; touch /tmp/injection'}).ok==false,'unsupported filters rejected');
let many=[];for(let i=0;i<400;i++)push(many,sprintf('%J',{ts:1700000000+i,logger:'tls.obtain',level:'info',msg:'obtaining certificate'}));
writefile(root+'/log',join('\n',many));
assert(length(api.logs({}).entries)<=256,'log window has a line cap');
writefile(root+'/log','');assert(api.logs({}).state=='empty','empty log reports an explicit state');
writefile(root+'/log',join('',map(many,x=>x+x+x+x+x)));
assert(api.logs({}).ok==false,'oversized source does not escape byte bound');
print('PASS safe bounded logs/filter/export\n');
