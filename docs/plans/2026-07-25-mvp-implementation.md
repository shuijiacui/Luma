# 儿童绘画心理探索产品 MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 搭建"儿童绘画 → AI 克制反馈 → RAG 情绪判定 → 置信度输出"全链路 MVP，支撑路演 Demo 与易拉宝/PPT 物料。

**Architecture:** React 画板前端（搭档）+ Node/Express 判定服务（我）。判定链路三段式：① 多模态 LLM 把画作提取为**结构化特征 JSON**（非直接下结论）→ ② RAG 在心理学知识库中按特征检索文献依据 → ③ 加权评分输出情绪倾向 + 置信度，低于阈值输出"信息不足"。AI 不做诊断，引导极度克制。

**Tech Stack:** Node 20+ / Express 4 / Vitest / React 18 + Vite（client，本会话开发）/ LLM 走 OpenAI 兼容中转 `https://api.openai-next.com/v1`（key 存 `server/.env`，已 gitignore）/ **画作特征提取用 o3-pro（最强视觉推理，已实测通过）**，辅助文本任务用 kimi-k2.5 / JSONL 知识库 + 标签匹配检索（向量检索留 v2）

**LLM 配置（已实测 2026-07-25）：**
- `LLM_BASE_URL=https://api.openai-next.com/v1`（apifox.cn 是文档站，真实端点是 api.openai-next.com）
- `LLM_VISION_MODEL=o3-pro` —— 特征提取，视觉实测 ✅
- `LLM_TEXT_MODEL=kimi-k2.5` —— 前端展示文案等轻量任务，实测 ✅（注意它是 reasoning 模型，max_tokens 要给足）

---

## 〇、项目边界（本文件即 `docs/项目边界.md` 的内容源）

### ✅ In Scope（MVP 必须）

| 模块 | 内容 |
|------|------|
| 画板 | 自由绘画、笔触/颜色、导出图片（client） |
| AI 克制反馈 | 仅描述性反馈（"我看到你画了…"），**非诱导式**，不追问情绪 |
| 特征提取 | 多模态 LLM → 结构化特征 JSON（元素、颜色、构图、笔触、涂改） |
| RAG 判定 | 特征 → 知识库检索 → 情绪倾向 + 置信度 |
| 结果页 | 情绪倾向 + 置信度数值 + 家长沟通建议（非干预方案） |
| 知识库工具 | JSONL 数据格式、校验脚本、种子数据（含文献出处） |

### ❌ Out of Scope（明确不做）

| 不做 | 原因（对话共识） |
|------|------|
| 心理疾病诊断 | 只做情绪预警，"宁可信其有"但不下结论 |
| 干预/治疗方案 | 由家长自行沟通，产品只展示监测结果 |
| 文字/语音聊天引导 | 语言修饰导致信息失真（对话核心结论） |
| AI 主动绘画引导 | AI 画风主观干扰强，判定可信度降低 |
| 成人版 | 儿童/成人心理学体系差异大，垂直做儿童 |
| 用户账号/权限 | 路演 Demo 不需要 |
| 向量数据库 | v2 再做，MVP 用标签匹配足够 |
| 多幅画纵向追踪 | v2 |

### 🚫 Hard Constraints（输出红线）

1. 输出文案**绝不出现疾病名**（抑郁症、多动症等），只用情绪倾向词：乐观平稳 / 焦虑倾向 / 低落倾向 / 需要关注
2. 每条判定必须引用知识库条目 ID（可追溯文献依据）
3. 置信度永远展示；< 阈值（默认 0.7）输出"信息不足，建议继续观察"
4. AI 反馈只允许**描述画面 + 开放式提问**，禁止诱导性提问（"你是不是很难过"）

---

## 一、开发文档清单（`docs/` 目录）

| 文档 | 作用 | 边界（写什么/不写什么） |
|------|------|------|
| `项目边界.md` | 范围红线 | 本文件第〇节，任务 2 落地 |
| `交互流程.md` | **搭档前端开发唯一依据** | 逐页输入/输出/AI 行为；不写实现细节 |
| `架构设计.md` | 系统结构图 + 判定链路 | 模块划分、数据流；不写代码 |
| `API契约.md` | 前后端接口定义 | 请求/响应 schema + 示例；联调唯一依据 |
| `情绪判定标准.md` | 特征→情绪映射规则 | 每条附文献出处；不臆造规则 |
| `RAG设计.md` | 知识库格式 + 检索逻辑 | 数据 schema、匹配算法、阈值策略 |
| `引导体系设计.md` | AI 反馈话术规范 | 允许/禁止话术清单，文献依据 |

