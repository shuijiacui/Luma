# API 契约

> 根据当前源码整理。Base URL：`http://localhost:3001/api`。下文路径均相对此地址，除非写明 `/api`。除图片接口外，请求/响应为 JSON；受保护请求带 `Authorization: Bearer <token>`，不支持 URL token。共创与语音详细协议集中在 [Nilo API](../server/NILO_API.md)。

## 认证与错误

access token 默认 120 分钟，refresh token 30 天且使用后轮换。带无效 Authorization 的业务请求返回 401，不降级游客；刷新和退出接口允许处理旧 token。通用错误为 `{"error":"提示或错误码"}`。

| 状态 | 含义 |
| --- | --- |
| 400 | 参数、特征或分页格式错误 |
| 401 | 未登录或会话失效 |
| 403 | 身份/家庭权限不符；注销密码复核失败也用此状态 |
| 404 | 作品、图片或邀请码不存在 |
| 409 | 账号重复、幂等键图像冲突、受控媒体路径不兼容 |
| 413 | JSON 请求体超限 |
| 422 | 旧画作来源未知，不能分析；或语音未识别到内容 |
| 429 | 超出限流，响应含 Retry-After |
| 500 | 内部错误或分析持久化失败 |
| 502 | 视觉服务、输出解析或特征验证失败 |
| 503 / 504 | 语音能力未配置 / 语音请求取消或超时 |

## 账号接口

| 方法与路径 | 请求体 | 成功响应 |
| --- | --- | --- |
| POST `/auth/parent/register` | `{name,email,password}`；密码至少 6 位 | 201，认证结果 |
| POST `/auth/parent/login` | `{email,password}` | 201，认证结果 |
| POST `/auth/child/register` | `{nickname,creationCode,inviteCode}`；创作码 4 位数字 | 201，认证结果 |
| POST `/auth/child/login` | `{nickname,creationCode}` | 201，认证结果 |
| POST `/auth/refresh` | `{refreshToken}` | 200，新的 `{token,refreshToken}` |
| POST `/auth/logout` | 无 | 200，`{ok:true}`，撤销此账号全部 access/refresh 会话 |
| GET `/auth/me` | 无，需登录 | 200，`{session,family,children}` |

认证结果包含 `token`、`refreshToken`、`session: {id,role,familyId,displayName,isGuest:false}`、`family: {inviteCode}`。`me.children` 每项为 `{id,nickname,birthDate,createdAt}`。生日可为 null。邮箱忽略大小写；儿童昵称当前全局唯一。新家长注册创建新家庭。

### POST `/auth/family/delete`

仅同家庭家长，需密码复核与精确确认文案：

```json
{ "password": "家长登录密码", "confirmation": "删除整个家庭" }
```

成功为 `{"ok":true,"pendingMedia":0}`。删除本家庭所有账号、会话、作品与周期报告；`pendingMedia > 0` 表示在线数据已删，但有待运维清理的媒体暂存文件。密码不正确返回 403 且不删除。数据库失败会回滚并恢复已暂存媒体。不负责即时清除历史备份或外部服务留存。

## POST `/analyze`

允许匿名游客或正式儿童；家长 token 返回 403。

```json
{
  "imageBase64": "孩子笔迹图的base64或支持的data:image/...;base64前缀",
  "submissionKey": "client-generated-id",
  "source": "digital_canvas",
  "provenance": "co-created",
  "artworkId": "已保存画册作品的UUID",
  "artworkRevision": 1
}
```

支持 PNG/JPEG/JPG/WebP 数据前缀；纯 base64 默认按 PNG 元数据保存。解码上限 10 MiB，请求 JSON 上限 15 MB。`priorFeatures` 为旧兼容字段，现忽略；每次处理完整快照。

`provenance` 为 `child` / `co-created` / `unknown`，省略按 `child` 兼容；调用方须如实标记。`unknown` 返回 422 `unknown_artwork_authorship`，作品仍可通过画册接口保存。共创时 `imageBase64` 仅包含孩子笔迹，不能混入已确认的 Nilo 内容或未确认投影。

正式儿童可同时提交 `artworkId` 与 `artworkRevision`，服务端从自己的画册记录读取用于家长展示的合成图，并校验版本和来源。两字段必须成对出现；找不到作品为 404，版本或来源改变为 409。正式账号不能直接提交 `displayImageBase64`；游客可使用该字段传合成 PNG，不可引用正式画册编号。不传展示图引用时保留分析输入图作展示。

