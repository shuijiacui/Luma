"""Run the curated retrieval smoke set after an index has been built."""
import json
from pathlib import Path
from retrieve_references import search

ROOT = Path(__file__).resolve().parents[1]
cases = json.loads((ROOT / "knowledge/psychology/retrieval/eval-cases.json").read_text(encoding="utf-8"))["cases"]
passed = 0
for case in cases:
    results = search(case["query"])["results"]
    found = {item["sourceId"] for item in results}
    ok = not results if case["mustBeEmpty"] else bool(found.intersection(case["expectedAnyDocumentIds"]))
    passed += ok
    print(f"{'PASS' if ok else 'FAIL'} {case['id']}: {sorted(found)}")
print(f"{passed}/{len(cases)} retrieval cases passed; inspect cited pages and wording manually before enabling RAG")
if passed != len(cases):
    raise SystemExit(1)