---

## 二、仓库结构

```
图画心理安全检查/
├── docs/
│   ├── plans/2026-07-25-mvp-implementation.md   ← 本文件
│   ├── 项目边界.md / 交互流程.md / 架构设计.md
│   ├── API契约.md / 情绪判定标准.md / RAG设计.md / 引导体系设计.md
├── client/                  ← 搭档负责（本计划不含 client 任务）
├── server/                  ← 我负责
│   ├── package.json
│   ├── vitest.config.js
│   ├── src/
│   │   ├── index.js                 # 入口
│   │   ├── app.js                   # Express app
│   │   ├── routes/analyze.js        # POST /api/analyze
│   │   ├── services/llmClient.js    # 多模态 API 封装
│   │   ├── services/extractFeatures.js   # 画作 → 特征 JSON
│   │   ├── services/retrieve.js     # 知识库检索
│   │   ├── services/score.js        # 情绪评分 + 置信度
│   │   └── services/report.js       # 结果 + 家长建议生成
│   └── tests/ (与服务同名的 .test.js)
├── knowledge/
│   ├── entries.jsonl          # 知识库条目（特征标签↔情绪↔文献）
│   ├── schema.json            # 条目校验 schema
│   └── scripts/validate.mjs   # 校验脚本
└── package.json (workspaces: client, server)
```

---

## 三、任务列表

### Task 1: 仓库脚手架 + 文档骨架

**Model hint:** `auto`

**Files:**
- Create: `package.json`（root workspaces）
- Create: `docs/项目边界.md` `docs/交互流程.md` `docs/架构设计.md` `docs/API契约.md` `docs/情绪判定标准.md` `docs/RAG设计.md` `docs/引导体系设计.md`（先放标题骨架）

**Step 1:** 写 root `package.json`

```json
{
  "name": "drawing-mind-explorer",
  "private": true,
  "workspaces": ["client", "server"]
}
```

**Step 2:** 创建 7 份文档骨架（每份只写标题 + 一级目录，内容在后续任务填充）

**Step 3:** Commit

```bash
git init && git add -A && git commit -m "chore: repo scaffold + docs skeleton"
```

---

### Task 2: 项目边界文档

**Model hint:** `auto`

**Files:**
- Modify: `docs/项目边界.md`

**Step 1:** 将本计划「第〇节 项目边界」全文写入（In Scope / Out of Scope / Hard Constraints 三表）

**Step 2:** 顶部加一句变更规则："修改本文件需双方确认，以文档为准"

**Step 3:** Commit `docs: add project boundary`

---

### Task 3: 交互流程文档（⚡ 最高优先级，搭档开工前提）

**Model hint:** `auto`

**Files:**
- Modify: `docs/交互流程.md`

**Step 1:** 按以下结构写完整文档（每页含：用户动作 / 系统行为 / AI 行为 / 输出数据）：

```
P1 欢迎页     — 形象 IP 引导语（纯视觉，无文字问卷）
P2 画板页     — 画笔/颜色/橡皮/清空/完成；无命题，自由画
P3 AI 反馈页  — 描述性反馈："我看到你画了房子、树和一个人"（来自特征提取，非实时）
P4 开放提问   — 仅允许一个开放问题："想再画点什么吗？"；禁止情绪诱导
P5 补充绘画   — 可选，孩子可再画（特征并入判定）
P6 结果页(家长视角) — 情绪倾向 + 置信度 + 知识库依据 + 沟通建议
红线：孩子视角全程无判定结果展示；判定只给家长
```

**Step 2:** 标注每页对应的 API（指向 `API契约.md`）

**Step 3:** 发给搭档确认 → Commit `docs: interaction flow v1`

---

### Task 4: API 契约

**Model hint:** `auto`

**Files:**
- Modify: `docs/API契约.md`