`submissionKey` 可省略，长度 1–100，限字母、数字、下划线和连字符。正式孩子同键、同分析图、同来源、同展示图及画册版本重试返回同一 `analysisId`；任一关联不一致返回 409。服务器记录分析图与展示图的校验和，不能把同键当作任意图片的覆盖操作。

成功 200：`{features,feedbackText,followUp,feedbackTextEn,followUpEn,analysisId?}`。正式儿童成功时有 `analysisId` 并持久化；游客无该字段。中英文反馈均由同一组客观特征生成，不额外调用翻译模型。中文固定开放问题为“还想再画点什么吗？”。

### FeatureJSON

```json
{
  "rawDescription": "画面中央有一棵树",
  "elements": ["tree"],
  "colors": {"dominant": ["green"], "darkRatio": 0.1},
  "composition": {"size": "normal", "position": "center", "pressure": "normal"},
  "distortions": [],
  "erasureMarks": 0,
  "confidence": {"elements": 0.9, "colors": 0.9, "composition": 0.8, "distortions": 0.6, "erasureMarks": 0.6},
  "source": "digital_canvas"
}
```

`rawDescription` 最长 10000 字符；数组最多 100 项、字符串项最长 100。数值须有限，置信度及颜色比例为 0–1。构图 size 为 small/normal/large，position 为 center/corner/edge/bottom，pressure 旧字段保留兼容。新模型可返回最多 12 个 `objects`：`label,visibility,bbox,confidence`；bbox 使用画布归一化坐标且须完全落在画布内，看不清时为 null。

逐维置信度低于 0.5 的维度被门控：元素/异常数组可为空，颜色/构图可为 null，涂改数可清零；响应可含 `droppedDimensions`。静态画面无法测量真实笔压或擦除次数；新识图提示固定填 `normal` 和 `0`，新报告不使用这两个字段。AI 描述不是孩子原话。

服务端还记录 `provenance`、`analysisScope: "child-only"`、`displayScope: "child-only" | "composite"`、分析与展示图 SHA-256，以及可选的画册编号和版本。旧数据可能缺少这些字段，客户端不能据此断言作者来源。

## POST `/report`

正式报告只接受同家庭家长 token，并由服务端读取作品：

```json
{ "analysisId": "分析记录UUID", "locale": "zh" }
```

忽略已登录请求中的客户端替换特征和年龄，按账户生日计算当前年龄；未填生日则不推测。已知年龄不在 5–12 岁时返回 422 `age_out_of_scope`。匿名允许 `{features,childAge?}` 的临时演示，不保存；匿名带真实 analysisId 返回 401；儿童调用返回 403。

`locale` 为 `zh` / `en`，省略或无效值按中文。新报告为 `observation-v1`，只描述 5–12 岁孩子笔迹图中可见的元素、颜色和可验证位置；不执行旧 HTP 情绪规则、未经审核的 PDF RAG、联网建议或评分。报告会附上已核对文献的一般研究背景与适用局限，带原文链接，不把文献与该幅画面的某个符号对应。旧报告仍按原样保存在历史记录中，前端明确标记为“历史旧版报告”。界面切换语言不会自动翻译旧自由文本。

成功 200 示例：

```json
{
  "kind": "observation-v1",
  "emotion": "画面观察",
  "confidence": 0,
  "observationStatus": "observed",
  "childAgeBand": "5-7",
  "ageContext": "5–7 岁：用简短、具体的问题邀请孩子讲画里的故事；不根据细节判断能力或情绪。",
  "evidence": [{ "entryId": "OBS-elements", "summary": "画面中可以看到树。", "clusterLabel": "可见细节" }],
  "narrative": "这里只记录单幅画里看得见的内容，不推断孩子的情绪。孩子愿意时，可以听听他自己讲的故事。",
  "parentAdvice": ["可以问孩子：……", "让孩子自己决定是否讲述……"],
  "referenceEvidence": [{ "sourceId": "guo-2023-review", "sourceUrl": "https://www.frontiersin.org/journals/psychiatry/articles/10.3389/fpsyt.2022.1041770/full", "text": "研究背景……", "limitation": "适用局限……", "role": "reference_only" }]
}
```

