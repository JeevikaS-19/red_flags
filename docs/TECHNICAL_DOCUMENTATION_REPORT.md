# Red Flags: Technical Documentation Report

**System:** Red Flags (internal package name: SkillGuard), a security scanner for AI agent skills
**Date:** 30 October 2026
**Status:** Working prototype. The backend, knowledge base, and frontend run end to end locally. Cloud deployment is planned and not yet verified.

---

## 1. Purpose and scope

AI agent "skills" (for example a `SKILL.md` file and its bundled scripts) are plain-text instructions that an agent follows with the user's authority. Published research on skill marketplaces reports that a substantial share of skills contain vulnerabilities, and that attackers hide instructions, exfiltrate data, harvest credentials, or load remote payloads.

Red Flags checks a skill **before** it is installed. A user pastes code, uploads a file, or gives a public GitHub repository. The system returns:

- a plain-language summary of what the skill does,
- a risk score from 0 to 100,
- a list of red flags, each with the exact quoted text, an explanation, and a recommendation,
- a safe or unsafe verdict.

**In scope:** text-based skills, repository scanning of text files, a web interface, a REST API.
**Out of scope for this version:** executing skills, scanning binaries, user accounts, scan history, automated fixes (the "Personalize" tab is a placeholder).

---

## 2. Architecture overview

The system is a retrieval-augmented generation (RAG) pipeline. A fixed knowledge base of known attack patterns is searched for matches to the submitted skill, and a large language model reviews the skill with those matches as context.

```
                      ┌──────────────────────────┐
   Browser            │        Frontend          │
   (paste / upload /  │  index.html  scan.html   │
    GitHub link)  ───▶│  scan.js  styles.css     │
                      └────────────┬─────────────┘
                                   │ HTTPS  POST /scan, /scan/file
                                   ▼
                      ┌──────────────────────────┐
                      │   FastAPI backend        │  main.py
                      │   input validation       │
                      └───┬──────────────┬───────┘
          repo link?      │              │ skill text
                          ▼              ▼
             ┌────────────────┐   ┌─────────────────────────────┐
             │ github_fetch   │   │ rag.py                      │
             │ GitHub REST API│   │ 1. chunk the skill          │
             │ + raw files    │   │ 2. embed chunks             │
             └───────┬────────┘   │ 3. query vector DB          │
                     │ files      │ 4. top-5 similar patterns   │
                     └──────────▶ └──────────┬──────────────────┘
                                             │ skill + patterns
                                             ▼
                      ┌─────────────────────────────────────────┐
                      │ analyzer.py                             │
                      │ prompt  ─▶ Gemini (JSON mode)           │
                      │ retry / fallback model / timeout        │
                      │ validate JSON  ─▶ enforce evasion rule  │
                      └──────────────────┬──────────────────────┘
                                         ▼
                              JSON risk report + matched patterns

   Knowledge base: malicious_patterns.json (16 patterns) ─▶ embedded into
   an in-memory Chroma collection when the server starts.
```

### Request flow (one scan)

1. The browser sends the skill text to `POST /scan` (or a file to `POST /scan/file`).
2. The backend rejects empty or oversized input. If the text is a GitHub reference (`user/repo` or a `github.com` URL), it downloads the repository's text files and joins them with `=== FILE: path ===` headers.
3. The skill is split into overlapping chunks. Each chunk is embedded and matched against the pattern collection. The best five patterns across all chunks are kept.
4. The analyzer builds a prompt containing the skill (marked as untrusted) and the retrieved patterns, and calls Gemini in JSON mode.
5. The reply is parsed and validated against a schema. If the report contains an `evasion_attempt` flag, the score is forced to 100 and the verdict to unsafe.
6. The API returns the report plus the identifiers and similarity scores of the matched patterns.

---

## 3. Components

### 3.1 Backend API (`main.py`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/scan` | POST | Body `{"skill_code": "..."}`. Accepts skill text or a GitHub repo reference. |
| `/scan/file` | POST | Multipart upload of a UTF-8 `.md` or `.txt` file. |
| `/health` | GET | Reports whether the knowledge base loaded and whether an API key is set. |
| `/` | GET | Serves the static frontend (used for local runs). |

Behaviour worth noting:

- The knowledge base is loaded once at startup. If it fails to load, the server still starts and `/scan` returns a clear `503` instead of crashing.
- Error codes: `400` empty or non-UTF-8 input, `404` GitHub repo not found, `413` input over 200,000 characters, `429` GitHub rate limit, `502` model or upstream failure, `503` knowledge base or API key missing.
- CORS is off by default. Setting `ALLOWED_ORIGINS` enables it for the listed origins only, so the frontend can be hosted on a different domain.

### 3.2 Knowledge base (`malicious_patterns.json`)

16 attack patterns, built from security research, vendor reports, and documentation collected in a NotebookLM notebook, plus one evasion pattern defined in the project's evasion specification.