**Step 1:** 定义 3 个端口的请求/响应 schema（含完整 JSON 示例）：

```
POST /api/analyze
  req:  { "imageBase64": "...", "priorFeatures": {...}|null }
  res:  { "features": FeatureJSON, "feedbackText": "我看到你画了…", "followUp": "想再画点什么吗？" }

POST /api/report
  req:  { "features": FeatureJSON }
  res:  { "emotion": "乐观平稳|焦虑倾向|低落倾向|需要关注|信息不足",
          "confidence": 0.0-1.0,
          "evidence": [{ "entryId": "HTP-001", "summary": "…" }],
          "parentAdvice": ["…"] }

GET  /api/health → { "ok": true }
```

**Step 2:** 定义 `FeatureJSON` schema：`elements[]`（房/树/人/太阳/云…）、`colors{dominant[],darkRatio}`、`composition{size,position,pressure}`、`distortions[]`、`erasureMarks`

**Step 3:** Commit `docs: api contract v1`

---

### Task 5: server 脚手架（Express + Vitest）

**Model hint:** `codex`

**Files:**
- Create: `server/package.json`、`server/vitest.config.js`、`server/src/app.js`、`server/src/index.js`
- Test: `server/tests/app.test.js`

**Step 1: 写失败测试**

```js
// server/tests/app.test.js
import request from 'supertest'
import { createApp } from '../src/app.js'

test('GET /api/health returns ok', async () => {
  const res = await request(createApp()).get('/api/health')
  expect(res.status).toBe(200)
  expect(res.body).toEqual({ ok: true })
})
```

**Step 2:** Run `cd server && npx vitest run` → 预期 FAIL（app.js 不存在）

**Step 3: 最小实现**

```js
// server/src/app.js
import express from 'express'
export function createApp() {
  const app = express()
  app.use(express.json({ limit: '15mb' }))
  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  return app
}
// server/src/index.js
import { createApp } from './app.js'
createApp().listen(process.env.PORT || 3001)
```

`server/package.json` 依赖：`express`、`supertest`(dev)、`vitest`(dev)；`"type": "module"`

**Step 4:** Run → 预期 PASS

**Step 5:** Commit `feat(server): express scaffold with health endpoint`

---

### Task 6: LLM Client（多模态 API 封装）

**Model hint:** `codex`

**Files:**
- Create: `server/src/services/llmClient.js`
- Test: `server/tests/llmClient.test.js`

**配置（env，禁止硬编码 key，存 `server/.env` 并 gitignore）：** `LLM_BASE_URL=https://api.openai-next.com/v1`、`LLM_API_KEY`、`LLM_VISION_MODEL=o3-pro`、`LLM_TEXT_MODEL=kimi-k2.5`

**注意：** kimi-k2.5 是 reasoning 模型，输出先在 `reasoning_content`，`max_tokens` 给不足时 `content` 为空 —— client 解析需兼容两字段，且默认 max_tokens ≥ 2000。

**Step 1: 失败测试**（mock fetch，验证请求体含 image_url 且解析 JSON 响应）

```js
import { vi, test, expect } from 'vitest'
import { chatWithImage } from '../src/services/llmClient.js'

test('sends image and parses json content', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"elements":["house"]}' } }] })
  })
  const out = await chatWithImage('base64data', 'extract features')
  expect(out).toEqual({ elements: ['house'] })
  const body = JSON.parse(global.fetch.mock.calls[0][1].body)
  expect(body.messages[0].content[1].image_url.url).toContain('base64data')
})
```

**Step 2:** Run → FAIL（模块不存在）

