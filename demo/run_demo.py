"""Scan every skill in demo/skills/ through the live API and record the results.

Usage (server must be running with GEMINI_API_KEY set):
    python demo/run_demo.py [http://localhost:8001]

Files named good_*.md are expected to come back safe, bad_*.md unsafe.
Writes demo/results.json, which build_demo.py turns into frontend/demo.html.
"""

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent
SKILLS_DIR = ROOT / "skills"
OUT = ROOT / "results.json"
GITHUB_DEMO_REPO = "octocat/Spoon-Knife"  # small public repo for the live GitHub-fetch check


def scan(client: httpx.Client, base: str, skill_code: str) -> tuple[dict, float]:
    start = time.time()
    resp = client.post(f"{base}/scan", json={"skill_code": skill_code})
    elapsed = time.time() - start
    resp.raise_for_status()
    return resp.json(), round(elapsed, 1)


def main() -> None:
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8001").rstrip("/")
    health = httpx.get(f"{base}/health", timeout=10).json()
    if not (health["kb_loaded"] and health["api_key_set"]):
        sys.exit(f"Server not ready: {health}")

    results = []
    with httpx.Client(timeout=120) as client:
        for path in sorted(SKILLS_DIR.glob("*.md")):
            expected = "bad" if path.name.startswith("bad_") else "good" if path.name.startswith("good_") else None
            text = path.read_text(encoding="utf-8")
            try:
                report, seconds = scan(client, base, text)
            except httpx.HTTPError as exc:
                print(f"{path.name}: ERROR {exc}")
                results.append({"file": path.name, "expected": expected, "skill": text, "error": str(exc)})
                continue

            actual = "good" if report["safe_to_install"] else "bad"
            passed = expected is None or expected == actual
            results.append({
                "file": path.name, "expected": expected, "actual": actual, "passed": passed,
                "seconds": seconds, "skill": text, "report": report,
            })
            print(f"{'PASS' if passed else 'FAIL'}  {path.name:28} expected={expected} score={report['overall_risk_score']:3} "
                  f"flags={[f['category'] for f in report['risk_flags']]} ({seconds}s)")

        github = None
        try:
            report, seconds = scan(client, base, GITHUB_DEMO_REPO)
            github = {"repo": GITHUB_DEMO_REPO, "seconds": seconds, "report": report}
            print(f"GITHUB {GITHUB_DEMO_REPO}: score={report['overall_risk_score']} safe={report['safe_to_install']} ({seconds}s)")
        except httpx.HTTPError as exc:
            github = {"repo": GITHUB_DEMO_REPO, "error": str(exc)}
            print(f"GITHUB {GITHUB_DEMO_REPO}: ERROR {exc}")

    labelled = [r for r in results if r.get("expected")]
    correct = sum(1 for r in labelled if r.get("passed"))
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total": len(results), "labelled": len(labelled), "correct": correct,
        "good_total": sum(1 for r in labelled if r["expected"] == "good"),
        "bad_total": sum(1 for r in labelled if r["expected"] == "bad"),
        "avg_seconds": round(sum(r.get("seconds", 0) for r in results) / max(len(results), 1), 1),
    }
    OUT.write_text(json.dumps({"summary": summary, "results": results, "github": github}, indent=2), encoding="utf-8")
    print(f"\n{correct}/{len(labelled)} correct. Wrote {OUT}")


if __name__ == "__main__":
    main()
