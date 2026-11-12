// Exercise the exact streaming parser used by the target LuCI dispatcher.
import {open,access} from 'fs';
let file=open(ARGV[0],'r');assert(file,'menu file exists');
let menu=json(file);file.close();
assert(type(menu)=='object' && menu['admin/services/caddy'].action.type=='firstchild','Caddy parent route');
for(let name in ['overview','configuration','middlewares','tls','settings','config','diagnostics','certificates','notifications']) {
 let node=menu['admin/services/caddy/'+name];assert(node?.action?.type=='view','view route '+name);
 assert(access(ARGV[1]+'/view/'+node.action.path+'.js'),'installed view resource '+name);
}
print('PASS native LuCI streaming menu parser, parent route and all child view resources\n');
