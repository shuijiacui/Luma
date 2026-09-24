# 历史心理规则档案

这里保留早期 HTP 等心理特征匹配的 31 条结构化数据及其审计，供理解**已保存的历史旧版报告**和复现遗留测试。新报告 `observation-v1` 不读取这些规则，也不计算心理倾向分值；当前路径见[心理知识资产总览](../README.md)。

| 文件 | 用途 |
| --- | --- |
| `entries.jsonl` | L1 26 条、L2 3 条、L3 2 条，含匹配特征、簇、权重和原始来源线索 |
| `constraints.json` | 历史年龄门控、冲突和输出配置 |
| `dispatch.config.json` | 历史分层调度配置；其中一些字段仅为提案，不能视为已执行逻辑 |
| `audit.json` | 逐条退役、数字画布测量与来源核查状态 |

遗留代码在 `server/src/services/retrieve.js`、`kbDispatcher.js`、`score.js`，测试覆盖其输入、冲突与公式。旧路径按匹配条件筛选规则、处理年龄/来源限制和冲突，再做簇内去重与分值组合；给定相同特征和配置可复现输出。参数 `strength`、`reliability`、`prior`、`fpr` 并非 Luma 在 5–12 岁自由数字绘画中的实测概率，簇独立性、视觉识别和标签效度也未由程序验证。历史报告的分值不能解释为儿童心理健康概率。

规则和本地 PDF 的候选对应见 [`../literature/rule-source-map.json`](../literature/rule-source-map.json)。候选匹配不代表原文支持；目前没有一条旧规则获准重新进入新家长报告。维护时运行 `node knowledge/scripts/validate.mjs` 和相关后端测试，旧报告不会因文件改动自动重算。
