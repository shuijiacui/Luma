# Luma 前端开发指南

React 19、TypeScript、Vite 7、Tailwind CSS、Framer Motion 与 React Router。产品入口和操作流程见 [功能与使用流程](../docs/功能与使用流程.md)；本文说明前端维护约定，验收场景见 [联调说明](../docs/联调说明.md)。

## 启动与构建

在 `frontend` 目录执行：

```bash
npm ci
npm run dev
```

`dev` 同时启动官网 `5173`、家长端 `5174` 和儿童端 `5175`；后端需在另一个终端运行 `npm --prefix server run dev`（从仓库根目录执行）。三个前端的 `/api` 都代理到 `localhost:3001`。

| 命令 | 用途 |
| --- | --- |
| `npm run dev:portal` / `dev:parent` / `dev:child` | 单独调试一个入口 |
| `npm test` | Vitest 工程与组件回归 |
| `npm run lint` | ESLint 检查 |
| `npm run build` | TypeScript 检查与官网构建 |
| `npm run build:parent` / `build:child` | 独立端的 TypeScript 检查与构建 |

三个构建默认都输出到 `dist`。需要同时保留产物时分别传入 `--outDir dist-portal`、`--outDir dist-parent`、`--outDir dist-child`。

入口由 `vite.config*.ts` 注入的 `__APP_MODE__` 与 [appMode.ts](src/config/appMode.ts) 决定。生产默认链接当前站点；独立域名或局域网手机联调时，在 `.env.local` 配置设备可访问的 `VITE_PORTAL_URL`、`VITE_PARENT_APP_URL`、`VITE_CHILD_APP_URL`。手机上的 `localhost` 指手机自身，不能沿用电脑的默认跳转地址。跨域 API 使用 `VITE_API_BASE_URL`，并配合服务端 CORS 白名单。

## 代码入口与状态约束

| 位置 | 维护内容 |
| --- | --- |
| `src/app/router.tsx`、`src/config/appMode.ts` | 路由、独立端角色与跨端跳转 |
| `src/features/auth`、`src/lib/api` | 身份、会话刷新、受保护请求和家长主页面 |
| `src/features/child` | 小屋、画布、可编辑作品、Nilo 共创与语音 |
| `src/features/parents` | 解读、历史、周期摘要、档案导出 |
| `src/features/onboarding` | 可重播引导与定位、焦点管理 |
| `src/i18n`、`../shared/locales/en.json` | 语言状态与共享词典 |
| `src/design-system` | [样式规范](src/design-system/README.md) |

- 使用 `authFetch` 请求受保护接口，图片携带 Authorization 获取后转 Blob URL；不要把 token 放进图片链接。切换孩子、账号或作品时，异步结果必须校验归属；退出后旧 refresh 不能恢复会话。
- 正式家庭的加载、空数据、错误与游客示例分别处理。AI 描述必须保留来源，不能作为“孩子原话”。
- `artworks` 是儿童可编辑作品；`analyses` 是家长可见的分析记录。保存与完成的调用不能合并回一个模型请求；协议见 [API 契约](../docs/API契约.md)。
- 共创新图案保留为独立描画底图：SVG 使用灰色虚线，高分辨率 PNG 使用淡灰参考轮廓。孩子可以移动、缩放和清除底图，底图不写入儿童笔迹、作品 PNG 或分析图。`useCompanion` 管理请求，`companion/proposals.ts` 校验几何。
- 笔迹文档区分儿童和 Nilo 来源。成长分析导出儿童图层，家长展示可使用合成图；旧图来源未知时不能伪称儿童独立创作。
- `draft.ts` 管理内存状态；`draftRecovery.ts` 按账号和作品把可编辑文档、工具与独立底图写入当前标签页的 `sessionStorage`，刷新时可恢复或丢弃。正式作品通过服务端保存，游客作品留在本机。
- “换一个”通过 `MaterialPicker` 按猫、学校等具体题材展示真实 SVG/PNG 预览，支持搜索和键盘。审核拒绝的素材不再提供新选择，已保存底图仍能恢复；更换底图保留全部儿童笔迹。
- `materialPreferences.ts` 只记录实际点选的素材与风格，每个正式儿童账号最近 32 条；访客只保留当前会话。模型推荐、浏览与家长审核不计入孩子选择，不据此推断能力。
- `guided` 记录参考底图曾被展示，清除底图后仍保留引导来源；它不把描画底图当作模型笔迹。

## 双语维护

语言通过 `src/i18n/store.ts` 的外部状态订阅更新。首次默认中文，`luma_locale` 保存偏好，同源标签页通过 `storage` 事件同步；独立端口和域名不共享这份本地存储。存储不可用时仍允许当前页面切换。

新增展示文案应在 `shared/locales/en.json` 补英文，在组件中订阅 `useLocale()`，使用 `t('中文原文')`。`lt` 可在 JSX 边界处理字符串或数组。动态句子使用 `{0}`、`{1}` 模板，避免拼接多个中文短语；带用户姓名的模板应检查捕获值不会被当作界面文案翻译。

