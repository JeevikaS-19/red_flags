// Risk score, the meter with its flag marker, and the safe / unsafe verdict.

import { countUp, el, flagIcon } from "../dom.js";
import { createSection } from "./section.js";

const band = (score) => (score <= 24 ? "safe" : score <= 49 ? "low" : score <= 74 ? "mid" : "high");

export function createVerdict({ onCopy }) {
  const section = createSection({
    id: "verdict",
    title: "Risk score",
    hint: "How risky this skill is to install",
    emptyText: "Run a scan to see the risk score and verdict.",
  });
  section.root.classList.add("verdict-card");

  const copy = el("button", "Copy report", "btn btn-ghost");
  copy.type = "button";
  copy.hidden = true;
  copy.style.marginLeft = "auto";
  copy.style.padding = "5px 12px";
  copy.style.fontSize = "0.85rem";
  copy.addEventListener("click", () => onCopy(copy));
  section.head.append(copy);

  return {
    root: section.root,
    reset() {
      section.showEmpty();
      copy.hidden = true;
    },
    loading() {
      section.showLoading();
      copy.hidden = true;
    },
    render(report) {
      const score = report.overall_risk_score;

      const block = el("div", null, "score-block");
      block.dataset.band = band(score);

      const number = el("span", "0", "score-number");
      const row = el("div", null, "score-row");
      row.append(number, el("span", "/100", "score-max"));

      const meter = el("div", null, "meter");
      meter.append(el("div", null, "meter-fill"));
      const wrap = el("div", null, "meter-wrap");
      wrap.style.setProperty("--score", 0);
      wrap.append(flagIcon("meter-flag"), meter);

      const verdict = el(
        "p",
        report.safe_to_install ? "Safe to Install ✓" : "Unsafe - Do Not Install ✗",
        "verdict " + (report.safe_to_install ? "is-safe" : "is-unsafe")
      );

      const side = el("div");
      side.append(wrap, verdict);
      block.append(row, side);
      section.show(block);

      countUp(number, score);
      // Set the score after two frames so the meter animates up from zero.
      requestAnimationFrame(() => requestAnimationFrame(() => wrap.style.setProperty("--score", score)));
      copy.hidden = false;
    },
  };
}
