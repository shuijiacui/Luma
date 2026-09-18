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

`proposal` 是待确认投影，不是执行命令。模型没有 `accept`、删除原画等权限。
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
单元素响应可能包含 `alternatives`，至多一个不同模板或不同自定义物体的备选；组合响应不返回备选。备选同样需要本地碰撞检查和孩子确认。
`echo` 额外返回 `echoPoints`，由服务端直接取经过校验的 `lastStroke.points`（2–24个归一化点），不会采用模型生成的路径。前端按原笔迹物理方向与比例缩小投射，缺少可靠原始笔迹则拒绝 echo。
未找到合适方案时返回 `status: "clarify"`、一个具体问题和可选 `theme`，绝不生成随机形状兜底。`requestDrawing: false` 或明确拒绝时不返回任何 proposal；绘画请求缺图时返回 `unavailable / missing_image`。
新主题只能来自孩子最新话语的原文片段，否则保留已有主题。模型提示词约束语义关系，但语义质量仍需真实儿童画评测；服务端校验不能证明模型对对象的理解完全正确。

单次请求只调用一次视觉或文本模型，绘画输出上限 3600 tokens，纯对话 1800 tokens，不重试付费调用；本地移动、缩放、换色和确认不请求模型。上限不是固定消耗，简洁曲线用于减少逐点坐标输出，实际用量随复杂度变化。DeepSeek 共创调用显式关闭深度思考，仅接受最终输出，其他业务的推理设置不变。`NILO_DIALOGUE_BUDGET_MS` 默认 18000，最多 25000 ms，前端请求超时为 28000 ms。客户端断开连接会中止供应商请求（已产生的上游用量不保证能退回）。

`status` 区分正常回应 `ready`、需补充想法 `clarify`、服务异常 `unavailable`。服务异常另外返回 `reason`：`model_unavailable`（未配置）、`timeout`、`provider_error`、`invalid_response` 或 `missing_image`，以及 `retryable`。未配置时不可重试，其他情况允许孩子主动重试；前端不会自动重试，也会停止连续语音，避免反复念同一条故障提示。参数或鉴权错误仍使用相应 HTTP 状态码。

开发请使用 `npm --prefix server run dev` 自动重载后端。如果健康检查正常而 `/api/nilo/companion` 返回 404，通常是旧服务仍在运行，需要重启后端。`node server/scripts/diagnose-nilo.mjs` 默认只输出配置是否就绪；加 `--live` 才用合成小船图调用一次模型，会产生模型用量，不上传儿童画作或输出密钥。

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
