"""SkillGuard API: scans a Claude skill against known malicious patterns."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from anthropic import Anthropic
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from analyzer import analyze_skill
from rag import KnowledgeBase

log = logging.getLogger("skillguard")
logging.basicConfig(level=logging.INFO)

MAX_SKILL_CHARS = 200_000
APP_HTML = Path(__file__).parent / "app.html"


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


class ScanRequest(BaseModel):
    skill_code: str


@app.get("/")
def index():
    return FileResponse(APP_HTML)


@app.get("/health")
def health():
    return {
        "kb_loaded": state.kb is not None,
        "kb_error": state.kb_error,
        "api_key_set": bool(os.environ.get("ANTHROPIC_API_KEY")),
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
        raise HTTPException(status_code=400, detail="skill_code is empty")
    if len(skill_code) > MAX_SKILL_CHARS:
        raise HTTPException(status_code=413, detail=f"Skill exceeds {MAX_SKILL_CHARS} characters")
    if state.kb is None:
        raise HTTPException(status_code=503, detail=f"Knowledge base not loaded: {state.kb_error}")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not set")

    patterns = state.kb.retrieve(skill_code)
    try:
        report = analyze_skill(Anthropic(), skill_code, patterns)
    except Exception as exc:
        log.exception("Claude analysis failed")
        raise HTTPException(status_code=502, detail=f"Claude analysis failed: {exc}")

    return {
        **report.model_dump(),
        "matched_patterns": [
            {"pattern_id": p["pattern_id"], "name": p["name"], "similarity": p["similarity"]}
            for p in patterns
        ],
    }
