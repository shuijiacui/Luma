"""RAG 诊断脚本：chunk 长度分布 + 召回分数分布（只读，不修改索引）。

运行：.rag-venv\\Scripts\\python.exe rag\\diagnose.py
"""
import sys
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")

import chromadb
from llama_index.core import VectorStoreIndex
from llama_index.vector_stores.chroma import ChromaVectorStore
from modelscope_embedding import ModelScopeEmbedding

ROOT = Path(__file__).resolve().parents[1]
DB_DIR = ROOT / "knowledge" / "chroma"
SCORE_THRESHOLD = 0.40

client = chromadb.PersistentClient(path=str(DB_DIR))
col = client.get_collection("luma_reference_literature")

docs = col.get(limit=500)["documents"]
lens = sorted(len(d) for d in docs)

def pct(p):
    if not lens:
        return 0
    return lens[min(len(lens) - 1, int(len(lens) * p))]

print("=== Chroma 状态 ===")
print(f"chunk 数量: {col.count()}")
if col.count():
    print(f"向量维度: {len(col.peek()['embeddings'][0])}")
print(f"chunk 字符长度: min={lens[0] if lens else 0} "
      f"P50={pct(0.5)} P90={pct(0.9)} max={lens[-1] if lens else 0}")

index = VectorStoreIndex.from_vector_store(
    ChromaVectorStore(chroma_collection=col),
    embed_model=ModelScopeEmbedding(),
)

queries = [
    "房树人 HTP 效度 局限",
    "天气意象 云 雨 绘画",
    "深色 颜色 绘画 情绪",
    "儿童绘画 情绪 研究 局限",
    "单幅画 不能 诊断 儿童",
]

print(f"\n=== 召回诊断（阈值 {SCORE_THRESHOLD}，top_k=5）===")
for q in queries:
    raw = index.as_retriever(similarity_top_k=5).retrieve(q)
    scores = [round(float(n.score or 0), 4) for n in raw]
    hits = [s for s in scores if s >= SCORE_THRESHOLD]
    tag = "空召回(正确降级)" if not hits else "命中"
    print(f"\n[{q}]")
    print(f"  top5 分数: {scores}")
    print(f"  阈值后命中 {len(hits)} 个: {hits}  -> {tag}")