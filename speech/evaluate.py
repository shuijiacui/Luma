"""Same recordings, separate model processes; opt-in local manifest, no audio copied."""
import argparse
import json
import re
import time
from pathlib import Path
from engine import Engine


def normalize(text):
    return re.sub(r"[^\w]", "", text.lower())


def distance(left, right):
    row = list(range(len(right) + 1))
    for i, a in enumerate(left, 1):
        next_row = [i]
        for j, b in enumerate(right, 1):
            next_row.append(min(next_row[-1] + 1, row[j] + 1, row[j - 1] + (a != b)))
        row = next_row
    return row[-1]


def evaluate(manifest, model, device):
    cases = json.loads(manifest.read_text(encoding="utf-8"))
    engine = Engine(model, device) if model != "browser" else None
    vocabulary = json.loads((Path(__file__).parent.parent / "shared/voiceVocabulary.json").read_text(encoding="utf-8"))
    rows = []
    for case in cases:
        start = time.perf_counter()
        if engine:
            transcript = engine.transcribe((manifest.parent / case["file"]).read_bytes(),
                                           {"vocabulary": vocabulary[case.get("locale", "zh")]}, case.get("locale", "zh"))
        else:
            transcript = case["browserTranscript"]
        elapsed = (time.perf_counter() - start) * 1000 if engine else case.get("browserLatencyMs")
        expected, actual = normalize(case["reference"]), normalize(transcript)
        terms = case.get("required", [])
        rows.append({"id": case["id"], "condition": case.get("condition", "unknown"),
                     "cer": distance(expected, actual) / max(1, len(expected)),
                     "requiredRetention": sum(normalize(t) in actual for t in terms) / len(terms) if terms else None,
                     "latencyMs": elapsed, "errors": distance(expected, actual), "characters": len(expected)})
    return {"model": model, "device": device, "count": len(rows), "rows": rows,
            "cer": sum(r["errors"] for r in rows) / max(1, sum(r["characters"] for r in rows)),
            "note": "Model warm-up is included in the first inference. No transcripts or audio retained in this report. CER is not semantic command accuracy."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--model", choices=["paraformer", "sensevoice", "browser"], required=True)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(evaluate(args.manifest, args.model, args.device), ensure_ascii=False, indent=2), encoding="utf-8")
