# Caddy LuCI 交互预览

在仓库根目录运行 `bun run dev`，打开 <http://127.0.0.1:4183>。
无第三方前端依赖，使用原生 HTML、CSS、JavaScript。`bun run check` 检查浏览器脚本能否构建。

## 本版范围

- 概览、反向代理、TLS 证书、全局设置、配置文件、运行日志。
- 浅色 / 深色自动跟随系统（`prefers-color-scheme`），原生控件同步切换。
- 按官方默认 LuCI Bootstrap 布局预览：顶部主菜单、“服务 → Caddy”下拉入口、内容区页面标签、居中编辑弹窗。
- 新增、编辑、删除、搜索、筛选、启停站点；支持多个后端及同协议检查。
- HTTP-01、DNS-01（Cloudflare）、TLS-ALPN-01，通配符必须使用 DNS-01。
- 认证选择、路径匹配、前缀移除、自定义片段。
- 表单生成 Caddyfile 与独立手动模式；复制和下载配置。
- 保存于浏览器 localStorage，应用、进程状态及日志均为模拟。
- 独立的模拟重载入口；未应用配置需走“模拟校验并应用”，服务停止时不允许重载。
- 全局配置 Authelia 后端及认证接口，站点选择引用；Basic Auth 使用用户名和已有 bcrypt 哈希。

不连接 OpenWrt、不执行 Caddy、不申请证书、不保存真实 Cloudflare Token。
尚未实现真实 LuCI RPC/UCI/procd、APK 包或 GitHub Actions。这些将在界面方向确认后接入。
Authelia 默认地址沿用现有部署示例，可在全局设置中修改为 OpenWrt 实际可达地址。
高级片段与手动配置必须在后端接入后通过真实 Caddy 校验；前端不声称验证任意 Caddyfile 语法。

预览服务只监听本机，且只允许访问固定静态文件。
