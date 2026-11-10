import {writefile} from 'fs';
let root=ARGV[1], path=root+'/events';
// Source-derived Caddy2.11.8/CertMagic0.25.6 shapes, not real public ACME.
let events=[{ts:100,logger:'tls.renew',msg:'renewing certificate',identifier:'a.example.test'},{ts:101,logger:'tls.renew',msg:'could not get certificate from issuer',identifier:'a.example.test',error:'Token SECRET_CANARY'}];
writefile(path,join('\n',map(events,e=>sprintf('%J',e)))+'\n');
let m=loadfile(ARGV[0])()({root,command:ARGV[2],logfile:path});
let r=m.check();
assert(r.certificates[0].validity=='valid' && r.events['a.example.test'].state=='issuer_error','renewal issuer failure preserves valid certificate');
assert(index(sprintf('%J',r),'SECRET_CANARY')<0,'provider errors never leave evidence boundary');
push(events,{ts:102,logger:'tls.renew',msg:'certificate renewed successfully',identifier:'a.example.test'});
writefile(path,join('\n',map(events,e=>sprintf('%J',e)))+'\n');
r=m.check();
assert(r.events['a.example.test'].state=='success' && r.events['a.example.test'].error==null,'later issuer success clears failure evidence');
assert(m.check().events['a.example.test'].observed_at==102,'replayed window does not invent new attempts');
print('PASS source-derived renewal failure, recovery, replay and error privacy\n');
