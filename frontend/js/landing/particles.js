// Act 1: slow red particles drifting behind the title.
// Runs only while the hero is on screen, and draws a single still frame with reduced motion.

export function startParticles(canvas, section, { reduced }) {
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let particles = [];
  let frame = null;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = section.clientWidth;
    height = section.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const count = Math.max(40, Math.min(90, Math.round((width * height) / 18000)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.8 + 0.6,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      alpha: Math.random() * 0.45 + 0.12,
    }));
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      ctx.fillStyle = `rgba(239, 68, 68, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function step() {
    for (const p of particles) {
      p.x = (p.x + p.vx + width) % width;
      p.y = (p.y + p.vy + height) % height;
    }
    draw();
    frame = requestAnimationFrame(step);
  }

  resize();
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  if (reduced || !("IntersectionObserver" in window)) return;
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && frame === null) frame = requestAnimationFrame(step);
    else if (!entry.isIntersecting && frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  }).observe(section);
}
