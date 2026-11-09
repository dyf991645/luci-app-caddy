# luci-app-caddy

OpenWrt 的 Caddy 反向代理管理界面。目标为官方 OpenWrt、APK、`aarch64_cortex-a53`。

首版 [Web 交互预览](preview/README.md)：运行 `bun run dev`，打开 <http://127.0.0.1:4183>。

原生包位于 `packages/`：

- `caddy-binary`：上游 Linux ARM64 内核、Cloudflare 模块、procd 服务及初始生效配置。
- `luci-app-caddy`：默认主题的“服务 → Caddy”入口，真实版本、模块、进程状态，启停、重启、重载和开机启动。

当前原生实现仅覆盖服务入口。站点、证书、认证及配置编辑仍是后续任务；Web 预览明确使用模拟状态，不连接设备。

目标为官方 OpenWrt **25.12.4 / mediatek/filogic / aarch64_cortex-a53 / APK**。
SDK、上游 URL、实际内核/模块版本与 SHA256 见 [artifact-lock.json](artifact-lock.json)。
定制下载只固定模块版本，尚无核心版本固定合同，因此本项目只宣称产物可追溯；再次下载的摘要不一致会停止打包。

在匹配的官方 Linux x86_64 SDK 中，把两个包目录链接到 `package/`，把已核验上游二进制缓存为
`dl/caddy-2.11.8-cloudflare-0.2.4-linux-arm64`，随后执行：

```sh
make defconfig
make package/caddy-binary/compile package/luci-app-caddy/compile V=s
```

APK 位于 SDK 的 `bin/packages/`。仅在匹配的测试设备上安装经审核的本地产物：

```sh
apk add --allow-untrusted /tmp/caddy-binary-*.apk /tmp/luci-app-caddy-*.apk
```

`--allow-untrusted` 仅用于尚未配置发布签名的本地测试包，不跳过依赖和架构检查。
安装前确认现有包源与固件版本匹配；插件不更新包源、不修改 uhttpd、DNS、防火墙或端口转发。

服务固定读取 `/etc/caddy/active.json`；初始配置没有 HTTP/HTTPS 代理监听，管理接口只监听
`127.0.0.1:2019`。配置及证书数据目录 `/etc/caddy/` 为 root 私有权限，Caddy autosave 禁用。
服务启动、重启及重载均不读取草稿。日志交给系统 logd 的有限缓冲区。

测试边界和原生验证脚本见 [tests/README.md](tests/README.md)。构建通过不能代替目标 APK 安装、LuCI 浏览器和服务生命周期验收。
