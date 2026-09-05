"""Query the local Chroma literature index for reference-only evidence."""
from pathlib import Path
import sys
sys.stdout.reconfigure(encoding="utf-8")
from llama_index.core import VectorStoreIndex
from modelscope_embedding import ModelScopeEmbedding
import chromadb
from llama_index.vector_stores.chroma import ChromaVectorStore

ROOT = Path(__file__).resolve().parents[1]
DB_DIR = ROOT / "knowledge" / "chroma"
MODEL = "Qwen/Qwen3-Embedding-4B"

client = chromadb.PersistentClient(path=str(DB_DIR))
collection = client.get_collection("luma_reference_literature")
index = VectorStoreIndex.from_vector_store(
    ChromaVectorStore(chroma_collection=collection),
    embed_model=ModelScopeEmbedding(model_name=MODEL),
)
query = " ".join(sys.argv[1:]) or "儿童绘画和单幅画解释的局限性"
for node in index.as_retriever(similarity_top_k=5).retrieve(query):
    print(f"score={node.score:.4f} source={node.node.metadata.get('source_file', 'unknown')}")
    print(node.node.get_content()[:1000].replace('\n', ' '))
    print()
