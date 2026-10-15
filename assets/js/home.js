/* TRENDLI9 — Homepage interactions */
(function () {
  const { $, esc, reduceMotion } = window.T9;
  const C = window.T9_CONFIG, CAT = window.T9_CATALOG, I = window.T9_ICON;

  // Gallery row
  $("#galRow").innerHTML = CAT.GALLERY.slice(0, 6).map(g => `<figure data-lightbox="home" data-caption="${esc(g.cap)}" tabindex="0" role="button" aria-label="View ${esc(g.cap)}"><img src="assets/img/${g.img}.webp" alt="${esc(g.cap)}" loading="lazy" width="${g.w}" height="${g.h}"></figure>`).join("");

  // Instagram grid (links to profile; curated from our latest work)
  const ig = `https://instagram.com/${C.instagram}`;
  $("#igGrid").innerHTML = CAT.GALLERY.slice(4, 10).map(g => `<a href="${ig}" target="_blank" rel="noopener" aria-label="${esc(g.cap)} on Instagram"><img src="assets/img/${g.img}.webp" alt="" loading="lazy" width="${g.w}" height="${g.h}">${I("instagram")}</a>`).join("");

  // Reel: autoplay when visible, pause when not; manual toggle
  const vid = $("#reelVideo"), playBtn = $("#reelPlay");
  if (vid && playBtn) {
    let userPaused = reduceMotion;
    const setBtn = () => { const p = vid.paused; playBtn.innerHTML = I(p ? "play" : "pause"); playBtn.setAttribute("aria-label", p ? "Play video" : "Pause video"); };
    playBtn.addEventListener("click", () => { if (vid.paused) { userPaused = false; vid.play().catch(() => { }); } else { userPaused = true; vid.pause(); } });
    vid.addEventListener("play", setBtn); vid.addEventListener("pause", setBtn);
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting && !userPaused) { vid.preload = "auto"; vid.play().catch(() => { }); }
      else if (!en.isIntersecting) vid.pause();
    }, { threshold: .35 }).observe(vid);
    setBtn();
  }
})();
