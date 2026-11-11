'use strict';
// Desired UCI state is applied only after configuration validation/commit.
// Adapters keep service operation tests isolated from the router's actual service.
return function(desired,adapter) {
 if(type(desired.running)!='bool' || type(desired.enabled)!='bool')return false;
 let observed=adapter.observe();if(observed==null)return false;
 if(desired.running!=observed.running && adapter.action(desired.running?'start':'stop')!==0)return false;
 if(desired.enabled!=observed.enabled && adapter.action(desired.enabled?'enable':'disable')!==0)return false;
 return true;
};
