"""Build the optional, reference-only literature index from the curated catalog."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import uuid

import chromadb
from pypdf import PdfReader
from llama_index.core import Document, StorageContext, VectorStoreIndex
from llama_index.core.node_parser import SentenceSplitter
from llama_index.vector_stores.chroma import ChromaVectorStore
from modelscope_embedding import ModelScopeEmbedding

ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE = ROOT / "knowledge" / "psychology"
PDF_DIR = KNOWLEDGE / "references"
CATALOG = KNOWLEDGE / "literature" / "catalog.json"
CONFIG = KNOWLEDGE / "retrieval" / "config.json"
DB_DIR = KNOWLEDGE / "chroma"
EMBED_MODEL = os.getenv("RAG_EMBED_MODEL", "Qwen/Qwen3-Embedding-4B")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if not os.getenv("RAG_EMBED_API_KEY"):
        raise SystemExit("RAG_EMBED_API_KEY is required to build the literature index")
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    documents = []
    included = []
    skipped_pages = 0
    for item in catalog["documents"]:
        source = PDF_DIR / item["file"]
        if not source.is_file() or sha256(source) != item["sha256"]:
            raise SystemExit(f"Missing or changed catalog PDF: {item['file']}")
        if not item["retrievalAllowed"]:
            continue
        page_count = 0
        for page_number, page in enumerate(PdfReader(str(source)).pages, start=1):
            text = page.extract_text() or ""
            if not text.strip():
                skipped_pages += 1
                continue
            metadata = {
                "source_id": item["id"],
                "source_file": item["file"],
                "source_sha256": item["sha256"],
                "source_page": page_number,
                "knowledge_role": "reference_only",
            }
            documents.append(Document(
                text=text,
                id_=f"{item['id']}-p{page_number}",
                metadata=metadata,
                excluded_embed_metadata_keys=list(metadata),
                excluded_llm_metadata_keys=list(metadata),
            ))
            page_count += 1
        included.append({"id": item["id"], "file": item["file"], "indexedPages": page_count})
    if not documents:
        raise SystemExit("No extractable PDF pages; existing index was left untouched")

    DB_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(DB_DIR))
    collection_name = f"{config['collection']}_{uuid.uuid4().hex[:12]}"
    collection = client.create_collection(collection_name)
    try:
        VectorStoreIndex.from_documents(
            documents,
            storage_context=StorageContext.from_defaults(vector_store=ChromaVectorStore(chroma_collection=collection)),
            embed_model=ModelScopeEmbedding(model_name=EMBED_MODEL),
            transformations=[SentenceSplitter(chunk_size=300, chunk_overlap=60)],
        )
        if collection.count() == 0:
            raise RuntimeError("The literature index contains no chunks")
        manifest = {
            "schemaVersion": 2,
            "collection": collection_name,
            "builtAt": datetime.now(timezone.utc).isoformat(),
            "catalogSha256": sha256(CATALOG),
            "configSha256": sha256(CONFIG),
            "embedding": EMBED_MODEL,
            "pages": len(documents),
            "chunks": collection.count(),
            "skippedPages": skipped_pages,
            "documents": included,
            "role": "reference_only",
        }
        temporary = DB_DIR / "manifest.json.tmp"
        temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(DB_DIR / "manifest.json")
    except Exception:
        client.delete_collection(collection_name)
        raise
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
