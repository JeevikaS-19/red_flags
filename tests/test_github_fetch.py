"""GitHub repo input parsing, file selection, and fetching (HTTP mocked)."""

import httpx
import pytest

import github_fetch as gf

REAL_CLIENT = httpx.Client


@pytest.mark.parametrize("text,expected", [
    ("https://github.com/user/repo", ("user", "repo")),
    ("http://github.com/user/repo", ("user", "repo")),
    ("github.com/user/repo/", ("user", "repo")),
    ("https://www.github.com/user/repo.git", ("user", "repo")),
    ("user/repo", ("user", "repo")),
    ("my.user/my-repo_1", ("my.user", "my-repo_1")),
    ("  user/repo  ", ("user", "repo")),
])
def test_parse_repo_accepts_repo_references(text, expected):
    assert gf.parse_repo(text) == expected


@pytest.mark.parametrize("text", [
    "",
    "hello world",
    "# Skill: thing",
    "user/repo/extra/path",
    "https://gitlab.com/user/repo",
    "line one\nuser/repo",
    "Some skill text with a/b in it",
])
def test_parse_repo_rejects_everything_else(text):
    assert gf.parse_repo(text) is None


def test_select_files_filters_and_orders():
    paths = ["README.md", "node_modules/x/index.js", "SKILL.md", "scripts/run.sh",
             "a/b/c/deep.py", "image.png", ".git/config", "dist/out.js", "notes.txt"]
    assert gf.select_files(paths) == ["SKILL.md", "README.md", "notes.txt", "scripts/run.sh", "a/b/c/deep.py"]


def test_select_files_caps_the_count():
    paths = [f"f{i}.md" for i in range(gf.MAX_FILES + 25)]
    assert len(gf.select_files(paths)) == gf.MAX_FILES


def _patch_github(monkeypatch, handler):
    monkeypatch.setattr(
        gf.httpx, "Client",
        lambda **kw: REAL_CLIENT(transport=httpx.MockTransport(handler), **kw),
    )


def test_fetch_repo_text_joins_files_with_headers(monkeypatch):
    files = {"SKILL.md": "# Skill\nDoes things", "scripts/run.sh": "echo hi"}

    def handler(req):
        url = str(req.url)
        if url == "https://api.github.com/repos/user/repo":
            return httpx.Response(200, json={"default_branch": "main"})
        if "git/trees/main" in url:
            tree = [{"path": p, "type": "blob"} for p in files] + [{"path": "logo.png", "type": "blob"}]
            return httpx.Response(200, json={"tree": tree})
        for path, body in files.items():
            if url.endswith("/main/" + path):
                return httpx.Response(200, text=body)
        return httpx.Response(404)

    _patch_github(monkeypatch, handler)
    text = gf.fetch_repo_text("user", "repo")
    assert "=== FILE: SKILL.md ===\n# Skill" in text
    assert "=== FILE: scripts/run.sh ===\necho hi" in text
    assert "logo.png" not in text
    assert text.index("SKILL.md") < text.index("run.sh")  # SKILL.md first


@pytest.mark.parametrize("upstream,expected_status,message", [
    (404, 404, "not found"),
    (403, 429, "rate limit"),
    (429, 429, "rate limit"),
    (500, 502, "error"),
])
def test_fetch_repo_text_maps_github_errors(monkeypatch, upstream, expected_status, message):
    _patch_github(monkeypatch, lambda req: httpx.Response(upstream, json={}))
    with pytest.raises(gf.GitHubError) as err:
        gf.fetch_repo_text("u", "r")
    assert err.value.status == expected_status
    assert message in str(err.value).lower()


def test_fetch_repo_text_reports_repo_with_no_scannable_files(monkeypatch):
    def handler(req):
        if str(req.url).endswith("/repos/u/r"):
            return httpx.Response(200, json={"default_branch": "main"})
        return httpx.Response(200, json={"tree": [{"path": "logo.png", "type": "blob"}]})

    _patch_github(monkeypatch, handler)
    with pytest.raises(gf.GitHubError) as err:
        gf.fetch_repo_text("u", "r")
    assert err.value.status == 400


def test_fetch_repo_text_handles_network_failure(monkeypatch):
    def handler(req):
        raise httpx.ConnectError("boom")

    _patch_github(monkeypatch, handler)
    with pytest.raises(gf.GitHubError) as err:
        gf.fetch_repo_text("u", "r")
    assert err.value.status == 502
