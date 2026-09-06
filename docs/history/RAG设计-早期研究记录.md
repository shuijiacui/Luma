# RAG 设计

> 知识库数据 schema、匹配算法、阈值策略。MVP 阶段：JSONL + 标签匹配，不用向量库。

## 为什么不用向量检索

- 条目量级 < 100，标签匹配可解释、可单测、可追溯到文献
- 情绪判定要求"每条判定引用条目 ID"，精确匹配天然满足
- 向量检索留 v2（条目量大或需要语义泛化时再引入）

## 数据格式（knowledge/entries.jsonl，每行一个 JSON）

```json
{
  "id": "HTP-001",
  "featureMatch": {
    "elements": ["sun"],
    "colors.darkRatioMin": 0.6
  },
  "emotionSignal": "低落倾向",
  "cluster": "dark_color",
  "strength": 0.6,
  "reliability": 0.7,
  "source": "文献出处（书名/章节/DOI）",
  "note": "太阳涂黑仅作为弱信号，需与其他特征共现"
}
```

### 字段约束

| 字段 | 必填 | 约束 |
|------|------|------|
| `id` | ✅ | 全局唯一，格式 `XXX-000` |
| `featureMatch` | ✅ | 匹配条件，见下表 |
| `emotionSignal` | ✅ | 枚举：乐观平稳 / 焦虑倾向 / 低落倾向（"需要关注"和"信息不足"由评分逻辑产生，不允许作为条目信号） |
| `cluster` | ✅ | 相关性簇标识。共享同一底层视觉观察的条目必须同簇（如 `dark_color`、`figure_size`、`line_pressure`），簇内取 max 防重复计数 |
| `strength` | ✅ | 关联强度 s ∈ (0,1]：文献报告的效应量；无数据时专家标定 |
| `reliability` | ✅ | 信源折扣 r：meta分析 0.9 / 同行评审单研究 0.7 / 专著或经典体系 0.5 / 论文内定性观察（无统计验证） 0.3 / TBD 0.1（Shafer discounting） |
| `source` | ✅ | 真实文献出处；查不到标 "TBD" 且 reliability 必须 = 0.1——**不允许臆造出处和权重** |
| `note` | 可选 | 判定解读备注，展示在结果页 |

### featureMatch 支持的条件

| 条件 | 匹配逻辑 |
|------|----------|
| `elements: [...]` | features.elements 包含全部列出的元素 |
| `colors.darkRatioMin: n` | features.colors.darkRatio ≥ n |
| `colors.dominantIncludes: [...]` | 主色包含任一列出颜色 |
| `composition.size: "small"` | 相等匹配（size/position/pressure 同理） |
| `distortions: [...]` | features.distortions 包含全部列出项 |
| `erasureMarksMin: n` | features.erasureMarks ≥ n |

所有条件**全部满足**才算命中（AND 逻辑）。

## 特征可信度过滤（入口防幻觉）

特征提取（多模态 LLM）是幻觉高发环节，必须先把住入口：

1. LLM 输出特征时，**每个特征必须带 `confidence`（0~1）**
2. server 端丢弃 `confidence < 0.5` 的特征，不进检索
3. LLM 必须先输出画面描述再给特征，描述原文入库，供人工抽查比对

垃圾特征不进 RAG，比事后校验判定更重要。

## 检索算法（server/src/services/retrieve.js）

1. 冷启动加载 entries.jsonl 到内存（支持依赖注入便于测试）
2. 遍历条目，逐一检查 featureMatch 条件
3. 命中条目按 `strength × reliability` 降序返回（LLM 特征置信度 c 只做门控，不参与任何权重计算——v2.2）

## 评分与置信度 v2（server/src/services/score.js）

> 数学依据见文末「公式来源与审查记录」。v1 的 `1-Π(1-w)` 直接合成已废弃——它等价于 MYCIN CF 合并函数，要求证据条件独立，而我们的特征彼此相关，会重复计数。

