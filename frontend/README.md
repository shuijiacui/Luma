# Luma Frontend

React 19 + TypeScript + Vite 7，使用 Tailwind CSS、Framer Motion 和 React Router。当前功能见 [完成度](../docs/功能完成度.md)，后续设备方向见 [平板与手机方案](../docs/平板儿童端与手机家长端优化方案.md)。

## 开发与验证

```bash
npm ci
npm run dev
npm test
npm run build
npm run lint
```

`npm run dev` 会同时启动官网（5173）、家长端（5174）和儿童端（5175）。官网的儿童端、家长端入口会直接打开各自登录页；访问 5174 或 5175 根路径也会自动进入对应登录页，登录页与端内 Logo 可返回官网。如只调试单个入口，可运行 `npm run dev:portal`、`npm run dev:parent` 或 `npm run dev:child`。三个入口的 `/api` 都通过 Vite 代理到 localhost:3001，需另启 server。真实识别需要视觉服务；认证、空状态与游客示例不依赖真实模型。

生产构建未设置 `VITE_PORTAL_URL`、`VITE_PARENT_APP_URL`、`VITE_CHILD_APP_URL` 时，三个入口默认使用当前站点；分开部署时再通过环境变量指定各自的公开地址。

家长端使用断点隔离排版：桌面宽度保持侧栏仪表盘，窄屏才启用顶部导航、孩子快捷切换与手机触控尺寸。桌面浏览器不会强制套用手机模拟框。

## 页面与组织

- `/auth`：统一注册/登录；正式账号在服务端，游客仅体验。
- `/child/demo`、`/child/create`：儿童小屋、Nilo、画布与当前会话草稿。
- `/parent/demo`：多孩子概览、记录、主题、时间轴、建议、设置、周报/月报。
- `/parent/archive`：完整成长档案及内嵌原图 HTML 导出。

`features/auth` 管理身份与当前双端入口，`features/child` 管理创作，`features/parents` 管理解读和档案，`lib/api` 与 `hooks` 管理请求/状态，`design-system` 提供 UI 规范。设计系统见 [说明](src/design-system/README.md)。

## 数据约束

正式家庭空数据和错误分开，禁止以游客示例补位。AI 描述不标成孩子原话。参考分值不代表心理概率；概览采用可核对的作品数/元素数，信息不足保留 0。

报告按服务端 analysisId 生成/回看；图片带 Authorization 读取后转 Blob URL。孩子切换和会话轮换时忽略旧响应，退出后旧 refresh 不得恢复登录。

周报/月报按已结束周期汇总，支持 JSON 下载；成长档案导出 HTML，可由浏览器打印 PDF。家庭注销需要密码与精确确认文本，即使无孩子也能访问设置。

草稿当前仅内存会话内，头像本机存储；家长端已提供独立入口和手机竖屏导航，但尚未实施 IndexedDB 离线草稿、PWA、原生 App、跨设备草稿或完整真机验收。

## 本轮验证环境

前端 16 项测试通过。受限 Windows 工作区若已有 `.vite-temp`/dist 不可写，可使用 `npm test -- --configLoader runner` 以及 `npm run build -- --configLoader runner --outDir ../.tmp/frontend-build-period` 验证，默认开发环境无需改命令。真实触控、旋转与打印仍需设备验收。
