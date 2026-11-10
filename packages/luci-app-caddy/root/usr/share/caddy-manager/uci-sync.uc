'use strict';
// Local constructor options are a test seam, never exposed as RPC parameters.
return function(options) {
 let root=options?.root || '/etc/caddy';
 let store=loadfile(options?.store_module || '/usr/share/caddy-manager/uci-store.uc')()({root,confdir:options?.confdir,savedir:root+'/uci-committed'});
 let manager=loadfile(options?.manager_module || '/usr/share/caddy-manager/config.uc')()({...options,store});
 let state=manager.draft_get();
 return state.pending ? manager.apply({expected_revision:state.draft_revision}) : state;
};
