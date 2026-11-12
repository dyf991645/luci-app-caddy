'use strict';
import {mkdir,chmod,writefile,readfile} from 'fs';
let root=ARGV[1];mkdir(root,0700);chmod(root,0700);
let command=root+'/probe';writefile(command,'#!/bin/sh\necho "$2:$3" >> "'+root+'/calls"\nexit 0\n');chmod(command,0700);
let urls=[];for(let i=0;i<22;i++)push(urls,'http://127.0.0.1:'+(30000+i));
let sites=[{upstreams:[...urls,urls[0],'invalid','http://127.0.0.1:99999']}];
let manager=loadfile(ARGV[0])()({root,command,store:{read:()=>({config:{mode:'form',sites}})}});
let results=[],offset=0;
for(let i=0;i<3;i++) {
 let batch=manager.probe({confirm:true,offset});
 assert(batch.ok && batch.total==22,'all unique valid targets counted');
 assert(length(batch.backends)==(i==2?6:8),'bounded batch size');
 results=[...results,...batch.backends];
 assert(batch.complete==(i==2),'completion flag');
 offset=batch.next_offset;
}
assert(offset==null && length(results)==22,'complete traversal');
for(let i=0;i<22;i++)assert(results[i].url==urls[i] && results[i].state=='tcp_reachable','ordered complete results');
assert(length(split(trim(readfile(root+'/calls')),'\n'))==22,'each unique target probed once');
for(let bad in [-1,1.5,'8',false])assert(!manager.probe({confirm:true,offset:bad}).ok,'invalid offsets rejected');
assert(!manager.probe({confirm:true,offset:0,url:'http://arbitrary.invalid:80'}).ok,'arbitrary target rejected');
assert(manager.probe({confirm:true,offset:22}).complete,'empty end batch');
print('PASS native backend batching: 22 unique targets, no duplicates, bounded calls, offset validation\n');
