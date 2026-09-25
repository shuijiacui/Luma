# 素材审阅与下架

从项目根目录运行：

```powershell
node server/scripts/review-nilo-library.mjs
```

打开 `http://127.0.0.1:4177`。脚本会先重新生成 `knowledge/nilo/previews/nilo-library.html`，再提供本机审阅页。设置 `NILO_REVIEW_PORT` 可更换端口；服务只监听本机回环地址。

本批已完成并登记 **334 张 PNG，覆盖 167 个具体题材，每个题材初级与中级各一张**。[expansion-status.json](illustrations/expansion-status.json)确认 334/334，缺项为 0。加上此前保留的 34 张 PNG，当前登记素材为 **368 张 PNG + 330 份 SVG = 698 份**，归档的 178 份旧线稿单独查看。后续审核下架可能减少实际可选数量；仅已生成、检查并登记的素材会出现为可选图片。

PNG 均是通过内置 image_gen 独立生成的原创位图，完整计划见 [expansion-plan.json](illustrations/expansion-plan.json)，每张最终实际 prompt、原文件路径和检查标记见 [expansion-results](illustrations/expansion-results/)。2026-09-26，用户明确批准本批全部 334 张 PNG，现已统一设为“保留”并启用，其他审核决定不变；详见 [批量通过记录](curation-audits/2026-09-26-png-expansion-approved.json)。今后仍可逐张下架或撤销审核。

每张线条图案和绘本插画都有 **保留**、**下架** 按钮，审核后可 **撤销审核，恢复待审核**。点击图像可放大查看。支持 **初级、中级、细节丰富**，以及类型、画风、表现形式、审核状态和文本筛选。线稿统一归为初级；插画按自身难度分类，未审核的新插画排在前面。类型分为动物、人物、建筑、植物、风景与天空、交通工具、食物、生活物件、想象伙伴。成人审核偏好不会当作孩子自己的风格偏好。

儿童端“换一个”按猫、狗、学校等具体题材提供真实素材预览，默认当前题材，可搜索或明确选择其他题材。孩子看到的是“线条少一些”“细节多一些”等措辞，空白画布优先初级，不需要理解专业风格名称。孩子实际点选并成功替换后才记录 subject、materialId、style、difficulty、chosenAt；按真实儿童账号在当前浏览器隔离保存最近 32 条，访客只保留当前会话。模型推荐、浏览、清除与成人审核不计入记录；记录仅用于偏好排序，不推断孩子能力。

项目保存模式会立即把选择写入 `knowledge/nilo/curation.json`。下架素材从 Nilo 后续选材中排除；按钮仅修改审核决定，已有画作不会被修改。用户确认的批次清理会另外移除运行素材记录，并保留历史作品所需的身份信息。未审核素材保持可用。服务器在下一次绘画请求读取最新审核记录；已构建的离线前端需要重新构建才能携带新的初始记录。

直接双击 HTML 仍可审阅，但页面会明确显示 **浏览器暂存模式**。这时选择保存在该浏览器的本地存储，尚未写入项目。点击 **导出审核记录**，再到本机审阅服务页面 **导入审核记录**。不同浏览器和 `file://`、HTTP 页面之间不会自动共享暂存。导入会合并记录；同一素材以导入文件为准，其他已有决定保留。导出文件仅包含素材 ID 与审核状态，不包含儿童数据。

素材范围默认是“当前素材”。“已归档线稿”包含 178 份用户明确保留的人物、建筑旧线稿，仅供旧作品兼容。卡片上的“保留归档”不会重新启用推荐；人物与建筑的新选材使用 PNG。累计按审核删除的 794 份运行记录不再出现在卡片中，历史导入也不会重新生成它们；最新范围见 [2026-09-25 22:49 清理审计](curation-audits/2026-09-25-2249.md)。

持久化结构：

```json
{
  "version": 1,
  "decisions": {
    "school-0": "reject",
    "illustration-school": "keep"
  }
}
```

`shared/niloCuration.mjs` 提供统一的可用性判断。`server/src/services/niloCurationStore.js` 在保存前验证素材 ID 与状态，采用临时文件加重命名写入，避免半个 JSON 文件。审阅服务不提供通用文件读写接口，只允许保存已知素材的审核记录及读取图库中列出的插画。

验证命令：

```powershell
cd server
npx vitest run tests/niloCuration.test.js
cd ../frontend
npx vitest run tests/nilo-library-review.test.ts
```