`confidence: 0` 是兼容历史客户端的占位字段，**不是对识图质量的评分**。`evidence` 的 OBS ID 对应 [画面观察词表](../knowledge/observation/catalog.json)。`referenceEvidence` 是一般研究背景，包含 `sourceId,sourceFile,sourceUrl,text,limitation,role:reference_only`，来源于[人工核对目录](../knowledge/psychology/literature/curated-context.json)，不因作品内容而改变。`observationStatus: insufficient` 表示没有足够清晰、位于词表内的细节；不表示没有作品内容。正式结果保存 `provenance`、`analysisScope` 与审计版本；共创报告另有 `provenanceNote`，明确只分析孩子笔迹。生日用于选择 5–7、8–9、10–12 岁的沟通措辞，`ageContext` 向家长说明提问方式；它们不改变画作观察，也不是发展常模或心理评分。生日未知时使用通用提问。

## 儿童可继续绘画的小画册

小画册与分析记录分开保存；保存合成 PNG 与可编辑笔迹文档不依赖模型，提交分析是另一条流程。登录儿童仅可访问自己的图画，家长返回 403、未登录返回 401、其他儿童的作品返回 404。游客在当前浏览器保存，不调用此接口。

- `GET /api/artworks?offset=0`：每页最多 24 幅，按更新时间倒序；返回 `{artworks,nextOffset}`，每项含 `id,revision,createdAt,updatedAt,imageUrl,provenance`。
- `GET /api/artworks/:id`：返回上述字段、`image`（PNG data URL）及存在时的 `document`，用于恢复画布。
- `GET /api/artworks/:id/image`：返回 PNG 图片，使用 Authorization 头取图；所有小画册响应均为 `Cache-Control: no-store`。
- `PUT /api/artworks/:id`：`:id` 为客户端生成的 UUID，请求 `{image,revision,document?}`；新画 revision 为 0，续画携带上次返回的 revision。返回更新后的摘要。相同图像及文档重试不增加版本；版本冲突返回 409。仅接受 PNG，解码上限 10 MiB、像素上限 3200 万，且整条请求仍受 15 MB JSON 限制。

`document` 是数据化操作记录：`{version:1,baseSource:"child"|"unknown",baseImage?,coCreated?:true,operations:[]}`。笔画包含 `type:"stroke"`、`owner:"child"|"nilo"`、`groupId`、`brushKind`、`color`、`size`、`eraser`、`referenceWidth`、`referenceHeight` 及归一化 `points:[{x,y}]`；清空操作为 `{type:"clear",owner:"child",groupId}`。最多 20000 个操作、累计 500000 个点；具体校验见 [canvasDocument.js](../server/src/services/canvasDocument.js)。图像与文档都由当前客户端上传，不能把操作来源标签描述为服务端独立鉴证。

图画存于 SQLite `artworks` 表，随数据库备份，家庭注销时一并删除。保存文档的作品重开后保留笔刷、作者分组及分别撤销能力；无文档的旧 PNG 只能作为底图续画，不能恢复历史笔迹归属。服务端根据文档生成 `provenance`，Nilo 曾参与的作品可保留共创标记。分析历史不自动转换为可编辑画册记录。

## 历史、图片与档案

### GET `/children/:childId/analyses?limit=50&offset=0`

儿童本人或同家庭家长。limit 1–100，offset 非负整数；按创作时间倒序，返回 `{analyses,total,nextOffset}`，末页 nextOffset 为 null。

每项包含 `id,createdAt,imageUrl,rawDescription,feedback,summary,report,provenance,analysisScope,displayScope`；summary 含元素、深色比例和异常特征。家长 report 包含完整已保存报告与 `audit`；儿童历史的 report 恒为 null。前端应读取所有需要的页，不默认只用前 30/50 条。

### GET `/analyses/:analysisId/image`

同家庭家长或作品儿童本人；返回原图二进制。前端使用带头部的 fetch 转 Blob URL，禁止将 token 拼入图片地址。

### POST `/analyses/:analysisId/delete`

仅同家庭家长；成功 `{ok:true}`，删除该分析保存的展示图、分析和单幅报告，同时使该孩子周期摘要失效。**不会删除独立 `artworks` 表中的可续画记录**。数据库失败回滚；已提交后若媒体清理失败，日志记录待处理文件。

