
Markdown · RAG_DEVELOPMENT_BRIEF.md

# SkillGuard: RAG Development Brief

**Status:** Phase 1 - Knowledge Base Curation (Jeev's work)\
**Next Phase:** Backend Development (Claude Code integration)

---

## What You're Building

A **reasoning-based security scanner service** that:

1. Takes uploaded skill code
2. Retrieves similar attack patterns from a knowledge base
3. Uses Claude to flag vulnerabilities in plain language
4. Returns structured risk report with recommendations

**Not a website. Not yet a mobile app.** A core service/backend that can be deployed as:

- REST API endpoint
- CLI tool
- Web form (simple MVP)
- Later: landing page, apps, GitHub Action

---

## Current Progress

### Phase 1: Knowledge Base (Jeev) - IN PROGRESS

Jeev is:

- Reading 8 academic papers + articles on skill security (2026)
- Extracting 15-20 malicious patterns with concrete examples
- Compiling into `malicious_patterns.json`

**What you'll receive:** A single JSON file with:

```json
{
  "patterns": [
    {
      "pattern_id": "...",
      "name": "...",
      "description": "...",
      "category": "prompt_injection|data_exfiltration|credential_harvesting|privilege_escalation|supply_chain",
      "severity": "critical|high|medium|low",
      "pattern_examples": [...],
      "source_paper": "...",
      "source_url": "...",
      "explanation": "...",
      "indicators": [...]
    }
  ]
}
```

**Timing:** Jeev will notify when ready (\~1-2 hours).

---

## Phase 2: Your Job (Backend + RAG Integration)

When you receive the KB, build:

### 1. Vector DB Setup (30 min)

- Load `malicious_patterns.json`
- Embed all patterns using `sentence-transformers`
- Initialize Chroma in-memory vector DB
- Test retrieval (query with sample skill text)

### 2. FastAPI Backend (60 min)

```python
POST /scan
  Input: skill_code (string or file)
  Process:
    1. Parse/chunk skill
    2. Embed chunks
    3. Retrieve top 5 similar patterns from KB
    4. Send to Claude API with context
    5. Parse Claude response
  Output: JSON risk report
```

### 3. Claude Analysis Prompt (30 min)

Craft prompt that:

- Takes skill code + retrieved patterns
- Flags: prompt injection, data exfiltration, credential harvesting, privilege escalation, supply chain risks
- Returns structured JSON:

  ```json
  {
    "summary": ["what it does"],
    "risk_flags": [
      {
        "category": "...",
        "severity": "...",
        "snippet": "...",
        "explanation": "...",
        "recommendation": "..."
      }
    ],
    "overall_risk_score": 0-100,
    "safe_to_install": true/false
  }
  ```

### 4. Test & Validate (60 min)

- Scan 3-4 real flagged skills (from Skills Directory or papers)
- Verify flags are accurate
- Iterate Claude prompt if needed
- Document findings

**Total Phase 2: \~3-4 hours**

---

## Phase 3: Testing & Upload (Before Oct 31)

- Test against real GitHub skills
- Ensure all API endpoints working
- Upload to GitHub
- Create minimal working demo

---

## Phase 4: Frontend + Polish (Post-Upload)

Simple for now:

- HTML textarea form
- Submit → call `/scan` endpoint
- Display results
- (Cleanup/refinement suggestions later)

---

## Deployment & Scaling (Post-Hackathon)

### MVP (Now - Oct 31)

- FastAPI backend (on Replit or local)
- Simple HTML form
- Works with real skills

### v1 (Weeks After)

- **Landing page** (Vercel) - explains what SkillGuard does, links to app
- **Web app** (React on Vercel) - better UX, form, results display
- **API docs** - for developers to integrate

### Scaling (Months After)

- **Mobile apps** - React Native (iOS/Android)
- **CLI tool** - `npm install -g skillguard` → scan locally
- **GitHub Action** - scan skills on each PR
- **SaaS dashboard** - organizations upload, track scans over time

For hackathon: just get the core working.

---

## Key Files You'll Need

1. **malicious_patterns.json** ← Jeev will provide
2. **main.py** ← Your FastAPI app
3. **requirements.txt** ← Dependencies (fastapi, sentence-transformers, chromadb, anthropic)
4. **app.html** ← Simple form (can be bare bones)

---

## When to Start

**Jeev will ping you once the KB is ready.** That's your signal to begin Phase 2.

Until then, you can:

- Set up environment (pip install dependencies)
- Draft the FastAPI structure
- Draft the Claude prompt
- Plan the HTML form

---

## Success Criteria (Oct 31)

- Backend works (no crashes)
- Can scan real skills from GitHub
- Flags are meaningful (not false positives)
- Risk report is structured JSON
- Everything on GitHub, documented

Ready to go when you hear from Jeev.