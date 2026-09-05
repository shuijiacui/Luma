"""Retrieve reference-only PDF chunks for the Node report service."""
import json
import sys
from pathlib import Path
import chromadb
from llama_index.core import VectorStoreIndex
from llama_index.vector_stores.chroma import ChromaVectorStore
from modelscope_embedding import ModelScopeEmbedding

ROOT = Path(__file__).resolve().parents[1]
DB_DIR = ROOT / "knowledge" / "chroma"
index = VectorStoreIndex.from_vector_store(
    ChromaVectorStore(chroma_collection=chromadb.PersistentClient(path=str(DB_DIR)).get_collection("luma_reference_literature")),
    embed_model=ModelScopeEmbedding(),
)
query = " ".join(sys.argv[1:]) or "儿童绘画与情绪观察的研究局限"
results = []
for item in index.as_retriever(similarity_top_k=5).retrieve(query):
    results.append({
        "text": item.node.get_content()[:1800],
        "score": round(float(item.score or 0), 6),
        "sourceFile": item.node.metadata.get("source_file", "unknown"),
        "sourceSha256": item.node.metadata.get("source_sha256", "unknown"),
        "role": "reference_only",
    })
print(json.dumps({"query": query, "results": results}, ensure_ascii=False))
