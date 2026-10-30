"""Fetch a GitHub repo's text files so they can be scanned as one skill.

Accepts `github.com/user/repo`, `https://github.com/user/repo` (optionally with
`.git` or a trailing slash), or the shorthand `user/repo`. Files are pulled
through the GitHub REST API (tree listing) and raw.githubusercontent.com.
Set GITHUB_TOKEN to raise the API rate limit.
"""

import os
import re

import httpx

API = "https://api.github.com"
RAW = "https://raw.githubusercontent.com"

MAX_FILES = 40
MAX_FILE_BYTES = 100_000
MAX_TOTAL_CHARS = 200_000
TEXT_EXTENSIONS = (".md", ".txt", ".py", ".js", ".ts", ".sh", ".json", ".yaml", ".yml", ".toml")
SKIP_DIRS = ("node_modules/", ".git/", "vendor/", "dist/", "build/", ".venv/")

NAME = r"[A-Za-z0-9_.-]{1,100}"
URL_RE = re.compile(rf"^(?:https?://)?(?:www\.)?github\.com/({NAME})/({NAME})/?$")
SHORT_RE = re.compile(rf"^({NAME})/({NAME})$")


class GitHubError(Exception):
    """Raised with a message that is safe to show the user."""

    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.status = status


def parse_repo(text: str) -> tuple[str, str] | None:
    """Return (owner, repo) if the input is a GitHub repo reference, else None."""
    candidate = text.strip()
    if not candidate or "\n" in candidate or " " in candidate:
        return None

    match = URL_RE.match(candidate) or SHORT_RE.match(candidate)
    if not match:
        return None

    owner, repo = match.group(1), match.group(2)
    if repo.endswith(".git"):
        repo = repo[:-4]
    return owner, repo


def fetch_repo_text(owner: str, repo: str) -> str:
    """Download the scannable files from a repo and join them with file headers."""
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "SkillGuard"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        with httpx.Client(headers=headers, timeout=15, follow_redirects=True) as http:
            meta = _api_get(http, f"{API}/repos/{owner}/{repo}")
            branch = meta["default_branch"]

            tree = _api_get(http, f"{API}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1")
            paths = select_files([t["path"] for t in tree.get("tree", []) if t["type"] == "blob"])
            if not paths:
                raise GitHubError("No scannable text files found in this repo", 400)

            parts, total = [], 0
            for path in paths:
                resp = http.get(f"{RAW}/{owner}/{repo}/{branch}/{path}")
                if resp.status_code != 200:
                    continue
                content = resp.text[:MAX_FILE_BYTES]
                if total + len(content) > MAX_TOTAL_CHARS:
                    break
                parts.append(f"=== FILE: {path} ===\n{content}")
                total += len(content)
    except httpx.HTTPError:
        raise GitHubError("Could not reach GitHub. Try again in a moment.", 502)

    if not parts:
        raise GitHubError("No scannable text files could be downloaded from this repo", 400)
    return "\n\n".join(parts)


def select_files(paths: list[str]) -> list[str]:
    """Pick text files, put SKILL.md and shallow files first, cap the count."""
    keep = [
        p for p in paths
        if p.lower().endswith(TEXT_EXTENSIONS) and not any(d in p for d in SKIP_DIRS)
    ]
    keep.sort(key=lambda p: (not p.upper().endswith("SKILL.MD"), p.count("/"), p))
    return keep[:MAX_FILES]


def _api_get(http: httpx.Client, url: str) -> dict:
    resp = http.get(url)
    if resp.status_code == 404:
        raise GitHubError("GitHub repo not found. Check the name and make sure it is public.", 404)
    if resp.status_code in (403, 429):
        raise GitHubError("GitHub rate limit reached. Try again later or set GITHUB_TOKEN.", 429)
    if resp.status_code != 200:
        raise GitHubError(f"GitHub returned an error ({resp.status_code})", 502)
    return resp.json()
