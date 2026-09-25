# 2026-09-25 素材审核落地记录

审核来源是项目根目录的 nilo-curation.json，与 Downloads 同名导出完全一致，SHA-256：

483101b5dd7777fba1f036ecee5a00a6bbf4eb6650d76d0e0d4ccdd56aa24265

原 1306 份素材中，661 份保留、644 份拒绝、1 份未审核（microscope-2）。已有 4 幅 PNG 全部保留。审核原文件保持原样，并完整导入 knowledge/nilo/curation.json。

## 生效结果

- 644 份拒绝线稿从运行素材记录中删除，getDrawingRecipe 不再返回这些 ID。无几何的身份记录保存在 retired-materials.json，帮助已有草稿识别自己的题材。
- 178 份明确保留的人物、建筑相关线稿仅用于旧作品兼容，保留状态仍为 keep。它们不进入新推荐，图库默认隐藏，切换“已归档线稿”可查看。
- 480 份线稿继续用于新推荐，其中 479 份已保留，1 份未审核。
- 新人物、建筑素材由独立 PNG 插画目录提供；其新增数量由 illustrations/index.mjs 决定，不受本次历史统计限制。

归档范围包括 studio 的 people、architecture，以及小房子、城堡、帐篷、灯塔、风车屋、宇航员、童话小屋等明确的人物或建筑主体。未把关联标签包含 character 的风筝等物件误当人物。178 份中，有 175 份来自原人物/建筑分类，另有 astronaut-1、teapotcottage-0、teapotcottage-1。

## 数据和兼容

recipes/curated-recipes.json 是活动线稿记录，recipes/legacy-recipes.json 是兼容记录。迁移时把全部 658 份留存记录与原生成结果逐条按完整 JSON 核对，几何和元数据未改变。recipes/index.mjs 是新的稳定导出入口。

原始生成器源码与 generator-index.archived.mjs 保留供开发恢复，运行入口已不再引用它们。此处删除的是运行素材记录，不声称从开发源码历史中擦除所有原始绘图构造。

历史作品携带自己的 sketch 和笔迹；旧 ID 通过无几何身份元数据继续辨认。归档状态不会被误改为用户拒绝状态。新素材选择仍应用审核结果，模型直接返回已删除/归档 ID 也不能绕过检查。

审阅图库默认只展示当前素材，包含归档的总记录数不等于可推荐数量。旧导出中的已删除 ID 可继续导入审核记录，但不会重新生成素材。完整来源、删除 ID、归档 ID 与分类统计另存于本次工作目录的 .task-staging/curation/audit.json。

## 后续审核

本页记录首次清理。最新审核又移出 150 份线稿，累计 794 份；详见 [22:49 审核清理记录](curation-audits/2026-09-25-2249.md)。其中 34 幅既有 PNG 与 178 份兼容归档全部保留。
