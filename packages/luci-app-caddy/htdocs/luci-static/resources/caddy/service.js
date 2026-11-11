'use strict';
'require baseclass';
'require rpc';
'require caddy.layout as layout';

var status=rpc.declare({object:'luci.caddy',method:'status',expect:{'':{}}});
var save=rpc.declare({object:'luci.caddy',method:'service_save',params:['running','enabled'],expect:{'':{}}});

return baseclass.extend({
 controls:function(onChange) {
  return status().then(function(initial) {
   var current=initial.desired || initial,busy=false,saving=false,readonly=!L.hasViewPermission();
   var running=E('input',{id:'caddy-service-running',type:'checkbox','aria-label':_('Run Caddy'),checked:current.running || null});
   var boot=E('input',{id:'caddy-service-boot',type:'checkbox','aria-label':_('Start on boot'),checked:current.enabled || null});
   running.checked=!!current.running;boot.checked=!!current.enabled;
   function pending(){return running.checked!==!!current.running || boot.checked!==!!current.enabled;}
   function update(){running.disabled=boot.disabled=busy || saving || readonly || !initial.installed;}
   function changed(){update();if(onChange)onChange();}
   running.addEventListener('change',changed);boot.addEventListener('change',changed);update();
   var panel=layout.panel(_('Service control'),'',[
    E('div',{'class':'settings-control-row'},[E('label',{for:'caddy-service-running'},_('Run Caddy')),running]),
    E('div',{'class':'settings-control-row'},[E('label',{for:'caddy-service-boot'},_('Start on boot')),boot])
   ]);
   panel.serviceControls={
    reset:function(){running.checked=!!current.running;boot.checked=!!current.enabled;update();},
    pending:pending,setBusy:function(value){busy=value;update();},
    save:function(){
     if(saving || readonly || !initial.installed || !pending())return Promise.resolve();
     saving=true;update();
     return save(running.checked,boot.checked).then(function(result){
      if(!result.ok)throw new Error(result.error || _('Service operation failed'));
      current={running:running.checked,enabled:boot.checked};
     }).finally(function(){saving=false;update();});
    }
   };
   return panel;
  }).catch(function(error){return layout.note(_('Unable to read service state')+': '+error.message);});
 }
});
