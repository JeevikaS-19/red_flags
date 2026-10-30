// One result section: a titled card whose body is empty, loading, or filled.
// Every section module builds on this so they all behave the same way.

import { el } from "../dom.js";

const SKELETON_WIDTHS = ["72%", "94%", "58%"];

/**
 * @param {{id: string, title: string, hint?: string, emptyText: string, counted?: boolean}} options
 */
export function createSection({ id, title, hint, emptyText, counted = false }) {
  const root = el("section", null, "card");
  root.dataset.section = id;

  const head = el("div", null, "card-head");
  head.append(el("h2", title, "card-title"));
  if (hint) head.append(el("span", hint, "card-hint"));
  const count = el("span", "0", "count");
  count.hidden = true;
  if (counted) head.append(count);

  const body = el("div", null, "card-body");
  root.append(head, body);

  const section = {
    root,
    head,
    body,

    showEmpty() {
      body.replaceChildren(el("p", emptyText, "card-empty"));
      count.hidden = true;
    },

    showLoading() {
      const skeleton = el("div", null, "skel");
      skeleton.setAttribute("aria-hidden", "true");
      SKELETON_WIDTHS.forEach((width) => {
        const line = el("span");
        line.style.width = width;
        skeleton.append(line);
      });
      body.replaceChildren(skeleton);
      count.hidden = true;
    },

    show(...nodes) {
      body.replaceChildren(...nodes);
    },

    setCount(value) {
      count.textContent = value;
      count.hidden = !counted;
    },
  };

  section.showEmpty();
  return section;
}
