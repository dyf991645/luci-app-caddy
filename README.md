# luci-app-caddy

官方 OpenWrt 的原生 LuCI Caddy 管理界面，入口为“服务 → Caddy”。首版目标为 **OpenWrt 25.12.4 r32933-4ccb782af7 / mediatek/filogic / aarch64_cortex-a53 / APK**，不能仅按 CPU 架构判断兼容性。包含 `caddy-binary`（Caddy 2.11.8 + Cloudflare 0.2.4）和 `luci-app-caddy` 两个包。版本、SDK、上游摘要见 [artifact-lock.json](artifact-lock.json)。

支持多站点和后端、一个路径边界、三种域名验证方式、全局引用或独立 Basic Auth / Authelia、独立完整 Caddyfile、实际存储证书、后台证书告警及安全日志诊断。原生界面随 LuCI 用户语言和主题，附带简体中文，保留英文 fallback；不会修改语言或主题设置。[Web 预览](preview/README.md) 使用模拟状态，不连接路由器，不能作为原生界面验收。

## 安装与升级

使用匹配目标的构建附件，保留两个 APK、`manifest.json`、`artifact-lock.json`、版本 / 模块信息和 `SHA256SUMS`。先在可信计算机核对发布来源及校验文件，再校验完整附件：

```sh
sha256sum --check SHA256SUMS
```

将两个经核验的 APK 复制到路由器 `/tmp/caddy-install/`。先查看 `ubus call system board`、`apk --print-arch`、`apk info caddy caddy-binary luci-app-caddy`，确认固件 / 目标匹配，无官方 `caddy` 冲突包。不要覆盖已有 Caddy 部署：先备份、停止旧服务并明确迁移配置；本插件不能自动迁移官方包或其他插件。包源须匹配固件；本项目不修改源、不执行系统升级。已知测试设备源指向 rc3，测试采用离线安装以免误升级其他包。

升级前备份整个 `/etc/caddy`，其中包括草稿、生效配置、认证及 DNS 凭据、ACME 账户、证书和通知去重状态；自定义存储在该目录外时另行备份该实际目录。备份包含秘密，应以 root 私有权限保存并加密转存。下面命令中的备份文件路径必须是尚不存在的新路径：

```sh
umask 077
tar -C / -czf /tmp/caddy-before-upgrade.tar.gz etc/caddy
apk add --simulate --allow-untrusted --no-network /tmp/caddy-install/caddy-binary-*.apk /tmp/caddy-install/luci-app-caddy-*.apk
apk add --allow-untrusted --no-network /tmp/caddy-install/caddy-binary-*.apk /tmp/caddy-install/luci-app-caddy-*.apk
```

模拟结果应只安装或升级这两个包；有额外变更或缺依赖时先停止并检查。`--allow-untrusted` 仅用于明确审查过、尚未建立可信签名分发的本地 APK，不替代校验和兼容性检查。各版本附件放在独立目录，避免通配符选中多个版本。首次缺少依赖时需从匹配固件的可信来源补齐，不能通过忽略依赖强行安装。

安装后刷新 LuCI，等待 rpcd 异步重新注册，再检查 `ubus call luci.caddy status`、`apk info -v caddy-binary luci-app-caddy` 和日志诊断页。首次配置无代理监听；Caddy 管理端仅 `127.0.0.1:2019`，不向 LAN/WAN 开放。证书监控服务自动启动，外部通知默认关闭。Caddy 服务由用户在概览页启用 / 启动；应用不会自动启动已停止的 Caddy。

## 保存、生效与回退

“保存”只持久化草稿。“保存并应用”校验后热加载，成功才更新生效修订。失败保留旧生效配置，若提示恢复则启动或重启服务完成事务恢复；重新查看草稿、生效修订及实际请求。启动、重启和“重载生效配置”始终读取最近成功应用的内容，不读取失败草稿。热加载不等于所有 WebSocket 或长连接永不中断；变更路由后连接可能关闭，客户端需重连。

表单与完整 Caddyfile 各自保留内容，切换并应用才改变生效来源。手动模式下站点、端口、ACME 和认证表单只读，服务、开机启动及通知仍可用。手动源只限可信管理员，管理地址及文件系统存储受约束，不支持 import 或环境变量展开。

单次应用失败先修正草稿或重载旧生效配置，不必降级包。需要整包回退时，保留升级前两个 APK 和对应数据快照，在维护窗口停止 Caddy 和监控，模拟安装旧版本（`apk add --simulate --allow-untrusted --no-network --allow-downgrades <两个旧APK>`），核对后去掉 `--simulate`。不要卸载清除数据。新版可能迁移状态结构，旧程序不可直接读取已迁移数据：停服后将当前目录另存，再恢复升级前 `/etc/caddy` 及自定义存储快照，检查目录 0700 / 私有文件 0600，重启 rpcd，按升级前状态恢复服务 / 监控 / 开机设置并验证请求。回退会丢失快照后的配置与证书变化，恢复旧证书前确认有效期。