### Step 1: 有效权重 = 关联强度 × 信源折扣（带上限截断）

```
w_eff = min(s · r, 0.9)
```

> 注（v2.3，交叉验证修正）：当前 r 枚举最大 0.9 且 s ≤ 1，s·r 数学上不可能超过 0.9——**该截断当前不生效**，保留仅为未来扩展 r 枚举时的保险。防单条证据定案的真正防线是 Step 6 规则 5（≥2 独立簇），不要依赖此截断。

| 因子 | 含义 | 取值 |
|------|------|------|
| `s` | 关联强度（文献报告的效应量，无数据时专家标定） | 0-1 |
| `r` | 信源可靠度折扣（Shafer discounting） | meta分析 0.9 / 同行评审单研究 0.7 / 专著或经典体系 0.5 / 论文内定性观察（无统计验证） 0.3 / TBD 0.1 |

依据：Shafer (1976) 折扣模型 `Bel' = (1-α)·Bel`，将来源不可靠性显式计入，而非隐含在拍脑袋权重里。

**⚠️ v2.2 变更：LLM 特征置信度 c 退出权重公式，降级为纯门控**（保留/丢弃，阈值 0.5，见「特征可信度过滤」）。原因（交叉验证发现）：
1. LLM 自评置信度**未经校准**（过自信是已知现象），代入贝叶斯合成在数学上不合法
2. 三因子连乘过度惩罚：旧公式 s·r·c = 0.6×0.7×0.7 = 0.294，三个中等证据合流 posterior 仅 0.696，无法越阈——与"筛查工具应能识别中度风险"的目标冲突
3. r（信源级折扣）与 c（样本级置信）语义不同，混为一个权重会模糊风险来源

上限 0.9 截断防止单条完美证据直接推满 noisy-OR。

### Step 2: 相关性聚类（消除重复计数）

共享同一底层视觉观察的条目**不是独立证据**，必须先去重：

- 条目带 `cluster` 字段（如 `cluster: "dark_color"` 涵盖 darkRatioMin、blackened_sun、dominantIncludes(black)）
- **簇内取 max**：`w_cluster = max(w_eff in cluster)`——同一观察的多个条目只算最强的一个
- 簇间才视为近似独立

**已知局限（v2.2 交叉验证记录）**：跨簇相关性未完全消除（如 `dark_color` 与 `line_pressure` 在焦虑儿童中常共现）。MVP 阶段接受此近似，预留 `crossClusterDiscount` 配置（默认 1.0，命中已知强相关簇对时对次强簇打折），v2 用标注数据标定。cluster 标定规则：条目入库时由双人标注，分歧时合并为同簇。

### Step 3: 簇间合成（noisy-OR）

```
E = 1 - Π(1 - w_cluster)     E ∈ [0,1)：该情绪状态下出现这组特征的证据强度
```

仅用于簇间合成，且输入已被聚类去相关，缓解 MYCIN 的小证据膨胀缺陷（Buchanan & Shortliffe 1984 指出的 "many small pieces boost every hypothesis to 0.99"）。

### Step 4: 贝叶斯式校准（引入基率）

> ⚠️ 术语说明（v2.3，交叉验证修正）：E 是人工压缩的**证据强度评分**，不是真正意义上的 P(features|emotion)（我们没有真实的 sens/spec 数据）。因此本层输出称为 **posterior_score**，公式是 **Bayesian-inspired calibration**（贝叶斯式校准），不是严格的贝叶斯后验。v2 若积累到标注数据，应升级为真正的 log-odds + LR 框架。路演答辩时不得称其为"贝叶斯后验概率"。

纯证据合成忽略患病率基率，筛查场景下会严重失校准。按 naive Bayes 框架引入先验：

```
posterior_score = E·prior / (E·prior + fpr·(1-prior))
```

| 参数 | 含义 | 默认值（env 可覆盖） |
|------|------|------|
| `prior` | 该情绪倾向在目标人群（儿童）的基率 | 0.15（低落/焦虑），0.60（乐观平稳） |
| `fpr` | 假阳性率：非困扰儿童出现该特征组合的概率 | **0.05**（经阈值可达性约束反推，见下） |

