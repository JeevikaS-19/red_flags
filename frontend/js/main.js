// Scan page entry point: wires the input panel to the result sections.

import { scanSkill } from "./api.js";
import { createInputPanel } from "./input-panel.js";
import { createAbout } from "./results/about.js";
import { createChanges } from "./results/changes.js";
import { createFlags } from "./results/flags.js";
import { createNeeds } from "./results/needs.js";
import { createVerdict } from "./results/verdict.js";

if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.querySelectorAll("svg.wave-flag").forEach((svg) => svg.pauseAnimations && svg.pauseAnimations());
}

let lastReport = null;
let source = null; // what Changes edits: { type, text } where text is null for a repo

const panel = createInputPanel(document.querySelector("[data-skill-panel]"), {
  onScan: runScan,
  onClear: () => {
    lastReport = null;
    source = null;
    sections.forEach((s) => s.reset());
  },
});

const verdict = createVerdict({ onCopy: copyReport });
const about = createAbout();
const needs = createNeeds();
const flags = createFlags();
const changes = createChanges({
  onApply: (text) => panel.setSkillText(text),
  onRescan: runScan,
});

// Order here is the order on the page.
const sections = [verdict, about, needs, flags, changes];
document.getElementById("results").append(...sections.map((s) => s.root));

async function runScan() {
  const read = await panel.read();
  if (read.error) {
    panel.showError(read.error);
    return;
  }

  panel.clearMessages();
  panel.setBusy(true);
  sections.forEach((s) => s.loading());

  try {
    const report = await scanSkill(read.input);
    lastReport = report;
    source = read.source;
    verdict.render(report);
    about.render(report);
    needs.render(report);
    flags.render(report);
    changes.render(report, source);
    revealResultsOnSmallScreens();
  } catch (err) {
    panel.showError(err.message);
    sections.forEach((s) => s.reset());
  } finally {
    panel.setBusy(false);
  }
}

async function copyReport(button) {
  if (!lastReport) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(lastReport, null, 2));
    button.textContent = "Copied!";
  } catch (err) {
    button.textContent = "Copy failed";
  }
  setTimeout(() => (button.textContent = "Copy report"), 1500);
}

// On stacked (mobile) layouts the results sit below the form, so bring them into view.
function revealResultsOnSmallScreens() {
  if (window.matchMedia("(max-width: 960px)").matches) {
    document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
