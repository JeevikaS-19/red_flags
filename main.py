"""SkillGuard API: scans an agent skill against known malicious patterns."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import types
from pydantic import BaseModel

from analyzer import analyze_skill
from github_fetch import GitHubError, fetch_repo_text, parse_repo
from rag import KnowledgeBase

log = logging.getLogger("skillguard")
logging.basicConfig(level=logging.INFO)

MAX_SKILL_CHARS = 200_000
GEMINI_TIMEOUT_MS = 45_000  # per request; a stalled model then falls back instead of hanging
FRONTEND_DIR = Path(__file__).parent / "frontend"


class AppState:
    kb: KnowledgeBase | None = None
    kb_error: str | None = None


state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the KB once at startup. If it's missing, the server still starts and /scan
    # returns a clear 503 instead of crashing, so the rest of the API can be tested.
    try:
        state.kb = KnowledgeBase()
        log.info("Knowledge base loaded")
    except Exception as exc:  # missing file, bad JSON, model download failure, etc.
        state.kb_error = str(exc)
        log.warning("Knowledge base not loaded: %s", exc)
    yield


app = FastAPI(title="SkillGuard", lifespan=lifespan)

# The frontend is hosted separately (Netlify) and calls this API from another origin.
# Set ALLOWED_ORIGINS to a comma-separated list, e.g. https://red-flags.netlify.app
allowed_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if allowed_origins:
    app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_methods=["*"], allow_headers=["*"])


class ScanRequest(BaseModel):
    skill_code: str


@app.get("/health")
def health():
    return {
        "kb_loaded": state.kb is not None,
        "kb_error": state.kb_error,
        "api_key_set": bool(os.environ.get("GEMINI_API_KEY")),
    }


@app.post("/scan")
def scan(req: ScanRequest):
    return run_scan(req.skill_code)


@app.post("/scan/file")
async def scan_file(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        skill_code = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Skill file must be UTF-8 text")
    return run_scan(skill_code)


def run_scan(skill_code: str) -> dict:
    if not skill_code.strip():
        raise HTTPException(status_code=400, detail="Paste some skill code, upload a file, or enter a repo first.")

    repo = parse_repo(skill_code)
    if repo is None and len(skill_code) > MAX_SKILL_CHARS:
        raise HTTPException(status_code=413, detail=f"Skill exceeds {MAX_SKILL_CHARS} characters")
    if state.kb is None:
        raise HTTPException(status_code=503, detail=f"Knowledge base not loaded: {state.kb_error}")
    if not os.environ.get("GEMINI_API_KEY"):
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not set")

    if repo is not None:
        try:
            skill_code = fetch_repo_text(*repo)
        except GitHubError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc))

    patterns = state.kb.retrieve(skill_code)
    try:
        report = analyze_skill(genai.Client(http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_MS)), skill_code, patterns)
    except Exception as exc:
        log.exception("Gemini analysis failed")
        raise HTTPException(status_code=502, detail=f"Gemini analysis failed: {exc}")

    return {
        **report.model_dump(),
        "matched_patterns": [
            {"pattern_id": p["pattern_id"], "name": p["name"], "similarity": p["similarity"]}
            for p in patterns
        ],
    }


# Serve the frontend for local runs. On Netlify the same folder is deployed as a static site.
# Mounted last so the API routes above take priority.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
