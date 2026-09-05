# Luma — 让孩子的想象被温柔地听见

<p align="center">
  <img src="frontend/src/assets/images/home-hero.png" alt="Luma 的 AI 伙伴 Nilo 与儿童画作" width="100%" />
</p>

Luma 是一个面向儿童与家长的创意表达与情绪观察原型。孩子可以在不被打扰、不被评判的空间里自由绘画，AI 伙伴 Nilo 只对画面做克制、客观的回应；家长则可以在独立空间查看创作主题、情绪倾向、置信度、文献依据和沟通建议。

> **重要说明**：Luma 是情绪观察与早期提醒工具，不是心理测评、医疗器械或诊断工具。单幅画不能代表孩子的心理状态，任何结果都应结合日常行为、家庭环境和专业意见综合理解。

## Luma 能做什么

| 面向孩子 | 面向家长 | 面向团队 |
| --- | --- | --- |
| 自由画板：颜色、笔触、橡皮、撤销、清空和 PNG 下载 | 查看创作主题、画面解读、历史记录和描述性趋势 | 结构化视觉特征提取与可审计判定链路 |
| Nilo 陪伴创作，只描述可见内容，不追问或诱导情绪 | 查看情绪倾向、置信度、知识库条目和沟通建议 | JSONL 知识库、分层证据调度、红线校验和自动化测试 |
| 儿童端不展示任何心理判断 | 在同一家庭下切换孩子并查看各自记录 | SQLite 持久化、令牌轮换、限流、审计日志和备份脚本 |

产品坚持三个原则：

- **儿童侧不贴标签**：作画过程零问卷、零诊断，反馈仅限“我看到你画了……”和开放式邀请。
- **家长侧不下结论**：结果使用“倾向”“需要关注”“信息不足”等表述，并始终显示置信度。
- **判定依据可追溯**：模型只负责提取客观特征，真正的检索、评分和报告由确定性代码完成，每条有效依据都指向知识库条目。

## 用户如何体验

### 游客体验

打开首页后进入统一登录页，选择“家长”或“儿童”，再选择游客体验即可。游客模式适合快速查看界面和交互：家长端展示示例家庭数据，游客创作和内容不会保存。

实际的画作识别仍需要后端和视觉模型服务可用；仅启动前端时，可以浏览首页、认证页和家长端示例界面，但无法完成真实分析。

### 正式家庭流程

1. 家长注册账号，进入家长空间后复制家庭邀请码。
2. 孩子选择注册，填写昵称、4 位创作码和家庭邀请码，加入家庭。
3. 孩子进入创作空间自由绘画，点击“完成”后由 Nilo 返回客观画面描述；也可以继续补充绘画。
4. 在同一浏览器会话切换至家长空间，在“成长概览”为最近一次创作生成画面解读，并查看历史解读、创作主题和沟通建议。

建议使用桌面浏览器、平板或横屏手机，以获得更完整的画板操作空间。

## 隐私与安全边界

| 数据/能力 | 当前处理方式 |
| --- | --- |
| 画作原图 | 经后端发送给所配置的多模态模型服务做当次特征提取；Luma 服务端不落库。孩子可主动在本地下载 PNG |
| 分析记录 | 登录孩子仅保存结构化特征和报告 JSON；游客不保存 |
| 账号密码 | 家长密码和儿童创作码使用 `scrypt` 哈希，不保存明文 |
| 会话 | 2 小时 access token + 30 天轮换式 refresh token；退出后服务端吊销 |
| 输出内容 | 疾病词、无效知识库 ID 或低质量特征会触发拦截或降级为“信息不足” |
| 权限隔离 | 情绪解读仅在家长空间展示；历史记录按家庭校验访问权限 |

当前版本仍是 MVP/研究原型：

- 它不能替代专业评估，不提供治疗或干预方案。
- 最新画作的完整特征暂存在当前浏览器 `sessionStorage`；跨设备的家长能看到分析记录，但暂时不能为一条“尚未生成解读”的远端记录补生成报告。
- 头像等少量个性化设置仍保存在浏览器本地，不会跨设备同步。
- 在用于生产环境前，必须补齐隐私政策、监护人同意、模型服务商数据处理说明和本地合规评估。

## 判定是怎样产生的

```text
儿童画作
   │
   ▼
多模态模型提取 FeatureJSON
（元素、颜色、构图、笔触、涂改及逐维置信度）
   │  低于 0.5 的特征维度被丢弃
   ▼
知识库标签检索与分层调度
   │  31 条带来源条目；经验性证据不能单独定案
   ▼
确定性评分
（簇内 max → 簇间 noisy-OR → Bayesian-inspired 校准）
   │
   ▼
安全校验与模板报告
（情绪倾向 + 置信度 + 条目 ID + 家长沟通建议）
```

LLM 只存在于第一步，负责“看见并描述”，不直接生成情绪判断或家长建议。展示置信度最高限制为 `0.85`，用于体现绘画投射方法本身的效度边界。评分原理、证据分层和已知争议见 [RAG 设计](docs/RAG设计.md) 与 [知识库调度](docs/知识库调度.md)。

## 本地开发

### 环境要求