**⚠️ 阈值可达性约束（v2.1 修复，原 fpr=0.30 在数学上使低落/焦虑永远无法输出）：**

判定规则要求 posterior ≥ 0.7 才输出。即使证据完美（E=1），posterior 上限为：

```
posterior_max = prior / (prior + fpr·(1-prior))
```

代入 prior=0.15、fpr=0.30 得 0.37 < 0.7——**负面倾向永远无法输出，系统退化为永远"信息不足"**。

由此反推硬约束（score.js 每次读取配置时必须断言，非仅启动时）：

```
fpr ≤ prior·(1-threshold) / (threshold·(1-prior))
    = 0.15·0.3 / (0.7·0.85) ≈ 0.076     → 取 fpr = 0.05（留安全边际）
```

注意：该约束保证的是 **E=1 的理论可达性**（必要条件），不保证典型证据强度下的实际可达性（交叉验证 #1）。v2.2 将 c 移出权重公式后，典型场景验算：2 簇（s·r=0.42 各一）E=0.66 → posterior=0.70 贴阈；3 簇 E=0.80 → posterior=0.74 ✅。实际可达性最终由回归测试集验证（Task 10 用例 7）。

另注意：`prior=0.60` 的乐观平稳组后验由基率主导，弱证据下也容易越阈——这是设计意图（无预警信号即偏乐观），安全阀是 Step 6 的**乐观抑制规则**，而非调高其阈值。排名比较使用**未截断** posterior，天花板只作用于展示值（避免多组并列 0.85 失去区分度）。

### Step 5: 效度天花板（硬性上限）

Lin et al. (2022, *Acta Psychologica*, n=4196) 实证：HTP 指标与心理健康无可靠关联。因此：

```
confidence_final = min(posterior, CONFIDENCE_CEILING)    CONFIDENCE_CEILING = 0.85
```

**任何情况下置信度不得超过 0.85**——这不是技术限制，是对底层测量工具效度争议的诚实表达。

### Step 6: 判定规则（v2.3 完整决策序）

> 术语：posterior_score 以下简称"分值"；**排名比较一律用未截断分值**，天花板只作用于展示值。每个情绪组**独立统计自己命中的簇数**。

按顺序执行，命中即停：

1. **提取质量闸**：全部特征维度被 L1→L2 闸门丢弃（提取失败）→ **信息不足**（"本次未能看清画面，建议再画一张"）
2. **零命中分支**：特征有效但知识库零命中 → **未见明显风险信号**，展示分值 = prior_positive = 0.60。**命中后立即终止决策流程，不计算情绪组候选分值、不执行规则 3-7**（防工程实现漏 early-return，终审 P2 修正）。**不输出"乐观平稳"**——零命中是 missing evidence（知识库没覆盖），不是 positive evidence（发现积极证据），两者统计含义不同（交叉验证 R2 修正）
3. **乐观抑制（安全阀）**：任一负面组分值 ≥ 0.4 → "乐观平稳"从候选集中**删除**（不参与排序、不可输出；负面组之间排序不受影响）
4. **弱预警与冲突带**：满足以下任一 → **需要关注**：
   - a. 任一负面组分值 ∈ [0.4, 0.7)（不论簇数）
   - b. **两个及以上负面组分值 ≥ 0.7**（多方向信号——各组分值是独立二分类校准值，不是归一化概率，不能直接"最高者胜出"）
   - c. 候选最高组分值 ≥ 0.7 但与次高组差 < 0.1（区分度不足）
   - d. 任一负面组分值 ≥ 0.7 且乐观组分值 ≥ 0.5（方向冲突——预警信号与积极信号同时强）
   - e. 负面组仅 1 个簇命中但分值 ≥ 0.7（单簇不定案）