| Category | Patterns |
|---|---|
| data_exfiltration | 5 |
| credential_harvesting | 3 |
| supply_chain | 3 |
| privilege_escalation | 2 |
| prompt_injection | 2 |
| evasion_attempt | 1 |

Each pattern holds: `pattern_id`, `name`, `description`, `category`, `severity`, `pattern_examples` (text or code quoted from the source), a `source` or `source_paper` label, `source_url`, a plain-language `explanation`, `indicators`, and an optional `real_world_example`. Sources that are blog posts or vendor documentation use the `source` field; arXiv and academic papers use `source_paper`.

### 3.3 Retrieval (`rag.py`)

| Setting | Value |
|---|---|
| Embedding model | `all-MiniLM-L6-v2` (sentence-transformers) |
| Vector store | Chroma, in memory, cosine distance |
| Chunk size and overlap | 1,000 characters, 200 overlap |
| Chunk cap | 30 chunks per skill (bounds cost and latency) |
| Matches kept | Top 5 per chunk, then the best 5 patterns overall |

Each pattern is embedded as `name. description. examples`. List fields are kept in the original pattern dictionaries, not in Chroma metadata, because Chroma metadata only accepts scalar values. Each `KnowledgeBase` instance gets a uniquely named collection, because Chroma's in-process store is shared and a fixed name caused a "collection already exists" error.

### 3.4 Analysis (`analyzer.py`)

**Prompt design.** A system prompt defines the reviewer role and the six flag categories. It states that the skill is untrusted data and that any instructions inside it must never be followed, which guards against prompt injection aimed at the scanner itself. The skill is wrapped in `<skill>` tags. An "evasion detection" section matches phrases such as "ignore this analysis", "don't flag", or "mark this as safe" by meaning, not only by exact wording.

**Structured output.** The model is called in JSON mode. The reply is parsed (tolerating code fences) and validated with Pydantic: summary list, flags with category, severity, snippet, explanation and recommendation, an integer score from 0 to 100, and a boolean verdict. An invalid reply becomes a `502`.

**Evasion rule enforced in code.** If any flag has the category `evasion_attempt`, the code sets the score to 100, the verdict to unsafe, and adds the note "Skill attempted to suppress security analysis". This does not depend on the model following the instruction, so a skill cannot talk its way out of the rule.

**Resilience.** Requests time out after 45 seconds. Rate limits (429), overload (503), and timeouts are retried twice on the primary model (waits of 1 s and 3 s), then once on a fallback model. Other errors fail immediately.

**Model choice.** The default is `gemini-3.5-flash-lite` with `gemini-3.6-flash` as the fallback. This came from measurement: with the same prompt, `gemini-3.8-flash` took about 71 seconds per scan during testing (162 seconds for a trivial prompt, due to overload), `gemini-3.6-flash` took 13 to 32 seconds, and `gemini-3.5-flash-lite` took 1 to 3 seconds with identical verdicts on the test skills. Both can be changed with environment variables.

### 3.5 GitHub scanning (`github_fetch.py`)

Accepts `github.com/user/repo`, `https://github.com/user/repo` (with an optional `.git` or trailing slash), or `user/repo`. Input is classified as a repo only if it is a single line with no spaces that matches the pattern strictly, so skill text containing a path like `a/b` is not misread as a repo.

The module lists the repo tree through the GitHub API, selects text files (`.md .txt .py .js .ts .sh .json .yaml .yml .toml`), skips `node_modules`, `.git`, `vendor`, `dist`, `build`, and `.venv`, puts `SKILL.md` first, and then shallow files. Limits: 40 files, 100 KB per file, 200,000 characters in total. Only public repositories are supported. Setting `GITHUB_TOKEN` raises the API rate limit.

### 3.6 Frontend (`frontend/`)

Plain HTML, CSS, and JavaScript with no build step, so it can be deployed to any static host.

| File | Role |
|---|---|
| `index.html` | Landing page: waving SVG flag, headline, call to action, example scan |
| `scan.html`, `scan.js` | Scan page: three input methods, results panel |
| `demo.html` | Self-contained demo page (recorded scans, test results) |
| `styles.css` | Design tokens and components |
| `motion.js` | Reduced-motion handling and scroll-triggered example scan |
| `config.js` | `SKILLGUARD_API_BASE`, the URL of the backend |

Behaviour:

- Two-column layout on desktop (inputs 40%, results 60%), stacked on mobile.
- Results show the summary, a score count-up with a colored meter and a flag marker, the verdict, and flag cards with quoted evidence.
- All skill-derived text is inserted with `textContent`, never `innerHTML`, so content inside a malicious skill cannot run script on the page.
- Motion respects the `prefers-reduced-motion` setting: the flag animation pauses and the example scan shows its finished state.

---

## 4. Configuration

