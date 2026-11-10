import {glob,readfile} from 'fs';
let found=false;
for(let path in glob('/proc/[0-9]*/cmdline')) {
 let args=readfile(path)||'';
 if(index(args,'/usr/bin/curl')==0) {
  found=true;assert(index(args,'CANARY')<0 && index(args,'Bearer')<0 && index(args,'29082')<0,'webhook URL and headers absent from curl argv');
 }
}
assert(found,'controlled slow delivery curl process observed');
print('PASS curl argv has no URL/query/header secrets\n');
