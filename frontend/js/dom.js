// Small DOM helpers shared by every module.

const SVG_NS = "http://www.w3.org/2000/svg";

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Create an element. Text is always set with textContent: skill content is untrusted. */
export function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null && text !== "") node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function humanize(text) {
  const spaced = String(text).replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The small flag icon, drawn from the #flag symbol in the page's SVG sprite. */
export function flagIcon(className) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 140 190");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", className);
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", "#flag");
  svg.append(use);
  return svg;
}

const frames = new WeakMap();

/** Animate a number up to its target (ease-out). Jumps straight there with reduced motion. */
export function countUp(node, target, duration = 900) {
  cancelAnimationFrame(frames.get(node));
  if (prefersReducedMotion() || target === 0) {
    node.textContent = target;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    node.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3)));
    if (progress < 1) frames.set(node, requestAnimationFrame(step));
  };
  frames.set(node, requestAnimationFrame(step));
}