- Node.js `>= 22.5`（后端使用内置 `node:sqlite`）
- npm
- DeepSeek API Key（画作分析使用支持图像输入的实验视觉模型）
- 现代浏览器

### 1. 启动后端

```bash
cd server
cp .env.example .env
npm ci
npm start
```

Windows PowerShell 可用 `Copy-Item .env.example .env` 代替 `cp`。随后编辑 `server/.env`，至少确认以下配置：

```dotenv
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=your-deepseek-api-key
LLM_VISION_MODEL=deepseek-v4-flash-vision-exp
LLM_TEXT_MODEL=deepseek-v4-flash
PORT=3001
```

不要提交 `server/.env`。服务启动后可访问 `http://localhost:3001/api/health`，预期返回：

```json
{"ok":true}
```

### 2. 启动前端

另开一个终端：

```bash
cd frontend
npm ci
npm run dev
```

打开 `http://localhost:5173`。开发服务器已将 `/api` 代理到 `http://localhost:3001`，通常不需要额外配置。若前后端不在默认地址，可复制 `frontend/.env.example` 并修改 `VITE_API_BASE_URL`。

### 3. 验证项目

```bash
# 后端 API、认证、评分、安全和数据链路
cd server
npm test

# 知识库 schema、来源与约束校验（在仓库根目录执行）
node knowledge/scripts/validate.mjs

# 前端 lint、类型检查与生产构建
cd frontend
npm run lint
npm run build
```

## 项目结构

```text
.
├── frontend/          # React 19 + TypeScript + Vite + Tailwind CSS 4
│   └── src/
│       ├── features/  # marketing、auth、child、parents、onboarding
│       ├── lib/api/   # API 请求、Bearer 认证与自动 token 轮换
│       └── design-system/
├── server/            # Express API 与 SQLite 数据层
│   ├── src/routes/    # analyze、report、auth、history、trend
│   ├── src/services/  # 特征提取、检索、调度、评分、报告与安全
│   └── tests/         # Vitest + Supertest
├── knowledge/         # entries.jsonl、分层调度和安全约束
├── docs/              # 产品、交互、架构、API、研究与部署文档
└── deploy/            # Caddy、systemd 和 cron 示例
```

## 技术栈

| 层 | 主要技术 |
| --- | --- |
| Web | React 19、TypeScript、React Router 7、Framer Motion |
| UI | Tailwind CSS 4、自建 Luma Design System |
| API | Node.js、Express 4 |
| 数据 | SQLite（`node:sqlite`），单文件、无额外数据库服务 |
| AI | OpenAI-compatible 多模态 Chat Completions 接口 |
| 测试 | Vitest、Supertest；前端 ESLint 与 TypeScript 构建检查 |
| 部署 | 单机 Node 进程 + Caddy HTTPS + systemd + cron 备份 |

## 核心 API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/health` | 服务健康检查 |
| `POST` | `/api/analyze` | 画作转结构化特征，并返回儿童侧描述性反馈 |
| `POST` | `/api/report` | 特征转家长侧解读；可关联一次已保存的分析 |
| `POST` | `/api/auth/parent/*` | 家长注册与登录 |
| `POST` | `/api/auth/child/*` | 儿童注册与登录 |
| `POST` | `/api/auth/refresh` | 轮换 access/refresh token |
| `GET` | `/api/children/:childId/analyses` | 获取家庭内孩子的历史分析 |
| `GET` | `/api/children/:childId/trend` | 获取描述性历史聚合，不做预测 |

完整请求和响应结构见 [API 契约](docs/API契约.md)。

## 开发约束

这些规则是产品安全边界，也是提交代码时需要守住的架构约束：

- 儿童端不得出现情绪判定、成长报告、疾病名或“父母监督”等表达。
- `/api/analyze` 的反馈只能描述画面；`/api/report` 只允许在家长语境中调用。
- `feedbackText`、`followUp` 和 `parentAdvice` 由后端模板生成，前端不得自行改写。
- 检索、评分、报告阶段不得引入 LLM；判定必须引用真实存在的知识库条目 ID。
- 修改 `knowledge/` 后必须运行 `node knowledge/scripts/validate.mjs`。
- API Key、数据库、日志和备份文件都不得提交到仓库。

## 文档导航

- 想了解产品范围与不能做什么：[项目边界](docs/项目边界.md)、[交互流程](docs/交互流程.md)
- 想理解系统与算法：[架构设计](docs/架构设计.md)、[RAG 设计](docs/RAG设计.md)、[情绪判定标准](docs/情绪判定标准.md)
- 想开发或联调：[API 契约](docs/API契约.md)、[前端联调说明](docs/联调说明.md)、[前端说明](frontend/README.md)
- 想维护知识库：[知识库调度](docs/知识库调度.md)、`docs/文献提取-*.md`
- 想部署上线：[生产部署指南](docs/部署.md)

## 生产部署

仓库提供单台 Ubuntu VPS 的参考方案：Caddy 负责 HTTPS，Node 同时提供 `/api/*` 与前端静态资源，systemd 守护进程，cron 每日备份 SQLite。部署前请阅读 [生产部署指南](docs/部署.md)，并根据实际地区补齐隐私政策、监护人同意、数据保留与安全审查流程。
