"""Inspect literature retrieval using the same code path as the parent report."""
import sys
from retrieve_references import search

query = " ".join(sys.argv[1:]) or "儿童绘画和单幅画解释的局限性"
results = search(query)["results"]
if not results:
    print("未找到达到检索阈值的文献片段")
for item in results:
    print(f"score={item['score']:.4f} source={item['sourceFile']} PDF页={item['sourcePage']} chunk={item['chunkId']}")
    print(item["text"][:1000].replace("\n", " "))
    print()
