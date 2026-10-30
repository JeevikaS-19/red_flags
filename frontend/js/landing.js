// Landing page entry point: three acts, each in its own module.

import { buildField } from "./landing/field.js";
import { startParticles } from "./landing/particles.js";
import { initSolution } from "./landing/solution.js";

const $ = (id) => document.getElementById(id);
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// SMIL animations ignore the CSS reduced-motion query, so pause the waving flag here.
if (reduced) document.querySelectorAll("svg.wave-flag").forEach((svg) => svg.pauseAnimations && svg.pauseAnimations());

startParticles($("particles"), $("hero"), { reduced });
buildField($("field"), $("field-count"), { reduced });
initSolution({
  section: $("solution"),
  canvas: $("solution-canvas"),
  typed: $("typed"),
  caret: $("caret"),
  startButton: $("start"),
  reduced,
});
