# API 契约

> 前后端联调唯一依据。所有请求/响应均为 JSON。base: `http://localhost:3001`

## 通用类型

### FeatureJSON（画作结构化特征）

```json
{
  "rawDescription": "画面中央有一座小房子，旁边一棵树，天空中有被涂黑的太阳……",
  "elements": ["house", "tree", "person", "sun"],
  "colors": {
    "dominant": ["blue", "black"],
    "darkRatio": 0.35
  },
  "composition": {
    "size": "small | normal | large",
    "position": "center | corner | edge",
    "pressure": "light | normal | heavy"
  },
  "distortions": ["bent_tree", "blackened_sun"],
  "erasureMarks": 2,
  "confidence": {
    "elements": 0.9,
    "colors": 0.85,
    "composition": 0.8,
    "distortions": 0.6,
    "erasureMarks": 0.5
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `rawDescription` | string | LLM 必须先输出的画面自然语言描述原文（防幻觉审计依据，供人工抽查比对，见 RAG设计.md「特征可信度过滤」） |
| `elements` | string[] | 画面元素，英文枚举（house/tree/person/sun/cloud/rain/flower/animal/...） |
| `colors.dominant` | string[] | 主色调 |
| `colors.darkRatio` | number 0-1 | 深色占比 |
| `composition.size` | enum | 画面主体大小 |
| `composition.position` | enum | 主体位置 |
| `composition.pressure` | enum | 笔触压力 |
| `distortions` | string[] | 扭曲/异常特征 |
| `erasureMarks` | number | 明显涂改次数 |
| `confidence` | object | **必填**。每个特征维度的提取置信度 0-1，键为维度名（elements/colors/composition/distortions/erasureMarks）。server 端丢弃 < 0.5 的维度，不进入检索 |

### Emotion 枚举

`乐观平稳 | 未见明显风险信号 | 焦虑倾向 | 低落倾向 | 需要关注 | 信息不足`

（红线：禁止出现任何疾病名。"未见明显风险信号"= 知识库零命中（missing evidence），与"乐观平稳"（positive evidence）严格区分）

---

## POST /api/analyze

画作 → 特征提取 + 描述性反馈。

**Request**

```json
{
  "imageBase64": "iVBORw0KGgo...",
  "priorFeatures": null
}
```

- `imageBase64`: string，必填，PNG/JPEG base64（不含 data: 前缀）
- `priorFeatures`: FeatureJSON | null，可选，补充绘画时传入上一轮特征用于合并

**Response 200**

```json
{
  "features": { "rawDescription": "画面中央有一座小房子……", "elements": ["house", "tree"], "colors": {"dominant": ["green"], "darkRatio": 0.1}, "composition": {"size": "normal", "position": "center", "pressure": "normal"}, "distortions": [], "erasureMarks": 0, "confidence": {"elements": 0.9, "colors": 0.85, "composition": 0.8, "distortions": 0.4, "erasureMarks": 0.3} },
  "feedbackText": "我看到你画了房子、树",
  "followUp": "想再画点什么吗？"
}
```

- `feedbackText`: 由 features 模板拼接，**不调 LLM**（防诱导措辞），只含客观元素描述
- `followUp`: 固定文案 "想再画点什么吗？"
- 注：返回的 features 中，confidence < 0.5 的维度已被 server 丢弃（不进入后续判定）

**Response 400** — 缺少 imageBase64 或格式非法：`{ "error": "imageBase64 required" }`
**Response 502** — LLM 解析失败：`{ "error": "feature_extraction_failed" }`

---

## POST /api/report

特征 → 情绪判定报告（家长视角）。

**Request**

```json
{ "features": { "...": "FeatureJSON" } }
```

**Response 200（高置信）**

```json
{
  "emotion": "低落倾向",
  "confidence": 0.82,
  "evidence": [
    { "entryId": "HTP-001", "summary": "太阳涂黑仅作为弱信号，需与其他特征共现" }
  ],
  "parentAdvice": ["近期多安排轻松的亲子共处时间", "避免直接追问，观察为主"]
}
```

**Response 200（低置信）**

```json
{
  "emotion": "信息不足",
  "confidence": 0.45,
  "evidence": [],
  "parentAdvice": ["本次画面信息不足，建议继续观察"]
}
```

- `confidence`: number 0-1，展示值经 0.85 天花板截断。除"信息不足"（恒 < 0.7）与"未见明显风险信号"（恒 = 0.60 基率，missing evidence 语义）外，输出态均 ≥ 0.7
- `evidence`: 命中的知识库条目，entryId 必须存在于 knowledge/entries.jsonl
- `parentAdvice`: 模板化建议，**非干预方案**

**Response 400** — 缺少 features：`{ "error": "features required" }`

---

## GET /api/health

**Response 200**: `{ "ok": true }`
