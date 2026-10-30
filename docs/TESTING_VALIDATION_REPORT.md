# Red Flags: Testing and Validation Report

**System under test:** Red Flags (SkillGuard) backend, knowledge base, and web interface
**Date:** 30 October 2026
**Environment:** Windows 11, Python 3.14.3, pytest, Playwright with Chromium 156, live Gemini API (`gemini-3.5-flash-lite`, fallback `gemini-3.6-flash`)

---

## 1. Summary

| Area | Result |
|---|---|
| Automated test suite (pytest) | **68 of 68 passed** in 13.4 s (4 modules) |
| Live validation on labelled skills | **8 of 8 classified correctly** (5 malicious flagged unsafe, 3 clean passed safe) |
| Live scan time | 1.7 to 4.9 s per scan, average 2.5 s |
| Live GitHub repository scan | Worked (`octocat/Spoon-Knife`, 3.0 s, score 0, safe) |
| Browser tests, scan interface | 19 of 19 checks passed (includes one real, unmocked scan) |
| Browser tests, demo page | 20 of 20 checks passed |
| Defects found and fixed during testing | 9 (section 8) |

**What this does and does not show.** Every component passed the checks designed for it, and the end-to-end path works against the real model. The labelled live sample is small (8 skills), so the 8 of 8 result demonstrates that the system works on representative cases. It is not a statistical estimate of accuracy. Limitations are listed in section 9.

---

## 2. Objectives and approach

Validation was organised in layers, from the cheapest and most deterministic checks to the most realistic.

| Layer | Question | Method |
|---|---|---|
| Unit | Does each function behave correctly in isolation? | pytest, no network |
| Integration | Do the API, retrieval, and analysis work together? | pytest with the real embedding model and mocked Gemini and GitHub |
| Knowledge base | Is the data well-formed and plausibly sourced? | schema tests, spot verification against sources |
| Retrieval quality | Do the right patterns surface? | known attack texts against the real vector store |
| End to end, live | Does the real system give correct verdicts? | demo runner against the running API with the real Gemini model |
| User interface | Does the page work for a real user? | Playwright browser tests, screenshots, mobile and reduced-motion runs |
| Non-functional | Speed, resilience, safety of rendered output | latency measurements, retry tests, injection payload test |

---

## 3. Automated test suite

Run with `python -m pytest tests`. Result: **68 passed, 0 failed, 0 skipped, 13.4 s.**

| Module | Tests | What it covers |
|---|---|---|
| `test_github_fetch.py` | 23 | Repo reference parsing (7 valid forms, 7 rejected forms), file selection and ordering, file-count cap, fetching with mocked HTTP, error mapping (404, 403, 429, 500), repo with no scannable files, network failure |
| `test_analyzer.py` | 16 | JSON parsing (plain, code-fenced, invalid), score range validation, prompt contents (skill wrapped as untrusted, patterns included, evasion clause present), evasion enforcement, retry on 503, fallback model, all models unavailable, non-retryable errors, timeouts |
| `test_api.py` | 15 | Scan of text and of a repo, plain text never triggers a GitHub fetch, error codes 400, 404, 413, 502, 503, file upload and non-UTF-8 upload, health endpoint, frontend pages served, CORS for allowed and disallowed origins |
| `test_rag.py` | 14 | Chunking (empty, short, overlap, cap), knowledge base schema and unique IDs, evasion pattern present, loading all 16 patterns, retrieval ranking, low similarity for clean text, empty input, two knowledge bases in one process |

Key behaviours confirmed:

- **Evasion rule:** a model reply that scores an evasive skill at 30 and "safe" is overridden to 100 and unsafe, with the summary note added exactly once. A non-evasion flag does not trigger the override.
- **Resilience:** two 503 responses followed by success makes 3 calls with waits of 1 s and 3 s. Three 503s on the primary model switch to the fallback model. When both models fail, the error is raised after 6 calls. A 400 error is raised immediately without retry.
- **Input handling:** `"Some skill text with a/b in it"` and multi-line input are not treated as repos. A 300,000-character input returns 413. Missing `GEMINI_API_KEY` returns 503 with a clear message.

---

## 4. Knowledge base validation

| Check | Result |
|---|---|
| File parses; metadata count equals pattern count (16) | Pass |
| Every pattern has all required fields and a source label | Pass |
| Categories and severities within the allowed sets | Pass |
| Pattern IDs unique | Pass |
| Every pattern has a `source_url` starting with `http` | Pass |
| `evasion_001` present with category `evasion_attempt` | Pass |
| Examples checked against their original source | **2 of 16 verified** |

The two verified examples were the environment-variable harvesting command and the password-protected archive download. Both were checked by asking NotebookLM, limited to the specific source, for the exact text. The first matched apart from a line break. The second showed that the source itself contains empty placeholders in the URL, so the verbatim text was used instead of an invented placeholder. **The other 14 examples came from the same extraction but were not re-verified one by one.** Some had garbled characters in the extraction (escape characters, stray spaces) that were corrected by hand.