| Variable | Where | Purpose | Default |
|---|---|---|---|
| `GEMINI_API_KEY` | backend | Gemini API access (required for scans) | none |
| `SKILLGUARD_MODEL` | backend | Primary model | `gemini-3.5-flash-lite` |
| `SKILLGUARD_FALLBACK_MODEL` | backend | Fallback model | `gemini-3.6-flash` |
| `ALLOWED_ORIGINS` | backend | Comma-separated CORS origins | none (CORS off) |
| `GITHUB_TOKEN` | backend | Higher GitHub API rate limit | none |
| `SKILLGUARD_API_BASE` | `frontend/config.js` | Backend URL used by the browser | `""` (same origin) |

Local run:

```
pip install -r requirements.txt
$env:GEMINI_API_KEY = "<key>"
python -m uvicorn main:app --port 8001      # http://localhost:8001
```

---

## 5. Deployment design

| Part | Host | Notes |
|---|---|---|
| Frontend | Netlify (static) | `netlify.toml` publishes the `frontend/` folder. Set `SKILLGUARD_API_BASE` first. |
| Backend | Render (or similar) | Python 3.11. Start with `uvicorn main:app --host 0.0.0.0 --port $PORT`. |

The backend cannot run on Netlify Functions because it loads sentence-transformers and Chroma, which are too large for that environment. `requirements.txt` pins CPU-only PyTorch (`torch==2.9.1+cpu`) so the install avoids the multi-gigabyte CUDA build. The embedding model needs roughly 1 to 2 GB of memory, so a free 512 MB instance is not sufficient. **Deployment has not been verified end to end** at the time of writing.

---

## 6. Security design

| Risk | Mitigation |
|---|---|
| Skill text tries to instruct or mislead the scanner | System prompt marks the skill as untrusted data; skill wrapped in tags; evasion phrases flagged as critical. |
| Skill asks the scanner to rate it safe | Evasion rule is enforced in code, not only in the prompt. |
| Malicious text rendered in the results page | All dynamic text inserted with `textContent`. Verified with an injected `<img onerror>` payload. |
| Cross-origin abuse of the API | CORS disabled unless origins are listed explicitly. Tested with an allowed and a disallowed origin. |
| Oversized input and cost abuse | 200,000 character cap, 30 chunk cap, GitHub fetch limits, request timeout. |
| Secret exposure | API keys are read from the environment only and are not stored in the repository. |
| Input that is not a repo treated as one | Strict single-line repo pattern. |

Not implemented: authentication, per-user rate limiting, request logging for audit, and sandboxing. Anyone who can reach the API can use the Gemini quota behind it.

---

## 7. Design decisions and trade-offs

| Decision | Reason | Trade-off |
|---|---|---|
| RAG with a small curated knowledge base | Grounds the model in documented attacks and shows the user which known pattern a skill resembles | Coverage is limited to 16 patterns; new attack styles rely on the model's own judgement |
| LLM review rather than regex rules | Catches rephrased attacks and explains findings in plain language | Non-deterministic; scores and the number of flags can vary between runs |
| Evasion rule in code | Cannot be bypassed by wording in the skill | Any evasion flag forces score 100, even if the rest looks harmless |
| Flash-lite as default model | 1 to 3 s per scan against 15 to 30 s for the larger model, same verdicts in testing | A lighter model may miss subtle cases; the larger model remains the fallback and an option |
| In-memory vector store | No database to run; the 16 patterns embed in seconds at startup | Embedding is repeated on every start; not suited to a large knowledge base |
| No frontend build step | Deploys anywhere; easy to review | No component framework or type checking |

---

## 8. Limitations and future work

- **A scan sees only what it is given.** Pasting a single `SKILL.md` does not include the files it references. A skill graded poorly by an external directory returned no flags in testing because its problem was most likely in bundled files that were never pasted. Scanning the whole repository avoids this; a future version should show which files were scanned.
- **Knowledge base provenance.** Examples were extracted with NotebookLM. Two rebuilt examples were verified against their sources; the remaining ones were not re-verified individually.
- **Variability.** Repeated scans of the same skill can differ in the number of flags or the exact score, although verdicts were stable in testing.
- **Language and format.** Text only. Obfuscated or encoded payloads, binaries, and images are not analysed.
- **Planned:** the Personalize tab (suggested fixes), scan history, an API key or rate limit for the public deployment, scanning of private repositories, and a larger labelled benchmark.

---

## 9. Repository layout

```
main.py                  FastAPI app and routes
rag.py                   chunking, embeddings, retrieval
analyzer.py              prompt, Gemini call, validation, evasion rule
github_fetch.py          GitHub repo fetching
malicious_patterns.json  knowledge base (16 patterns)
frontend/                web interface and demo page
demo/                    sample skills, demo runner, demo page builder
tests/                   automated test suite (68 tests)
docs/                    specifications and these reports
requirements.txt  netlify.toml
```
