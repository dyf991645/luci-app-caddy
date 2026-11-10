'use strict';
import {readfile} from 'fs';
// Linux aarch64 exposes /proc starttime in USER_HZ=100, independent of CONFIG_HZ.
// proc_root is a local fixture seam; RPC callers cannot supply it.
return function(pid,proc_root) {
 let result={uptime_seconds:null,memory_kib:null};
 if(type(pid)!='int' || pid<1)return result;
 let root=proc_root || '/proc',stat=readfile(root+'/'+pid+'/stat');
 let parts=stat?match(stat,/^[0-9]+ \(caddy\) (.*)$/):null;
 if(!parts)return result;
 let fields=split(trim(parts[1]),/[[:space:]]+/),up=readfile(root+'/uptime');
 if(length(fields)>19 && match(fields[19],/^[0-9]+$/) && up && match(up,/^[0-9]+\.[0-9]+ /))result.uptime_seconds=max(0,int(+split(up,' ')[0] - +fields[19]/100));
 let status=readfile(root+'/'+pid+'/status'),rss=status?match(status,/(^|\n)VmRSS:[[:blank:]]+([0-9]+) kB/):null;
 if(rss)result.memory_kib=+rss[2];
 return result;
};
