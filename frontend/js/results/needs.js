// "What it takes": the access the skill asks for, and how much trust each item needs.

import { el, humanize } from "../dom.js";
import { createSection } from "./section.js";

const LEVELS = ["low", "medium", "high"];

export function createNeeds() {
  const section = createSection({
    id: "needs",
    title: "What it takes",
    hint: "Access the skill asks for",
    emptyText: "The access this skill needs, like files, commands, or network, appears here.",
  });

  return {
    root: section.root,
    reset: () => section.showEmpty(),
    loading: () => section.showLoading(),
    render(report) {
      const permissions = report.permissions || [];
      if (!permissions.length) {
        return section.show(el("p", "Nothing special. This skill doesn't ask for extra access.", "card-empty"));
      }

      const list = el("ul", null, "needs");
      permissions.forEach((permission) => {
        const level = LEVELS.includes(permission.level) ? permission.level : "low";
        const item = el("li", null, "need");
        item.dataset.level = level;
        item.append(el("span", null, "need-dot"), el("span", permission.name, "need-name"), el("span", humanize(level), "chip " + level));
        if (permission.detail) item.append(el("p", permission.detail, "need-detail"));
        list.append(item);
      });
      section.show(list);
    },
  };
}
