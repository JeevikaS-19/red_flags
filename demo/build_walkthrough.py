"""Build the GitHub Pages walkthrough, docs/index.html.

Same inputs as build_demo.py (demo/results.json, tests/junit.xml, frontend/css/*.css),
plus the repo URL for the links. The output is one self-contained file, so GitHub Pages
only needs to serve the docs/ folder.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "demo"))

import analyzer  # noqa: E402
from build_demo import base_css, load_tests  # noqa: E402

DEFAULT_REPO_URL = "https://github.com/JeevikaS-19/red_flags"


def repo_url() -> str:
    try:
        remote = subprocess.run(["git", "remote", "get-url", "origin"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return DEFAULT_REPO_URL
    return remote.removesuffix(".git") if remote.startswith("https://github.com/") else DEFAULT_REPO_URL


def main() -> None:
    results = json.loads((ROOT / "demo" / "results.json").read_text(encoding="utf-8"))
    kb = json.loads((ROOT / "malicious_patterns.json").read_text(encoding="utf-8"))
    data = {**results, "tests": load_tests(), "patternCount": len(kb["patterns"]),
            "meta": {"model": analyzer.MODEL, "fallback": analyzer.FALLBACK_MODEL}}

    template = (ROOT / "demo" / "walkthrough_template.html").read_text(encoding="utf-8")
    css = base_css()
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    html = (template.replace("/*__BASE_CSS__*/", css).replace("/*__DATA__*/", payload).replace("__REPO_URL__", repo_url()))

    out = ROOT / "docs" / "index.html"
    out.write_text(html, encoding="utf-8")
    (ROOT / "docs" / ".nojekyll").write_text("", encoding="utf-8")  # serve files as-is, skip Jekyll
    print(f"Wrote {out} ({len(html) // 1024} KB) | repo link: {repo_url()}")


if __name__ == "__main__":
    main()
