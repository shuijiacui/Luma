"""Read-only chunk and recall diagnostics for the active literature index."""
import json
import chromadb
from retrieve_references import DB_DIR, search

manifest = json.loads((DB_DIR / "manifest.json").read_text(encoding="utf-8"))
collection = chromadb.PersistentClient(path=str(DB_DIR)).get_collection(manifest["collection"])
docs = collection.get(limit=500)["documents"]
lengths = sorted(len(text) for text in docs)


def percentile(p):
    return lengths[min(len(lengths) - 1, int(len(lengths) * p))] if lengths else 0


print("=== Chroma 状态 ===")
print(f"collection: {manifest['collection']}")
print(f"chunk 数量: {collection.count()}")
print(f"chunk 字符长度: min={lengths[0] if lengths else 0} P50={percentile(.5)} P90={percentile(.9)} max={lengths[-1] if lengths else 0}")
for query in ["房树人 HTP 效度 局限", "天气意象 云 雨 绘画", "儿童绘画 情绪 研究 局限", "单幅画 不能 诊断 儿童"]:
    results = search(query)["results"]
    print(f"\n{query}: {[(item['sourceId'], item['sourcePage'], item['score']) for item in results]}")
