# Nilo 对话、投影与语音 API

所有路径以 `/api/nilo` 开头，允许游客与儿童账号，家长账号返回 403。
绘画使用 `RATE_LIMIT_NILO`（默认每 IP 每分钟 24 次）；识别和播报分别使用 `RATE_LIMIT_NILO_VOICE_ASR` / `RATE_LIMIT_NILO_VOICE_TTS`（各 36 次），不再共享绘画额度。所有请求仍受全局限流。
`GET /voice/config` 使用 `RATE_LIMIT_NILO_CAPABILITIES`（60 次）；客户端应在进入画布时读取一次，避免轮询。

## POST /companion

### 当前整幅画共创协议 v3（2026-09-21）

儿童端点击和已有画面的明确语音新绘画请求发送 `drawingProtocol:3, turnScope:"scene"`。观察与知识检索 → 模型选择一个相关主意 → 编译笔画并预览，通常 2 次模型调用，数据格式失败最多增加 1 次纠正，共用 14 秒服务端预算。没有第二轮语义审核、部件身份或置信度门槛。

模型可选择 90 类 270 种完整画法，也可为目录外事物生成至多 24 条路径／96 条命令。`backupRecipeId` 由模型选择，不是程序随机替代。只剩极少简单线段的自定义结果不当作完整物体；使用模型选择的相关画法或纠正数据。支持有界纯数据命令字符串的无损解析，不执行 SVG/代码。

`at` 为画布中心坐标；`scale` 为物体长边／画布短边，由模型参考主体与剩余空间判断。缺失时按已观察主体大小估算；程序保留长宽比例，只限制过小、越界或过大。`placementPolicy:"free"` 表示完整对象允许叠线，服务端仍优先选空白位置。旧部件和显式连接规则保持原校验。`geometryReviewed:true` 在 v3 仅表示几何位置已确定、前端不要再次搬移，**不表示做过视觉复核**；`drawingMetrics.reviews` 为 0。

画完先投影，孩子确认后提交；取消、版本变化、整组撤销、保存与语音编辑继续适用。移除前端叶子／云朵恢复菜单及本地无意义线条兜底。断网或连续格式失败仍报告服务问题，不伪称模型已完成画作。

### 兼容旧客户端的 v2 协议

以下严格审核流程仅适用于显式发送 v2 的旧客户端和既有回归实验，不是当前儿童端默认行为。

旧客户端点击发送 `takeTurn: true, requestDrawing: true, drawingProtocol: 2, turnScope: "scene"`。有已绘画场景的明确语音新绘画请求也使用 v2；旧对象的语义修改、普通聊天及未带版本的旧客户端保留 v1。下方通用 API 示例和旧部件说明不代表 v2 的模型输出契约。

v2 在一次 HTTP 请求内执行：观察主体与局部区域 → 程序分配主体/区域/真实笔迹连接点 ID → 模型提出意图及局部几何 → 编译与碰撞检查 → 固定实际几何做前后图复核 → 返回一个可撤销贡献。知识库只提供参考，不承担接口枚举。

模型规划格式如下；ID 必须来自本轮观察，示例 ID 不能作为默认值：

```json
{"version":2,"plans":[{"intent":{"subjectId":"S1","regionId":"S1R1","detail":"树节","relationship":"在可见树干内部添加一个树节"},"drawing":{"aspect":0.7,"paths":[[["E",0.5,0.5,0.25,0.35]]],"placement":{"mode":"inside","at":[0.5,0.5],"scale":0.3,"joinId":null}}}]}
```

- `intent` 独立保存主体、区域、添画内容与关系；不再把“树皮纹”等含义转换成气球绳或其他固定部件名称。模型仍可能识别、定位或规划错误，协议本身不保证画意正确。
- `drawing` 统一使用 M/L/Q/C/E/Z 局部路径，最多 8 条，不要求物体属于既有模板。程序继承孩子画笔并计算绝对坐标、等比缩放与预算。`inside` 在已识别区域内放置；`attached` 必须引用原图实际笔迹上的 `joinId`，首点固定，局部路径按连接处朝外定向。普通物体的外接细节必须连接；独立的上下左右放置只允许已观察到的 landscape 场景。
- 一次规划至多两个候选，只提交一个。可无歧义修正平铺指令、多起点和 placement 层级；JSON 尾部损坏时只提取已经完整闭合的候选对象，继续严格校验。不能捏造缺失坐标或主体。所有候选失败后至多纠正一次；格式/几何纠正保持已有有效意图，语义复核否定意图时按下方分类纠正规则重新选择。
- 前端传 `collisionMap: {size:256,bits:"base64"}`，是当前画布占用网格的固定长度位图（8192 字节）。服务端严格解码，并与前端共用 `shared/niloCollision.mjs` 的路径/笔刷检查；旧请求缺少位图时从 PNG 推导。内部细节只能在目标区域内微调；外接细节缩小时固定连接点。通过后以 `fixedGeometry` 渲染复核图，返回 `geometryReviewed: true`，客户端禁止再次搬移。画布版本改变、真实连接点缺失或取消仍会拒绝落笔。
- v2 返回 `protocolVersion:2` 和 `drawingMetrics:{plans,compiled,preflight,reviews,repairs}`。这些是执行计数，不是语义评分。失败保留原因；当前前端不再提供本地可选画法，孩子确认才提交；不能把这类结果计入 AI 共创成功率。

正常三次模型调用，最多一次观察、两次规划、两次复核，共享 14 秒默认预算；前端 16 秒超时。输出上限依次为观察 1100、规划 1800、纠正 2200、每次复核 350 tokens。相比旧协议增加了观察与规划输出预算，实际成本还包括图片、资料和输入文本；上限不是实际消耗。

