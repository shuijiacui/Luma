# Luma — 儿童绘画心理探索产品

儿童绘画 + AI 交互式心理探索。只输出**情绪预警 + 置信度**，不做心理疾病诊断；
AI 引导极度克制（只做镜子描述画面，不做教练引导情绪）。

## 仓库结构

```
├── frontend/    # React + TS + Vite + Tailwind（画板 / 儿童创作空间 / 家长洞察页）
├── server/      # Express 判定服务（特征提取 → RAG 检索 → 评分 → 报告）
├── knowledge/   # 心理学知识库（entries.jsonl，31 条，全部带文献出处）+ 校验脚本
└── docs/        # 产品边界 / 交互流程 / API 契约 / RAG 设计 / 联调说明等
```

## 本地运行（前后端联通）

```bash
# 1. 判定服务（http://localhost:3001）
cd server
cp .env.example .env   # 填入真实 LLM_API_KEY（已 gitignore，禁止提交）
npm install
npm start

# 2. 前端（http://localhost:5173，/api 已由 vite proxy 转发到 3001）
cd frontend
npm install
npm run dev
```

## 判定链路

画作 → o3-pro 视觉模型提取**结构化特征 JSON**（只描述不解读，唯一 LLM 入口）
→ 知识库标签匹配检索 → 簇内 max + 簇间 noisy-OR + Bayesian 校准评分
→ 情绪倾向 + 置信度（0.85 效度天花板）+ 文献条目溯源 + 家长沟通建议。

详见 [docs/架构设计.md](docs/架构设计.md)、[docs/RAG设计.md](docs/RAG设计.md)。

## 测试

```bash
cd server && npm test          # 39 个单测（含评分决策序 12 用例）
node knowledge/scripts/validate.mjs   # 知识库校验（提交前必跑）
cd frontend && npm run build   # 类型检查 + 构建
```

## 红线

- 输出文案绝不出现疾病名，只用情绪倾向词（命中红线词 → 自动降级"信息不足"）
- 每条判定必须引用知识库条目 ID（可追溯）
- 置信度永远展示；孩子视角全程不展示判定结果（只给家长）
- `feedbackText` / `parentAdvice` 为后端模板文案，前端不改写
