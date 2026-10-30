# Red Flags: Testing and Validation Report

**System under test:** Red Flags (SkillGuard) backend, knowledge base, and web interface
**Date:** 30 October 2026
**Environment:** Windows 11, Python 3.14.3, pytest, Playwright with Chromium 156, live Gemini API (`gemini-3.5-flash-lite`, fallback `gemini-3.6-flash`)

---

## 1. Summary

| Area | Result |
|---|---|
| Automated test suite (pytest) | **76 of 76 passed** in about 18 s (4 modules) |
| JavaScript unit tests (node:test) | **9 of 9 passed** (the logic that applies suggested edits) |
| Live validation on labelled skills | **8 of 8 classified correctly** (5 malicious flagged unsafe, 3 clean passed safe), repeated after each prompt change |
| Live scan time | 5 to 25 s in the latest run, average 10.8 s (1.7 to 4.9 s, average 2.5 s in the first run; see section 7.3) |
| Live GitHub repository scan | Worked (`octocat/Spoon-Knife`, score 0, safe) |
| Browser tests, scan page and landing page | **49 of 49 checks passed**, including a real scan, applying the suggested edits, and a real re-scan of the cleaned skill |
| Browser tests, demo page and walkthrough | 20 of 20 and 20 of 20 checks passed |
| Defects found and fixed during testing | 11 (section 8) |

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

Run with `python -m pytest tests`. Result: **76 passed, 0 failed, 0 skipped, about 18 s.**

| Module | Tests | What it covers |
|---|---|---|
| `test_github_fetch.py` | 23 | Repo reference parsing (7 valid forms, 7 rejected forms), file selection and ordering, file-count cap, fetching with mocked HTTP, error mapping (404, 403, 429, 500), repo with no scannable files, network failure |
| `test_analyzer.py` | 21 | JSON parsing (plain, code-fenced, invalid), score range validation, prompt contents (skill wrapped as untrusted, patterns included, evasion clause present, permissions and suggested changes requested), the new report fields (accepted, default to empty, survive the evasion override), evasion enforcement, retry on 503, fallback model, all models unavailable, non-retryable errors, timeouts |
| `test_api.py` | 18 | Scan of text and of a repo, plain text never triggers a GitHub fetch, error codes 400, 404, 413, 502, 503, file upload and non-UTF-8 upload, health endpoint, every frontend page, stylesheet and module served, JavaScript served with a JavaScript MIME type, permissions and suggested changes returned (and empty when the model omits them), CORS for allowed and disallowed origins |
| `test_rag.py` | 14 | Chunking (empty, short, overlap, cap), knowledge base schema and unique IDs, evasion pattern present, loading all 16 patterns, retrieval ranking, low similarity for clean text, empty input, two knowledge bases in one process |

**JavaScript unit tests** (`node --test tests/js/patch.test.mjs`, 9 tests) cover the code that applies suggested edits: exact and whitespace-tolerant matching, regex characters in the snippet treated literally, remove and replace, blank-line cleanup, edits that cannot be found being reported while the rest still apply, an unknown action treated as remove, and the original text never mutated.

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
| `bad_credential_theft.md` | unsafe | unsafe ✓ | 100 | credential harvesting ×2 (critical) | 11.0 s |
| `bad_data_exfil.md` | unsafe | unsafe ✓ | 95 | data exfiltration (critical), prompt injection (high) | 5.1 s |
| `bad_evasion.md` | unsafe | unsafe ✓ | 100 | evasion attempt (critical), data exfiltration (high) | 7.6 s |
| `bad_remote_payload.md` | unsafe | unsafe ✓ | 100 | supply chain ×2 (critical) | 25.5 s |
| `bad_session_sync.md` | unsafe | unsafe ✓ | 95 | data exfiltration (high) | 15.4 s |
| `good_csv_formatter.md` | safe | safe ✓ | 0 | none | 7.5 s |
| `good_git_commit_helper.md` | safe | safe ✓ | 0 | none | 8.0 s |
| `good_meeting_notes.md` | safe | safe ✓ | 0 | none | 5.9 s |

