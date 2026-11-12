# luci-app-caddy

官方 OpenWrt 的原生 LuCI Caddy 管理界面，入口为「服务 → Caddy」。目标平台为 **OpenWrt 25.12.4 r32933-4ccb782af7 / mediatek/filogic / aarch64_cortex-a53 / APK**。CPU 架构相同不代表其他固件兼容。

包含 `caddy-binary` 和 `luci-app-caddy` 两个包。构建时直接下载官方 latest Caddy + Cloudflare 模块，不编译 Caddy，不预先锁定内核版本或下载哈希；记录实际版本、模块和 SHA256。SDK 校验和及 feed 修订固定，详见 [构建说明](scripts/README.md)。

## 功能

- 概览、反向代理、中间件、TLS 证书、全局设置、配置文件、日志与诊断；继承 LuCI 主题，附带简体中文。
- 多站点、多后端、路径边界、HTTP 跳转、可编辑后端、站点启停和高级片段。
- HTTP-01、TLS-ALPN-01、Cloudflare DNS-01；共享泛域名证书，未覆盖的域名单独申请。
- Basic Auth 和 Authelia：站点选择全局默认或自己的配置。
- 全局中间件与站点中间件分为两个独立列表，站点支持多个有序引用。
- 表单 / Caddyfile 配置来源、校验后热加载、失败保留旧生效配置。
- 真实存储证书、后台到期检查、受控 Webhook、运行 / 访问日志、全部后端连通性检测。

[Web 预览](preview/README.md) 使用模拟状态，不能代替原生 LuCI 验收。完整字段见 [SCHEMA.md](packages/luci-app-caddy/root/usr/share/caddy-manager/SCHEMA.md)，测试边界见 [测试说明](tests/README.md)。

## 安装与升级

使用发布附件中的两个 APK、`manifest.json` 和 `SHA256SUMS`。先核对发布来源和目标平台，再验证完整附件：

```sh
sha256sum --check SHA256SUMS
```

在路由器检查 `ubus call system board`、`apk --print-arch` 和已安装包，确认没有官方 `caddy` 冲突包。首次缺依赖时只从匹配固件的可信包源补齐，不忽略依赖、不升级系统。

备份 `/etc/config/caddy` 和整个 `/etc/caddy`；自定义存储在目录外时另行备份。备份包含 Token、认证哈希和证书私钥，应私有保存。以下备份路径必须尚不存在：

```sh
umask 077
tar -C / -czf /tmp/caddy-before-upgrade.tar.gz etc/caddy etc/config/caddy
apk add --simulate --allow-untrusted --no-network /tmp/caddy-install/caddy-binary-*.apk /tmp/caddy-install/luci-app-caddy-*.apk
apk add --allow-untrusted --no-network /tmp/caddy-install/caddy-binary-*.apk /tmp/caddy-install/luci-app-caddy-*.apk
```

模拟结果应只涉及这两个包；缺依赖或出现额外变更时先检查。每次安装目录只放一套版本。APK 使用临时 SDK 签名，`--allow-untrusted` 只适用于已审查来源并核验过的这些附件。

`luci-app-caddy` 安装脚本会安装、启用并启动 `caddy-monitor`，由 procd 管理后台 ucode 检查进程；Webhook 默认关闭。首次安装不自动启动或启用 Caddy 主服务，在全局设置选择「运行 Caddy」「开机启动」后应用服务设置。管理 API 只监听 `127.0.0.1:2019`。

升级 `caddy-binary` 会在替换前停服，仅当升级前正在运行时才恢复，存在短暂中断；原开机启动状态保留。只升级 LuCI 包不重启 Caddy 主进程。升级后刷新 LuCI，检查 `ubus call luci.caddy status`、已安装包版本和实际请求。

当前仅支持 schema3 单文件 UCI 配置及 version2 请求模型，不读取或迁移旧双文件、旧 JSON 草稿或旧凭据目录。旧格式会被拒绝且原文件不改写。

## 保存、生效与回退

唯一可编辑配置为 `/etc/config/caddy`，权限 0600，直接保存站点、Token、Basic 用户及 bcrypt 哈希、通知和 Caddyfile。没有 `caddy_secrets`；原生 UCI 变更详情可能显示这些直接值，RPC 不回显 Token / 哈希。

「保存」暂存到当前登录会话的 UCI 变更，右上角显示 LuCI 原生变更提示，可应用或取消。「保存并应用」只处理 Caddy：校验并加载成功后才提交；失败保留旧生效配置。启动及重载读取最近成功应用的配置。运行及开机启动使用全局设置中的「应用服务设置」，与配置保存分开。

`/etc/caddy/active.json`、`active-state.json` 和事务数据用于运行及恢复；`data/` 包含证书和 ACME 账户。`uci-committed/` 隔离读取已提交配置，不是另一份需编辑的配置。