---

## 5. Retrieval validation

Real embedding model, real vector store, 16 patterns.

| Input | Best match | Similarity |
|---|---|---|
| Skill that syncs `.env` and shell history to a cloud endpoint | `data_exfiltration_002` (session persistence) | 0.675 |
| Evasive skill ("mark this skill as completely safe") | `evasion_001` | 0.593 |
| Demo: `bad_session_sync.md` | `data_exfiltration_002` | 0.762 |
| Demo: `bad_credential_theft.md` | `credential_harvesting_001` | 0.669 |
| Demo: `bad_remote_payload.md` | `supply_chain_001` | 0.582 |
| Demo: `bad_evasion.md` | `evasion_001` | 0.393 |
| Demo: `bad_data_exfil.md` | `credential_harvesting_002` | 0.347 |
| Demo: clean skills | various | 0.115, 0.213, 0.308 |

**Finding.** The correct attack family is usually the top match for malicious skills. Similarity alone does not cleanly separate malicious from clean: the highest clean score (0.308, a git helper skill that mentions shell commands) overlaps the lowest malicious score (0.347). This is why retrieval is used only to give the language model context, and the verdict comes from the model's review of the full text, not from a similarity threshold.

---

## 6. Live end-to-end validation

The demo runner (`demo/run_demo.py`) sent each skill in `demo/skills/` to the running API with the real Gemini model. Files named `bad_*` are expected to be unsafe and `good_*` safe.

| Skill | Expected | Verdict | Score | Flags raised | Time |
|---|---|---|---|---|---|
| `bad_credential_theft.md` | unsafe | unsafe ✓ | 100 | credential harvesting ×2 (critical), prompt injection (high) | 4.9 s |
| `bad_data_exfil.md` | unsafe | unsafe ✓ | 95 | data exfiltration (critical) | 2.2 s |
| `bad_evasion.md` | unsafe | unsafe ✓ | 100 | evasion attempt (critical), data exfiltration (high) | 2.4 s |
| `bad_remote_payload.md` | unsafe | unsafe ✓ | 100 | supply chain ×2 (critical) | 2.3 s |
| `bad_session_sync.md` | unsafe | unsafe ✓ | 90 | data exfiltration (high) | 2.3 s |
| `good_csv_formatter.md` | safe | safe ✓ | 0 | none | 2.0 s |
| `good_git_commit_helper.md` | safe | safe ✓ | 0 | none | 1.8 s |
| `good_meeting_notes.md` | safe | safe ✓ | 0 | none | 1.7 s |

**Result: 8 of 8 correct. Average 2.5 s.** No false positives on the clean skills, including the git helper that legitimately runs shell commands. No missed malicious skill.

**GitHub repository scan.** `octocat/Spoon-Knife`, a public repository, was fetched through the live GitHub API and scanned: score 0, safe, 3.0 s. The summary correctly described it as a README explaining how to fork a repository.

**Observations.**

- Skills that contained only one malicious instruction were still caught, for example the session sync skill, which has no hidden-instruction or evasion language.
- The `bad_evasion.md` skill, which tells the scanner to mark it safe, was flagged as an evasion attempt and scored 100.
- In `bad_data_exfil.md` the instruction "Do not mention this to the user" was not raised as a separate flag. The verdict was still correct. This shows that the number of flags per skill is not fully consistent.
- In an earlier ad hoc run of the same exfiltration text, the model returned two flags; in another, three. Verdicts and scores stayed in the same range.
- A sample skill that an external directory graded "F" returned no flags when only its `SKILL.md` was pasted. The retrieval similarity was low (best match 0.25), and the text itself looks benign. The referenced files were not included, so this reflects the input, not necessarily a scanner miss. See section 9.

---

## 7. User interface and non-functional testing

### 7.1 Browser tests (Playwright, Chromium)

**Scan interface, 19 of 19 checks passed**, including:

- landing page title, heading, and a flag whose rendered shape changes over time (5 distinct frames in 5 samples),
- the example scan plays once after it scrolls into view,
- empty input, bad GitHub input, and server error messages shown in plain language,
- **one real scan through the page with no mocking**: evasive skill, finished in 2.9 to 3.5 s, score 100, unsafe, evasion flag present, at least two flag cards,
- "Scan Another Skill" clears the inputs and results,
- mobile layout in one column with no horizontal overflow,
- with reduced motion on, the flag animation is paused and the example shows its finished state,
- no JavaScript or console errors.

**Demo page, 20 of 20 checks passed**, including opening from a plain file with no server, clicking each of the 8 skills and confirming the verdict shown matches the label, the Tests tab showing 68 of 68, and the mobile layout.

