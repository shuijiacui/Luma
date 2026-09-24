"""Retrieve page-addressable, reference-only chunks for the parent report."""
from pathlib import Path
import hashlib
import json
import sys

import chromadb
from llama_index.core import VectorStoreIndex
from llama_index.vector_stores.chroma import ChromaVectorStore
from modelscope_embedding import ModelScopeEmbedding

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE = ROOT / "knowledge" / "psychology"
DB_DIR = KNOWLEDGE / "chroma"
CATALOG = KNOWLEDGE / "literature" / "catalog.json"
CONFIG = KNOWLEDGE / "retrieval" / "config.json"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def search(query):
    manifest = json.loads((DB_DIR / "manifest.json").read_text(encoding="utf-8"))
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    if (manifest.get("schemaVersion") != 2 or manifest.get("catalogSha256") != sha256(CATALOG)
            or manifest.get("configSha256") != sha256(CONFIG)):
        raise RuntimeError("Literature index is stale; rebuild it before retrieval")
    allowed = {doc["id"]: doc for doc in catalog["documents"] if doc["retrievalAllowed"]}
    collection = chromadb.PersistentClient(path=str(DB_DIR)).get_collection(manifest["collection"])
    index = VectorStoreIndex.from_vector_store(
        ChromaVectorStore(chroma_collection=collection),
        embed_model=ModelScopeEmbedding(model_name=manifest["embedding"]),
    )
    results = []
    verified_files = {}
    for item in index.as_retriever(similarity_top_k=config["topK"]).retrieve(query):
        score = float(item.score or 0)
        metadata = item.node.metadata
        doc = allowed.get(metadata.get("source_id"))
        page = metadata.get("source_page")
        if (score < config["scoreThreshold"] or not doc or metadata.get("source_sha256") != doc["sha256"]
                or metadata.get("knowledge_role") != "reference_only" or not isinstance(page, int) or page < 1):
            continue
        if doc["id"] not in verified_files:
            source = KNOWLEDGE / "references" / doc["file"]
            verified_files[doc["id"]] = source.is_file() and sha256(source) == doc["sha256"]
        if not verified_files[doc["id"]]:
            raise RuntimeError(f"Changed source PDF: {doc['file']}; rebuild the index")
        results.append({
            "chunkId": item.node.node_id,
            "sourceId": doc["id"],
            "sourceFile": doc["file"],
            "sourceSha256": doc["sha256"],
            "sourcePage": page,
            "text": item.node.get_content()[:config["maxExcerptChars"]],
            "score": round(score, 6),
            "role": "reference_only",
        })
    return {"query": query, "results": results}


if __name__ == "__main__":
    print(json.dumps(search(" ".join(sys.argv[1:]) or "儿童绘画与情绪观察的研究局限"), ensure_ascii=False))