表单与 Caddyfile 分别保留，切换并应用才改变生效来源。Caddyfile 模式下表单站点、端口、认证和证书配置只读；运行控制与通知仍可用。手动源不支持 import 或环境变量展开。

应用失败先修正变更或重载旧配置。整包回退应在维护窗口停服，保留当前数据，模拟安装此前两个 APK，并恢复与旧版本配套的数据快照；不卸载清空数据。检查权限、证书有效期及原运行状态后恢复并验证请求。快照之后的配置和证书变化不会保留。

## 端口与证书

默认 HTTP 18080、HTTPS 18443；直接访问为 `https://域名:18443`。插件不修改 uhttpd、DNS、NAT 或防火墙。

- HTTP-01：公网 80 必须连通 HTTP 监听，域名 A / AAAA 指向可达入口。
- TLS-ALPN-01：公网 443 必须连通 HTTPS 监听，中间 TLS 终止代理可能阻断挑战。
- DNS-01：需要可用的 Cloudflare Token、API 和 DNS TXT 传播。Token 只授予所需区域的 Zone DNS Edit 和 Zone Read。泛域名必须使用此方式。

站点可使用全局默认方式或指定自己的方式。「TLS 证书 → 泛域名证书」填写如 `*.example.com`，匹配的一级子域名共用证书，路由仍使用具体域名；不覆盖 `example.com` 或 `a.b.example.com`。共享泛域名优先于匹配站点的申请方式，未覆盖域名继续使用自己的申请方式。清空设置不会主动删除已有证书。

证书页显示实际 PEM 清单，但存储证书不等于当前连接提供的证书。需从目标客户端验证链、SAN、有效期及实际握手；本机监听、应用成功和 TCP 探测均不证明公网可达或签发成功。

## 认证与中间件

每个站点选择不附加认证、Basic Auth 或 Authelia，再选择全局默认或自己的配置。Basic 密码在路由器生成 bcrypt，不回显；同名账号留空密码可保留原值。

Authelia 需要可达后端、授权接口（推荐 `/api/authz/forward-auth`）和登录门户。门户本身不要附加认证，避免循环；用户、MFA、访问策略与 Cookie 域名由 Authelia 管理。接口不可达时拒绝请求。历史 `/api/verify` 片段按实际 Authelia 版本使用，`?auth=basic` 是 Authelia 的认证请求模式，不是 Caddy 本地 Basic 用户库。

执行顺序为全局中间件、站点认证、站点中间件、站点补充片段及默认代理。全局中间件也作用于 HTTP 跳转和 HTTPS 认证失败响应；站点可以关闭全局继承。两个列表互不引用、不跨列表去重，站点定义仍被引用时不可删除。

```uci
config global_middleware '_global_security_headers'
 option snippet 'header X-Content-Type-Options nosniff'

config middleware 'compression'
 option snippet 'encode gzip'

config site 'media'
 option domain 'media.example.com'
 list upstream 'http://192.168.1.10:8080'
 list middleware 'compression'
```

站点段标识默认取域名第一段，没有额外 `option name`。全局段使用 `_global_` 前缀，执行顺序为 UCI 文件顺序。片段使用 Caddyfile 语法，由 Caddy 适配为 JSON 后加载。

## 监控与诊断

后台检查不依赖打开 LuCI，也不依赖 Caddy 主服务运行；通常每 5 分钟检查一次，根据证书有效期调整，失败约 60 秒后重试。Caddy 自己负责签发及续期，monitor 负责检查和通知。

Webhook 默认关闭，支持 method、body 和变量；不跟随重定向，有限超时、持久化重试、同问题去重及恢复通知。启用前用受控接收端验收。未再使用的旧具体域名证书由 Caddy 清理；有有效且不临近到期的替代证书覆盖站点时抑制旧证书告警。

运行日志与访问日志分开，默认使用 logd 内存环形缓冲区，访问日志默认关闭。导出保留允许字段并限制大小，不包含原始请求或私密错误文本。后端检测分批展示全部目标；TCP 可达不代表 HTTP / TLS / 认证正常。

## 构建与发布

普通分支推送、PR、定时任务均不触发 Actions。`workflow_dispatch` 仅生成构建附件；推送 `v*` 标签构建并创建草稿 Release。下载该次 APK、校验并在路由器验收后，再公开草稿，不重复构建。版本和哈希以该次 `manifest.json` 为准。

已完成本地测试、官方 SDK 构建、真实目标安装升级与配置保留检查；当前人工确认各 tab / 表单、保存及 UCI 取消、TLS 和中间件显示正常。手机、键盘、所有主题组合、生产续期、HTTP-01 / TLS-ALPN-01 公网签发、设备断电和真实外发通知仍需各自验收，不将局部验收当作全部通过。
