(function () {
  const API_BASE = (window.SKILLGUARD_API_BASE || "").replace(/\/$/, "");
  const REPO_PATTERN = /^(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$|^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  const SEVERITIES = ["critical", "high", "medium", "low"];

  const $ = (id) => document.getElementById(id);
  const scanBtn = $("scan-btn");
  let activeTab = "paste";
  let lastResult = null;

  // ---------- Input tabs ----------

  document.querySelectorAll("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => selectInputTab(tab.dataset.tab));
  });

  function selectInputTab(name) {
    activeTab = name;
    document.querySelectorAll("[data-tab]").forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", String(on));
    });
    document.querySelectorAll("[data-panel]").forEach((p) => {
      p.hidden = p.dataset.panel !== name;
    });
  }

  // ---------- File upload ----------

  const fileInput = $("skill-file");
  const dropzone = $("dropzone");

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    $("file-label").textContent = file ? file.name : "Drop a .md or .txt file here, or click to choose one";
  });

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    })
  );

  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, () => dropzone.classList.remove("is-dragover"))
  );

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      fileInput.dispatchEvent(new Event("change"));
    }
  });

  // ---------- Result tabs ----------

  document.querySelectorAll("[data-result-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.resultTab;
      document.querySelectorAll("[data-result-tab]").forEach((t) => {
        const on = t.dataset.resultTab === name;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", String(on));
      });
      document.querySelectorAll("[data-result-panel]").forEach((p) => {
        p.hidden = p.dataset.resultPanel !== name;
      });
    });
  });

  // ---------- Scan ----------

  scanBtn.addEventListener("click", runScan);

  async function runScan() {
    const request = buildRequest();
    if (request.error) {
      showState("error", request.error);
      return;
    }

    scanBtn.disabled = true;
    showState("loading");
    try {
      const res = await fetch(API_BASE + request.path, request.options);
      const data = await readJson(res);
      if (!res.ok) {
        showState("error", errorMessage(res.status, data));
        return;
      }
      lastResult = data;
      renderResults(data);
      showState("results");
    } catch (err) {
      showState("error", "Couldn't reach the scan service. Check your connection and try again.");
    } finally {
      scanBtn.disabled = false;
    }
  }

  function buildRequest() {
    if (activeTab === "upload") {
      const file = fileInput.files[0];
      if (!file) return { error: "Choose a .md or .txt file to scan." };
      const body = new FormData();
      body.append("file", file);
      return { path: "/scan/file", options: { method: "POST", body } };
    }

    const text = activeTab === "github" ? $("repo-input").value.trim() : $("skill-text").value.trim();
    if (!text) {
      return {
        error: activeTab === "github"
          ? "Enter a GitHub repo link or user/repo first."
          : "Paste your skill code first.",
      };
    }
    if (activeTab === "github" && !REPO_PATTERN.test(text)) {
      return { error: "That doesn't look like a GitHub repo. Try github.com/user/repo or user/repo." };
    }

    return {
      path: "/scan",
      options: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_code: text }),
      },
    };
  }

  async function readJson(res) {
    try {
      return await res.json();
    } catch (err) {
      return {};
    }
  }

  function errorMessage(status, data) {
    if (status === 413) return "That skill is too large to scan. Try a smaller file or repo.";
    if (status === 503) return "The scanner isn't ready yet. Please try again later.";
    if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).join(" ");
    if (typeof data.detail === "string") return data.detail;
    return `Scan failed (error ${status}).`;
  }

  // ---------- Rendering ----------

  function showState(name, message) {
    $("state-empty").hidden = name !== "empty";
    $("state-loading").hidden = name !== "loading";
    $("state-error").hidden = name !== "error";
    $("state-results").hidden = name !== "results";
    if (name === "error") $("error-text").textContent = message;
  }

  function renderResults(report) {
    const summary = $("summary");
    summary.replaceChildren(...report.summary.map((item) => el("li", item)));

    const score = report.overall_risk_score;
    $("score-number").textContent = score;
    const fill = $("score-fill");
    fill.style.width = score + "%";
    fill.style.backgroundColor = scoreColor(score);

    const verdict = $("verdict");
    verdict.textContent = report.safe_to_install ? "Safe to Install ✓" : "Unsafe - Do Not Install ✗";
    verdict.className = "verdict " + (report.safe_to_install ? "is-safe" : "is-unsafe");

    const flags = $("flags");
    if (report.risk_flags.length === 0) {
      flags.replaceChildren(el("p", "No red flags found.", "no-flags"));
    } else {
      flags.replaceChildren(...report.risk_flags.map(renderFlag));
    }

    // Reset to the Flags tab for each new result.
    document.querySelector('[data-result-tab="flags"]').click();
  }

  function renderFlag(flag) {
    const severity = SEVERITIES.includes(flag.severity) ? flag.severity : "low";
    const card = el("div", "", "flag " + severity);

    const head = el("div", "", "flag-head");
    head.append(el("span", severity.toUpperCase(), "badge"));
    head.append(el("span", flag.category, "flag-category"));

    card.append(head);
    card.append(el("pre", flag.snippet));
    card.append(el("p", flag.explanation));
    card.append(el("p", "Recommendation: " + flag.recommendation));
    return card;
  }

  function scoreColor(score) {
    if (score <= 24) return "var(--green)";
    if (score <= 49) return "var(--yellow)";
    if (score <= 74) return "var(--orange)";
    return "var(--red)";
  }

  function el(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text; // skill content is untrusted, never use innerHTML
    if (className) node.className = className;
    return node;
  }

  // ---------- Copy and reset ----------

  $("copy-btn").addEventListener("click", async (e) => {
    if (!lastResult) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(lastResult, null, 2));
      e.target.textContent = "Copied!";
      setTimeout(() => (e.target.textContent = "Copy results"), 1500);
    } catch (err) {
      e.target.textContent = "Copy failed";
      setTimeout(() => (e.target.textContent = "Copy results"), 1500);
    }
  });

  $("again-btn").addEventListener("click", () => {
    $("skill-text").value = "";
    $("repo-input").value = "";
    fileInput.value = "";
    $("file-label").textContent = "Drop a .md or .txt file here, or click to choose one";
    lastResult = null;
    selectInputTab("paste");
    showState("empty");
  });
})();
