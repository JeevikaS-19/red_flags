(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // SMIL animations ignore the CSS reduced-motion query, so pause the flags here.
  if (reduceMotion) {
    document.querySelectorAll("svg.wave-flag").forEach((svg) => {
      if (svg.pauseAnimations) svg.pauseAnimations();
    });
  }

  // The example scan plays once, when it scrolls into view.
  const specimen = document.querySelector(".specimen");
  if (specimen) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      specimen.classList.add("play");
    } else {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          specimen.classList.add("play");
          observer.disconnect();
        }
      }, { threshold: 0.45 });
      observer.observe(specimen);
    }
  }
})();
