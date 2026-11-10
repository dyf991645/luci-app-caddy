'use strict';
'require view';
'require rpc';
'require ui';
'require caddy.layout as layout';
var diagnostics=rpc.declare({object:'luci.caddy',method:'diagnostics',expect:{'':{}}});
var logs=rpc.declare({object:'luci.caddy',method:'logs',params:['level','kind'],expect:{'':{}}});
var probe=rpc.declare({object:'luci.caddy',method:'backend_probe',params:['confirm'],expect:{'':{}}});
return view.extend({
 load:function(){return Promise.all([diagnostics(),logs('all','all')]);},
 render:function(initial){
  var info=E('div',{'class':'two-column'}),records=E('div'),feedback=E('p',{'role':'status','aria-live':'polite'}),probeResult=E('div'),entries=[],busy=false;
  var levelNames={all:_('All'),debug:_('Debug'),info:_('Info'),warn:_('Warning'),error:_('Error')},kindNames={all:_('All'),runtime:_('Runtime'),access:_('Access')};
  var eventNames={certificate_pending:_('Certificate operation started'),issuer_error:_('Issuer reported an error'),certificate_success:_('Certificate operation succeeded'),request_completed:_('Request completed'),service_error:_('Service error'),service_warning:_('Service warning'),service_event:_('Service event'),config_adapt_success:_('Caddyfile adaptation succeeded'),config_adapt_failed:_('Caddyfile adaptation failed'),config_validate_success:_('Configuration validation succeeded'),config_validate_failed:_('Configuration validation failed'),config_reload_success:_('Configuration reload succeeded'),config_reload_failed:_('Configuration reload failed')};
  var level=E('select',{'aria-label':_('Log level')},['all','debug','info','warn','error'].map(function(x){return E('option',{'value':x},levelNames[x]);}));
  var kind=E('select',{'aria-label':_('Log type')},['all','runtime','access'].map(function(x){return E('option',{'value':x},kindNames[x]);}));
  function row(label,value){return layout.row(label,value==null ? _('Unknown') : String(value));}
  function showDiagnostic(data){
   if(!data.ok){info.replaceChildren(E('p',{'class':'alert-message warning'},data.error || _('Diagnostics unavailable')));return;}
   var notes=[row(_('Caddy version'),data.binary.version),row(_('Cloudflare module'),data.binary.cloudflare==null?null:data.binary.cloudflare?_('Present'):_('Missing')),row(_('Core APK'),data.package.version),row(_('Architecture (kernel / APK)'),[data.architecture.kernel || '?',data.architecture.apk || '?'].join(' / ')),row(_('OpenWrt'),data.firmware ? data.firmware.version+' · '+data.firmware.target : null),row(_('Service'),data.running==null?null:data.running?_('Running'):_('Stopped')),
    row(_('Private configuration permissions'),data.permissions.root_private && data.permissions.active_private?_('Root only'):_('Missing or unsafe permissions')),
    row(_('Process environment'),data.environment==null?_('Unavailable while stopped or unreadable'):data.environment.home && data.environment.data_home && data.environment.config_home?_('Managed HOME and XDG directories'):_('Unexpected HOME or XDG directory')),
    row(_('Log retention'),_('RAM ring')+' · '+(data.retention.buffer_kib==null?'?':data.retention.buffer_kib)+' KiB'),
    row(_('Last active internal ports'),data.active_ports.join(', ') || _('No listener evidence'))];
   if(data.retention.persistent_file || data.retention.external_forwarding)notes.push(E('p',{'class':'alert-message warning'},_('System logging has a separately configured file or remote destination. Review its retention and access permissions. This application does not change it.')));
   var portNotes=[];
   if(data.source=='manual')portNotes.push(E('p',{},_('Complete Caddyfile: retained form ports do not describe the active listener. See last active ports and actual listeners.')));
   data.ports.forEach(function(p){portNotes.push(row(p.protocol+' '+p.port,({conflict:_('Conflict with another service'),own_service:_('Owned by Caddy'),available:_('No current TCP listener'),unknown:_('Unknown')})[p.state]));});
   portNotes.push(E('details',{},[E('summary',{},_('Actual local TCP listeners')),E('pre',{'style':'white-space:pre-wrap;overflow-wrap:anywhere'},data.listeners_available?data.listeners.map(function(l){return l.address+':'+l.port+' · '+l.owner;}).join('\n'):_('Listener query unavailable'))]));
   notes.push(E('details',{},[E('summary',{},_('Actual Caddy modules')),E('pre',{'style':'white-space:pre-wrap;overflow-wrap:anywhere'},data.binary.modules.join('\n') || _('Module query unavailable'))]));
   info.replaceChildren(layout.panel(_('Service information'),'',notes),layout.panel(_('Draft port checks'),'',portNotes));
  }
  function showLogs(data){
   entries=data.ok ? data.entries:[];
   if(!data.ok){records.replaceChildren(E('p',{'class':'alert-message warning'},data.error || _('Log source unavailable')));return;}
   records.replaceChildren(E('p',{},_('Partial logd window: at most 256 records / 128 KiB. Unknown or private fields and unrecognized lines are omitted. Empty history does not prove success.')));
   if(!entries.length)records.appendChild(E('p',{},_('No safe records match these filters. Refresh after a service event, or enable access logging and apply the draft.')));
   else records.appendChild(E('pre',{'style':'white-space:pre-wrap;overflow-wrap:anywhere;max-height:32em;overflow:auto'},entries.map(function(e){return new Date(e.ts*1000).toLocaleString()+' '+levelNames[e.level]+' '+e.logger+' '+eventNames[e.event]+(e.status?' · HTTP '+e.status:'');}).join('\n')));
  }
  function working(task){if(busy)return;busy=true;feedback.textContent=_('Reading local evidence…');refresh.disabled=true;probeButton.disabled=true;return task().catch(function(e){ui.addNotification(null,E('p',{},e.message),'error');}).finally(function(){busy=false;feedback.textContent=_('Read complete');refresh.disabled=false;probeButton.disabled=!L.hasViewPermission();});}
  var refresh=E('button',{'class':'button cbi-button','click':function(){return working(function(){return Promise.all([diagnostics(),logs(level.value,kind.value)]).then(function(data){showDiagnostic(data[0]);showLogs(data[1]);});});}},_('Refresh'));
  var probeButton=E('button',{'class':'button cbi-button','disabled':!L.hasViewPermission(),'click':function(){return working(function(){return probe(true).then(function(data){probeResult.replaceChildren(E('p',{},data.ok?_('TCP only: this does not verify HTTP health, TLS trust, authentication or Internet reachability.'):data.error));if(data.ok)data.backends.forEach(function(b){probeResult.appendChild(row(b.url,b.state=='tcp_reachable'?_('TCP reachable'):_('Unreachable or timed out')));});});});}},_('Probe configured draft backends'));
  level.addEventListener('change',function(){refresh.click();});kind.addEventListener('change',function(){refresh.click();});
  var download=E('button',{'class':'button cbi-button','click':function(){var url=URL.createObjectURL(new Blob([JSON.stringify({source:'bounded_safe_event_records',entries:entries},null,2)],{type:'application/json'}));var link=E('a',{'href':url,'download':'caddy-safe-events.json'});document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},0);}},_('Export filtered safe events'));
  showDiagnostic(initial[0]);showLogs(initial[1]);
  return layout.page('diagnostics',_('Logs and deployment diagnostics'),_('Read-only local evidence.'),[
   feedback,info,
   layout.panel(_('Backend reachability'),_('Runs only when requested, against up to 8 saved form backends, with a 2.5-second limit each. It opens a TCP connection without sending credentials or HTTP requests.'),[probeResult],probeButton),
   layout.panel(_('Safe runtime and access events'),'',[
    E('div',{'class':'actions'},[E('label',{},[_('Level'),' ',level]),E('label',{},[_('Type'),' ',kind]),download]),records
   ]),
   layout.panel(_('Logs and deployment diagnostics'),'',[
    layout.note(_('Read-only local evidence. HTTP-01 needs public port 80 → internal HTTP (for example 10080); TLS-ALPN-01 needs public port 443 → internal HTTPS (for example 10443). DNS-01 needs provider access and TXT propagation. Local listeners and TCP probes cannot verify public DNS, NAT or firewall reachability.')),
    layout.note(_('Nonstandard internal ports also affect redirect and browser addresses. Use https://domain:10443 when accessing that port directly; Internet forwarding to port 443 needs the corresponding public URL and redirect plan. This application does not modify uhttpd, firewall, DNS or NAT.'))
   ])
  ],refresh);
 },handleSave:null,handleSaveApply:null,handleReset:null
});
