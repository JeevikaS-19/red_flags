Markdown · RED_FLAGS_DESIGN_SPEC.md

# Red Flags: Design & Feature Specification

**For Claude Code to rebuild the frontend from scratch.**

---

## Landing Page Design

### Visual Style

- **Bold, Gen Z aesthetic** - minimal but striking
- **Large red flag icon/graphic** (🚩 or custom SVG) centered and prominent, colored in vibrant red (#dc2626)
- **Dark gradient backdrop** (dark gray to black, subtle)
- **Clean white text** on dark background for contrast
- **Confident, bold typography**

### Content

**Headline:** "Red Flags"

**Subheading/Explanation (2-3 sentences, conversational):** "Not sure if your Claude skill is legit? We scan for hidden instructions, data exfiltration, credential theft, and sketchy behavior. Upload your skill file, paste your code, or drop a GitHub repo link—we'll audit it in seconds."

**Call-to-Action:** One button: "Start Scanning" (white text on dark background, simple, bold)

### Layout

```
┌─────────────────────────────────────┐
│                                     │
│           [RED FLAG ICON]           │
│           (large, center)           │
│                                     │
│          RED FLAGS                  │
│   (bold, large heading)             │
│                                     │
│   "Not sure if your Claude skill    │
│    is legit? We scan for hidden     │
│    instructions, data exfiltration, │
│    credential theft, and sketchy    │
│    behavior. Upload your skill      │
│    file, paste your code, or drop   │
│    a GitHub repo link—we'll audit   │
│    it in seconds."                  │
│                                     │
│      [START SCANNING]               │
│       (white button)                │
│                                     │
└─────────────────────────────────────┘
```

---

## Platform Page Design

### Layout

**Two-column layout:**

- **Left side (40%):** Input section (scan controls)
- **Right side (60%):** Results display

### Left Side: Input & Scan

**Three input options (user picks one):**

1. **Paste Skill Code**
   - Large textarea
   - Placeholder: "Paste your SKILL.md file content here..."
   - Accepts full markdown
2. **Upload Skill File**
   - Drag-and-drop zone or file picker
   - Accepts `.md`, `.txt`
   - Shows filename once selected
3. **Paste GitHub Repo Link**
   - Input field
   - Placeholder: "[https://github.com/user/repo](https://github.com/user/repo) or user/repo"
   - Gemini API will fetch and scan the repo

**Scan Button**

- Position: **Below the three input options** (left side)
- Style: Bold red (#dc2626), full width
- Text: "Scan"
- On click: Sends to `/scan` endpoint, backend handles GitHub fetching (if repo link) or text analysis (if code)

### Right Side: Results Display

**Sections (in order):**

1. **Summary: What This Skill Does**
   - Bullet points
   - Auto-generated from Gemini analysis
2. **Risk Score**
   - Large number (0-100)
   - Color-coded progress bar (green → yellow → orange → red)
   - Status: "Safe to Install ✓" or "Unsafe - Do Not Install ✗"
3. **Red Flags** (Tabbed View)
   - **Tab 1: Flags** - list of vulnerabilities with code snippets
   - **Tab 2: Personalize** - button to apply changes via Gemini (stubbed for now)
4. **Scan Another Skill** Button
   - Clears all inputs, ready for new scan

---

## Input Handling (Backend)

### Endpoint: `POST /scan`

**Accepts:**

```json
{
  "skill_code": "string (SKILL.md content OR GitHub repo link)"
}
```

**Backend logic:**

- If input starts with `github.com/` or matches `user/repo`:
  - Fetch repo from GitHub API
  - Scan all files for malicious patterns
- If input is text:
  - Scan the text directly (current behavior)

**Returns:** Same JSON structure as before:

```json
{
  "summary": [...],
  "risk_flags": [...],
  "overall_risk_score": X,
  "safe_to_install": bool
}
```

---

## Design Details

### Colors

- **Red (danger):** #dc2626
- **Orange (warning):** #ea8c55
- **Green (safe):** #16a34a
- **Dark background:** #1a1a1a or #0f172a
- **Text:** #ffffff on dark, #1a1a1a on light

### Typography

- **Font:** System fonts (-apple-system, Segoe UI, etc.)
- **Headings:** Bold, uppercase, letter-spacing
- **Body:** Regular, clean, readable

### Spacing

- Generous padding (20-40px)
- Clear separation between sections
- Grid layout (40/60 split on desktop, stacked on mobile)

---

## User Flow

```
1. User sees landing page
   ↓
2. Clicks "Start Scanning"
   ↓
3. Platform page loads
   ↓
4. User chooses input method:
   - Paste skill code
   - Upload file
   - Paste GitHub repo link
   ↓
5. User clicks "Scan"
   ↓
6. Loading state (spinner + "Analyzing...")
   ↓
7. Results appear (right side auto-populates)
   ↓
8. User can:
   - Switch to Personalize tab
   - Click "Scan Another Skill"
   - Copy results
```

---

## Key Features

✓ **Landing page** - visually bold, explains value\
✓ **Three input methods** - flexibility\
✓ **GitHub repo scanning** - Gemini fetches and analyzes\
✓ **Live results** - right side populates after scan\
✓ **Tabs** - Flags vs. Personalize\
✓ **Responsive** - works on mobile (stacked layout)\
✓ **Error handling** - shows messages if scan fails\
✓ **Gen Z aesthetic** - minimal, confident, intentional

---

## Implementation Notes for Claude Code

1. **Landing page:** Make it visually striking. Use a gradient backdrop, large red flag icon (SVG or emoji), bold text.
2. **GitHub support:** Backend needs to handle `github.com/user/repo` or `user/repo` format. Use GitHub API to fetch files.
3. **Scan button placement:** On the LEFT side, below the three input options.
4. **Results:** Auto-populate on the RIGHT side when scan completes.
5. **Error states:** Show friendly messages (e.g., "GitHub repo not found", "Invalid input").
6. **Responsive:** Left/right layout should stack on mobile.

---

## Not Needed (Phase 2)

- Personalize functionality (stub the button for now)
- Dark mode toggle
- Save/export results
- History of scans

---

**Ready for Claude Code to build.**