## 端口与证书验证

OpenWrt 的 uhttpd 通常已占用 80/443，先在“日志与诊断”查看实际监听及冲突。可让 Caddy 使用内部 HTTP 10080、HTTPS 10443，并自行配置公网 80 → 10080、443 → 10443。直接访问非标准端口用 `https://域名:10443`，公网映射时需规划正确公网 URL 和 HTTP 跳转。插件不会改 uhttpd、防火墙、DNS、NAT 或端口转发，保留 LuCI 管理入口。

- HTTP-01：公网 80 必须连通内部 HTTP 端口，域名 A/AAAA 须指向可达入口。
- TLS-ALPN-01：公网 443 必须连通内部 HTTPS 端口，中间 TLS 终止代理可能阻断挑战。
- DNS-01：需要 Cloudflare API 可达、正确权威 DNS 和 TXT 传播；通配符域名必须使用它。只授予所需区域的 **Zone DNS Edit** 和 **Zone Read**。Token 输入只写；保存暂存私有修订，应用成功后热加载新凭据，失败保留旧生效修订。更改默认验证方式不会删除凭据。

本机监听、TCP 后端探测和应用成功不能证明公网可达或签发成功。TLS 页面区分验证配置、实际已存储 PEM 和部分签发 / 续期事件；“未知”不能当作成功。需从目标客户端对真实域名握手，检查链、SAN、有效期及实际提供的证书，并结合权威 DNS、公网端口和签发日志验证。存储证书不等于实时连接提供的证书。手动证书导入不在首版范围。

## 访问认证与路径

每个站点选择“不附加认证”、Basic Auth 或 Authelia，再选择全局引用或独立配置。修改全局配置会列出所有受影响域名，应用后联动引用站点；独立站点不受影响。Basic Auth 支持多账号，密码在路由器生成 bcrypt，已有密码 / 哈希不回显；高级哈希输入只接收已有 bcrypt。账号保存更新草稿，仍须应用。

Authelia 需要显式端口的可达 HTTP(S) 后端、`/api/authz/forward-auth` 和登录门户 URL。门户站点本身不附加认证，避免循环。用户、MFA、策略、会话域名和 `authelia_url` 由外部 Authelia 管理；认证接口不可达时拒绝请求。应分别验证匿名、错误密码、有效会话、策略拒绝与伪造身份头。

每个域名首版只有一个站点和一个可选路径边界。`/media/*` 包含 `/media/` 和下级，不包含 `/media` 或 `/mediaX`。匹配范围内先认证再代理，其他路径 404。后端使用显式端口，同站点协议一致，HTTPS 后端验证证书；TCP 可达不能证明 HTTP 健康、TLS 信任或认证正确。

## 日志、证书告警与通知

日志默认使用现有有界 logd 内存环形缓冲区；访问日志默认关闭。查看 / 导出仅保留允许的状态字段，省略原始请求、URL、请求头和私密错误文本；空日志不证明成功。最多读取 256 行 / 128 KiB，只保留最近 32 个固定配置事件。系统已有外部文件 / 远程日志另行检查保留与权限；插件不更改它，手动 Caddyfile 自行输出的文件不导出。

后台证书检查不依赖打开 LuCI，也不依赖 Caddy 正在运行。以实际 PEM 有效期判断过期、短周期证书临近到期与重复观察的续期问题；签发历史只覆盖有限日志及保留观察，不承诺知道所有尝试的最终结果。Webhook 默认关闭，URL / 查询 / 请求头只写，不跟随重定向，有限超时和每个事件三次持久化尝试；相同问题去重，观察到有效替换证书后恢复通知一次。事件 ID 可供接收方对重试去重。启用前先用受控接收方确认格式和网络；不要将凭据放入公开日志或截图。

## 构建与验收状态

[构建说明](scripts/README.md) 描述锁定 SDK / feed、SHA256、Actions 附件与发布流程；[测试说明](tests/README.md) 记录真实 RPC、Caddy、认证和受控 Webhook 边界。LuCI 包通过 `luci-base/host` 声明 po2lmo，将 `po/zh_Hans/caddy.po` 编译安装为原生 `caddy.zh-cn.lmo`。构建器核对 APK 内目录与源文件对应，不额外修改用户语言 / 主题。

当前为本地集成验收阶段，未推送、未触发远端 Actions、未打标签或发布 Release。真实 r2 安装已验证；最终版本的安装 / 升级结果须另附实际记录，不能把构建通过当作已安装。升级前测试夹具仅有未应用草稿与自有存储 sentinel；没有真实 ACME 账户 / 公网证书，因此 sentinel 保留不能当作真实账户、证书迁移保留验收。浏览器因管理员政策阻止，Bootstrap 浅 / 深色、手机、键盘、保存入口及原生交互验收待完成。公网 HTTP-01 / TLS-ALPN-01 / DNS-01、真实 Cloudflare Token、生产续期、设备断电及真实外发通知仍待最终受控验收，不以预览或本地内部 CA 替代。
