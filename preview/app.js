const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  activity:'M3 12h4l3-8 4 16 3-8h4', settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
  network:'M5 17h14M12 7v10M5 17v4M19 17v4M8 3h8v5H8z', layers:'m3 7 9-5 9 5-9 5zM3 12l9 5 9-5M3 17l9 5 9-5',
  grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18',
  shield:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 12l3 3 5-6', sliders:'M4 4v16M12 4v16M20 4v16M1 8h6M9 16h6M17 9h6',
  code:'m8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18', terminal:'m5 7 5 5-5 5M13 17h6M3 3h18v18H3z', search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6',
  plus:'M12 5v14M5 12h14', refresh:'M20 7a9 9 0 1 0 1 8M20 2v6h-6', check:'m5 12 4 4L19 6', info:'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  arrow:'M4 12h16m-6-6 6 6-6 6', close:'m6 6 12 12M6 18 18 6', copy:'M9 9h12v12H9zM15 9V3H3v12h6', file:'M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h8', lock:'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4', trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7', play:'m8 4 12 8-12 8z', stop:'M6 6h12v12H6z', download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
};
const icon = name => `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] || paths.globe}"/></svg>`;
$$('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
const initial = {
  running:true, dirty:false, mode:'form', custom:'',
  settings:{http:'10080', https:'10443', email:'', storage:'/etc/caddy/data', autostart:true, accessLog:true},
  tls:{method:'dns-01', credential:'cloudflare-home'},
  auth:{upstream:'http://172.17.0.6:9091',uri:'/api/authz/forward-auth'},
  sites:[
    {id:'jellyfin',name:'Jellyfin',domain:'jellyfin.home.wirerope.fun',upstreams:['http://172.17.0.2:8096'],enabled:true,method:'dns-01',auth:'none',color:'purple',path:'',strip:false,balance:'round_robin',extra:''},
    {id:'immich',name:'Immich',domain:'immich.home.wirerope.fun',upstreams:['http://172.17.0.12:8080'],enabled:true,method:'dns-01',auth:'none',color:'green',path:'',strip:false,balance:'round_robin',extra:''},
    {id:'vaultwarden',name:'Vaultwarden',domain:'vaultwarden.home.wirerope.fun',upstreams:['http://172.17.0.11:80'],enabled:true,method:'dns-01',auth:'none',color:'',path:'',strip:false,balance:'round_robin',extra:''},
    {id:'ariang',name:'AriaNg',domain:'ariang.home.wirerope.fun',upstreams:['http://172.17.0.5:6880'],enabled:true,method:'dns-01',auth:'authelia',color:'orange',path:'',strip:false,balance:'round_robin',extra:''},
    {id:'homeassistant',name:'Home Assistant',domain:'homeassistant.home.wirerope.fun',upstreams:['http://192.168.31.104:8123'],enabled:true,method:'dns-01',auth:'none',color:'',path:'',strip:false,balance:'round_robin',extra:''},
    {id:'transmission',name:'Transmission',domain:'transmission.home.wirerope.fun',upstreams:['http://192.168.31.111:9091'],enabled:false,method:'dns-01',auth:'authelia',color:'green',path:'',strip:false,balance:'round_robin',extra:''},
  ],
};
let state;
try { const saved = JSON.parse(localStorage.getItem('caddy-preview-v1')); state = saved?.sites && saved?.settings && saved?.tls ? saved : structuredClone(initial); }
catch { state = structuredClone(initial); }
state.auth = {...initial.auth, ...state.auth};
let unsaved = false;
let savedSnapshot = structuredClone(state);
state.draftRevision ??= state.dirty ? 1 : 0;
state.activeRevision ??= 0;
let page, query = '', filter = 'all', toastTimer, editingId, editorOpener;
const demoLogs = [
  ['10:42:08','INFO','演示：配置已加载，5 个站点已启用。'],
  ['10:42:08','INFO','演示：HTTPS 监听地址 :10443，HTTP 监听地址 :10080。'],
  ['10:42:08','INFO','演示：启用自动证书管理，验证方式 DNS-01。'],
  ['10:42:09','INFO','演示：Cloudflare DNS 模块已加载。'],
  ['10:42:09','INFO','演示：自动续期维护任务已启动。'],
];
const titles = {overview:['概览','查看服务状态、监听端口与配置概况。'],sites:['反向代理','将域名连接到你的家庭服务，HTTPS 由 Caddy 自动管理。'],tls:['TLS 证书','设置默认验证方式，站点也可以单独覆盖。'],settings:['全局设置','管理服务监听、持久化存储和启动行为。'],config:['配置文件','查看表单生成的 Caddyfile，或切换到手动管理。'],logs:['运行日志','查看配置应用、服务启动和证书签发记录。']};
function persist(){if(!unsaved)savedSnapshot=structuredClone(state);try{localStorage.setItem('caddy-preview-v1',JSON.stringify(savedSnapshot));}catch{toast('浏览器存储不可用，本次更改仅保留在当前页面。',true);} $('#nav-count').textContent=state.sites.length; $('#apply-bar').hidden=false; $('#save-draft').disabled=!unsaved; $('#apply').disabled=!unsaved&&!state.dirty; $('#draft-status').textContent=`草稿 v${state.draftRevision} · 生效 v${state.activeRevision}${state.dirty?' · 待应用':''}${unsaved?' · 尚未保存':''}`; document.body.classList.add('has-changes');}
function change(){unsaved=false;state.draftRevision++;state.dirty=true;persist();}
function toast(message,error=false){clearTimeout(toastTimer);const t=$('#toast');t.textContent=message;t.classList.toggle('error',error);t.hidden=false;toastTimer=setTimeout(()=>t.hidden=true,4200);}
function badge(text,type=''){return `<span class="pill ${type}">${esc(text)}</span>`;}
function heading(){return `<div class="breadcrumb">服务<span>/</span>Caddy<span>/</span><span>${titles[page][0]}</span></div><div class="heading"><div><div class="heading-title"><h1>${titles[page][0]}</h1>${page==='sites'?'<span class="version">Caddy 2.x</span>':''}</div><p>${titles[page][1]}</p></div><div class="heading-actions">${page==='sites'?`<a class="button secondary-action" href="#config">${icon('code')}配置预览</a><button class="button primary" data-action="add">${icon('plus')}添加站点</button>`:page==='logs'?`<button class="button" data-action="download-logs">${icon('download')}导出日志</button>`:''}</div></div>`;}
function statusStrip(){return `<section class="status-strip" aria-label="模拟服务状态"><div class="status-service"><span class="status-emblem">${icon(state.running?'check':'stop')}</span><div><strong>Caddy ${state.running?'运行中':'已停止'}</strong><small>演示状态 · ${state.running?'已运行 2 天 6 小时':'服务未运行'}</small></div></div><div class="status-metric"><small>启用站点</small><strong>${state.sites.filter(s=>s.enabled).length} <span class="muted" style="font-size:11px">/ ${state.sites.length}</span></strong></div><div class="status-metric"><small>HTTPS 端口</small><strong class="mono">:${esc(state.settings.https)}</strong></div><div class="status-metric memory"><small>内存使用（示例）</small><strong>28.4 <span class="muted" style="font-size:11px">MB</span></strong></div><div class="status-actions actions"><button class="button small" data-action="reload" ${!state.running?'disabled':''}>${icon('refresh')}模拟重载</button><button class="button small" data-action="restart">${icon('refresh')}模拟重启</button></div></section>`;}
function row(s){return `<tr><td><div class="site-cell"><span class="site-icon ${esc(s.color)}">${esc(s.name[0].toUpperCase())}</span><div><div class="site-name">${esc(s.name)}</div><div class="domain">${esc(s.domain)}</div></div></div></td><td class="backend-column"><span class="backend mono">${esc(s.upstreams[0])}</span>${s.upstreams.length>1?`<span class="subtext">共 ${s.upstreams.length} 个后端 · 负载均衡</span>`:'<span class="subtext">反向代理</span>'}</td><td class="method-column"><span class="method mono">${esc(s.method.toUpperCase())}</span></td><td class="auth-column">${s.auth==='authelia'?`<span class="tag-neutral">${icon('lock')} Authelia</span>`:s.auth==='basic'?'<span class="tag-neutral">Basic Auth</span>':'<span class="muted">—</span>'}</td><td class="toggle-column"><button class="switch" role="switch" aria-checked="${s.enabled}" aria-label="启用 ${esc(s.name)}" data-toggle="${esc(s.id)}"><span class="switch-track"></span>${s.enabled?'已启用':'已停用'}</button></td><td class="edit-column"><button class="button small ghost table-edit" data-edit="${esc(s.id)}">编辑</button></td></tr>`;}
function filteredSites(){return state.sites.filter(s=>(!query||`${s.name} ${s.domain} ${s.upstreams.join(' ')}`.toLowerCase().includes(query.toLowerCase()))&&(filter==='all'||s.enabled===(filter==='enabled')));}
function siteTable(){const sites=filteredSites();return sites.length?`<table><thead><tr><th>站点 / 域名</th><th>后端地址</th><th>证书验证</th><th class="auth-column">访问认证</th><th>状态</th><th>操作</th></tr></thead><tbody>${sites.map(row).join('')}</tbody></table>`:`<div class="empty"><strong>${state.sites.length?'没有找到匹配的站点':'还没有站点'}</strong>${state.sites.length?'试试其他域名、名称或后端地址。':'点击“添加站点”配置第一个反向代理。'}</div>`;}
function sitesPage(){return `${statusStrip()}${state.mode==='manual'?'<div class="info-note mode-note">'+icon('info')+'当前使用完整 Caddyfile 模式，站点表单已停用。切回表单模式后可继续编辑。</div>':''}<section class="panel"><div class="panel-top"><div><h2>站点列表</h2><p>每个站点独立配置域名、后端与证书验证方式</p></div><span class="tag-neutral">表单管理</span></div><div class="toolbar"><div class="search">${icon('search')}<input id="site-search" aria-label="搜索站点" placeholder="搜索站点、域名或后端…" value="${esc(query)}"></div><select id="site-filter" aria-label="筛选站点状态"><option value="all" ${filter==='all'?'selected':''}>全部状态</option><option value="enabled" ${filter==='enabled'?'selected':''}>已启用</option><option value="disabled" ${filter==='disabled'?'selected':''}>已停用</option></select><span class="count" id="site-count">共 ${state.sites.length} 个站点</span></div><div class="table-wrap" id="site-table">${siteTable()}</div><div class="table-bottom">${icon('shield')}证书由 Caddy 自动申请和续期 · WebSocket 自动支持</div></section><div class="info-note">${icon('info')}<span>默认通过 Cloudflare DNS-01 验证域名，无需开放公网 80 / 443。也可为站点选择 HTTP-01 或 TLS-ALPN-01。</span></div>`;}
function overviewPage(){return `${statusStrip()}<div class="overview-note"><strong>家庭服务的 HTTPS 入口</strong>站点配置、证书管理与访问认证集中在这里。此预览不会连接路由器或申请真实证书。</div><div class="two-column"><section class="panel"><div class="panel-top"><h2>服务信息</h2>${badge(state.running?'运行中':'已停止',state.running?'':'gray')}</div><div class="panel-body">${[['目标系统','OpenWrt 25.12.4 / APK'],['目标架构','aarch64_cortex-a53'],['内核来源','官方定制下载 · Cloudflare'],['内核版本','未连接设备（演示）'],['DNS 模块','dns.providers.cloudflare（示例）'],['HTTP / HTTPS',`${esc(state.settings.http)} / ${esc(state.settings.https)}`],['配置模式',state.mode==='form'?'表单生成':'完整 Caddyfile'],['证书存储',esc(state.settings.storage)]].map(([a,b])=>`<div class="detail-row"><span>${a}</span><span>${b}</span></div>`).join('')}<div class="detail-row"><span>开机启动（演示）</span><button class="switch" role="switch" aria-checked="${state.settings.autostart}" data-action="autostart"><span class="switch-track"></span>${state.settings.autostart?'已启用':'已停用'}</button></div><div class="actions" style="margin-top:20px"><button class="button" data-action="service">${icon(state.running?'stop':'play')}模拟${state.running?'停止':'启动'}</button><button class="button" data-action="restart">${icon('refresh')}模拟重启</button></div></div></section><section class="panel"><div class="panel-top"><h2>配置概况</h2><a class="button ghost small" href="#sites">管理站点 ${icon('arrow')}</a></div><div class="panel-body">${[['已启用站点',state.sites.filter(s=>s.enabled).length],['需要转发认证',state.sites.filter(s=>s.auth==='authelia').length],['默认验证方式',state.tls.method.toUpperCase()],['配置状态',state.dirty?'有未应用的更改':'已应用（模拟）']].map(([a,b])=>`<div class="detail-row"><span>${a}</span><strong>${b}</strong></div>`).join('')}<div class="connection">${icon('globe')}域名<span class="divider-arrow">→</span>${icon('shield')}Caddy<span class="divider-arrow">→</span>${icon('network')}家庭服务</div><div class="info-note">${icon('info')}证书签发结果和实际进程状态将在接入 OpenWrt 后显示。</div></div></section></div>`;}
const help = {
  'http-01':['通过公网 80 端口验证','域名的 A / AAAA 记录须指向当前入口，公网 80 端口必须能到达 Caddy。不需要 DNS 插件。'],
  'dns-01':['通过 DNS TXT 记录验证','Caddy 使用 Cloudflare API 创建验证记录，无需开放入站端口，也支持通配符域名。'],
  'tls-alpn-01':['通过公网 443 端口验证','公网 443 的 TLS 验证连接必须直接到达 Caddy，不能被其他 HTTPS 代理终止。不需要 DNS 插件。'],
};
function choices(selected,name='method'){return `<div class="choice-grid">${[['http-01','公网 80 端口'],['dns-01','Cloudflare DNS'],['tls-alpn-01','公网 443 端口']].map(([v,d])=>`<label class="choice"><div><input type="radio" name="${name}" value="${v}" ${v===selected?'checked':''}><strong class="mono">${v.toUpperCase()}</strong></div><small>${d}</small></label>`).join('')}</div>`;}
function challengeHelp(method){return `<strong>${help[method][0]}</strong>${help[method][1]}`;}
function certificateFixtures(){return `<section class="panel"><div class="panel-top"><div><h2>已存储证书 · 状态示例</h2><p>固定演示数据，未连接路由器；不依据上方配置推断签发成功</p></div></div><div class="panel-body"><div class="detail-row"><strong>*.example.test, other.test</strong><span>已存储且有效 · 续期某个签发机构报错，最终结果未知</span></div><div class="detail-row"><span>实际覆盖 / 关联站点</span><span>*.example.test, other.test / a.example.test, other.test</span></div><div class="detail-row"><span>签发机构（演示）</span><span>CN=Fixture CA</span></div><div class="detail-row"><span>有效期（UTC，7 天短周期示例）</span><span>2026-11-09 00:00 → 2026-11-16 00:00</span></div><div class="detail-row"><span>SHA256 指纹（演示）</span><code style="overflow-wrap:anywhere">74:B7:ED:E1:73:69:76:E1:14:18:3A:95:4F:8E:11:B0:53:88:02:D3:4E:7F:54:CC:1C:F6:AB:9C:7A:83:68:CF</code></div><div class="detail-row"><span>pending.example.test</span><span>签发尝试已开始，尚无证书证据</span></div><div class="detail-row"><span>unknown.example.test</span><span>证书 / 签发 / 续期均未知</span></div><p>通配符只覆盖一级子域；不覆盖 example.test 或 a.b.example.test。已存储证书不证明连接正在提供该证书。日志仅为有限窗口，历史存在缺口；续期失败不会删除仍有效的证书。</p></div></section>`;}
function notificationPreview(){return `<section class="panel"><div class="panel-top"><div><h2>证书告警与通知</h2><p>模拟状态 · 实际后台检查不依赖打开 LuCI，手动模式也可用</p></div>${badge('外部通知默认关闭')}</div><div class="form-section"><div class="info-note">${icon('info')}演示：near.example.test 临近到期且重复观察到 issuer 问题，最终尝试结果未知。expired.example.test 已过期。仅不同尝试计入观察，日志历史始终不完整。</div><p>阈值按实际有效期计算：90 天证书为 14 天；7 天证书为 28 小时；1 天证书为 4 小时。实际 PEM 过期可独立告警，有效替换证书才恢复。</p><form id="notification-form"><label class="inline-check"><input type="checkbox" name="enabled" ${state.notificationsEnabled?'checked':''}>启用 Webhook（仅模拟）</label><div class="field"><label for="webhook-url">私有 HTTP / HTTPS Webhook URL</label><input id="webhook-url" type="password" autocomplete="off" placeholder="预览不保存目标，请勿输入真实密钥"></div><div class="field"><label for="webhook-headers">私有请求头（JSON 对象）</label><textarea id="webhook-headers" autocomplete="off" placeholder='{"Authorization":"Bearer …"}'></textarea></div><p>正式版 URL、查询参数及请求头只写不读。不跟随重定向；有超时与持久化三次发送预算；同一事件 ID 跨重启保留，接收端可据此去重。</p><button type="submit" class="button">保存通知设置（模拟）</button></form></div></section>`;}
function tlsPage(){return `${certificateFixtures()}${notificationPreview()}<form id="tls-form" class="panel"><div class="panel-top"><div><h2>默认验证方式</h2><p>作为新建站点的默认值，不修改已有站点</p></div>${badge('自动续期')}</div><div class="form-section"><div class="form-width">${choices(state.tls.method)}<div class="challenge-help" id="default-challenge-help">${challengeHelp(state.tls.method)}</div><div class="dns-options" id="default-dns-options" ><div class="field"><label for="credential-name">DNS 凭据名称</label><input id="credential-name" name="credential" value="${esc(state.tls.credential)}" required><small>首版使用一组公共 Cloudflare 凭据，所有 DNS-01 站点共用。</small></div><div class="field"><label for="cf-token">Cloudflare API Token</label><input id="cf-token" type="password" autocomplete="off" placeholder="预览中不保存 Token，请勿填写真实密钥"><small>正式版本使用独立私有凭据版本，成功应用后热加载，无需重启。配置预览与导出不会包含 Token。仅授权所需 Zone 的 DNS 编辑及 Zone 读取权限；此预览不保存 Token。</small></div></div></div></div><div class="form-actions"><button class="button primary" type="submit">保存默认设置</button></div></form><section class="panel"><div class="panel-top"><div><h2>站点验证方式</h2><p>此处展示配置，不代表证书已签发</p></div></div><div class="tls-list">${state.sites.map(s=>`<div class="detail-row"><div><strong>${esc(s.domain)}</strong><small>${esc(s.name)}</small></div><span class="method mono">${esc(s.method.toUpperCase())}</span></div>`).join('')}</div><div class="readonly-note">Caddy 按站点填写的域名申请证书。通配符域名必须使用 DNS-01。</div></section>`;}
function settingsPage(){const s=state.settings;return `<form id="settings-form" class="panel"><div class="panel-top"><div><h2>服务设置</h2><p>由 procd 管理进程与开机启动</p></div></div><div class="form-section"><div class="form-width"><div class="field"><label class="inline-check"><input name="autostart" type="checkbox" ${s.autostart?'checked':''}>开机自动启动 Caddy</label></div><h3>监听端口</h3><div class="field-row"><div class="field"><label for="http-port">HTTP 端口</label><input id="http-port" name="http" type="number" min="1" max="65535" required value="${esc(s.http)}"></div><div class="field"><label for="https-port">HTTPS 端口</label><input id="https-port" name="https" type="number" min="1" max="65535" required value="${esc(s.https)}"></div></div><div class="info-note">${icon('info')}当前示例使用 10080 / 10443，避开常见的 LuCI 管理端口。公网验证仍使用标准的 80 / 443 端口。</div></div></div><div class="form-section"><div class="form-width"><h3>证书与存储</h3><div class="field"><label for="acme-email">ACME 联系邮箱</label><input id="acme-email" name="email" type="email" placeholder="可选，用于证书账户联系" value="${esc(s.email)}"></div><div class="field"><label for="data-path">持久化数据目录</label><input id="data-path" name="storage" required pattern="/.*" value="${esc(s.storage)}"><small>保存 ACME 账户、证书及私钥。请使用升级和重启后仍可保留的目录。</small></div><label class="inline-check"><input name="accessLog" type="checkbox" ${s.accessLog?'checked':''}>启用访问日志</label></div></div>${authSettings()}<div class="form-actions"><button class="button primary" type="submit">保存设置</button></div></form>`;}
function authSettings(){return `<div class="form-section"><div class="form-width"><h3>Authelia 转发认证</h3><div class="field"><label for="auth-upstream">Authelia 服务地址</label><input id="auth-upstream" name="authUpstream" value="${esc(state.auth.upstream)}" required placeholder="http://192.168.31.101:9091"><small>填写 OpenWrt 能访问的 Authelia 后端地址，不是登录门户域名。Docker 内网 IP 可能无法从路由器访问。</small></div><div class="field"><label for="auth-uri">认证接口路径</label><input id="auth-uri" name="authUri" value="${esc(state.auth.uri)}" required placeholder="/api/authz/forward-auth"><small>站点选择 Authelia 时使用此接口，验证成功后转发用户身份头。</small></div><div class="info-note">${icon('info')}<span>Authelia 的用户、会话和访问策略在 Authelia 自己的配置中管理。登录门户站点应选择“不附加认证”，避免登录循环。</span></div><small class="hint">门户示例：https://authelia.home.wirerope.fun:10443。请在 Authelia 的 session.cookies 中设置对应的 domain 与 authelia_url。</small></div></div>`;}
function validateAuth(auth){
  try {
    const url=new URL(auth.upstream);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error();
  } catch { return 'Authelia 地址必须是不含路径、查询参数或凭据的 HTTP / HTTPS 地址。'; }
  if(!auth.uri.startsWith('/')||/[\s"{}#]/.test(auth.uri))return 'Authelia 接口路径必须以 / 开头，且不能包含空白、引号、大括号或 #。';
  return '';
}
const quote = v => JSON.stringify(String(v));
function generate(){
  const g=state.settings;
  let text=`# 由 luci-app-caddy 表单生成（预览）\n{\n\thttp_port ${g.http}\n\thttps_port ${g.https}\n\tstorage file_system {\n\t\troot ${quote(g.storage)}\n\t}\n${g.email?`\temail ${quote(g.email)}\n`:''}}\n\n`;
  for(const s of state.sites.filter(x=>x.enabled)){
    text+=`${s.domain}:${g.https} {\n`;
    if(s.method==='dns-01')text+='\ttls {\n\t\tdns cloudflare [REDACTED_PRIVATE_CREDENTIAL]\n\t}\n';
    else text+=`\ttls {\n\t\tissuer acme {\n\t\t\tdisable_${s.method==='http-01'?'tlsalpn':'http'}_challenge\n\t\t}\n\t}\n`;
    if(g.accessLog)text+='\tlog\n';
    const indent=s.path?'\t\t':'\t';
    if(s.path)text+=`\t${s.strip?'handle_path':'handle'} ${quote(s.path)} {\n`;
    if(s.auth==='authelia')text+=`${indent}request_header -Remote-User\n${indent}request_header -Remote-Groups\n${indent}request_header -Remote-Name\n${indent}request_header -Remote-Email\n${indent}forward_auth ${quote(state.auth.upstream)} {\n${indent}\turi ${quote(state.auth.uri)}\n${indent}\tcopy_headers Remote-User Remote-Groups Remote-Name Remote-Email\n${indent}}\n`;
    if(s.auth==='basic')text+=`${indent}basic_auth {\n${indent}\t${quote(s.basicUser)} ${quote(s.basicHash)}\n${indent}}\n`;
    text+=`${indent}reverse_proxy ${s.upstreams.map(quote).join(' ')} {\n`;
    if(s.upstreams.length>1)text+=`${indent}\tlb_policy ${s.balance}\n`;
    text+=`${indent}}\n`;
    if(s.path)text+='\t}\n\thandle {\n\t\trespond 404\n\t}\n';
    if(s.extra)text+=s.extra.split('\n').map(l=>'\t'+l).join('\n')+'\n';
    text+='}\n\n';
  }
  return text.trimEnd()+'\n';
}
function configPage(){return `<div class="config-head"><div class="segmented" aria-label="配置模式"><button data-mode="form" class="${state.mode==='form'?'selected':''}" aria-pressed="${state.mode==='form'}">表单生成</button><button data-mode="manual" class="${state.mode==='manual'?'selected':''}" aria-pressed="${state.mode==='manual'}">完整 Caddyfile</button></div><div class="actions"><button class="button" data-action="copy">${icon('copy')}复制配置</button><button class="button" data-action="download-config">${icon('download')}下载</button></div></div><div class="info-note mode-note">${icon('info')}<span>${state.mode==='form'?'当前配置由表单生成。高级指令可在站点编辑器中补充；切换为完整 Caddyfile 模式后，站点表单将停用。':'当前为手动管理模式，表单数据保留但不参与生成。切回表单模式会使用保留的表单配置，手动内容仍会保存。'}</span></div><section class="panel"><div class="panel-top"><h2 class="mono">/etc/caddy/Caddyfile</h2><span class="tag-neutral">${state.mode==='form'?'只读预览':'手动编辑'}</span></div>${state.mode==='form'?`<pre class="code-panel" tabindex="0" aria-label="生成的 Caddyfile">${esc(generate())}</pre>`:`<textarea id="manual-config" class="code-input mono" spellcheck="false" aria-label="完整 Caddyfile">${esc(state.custom)}</textarea>`}<div class="readonly-note">预览仅生成文本；真实的 caddy validate 与热重载将在 OpenWrt 服务端接入。</div></section>`;}
function logsPage(){return `<section class="panel"><div class="panel-top"><div><h2>服务日志</h2><p>演示事件记录，不连接真实 Caddy 进程</p></div><span class="tag-neutral">${demoLogs.length} 条记录</span></div><div>${demoLogs.map(([t,l,m])=>`<div class="log-line"><time class="mono">${esc(t)}</time><span class="log-level ${l==='WARN'?'warn':''} mono">${l}</span><p class="mono">${esc(m)}</p></div>`).join('')}</div></section>`;}
function render(){page=location.hash.slice(1);if(!titles[page])page='sites';$$('[data-page]').forEach(a=>{a.classList.toggle('active',a.dataset.page===page);if(a.dataset.page===page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});$('#main').innerHTML=heading()+({sites:sitesPage,overview:overviewPage,tls:tlsPage,settings:settingsPage,config:configPage,logs:logsPage}[page])();document.title=`${titles[page][0]} · Caddy · OpenWrt`;bindPage();persist();}
function bindPage(){
  if(state.mode==='manual'){
    $$('#main #tls-form input,#main #tls-form button,#main [data-edit],#main [data-toggle],#main [data-action=add]').forEach(el=>el.disabled=true);
    $$('#settings-form input:not([name=autostart]),#settings-form select,#settings-form textarea').forEach(el=>el.disabled=true);
  }
  if(page==='sites'){
    $('#site-search').addEventListener('input',e=>{query=e.target.value;$('#site-table').innerHTML=siteTable();});
    $('#site-filter').addEventListener('change',e=>{filter=e.target.value;$('#site-table').innerHTML=siteTable();});
  }
  if(page==='tls'){
    $('#notification-form').addEventListener('submit',e=>{e.preventDefault();state.notificationsEnabled=new FormData(e.target).has('enabled');$('#webhook-url').value='';$('#webhook-headers').value='';persist();toast('模拟通知设置已保存；未发送任何请求，未保存目标或请求头。');});
    $$('[name=method]').forEach(input=>input.addEventListener('change',()=>{$('#default-challenge-help').innerHTML=challengeHelp(input.value);}));
    $('#tls-form').addEventListener('submit',e=>{e.preventDefault();const data=new FormData(e.target);state.tls={method:data.get('method'),credential:data.get('credential').trim()};change();render();toast('默认验证方式已保存（演示），已有站点保持原设置。');});
  }
  if(page==='settings')$('#settings-form').addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.target);if(state.mode==='manual'){state.settings.autostart=d.has('autostart');persist();toast('开机启动已保存（模拟）；内容表单保持只读。');return;}if(d.get('http')===d.get('https'))return toast('HTTP 与 HTTPS 端口不能相同。',true);const auth={upstream:d.get('authUpstream').trim(),uri:d.get('authUri').trim()};const authError=validateAuth(auth);if(authError)return toast(authError,true);state.auth=auth;state.settings={http:d.get('http'),https:d.get('https'),email:d.get('email').trim(),storage:d.get('storage').trim(),autostart:d.has('autostart'),accessLog:d.has('accessLog')};change();toast('全局设置已保存到浏览器。');});
}
function openEditor(id){
  if(state.mode==='manual')return toast('当前为完整 Caddyfile 模式，请先切回表单模式。',true);
  editorOpener=document.activeElement;
  editingId=id;
  const s=state.sites.find(x=>x.id===id)||{name:'',domain:'',upstreams:['http://'],enabled:true,method:state.tls.method,auth:'none',path:'',strip:false,balance:'round_robin',extra:''};
  $('#editor').innerHTML=`<div class="editor-header"><div><h2 id="editor-title">${id?'编辑站点':'添加站点'}</h2><p>${id?esc(s.domain):'为家庭服务设置域名与 HTTPS 入口'}</p></div><button class="icon-button" type="button" data-action="close-editor" aria-label="关闭编辑器">${icon('close')}</button></div><form id="site-form"><div class="editor-scroll"><section class="editor-section"><h3>${icon('globe')}基本信息</h3><div class="field-row"><div class="field"><label for="site-name">站点名称</label><input id="site-name" name="name" value="${esc(s.name)}" placeholder="例如 Jellyfin" required maxlength="60"></div><div class="field"><label class="inline-check" style="padding-top:25px"><input name="enabled" type="checkbox" ${s.enabled?'checked':''}>启用这个站点</label></div></div><div class="field"><label for="site-domain">域名</label><input id="site-domain" name="domain" value="${esc(s.domain)}" placeholder="jellyfin.home.wirerope.fun" required spellcheck="false"><small>不含协议、端口和路径。按此域名自动申请证书；填写通配符时须使用 DNS-01。</small></div></section><section class="editor-section"><h3>${icon('network')}后端服务</h3><label class="field-label" for="upstream-0">后端地址</label><div id="upstreams">${s.upstreams.map((u,i)=>upstreamRow(u,i)).join('')}</div><button class="button small ghost" id="add-upstream" type="button">${icon('plus')}添加后端</button><small class="hint">支持同组 HTTP 或 HTTPS，须显式端口；HTTPS 保持证书验证。WebSocket 自动升级。</small><div class="field" style="margin-top:17px;margin-bottom:0"><label for="balance">多后端负载均衡</label><select id="balance" name="balance"><option value="round_robin" ${s.balance==='round_robin'?'selected':''}>轮询 · Round robin</option><option value="least_conn" ${s.balance==='least_conn'?'selected':''}>最少连接 · Least connections</option><option value="random" ${s.balance==='random'?'selected':''}>随机 · Random</option></select></div></section><section class="editor-section"><h3>${icon('shield')}证书验证</h3>${choices(s.method)}<div class="challenge-help" id="site-challenge-help">${challengeHelp(s.method)}</div><div id="site-dns-options" class="dns-options" ${s.method!=='dns-01'?'hidden':''}><label class="field-label" for="site-credential">Cloudflare 凭据</label><select id="site-credential"><option>${esc(state.tls.credential)}</option></select><small class="hint">使用“TLS 证书”中的公共 DNS 凭据，站点配置不包含 Token。</small></div></section><section class="editor-section"><h3>${icon('lock')}访问认证</h3><div class="field" style="margin-bottom:0"><label for="site-auth">认证方式</label><select id="site-auth" name="auth"><option value="none" ${s.auth==='none'?'selected':''}>不附加认证 · 使用应用自身登录</option><option value="authelia" ${s.auth==='authelia'?'selected':''}>Authelia · 转发认证</option><option value="basic" ${s.auth==='basic'?'selected':''}>Basic Auth · 用户名与密码</option></select><small class="hint" id="auth-help">${s.auth==='authelia'?`认证端点：${esc(state.auth.upstream)}${esc(state.auth.uri)}。可在全局设置修改。`:'在应用自身认证之外，可添加一层入口认证。'}</small></div><div id="basic-options" ${s.auth!=='basic'?'hidden':''} style="margin-top:15px"><div class="field-row"><div class="field"><label for="basic-user">用户名</label><input id="basic-user" name="basicUser" value="${esc(s.basicUser||'')}" autocomplete="off"></div><div class="field"><label for="basic-hash">密码哈希</label><input id="basic-hash" name="basicHash" value="${esc(s.basicHash||'')}" placeholder="$2a$…" autocomplete="off"></div></div><small class="hint">运行 caddy hash-password --algorithm bcrypt，按提示输入密码，将输出的哈希粘贴到这里。浏览器访问时会弹出用户名和密码输入框。</small></div></section><details ${s.path||s.extra?'open':''}><summary>高级设置：路径匹配与自定义指令</summary><div><div class="field"><label for="site-path">路径匹配</label><input id="site-path" name="path" value="${esc(s.path)}" placeholder="例如 /media/*，留空匹配全部路径"><label class="inline-check" style="margin-top:7px"><input name="strip" type="checkbox" ${s.strip?'checked':''}>转发时移除路径前缀（须以 /* 结尾）</label><small>/media/* 匹配 /media/ 及子路径，不匹配 /media 或 /mediaX；其他路径返回 404。</small></div><div class="field"><label for="site-extra">站点内 Caddyfile 片段</label><textarea id="site-extra" name="extra" class="mono" placeholder="header X-Content-Type-Options nosniff" spellcheck="false">${esc(s.extra)}</textarea><small>会插入此站点块中，真实部署前须通过 Caddy 语法校验。</small></div></div></details><div id="site-errors" class="validation" role="alert"></div></div><div class="editor-footer">${id?`<button class="button danger" type="button" data-delete="${esc(id)}">${icon('trash')}删除</button>`:''}<div class="actions"><button class="button" type="button" data-action="close-editor">取消</button><button class="button primary" type="submit">保存站点</button></div></div></form>`;
  $('#editor').showModal();
  $('#site-name').focus();
  $$('[name=method]',$('#editor')).forEach(input=>input.addEventListener('change',()=>{$('#site-challenge-help').innerHTML=challengeHelp(input.value);$('#site-dns-options').hidden=input.value!=='dns-01';}));
  $('#site-auth').addEventListener('change',e=>{$('#basic-options').hidden=e.target.value!=='basic';$('#auth-help').textContent=e.target.value==='authelia'?`认证端点：${state.auth.upstream}${state.auth.uri}。可在全局设置修改。`:'在应用自身认证之外，可添加一层入口认证。';});
  $('#add-upstream').addEventListener('click',()=>{const next=Date.now();$('#upstreams').insertAdjacentHTML('beforeend',upstreamRow('http://',next));$('#upstreams').lastElementChild.querySelector('input').focus();});
  $('#site-form').addEventListener('submit',saveSite);
}
function upstreamRow(value,id){return `<div class="upstream-row"><input id="upstream-${id}" name="upstream" aria-label="后端地址" value="${esc(value)}" placeholder="http://192.168.31.101:8096" required spellcheck="false"><button class="icon-button" type="button" data-remove-upstream aria-label="移除此后端">${icon('close')}</button></div>`;}
function validDomain(domain){return domain.length<=253&&/^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(domain);}
function validateSite(s){
  const errors=[];
  if(!s.name)errors.push('请填写站点名称。');
  if(!validDomain(s.domain))errors.push('请填写有效域名，不含协议、端口或路径。');
  if(state.sites.some(x=>x.id!==editingId&&x.domain===s.domain))errors.push('此域名已有站点，请编辑现有站点。');
  if(s.domain.startsWith('*.')&&s.method!=='dns-01')errors.push('通配符域名只能使用 DNS-01 验证。');
  let scheme;
  for(const value of s.upstreams){try{const u=new URL(value);if(!/^https?:\/\/(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?|\[[a-fA-F0-9:]+\]):[0-9]{1,5}$/.test(value)||+value.split(':').pop()<1||+value.split(':').pop()>65535||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();if(scheme&&scheme!==u.protocol)errors.push('同一后端组不能混用 HTTP 和 HTTPS。');scheme=u.protocol;}catch{errors.push(`后端地址无效：${value}。请使用不含路径和凭据的 HTTP / HTTPS 地址。`);}}
  if(!s.upstreams.length)errors.push('至少保留一个后端。');
  if(s.path&&(!/^\/(?:[a-zA-Z0-9_~.-]+\/)*(?:[a-zA-Z0-9_~.-]+|\*)?$/.test(s.path)||s.path.split('/').some(x=>x==='.'||x==='..')))errors.push('路径须为精确路径或以 /* 结尾，不含编码、查询或父目录。');
  if(s.strip&&(!s.path||!s.path.endsWith('/*')))errors.push('移除路径前缀时，路径匹配必须以 /* 结尾。');
  if(s.auth==='basic'&&(!s.basicUser||!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(s.basicHash)))errors.push('Basic Auth 需要用户名和有效的 bcrypt 密码哈希。');
  return [...new Set(errors)];
}
function saveSite(e){e.preventDefault();const d=new FormData(e.target);const site={id:editingId||crypto.randomUUID(),name:d.get('name').trim(),domain:d.get('domain').trim().toLowerCase(),upstreams:d.getAll('upstream').map(x=>x.trim()),enabled:d.has('enabled'),method:d.get('method'),auth:d.get('auth'),basicUser:d.get('basicUser').trim(),basicHash:d.get('basicHash').trim(),path:d.get('path').trim(),strip:d.has('strip'),balance:d.get('balance'),extra:d.get('extra').trim(),color:state.sites.find(x=>x.id===editingId)?.color||'green'};const errors=validateSite(site);if(errors.length){$('#site-errors').textContent=errors.join('\n');$('#site-errors').scrollIntoView({block:'nearest'});return;}if(editingId)state.sites=state.sites.map(x=>x.id===editingId?site:x);else state.sites.push(site);change();closeEditor();render();toast('站点已保存到浏览器，尚未应用。');}
function closeEditor(){$('#editor').close();editorOpener?.focus();}
function ask(title,message,callback){const d=$('#confirm');d.innerHTML=`<h2 id="confirm-title">${esc(title)}</h2><p>${esc(message)}</p><div class="actions"><button class="button" id="confirm-cancel">取消</button><button class="button danger" id="confirm-yes">确认${esc(title)}</button></div>`;d.showModal();$('#confirm-cancel').onclick=()=>d.close();$('#confirm-yes').onclick=()=>{d.close();callback();};}
function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function currentConfig(){return state.mode==='manual'?($('#manual-config')?.value??state.custom):generate();}
function saveManual(){state.custom=$('#manual-config').value;change();toast('手动配置已保存到浏览器。');}
document.addEventListener('click',async e=>{
  const edit=e.target.closest('[data-edit]');if(edit){openEditor(edit.dataset.edit);return;}
  const toggle=e.target.closest('[data-toggle]');if(toggle){if(state.mode==='manual')return toast('完整 Caddyfile 模式下不能操作站点表单。',true);const s=state.sites.find(x=>x.id===toggle.dataset.toggle);s.enabled=!s.enabled;change();render();return;}
  const remove=e.target.closest('[data-remove-upstream]');if(remove){if($$('.upstream-row').length===1)return toast('至少保留一个后端。',true);remove.closest('.upstream-row').remove();return;}
  const del=e.target.closest('[data-delete]');if(del){const s=state.sites.find(x=>x.id===del.dataset.delete);ask('删除站点',`将从演示配置中移除 ${s.domain}。应用前不会修改运行配置。`,()=>{state.sites=state.sites.filter(x=>x.id!==s.id);change();closeEditor();render();toast('站点已删除（演示）。');});return;}
  const mode=e.target.closest('[data-mode]');if(mode&&mode.dataset.mode!==state.mode){ask('切换配置模式',mode.dataset.mode==='manual'?'切换后使用完整 Caddyfile，站点表单停用；已有表单数据会保留。':'切换后使用表单生成的配置；手动 Caddyfile 会保留。',()=>{if(state.mode==='manual')state.custom=$('#manual-config').value;state.mode=mode.dataset.mode;unsaved=true;render();});return;}
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(action==='add')openEditor();
  if(action==='close-editor')closeEditor();
  if(action==='autostart'){state.settings.autostart=!state.settings.autostart;persist();render();toast('开机启动已'+(state.settings.autostart?'启用':'停用')+'（模拟）。');}
  if(action==='service'){state.running=!state.running;persist();demoLogs.push([new Date().toLocaleTimeString('zh-CN'),'INFO',`演示：服务已${state.running?'启动':'停止'}。`]);render();toast(`服务已${state.running?'启动':'停止'}（模拟）。`);}
  if(action==='reload'){
    if(!state.running)return toast('服务已停止，请先启动。',true);
    const button=e.target.closest('[data-action]');button.disabled=true;button.textContent='正在模拟重载…';
    await new Promise(resolve=>setTimeout(resolve,500));
    demoLogs.push([new Date().toLocaleTimeString('zh-CN'),'INFO','演示：最近生效配置重载完成，待应用草稿保留，未重启进程；未执行真实 caddy reload。']);
    render();toast('配置已重载（模拟），进程未重启。');
  }
  if(action==='restart'){state.running=true;persist();demoLogs.push([new Date().toLocaleTimeString('zh-CN'),'INFO','演示：服务重启完成。']);render();toast('服务已重启（模拟），未操作真实路由器。');}
  if(action==='save-manual')saveManual();
  if(action==='copy'){try{await navigator.clipboard.writeText(currentConfig());toast('配置已复制。');}catch{toast('剪贴板不可用，请使用“下载”保存配置。',true);}}
  if(action==='download-config')download('Caddyfile',currentConfig());
  if(action==='download-logs')download('caddy-preview.log',demoLogs.map(x=>x.join(' ')).join('\n'));
});
function saveVisibleDraft(){if(!unsaved)return true; const form=$('#main form');if(form){if(!form.reportValidity())return false;form.requestSubmit();return !unsaved;}if($('#manual-config')){saveManual();return true;}change();return true;}
$('#save-draft').addEventListener('click',saveVisibleDraft);
$('#main').addEventListener('input',e=>{if(e.target.id==='site-search')return;unsaved=true;persist();});
window.addEventListener('beforeunload',e=>{if(unsaved){e.preventDefault();e.returnValue='';}});
$('#apply').addEventListener('click',async()=>{if(!saveVisibleDraft())return;if(state.mode==='manual'&&$('#manual-config')){if($('#manual-config').value!==state.custom)state.custom=$('#manual-config').value;}if(state.mode==='manual'&&!state.custom.trim())return toast('完整 Caddyfile 不能为空。',true);const b=$('#apply');b.disabled=true;b.textContent='正在模拟应用…';await new Promise(resolve=>setTimeout(resolve,650));state.activeRevision=state.draftRevision;state.dirty=false;persist();demoLogs.push([new Date().toLocaleTimeString('zh-CN'),'INFO','演示：配置应用流程完成。未执行真实 Caddy 校验或重载。']);b.textContent='保存并模拟应用';persist();toast('模拟应用完成；未执行真实 Caddy 校验或重载。');if(page==='overview'||page==='logs')render();});
$('#mobile-menu').addEventListener('click',()=>{const expanded=$('#top-navigation').classList.toggle('expanded');$('#mobile-menu').setAttribute('aria-expanded',expanded);});
function closeNavigation(){ $('#top-navigation').classList.remove('expanded'); $('#mobile-menu').setAttribute('aria-expanded','false'); $('#services-menu').open=false; }
$('#services-menu a').addEventListener('click',closeNavigation);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeNavigation();});
window.addEventListener('hashchange',()=>{
  if(unsaved){
    const destination=location.hash;
    history.replaceState(null,'','#'+page);
    const dialog=$('#confirm');
    dialog.innerHTML='<h2>尚未保存的编辑</h2><p>保存草稿后离开，或放弃本次编辑。不会应用配置。</p><div class="actions"><button class="button" id="leave-cancel">取消</button><button class="button" id="leave-discard">放弃并离开</button><button class="button primary" id="leave-save">保存并离开</button></div>';
    dialog.showModal();
    $('#leave-cancel').onclick=()=>dialog.close();
    $('#leave-discard').onclick=()=>{state=structuredClone(savedSnapshot);unsaved=false;dialog.close();location.hash=destination;};
    $('#leave-save').onclick=()=>{if(saveVisibleDraft()){dialog.close();location.hash=destination;}};
    return;
  }
  closeNavigation();render();
});
$('#editor').addEventListener('cancel',()=>{setTimeout(()=>editorOpener?.focus(),0);});
render();
