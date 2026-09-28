# 场景测试素材入库

收录本次开放场景升级测试中实际生成并保存在本机的 PNG，按完整像素去重：81 张素材、129 条来源记录。没有把空白失败画布、重复预览截图或孩子原画合并进公共素材。倒置图片按实际显示方向保存，原始来源与旋转记录保留。

- 注册表：`test-scenes.json`，集合 `scene-tests-2026-09-28`。
- 来源、像素哈希、初始审核结论：`test-scenes-provenance.json`。
- 图片：`frontend/public/nilo-illustrations/illustration-scene-*.png`。
- 投影：`frontend/public/nilo-tracing/illustration-scene-*.json`。沿用密度判断，细节过密使用灰底。
- 14 张有与原记录哈希匹配的独立看图通过结论，设为 `keep`；67 张候选或未充分复核图片设为 `reject`，只保留供审阅，不参与自动推荐。此状态不是删除。

运行 `node server/scripts/review-nilo-library.mjs`，打开本机素材审阅室，搜索 `illustration-scene-` 即可查看本批素材。在“已下架”筛选中检查暂不使用的图片，包括出现重复瓶子的候选；确实适合复用时点“保留”。素材投影已预先生成，审核通过后不需要重新生成图片。

本次操作没有调用模型或生图 API。这里只完成已有图片入库，尚未把复杂场景规划从“优先生成”改为“优先匹配整幅场景素材”，不能将入库数量等同于线上 API 节省量。所有素材仍在本地工作区，尚未部署。

离线重新整理（不会重新生图，已有人工审核决定会保留）：

```powershell
node server/scripts/import-nilo-scene-assets.mjs
node server/scripts/build-nilo-tracing-guides.mjs --collection=scene-tests-2026-09-28
node server/scripts/render-nilo-studio.mjs
```