### POST `/children/:childId/profile`

仅同家庭家长，`{"birthDate":"2020-01-01"}` 或 `{"birthDate":null}`。日期必须有效、非未来且在支持的儿童年龄范围内，成功 `{ok:true}`。影响后续生成，不自动改写既有报告。

### GET `/children/:childId/trend`

仅同家庭家长。返回 `total,withReport,direction,counts,points,provenanceCounts`。新报告不生成心理走势；`direction` 固定为 `insufficient`。`counts` 区分新画面观察与历史旧版报告，`points` 仅供时间顺序回看，不可据此推断心理变化。

## GET `/children/:childId/digests?kind=weekly&limit=12&offset=0`

仅同家庭家长；kind 为 weekly/monthly，limit 1–100，offset 非负整数。权限通过后补齐已结束周期，返回 `{reports,timeZone:"Asia/Shanghai",total,nextOffset}`。

每份报告包含 `id,kind,periodStart,periodEnd,generatedAt,summary`，时间为 UTC ISO，区间左闭右开；边界按北京时间自然周/月计算。summary 字段：

| 字段 | 含义 |
| --- | --- |
| periodLabel | 可读的起止日期 |
| artworkCount / activeDays | 本期作品数与本地创作日期数 |
| previousArtworkCount / artworkCountChange | 上一个相邻自然周期数量及差值；无记录为 0 |
| withReport / insufficientReports | 已有单幅报告数与其中信息不足数 |
| elements | 最多 12 个 `{name,count}`，同作品同元素只计一次 |
| parentAdvice | 最多 6 条去重的既有建议，未调用模型补写 |
| provenanceCounts | child / coCreated / unknown 来源计数 |
| sources | `{analysisId,createdAt,hasReport,provenance}` 来源作品列表 |
| note | 描述性汇总的范围说明 |

这里的作品计数来自 `analyses`，不包括仅保存、尚未提交分析的画册记录。没有分析记录或尚未结束的周期不生成；有分析但无单幅家长解读仍生成数量摘要。周期按源数据重建，逻辑标识为孩子、周期类型和开始时间；失效重建后 ID 可变化。没有独立 PDF 或邮件发送接口，成长册 HTML 和周期 JSON 由前端下载生成。

## Nilo 共创与语音

以下接口允许游客或儿童账号，正式家长返回 403；全部使用 JSON。详细类型、尺寸限制、取消行为和提供商格式只在 [Nilo API](../server/NILO_API.md) 维护。

| 方法与路径 | 作用 |
| --- | --- |
| POST `/nilo/companion` | 单次视觉规划或无图聊天，返回 reply、状态和可选提案；登录儿童由服务端生日选择 5–7、8–9、10–12 岁对话措辞，游客或生日未知用通用版，客户端年龄无效；年龄不限制绘画题材与几何 |
| GET `/nilo/voice/config` | 返回 `{asr,tts}` 能力，不披露密钥或服务商配置 |
| POST `/nilo/voice/transcribe` | 有限大小音频 → `{text}` |
| POST `/nilo/voice/speak` | 短文本 → `{audioBase64,mimeType}` |

提案没有直接写画布或确认权限。语义澄清为 `status:"clarify"`；绘画服务故障可以 HTTP 200 返回 `status:"unavailable"` 和 `reason/retryable`，不能只用 HTTP 成功判断已生成提案。参数、鉴权和限流仍用对应 HTTP 错误。旧 `/nilo/stroke`、`/nilo/praise` 保留兼容，当前主共创流程使用 `/companion`。

## 健康与请求边界

GET `/health` → `{ok:true}`，只说明进程响应，不验证模型或文献索引。

默认限流按客户端 IP：全局 600 次/15 分钟，认证 20 次/15 分钟，analyze 和 report 各 60 次/小时；共创及兼容绘画接口共享 24 次/分钟，ASR/TTS 分别 36 次/分钟，语音能力查询 60 次/分钟。各独立额度仍受全局保护，环境变量见 [部署](部署.md)。CORS 白名单默认 localhost:5173，同域生产不依赖跨域许可。限流为进程内实现。

当前没有支付、订单、邮件/站外推送、家长自由聊天、找回密码或第二位家长加入家庭的后端接口；不应从界面入口名称推断它们已经存在。
