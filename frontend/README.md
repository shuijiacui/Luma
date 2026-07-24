# Luma Frontend

Luma 是一个儿童创意表达 AI 平台。儿童通过绘画和故事表达自己，AI
伙伴 Nilo（一只水獭）陪伴创作。前端独立开发，后续通过 API 与队友负责的后端联调。

## 技术栈

- React + TypeScript
- Vite
- Tailwind CSS
- Framer Motion
- React Router

## 目录约定

```text
src/
├── app/                # 应用入口与路由
├── assets/             # 图片、图标等静态资源
├── components/
│   ├── layout/         # 通用布局组件
│   └── ui/             # 基础 UI 组件
├── config/             # 环境及应用配置
├── design-system/      # 设计规范与动画预设
├── features/
│   ├── child/          # 儿童创作体验，仅包含创作与陪伴语境
│   ├── marketing/      # 产品官网
│   └── parents/        # 家长端与成长洞察
├── hooks/              # 通用 Hooks
├── lib/api/            # 后端 API 请求层
├── mocks/              # 前后端联调前的模拟数据
├── styles/             # 全局样式
├── types/              # 共享 TypeScript 类型
└── utils/              # 通用工具
```

UI 规范与组件用法见 [`src/design-system/README.md`](src/design-system/README.md)。

## 边界原则

- 儿童端不得出现心理分析、成长报告、父母监督等概念。
- 家长洞察能力只存在于 `features/parents` 业务域。
- 页面通过 `lib/api` 访问数据，不直接绑定后端实现。
- 后端未接入时，通过 `VITE_USE_MOCKS` 切换模拟数据。

## 本地开发

```bash
npm install
npm run dev
```

## 前端认证演示

- 品牌首页：`/`，使用 `src/assets/images/home-hero.png` 作为主视觉背景，并保留一个主认证入口。
- 统一认证入口：`/auth`，默认只显示登录；点击“立即注册”后进入注册表单。
- 家长认证使用 `auth-parent.png` 背景并将表单置于右侧；儿童认证使用 `auth-child.png` 并将表单置于左侧。
- 旧的家长、儿童登录注册地址会自动跳转到统一入口。
- 账号和会话仅保存在浏览器 `localStorage`，不连接后端或数据库。
- 家长注册会创建唯一 `familyId` 与家庭邀请码；儿童必须通过邀请码加入。
- 家长端只读取与当前会话 `familyId` 相同的儿童账号，游客双方固定使用同一演示家庭。
- 当前实现只适合产品原型演示，正式上线时必须替换为后端认证、密码哈希和安全会话。

## 儿童创作空间

- 路由：`/child/create`，仅儿童身份可访问。
- 支持画笔颜色、粗细、橡皮擦、撤销、清空和 PNG 下载。
- 头像属于账号设置：登录后在家长端、儿童端和画布顶部显示同一个头像。
- 支持从 `u1–u5` 选择头像，或上传最大 3MB 的本地图片。
- Nilo 仅使用观察、开放式问题和故事探索语言，不进行心理判断。

## 家长成长洞察

- 家长端按当前 `familyId` 读取已绑定儿童，不展示其他家庭的数据。
- 内容结构包含创作主题、孩子原话、AI 观察、沟通建议与近期创作。
- AI 观察仅描述创作中可见的主题和变化，不为孩子贴标签。
