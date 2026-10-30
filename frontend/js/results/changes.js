// "Changes": suggested edits shown as before / after, applied to the skill in one click.
// Editing works on pasted or uploaded text. A repo can't be edited from here.

import { el } from "../dom.js";
import { applyChanges, locate } from "../patch.js";
import { createSection } from "./section.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * @param {{onApply: (text: string) => void, onRescan: () => void}} handlers
 *   onApply puts the edited text back in the input panel.
 */
export function createChanges({ onApply, onRescan }) {
  const section = createSection({
    id: "changes",
    title: "Changes",
    hint: "Edits that would make the skill safer",
    emptyText: "Suggested fixes appear here, and you can apply them to the skill in one click.",
    counted: true,
  });

  function render(report, source) {
    const changes = report.suggested_changes || [];
    section.setCount(changes.length);

    if (!changes.length) {
      const message = report.safe_to_install
        ? "No changes needed. This skill looks fine as it is."
        : "No automatic edits to suggest. Review the red flags before using this skill.";
      return section.show(el("p", message, report.safe_to_install ? "no-flags" : "card-empty"));
    }

    const canEdit = source.text != null;
    const original = source.text;
    const checks = [];

    const list = el("ul", null, "changes");
    changes.forEach((change) => {
      const findable = !canEdit || locate(original, change.snippet) !== null;
      const item = el("li", null, "change" + (findable ? "" : " is-missed"));

      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = canEdit && findable;
      box.disabled = !canEdit || !findable;
      checks.push(box);

      const label = el("label");
      label.append(box, document.createTextNode(change.action === "replace" ? "Replace this" : "Remove this"));
      const head = el("div", null, "change-head");
      head.append(label, el("span", change.action === "replace" ? "Replace" : "Remove", "chip"));

      item.append(head, el("pre", change.snippet, "diff diff-remove"));
      if (change.action === "replace" && change.replacement) item.append(el("pre", change.replacement, "diff diff-add"));
      if (change.reason) item.append(el("p", change.reason, "change-reason"));
      if (canEdit && !findable) item.append(el("p", "Couldn't find this text in your skill, so edit it by hand.", "change-missed"));
      list.append(item);
    });

    const apply = el("button", null, "btn btn-cta");
    apply.type = "button";
    const undo = el("button", "Undo", "btn btn-ghost");
    undo.type = "button";
    undo.hidden = true;
    const rescan = el("button", "Scan again", "btn btn-ghost");
    rescan.type = "button";
    rescan.hidden = true;
    const status = el("p", null, "muted change-status");
    status.hidden = true;

    const selected = () => changes.filter((_, i) => checks[i].checked);
    const refresh = () => {
      const n = selected().length;
      apply.textContent = n ? `Apply ${plural(n, "change")}` : "Apply changes";
      apply.disabled = !canEdit || n === 0;
    };
    checks.forEach((box) => box.addEventListener("change", refresh));
    refresh();

    apply.addEventListener("click", () => {
      const picked = selected();
      const result = applyChanges(original, picked);
      onApply(result.text);
      status.textContent =
        `Applied ${plural(result.applied.length, "change")} to the skill on the left.` +
        (result.missed.length ? ` ${plural(result.missed.length, "change")} couldn't be found.` : "") +
        " Scan again to check the result.";
      status.hidden = false;
      apply.hidden = true;
      undo.hidden = false;
      rescan.hidden = false;
      checks.forEach((box) => (box.disabled = true));
    });

    undo.addEventListener("click", () => {
      onApply(original);
      status.textContent = "Restored the original skill.";
      apply.hidden = false;
      undo.hidden = true;
      rescan.hidden = true;
      checks.forEach((box, i) => (box.disabled = !locate(original, changes[i].snippet)));
      refresh();
    });

    rescan.addEventListener("click", onRescan);

    const actions = el("div", null, "change-actions");
    actions.append(apply, undo, rescan);
    section.show(list, actions, status);

    if (!canEdit) {
      status.textContent = "This is a repo, so make these edits in the repo itself.";
      status.hidden = false;
    }
  }

  return {
    root: section.root,
    reset: () => section.showEmpty(),
    loading: () => section.showLoading(),
    render,
  };
}
