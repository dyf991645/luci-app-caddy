let apply=loadfile(ARGV[0])();
for(let initial in [{running:false,enabled:false},{running:true,enabled:true},{running:true,enabled:false},{running:false,enabled:true}]) {
 for(let desired in [{running:false,enabled:false},{running:true,enabled:true},{running:true,enabled:false},{running:false,enabled:true}]) {
  let calls=[];assert(apply(desired,{observe:()=>initial,action:a=>{push(calls,a);return 0;}}),'apply service state');
  let expected=[];if(desired.running!=initial.running)push(expected,desired.running?'start':'stop');if(desired.enabled!=initial.enabled)push(expected,desired.enabled?'enable':'disable');
  assert(sprintf('%J',calls)==sprintf('%J',expected),'only required state transitions in order');
 }
}
let calls=[];assert(!apply({running:true,enabled:true},{observe:()=>({running:false,enabled:false}),action:a=>{push(calls,a);return 1;}}) && length(calls)==1,'failed start prevents enable');
assert(!apply({running:'invalid',enabled:true},{observe:()=>die('invalid input must not act')}),'invalid native UCI boolean rejected');
assert(!apply({running:false,enabled:false},{observe:()=>null}),'unknown process state does not act');
print('PASS desired UCI service transitions, unchanged state, failure propagation and validation\n');
