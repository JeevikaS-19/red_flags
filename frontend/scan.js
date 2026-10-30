(function () {
  const API_BASE = (window.SKILLGUARD_API_BASE || "").replace(/\/$/, "");
  const REPO_PATTERN = /^(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$|^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  const SEVERITIES = ["critical", "high", "medium", "low"];
  const SVG_NS = "http://www.w3.org/2000/svg";

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
  const FILE_PROMPT = "Drop a .md or .txt file here, or click to choose one";

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    $("file-label").textContent = file ? file.name : FILE_PROMPT;
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
    scanBtn.textContent = "Scanning...";
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
      revealResultsOnSmallScreens();
    } catch (err) {
      showState("error", "Couldn't reach the scan service. Check your connection and try again.");
    } finally {
      scanBtn.disabled = false;
      scanBtn.textContent = "Scan";
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
    if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).join(" ");
    if (typeof data.detail === "string") return data.detail;
    if (status === 503) return "The scanner isn't ready yet. Please try again later.";
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
    $("summary").replaceChildren(...report.summary.map((item) => el("li", item)));

    const score = report.overall_risk_score;
    countUp($("score-number"), score);
    $("score-block").dataset.band = scoreBand(score);

    // Reset to 0 first so the meter animates up from the start on every scan.
    const meterWrap = $("meter").parentElement;
    meterWrap.style.setProperty("--score", 0);
    requestAnimationFrame(() => requestAnimationFrame(() => meterWrap.style.setProperty("--score", score)));

    const verdict = $("verdict");
    verdict.textContent = report.safe_to_install ? "Safe to Install ✓" : "Unsafe - Do Not Install ✗";
    verdict.className = "verdict " + (report.safe_to_install ? "is-safe" : "is-unsafe");

    $("flag-count").textContent = report.risk_flags.length;
    const flags = $("flags");
    if (report.risk_flags.length === 0) {
      flags.replaceChildren(el("p", "No red flags found.", "no-flags"));
    } else {
      flags.replaceChildren(...report.risk_flags.map((flag, i) => renderFlag(flag, i)));
    }

    // Reset to the Flags tab for each new result.
    document.querySelector('[data-result-tab="flags"]').click();
  }

  function renderFlag(flag, index) {
    const severity = SEVERITIES.includes(flag.severity) ? flag.severity : "low";
    const card = el("div", "", "flag " + severity);
    card.style.setProperty("--n", index); // staggers the entrance animation

    const head = el("div", "", "flag-head");
    head.append(flagIcon("flag-icon-sm"));
    head.append(el("span", humanize(flag.category), "flag-category"));
    head.append(el("span", humanize(severity), "badge"));

    card.append(head);
    card.append(el("pre", flag.snippet));
    card.append(el("p", flag.explanation));
    const rec = el("p", "");
    rec.append(el("strong", "Recommendation: "), document.createTextNode(flag.recommendation));
    card.append(rec);
    return card;
  }

  let countFrame = null;

  function countUp(node, target) {
    cancelAnimationFrame(countFrame);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || target === 0) {
      node.textContent = target;
      return;
    }

    const duration = 900;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out
      node.textContent = Math.round(target * eased);
      if (progress < 1) countFrame = requestAnimationFrame(step);
    };
    countFrame = requestAnimationFrame(step);
  }

  function scoreBand(score) {
    if (score <= 24) return "safe";
    if (score <= 49) return "low";
    if (score <= 74) return "mid";
    return "high";
  }

  function humanize(text) {
    const spaced = String(text).replace(/_/g, " ");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  function flagIcon(className) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 120 160");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", className);
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", "#flag");
    svg.append(use);
    return svg;
  }

  function el(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text; // skill content is untrusted, never use innerHTML
    if (className) node.className = className;
    return node;
  }

  // On stacked (mobile) layouts the results sit below the form, so bring them into view.
  function revealResultsOnSmallScreens() {
    if (window.matchMedia("(max-width: 860px)").matches) {
      $("results").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // ---------- Copy and reset ----------

  $("copy-btn").addEventListener("click", async (e) => {
    if (!lastResult) return;
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(JSON.stringify(lastResult, null, 2));
      btn.textContent = "Copied!";
    } catch (err) {
      btn.textContent = "Copy failed";
    }
    setTimeout(() => (btn.textContent = "Copy results"), 1500);
  });

  $("again-btn").addEventListener("click", () => {
    $("skill-text").value = "";
    $("repo-input").value = "";
    fileInput.value = "";
    $("file-label").textContent = FILE_PROMPT;
    lastResult = null;
    selectInputTab("paste");
    showState("empty");
  });
})();
