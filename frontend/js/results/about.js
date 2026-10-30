// "What's in it": a plain-language summary of what the skill does.

import { el } from "../dom.js";
import { createSection } from "./section.js";

export function createAbout() {
  const section = createSection({
    id: "about",
    title: "What's in it",
    hint: "What the skill does",
    emptyText: "A short summary of the skill appears here.",
  });

  return {
    root: section.root,
    reset: () => section.showEmpty(),
    loading: () => section.showLoading(),
    render(report) {
      if (!report.summary.length) return section.showEmpty();
      const list = el("ul", null, "about");
      report.summary.forEach((item) => list.append(el("li", item)));
      section.show(list);
    },
  };
}
