// Act 3: the message types out, and a field of flags behind it turns from red to green.
// With reduced motion the text is shown in full and the flags are already green.

const RED = [220, 38, 38];
const GREEN = [34, 197, 94];
const CELL = 58;
const CHAR_MS = 34;

function mix(amount) {
  const [r, g, b] = RED.map((from, i) => Math.round(from + (GREEN[i] - from) * amount));
  return `rgb(${r}, ${g}, ${b})`;
}

export function initSolution({ section, canvas, typed, caret, startButton, reduced }) {
  const ctx = canvas.getContext("2d");
  const fullText = typed.textContent;
  let width = 0;
  let height = 0;
  let flags = [];
  let order = [];
  let revealed = 0;
  let frame = null;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = section.clientWidth;
    height = section.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const columns = Math.ceil(width / CELL) + 1;
    const rows = Math.ceil(height / CELL) + 1;
    flags = Array.from({ length: columns * rows }, (_, i) => ({
      x: (i % columns) * CELL + Math.random() * 22,
      y: Math.floor(i / columns) * CELL + Math.random() * 22,
      size: 24 + Math.random() * 10,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 0.8,
      green: reduced ? 1 : 0,
      target: reduced ? 1 : 0,
    }));
    order = flags.map((_, i) => i).sort(() => Math.random() - 0.5);
    revealed = reduced ? flags.length : 0;
    draw(performance.now());
  }

  function draw(now) {
    ctx.clearRect(0, 0, width, height);
    const time = now / 1000;
    for (const flag of flags) {
      flag.green += (flag.target - flag.green) * 0.06;
      const sway = reduced ? 0 : Math.sin(time * flag.speed + flag.phase) * 0.14;

      ctx.save();
      ctx.translate(flag.x, flag.y);
      ctx.rotate(sway);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#8b95a7";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, flag.size * 1.2);
      ctx.stroke();
      ctx.fillStyle = mix(flag.green);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(flag.size * 0.8, flag.size * 0.1);
      ctx.lineTo(flag.size * 0.8, flag.size * 0.62);
      ctx.lineTo(0, flag.size * 0.52);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function loop(now) {
    draw(now);
    frame = requestAnimationFrame(loop);
  }

  function revealUpTo(count) {
    while (revealed < count) flags[order[revealed++]].target = 1;
  }

  function type() {
    typed.textContent = "";
    let index = 0;
    const timer = setInterval(() => {
      index++;
      typed.textContent = fullText.slice(0, index);
      revealUpTo(Math.floor((index / fullText.length) * flags.length));
      if (index >= fullText.length) {
        clearInterval(timer);
        revealUpTo(flags.length);
        caret.classList.add("is-done");
        startButton.classList.add("is-ready");
      }
    }, CHAR_MS);
  }

  resize();
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  if (reduced || !("IntersectionObserver" in window)) {
    caret.classList.add("is-done");
    startButton.classList.add("is-ready");
    return;
  }

  caret.classList.remove("is-done");
  typed.textContent = "";

  // Draw only while the section is visible, and start typing once it is mostly in view.
  let typingStarted = false;
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && frame === null) frame = requestAnimationFrame(loop);
    else if (!entry.isIntersecting && frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    if (entry.intersectionRatio > 0.55 && !typingStarted) {
      typingStarted = true;
      type();
    }
  }, { threshold: [0, 0.55, 1] }).observe(section);
}
