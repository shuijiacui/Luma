# Luma Literature RAG

## Setup

```powershell
py -3.13 -m venv .rag-venv
.rag-venv\Scripts\python.exe -m pip install -r rag\requirements.txt
$env:LLM_API_KEY = 'your ModelScope key'
$env:LLM_BASE_URL = 'https://api-inference.modelscope.cn/v1'
```

## Build index

```powershell
.rag-venv\Scripts\python.exe rag\index_pdfs.py
```

## Query

```powershell
.rag-venv\Scripts\python.exe rag\query_pdfs.py '儿童绘画研究局限'
```

The Node report endpoint uses the same retriever and sends retrieved chunks through the configured text LLM for content filtering. Filtered results are reference-only and cannot change deterministic scoring.
