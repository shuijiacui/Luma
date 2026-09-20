# Nilo 对话、投影与语音 API

所有路径以 `/api/nilo` 开头，允许游客与儿童账号，家长账号返回 403。
绘画使用 `RATE_LIMIT_NILO`（默认每 IP 每分钟 24 次）；识别和播报分别使用 `RATE_LIMIT_NILO_VOICE_ASR` / `RATE_LIMIT_NILO_VOICE_TTS`（各 36 次），不再共享绘画额度。所有请求仍受全局限流。
`GET /voice/config` 使用 `RATE_LIMIT_NILO_CAPABILITIES`（60 次）；客户端应在进入画布时读取一次，避免轮询。

## POST /companion

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
单元素普通对话响应可能包含 `alternatives`，至多一个不同模板或不同自定义物体的备选；组合响应不返回备选。点击接力模式在运行时加载 [共创 skill](skills/nilo-cocreate/SKILL.md)，先由视觉模型标记 `sceneType`（object / geometric / line / blank）并给出 `grounding: {visible, confidence}`：具体可见特征和识别把握，而不是只写“装饰一下”。缺失证据或自报把握低于 0.75 时不落笔；此分数不是标定准确率。上下文不包含先前的助手回复，避免把之前猜错的对象当成画面事实。

模型再返回 proposal 的 template / target / relation / anchor / placement（自定义形状另给 subject / sketch），服务端编译坐标并继承画笔风格；API 对前端仍返回完整 proposal。点击接画优先发展孩子已有的形状，例如给圆接气球绳、给星星添流星尾迹，不重画原主体。每次 custom 最多四条短路径，组成一个相关的新部分。`contour` 只在模型明确选择轮廓呼应时使用；不再把所有几何图形强制变成内轮廓。抽象场景也可使用真实 lastStroke 的 echo。单层命令可无歧义包装，同一路径中的第二个 M 会分成独立笔画，不插入连接线；所有指令仍通过严格路径校验。

需要连上原画的新部件可包含 `attachment: {x,y}`：原主体范围内的归一化连接点，仅适用于以 M 开头、不旋转的 custom。服务端先按真实物理比例适配连接部件，再在固定连接点的前提下缩小至画布边界内，避免将靠近边缘的有效部件按固定方框误判越界；前端等比缩放时固定首点，要求连接处确实碰到已有笔迹，碰撞检查仅在连接点的笔刷范围及网格误差内允许接触旧笔迹，其余路径仍需空白。不能通过移动到远处来逃避检查。点击共创不接受独立的 leaf 模板；模型为新叶子提供 leaf、attachment 和生长方向，服务端编译为相连的叶柄、叶片与叶脉 custom 路径，接在可见的梗或枝条上，复核需检查实际连接位置。明确语音请求单独叶子的预览流程不受影响。点击接画显示约 1.2 秒的逐笔绘制，然后将相同路径一次提交为一组；减少动态效果偏好跳过动画。孩子落笔、画面变化或取消会终止临时层，不留下半幅结果。主入口为“轮到 Nilo”，语音选项折叠，完成后提示轮到孩子。

任何拟落笔方案都需额外视觉调用复核同一张原图：已有目标确实存在、新部分相关、方位正确、不是已有的细节；不要求新想象出的物体已经存在。复核失败没有随机图案降级。每个后端请求内共用一次取消信号和总时限（接力默认 24 秒，环境配置最多 25 秒）。格式、缺失笔迹、结构或可修正的复核失败共用一次纠正机会，最多两次规划、两次复核；识别不确定和服务异常不会盲目重试。接力生成最多 1400 tokens，纠正最多 2200 tokens，复核最多 300 tokens。

点击方案在前端实际路径检查中失败时，同一次点击可发起一次 `renderFeedback: {reason: "ink_collision", proposal: <失败的已校验方案>}`。沿用同一张画布图、版本和取消信号，要求修正方向、接点或同一主体的细节。这个请求只允许一次规划和一次复核，不递归修正。一次点击整体最多两次 HTTP 请求、六次模型调用、52 秒；实际成功即停止，不会用满预算。结果还需通过前端检查才能提交。没有返回笔迹时不显示模型的完成描述，也不把它记为已完成的故事；成功字幕由画布提交结果触发。

接力只接受一个 proposal，拒绝非空 additions / alternatives；前端沿目标的指定方向搜索可落笔的位置，检查真实路径与笔刷宽度，不覆盖已有笔迹，也不跨到无关的另一侧。采用 echo 时，前端用真实 lastStroke 重算目标范围和可见大小。取消、画布变更或退出一起画后，过期返回不会落笔。备选仍需本地碰撞检查和孩子确认。

`node scripts/check-nilo-cocreate.mjs` 只生成合成的爱心、圆、星星和带梗轮廓测试图；加 `--live` 才调用配置好的模型，`--case=heart|circle|star|apple|apple_top|heart_then_apple` 可缩小范围，`--local` 可检查当前 3001 服务，`--repeat=1..3` 可作小批量稳定性检查，`--details` 保留合成图输出用于诊断。`--check-canvas` 使用生产前端的连接校正、路径布局和碰撞校验，并在必要时执行一次相同的反馈修正；只有最终路径可落笔才计为成功，额外输出添画后的合成图。输出到被忽略的 `frontend/.tmp/nilo-cocreate/`，不读取真实孩子画作或对话。合成案例通过不代表所有儿童画都能正确识别。
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

点击接力优先关注最近孩子笔迹所在的主体，`attentionBounds` 来自最近 child contribution。目标框与该范围完全分离时要求重新选目标，避免画完心形、再画苹果后仍回头装饰旧心形。格式、结构、选错目标或可修正的视觉复核失败共用最多一次重新规划机会；新方案仍需重新复核，最多两次规划、两次复核，全部共用原 24 秒预算（配置最大 25 秒）。看不清目标、复核结构无效、服务异常不会盲目重试。失败以有限 reason 码区分位置、重复、关联性、识图和复核格式；日志只记录码与次数，不记录候选内容或儿童图文。界面询问具体问题，不再统一要求孩子“再添一笔”。

视觉定位调试采用 [agent-vision-toolkit 的工作方法与本机配置](skills/nilo-cocreate/references/vision-toolkit.md)。开发 skill 安装在 Codex 中，服务不执行第三方 Python 命令。接力模式会把目标范围内、距离最近笔迹不超过画布短边 1.2% 的连接点校正到采样笔迹上，然后再编译尺寸、视觉复核和检查画布碰撞；这只能修正小幅坐标误差，不能修正认错物体或保证共创创意质量。
