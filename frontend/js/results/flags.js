// "Red flags": each finding with the exact quoted text, why it matters, and what to do.

import { el, flagIcon, humanize } from "../dom.js";
import { createSection } from "./section.js";

const SEVERITIES = ["critical", "high", "medium", "low"];

export function createFlags() {
  const section = createSection({
    id: "flags",
    title: "Red flags",
    hint: "What the scanner found",
    emptyText: "Anything suspicious is listed here, with the exact text that triggered it.",
    counted: true,
  });

  return {
    root: section.root,
    reset: () => section.showEmpty(),
    loading: () => section.showLoading(),
    render(report) {
      section.setCount(report.risk_flags.length);
      if (!report.risk_flags.length) return section.show(el("p", "No red flags found.", "no-flags"));
      section.show(...report.risk_flags.map(renderFlag));
    },
  };
}

function renderFlag(flag, index) {
  const severity = SEVERITIES.includes(flag.severity) ? flag.severity : "low";
  const card = el("div", null, "flag " + severity);
  card.style.setProperty("--n", index); // staggers the entrance animation

  const head = el("div", null, "flag-head");
  head.append(flagIcon("flag-icon-sm"), el("span", humanize(flag.category), "flag-category"), el("span", humanize(severity), "badge"));

  const recommendation = el("p");
  recommendation.append(el("strong", "Recommendation: "), document.createTextNode(flag.recommendation));

  card.append(head, el("pre", flag.snippet), el("p", flag.explanation), recommendation);
  return card;
}
