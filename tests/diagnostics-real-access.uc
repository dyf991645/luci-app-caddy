import {fixtureFactory} from './fixture-store.uc';
'use strict';
let api=fixtureFactory(ARGV[0])({root:'/tmp/luci-caddy-ticket10',logfile:'/tmp/luci-caddy-ticket10/server.log'});
let result=api.logs({kind:'access'});
assert(result.ok && length(result.entries)>=1 && result.entries[-1].status==200,'actual Caddy request generates safe access evidence');
for(let secret in ['FIXTURE_HEADER_CANARY','FIXTURE_QUERY_CANARY','Authorization','uri'])assert(index(sprintf('%J',result),secret)<0,'actual access request private fields omitted');
print('PASS actual Caddy access log privacy\n');
