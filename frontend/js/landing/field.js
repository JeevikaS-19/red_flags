// Act 2: a field of 100 skills. When it scrolls into view, 26 of the flags turn red,
// which is the share of skills found to contain a vulnerability.

const TOTAL = 100;
const VULNERABLE = 26;
const STEP_MS = 90;
const START_MS = 300;

// A seeded shuffle, so the red flags land in the same places on every visit.
function seededShuffle(count, seed) {
  const order = Array.from({ length: count }, (_, i) => i);
  let s = seed;
  const random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function createPole() {
  const NS = "http://www.w3.org/2000/svg";
  const pole = document.createElement("div");
  pole.className = "skill-cell";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 140 190");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(NS, "use");
  use.setAttribute("href", "#flag");
  svg.append(use);
  pole.append(svg);
  return pole;
}

export function buildField(field, counter, { reduced }) {
  const poles = Array.from({ length: TOTAL }, createPole);
  const bad = seededShuffle(TOTAL, 26).slice(0, VULNERABLE);
  bad.forEach((index, rank) => {
    poles[index].classList.add("bad");
    poles[index].style.setProperty("--k", rank);
  });
  field.append(...poles);

  const showAll = () => {
    poles.forEach((p) => p.classList.contains("bad") && p.classList.add("is-red"));
    counter.textContent = VULNERABLE;
  };

  if (reduced || !("IntersectionObserver" in window)) return showAll();

  counter.textContent = 0;
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();
    field.classList.add("is-playing");
    for (let k = 1; k <= VULNERABLE; k++) {
      setTimeout(() => (counter.textContent = k), START_MS + (k - 1) * STEP_MS + 250);
    }
  }, { threshold: 0.5 });
  observer.observe(field);
}