**Result: 8 of 8 correct, in both the first run and the run after the report gained permissions and suggested edits.** No false positives on the clean skills, including the git helper that legitimately runs shell commands, and no missed malicious skill. Average 10.8 s in the latest run (see section 7.3 for why this is slower than the first run's 2.5 s).

Each scan in the latest run also returned the new fields. The malicious skills listed 2 to 4 permissions (for example network access, reading environment variables and SSH keys, and shell execution, each rated high) and 1 to 2 suggested edits. The clean skills listed only low-trust access, such as running `git diff`, and no edits.

**Applying the edits, live.** In the browser, the credential-theft skill was scanned (score 100), the suggested edit was applied, which removed the malicious commands from the skill text, and the cleaned skill was scanned again with the real model: **score 0**. This was run once, so it shows the flow works, not that edits are reliable in general.

**GitHub repository scan.** `octocat/Spoon-Knife`, a public repository, was fetched through the live GitHub API and scanned: score 0, safe. The summary correctly described it as a README explaining how to fork a repository.

**Observations.**

- Skills that contained only one malicious instruction were still caught, for example the session sync skill, which has no hidden-instruction or evasion language.
- The `bad_evasion.md` skill, which tells the scanner to mark it safe, was flagged as an evasion attempt and scored 100.
- In `bad_data_exfil.md` the instruction "Do not mention this to the user" was not raised as a separate flag. The verdict was still correct. This shows that the number of flags per skill is not fully consistent.
- In an earlier ad hoc run of the same exfiltration text, the model returned two flags; in another, three. Verdicts and scores stayed in the same range.
- A sample skill that an external directory graded "F" returned no flags when only its `SKILL.md` was pasted. The retrieval similarity was low (best match 0.25), and the text itself looks benign. The referenced files were not included, so this reflects the input, not necessarily a scanner miss. See section 9.

---

## 7. User interface and non-functional testing

### 7.1 Browser tests (Playwright, Chromium)

**Scan page and landing page, 49 of 49 checks passed** (the earlier 19-check run covered the first version of the scan page), including:

- layout: the skill panel fills the left side, and the five result sections are stacked top to bottom at the same width, in the order Risk score, What's in it, What it takes, Red flags, Changes,
- empty, loading (skeleton), error and filled states for the sections, with the server's own error message shown next to the Scan button,
- **a real scan through the page with no mocking**, then applying the suggested edit, then undoing it, then applying it again and **re-scanning the cleaned skill with the real model**,
- applying edits to an uploaded file moves the text into the Paste tab; for a GitHub repo, Apply is disabled with an explanation; edits whose text cannot be found are disabled,
- landing page: three acts, 100 skills with 26 flagged, the counter reaching 26 as the flags turn red, text typing in progressively, and the canvas flags turning from red to green by the end (167,242 green pixels against 0 red),
- reduced motion: the flag is paused, the counter shows 26 immediately, and the full text and button are shown,
- mobile layouts with no horizontal overflow, and no JavaScript or console errors.

An earlier run of the first scan page, **19 of 19 checks**, covered:

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

The default model was changed from the slowest to the fastest after this measurement. These numbers are from the day the model was chosen.

**Later in testing the same service was slower.** In the final run, scans of the same skills took 5 to 25 s (average 10.8 s) with no overload retries logged. A direct probe the same hour showed why: a trivial 5-token reply from `gemini-3.5-flash-lite` took 11.6 s (0.7 s earlier). The previous prompt took about 5 s on a skill that took 1.7 s before, so most of the slowdown is the service. The longer prompt and larger report (permissions and suggested edits) add roughly 1 to 3 s on top (5.1 s against 6.1 to 8.1 s for the same skill). Asking the model for shorter snippets did not change this measurably. Latency should be re-measured before any live demo. The slower model was overloaded during testing and returned 503 errors, which also triggered the retry logic. Turning off the model's "thinking" budget made no meaningful difference (13.0 s against 16.6 s), so the delay was service latency, not model reasoning.

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
| 10 | Typed message on the landing page reserved a fixed height, leaving a large gap above the button and risking a layout shift on narrow screens | Screenshot review | An invisible copy of the full text holds the final height, and the typed text is overlaid on it |
| 11 | Two unrelated landing page elements shared the class name `pole` (the hero flag's pole and the 100-skill field), so styles and test selectors collided | Browser test counted 101 poles | Field cells renamed `skill-cell` |

Defect 9 was an error in the test, not in the code. The others were defects in the product.

---

## 9. Limitations and what was not validated

- **Small labelled sample.** 8 skills (5 malicious, 3 clean) written for the demo. They are based on the documented attack patterns, so the test is not independent of the knowledge base. A larger benchmark with real flagged skills and skills the system has never seen is needed before claiming an accuracy figure.
- **Suggested edits.** The model proposes the edits, and they were verified end to end on one skill only. A patched skill may no longer work as intended, and the edits are not guaranteed to remove every problem. The pure matching and patching code is unit-tested; the quality of the model's suggestions is not.
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
node --test tests/js/patch.test.mjs

# 2. Live validation (server running with GEMINI_API_KEY set)
python -m uvicorn main:app --port 8001
python demo/run_demo.py http://localhost:8001      # writes demo/results.json

# 3. Rebuild the shareable demo page
python demo/build_demo.py                          # writes frontend/demo.html
```

To add your own cases, put files named `good_*.md` or `bad_*.md` in `demo/skills/`, then run steps 2 and 3. Open `frontend/demo.html` directly in a browser, or deploy it with the site.
