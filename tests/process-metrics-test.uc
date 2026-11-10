import {mkdir,writefile} from 'fs';
let root=ARGV[1];mkdir(root,0700);mkdir(root+'/123',0700);
let metrics=loadfile(ARGV[0])();
writefile(root+'/uptime','150.50 300.00\n');
// Field 22 is process start time in USER_HZ (100 ticks/second on target Linux).
writefile(root+'/123/stat','123 (caddy) S 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 12500 0\n');
writefile(root+'/123/status','Name:\tcaddy\nVmRSS:\t28672 kB\n');
let result=metrics(123,root);assert(result.uptime_seconds==25 && result.memory_kib==28672,'known process age and RSS use actual proc values');
assert(metrics(null,root).uptime_seconds==null && metrics(999,root).memory_kib==null,'missing processes stay unknown');
writefile(root+'/123/stat','123 (other) S 0 0');assert(metrics(123,root).uptime_seconds==null,'unexpected process does not yield metrics');
print('PASS process uptime and resident memory with unknown-state handling\n');
