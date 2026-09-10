# API 契约

> 更新于 2026-09-08。Base URL：`http://localhost:3001/api`。除图片接口外，请求/响应为 JSON；受保护请求带 `Authorization: Bearer <token>`，不支持 URL token。

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
| 429 | 超出限流，响应含 Retry-After |
| 500 | 内部错误或分析持久化失败 |
| 502 | 视觉服务、输出解析或特征验证失败 |

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
  "imageBase64": "完整图片的base64或支持的data:image/...;base64前缀",
  "submissionKey": "client-generated-id",
  "source": "digital_canvas"
}
```

支持 PNG/JPEG/JPG/WebP 数据前缀；纯 base64 默认按 PNG 元数据保存。解码上限 10 MiB，请求 JSON 上限 15 MB。`submissionKey` 可省略，长度 1–100，限字母、数字、下划线和连字符；正式孩子同键同图像返回同一作品，不同图像返回 409。`priorFeatures` 为旧兼容字段，现忽略；每次处理完整快照。

成功 200：`{features,feedbackText,followUp,analysisId?}`。正式儿童必有 `analysisId` 并持久化；游客无该字段。反馈为模板化画面描述，固定开放问题为“想再画点什么吗？”。

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

`rawDescription` 最长 10000 字符；数组最多 100 项、字符串项最长 100。数值须有限，置信度及颜色比例为 0–1。构图 size 为 small/normal/large，position 为 center/corner/edge，pressure 为 light/normal/heavy。

逐维置信度低于 0.5 的维度被门控：元素/异常数组可为空，颜色/构图可为 null，涂改数可清零；响应可含 `droppedDimensions`。数字画板标记使笔压/涂改次数规则不参与评分，这些估计字段不代表真实过程测量。AI 描述不是孩子原话。

## POST `/report`

正式报告只接受同家庭家长 token，并由服务端读取作品：

```json
{ "analysisId": "作品UUID" }
```

忽略客户端替换特征和年龄，按账户生日计算当前年龄；未填生日则不推测。匿名允许 `{features,childAge?}` 的临时演示（年龄 0–18），不保存；匿名带真实 analysisId 返回 401；儿童调用返回 403。

成功 200 的基础字段：

```json
{
  "emotion": "信息不足",
  "confidence": 0,
  "evidence": [],
  "parentAdvice": ["本次画面信息不足，建议继续观察"]
}
```

`emotion`：乐观平稳 / 未见明显风险信号 / 焦虑倾向 / 低落倾向 / 需要关注 / 信息不足。`evidence` 每项有 `entryId,summary`，通俗化后可有 `plain`。`confidence` 是启发式参考值：信息不足为 0，零命中默认 0.60；“需要关注”可能来自低于主阈值的弱信号。默认展示上限 0.85，不是准确率。

可选字段 `narrative`、`webAdvice`、`webAdviceSource`、`referenceEvidence`、`referenceEvidenceSource` 见前端 `ReportResponse` 类型。增强受 `REPORT_BUDGET_MS` 总预算约束；失败/超时返回基础报告。正式结果带审计落库，并使该孩子周期摘要失效以待重建。

## 儿童可继续绘画的小画册

小画册与分析记录分开保存，点「保存」或「完成」先保存透明 PNG；「完成」随后调用分析，分析失败不影响继续绘画。登录儿童仅可访问自己的图画，家长返回 403、未登录返回 401、其他儿童的作品返回 404。游客在当前浏览器保存，不调用此接口。

- `GET /api/artworks?offset=0`：每页最多 24 幅，按更新时间倒序；返回 `{artworks,nextOffset}`，每项含 `id,revision,createdAt,updatedAt,imageUrl`。
- `GET /api/artworks/:id`：返回上述字段和 `image`（透明 PNG data URL），用于恢复画布。
- `GET /api/artworks/:id/image`：返回 PNG 图片，使用 Authorization 头取图；所有小画册响应均为 `Cache-Control: no-store`。
- `PUT /api/artworks/:id`：`:id` 为客户端生成的 UUID，请求 `{image,revision}`；新画 revision 为 0，续画携带上次返回的 revision。返回更新后的摘要。相同图像重试不增加版本，不新增作品；版本冲突返回 409，前端保留当前画布并提示下载后重新打开。仅接受 PNG，解码上限 10 MiB、像素上限 3200 万。

图画存于 SQLite `artworks` 表，随数据库备份；注销家庭时一并删除。重新打开保留已保存的画面作为撤销起点，可以继续绘画、擦除及撤销本次新增笔画。旧的分析历史仍使用下节接口，不自动转换为可编辑画册记录。

## 历史、图片与档案

### GET `/children/:childId/analyses?limit=50&offset=0`

儿童本人或同家庭家长。limit 1–100，offset 非负整数；按创作时间倒序，返回 `{analyses,total,nextOffset}`，末页 nextOffset 为 null。

每项包含 `id,createdAt,imageUrl,rawDescription,feedback,summary,report`；summary 含元素、深色比例和异常特征。家长 report 包含完整已保存报告与 `audit`；儿童历史的 report 恒为 null。前端应读取所有需要的页，不默认只用前 30/50 条。

### GET `/analyses/:analysisId/image`

同家庭家长或作品儿童本人；返回原图二进制。前端使用带头部的 fetch 转 Blob URL，禁止将 token 拼入图片地址。

### POST `/analyses/:analysisId/delete`

仅同家庭家长；成功 `{ok:true}`，删除原图、分析和单幅报告，同时使该孩子周期摘要失效。数据库失败回滚；已提交后若媒体清理失败，日志记录待处理文件。

### POST `/children/:childId/profile`

仅同家庭家长，`{"birthDate":"2020-01-01"}` 或 `{"birthDate":null}`。日期必须有效、非未来且在支持的儿童年龄范围内，成功 `{ok:true}`。影响后续生成，不自动改写既有报告。

### GET `/children/:childId/trend`

仅同家庭家长。返回 `total,withReport,direction,counts,points`。direction 为 insufficient/stable/watch：报告少于 2 份不足；最近 3 份有关注/焦虑/低落则 watch；近期全为正分值的乐观或未见风险则 stable，其余 insufficient。points 为最近 10 份报告时间正序，counts 汇总全部报告。只是历史描述，不是心理变化预测。

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
| sources | `{analysisId,createdAt,hasReport}` 来源作品列表 |
| note | 描述性汇总的范围说明 |

无作品和进行中周期不生成；有作品但无单幅解读仍生成数量摘要。没有独立 PDF 或邮件发送接口。成长册 HTML 和周期 JSON 由前端下载生成。

## 健康与请求边界

GET `/health` → `{ok:true}`，只说明进程响应，不验证模型或文献索引。

默认限流按客户端 IP：`/api` 600 次/15 分钟，`/api/auth/*` 20 次/15 分钟，analyze 和 report 各 60 次/小时，可通过环境变量调整。CORS 白名单默认 localhost:5173，同域生产不依赖跨域许可。限流为进程内实现。
