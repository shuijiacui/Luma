# 文献提取：FBANet（Entropy 2023, 25, 1350）

> 原文存档：[references/FBANet-Entropy2023.pdf](references/FBANet-Entropy2023.pdf)（开放获取 CC-BY）
> Wang, H.; Zhang, J.; Huang, Y.; Cai, B. FBANet: Transfer Learning for Depression Recognition Using a Feature-Enhanced Bi-Level Attention Network. *Entropy* **2023**, *25*, 1350. DOI: 10.3390/e25091350

## ⚠️ 先说结论：这篇论文没有可提取的"特征统计表"

FBANet 是**纯像素深度学习模型**（ResNet50 + 特征增强 + 双层注意力），端到端吃图片出分类，**全程没有人工特征、没有"特征×抑郁"的条件概率/均值分布表**。Data Availability Statement: **Not applicable**——数据集不公开。

它能给我们的不是概率数据，而是三样东西：**定性特征信号清单、可解释路线的性能证据、真正含特征知识的文献线索**。

## 提取 1：定性特征信号（Figure 5 作者观察 + Grad-CAM 热力图）

论文 Figure 5 对比健康/抑郁画作，作者明确写出的区分性特征（抑郁组）：

| 特征信号 | 论文原文描述 | 出处 |
|---------|-------------|------|
| 雨滴/落雨 | falling raindrops → low mood and depression | Fig 5c 说明 |
| 枯树 | withered trees → low mood and depression | Fig 5c 说明 |
| 单线树干 | single-line trunks → low mood and depression | Fig 5c 说明 |
| 笔触过重 | heavy brush strokes → severe psychological depression | Fig 5d 说明 |
| 树干深黑 | dark tree trunks → severe psychological depression | Fig 5d 说明 |
| 枝条杂乱 | disorderly branches → severe psychological depression | Fig 5d 说明 + Grad-CAM(d) 聚焦区 |
| 吊着的人/天使 | hanging angel → severe psychological depression | Fig 5d 说明 + Grad-CAM(d) 聚焦区 |
| 落泪 | falling tears → severe psychological depression | Fig 5d 说明 |
| 墙体裂纹 | cracked walls → severe psychological depression | Fig 5d 说明 + Grad-CAM(d) 聚焦区 |

健康组 Grad-CAM（Fig 7a,b）：注意力均匀分布在房/树/人三主体，聚焦树枝、房子中部、人物上半身——即"画面结构完整、分布均衡"本身是健康信号。

⚠️ 这些是**作者对 4 张示例图的定性描述，不是统计结论**。转成知识库条目时 weight 应保守（建议 ≤0.3），source 标注 "Entropy 2023, 25, 1350, Fig 5/7（定性观察）"。

## 提取 2：可解释路线的性能证据（Table 4）

| 方法 | 特征类型 | 平均准确率 |
|------|---------|-----------|
| Zhang et al. [21] | **可解释像素统计**（有效像素均值/熵、角点数）+ SVM | 91.33% |
| Pan et al. [17] | **可解释空间/阴影特征**（R-CNN 定位 + 二值化阴影）+ SVM | 85.55% |
| FBANet（本文） | 像素端到端（黑盒） | 97.71% |

**对我们的意义**：可解释特征 + 传统分类器能到 85–91%，证明"特征工程路线"不是玩具——我们知识库标签匹配 + 概率比对的路线有文献背书。FBANet 的 97.71% 是 1615 张小样本五折交叉验证结果，且作者自认局限：**非抑郁类识别率明显低于抑郁类**（类不平衡 1296:319），泛化未验证。

## 提取 3：真正含特征知识的文献线索（下一步要抓的）

| 编号 | 文献 | 有什么 | 优先级 |
|------|------|--------|--------|
| [39] | Li, C.Y. et al. *The Development of a Scoring System for the Kinetic House-Tree-Person Drawing Test*. Hong Kong J. Occup. Ther. 2011, 21, 72–79 | **35 个 HTP 绘画特征评分体系**，Rasch 模型验证有效性——这是结构化特征知识的最佳来源 | ⭐⭐⭐ |
| [21] | Zhang, J. et al. *Feasibility study on using HTP drawings for automatic analysis of depression*. Comput. Methods Biomech. Biomed. Eng. 2023 | 有效像素均值/熵、角点数 → 可转成 `colors.darkRatio` 类数值条件的阈值依据 | ⭐⭐ |
| [17] | Pan, T. et al. *Automated Drawing Psychoanalysis via HTP Test*. ICTAI 2022 | 阴影特征、空间定位特征的定义与处理流程 | ⭐⭐ |
| [7] | Buck, J.N. *The H-T-P test*. J. Clin. Psychol. 1948 | 房树人经典解释体系源头（门大小→社交开放性等） | ⭐⭐ |
| [8] | Burns, R.C. *Kinetic House-Tree-Person Drawings: K-H-T-P: An Interpretative Manual*. 1987 | 动态房树人解释手册 | ⭐ |
| [40][41] | Hu et al. 2015（芦山地震初中生）/ Yan et al. 2014（高中生抑郁状态） | **中文儿童/青少年样本**，与我们目标人群最匹配 | ⭐⭐⭐ |

## 对我们知识库的直接结论

1. **贝叶斯条件概率目前无公开数据可填**——这篇没有，需抓 [39] Li et al.（35 特征 + Rasch 校验，可能有特征频率统计）。在此之前条目继续用 weight 叠加，不硬凑概率（硬凑 = 我们自己制造幻觉）。
2. 上表 9 个定性特征可先转种子条目，全部按"定性观察"保守赋权，且**必须组合共现才有效**（论文里这些特征在抑郁画作中是成簇出现的）。
3. "像素知识库"路线正式排除出 MVP 与 v2 规划：数据不公开 + 黑盒不可引用 + 抑郁/健康标签越产品边界，三条全踩红线。
