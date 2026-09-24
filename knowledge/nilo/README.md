# Nilo 共创知识与素材

这里是 Nilo **绘画知识和可执行画法的源码入口**。页面插画属于前端视觉资源，联系图属于生成的预览；它们的路径列在下方。

| 目录 | 内容 | 当前用途 |
| --- | --- | --- |
| [`recipes/`](recipes/index.mjs) | Luma 原创的 90 类、270 种可编辑线稿。`index.mjs` 汇总最初六类与各分类画法；`classics.mjs` 是随后扩充的 12 类；动物、自然、交通建筑、食物、物件、幻想内容各有独立文件 | 默认 v3 和可选的先构思后检索流程；也供前端换画法与语音编辑 |
| [`lessons/drawing-knowledge.json`](lessons/drawing-knowledge.json) | 36 个主题条目、22 组主题添画步骤 | 默认 v3 检索相关卡片；兼容细节规划也使用 |
| [`lessons/drawing-techniques.json`](lessons/drawing-techniques.json) | 6 类绘画技巧与小笔画示意 | 当前仅兼容细节规划会把技巧文字传给模型；默认 v3 尚未使用独立技巧字段 |
| [`references/quickdraw/`](references/quickdraw/drawing-library.json) | 经筛选的 37 类、73 张 Quick, Draw! 笔迹及选集清单 | 默认 v3 最多取四张参考组成临时拼图；原始来源和许可保存在记录中 |
| [`references/legacy/`](references/legacy/examples.json) | 旧版案例、关系示例及人物参考图 | 兼容旧客户端与离线实验；不是默认 v3 的画法目录 |
| [绘画资源说明](drawing-resources.md) | 来源、筛选、运行方式和限制 | 维护资料来源时阅读 |
| [`experiments/`](experiments/先构思后检索试验-2026-09-21.md) | 共创流程对照、结果和失败案例 | 研发评估；试验流程默认关闭 |
| [`previews/`](previews/nilo-recipes.svg) | 画法联系图和试验成图 | 人工查看；不是模型运行时输入 |

`shared/niloRecipes.mjs` 是对前端和后端保持稳定的导入入口，实际画法在本目录的 `recipes/`。新增完整物体画法时，编辑对应分类文件，经 `recipes/index.mjs` 汇总；新增主题课程或参考图时，编辑 `lessons/` 或 `references/quickdraw/`，并保持来源与选集记录同步。服务端读取 JSON 后会缓存，使用普通 `npm start` 时修改资料需重启。

**查看与重建：** [270 种画法联系图](previews/nilo-recipes.svg)由 `server/scripts/render-nilo-recipes.mjs` 从实际绘图路径生成，不是运行时输入。Nilo 在页面上的形象位于 [`frontend/src/assets/images/nilo/`](../../frontend/src/assets/images/nilo/)；可选实验的对照图在 [`knowledge/nilo/previews/`](previews/)。

知识卡、参考图、画法和前端形象承担不同作用。新增资料时应明确写明它供哪个流程使用，不能仅因文件放在此处就视为已接入默认共创。
