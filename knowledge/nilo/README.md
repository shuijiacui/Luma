# Nilo 共创知识与素材

2026-09-26，本批 **334 张新增 PNG 已由用户全部审核通过并启用**，每个题材的初级、中级插画均可选择。详见 [批量通过记录](curation-audits/2026-09-26-png-expansion-approved.json)。

这里是 Nilo 绘画知识和共创素材的源码入口。本批已完成并登记 **334 幅原创 PNG：167 个具体题材各一张初级、一张中级参考图**，[登记状态](illustrations/expansion-status.json)确认 334/334，缺项为 0。加上此前保留的 34 幅 PNG，共 **368 幅 PNG、330 份活动 SVG，合计 698 份当前素材**；后续审核下架可能减少实际可选数量。另有 **178 份已保留的人物、建筑线稿归档**，仅兼容已有作品；**794 份审核拒绝项已从运行素材记录删除**。

PNG 通过内置 image_gen 逐张独立生成，保留原始位图与透明通道，不将 SVG 转成图片充数，也不直接复制出版绘本。完整计划在 [expansion-plan.json](illustrations/expansion-plan.json)，逐张最终实际提示词与原文件路径在 [expansion-results](illustrations/expansion-results/)。已有 34 幅包括 30 幅中级人物、建筑素材和 4 幅细节较丰富的插画；新素材按实际检查、登记和审核状态提供。

| 入口 | 内容与用途 |
| --- | --- |
| [活动线稿记录](recipes/curated-recipes.json) | 330 份已保留线稿，统一为初级。描摹轮廓、儿童笔迹和编辑操作保持独立。 |
| [兼容线稿记录](recipes/legacy-recipes.json) | 178 份用户明确保留的人物、建筑相关线稿，仅用于旧作品兼容。保留状态仍是 keep，归档项不会重新推荐。 |
| [PNG 插画目录](illustrations/index.mjs) | 原创 image_gen 独立位图；[图片文件](../../frontend/public/nilo-illustrations/)保留原始 PNG 与透明通道，不转换为 SVG。支持缩放、移动和清除。仅注册已实际生成并检查的图片。 |
| [素材审阅室](previews/nilo-library.html) | 默认展示当前素材；支持初级、中级、细节丰富，以及类型、画风、表现形式、审核状态筛选和大图查看。每张新插画均可保留或下架。 |
| [审核使用说明](material-curation.md) | 审核决定写入 [curation.json](curation.json)。直接打开 HTML 为浏览器暂存模式；本机审阅服务可直接保存到项目。 |
| [最新清理审计](curation-audits/2026-09-25-2249.md) | 该次清理导出共 542 份保留、794 份拒绝；新增删除 150 份 SVG，当时的 34 幅 PNG 全部保留。含完整 SHA-256 与逐条核验结果。[首次清理审计](curation-cleanup-2026-09-25.md)继续保留。 |
| [已移出素材的身份记录](retired-materials.json) | 只记录 ID、题材、名称等信息，支持历史草稿辨认；已删除项不含绘画几何。 |
| [主题课程](lessons/drawing-knowledge.json) | 36 个主题条目、22 组主题添画步骤；供默认 v3 检索相关卡片，也供兼容细节规划使用。 |
| [绘画技巧](lessons/drawing-techniques.json) | 6 类技巧与小笔画示意；兼容细节规划使用，默认 v3 没有独立技巧字段。 |
| [Quick, Draw! 参考](references/quickdraw/drawing-library.json) | 37 类、73 张经筛选笔迹，保留来源与许可；默认 v3 最多取 4 张参考拼图。 |
| [旧版案例](references/legacy/examples.json) | 兼容旧客户端与离线实验，不是默认 v3 的素材目录。 |
| [绘本与教学参考](children-drawing-guides.md) | 参考来源与造型原则，不直接复制第三方插画。 |
| [绘画资源沿革](drawing-resources.md) / [试验记录](experiments/先构思后检索试验-2026-09-21.md) | 历史数量、资料来源、对照结果和失败案例。 |

## 儿童选材与偏好

“换一个”打开看图选择面板，按猫、狗、学校等具体题材组织；默认当前题材，可搜索和明确点击切换其他题材。卡片展示真实 SVG 或 PNG，以“线条少一些”“细节多一些”“仔细观察画”描述差异，不显示专业风格名称。选择只更换参考图，儿童笔迹保持独立；关闭面板不改当前参考。空白画布优先初级素材。

只记录孩子实际点选且成功替换的素材，记录字段为 subject、materialId、style、difficulty、chosenAt。按真实儿童账号在当前浏览器隔离保存最近 **32 条**，访客只保留当前会话。模型自动推荐、浏览、清除和成人审核不算孩子选择。记录用于同题材候选排序，保留所有可用画法，不推断孩子的能力或教学等级。

## 审阅与归档

从项目根目录运行 node server/scripts/review-nilo-library.mjs，打开 [本机素材审阅室](http://127.0.0.1:4177)。保留、下架与撤销审核会保存到项目；导入记录采用合并，不清空其他已审核素材。下架项不再用于 Nilo 后续新选材，已有画作保留。

素材范围默认是“当前素材”。切换“已归档线稿”可查看 178 份兼容素材；卡片明确标注“仅供旧作品兼容”。**对归档项点击“保留归档”，只保存审核偏好，不会重新把人物、建筑 SVG 放回推荐。** 新人物、建筑继续使用 PNG。

直接打开 HTML 时，页面明确显示“浏览器暂存模式”。选择仅保存在该浏览器，尚未影响项目；需要导出后到本机审阅服务导入。不同浏览器及 file:// 与 HTTP 页面不自动共享暂存。

## 维护入口与重建

shared/niloRecipes.mjs 和 shared/niloIllustrations.mjs 为稳定导入入口。线稿运行数据来自 curated-recipes.json 与 legacy-recipes.json；原始生成器及 generator-index.archived.mjs 仅作开发归档，运行入口不再引用它们。新增 PNG 须放入前端公共资源目录并注册可信 ID、题材、难度和观察提示。

在 server 目录运行 node scripts/render-nilo-studio.mjs 重建 HTML；node scripts/render-nilo-recipes.mjs 重建 [活动线稿联系图](previews/nilo-recipes.svg)。加 --cute 重建 [可爱线稿预览](previews/nilo-recipes-cute.svg)与[灰色虚线预览](previews/nilo-recipes-cute-tracing.svg)；加 --studio 重建仍在使用的 studio 线稿分页 PNG。历史 SVG 归档不会混入默认生成结果。

素材审核在后续绘画请求重新读取；一般知识卡 JSON 和素材目录由服务进程缓存，修改后需重启。已构建的离线前端需重新构建才能携带新素材和初始审核记录。图库只供审阅，不是模型的识别证据或孩子端风格菜单。
