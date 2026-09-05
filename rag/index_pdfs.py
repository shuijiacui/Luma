"""Index reference PDFs into a persistent local Chroma collection.

This is an evidence-retrieval sidecar. It does not alter the deterministic
emotion scoring pipeline. Run from the repository root:
  .rag-venv\\Scripts\\python.exe rag\\index_pdfs.py
"""
from pathlib import Path
import hashlib
import json
import os

import chromadb
from llama_index.core import SimpleDirectoryReader, StorageContext, VectorStoreIndex
from modelscope_embedding import ModelScopeEmbedding
from llama_index.core.node_parser import SentenceSplitter
from llama_index.vector_stores.chroma import ChromaVectorStore

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "docs" / "references"
DB_DIR = ROOT / "knowledge" / "chroma"
COLLECTION = "luma_reference_literature"

# Local Chinese embedding model. Similarity is retrieval-only and never a clinical score.
EMBED_MODEL = os.getenv("RAG_EMBED_MODEL", "Qwen/Qwen3-Embedding-4B")


def main() -> None:
    files = sorted(PDF_DIR.glob("*.pdf"))
    if not files:
        raise SystemExit(f"No PDFs found in {PDF_DIR}")

    documents = SimpleDirectoryReader(input_files=[str(p) for p in files]).load_data()
    for doc in documents:
        source = Path(doc.metadata.get("file_path", "unknown"))
        doc.metadata.update({
            "source_file": source.name,
            "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest() if source.exists() else "unknown",
            "knowledge_role": "reference_only",
        })

    client = chromadb.PersistentClient(path=str(DB_DIR))
    collection = client.get_or_create_collection(COLLECTION)
    vector_store = ChromaVectorStore(chroma_collection=collection)
    storage = StorageContext.from_defaults(vector_store=vector_store)
    index = VectorStoreIndex.from_documents(
        documents,
        storage_context=storage,
        embed_model=ModelScopeEmbedding(model_name=EMBED_MODEL),
        transformations=[SentenceSplitter(chunk_size=800, chunk_overlap=120)],
    )
    manifest = {
        "collection": COLLECTION,
        "documents": len(documents),
        "pdfs": [p.name for p in files],
        "embedding": EMBED_MODEL,
        "role": "reference retrieval only; never changes deterministic score",
    }
    (DB_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
