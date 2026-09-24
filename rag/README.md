# 心理文献 RAG

> 新家长报告 `observation-v1` 使用 [已核对的文献背景卡片](../knowledge/psychology/literature/curated-context.json)，但不调用此自动 PDF 检索链。以下是历史报告链的技术文档与离线研究工具说明；设置 `RAG_ENABLED=1` 不会将未经审核的心理文献片段自动接入新报告。

RAG 从 [心理知识资产](../knowledge/psychology/README.md) 中检索供人工核查的研究材料，不修改新报告，也不参与 Nilo 绘画。当前面向家庭的报告由画面观察、分龄对话词库与已核对来源卡片生成，不依赖此离线工具。

资料位于 [`knowledge/psychology/references/`](../knowledge/psychology/references/)，来源清单与文件哈希在 [`literature/catalog.json`](../knowledge/psychology/literature/catalog.json)，规则与文献的候选对应在 [`rule-source-map.json`](../knowledge/psychology/literature/rule-source-map.json)。候选对应尚未逐篇核实，不能视为文献支持。索引是可再生成的 `knowledge/psychology/chroma/`，不会提交到仓库。

## 离线校验

从仓库根目录运行：

```powershell
node knowledge/scripts/validate.mjs
node knowledge/psychology/scripts/validate-literature.mjs
```

第二个命令检查所有 PDF 是否纳入清单、哈希是否匹配，以及规则和评测样例的引用是否存在，不需要 Python 或网络。

## 构建与评估检索索引

使用 Python 3.13 创建独立环境。当前这台 Windows 机器的解释器在 `D:\Program Files\Anaconda\python.exe`；换电脑时改为本机解释器路径。`py -3.13` 启动器在当前终端无法发现它。

```powershell
& 'D:\Program Files\Anaconda\python.exe' -m venv .rag-venv
& .\.rag-venv\Scripts\python.exe -m pip install -r rag\requirements.txt
$env:RAG_EMBED_API_KEY = '在本机环境中配置密钥'
& .\.rag-venv\Scripts\python.exe rag\index_pdfs.py
& .\.rag-venv\Scripts\python.exe rag\evaluate.py
& .\.rag-venv\Scripts\python.exe rag\query_pdfs.py '儿童绘画研究局限'
```

构建脚本按 PDF 页提取文本，记录文件 ID、SHA-256、PDF 页码和片段 ID；空白或无法提取文本的页面会计入构建清单。它先创建新集合，成功后才切换活动清单，避免失败时清空旧索引。修改 PDF、目录表或 [`retrieval/config.json`](../knowledge/psychology/retrieval/config.json) 后重建。构建时文献文本会发送给配置的 embedding 服务，应先核对资料的使用许可。`rag/evaluate.py` 运行[固定问题](../knowledge/psychology/retrieval/eval-cases.json)，检查应命中的资料和越界问题；通过后仍要人工核对实际页码、概括内容和与规则条目的关系。当前环境尚未安装 RAG 依赖、配置 embedding 密钥或构建索引，因此未运行在线评估。

## 运行边界

本目录仍保留旧版文献检索的服务端适配代码和 `RAG_ENABLED` 配置，以便研究和历史代码复核；**当前 `observation-v1` 路由不调用它**。不能仅设置开关就把 PDF 片段接入家长报告。需要新用途时，应先完成原文、许可、适用人群与产品文案的审核，再明确实现和测试；仅有页码、哈希和 `chunkId` 绑定不等于概括正确或个人推断成立。