**Step 3: 实现** — OpenAI 兼容 chat/completions，content 数组 `[{type:'text'},{type:'image_url'}]`，从 content 中提取首个 ```json 块或整体 JSON.parse；失败抛 `LLMParseError`

**Step 4:** Run → PASS

**Step 5:** Commit `feat(server): multimodal llm client`

---

### Task 7: 画作特征提取服务

**Model hint:** `codex`

**Files:**
- Create: `server/src/services/extractFeatures.js`
- Test: `server/tests/extractFeatures.test.js`

**Step 1: 失败测试** — mock llmClient 返回合法/非法特征 JSON 两种情况：合法→返回符合 `FeatureJSON` schema 的对象；非法→抛错并带原始内容

**Step 2:** Run → FAIL

**Step 3: 实现** — prompt 要点（写入 `docs/引导体系设计.md` 交叉引用）：
- "你是儿童绘画观察员。只描述画面客观元素，不做任何心理解读"
- **先输出 rawDescription（自然语言画面描述），再输出特征**——描述原文入库，供人工抽查比对（防幻觉审计，见 RAG设计.md）
- 输出固定 JSON schema（rawDescription/elements/colors/composition/distortions/erasureMarks + **每个维度带 confidence 0-1**）
- 实现 zod-less 手写校验函数 `validateFeatures()`（YAGNI，不引 zod）：schema 校验 + confidence 字段齐全性校验
- **L1→L2 闸门**：丢弃 confidence < 0.5 的特征维度，记日志，不进检索

**Step 4:** Run → PASS

**Step 5:** Commit `feat(server): feature extraction service`

---

### Task 8: 知识库格式 + 校验脚本 + 种子数据

**Model hint:** `codex`

**Files:**
- Create: `knowledge/schema.json`、`knowledge/entries.jsonl`、`knowledge/scripts/validate.mjs`
- Test: `knowledge/scripts/validate.test.mjs`

**条目格式（每行一个 JSON）：**

```json
{
  "id": "HTP-001",
  "featureMatch": { "elements": ["sun"], "colors.darkRatioMin": 0.6 },
  "emotionSignal": "低落倾向",
  "weight": 0.3,
  "source": "《儿童绘画与心理治疗》chapter X / 文献 DOI",
  "note": "太阳涂黑仅作为弱信号，需与其他特征共现"
}
```

**Step 1: 失败测试** — validate 脚本对缺 `id`/`source` 的条目报错退出码 1

**Step 2:** Run → FAIL

**Step 3: 实现** validate.mjs：逐行 JSON.parse，校验必填字段（id、featureMatch、emotionSignal、weight、source），emotionSignal 必须在允许枚举内（对齐 Hard Constraint 1）

**Step 4:** 写 ≥10 条种子数据（房树人经典特征，**每条必须有真实文献出处**，查不到的标 `"source": "TBD"` 且 weight ≤ 0.1 —— 不允许臆造权重）

**Step 5:** Run → PASS → Commit `feat(knowledge): schema, validator, seed entries`

---

### Task 9: 检索服务

**Model hint:** `codex`

**Files:**
- Create: `server/src/services/retrieve.js`
- Test: `server/tests/retrieve.test.js`

**Step 1: 失败测试** — 给定 features + 内存 entries：命中的条目按 weight 降序返回；无命中返回空数组

**Step 2:** Run → FAIL

**Step 3: 实现** — 标签匹配器：遍历 entries，检查 `featureMatch` 各条件（元素包含、darkRatio 阈值、distortion 类型），全部满足为命中。冷启动从 `knowledge/entries.jsonl` 加载，支持注入（便于测试）

**Step 4:** Run → PASS

**Step 5:** Commit `feat(server): tag-match retrieval`

---

### Task 10: 情绪评分 + 置信度（核心判定逻辑，v2 数学审查版）

**Model hint:** `cross-validation`

**Files:**
- Create: `server/src/services/score.js`
- Test: `server/tests/score.test.js`

**算法（严格按 docs/RAG设计.md「评分与置信度 v2.2」实现）：**

1. `w_eff = min(strength × reliability, 0.9)`（LLM 置信度 c 只做 ≥0.5 门控，不入权重）
2. 同 cluster 簇内取 max
3. 簇间 noisy-OR：`E = 1 - Π(1 - w_cluster)`
4. 贝叶斯后验：`posterior = E·prior / (E·prior + fpr·(1-prior))`，prior 低落/焦虑 0.15、乐观 0.60，fpr 0.05
5. 天花板 0.85 **只作用于展示值**，排名用未截断 posterior
6. 判定决策序：提取失败 → 信息不足；零命中 → 乐观平稳(0.60 基率)；负面 ≥0.4 → 抑制乐观；负面判定需 ≥2 独立簇；负面 ∈[0.4,0.7) 或双向 ≥0.5 → 需要关注；最高组 ≥0.7 → 输出；兜底 → 信息不足

**Step 1: 失败测试**（12 个用例）：

```js
// 1. w_eff = s × r（LLM 置信度 c 只做 ≥0.5 门控，不影响数值）
// 2. c 门控：confidence 0.49 的维度被丢弃，0.51 保留
// 3. 同簇去重：dark_color 簇 3 条命中 → 只取 max
// 4. 多簇合成：两个独立簇 noisy-OR > 单簇
// 5. 天花板：展示值 ≤ 0.85；排名用未截断分值（两组原始分均 >0.85 时仍按原始分排序）
// 6. 红线：文案不含疾病词；引用 ID 不存在 → "信息不足"
// 7. 阈值可达性不变量：每组 posterior_score(E=1) ≥ threshold；典型 2 簇场景 ≥ threshold
// 8. 乐观抑制：负面组 ≥ 0.4 → 乐观组从候选集删除（分更高也不输出、不参与排序）
// 9. 最低证据数：负面组仅 1 簇命中且分值 ≥ 0.7 → "需要关注"（规则 4e）
// 10. 零命中分支：特征有效+零命中 → "未见明显风险信号"(0.60)；特征全被丢弃 → "信息不足"
// 11. 多组过阈：低落 0.74 + 焦虑 0.73（双 ≥0.7）→ "需要关注"（规则 4b）；
//     最高-次高差 <0.1 且最高 ≥0.7 → "需要关注"（规则 4c）
// 12. 方向冲突：负面组 ≥0.7 且乐观组 ≥0.5 → "需要关注"（规则 4d）
```

**Step 2:** Run → FAIL

**Step 3: 实现** — 纯函数 `score(matches, features, config)`，config 注入 prior/fpr/threshold/ceiling（可测试）；模块加载时执行阈值可达性断言，不满足抛错拒绝启动

**Step 4:** Run → PASS

**Step 5:** Commit `feat(server): evidence scoring v2 (clustered noisy-OR + bayesian posterior + validity ceiling)`

---

### Task 11: 报告生成 + /api/analyze + /api/report 路由

**Model hint:** `cross-validation`

**Files:**
- Create: `server/src/services/report.js`、`server/src/routes/analyze.js`
- Modify: `server/src/app.js`
- Test: `server/tests/api.test.js`

**Step 1: 失败测试**（supertest 全链路，mock llmClient + 内存知识库）：
- `POST /api/analyze` → 返回 features + 描述性 feedbackText（断言 feedbackText **不含**情绪词/诱导词，对齐红线 4）
- `POST /api/report` → 返回 emotion/confidence/evidence/parentAdvice；evidence 非空且 entryId 存在于知识库

**Step 2:** Run → FAIL

**Step 3: 实现**
- `report.js`：家长建议为模板化文案（按 emotion 查表，如焦虑倾向→"近期多安排轻松的亲子共处时间，避免直接追问"），不调用 LLM 生成建议（可控、不失真）
- `feedbackText` 由 features 模板拼接："我看到你画了 {elements.join('、')}"（同样不调 LLM，防止诱导性措辞）

**Step 4:** Run → PASS

**Step 5:** Commit `feat(server): analyze + report endpoints`

---

### Task 12: 文档收尾 + 联调交接

**Model hint:** `auto`

**Files:**
- Modify: `docs/架构设计.md`（补数据流图：画板→/api/analyze→extract→retrieve→score→/api/report→结果页）
- Modify: `docs/RAG设计.md`、`docs/情绪判定标准.md`、`docs/引导体系设计.md`（从代码实现回填实际逻辑）

**Step 1:** 回填 4 份文档，确保与代码一致（文档是易拉宝/PPT 素材源）

**Step 2:** 把 `docs/交互流程.md` + `docs/API契约.md` 发搭档，约定联调

**Step 3:** Commit `docs: finalize architecture and design docs`

---

## 四、交付物对照

| 交付物 | 来源任务 |
|--------|----------|
| 交互流程文档（发搭档） | Task 3 |
| 易拉宝素材（交互流程 + 判定逻辑框架） | Task 3 + Task 12 文档 |
| PPT 素材 | 全部 docs/ |
| Demo 后端全链路 | Task 5–11 |
| RAG 知识库 v1 | Task 8–9 |