实现：`niloDrawingProtocol.js` 负责编译，`niloProtocolTurn.js` 负责回合，`shared/niloOccupancy.mjs` 与 `shared/niloCollision.mjs` 负责共享像素检查。验收与当前局限见[联调说明](../docs/联调说明.md#五项修复验收2026-09-21)。

### 通用请求与 v1 兼容协议

#### 轮廓接触与分类纠正（2026-09-21 后续改造）

观察之后程序从原始 PNG 中测量短轮廓，每个主体最多提供 8 个 `contactId`，归属具体的 `regionId`。模型可选择：

```json
{"intent":{"subjectId":"S1","regionId":"S1R0","detail":"小帽子","relationship":"帽沿贴住头顶曲线"},"drawing":{"aspect":1.5,"paths":[[["M",0,1],["L",0.2,0.1],["L",0.8,0.1],["L",1,1],["L",0,1]]],"placement":{"mode":"contact","contactId":"S1R0_top","contactKind":"contour"}}}
```

局部 y=1 是接触底边，向 y=0 朝原轮廓外生长；实际尺寸由测量的短轮廓宽度与 aspect 决定。`points` 固定两个端点，`contour` 将连续底边贴合实测曲线。所有 ID 必须由本轮场景提供。曲线转换使用误差有界的简化，超复杂度直接拒绝，不靠均匀丢点削掉尖角。

API 的最终 proposal 使用 `contact:{kind:"points"|"contour",points:[{x,y},...]}`，与旧 `attachment` 互斥。共享验证限制点数、短边归一化长度及接触带；所有指定接触均要同时有原墨和新增路径，新路径超过一半长度重叠原画会被拒绝。前端另用当前画布 `hasInkAt` 检查真实原墨，复核后禁止移动或缩放。画布布局、提交分组与撤销方式不变。

纠正不再一律锁死意图：格式/几何问题保持意图；像素复核指出无关、重复或位置错误时，允许在已观察场景内更换候选，再走完整编译/碰撞/复核。目标被否定后不能换个名称重复使用；没有其他已观察目标就恢复交互，不捏造新主体。复核只接收中性位置/几何与孩子的话，不把规划者的对象名、细节名和关系描述当成视觉证据。仍最多两次规划、两次复核，取消和总时限不变。

双端帽子的粗网格误拒已修复：服务端使用已解码原图，前端读取当前画布像素，在圆头笔/铅笔的边界冲突处做精查；不扩大接触许可，不改变已复核位置。若提供原像素，每个接点附近还必须有实际被新增笔迹覆盖的原墨，防止仅在粗网格内相邻却留有白缝。其他纹理笔保留保守网格判断。像素数据只是进程内校验参数，不是模型可提交的权限或新增 API 字段；多方案不使用原像素豁免相互碰撞。规划与测量通过 `niloObservedRegions.js` 共用部位筛选和编号。验证结果见[像素修复验收](../docs/联调说明.md#像素边界修复与现有接口对照2026-09-21)。

`niloWaypointSketch.js` 的 32 格点序列编译器和关系案例库属于独立实验，尚未作为默认生产提示或绘图协议启用。

`niloGroundedRegions.js` 的真实笔迹编号观察实验也未默认启用：新 20 图对照为 7/20 可落笔，原方式为 10/20。`niloImageAddition.js` 与 `check-nilo-image-addition.mjs` 仅用于已有原图/候选 PNG 的离线增量验证；当前没有接入图像编辑服务，也不会从应用触发生成请求。

```json
{
  "imageBase64": "可选的 PNG base64 或 data URL",
  "context": {
    "locale": "zh",
    "utterance": "这是去月球的飞船，帮它飞起来",
    "theme": "去月球的飞船",
    "history": [{"role": "user", "text": "这是去月球的飞船"}],
    "requestDrawing": true,
    "imageProvenance": "child",
    "revision": 7,
    "recentTemplates": [],
    "rejectedTemplates": [],
    "recentSubjects": [],
    "rejectedSubjects": [],
    "currentProposal": null,
    "currentAdditions": [],
    "inkGrid": [],
    "lastStroke": {"points": [{"x": 0.2, "y": 0.3}, {"x": 0.4, "y": 0.3}], "color": "#e4a86a", "width": 9, "brushKind": "crayon"},
    "drawingStyle": {"brushKind": "crayon", "color": "#e4a86a", "brushSize": 9},
    "canvasAspect": 1.6,
    "canvasSize": {"width": 960, "height": 600},
    "scene": {"childBounds": {"x": 0.2, "y": 0.2, "width": 0.4, "height": 0.4}, "niloBounds": null, "recentContributions": []}
  }
}
```

共创图片包含已确认的孩子与 Nilo 笔迹（最长边 768 像素），不能把未确认的投影合进去；儿童分析接口仍只使用孩子图层。请求中的图片字符串最多 2 MiB。

可选 `focusImage: {imageBase64, bounds: {x,y,width,height}}` 提供同一画布的局部放大图，图片字符串最多 1 MiB，必须同时提供全图。前端围绕最新孩子笔迹及邻近笔迹取景，从完整已确认画面裁剪，最长边 768 像素；不从缩略全图放大、不改变画布布局、不包含临时投影。服务端验证边界，并把全图、局部图及映射一起交给规划和复核。所有输出坐标仍归一化到全图；局部 `(u,v)` 对应 `(bounds.x+u*bounds.width,bounds.y+v*bounds.height)`。局部图不是另一个作品，旧客户端可只发全图。
主题最多 120 字符，当前话语最多 600 字符，历史只保留最后 8 条、每条最多 300 字符。
密度网格接受 16 或 64 个数值；最近路径最多 24 个点。已有投影放入 `currentProposal` / `currentAdditions` 供复杂修改参考。`scene` 提供 `childBounds`、`niloBounds` 和最近 12 组 `recentContributions`，每组只有 `owner`、`bounds`、`brushKind`、`color`、`strokeCount`。这些边界是保守几何提示，局部擦除后的内容以图片为准，不把旧 PNG 伪称为某一方绘制。

```json
{
  "status": "ready",
  "reply": "我画了一小段尾焰，先放这里给你看看。",
  "theme": "去月球的飞船",
  "proposal": {
    "template": "flame",
    "x": 0.3, "y": 0.7, "width": 0.2, "height": 0.07,
    "rotation": 0, "color": "#e4a86a", "strokeWidth": 9, "brushKind": "crayon",
    "target": "孩子的飞船", "relation": "飞船尾部的一小段尾焰"
  }
}
```

`proposal` 是几何数据，不是执行命令。模型没有 `accept`、删除原画等权限。一起画模式的语音绘画邀请经意图、几何和碰撞校验后直接提交可撤销笔迹；只有明确说“先给我看看／预览”或修改已有预览时才等待“留下来”。聊天、赞美、停止、独自画模式不授权绘画。点击 Nilo 发送 `takeTurn: true` 和 `requestDrawing: true`，动画结束后提交一份可撤销贡献；动画期间点保存或完成会先提交已授权笔迹，再导出。单独设置 `takeTurn` 不会越过绘画权限。草稿恢复、作品保存和导出的图片均包含已提交的两方笔迹，儿童分析仍只读取孩子图层。
`context.inferDrawingIntent` 默认为 `false`。共创模式中，对没有命中快捷句式的语音设为 `true`，并提供当前画布，让同一次视觉调用判断自然表达是否在邀请绘画；独自绘画模式必须保持 `false`。`requestDrawing` 是明确请求的快捷提示，两个字段都为 `false` 时服务端禁止返回绘画建议。
模型先返回 `intent: draw|edit|chat|clarify|stop`，再规划对象、颜色、位置和几何。推断模式缺失 `intent` 时先澄清，不采用其绘画建议；聊天、停止、澄清也不返回绘画建议。可选 `confidence` 必须为 0–1，小于 0.5 时先澄清。该阈值只是保守的初始规则，模型自报分数不是经过标定的准确率。记录 `clarify` 结果供后续与预览、失败分别统计，不记录原始对话。
模板：`waves fish leaf window stars cloud flower trail flame rain grass echo sun moon tree mountain house boat bird butterfly heart`。
模板之外的物体使用 `template: "custom"`，额外提供 `subject` 和 `sketch`。例如下面是一个独立的火箭投影（实际样式默认继承孩子的笔刷）：

```json
{
  "template": "custom", "subject": "火箭",
  "x": 0.6, "y": 0.2, "width": 0.16, "height": 0.32,
  "rotation": 0, "color": "#e4a86a", "strokeWidth": 4, "brushKind": "crayon",
  "target": "孩子想画的火箭", "relation": "在留白处预览带舷窗的小火箭",
  "sketch": {
    "aspect": 0.7,
    "paths": [
      [["M", 0.28, 0.75], ["Q", 0.24, 0.25, 0.5, 0.06], ["Q", 0.76, 0.25, 0.72, 0.75], ["Z"]],
      [["E", 0.5, 0.38, 0.1, 0.07]],
      [["M", 0.28, 0.57], ["L", 0.1, 0.82], ["L", 0.3, 0.75]],
      [["M", 0.72, 0.57], ["L", 0.9, 0.82], ["L", 0.7, 0.75]],
      [["M", 0.4, 0.79], ["Q", 0.5, 0.98, 0.6, 0.79]]
    ]
  }
}
```

`subject` 是新物体名称，去除首尾空白后 1–60 字符；`sketch` 仅允许 `aspect` 与 `paths`。`aspect` 为设计的物理宽高比（0.2–5），前端在提案框内等比适配。`paths` 内每条路径编译为一条现有笔刷笔迹，支持以下定长元组，所有坐标及控制点必须为 0–1 的有限数：

| 指令 | 格式与作用 |
| --- | --- |
| M | `["M", x, y]`，普通路径唯一的起点，必须在首位 |
| L | `["L", x, y]`，连接到终点 |
| Q | `["Q", cx, cy, x, y]`，二次曲线 |
| C | `["C", c1x, c1y, c2x, c2y, x, y]`，三次曲线 |
| Z | `["Z"]`，闭合回起点，只能在末尾 |
| E | `["E", cx, cy, rx, ry]`，完整椭圆；必须独占一条路径，半径大于 0，整个椭圆位于 0–1 内 |

每个物体 1–24 条路径，每路径最多 32 条指令，每物体最多 96 条指令；普通路径必须实际产生非退化绘制，不能只有起点。局部坐标也受 `sketch.aspect` 影响：圆形应满足 `rx * aspect = ry`，方形应满足局部宽度乘 aspect 等于局部高度；客户端不会擅自将有意绘制的椭圆改成圆。基础模板不接受 `subject` / `sketch`，任意额外字段、SVG、可执行代码及非法路径均拒绝。曲线在前端有界采样并使用相同笔刷渲染预览和确认结果。

`recentSubjects` / `rejectedSubjects` 分别保留最近接受/拒绝的自定义物体名称，最多 4 项、每项 60 字符；不在 `rejectedTemplates` 中记录 `custom`。拒绝同名物体后，除非孩子明确重新要求，不继续提议它；提示词同时参考语义避免换个名称重复建议。

`imageProvenance` 为 `child` / `unknown` / `composite`。只有分离出的孩子图层可以标注 `child`；来源不明的旧合成图必须标 `unknown`，模型不能据此声称全部由孩子画出。
坐标是归一化框的左上角和宽高；宽高 0.025–0.45，面积不超过 0.16；旋转角 -180–180 度；线宽 1–32 CSS 像素，允许小数；颜色必须是六位 HEX。所有 proposal 都需要 `target` 和 `relation`。`brushKind` 支持 `round / pencil / marker / crayon / star`，旧响应省略时前端按圆头笔兼容。

前端从最近一次非橡皮的孩子笔迹提取 `drawingStyle`（没有笔迹时使用当前工具）；`brushSize` 与 `lastStroke.width` 必须是 CSS 像素，不能乘设备像素比。后端默认逐项沿用现有投影、`drawingStyle`、最近笔迹中的颜色、粗细和笔刷，孩子明确指定某一属性时才允许模型覆盖该属性。主提案和备选均采用此规则；预览与确认后的笔迹使用相同画笔渲染器和几何路径。

响应可包含 `additions`（最多 3 项），与 `proposal` 组成最多 4 个相关元素，可混合模板和自定义物体；总框面积不超过 0.24，整组最多 64 条最终笔迹、192 条自定义几何指令，任一成员无效或超预算则整组拒绝。同一个物体的轮廓与部件放在一个 `sketch` 内，不能靠拆成多对象绕过限制。可选 `anchor: {x,y,width,height}` 标记主体框，`placement` 为 `above / below / left / right / inside / near`。前端修正物理比例并依据主体限制大小，仅附近避让或等比缩小；确认一次提交全组，移动、缩放和换色同步作用于全组，撤销也只需一次。
单元素普通对话响应可能包含 `alternatives`，至多一个不同模板或不同自定义物体的备选；组合响应不返回备选。点击接力模式使用 [共创 skill](skills/nilo-cocreate/SKILL.md) 与整幅主体规划规则（多笔画使用精简规划提示，复核沿用 skill），并按孩子的话、真实笔迹和回合顺序，从 7 类案例中选择最多 2 例。模型标记 `sceneType`（object / geometric / line / blank），提供 `grounding: {visible, confidence, geometryConfidence}`。`confidence` 表示物体身份把握，`geometryConfidence` 表示形状与连接把握。object 仍要求身份把握至少 0.75；geometric/line 使用几何把握至少 0.75，允许“不知道名字但能看清线条”的接画。缺失几何证据不会放行，旧回复缺少新字段时仍按原 confidence 检查。这些自评分不是标定准确率。上下文不包含先前的助手回复，避免把猜测当成画面事实。

旧版点击接力也支持服务端专用的 `template: "part"`：气球绳、尾巴、鱼鳍、腿、单眼、双眼、嘴、窗户、轴心、帽子、皇冠、刘海、发饰、鼻子和纽扣共 15 种部件。模型仍负责选择有意义且尚未出现的部件、主体范围、内部位置 `position: {u,v}`（0.1–0.9）和相对大小 `scale`（0.12–0.65）；服务端使用已测试的路径编译成普通 `custom`，继续经过视觉复核、连接与碰撞校验。它避免常见部件的路径拼写错误，不承担物体识别，也不会在识别失败时盲目添加部件；其他内容仍支持自定义路径。

模型再返回 proposal 的 template / target / relation / anchor / placement（自定义形状另给 subject / sketch），服务端编译坐标并继承画笔风格；API 对前端仍返回完整 proposal。点击接画优先发展孩子已有的形状，例如给圆接气球绳、给星星添流星尾迹，不重画原主体。点击接力通常使用 1–4 条短路径，必要时最多 8 条，仍只组成一个相关的新部分；超过 4 条时包围框面积不得超过画布的 6%。`contour` 只在模型明确选择轮廓呼应时使用；不再把所有几何图形强制变成内轮廓。抽象场景也可使用真实 lastStroke 的 echo。单层命令可无歧义包装，同一路径中的第二个 M 会分成独立笔画，不插入连接线；所有指令仍通过严格路径校验。

需要连上原画的新部件可包含 `attachment: {x,y}`：原主体范围内的归一化连接点，仅适用于以 M 开头、不旋转的 custom。服务端先按真实物理比例适配连接部件，再在固定连接点的前提下缩小至画布边界内，避免将靠近边缘的有效部件按固定方框误判越界；前端等比缩放时固定首点，要求连接处确实碰到已有笔迹，碰撞检查仅在连接点的笔刷范围及网格误差内允许接触旧笔迹，其余路径仍需空白。不能通过移动到远处来逃避检查。点击共创不接受独立的 leaf 模板；模型为新叶子提供 leaf、attachment 和生长方向，服务端编译为相连的叶柄、叶片与叶脉 custom 路径，接在可见的梗或枝条上，复核需检查实际连接位置。明确语音请求单独叶子的预览流程不受影响。点击接画显示约 1.2 秒的逐笔绘制，然后将相同路径一次提交为一组；减少动态效果偏好跳过动画。孩子落笔、画面变化或取消会终止临时层，不留下半幅结果。主入口为“轮到 Nilo”，语音选项折叠，完成后提示轮到孩子。

任何拟落笔方案都需额外视觉调用复核：已有目标确实存在、新部分相关、方位正确、原画参与结果且没有重复；不要求新想象出的物体已经存在。复核分别输出 `geometryConfidence` 与 `relationConfidence`，两者都至少 0.75 且所有具体检查通过才可放行；不能以熟悉物体名称代替位置检查，名称不确定也不自动否定清晰的几何续画。旧回复缺少两项时仍按原 confidence 检查，只缺一项则拒绝。每个请求共用取消信号与总时限（接力默认 14 秒，环境配置最多 25 秒，前端始终最多等待 16 秒）。格式、结构或可修正复核失败共用一次纠正机会，最多两次规划、两次复核；启用知识库时额外一次观察（最多 650 tokens），正常三次、最多五次模型调用，仍共用原总时限。接力生成最多 1400 tokens，纠正最多 2200 tokens，复核最多 350 tokens。

点击接力只发起一次 HTTP 请求，前端最多等待 16 秒，3.5 秒时更新进展文字，不追加 `renderFeedback` 请求。模型识别不确定、缺少有效笔迹、实际路径检查失败、服务异常或超时时，最近孩子贡献累计达到 3 笔的场景，或有原画但没有可追溯近期笔迹的场景，保留原画并提供本地可选画法；选择后先预览，经孩子确认才落笔，不自动生成无语义线条。其余简单起笔场景可由本地 `planLocalTurn` 接笔：优先小幅呼应实际可见的最近线条，小点可添轮廓，空白画布先起一段开放曲线。这不是语义识别结果，不编造对象或把失败回复写入故事。候选仍检查碰撞并沿用画笔，动画后作为一组 Nilo 笔迹提交，可保存撤销；本地接笔不调用模型。没有可用空间时不覆盖原画。取消、切作品、继续画或离开页面后不补画，迟到响应不再提交。

接力只接受一个 proposal，拒绝非空 additions / alternatives；前端沿目标的指定方向搜索可落笔的位置，检查真实路径与笔刷宽度，不覆盖已有笔迹，也不跨到无关的另一侧。采用 echo 时，前端用真实 lastStroke 重算目标范围和可见大小。取消、画布变更或退出一起画后，过期返回不会落笔。备选仍需本地碰撞检查和孩子确认。

`node scripts/check-nilo-cocreate.mjs` 生成合成测试图；加 `--live` 才调用模型。`--case=heart|circle|star|apple|apple_top|heart_then_apple|open_curve|wheel|house|fish|fish_left|fish_up|fish_with_eye|person|large_person|cat` 可缩小范围，`--local` 检查 3001 服务，`--repeat=1..3` 做小批量复测，`--details` 保留合成输出。`--without-focus` 可对照单图，`--model=供应商模型名` 可在直连模式比较已配置供应商提供的模型。`--check-canvas` 使用生产前端连接校正与碰撞校验，仅一次请求，不再做客户端修正；只有实际路径可落笔才计为成功，输出添画后的合成图。结果含模型、是否带局部图、调用数和总耗时，输出到忽略目录 `frontend/.tmp/nilo-cocreate/`，不读取真实孩子画作或对话。合成案例通过不代表任意儿童画都能正确识别，也不能代替儿童体验评价。

`node scripts/summarize-nilo.mjs --since=2026-09-20` 汇总后端阶段失败码及模型调用耗时，不打印图文或身份。一次回合可能有多个阶段事件，不能用阶段数直接算成功率。前端标签页 `sessionStorage['luma:nilo-turn-diagnostics:v1']` 单独累计 `requested`、`ai_committed`、`local_committed`、`nilo_undone` 和有限失败码，只有真实提交才记 committed；不上传、不记录文本/图像/账号/坐标。`nilo_undone` 包括语音生成内容，不能直接除以点击提交数作为严格撤销率；需要受控测试中保持入口一致。刷新可继续累计，关闭标签页清除。评估应同时人工检查关联性、重复和连接位置，不能把本地兜底计作有效 AI 共创。
`echo` 额外返回 `echoPoints`，由服务端直接取经过校验的 `lastStroke.points`（2–24个归一化点），不会采用模型生成的路径。前端按原笔迹物理方向与比例缩小投射，缺少可靠原始笔迹则拒绝 echo。
未找到合适方案时返回 `status: "clarify"`、一个具体问题和可选 `theme`，绝不生成随机形状兜底。`requestDrawing: false` 或明确拒绝时不返回任何 proposal；绘画请求缺图时返回 `unavailable / missing_image`。
新主题只能来自孩子最新话语的原文片段，否则保留已有主题。模型提示词约束语义关系，但语义质量仍需真实儿童画评测；服务端校验不能证明模型对对象的理解完全正确。

完整匹配的简单单物体指令（例如“你帮我再换一个星星吧”“画一个蓝色的太阳”）直接生成该物体的几何方案，不调用模型。星星使用一条闭合五角星路径，避免“一个星星”变成两颗；继承当前画笔风格，选取空白位置，并经过同样的服务端几何校验和前端笔迹碰撞检查。没有当前预览也可请求新物体；有预览时“换一个X”优先沿用位置和风格。否定、赞美、多物体、相对位置和未知物体不走此快捷路径。已有笔迹时的叶子请求也必须看图，不能用空白位置搜索替代茎叶定位。画布满时只询问该物体放在哪里，确认方式采用上述语音／预览／按钮流程。

普通语音规划调用一次视觉或文本模型，绘画输出上限 3600 tokens，纯对话 1800 tokens。语音连接部件会使用与点击共创相同的连接编译和视觉复核；缺少连接点时最多纠正一次，所有调用共用原请求期限，复核失败不重试。普通聊天、一般无效输出和本地移动、缩放、换色不增加付费重试。上限不是固定消耗，实际用量随复杂度变化。DeepSeek 及 ModelScope 的 Qwen3 系列共创调用显式关闭深度思考，仅接受最终输出。普通语音 `NILO_DIALOGUE_BUDGET_MS` 默认 18000，最多 25000 ms，前端超时为 28000 ms；点击接力预算见上文。客户端断开会中止供应商请求（已产生的上游用量不保证退回）。

`status` 区分正常回应 `ready`、需补充想法 `clarify`、服务异常 `unavailable`。服务异常另外返回 `reason`：`model_unavailable`（未配置）、`timeout`、`provider_error`、`invalid_response` 或 `missing_image`，以及 `retryable`。未配置时不可重试，其他情况允许孩子主动重试；前端不会自动重试，也会停止连续语音，避免反复念同一条故障提示。参数或鉴权错误仍使用相应 HTTP 状态码。

开发请使用 `npm --prefix server run dev` 自动重载后端。如果健康检查正常而 `/api/nilo/companion` 返回 404，通常是旧服务仍在运行，需要重启后端。`node server/scripts/diagnose-nilo.mjs` 默认只输出配置是否就绪；加 `--live` 才用合成小船图调用一次模型，会产生模型用量，不上传儿童画作或输出密钥。增加 `--local` 则经本机 3001 端口验证实际后台链路；后台需要重启才能加载更新后的模型配置。ModelScope 的可用模型会变化，配置时应先核对其 `/v1/models`；2026-09-19 实测 `Qwen/Qwen3.5-35B-A3B` 可用，旧的 `Qwen/Qwen3-VL-8B-Instruct` 返回无供应商支持。

## 语音配置

必须在服务端显式配置；不会复用视觉模型凭据：

```dotenv
VOICE_PROVIDER=dashscope
VOICE_BASE_URL=https://dashscope.aliyuncs.com
VOICE_API_KEY=
VOICE_ASR_MODEL=qwen3-asr-flash
VOICE_TTS_MODEL=qwen3-tts-flash
VOICE_TTS_VOICE=Mochi
VOICE_TIMEOUT_MS=12000
```

示例选用阿里百炼北京 Qwen3-ASR-Flash 与 Qwen3-TTS-Flash。必须单独配置百炼北京 API Key；现有 ModelScope 密钥不能代替，程序也不自动复用任何其他密钥。缺少 `VOICE_API_KEY` 时云端语音保持禁用；前端仅在浏览器支持时提供浏览器语音，否则继续使用按钮。尚未执行真实供应商付费调用。

云端默认音色为 `Mochi`（沙小弥），官方列为童真男声，支持中文与英文，可用于 `qwen3-tts-flash`。已有部署若显式设置了其他 `VOICE_TTS_VOICE`，仍以该设置为准；想切换到此音色需修改配置并重启服务。音色依据：[阿里百炼音色列表](https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list)。

浏览器降级只从当前语言中挑选音色，优先名称明确标注为儿童／少年，再选较温和的候选（中文 Xiaoxiao、Xiaoyi、Tingting；英文 Ana、Jenny、Aria、Samantha），并使用 `pitch=1.18`、`rate=0.96`。列表尚未加载时最多等待 1 秒；无法枚举时仍通过 `utterance.lang` 请求系统匹配。若已列出的音色确实没有当前语言，则使用字幕与按钮。浏览器声音取决于设备，不能保证为真实童声或跨设备一致；要稳定使用 Mochi，必须启用云端语音。

`dashscope` 使用 ASR `POST /compatible-mode/v1/chat/completions` 的 `input_audio` data URL，以及 TTS `POST /api/v1/services/aigc/multimodal-generation/generation` 的 `input.text/voice/language_type`。ASR建议上传浏览器本地转换后的单声道 WAV。TTS生成的 WAV 由服务器从固定的百炼北京/乌兰察布结果 OSS 主机下载，仅用 HTTPS，不带 API key，不允许任意域名或重定向；不会把带签名的链接返回前端或写入日志。

阿里官方接口依据：[Qwen-ASR](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)、[Qwen-TTS](https://help.aliyun.com/zh/model-studio/qwen-tts-api)。返回为 `audio/wav`，前端必须使用响应 MIME 类型，不能假定都是 MP3。使用其他地域前需核对结果存储主机白名单，不可简单开放任意 OSS 域名。

也支持 `VOICE_PROVIDER=openai-compatible`，将 `VOICE_BASE_URL` 设为供应商 `/v1` 地址，并配置该供应商支持的模型和音色。此模式需支持 multipart `POST /audio/transcriptions`（file/model/language/response_format=json）与 JSON `POST /audio/speech`（model/input/voice/response_format=mp3）。无需安装额外 SDK。

接口依据：[OpenAI 官方转写文档](https://developers.openai.com/api/reference/typescript/resources/audio/subresources/transcriptions/methods/create)、[OpenAI 官方语音合成文档](https://developers.openai.com/api/reference/typescript/resources/audio/subresources/speech/methods/create)。兼容格式不代表所有提供商支持同一模型或音色，部署时须验证服务能力及数据保留规则。

### GET /voice/config

返回 `{"asr":false,"tts":false}`。只披露能力开关，不泄露提供商配置或密钥。无配置时按钮操作可继续。

### POST /voice/transcribe

可选 `context: { theme, subjects }` 用于识别词汇提示：主题最多 120 字符，最多 8 个已确认对象名、每个最多 40 字符。服务端只读取这两个字段，与 `shared/voiceVocabulary.json` 中的绘画词汇合并。在 DashScope 模式下放入第一条 `system` 消息作为背景数据，不发送整段聊天历史，也不事后强制替换识别文字；其他兼容供应商仍使用原有音频请求，避免假定其支持提示词。[千问 ASR 上下文接口说明](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)

浏览器识别使用连续结果，将中文片段直接拼接、英文片段用空格拼接；最终片段后等待 2.2 秒且没有新的中间结果才提交。点击“说完了”可提前结束。未完成的中间结果不会被当成确认命令，也不会悄悄丢弃句尾再提交前半句。支持 `SpeechRecognitionPhrase` 的浏览器会收到词汇提示；服务不支持时仅重启一次无提示词的浏览器识别。
服务端录音路径用浮点波形与随背景音调整的能量阈值检查声音，连续模式的句间停顿也为 2.2 秒；这是轻量能量检测，不是经过儿童语音数据训练的 VAD。没有声音 7 秒、单段 20 秒及取消释放麦克风的限制继续生效。主题和对象在每次开始录音时快照，后续界面更新不会打断录音。

自动测试覆盖停顿后继续说话、小音量输入、孤立噪声、句尾修正、取消和快捷句式之外的意图。真实准确率仍需用同一批设备录音对比错字/漏字率、意图正确率、预览符合要求的比例和响应耗时；不能用模拟测试通过数代替语音准确率。云端仍需部署方配置独立的 `VOICE_API_KEY`，不自动借用文字模型密钥。
麦克风权限和浏览器启动期间显示“麦克风准备中”，直到录音器启动或浏览器触发 `start` 事件才显示“我在听”，避免启动延迟期间过早开口。准备阶段同样支持取消。

输入 `{"audioBase64":"...","mimeType":"audio/webm;codecs=opus","locale":"zh"}`，返回 `{"text":"这是我的飞船"}`。
音频必须是纯 base64，解码后最多 3 MiB。接受 webm、ogg、mp4、m4a、mp3、wav、flac。上传格式需与实际录音一致。locale 为 zh 或 en。

### POST /voice/speak

输入 `{"text":"我在这里陪着你。","locale":"zh"}`，返回 `{"audioBase64":"...","mimeType":"audio/mpeg"}`。
文本最多 400 字符；供应商音频响应最多 5 MiB。DashScope模式返回 `mimeType: "audio/wav"`，OpenAI兼容模式返回 MP3。建议客户端缓存固定欢迎台词，并明确 AI 语音身份。

### 错误与取消

| HTTP | error | 客户端建议 |
|---|---|---|
| 400 | invalid_audio / unsupported_audio_type / invalid_speech_text | 使用按钮，或重新录制 |
| 422 | voice_no_speech | 没听清，允许重说；不执行命令 |
| 429 | 限流信息 / voice_provider_unavailable | 暂停重试，保留按钮操作 |
| 503 | voice_asr_not_configured / voice_tts_not_configured | 本次会话禁用相应语音能力 |
| 504 | voice_cancelled_or_timeout | 停止等待，保留当前画面 |
| 502 | voice_provider_unavailable / invalid_voice_response | 显示字幕，不能伪装识别成功 |

默认预算 12 秒，可配 1–20 秒。请求取消会向供应商传递 AbortSignal，无自动重试。麦克风授权、录音停止、播放打断与浏览器能力判断由前端负责。

## 隐私与成本观测

录音只在请求内存中转发，不写文件、数据库或 trace；转写文本和孩子对话同样不写 trace。
`nilo_companion_vision` / `nilo_companion_text` LLM trace 保留分类、模型、时延及供应商实际 usage，输入输出预览为 `[private]`。
`nilo_voice_asr` / `nilo_voice_tts` trace 只保留时延、输入字数或音频字节数、输出字节数及供应商返回的数值用量。没有 usage 的供应商不能据此推算实际计费，需对照供应商账单。

## 验证

```sh
cd server
npm test -- --run tests/niloDialogue.test.js tests/voice.test.js tests/nilo.test.js tests/llmClient.test.js
```

测试覆盖确认权限、无图聊天、拒绝、主题依据、越界/错误模板/旋转边界、取消、超时、无付费重试、音频输入输出限制、缺配置、鉴权和限流。自动测试使用模拟供应商；未配置真实语音服务前不代表真机识别和播报已验收。

接画校验失败会在 traces 中记录 failureCode 和尝试序号，区分路径格式、连接点、坐标边界等原因；不记录儿童原图、文本或坐标。格式纠正请求使用这些原因码提供反馈。

对于独立几何形状，接力方案只能是连接到原轮廓的新部件或内部细节，不能直接添加水纹、雨滴等独立模板；外部自定义部件必须提供连接点。此检查以编译后的实际路径为准：连接叶片会编译成 custom，不能仅因原始模板叫 leaf 就拒绝。视觉复核要求 `usesExistingDrawing: true`，检查原有线条是否真正参与构图；缺失、字符串或 false 均不落笔。真实物体场景仍可支持互动，例如船下的水波。

点击接力优先关注最近孩子笔迹所在的主体，`attentionBounds` 来自最近 child contribution，`focusBounds` 对应局部放大区域。目标框与最近孩子笔迹及其相连的孩子笔迹框均分离时要求重新选目标；同一人物的腿与头连通时，允许回到头部添画。边界框连通仅为注意范围提示，不证明物体身份，仍需视觉复核，避免仍回头装饰旧作品。格式、结构、选错目标或可修正复核失败共用最多一次重新规划机会，全部共用默认 14 秒服务端预算；前端最多等待 16 秒。看不清几何、复核结构无效或服务异常不会盲目重试。失败码区分位置、重复、关联性、识图和复核格式，日志不记录儿童图文。点击失败后仅简单起笔可尝试本地接笔，多笔画场景保留原画并提示重试；普通语音仍可询问具体想法。

视觉定位调试采用 [agent-vision-toolkit 的工作方法与本机配置](skills/nilo-cocreate/references/vision-toolkit.md)。开发 skill 安装在 Codex 中，服务不执行第三方 Python 命令。接力模式会把目标范围内、距离最近笔迹不超过画布短边 1.2% 的连接点校正到采样笔迹上，然后再编译尺寸、视觉复核和检查画布碰撞；这只能修正小幅坐标误差，不能修正认错物体或保证共创创意质量。

## 共创结构定位与添画前后复核

点击接力现在在服务端内存中先合成候选 PNG，再用原图与添画后的全图进行复核；复核阶段用合成图替换局部放大图，保持两张图，复核仍为一次规划加一次复核，启用知识库另有一次短观察，最多一次修正，沿用 14 秒总预算。画面和生成图片不写文件或 trace。测试脚本只为合成案例输出预览。

服务端使用 pngjs 解码有尺寸上限、校验 CRC 的 PNG；输入边长最多 1024、像素最多 1024²，适配客户端最长边 768 的观察图。前后端共享 shared/niloSketch.mjs 和 shared/niloGeometry.mjs 的路径采样与物理比例。复核图保留原画，新增线稿的位置、形状和颜色与最终路径一致；蜡笔颗粒、星形笔尖等纹理是近似轮廓，不能把它当作逐像素笔刷验收。

眼睛、嘴和窗户必须提供规划端结构字段 structure（包含 kind、confidence、regions），以全图坐标指出身体、头尾、面部或墙体等支持区域；服务端拦截方向矛盾、缺少结构或明显越区，不接受仅仅位于整个主体框内。允许在同一支持区域内做有界微调，并在复核前对齐已有像素连接点；错误一侧的部件不能直接跨越整个主体搬到另一端。原画无法支持这些区域时需要重新选择贡献，而不是编造区域。

通过复核的点击响应增加 geometryReviewed: true。前端仍检查真实笔迹接触、碰撞、版本和取消，但不再移动、镜像或缩放该方案；检查失败则走独立的本地反馈。这个字段不代表儿童已经接受，也不代表语义正确率。

连续接力保留最多 4 条孩子发言与 2 条助手记录；交接按钮本身不挤占孩子的发言容量。孩子切换作品或账号时清除本次对话，首次保存草稿保留当前故事。点击规划只把孩子发言作为叙事证据，不使用模型先前生成的主题判断物体；已接受/拒绝部件和笔迹来源仍单独传递。

合成评测将 canvasFits 与 semanticCheck 分开：鱼眼方向检查只证明在鱼头一侧，不等于完整语义通过；其他贡献仍需人工检查相关性、结构、重复、尺寸与孩子可继续创作的空间。已有眼睛、新主体和旋转案例分别评测，不能用落笔数量代替有效共创率。

未启用知识库的兼容流程中，多笔画或人物相关的点击规划按需附带一张 480×320 的绘画参考图：人工挑选的 5 张 Quick, Draw! 简笔画与 1 张原创刘海示例。它提供画法词汇，不承担识别，也不是模型训练；见[资源、许可与扩展说明](skills/nilo-cocreate/references/drawing-resources.md)。规划最多为全图、局部图、参考图三张，复核仍为原图与添画后图两张。增加输入用量，不增加原有模型调用上限。无效部件数据会消耗原有的一次格式纠正机会，不再被当成成功的空方案提前结束。

复核前的内部 custom 细节允许在原锚点范围内进行小范围像素避让：保持形状、大小与朝向，平移上限为画布短边 3% 且不超过主体物理最长边 8%。找不到近邻空位时保留候选交给后续检查，不能搬到另一个区域。连接部件不走此平移流程；视觉复核和客户端保护仍独立生效。

## 可检索绘画知识库

当前儿童端点击请求发送 `context.useDrawingKnowledge: true`，仅与 `takeTurn: true`、`requestDrawing: true` 同时生效。旧客户端省略时沿用原流程，普通语音聊天不增加观察调用。服务端先以 `nilo_knowledge_observe` 观察当前全图/局部图，保留自由主体名称、结构类别与可选主题 ID，再本地检索最多两个知识条目。名称不受现有条目限制；已识别但无专门条目的内容使用八类通用结构指导，保留真实名称，不自动降为抽象图形或匹配无关参考图。只有观察不足时才使用抽象/未知指导。这不是向量数据库，也不依赖孩子必须先说出物体名字。

每个可信主体最多提供八个从原图提取的实际边缘笔迹点。规划可使用服务端专用 `attachmentId`，编译前替换为真实坐标；未知 ID 拒绝，点位本身不证明解剖部位。`custom` 也支持 `scale`（0.12–0.65）；无连接点且 `placement=inside` 时可使用 `position: {u,v}`（0.1–0.9）控制局部中心。前端仍收到完整编译后的路径，连接、大小与碰撞保护保持生效。

规划的 `grounding.visible` 若为非空文本列表，可无损合并为描述字符串；若身份/几何置信度足够但描述字段类型不合格，使用现有的一次格式纠正机会，并记录 `invalid_grounding_format`，不直接归因为识图失败。无证据或低置信度仍不放行。无关的可选 `structure` 格式错误不阻断普通部件；眼睛、嘴、窗户仍必须具备有效结构与支持区域。

首批 28 个主题条目、29 类 57 张人工筛选的 Quick, Draw! 简笔画，以及 14 组原创自定义笔画步骤。只把检索到的条目和最多四张示例拼成的一张小图传给规划；观察和复核不附带参考图。观察是暂时性的模型判断，规划必须重新看原画，不能把示例身份套到孩子画上。源码、许可、人工审核及扩展方法见[绘画资源说明](skills/nilo-cocreate/references/drawing-resources.md)。

资料是推理时的上下文，不是微调模型；增加数据量不能保证识别、语义或定位准确。资源在服务进程中缓存，更新后重启后端。`check-nilo-cocreate.mjs` 默认启用知识库，`--without-knowledge` 可比较旧流程。测试只能使用合成样例；不得把真实儿童图片与对话写入回归输出目录。


点击整幅画接力可传 `context.turnScope: 'scene'`，仅在 takeTurn 与 requestDrawing 均为 true 时生效。目标可接触任一现有儿童主体，仍排除仅 Nilo 作画区域和空白区域，并保留前后视觉复核；旧客户端默认 latest，沿用最后主体检查。常见部件对模型使用明确的 balloon_string 名称，旧 string 只作兼容别名，不能作为树皮或普通线条工具。

当前前端已移除本地叶子／云朵选择，默认使用上述 v3 自主选画流程。


## 整幅画面与对象编辑升级（2026-09-21）

- v2 新增 intent.kind="object" + drawing.placement.mode="scene"。subjectId/regionId 指向关联的原画主体，不代表必须物理连接；at 为整幅画布中心坐标。detail 与完整 recipeId 的主体必须一致，不能把海草映射成小船。
- drawing.recipeId 可选择 shared/niloRecipes.mjs 的 90 类 270 种原创完整画法；程序二次查表取得笔迹，不把整套路径塞入模型提示。模型也可输出不在库中的自定义完整物体（24 paths/96 commands）；部件仍受 8 paths 和接点限制。
- 完整物体按可读尺寸布局，可在同一附近空区搜索安全位置，随后复核实际渲染。内部细节/连接部件保留原校验；独立事物按场景相关性复核，不要求接触原画。
- 身份置信度 .5–.65、但有 >=.8 且包含于主体的可见区域时，允许 objectOnly 主体用于独立场景提案；禁止部位添画，不提高原分数，不跳过视觉复核和孩子确认。
- 观察最多 4 主体，规划正常 2400、纠正 2600 输出 tokens；仍最多 5 次调用，共用 14 秒服务端截止时间。完整画法检索、普通对象调整不增加模型调用。
- 文档保留 version:1，扩展 stroke.object={name,proposals,aspect} 与 type:"edit", owner:"nilo", groupId, targetId, replacement。replacement 只能替换同一个可见 Nilo 分组；不接受编辑孩子笔迹、清空之前隐藏的分组、嵌套 edit、非法路径或超量数据。空 replacement 表示删除。
- 渲染先应用 edit，保持被替换对象原来的层次，再重放孩子笔迹。撤销删除 edit 事件，恢复原笔迹；保存和本地草稿共用持久化验证。必须同步发布前后端，旧前端不认识 edit 事件。
- UI 新增、修改、删除均先预览再确认。确认接口受画布 revision、当前可见性、取消/切作品及碰撞复检约束。未确认内容不进入保存或导出。存量 PNG 无对象信息时不伪造对象。

### v3 自主配色与可拖动预览

规划输出可带 `color: "#RRGGBB"`，备选方案独立带颜色；程序保留该颜色，同时继承儿童笔刷和线宽。有效颜色不会再被儿童当前颜色覆盖；未提供有效颜色时使用所选原创画法的建议色。目录按物体归组，包含全部 270 个变体 ID。

前端投影动画结束后可直接拖动；右下角手柄等比缩放，兼容鼠标、触摸和键盘方向键／加减键。组内所有笔画保持相对位置，限制整个组越界或超过数据上限。用户主动摆放会解除旧部件的连接锚点，采用自由位置；不会移动儿童原笔迹。指针取消恢复拖动前的位置，确认前不写入画作。
