# 文献策展与规则对照

[`catalog.json`](catalog.json) 覆盖本地 11 份 PDF。`label` 是现有研究索引中的描述性名称，尚非核对过的正式书目。`bibliographicCitation`、`doi`、`population`、`drawingTask`、`language` 和 `reviewedBy` 目前为空，表示**尚未核实**；不能根据文件名补写。`sha256` 用于发现原件变化，`licenseStatus` 单独记录使用许可状态。`retrievalAllowed` 只是技术候选开关，不替代许可审核或全文审阅。

[`rule-source-map.json`](rule-source-map.json) 为 31 条解读规则逐条留有对照。`candidateDocumentIds` 只根据规则原有的 `source` 字段做保守字面匹配，全部处于 `citation_candidate_unverified`。Guo 综述没有对应到引用 Guo 青少年研究的规则，Buck 二手指南也没有当作 Buck 原始论文。`reviewedRelations` 目前为空。

[`curated-context.json`](curated-context.json) 是单独的**已核对研究背景卡片**集合，由新家长报告读取，展示原文链接与适用局限，不按孩子画面匹配。它与 11 份 PDF 清单不是同一审核状态：出版方全文中指定章节或摘要已核对，不等于本地所有 PDF 已完成全文及许可审核。面向 Nilo 和亲子提问的设计资料与不足见[创作对话证据](../../child-development/evidence.md)，不混入心理规则支持关系。

人工审阅某条关系后，可在对应规则的 `reviewedRelations` 中记录 `documentId`、`assessment`（`supports`、`contradicts`、`context_only` 或 `not_applicable`）、`pdfPage`、短原文摘录、审阅人和日期。先核对研究对象、绘画任务、方向与结论适用范围；相反证据应记录为 `contradicts`，不可悄悄略去。校验脚本要求已审阅关系有页码和原文依据。即使标为 `supports`，也不会自动修改基础报告权重，规则变更须单独审阅、测试。

从仓库根目录运行 `node knowledge/psychology/scripts/validate-literature.mjs` 检查文件清单、SHA-256、规则覆盖和关系字段。若 PDF 内容改变，先确认来源，再更新清单哈希并重新构建索引。
