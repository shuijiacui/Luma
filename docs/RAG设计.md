# RAG 与确定性评分设计

> 当前实现，2026-09-06。这里的 RAG 分为结构化知识检索和可选文献检索两条路径。早期公式讨论见 [历史研究记录](history/RAG设计-早期研究记录.md)，不能将研究草稿的推导当作产品实证结论。

## 两条检索路径

| 路径 | 数据和实现 | 作用 |
| --- | --- | --- |
| 结构化检索 | `knowledge/entries.jsonl`、`constraints.json`；标签匹配与分层调度 | 给定特征后产生基础报告和证据 ID |
| 文献背景 | `docs/references/*.pdf` → Python / LlamaIndex → Chroma | 为文本说明补充研究背景与局限，不参与评分 |

基础报告不依赖向量数据库。可选文献功能已经有实现，不能再将“完全不用向量库”写成整个项目的约束。

## 结构化数据与门控

每条知识包含 id、tier、featureMatch、emotionSignal、cluster、strength、reliability、source 与 note。当前 31 条，分层数量为 26 / 3 / 2。字段范围、层级强度上限和来源约束由 `knowledge/scripts/validate.mjs` 校验，修改知识后必须重跑。

视觉模型先输出画面描述与特征。schema 验证后，逐维 confidence < 0.5 的维度不参与匹配；confidence 是模型自报值，未经过样本校准，不作为权重乘数。`rawDescription` 保存以供核对，但不证明描述本身正确。

匹配器对一条规则的全部条件做 AND。元素和异常特征检查包含关系；主色条件、深色比例、构图枚举和涂改阈值按字段实现。旧规则 weak 笔触值兼容 light。数字画板排除依赖笔压和涂改次数的规则；出生日期由家长设置，影响指定条目的年龄门控。

## 评分计算

给定特征、知识库和配置，评分为纯代码：

```text
w_entry = min(strength × reliability, 0.9)
w_cluster = max(同组同簇各条目权重)
E = 1 − ∏(1 − w_cluster)
S = E × prior / (E × prior + fpr × (1 − prior))
展示值 = min(S, ceiling)
```

`strength`、`reliability`、`prior`、`fpr` 都是当前知识策展和评分配置。E 不是测得的似然，S 不是经过校准的贝叶斯后验或医学概率。参数命名不等于具有相应的实测统计含义。默认 prior 为负向 0.15、积极 0.60，fpr 为 0.05，主阈值为 0.7，展示上限为 0.85。

簇内 max 减少重复计数，不能证明不同簇独立。`crossClusterDiscount` 是预留参数，当前没有生效算法。仅 L2/L3 的组有 E 上限 0.6；它限制的是合成证据，不能直接等同于 S 上限，也不能宣称一定只输出信息不足。

## 决策顺序

1. 全部维度为空 → 信息不足，分值 0。
2. 引用全部无效 → 信息不足；有效特征零命中 → 未见明显风险信号，默认分值 0.60、空证据。
3. 任一负向组 S ≥ 0.4 → 积极组移出候选。
4. 弱负向信号、多个强负向组、候选差距过小、方向冲突、单簇强负向信号 → 需要关注。
5. 主候选 S ≥ 0.7、差距满足要求，且负向至少两个簇 → 对应倾向。
6. 其余 → 信息不足；输出证据与文案通过条目 ID/红线校验。

具体条件与 reason 值以 `server/src/services/score.js` 及其测试为准；不能用“分值低于 0.7 一律信息不足”代替完整决策序。排名使用未截断分值，展示才使用 ceiling。零命中是独立分支，不代表积极证据。

`assertConfig` 检查负向分数阈值在 E=1 时的理论可达性。这只是数学约束，不验证真实人群表现、漏报率或误报率。

## 可选文献增强

PDF 索引保存来源文件名和 SHA-256，使用 300 字符配置的 chunk size 与 60 overlap（实际分块遵从 LlamaIndex tokenizer）。检索 Top-5，代码过滤相似度低于 0.40 的片段。相似度表示检索相关性，不能当作心理参考分值。

Node 调用 Python 检索，再由文本模型筛选；服务端检查输出引用文件属于候选集合，过滤后标记 `reference_only`。这些检查不等于逐句事实验证，仍需人工复核来源。构建索引会重建文献 collection，须在可重建的文献索引上执行。

embedding 使用独立的 RAG_EMBED_* 环境变量；视觉/文本使用 LLM_*。Python 默认选择 Windows 的 `.rag-venv/Scripts/python.exe` 或其他系统的 `.rag-venv/bin/python`，可由 RAG_PYTHON 覆盖。配置步骤见 [rag/README](../rag/README.md)。

## 报告边界

基础报告先生成，随后可选 narrative、证据通俗化、文献背景与联网建议；所有增强共享 REPORT_BUDGET_MS，超时取消并保留基础报告。增强不修改基础评分，也不自动写回知识库。

审计保存知识库版本、命中、冲突、丢弃和评分 reason。研究引用、工程回归通过与临床有效性是不同概念；README 的优势仅描述已实现的工程与体验能力。
