"""Build the shareable demo page, frontend/demo.html.

Inputs:  demo/results.json   (from run_demo.py)
         tests/junit.xml     (pytest --junitxml=tests/junit.xml)
         frontend/styles.css (inlined so the page is one self-contained file)
Output:  frontend/demo.html  (open it from disk, or deploy it with the site)
"""

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import analyzer  # noqa: E402  (for the model names shown on the page)


def load_tests() -> dict:
    root = ET.parse(ROOT / "tests" / "junit.xml").getroot()
    suite = root if root.tag == "testsuite" else root.find("testsuite")
    groups: dict[str, list[dict]] = {}
    for case in suite.iter("testcase"):
        module = case.get("classname", "").split(".")[-1]
        failed = case.find("failure") is not None or case.find("error") is not None
        groups.setdefault(module, []).append({"name": case.get("name"), "ok": not failed})

    out = [{"name": name, "total": len(cases), "passed": sum(c["ok"] for c in cases), "cases": cases}
           for name, cases in sorted(groups.items())]
    total = sum(g["total"] for g in out)
    passed = sum(g["passed"] for g in out)
    return {"total": total, "passed": passed, "failed": total - passed,
            "seconds": round(float(suite.get("time", 0)), 1), "groups": out}


def main() -> None:
    results = json.loads((ROOT / "demo" / "results.json").read_text(encoding="utf-8"))
    kb = json.loads((ROOT / "malicious_patterns.json").read_text(encoding="utf-8"))
    data = {
        **results,
        "tests": load_tests(),
        "patternCount": len(kb["patterns"]),
        "meta": {"model": analyzer.MODEL, "fallback": analyzer.FALLBACK_MODEL},
    }

    template = (ROOT / "demo" / "demo_template.html").read_text(encoding="utf-8")
    css = (ROOT / "frontend" / "styles.css").read_text(encoding="utf-8")
    # "</" inside the embedded JSON must not end the script tag
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    html = template.replace("/*__BASE_CSS__*/", css).replace("/*__DATA__*/", payload)

    out = ROOT / "frontend" / "demo.html"
    out.write_text(html, encoding="utf-8")
    print(f"Wrote {out} ({len(html) // 1024} KB) | {data['tests']['passed']}/{data['tests']['total']} tests, "
          f"{results['summary']['correct']}/{results['summary']['labelled']} skills correct")


if __name__ == "__main__":
    main()
