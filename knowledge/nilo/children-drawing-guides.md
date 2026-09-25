# Nilo 线稿的绘本与教学参考

查阅日期：2026-09-25。以下资料用于观察与造型方法参考；项目中的可执行路径为原创，没有描摹、打包或分发第三方绘本插图。参考资料不等于课程认证，也不证明描摹会带来特定学习效果。

| 资料 | 本次采用的原则 | 对应实现 |
| --- | --- | --- |
| [Quentin Blake：How I draw](https://quentinblake.com/about-drawing/how-i-draw) | 先通过草图确定人物与物件的位置、动作，再组织最终线条；插画方法需要适合故事的气氛 | 人物的手、书本、衣服、座椅分别安排前后关系；优先读得出的姿态，而非给同一人形加符号 |
| [V&A：Beatrix Potter 藏品](https://www.vam.ac.uk/articles/leslie-linder-and-the-beatrix-potter-collection) | 从观察和对象结构出发，把自然对象组织为有叙事感的插画 | 以整体轮廓和结构为先，植物保留叶片与茎的连接，衣着和道具服务于角色 |
| [Rizzoli：Miroslav Šašek《This is Paris》](https://www.rizzoliusa.com/book/9780789346339/)；[慕尼黑建筑画廊的原作展](https://www.architekturgalerie-muenchen.de/en/current/detail/news/detail/News/this-is-architecture.html) | 关注城市建筑的轮廓、开口节奏、尺度和日常生活细节 | 学校的中轴与侧翼、书店的上下楼层和雨篷、钟楼与拱桥各用自己的构造，不共享单一盒子 |
| [美国国家美术馆：Drawing Everyday Objects](https://www.nga.gov/educational-resources/lesson-drawing-everyday-objects) | 观察身边物件，整体形状与轮廓先行；线条可以描述体积 | 增加家具、乐器、工具、器皿；观察线描以结构和稀疏材质线表达体积 |
| [英国国家肖像馆：Analysing portraits](https://www.npg.org.uk/schools-hub/gallery-resource-analysing-portraits) | 通过姿态、表情、衣着、物件和环境观察人物 | 人物题材包含家庭成员、工作和活动，身份线索来自动作和道具；不以性别固定职业 |
| [大都会艺术博物馆家庭指南：Make Your Mark](https://www.metmuseum.org/-/media/Files/Learn/Family%20Map%20and%20Guides/Make%20Your%20Mark.pdf) | 用线条、形状和观察练习做速写，不要求每张画都完整或完美 | 底图保留空白，孩子可只描一部分、改变细节和自由续画 |
| [Art Projects for Kids：One-point perspective city](https://artprojectsforkids.org/draw-a-city-with-one-point-perspective/) | 用清楚的墙面、开口和一致的透视关系理解建筑 | 建筑转角的屋檐与墙面需要共用连接点，窗户应落在所在墙面 |

## 内部画法与儿童交互

`storybook` 使用圆润的轮廓与较大的五官间距；`illustrated` 使用有叙事性的姿态、衣着、分层建筑和植物细节；`realistic` 在这里指观察线描，强调自然比例、轮廓和结构，不代表照片级绘画。两类较细画法均保留，由 Nilo 根据现有画面自动选择。

孩子不用知道这些名称。正常请求“画一座学校”已经完整；“简单一点”“细节多一点”“像真的一样”是可识别的日常调整说法。有画面时仍走现有视觉观察与规划，不增加一轮风格分类模型调用。已有描摹底图的简单调整保持题材、姿势和摆放中心；儿童笔迹保持独立。

## 审阅与数量

当前 1302 个可执行画法、274 个题材，包括 288 个人物、288 个建筑、96 个植物、96 个自然风景、192 个生活物件、24 个新可爱幻想画法，以及扩充前的 318 个画法。总数为原来的约 4.09 倍。可爱 / 插画 / 观察线描分别为 392 / 320 / 320 个，其余 270 个沿用原有简笔画标签。

使用实际生产采样器导出 [全量审阅图库](previews/nilo-library.html)，可检索题材、查看内部标签并切换灰色虚线。它是成人审阅页面，不是儿童选择画风的界面。几何检查核对有限坐标、路径预算、部件索引、重复项、默认放置与兼容编译；这些检查不能判定美感，因此还要逐页看图，特别检查五官间距、持物遮挡、足部支撑和屋檐连接。

## 图像生成技能参考稿

使用本会话内置 `image_gen` 工具和 `imagegen` 技能制作了 [美术方向参考稿](previews/atelier-art-direction.png)。这张位图是设计参考，**不是孩子画布上实际投影的素材，也不计入 1302 个画法**。实际底图仍由原生矢量路径绘制，便于缩放、移动、保存和灰色虚线描摹。生成稿的细节密度高于小尺寸底图，不能直接把整张图当作合格的描摹线稿。

生成提示词保存在 [art-direction-prompt.txt](previews/art-direction-prompt.txt)。没有调用需要 API Key 的 CLI，也没有下载或复制现有绘本角色。
