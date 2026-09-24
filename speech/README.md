# Nilo 本地语音识别试验

这条链路可切换 Paraformer（热词）或 SenseVoiceSmall，并用同一批录音与浏览器识别对比。**未完成真实儿童录音评测前，不替换默认浏览器识别。** VAD 负责判断说话停顿，不是降噪器；识别文字之后的意图理解仍使用项目已有模型。

## 安装与启动（Windows / PowerShell）

在仓库根目录执行。示例复用本机 Anaconda，在 `.tmp` 中隔离依赖：

```powershell
& 'D:\Program Files\Anaconda\python.exe' -m venv .tmp\voice-conda-env
& .tmp\voice-conda-env\Scripts\python.exe -m pip install -r speech\requirements.txt
$env:MODELSCOPE_CACHE = "$PWD\.tmp\voice-models"
$env:LUMA_ASR_MODEL = 'paraformer' # 或 sensevoice
$env:LUMA_ASR_DEVICE = 'cpu'
& .tmp\voice-conda-env\Scripts\python.exe -m uvicorn app:app --app-dir speech --host 127.0.0.1 --port 8765 --no-access-log
```

第一次启动会下载模型，`GET http://127.0.0.1:8765/health` 返回 `ready:true` 后再连接应用。CPU 是基准配置；GPU 需另外安装与显卡兼容的 PyTorch，并确认 `torch.cuda.is_available()` 后才能改成 `cuda`。模型名称固定映射，不允许请求加载任意仓库代码。

在 `server/.env` 中配置并重启 Node 后端：

```dotenv
VOICE_PROVIDER=funasr
VOICE_BASE_URL=http://127.0.0.1:8765/v1
VOICE_ASR_MODEL=paraformer
VOICE_API_KEY=
VOICE_TIMEOUT_MS=20000
```

两处模型名必须一致。切换 SenseVoice 需要重启 Python 服务，更新 Node 配置并重启。FunASR 只提供 ASR，Nilo 语音回复使用浏览器现有合成音色，文字保留；未接入 CosyVoice。浏览器录音路径会按需加载同源 Silero VAD；加载失败保留能量检测，仍可手动“说完了”。入口仅由麦克风按钮或连续对话开启，点击 Nilo 不开麦。

默认只监听本机且不保存音频。跨机器部署时必须设置服务端 `LUMA_ASR_TOKEN` 与 Node `VOICE_API_KEY`，通过 HTTPS/内部网络连接；手机浏览器只访问 Node，不直连 8765。输入限定 16 kHz、单声道、PCM16 WAV，前端最长录制 20 秒（服务允许 1 秒编码尾部/计时误差，不裁掉末尾内容），一次只处理一段，繁忙返回 429。

回退：恢复原 `VOICE_PROVIDER` 配置或清空 `VOICE_BASE_URL` 后重启 Node；浏览器有识别能力时使用浏览器，否则显示不可用，不伪造成功。

## 录音对比

由成年人先录制下面 10 句，每句做安静、背景音乐、轻微环境噪声三个版本，共 30 段。真实儿童试用另行在监护人同意下进行，不把录音加入 Git。首次模型推理的预热时延单独看。

1. 太阳。
2. 只画一半的太阳，放在左上角。
3. 不要红色，要蓝色。
4. 不是右边，是左边那只小鸟。
5. 把它缩小一点，再往上移。
6. 不要删掉它。
7. 这个人叫蔡阳。
8. 先别画，我还没有说完。
9. Draw half a sun in the top left corner.
10. Make it smaller, but do not move it.

在 `.tmp/voice-recordings/cases.json` 写清每段的实际内容和浏览器结果（浏览器基线需在同一设备实测，不能用模型结果代替）：

```json
[
  {"id":"half-quiet","file":"half-quiet.wav","reference":"只画一半的太阳，放在左上角","required":["一半","太阳","左上角"],"locale":"zh","condition":"quiet","browserTranscript":"这里填写真实浏览器识别结果","browserLatencyMs":null}
]
```

```powershell
& .tmp\voice-conda-env\Scripts\python.exe speech\evaluate.py .tmp\voice-recordings\cases.json --model paraformer --output .tmp\paraformer.json
& .tmp\voice-conda-env\Scripts\python.exe speech\evaluate.py .tmp\voice-recordings\cases.json --model sensevoice --output .tmp\sensevoice.json
& .tmp\voice-conda-env\Scripts\python.exe speech\evaluate.py .tmp\voice-recordings\cases.json --model browser --output .tmp\browser.json
```

报告只保存 CER、关键短语保留率、推理时间和样本编号，不保存录音/转写。否定词、半形和位置须另外核对实际投影，CER 不等于意图理解准确率。自建服务无按次识别 API 费用，但需要算力、模型存储和运维；已有文字理解模型费用仍存在。

## 来源与下一步

- [FunASR](https://github.com/modelscope/FunASR)：代码 MIT，模型许可单独核对。Paraformer 支持热词；不要把这一能力算给 SenseVoice。
- [SenseVoiceSmall](https://huggingface.co/FunAudioLLM/SenseVoiceSmall)：仅保留转写文字，剔除情绪/事件标签。
- [Silero VAD](https://github.com/snakers4/silero-vad) 与 [浏览器封装](https://github.com/ricky0123/vad)：MIT 模型 / ISC 封装；许可证随前端产物发布。
- CosyVoice 音色试验、RNNoise 降噪：等待录音对比证明收益后再接入，本次不声称已启用或已提升真实儿童识别率。

## 本机验证记录（2026-09-24）

已在用户 Anaconda Python 3.13.9 创建的隔离环境安装并运行两个模型，`pip check` 通过。四句 Windows 慧慧合成语音中，SenseVoice 的规范化 CER 为 0，Paraformer 为 7.4%；其中姓名句 Paraformer 有一字错误。CPU 单句识别约 0.11–0.36 秒，不包含模型下载/加载、网络、录音等待或后续模型理解。这不是儿童真实识别率，也没有浏览器同录音基线，不据此替换默认 ASR。

SenseVoice 完整 HTTP 上传测试保留“一半、太阳、左上角”；前端发布的 Silero 模型和 WASM 已运行静音/合成语音推理。统计详见 [合成冒烟报告](evals/2026-09-24-synthetic.json)。前后端相关回归共 279 项，Python 合约测试 7 项通过；整体/独立儿童端构建通过。首次启用服务端录音会按需下载约 16 MB 的未压缩 VAD 模型与运行时资源，配置 gzip/Brotli 后传输更小，后续由浏览器缓存。