翻译只发生在展示层：不要用译文作为路由、数据库值、权限条件或稳定 ID。用户姓名、作品原文、历史模型自由文本保留原内容，不因切语言自动请求翻译。分类枚举、评分、知识库编号和来源文件名保持稳定。

`LanguageSwitcher.tsx` 同步文档 `lang` 和标题；按钮的可访问名称、日期和空态也须本地化。切换语言不能按 locale 重挂载整个路由，否则会丢失表单、笔迹或撤销历史。

报告请求通过 `locale` 指定生成语言，服务端维护位置为 `server/src/services/localization.js`。儿童分析的中英文反馈由同一组客观特征形成；成长册在导出开始时固定标签语言，保留用户原文、HTML 转义与令牌排除。周期 JSON 保留原始字段。

## 引导维护

步骤定义位于 `features/onboarding/steps/`。每一步使用稳定 `id` 和 `data-onboarding` 选择器，可通过 `prepare` 切换真实栏目，通过 `interaction: 'click' | 'stroke'` 等待实际操作，`focusArea` 限定局部画布区域。桌面和手机重复挂载同名入口时，定位器只选可见节点。

当前画布欢迎仅选择自己画／一起画；欢迎结束不会自动启动工具导览。画布帮助按钮显式调用 `startCanvasTour(canvasSteps, true)`。更改工具位置时须同步步骤目标和双语文案，不能重新引入强制画半圆或自动多步引导。

`OnboardingOverlay` 会测量卡片真实高度，按视口、滚动容器及安全区裁切高亮；短屏卡片可内部滚动。阅读步骤屏蔽背景，互动步骤仅放行目标。保留 Escape、上一步、焦点限制、退出后焦点恢复与减少动态效果支持。目标或异步准备超过 3 秒仍不可用时跳过该步，整次流程记录为 `skipped`，不冒充完整完成。

引导状态键为 `luma_onboarding_v2:<角色>:<编码后的账号>:<流程>`。正式账号的 `completed` / `skipped` 保存在当前浏览器，二者都不再自动弹出；游客只记录本次会话。显式重播可以重新开始。页面卸载或账号切换会取消所属流程；不要恢复旧的仅按角色存储键，也不要声称进度跨设备同步。

## 角色素材与声音

首页背景使用 `assets/images/home-lakeside-v2.png`。小屋角色当前由 `NiloCharacter.tsx` 和 `NiloIllustration.tsx` 实现，不能沿用历史稿中“整张图片 multiply”或“图集拆分肢体”的实现说明。

- `NiloIllustration` 使用 `images/nilo/nilo-companion-v1.png`、`nilo/nilo-content.png`、`nilo/nilo-laugh.png`、`nilo/nilo-highfive.png` 四种整幅姿态，配合 `nilo-silhouettes.json` 的 SVG 轮廓遮罩。局部位移滤镜提供动作，表情以面部遮罩融合；不是骨骼动画。
- 替换素材时，需同时检查统一的 `1254 × 1254` 画面坐标、轮廓和热区。姿态图未解码完成时回退 idle；击掌姿态会更新手部触碰位置，避免热点留在旧位置。
- 六个热区为头、鼻子、手、肚子、尾巴、提灯。交互分察觉／回应／恢复；连续点击取消旧定时器，间隔保护为 220 毫秒。页面隐藏、离开和减少动态效果设置会停止相应动画；触摸不启用鼠标视线跟随。
- 热区使用可键盘操作的真实按钮，回应通过状态区域播报。不要将仅可点击的图片或坐标区域替换掉这些语义。
- `useNiloSound` 是小屋的本地 Web Audio 短音效；`useDrawingMusic` 是背景音乐；`useCompanionVoice` 是画布 ASR/TTS。三者职责独立。语音活动通过 `luma-voice-active` 事件降低音乐音量，结束后恢复用户原设置。
- 仅在用户主动开启麦克风或连续对话后申请/使用收音权限；头像交接绘画不申请，连续会话不自动恢复。语音 hook 负责流、播放、异步识别的版本取消与离页清理，不能仅隐藏按钮而留下录音。云端与浏览器降级条件见 [Nilo API](../server/NILO_API.md)。

## 布局与回归

桌面家长端与手机端采用断点分离布局，不能把手机卡片简单放大替代桌面侧栏。儿童画布使用固定窄工具区，工具开合不得改变画布尺寸；窗口变化时保留既有作品比例。手机方向锁定只是能力尝试，不能将浏览器不支持锁定当作页面无法使用的理由。

优先运行与改动有关的测试，再执行全量检查。主要回归入口包括 `i18n.test.tsx`、`onboarding.test.tsx`、`nilo-character.test.tsx`、`drawing-canvas.test.tsx`、`drawing-surface-resize.test.tsx`、`companion-controller.test.tsx`、`companion-voice.test.tsx`、`authFetch.test.ts` 和 `parentViews.test.tsx`。

测试替身验证工程行为，不能证明真实儿童语音准确率、触控手感、浏览器方向锁定或供应商可用性；发布前按 [联调说明](../docs/联调说明.md) 完成人工检查并记录实际环境。