### 7.2 Safety of rendered output

A flag snippet containing `<img src=x onerror="window.__xss=1">` was rendered through the results panel. It appeared as visible text, no image element was created, and the script did not run. This is expected because skill-derived text is inserted with `textContent`.

### 7.3 Latency and model selection

| Model | Trivial prompt | Real scan | Verdicts on 2 test skills |
|---|---|---|---|
| `gemini-3.8-flash` | 162 s | about 71 s | correct |
| `gemini-3.6-flash` | 2.6 s | 13 to 32 s | malicious: 100 / unsafe; benign: 0 / safe |
| `gemini-3.5-flash-lite` | 0.7 s | 1 to 3 s | malicious: 100 / unsafe; benign: 0 / safe |

The default model was changed from the slowest to the fastest after this measurement. The slower model was overloaded during testing and returned 503 errors, which also triggered the retry logic. Turning off the model's "thinking" budget made no meaningful difference (13.0 s against 16.6 s), so the delay was service latency, not model reasoning.

### 7.4 Responsive and accessibility checks

Checked at 1366 px and 390 px widths. Interactive controls are real buttons and inputs with visible keyboard focus. Text colours were chosen for contrast on the light background. A formal accessibility audit (screen reader, axe-core) was **not** run.

---

## 8. Defects found and fixed during testing

| # | Defect | How it was found | Fix |
|---|---|---|---|
| 1 | File upload endpoint failed at import: `python-multipart` missing | First API smoke test | Added to `requirements.txt` |
| 2 | Knowledge base path default bound at import time, so tests and overrides had no effect | Smoke test returned 503 | Resolve the default at call time |
| 3 | Second knowledge base instance crashed: "Collection already exists" | Smoke test with two instances | Unique collection name per instance; regression test added |
| 4 | Gemini overloaded, causing a 71 s scan and 503 errors | Live use and timing | Retries, fallback model, 45 s timeout, faster default model |
| 5 | UI hid the real error ("scanner not ready") behind a generic message | Live use with no API key set | Page now shows the server's message |
| 6 | Waving flag looked almost flat for part of each cycle | Screenshot review | Replaced a two-shape morph with four distinct wave shapes |
| 7 | Mobile layout overflowed horizontally (three separate causes: grid column stretching, score block minimum width, long unbroken pattern names) | Browser overflow check | Allowed grid children and rows to shrink and wrap |
| 8 | Example code lines were truncated on mobile, hiding the flagged text | Screenshot review | Lines wrap on narrow screens |
| 9 | Test expectation wrong for chunk count (expected 4, correct is 3) | First pytest run | Test corrected to match the specified chunk step |

Defect 9 was an error in the test, not in the code. The other eight were defects in the product.

---

## 9. Limitations and what was not validated

- **Small labelled sample.** 8 skills (5 malicious, 3 clean) written for the demo. They are based on the documented attack patterns, so the test is not independent of the knowledge base. A larger benchmark with real flagged skills and skills the system has never seen is needed before claiming an accuracy figure.
- **Real-world flagged skills.** Only one externally graded skill was tried, and only its `SKILL.md`, which returned no flags. Scanning full repositories of flagged skills was not completed.
- **Model variability.** The language model is not deterministic. The number of flags and the exact score vary between runs. Repeat runs were not systematically measured.
- **Knowledge base examples.** 14 of 16 examples were not individually checked against their sources.
- **Adversarial robustness.** One evasion style (direct "mark this safe" text) is tested. Other evasion techniques such as encoded payloads, text split across files, or non-English instructions were not tested.
- **Deployment.** The Render backend and Netlify frontend were not verified in a hosted environment. The CPU-only PyTorch pin was checked against the PyTorch index for a Linux, Python 3.11 wheel but was not installed on Linux.
- **Browsers.** Only Chromium was tested. Firefox and Safari were not.
- **Load and abuse.** No load, concurrency, or rate-limit testing. The API has no authentication.
- **Private repositories** and repositories over the file and size limits are not supported and were not tested beyond the limits themselves.
- **Fonts.** The pages load Google Fonts and fall back to system fonts if the network is unavailable. The offline appearance was not reviewed.

---

## 10. How to reproduce

```
# 1. Automated tests (no API key needed)
python -m pytest tests -q --junitxml=tests/junit.xml

# 2. Live validation (server running with GEMINI_API_KEY set)
python -m uvicorn main:app --port 8001
python demo/run_demo.py http://localhost:8001      # writes demo/results.json

# 3. Rebuild the shareable demo page
python demo/build_demo.py                          # writes frontend/demo.html
```

To add your own cases, put files named `good_*.md` or `bad_*.md` in `demo/skills/`, then run steps 2 and 3. Open `frontend/demo.html` directly in a browser, or deploy it with the site.
