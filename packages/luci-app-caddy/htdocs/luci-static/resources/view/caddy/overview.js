'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require caddy.layout as layout';

var status=rpc.declare({object:'luci.caddy',method:'status',expect:{'':{}}});
var draft=rpc.declare({object:'luci.caddy',method:'draft_get',expect:{'':{}}});
var diagnostics=rpc.declare({object:'luci.caddy',method:'diagnostics',expect:{'':{}}});
var action=rpc.declare({object:'luci.caddy',method:'action',params:['action'],expect:{'':{}}});

return view.extend({
 load:function(){return Promise.all([status(),draft(),diagnostics()]);},
 render:function(initial){
  var snapshot=initial[1],config=snapshot.draft,settings=config?.settings || {},sites=config?.sites || [],device=initial[2] || {},manual=config?.mode=='manual';
  var enabled=sites.filter(function(site){return site.enabled!==false;});
  var state=E('strong',{'role':'status','aria-live':'polite'}),uptime=E('small'),memory=E('strong');
  var emblem=E('span',{'class':'status-emblem','aria-hidden':'true'}),badge=E('span',{'class':'pill'}),info=E('div');
  var controls=E('div',{'class':'status-actions actions'}),pending=E('span',{'role':'status','aria-live':'polite'}),buttons={},busy=false,infoSignature,readonly=!L.hasViewPermission();
  function update(data){
   var label=data.running==null?_('Unknown'):data.running?_('Running'):_('Stopped');
   state.textContent='Caddy '+label;badge.textContent=label;badge.className='pill '+(data.running?'success':'gray');
   emblem.textContent=data.running?'✓':'□';emblem.className='status-emblem'+(data.running?' is-running':'');
   uptime.textContent=data.error || (data.running?_('Uptime')+' · '+layout.duration(data.uptime_seconds):label);
   memory.textContent=data.running===false?'—':layout.memory(data.memory_kib);
   var signature=JSON.stringify([data.version,data.modules]);
   if(signature!==infoSignature){infoSignature=signature;info.replaceChildren(
    layout.row(_('Target system'),device.firmware?('OpenWrt '+device.firmware.version+' / APK'):_('Unknown')),
    layout.row(_('Target architecture'),device.architecture?.apk || device.architecture?.kernel || _('Unknown')),
    layout.row(_('Packaged core source'),_('Official Caddy custom download · Cloudflare')),
    layout.row(_('Caddy version'),data.version?data.version.split(' ')[0]:_('Not installed')),
    layout.row(_('Cloudflare DNS'),(data.modules || []).find(function(m){return m.indexOf('dns.providers.cloudflare')==0;}) || _('Not installed')),
    layout.row(_('HTTP / HTTPS'),manual?_('Manual mode'):[settings.http_port || '—',settings.https_port || '—'].join(' / ')),
    layout.row(_('Configuration source'),config?(manual?_('Complete Caddyfile'):_('Form configuration')):_('No managed revision')),
    layout.row(_('Persistent storage directory'),manual?_('Managed filesystem'):settings.storage),
    E('details',{'class':'overview-details'},[
     E('summary',{},_('Version and module details')),
     layout.row(_('Core APK'),device.package?.version || _('Unknown')),
     layout.row(_('Firmware revision'),device.firmware?.revision || _('Unknown')),
     layout.row(_('Caddy version'),data.version || _('Not installed')),
     E('pre',{},(data.modules || []).join('\n') || _('No module information available'))
    ])
   );}
   Object.keys(buttons).forEach(function(name){buttons[name].disabled=busy || readonly || !data.installed || !data.running;});
  }
  function perform(name){
   if(busy || buttons[name].disabled)return;
   busy=true;pending.textContent=_('Working…');Object.keys(buttons).forEach(function(key){buttons[key].disabled=true;});
   return action(name).then(function(result){if(!result.ok)throw new Error(result.error || _('Service operation failed'));})
    .catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');})
    .finally(function(){busy=false;pending.textContent='';return status().then(update);});
  }
  [['reload','reload']].forEach(function(item){
   buttons[item[0]]=E('button',{'class':'button small','click':function(){return perform(item[0]);}},item[1]);controls.appendChild(buttons[item[0]]);
  });
  controls.appendChild(pending);update(initial[0]);
  poll.add(function(){return busy?Promise.resolve():status().then(update);},5);
  function metric(label,value){return E('div',{'class':'status-metric'},[E('small',{},label),typeof value=='object'?value:E('strong',{},value)]);}
  function flowPart(symbol,label){return E('span',{'class':'overview-flow-part'},[E('span',{'class':'overview-flow-icon '+symbol,'aria-hidden':'true'},''),label]);}
  return layout.page('overview',_('Overview'),_('View service status, listener ports and configuration.'),[
   E('section',{'class':'status-strip overview-status'},[
    E('div',{'class':'status-service'},[emblem,E('div',{},[state,uptime])]),
    metric(_('Enabled sites'),manual?_('Manual mode'):enabled.length+' / '+sites.length),
    metric(_('HTTPS port'),manual?_('Manual mode'):':'+(settings.https_port || '—')),
    metric(_('Resident memory'),memory),controls
   ]),
   E('div',{'class':'two-column overview-columns'},[
    layout.panel(_('Service information'),'',info,[badge]),
    layout.panel(_('Configuration summary'),'',[
     layout.row(_('Enabled sites'),manual?_('Manual mode'):String(enabled.length)),
     layout.row(_('Default verification method'),manual?_('Manual mode'):(settings.default_challenge || 'http-01').toUpperCase()),
     layout.row(_('Configuration state'),snapshot.pending?_('Pending application'):_('No pending changes')),
     E('div',{'class':'overview-flow','aria-label':_('Domain to Caddy to service')},[flowPart('globe',_('Domain')),E('span',{'class':'muted','aria-hidden':'true'},'→'),flowPart('shield','Caddy'),E('span',{'class':'muted','aria-hidden':'true'},'→'),flowPart('network',_('Service'))]),
     E('details',{'class':'overview-details'},[E('summary',{},_('Configuration revisions')),layout.row(_('Saved revision'),snapshot.draft_revision),layout.row(_('Active revision'),snapshot.active_revision),snapshot.recovery_required?layout.note(_('Recovery required: start or restart Caddy')):''])
    ])
   ])
  ]);
 },handleSave:null,handleSaveApply:null,handleReset:null
});
