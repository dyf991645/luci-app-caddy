'use strict';
'require view';
'require rpc';
'require ui';
'require caddy.layout as layout';
var diagnostics=rpc.declare({object:'luci.caddy',method:'diagnostics',expect:{'':{}}});
var logs=rpc.declare({object:'luci.caddy',method:'logs',params:['level','kind'],expect:{'':{}}});
var probe=rpc.declare({object:'luci.caddy',method:'backend_probe',params:['confirm'],expect:{'':{}}});
return view.extend({
 load:function(){return diagnostics().then(function(info){return logs('all','runtime').then(function(runtime){return logs('all','access').then(function(access){return [info,runtime,access];});});});},
 render:function(initial){
  var info=E('div',{'class':'two-column'}),feedback=E('p',{'role':'status','aria-live':'polite'}),probeResult=E('div'),busy=false,source=initial[0]?.source;
  var levelNames={all:_('All'),debug:_('Debug'),info:_('Info'),warn:_('Warning'),error:_('Error')};
  var eventNames={certificate_pending:_('Certificate operation started'),issuer_error:_('Issuer reported an error'),certificate_success:_('Certificate operation succeeded'),request_completed:_('Request completed'),service_error:_('Service error'),service_warning:_('Service warning'),service_event:_('Service event'),config_adapt_success:_('Caddyfile adaptation succeeded'),config_adapt_failed:_('Caddyfile adaptation failed'),config_validate_success:_('Configuration validation succeeded'),config_validate_failed:_('Configuration validation failed'),config_reload_success:_('Configuration reload succeeded'),config_reload_failed:_('Configuration reload failed')};
  function row(label,value){return layout.row(label,value==null ? _('Unknown') : String(value));}
  function showDiagnostic(data){
   if(!data.ok){info.replaceChildren(E('p',{'class':'alert-message warning'},data.error || _('Diagnostics unavailable')));return;}
   source=data.source;
   var notes=[row(_('Caddy version'),data.binary.version),row(_('Cloudflare module'),data.binary.cloudflare==null?null:data.binary.cloudflare?_('Present'):_('Missing')),row(_('Core APK'),data.package.version),row(_('Architecture (kernel / APK)'),[data.architecture.kernel || '?',data.architecture.apk || '?'].join(' / ')),row(_('OpenWrt'),data.firmware ? data.firmware.version+' · '+data.firmware.target : null),row(_('Service'),data.running==null?null:data.running?_('Running'):_('Stopped')),
    row(_('Private configuration permissions'),data.permissions.root_private && data.permissions.active_private?_('Root only'):_('Missing or unsafe permissions')),
    row(_('Process environment'),data.environment==null?_('Unavailable while stopped or unreadable'):data.environment.home && data.environment.data_home && data.environment.config_home?_('Managed HOME and XDG directories'):_('Unexpected HOME or XDG directory')),
    row(_('Log retention'),_('RAM ring')+' · '+(data.retention.buffer_kib==null?'?':data.retention.buffer_kib)+' KiB'),
    row(_('Active ports'),data.active_ports.join(', ') || _('No listener evidence'))];
   if(data.retention.persistent_file || data.retention.external_forwarding)notes.push(E('p',{'class':'alert-message warning'},_('System logging has a separately configured file or remote destination. Review its retention and access permissions. This application does not change it.')));
   var portNotes=[];
   data.ports.forEach(function(p){portNotes.push(row(p.protocol+' '+p.port,({conflict:_('Conflict with another service'),own_service:_('Owned by Caddy'),available:_('No current TCP listener'),unknown:_('Unknown')})[p.state]));});
   portNotes.push(E('details',{},[E('summary',{},_('Actual local TCP listeners')),E('pre',{'style':'white-space:pre-wrap;overflow-wrap:anywhere'},data.listeners_available?data.listeners.map(function(l){return l.address+':'+l.port+' · '+l.owner;}).join('\n'):_('Listener query unavailable'))]));
   notes.push(E('details',{},[E('summary',{},_('Actual Caddy modules')),E('pre',{'style':'white-space:pre-wrap;overflow-wrap:anywhere'},data.binary.modules.join('\n') || _('Module query unavailable'))]));
   info.replaceChildren(layout.panel(_('Service information'),'',notes),layout.panel(_('Port checks'),'',portNotes));
  }
  function logPanel(kind,title,initialLogs){
   var records=E('div'),entries=[],level=E('select',{'aria-label':title+' · '+_('Log level')},['all','debug','info','warn','error'].map(function(x){return E('option',{'value':x},levelNames[x]);}));
   function showLogs(data){
   entries=data.ok ? data.entries:[];
   if(!data.ok){records.replaceChildren(E('p',{'class':'alert-message warning'},data.error || _('Log source unavailable')));return;}
   if(!entries.length){records.replaceChildren(E('p',{'class':'muted'},_('No matching logs.')));return;}
   records.replaceChildren(E('div',{'class':'diagnostic-log-table'},E('table',{'class':'table'},[
    E('thead',{},E('tr',{},[_('Time'),_('Level'),_('Source'),_('Event')].map(function(title){return E('th',{},title);}))),
    E('tbody',{},entries.map(function(e){return E('tr',{},[
     E('td',{},new Date(e.ts*1000).toLocaleString()),E('td',{},levelNames[e.level]),E('td',{},e.logger),E('td',{},eventNames[e.event]+(e.status?' · HTTP '+e.status:''))
    ]);}))
   ])));

  }

   function refreshLogs(){return logs(level.value,kind).then(showLogs);}
   level.addEventListener('change',function(){return working(refreshLogs);});
   var download=E('button',{'class':'button cbi-button','click':function(){var url=URL.createObjectURL(new Blob([JSON.stringify({source:'bounded_safe_event_records',kind:kind,entries:entries},null,2)],{type:'application/json'}));var link=E('a',{'href':url,'download':'caddy-'+kind+'-logs.json'});document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},0);}},_('Export filtered logs'));
   showLogs(initialLogs);
   return {refresh:refreshLogs,node:layout.panel(title,'',[E('div',{'class':'diagnostic-filters diagnostic-log-filters'},[E('label',{},[_('Level'),level]),download]),records])};
  }
  var runtime=logPanel('runtime',_('Runtime logs'),initial[1]),access=logPanel('access',_('Access logs'),initial[2]);
  function working(task){if(busy)return;busy=true;feedback.textContent=_('Reading local evidence…');refresh.disabled=true;probeButton.disabled=true;return task().catch(function(e){ui.addNotification(null,E('p',{},e.message),'error');}).finally(function(){busy=false;feedback.textContent=_('Read complete');refresh.disabled=false;probeButton.disabled=!L.hasViewPermission() || source=='manual';});}
  var refresh=E('button',{'class':'button cbi-button','click':function(){return working(function(){return Promise.all([diagnostics(),runtime.refresh().then(access.refresh)]).then(function(data){showDiagnostic(data[0]);});});}},_('Refresh'));
  var probeButton=E('button',{'class':'button cbi-button','disabled':(!L.hasViewPermission() || source=='manual') || null,'click':function(){
   if(!L.hasViewPermission() || source=='manual')return Promise.resolve();
   return working(function(){return probe(true).then(function(data){
    if(!data.ok){probeResult.replaceChildren(E('p',{'class':'alert-message warning'},data.error || _('Backend probe failed')));return;}
    var backends=data.backends || [];
    probeResult.replaceChildren();
    if(!backends.length)probeResult.appendChild(E('p',{'class':'muted'},_('No configured backends to check.')));
    backends.forEach(function(b){probeResult.appendChild(row(b.url,b.state=='tcp_reachable'?_('TCP reachable'):_('Unreachable or timed out')));});
    if(data.complete===false)probeResult.appendChild(E('p',{'class':'hint'},_('Only the first 8 backends are shown.')));
   });});
  }},_('Check backends'));
  probeResult.appendChild(E('p',{'class':'muted'},source=='manual'?_('Backend checks are unavailable in Caddyfile mode.'):_('Not checked yet. Click Check backends to test TCP connectivity.')));
  showDiagnostic(initial[0]);
  return layout.page('diagnostics',_('Logs and diagnostics'),'',[
   feedback,info,
   layout.panel(_('Backend reachability'),'',probeResult,probeButton),
   runtime.node,access.node
  ],refresh);
 },handleSave:null,handleSaveApply:null,handleReset:null
});