5. **最低证据数**：负面组输出倾向判定必须 **≥2 个独立簇命中**（该组自己的簇计数）；单簇最高只能落入规则 4
6. **主判定**：候选组中未截断分值最高且 ≥ 0.7，且与次高组差 ≥ 0.1 → 输出该倾向，展示值经天花板截断
7. **兜底**：以上均未命中 → **信息不足**
8. **输出红线**：文案正则不含疾病词；引用条目 ID 必须在 entries.jsonl 真实存在，否则降级"信息不足"
9. **参数自校验**：每次读取配置时断言 `fpr ≤ prior·(1-threshold)/(threshold·(1-prior))`，不满足则拒绝加载

## 公式来源与审查记录

| 公式/机制 | 来源 | 审查结论 |
|-----------|------|----------|
| MYCIN CF 合并 `CF1+CF2-CF1·CF2` | Buchanan & Shortliffe (1984) Rule-Based Expert Systems, Ch.36 | ⚠️ 采用但改良：仅簇间使用 + 簇内 max 去重，规避独立性假设和小证据膨胀 |
| CF 的概率解释与独立性缺陷 | Heckerman, *Probabilistic Interpretations for MYCIN's Certainty Factors*, arXiv:1304.3419 | 证实必须条件独立 → 引入聚类 Step 2 |
| 信源折扣 `Bel'=(1-α)·Bel` | Shafer (1976) A Mathematical Theory of Evidence; Sentz & Ferson (2002) Sandia Report | ✅ 采纳为 Step 1 的 r 因子 |
| D-S 冲突处理（Zadeh 反例、Yager 规则） | Sentz & Ferson (2002); Yager (1987) Information Sciences | ⚠️ 不用 Dempster 合成规则（高冲突下反直觉）；冲突显式输出"需要关注" |
| 先验/基率 + log-odds 累加 | naive Bayes 标准框架（scikit-learn priors 文档；IBM Naive Bayes） | ✅ 采纳为 Step 4 |
| 筛查场景 sens/spec 与失校准 | 乳腺癌 NB 筛查 (preprints.org 2024)；COVID NB 筛查 (ScienceDirect) | 佐证 Step 4 必要性 |
| HTP 效度质疑 | Lin et al. (2022) Acta Psychologica 230:103734（n=4196, DNN）；Lilienfeld et al. (2000) PSPI 1(2):27-66 | ✅ 采纳为 Step 5 天花板 + 情绪判定标准.md 免责声明 |
| 结构化评分的正面证据 | Guo et al. (2022) Frontiers in Psychiatry 13:1041770（HTP meta分析，DOI: 10.3389/fpsyt.2022.1041770）；TDT-SIAS (2025) Frontiers（sens 0.935/spec 0.966） | 支持"结构化特征评分"路线优于整体印象式解读 |
| 阈值可达性约束 `fpr ≤ prior(1-θ)/(θ(1-prior))` | 由 Bayes 公式直接推导（v2.1 自审发现原 fpr=0.30 使负面组永不可达阈值） | ✅ 采纳为配置断言 + 默认值 fpr=0.05；仅为必要条件，典型证据可达性由回归测试验证 |
| 乐观抑制规则（负向信号存在时禁报乐观） | 筛查系统设计通则：漏报代价 ≫ 误报代价（"宁可信其有"讨论共识的形式化） | ✅ 采纳为 Step 6 规则 3 |
| LLM 自评置信度未校准，不得入贝叶斯合成 | 交叉验证 Round 1（claude-opus-4-7，2026-07-25）：LLM confidence 过自信是已知现象；连乘过度惩罚使典型证据无法越阈 | ✅ v2.2：c 退出 w_eff，降级为纯门控（≥0.5 保留） |
| 乐观抑制 + 负面∈[0.4,0.7) 存在未定义真空档 | 交叉验证 Round 1（claude-opus-4-7） | ✅ v2.2：Step 6 规则 5 弱预警带 → "需要关注" |
| 单簇命中即可触发判定 | 交叉验证 Round 1（claude-opus-4-7） | ✅ v2.2：Step 6 规则 4 最低 2 独立簇 |
| 天花板参与排名造成多组并列 | 交叉验证 Round 1（claude-opus-4-7） | ✅ v2.2：排名用未截断 posterior，天花板只作用于展示 |
| 空证据（零命中）与提取失败混淆 | 交叉验证 Round 1（claude-opus-4-7） | ✅ v2.2：Step 6 规则 1/2 拆分为两个分支 |
| 跨簇相关性未完全消除 | 交叉验证 Round 1（claude-opus-4-7） | ⚠️ 已知局限：预留 crossClusterDiscount 配置，v2 标定；cluster 入库双人标注 |
| w_cluster 无上限 | 交叉验证 Round 1（claude-opus-4-7） | ✅ v2.2：w_eff = min(s·r, 0.9) |
| reliability 枚举值未离散校验 | 交叉验证 Round 1（claude-opus-4-7） | ✅ v2.2：validate.mjs 校验 r ∈ {0.1,0.3,0.5,0.7,0.9} |
| 多负面组同时过阈——二分类分值被误当三分类竞争 | 交叉验证 Round 2（o3-pro，2026-07-25）验算：低落 0.738 / 焦虑 0.726 可双过阈 | ✅ v2.3：规则 4b/4c——多组过阈或最高-次高差 <0.1 → "需要关注" |
| `min(s·r, 0.9)` 为死代码（r≤0.9 → s·r≤0.9 恒成立） | 交叉验证 Round 2（o3-pro） | ✅ v2.3：注明截断当前不生效，真正防线是 ≥2 簇规则 |
| 零命中输出"乐观平稳"混淆 missing/positive evidence | 交叉验证 Round 2（o3-pro） | ✅ v2.3：新增第 6 输出态"未见明显风险信号" |
| E 非真正概率，Bayes 公式只有概率外观 | 交叉验证 Round 2（o3-pro） | ✅ v2.3：改名 posterior_score，标注 Bayesian-inspired calibration；v2 有标注数据后升级 log-odds + LR |
| 被抑制乐观组是否参与排序未定义；簇计数方式未定义 | 交叉验证 Round 2（o3-pro） | ✅ v2.3：明确从候选集删除、每组独立计数 |
| "相反方向两组"语义模糊；负面≥0.7+乐观≥0.5 冲突未覆盖 | 交叉验证 Round 2（kimi-k2.5） | ✅ v2.3：规则 4d 方向冲突 → "需要关注" |
| 规则 2 零命中分支终止语义未显式化，工程实现可能漏 early-return | 交叉验证 Round 3 终审（o3-pro）：逐条推演 0.4/0.5/0.7 全部临界值后确认唯一剩余问题（P2） | ✅ v2.3 终稿：规则 2 显式"命中后立即终止，不执行规则 3-7" |

**交叉验证终审结论（o3-pro, Round 3）**：Step 6 决策序对 0.4/0.5/0.7 全部临界值推演无空档、无规则矛盾；**无 P0/P1 级问题，算法收敛**。

## 校验脚本（knowledge/scripts/validate.mjs）

- 逐行 JSON.parse，校验必填字段、emotionSignal 枚举、strength 取值范围
- reliability 必须 ∈ {0.1, 0.3, 0.5, 0.7, 0.9}（离散枚举，不允许中间值）
- 额外校验：`source: "TBD"` 的条目 `reliability` 必须 = 0.1
- 任一条目非法 → 退出码 1（CI/提交前必跑）

## 种子数据原则

- ≥10 条，覆盖房树人经典特征
- **每条必须有真实文献出处**；查不到的 `source: "TBD"` 且 `reliability = 0.1`
- 弱信号条目（如单一的"太阳涂黑"）strength 必须低到无法单独越阈
- 同一视觉观察派生的条目必须归入同一 `cluster`（如 darkRatioMin / blackened_sun / dominant(black) 同属 `dark_color` 簇）
