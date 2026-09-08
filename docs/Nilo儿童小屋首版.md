> 视觉设计历史：文中的验收描述属于当时记录，不是本轮真实设备验收。当前功能见 [交互流程](交互流程.md)；套餐页已改为开放体验与后续计划说明。

# Nilo 儿童小屋 · 首版

## 体验入口

启动 `frontend` 的开发服务，进入 `/auth?role=child&mode=login`，选择“先去逛一逛”，即可到达 `/child/demo`。

- 原儿童首页替换为水彩小屋场景，复用 `bg-child.png`。
- 大门位于左侧，Nilo 位于右侧；欢迎文字写在浅木色牌子上，配合淡木纹、轻微不规则边缘和小叶枝融入背景。
- 提灯 Nilo 根据现有 `auth-child.png` 派生，头、鼻子、手、肚子和尾巴分别可点击；响应包含不同的整体形变、粒子和短气泡。
- 点击下方小手提示可以显示交互位置；顶部 `?` 可打开三步引导。
- 声音默认关闭，开启后使用本地 Web Audio 合成短音效，不调用语音或模型服务。
- 圆拱门由 CSS/SVG 绘制，点击一次后打开，约 1.1 秒进入 `/child/create`。减少动态效果模式使用简短淡出。
- 回小屋再进入画布时保留笔迹、撤销历史、画笔设置及已完成的本轮分析状态。草稿仅保存在内存中，刷新、退出或切换账号会清除。
- 将原“保存”按钮准确标为“下载”，同步移除虚构的长期记忆提示和首页示例作品藤蔓。
- 儿童页面与儿童认证页允许竖屏使用。其他页面沿用原横屏提示。

## 素材与实现边界

角色素材：`frontend/src/assets/images/nilo-companion-v1.png`。

使用内置 imagegen 工具，以现有提灯 Nilo 为参考制作。透明背景请求的两次结果都包含不透明棋盘格，因此最后改为白底素材，通过 CSS 的 multiply 混合融入现有浅色背景。源图未覆盖。

这是单张角色图的互动版本，不是骨骼或逐帧角色动画；手臂和尾巴尚未独立绑定，表情没有单独替换。后续若提供分层素材，可在 `NiloCharacter` 内升级动画而保留交互接口。

初次素材提示词：

> Use case: background-extraction. Project asset for an interactive children's web app. Edit target: the supplied illustration. Extract ONLY the existing full-body Nilo otter holding the star lantern on the right. Preserve exactly its warm watercolor/gouache textured brown fur, face and expression, turquoise patterned scarf, cross-body satchel, upright pose, raised paw holding lantern, other paw on belly, feet and long tail extending right. Remove ALL background scenery, paper, water, plants, stars, ground, and shadows outside character. Output one full-body character sprite on an actual transparent alpha background, no white backdrop, no checkerboard painted into image, no text. Keep all lantern details and its soft warm light; all body parts fully visible. Place character centered in a square 1024x1024 canvas with about 5 percent transparent padding around the entire silhouette. This is the same Nilo character, not a redesign.

最终素材提示词（以前一步角色图为编辑输入）：

> Change only the background of this image: remove the gray checkerboard and replace it with a SOLID PURE WHITE (#FFFFFF) background. No checkerboard. Opaque white, not transparency. Keep the exact same otter character and lantern unchanged, same framing and size. The area between feet and inside the lantern handle must also be solid white. No ground, no cast shadow, no additional elements. This is a character product cutout against a clean white studio background.

## 主要文件

- `frontend/src/features/child/pages/ChildHomePage.tsx`：页面布局与导航。
- `frontend/src/features/child/components/NiloCharacter.tsx`：五个部位、响应动画与提示。
- `frontend/src/features/child/components/CreationDoor.tsx`：大门。
- `frontend/src/features/child/styles/child-home.css`：场景、门与响应式样式。
- `frontend/src/features/child/hooks/useNiloSound.ts`：本地音效。
- `frontend/src/features/child/draft.ts`：会话内草稿。
- `DrawingCanvas.tsx`：笔迹恢复与异步解码保护，保留撤销历史。

## 验证

`npm run build` 通过。`npm run lint` 无错误，保留项目原有 10 条警告；构建提示主 JS 包大于 500 kB。

本地 Edge 已检查桌面、平板、手机竖屏与横屏画面，验证 320px 宽度下五个部位触摸、键盘开门、减少动态效果、快速重复开门、草稿往返、橡皮及撤销、转屏保留笔迹和退出清理草稿。没有浏览器运行异常。没有调用真实画作分析服务，也未验证真实设备的音色和性能。

本次本地检查脚本及截图放在 `.tmp/nilo-preview/`，该目录已忽略，不纳入发布内容。
