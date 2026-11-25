/* ==========================================================================
   HOME — intro sequence
   ---------------------------------------------------------------------------
   First visit in a tab session (html.intro-full):
     1. black screen counts 0 → 100% while fonts, the page and the 3D discs load
     2. the number slides out, the black screen lifts away to the white page
     3. "Human / Agentic" slides up into the title masks
     4. it slides out the top as "Design / Engineer" slides up into the same masks
     5. the intro paragraph, nav, clock and © reveal, each in its own mask
     6. after a reading pause, the discs fly in
   Later visits (html.intro-short) skip 1–3 and start at step 4.
   The stage classes (t-a, t-b, t-ui) on <html> drive the CSS in site.css.
   ========================================================================== */
(function () {
  const html = document.documentElement;
  if (!html.classList.contains('intro')) return;

  /* ---- settings from the Site Editor (Home → Intro sequence) --------------
     home.intro.loader: "first" | "every" | "never"; the rest are seconds.   */
  const setting = (k, d) => (window.T ? window.T(k, d) : d);
  const secs = (k, d, lo, hi) => { const v = parseFloat(setting(k, String(d))); return Math.min(hi, Math.max(lo, isFinite(v) ? v : d)) * 1000; };
  const loaderMode = setting('home.intro.loader', 'first');
  if (loaderMode === 'every' || loaderMode === 'never') {
    html.classList.remove('intro-full', 'intro-short');
    html.classList.add(loaderMode === 'every' ? 'intro-full' : 'intro-short');
  }

  /* ---- timing (ms) ------------------------------------------------------- */
  const T = {
    loaderMin: secs('home.intro.loaderMin', 1.8, .5, 5),     // the count never finishes faster than this
    loaderMax: 5000,     // …and never waits longer than this for assets
    loaderHold: 220,     // pause on 100%
    numberOut: 380,      // number slides up, then the black screen lifts
    titleInAfterLift: 450,
    titleHold: secs('home.intro.titleHold', 1.1, .3, 5),     // how long "Human Agentic" stays readable
    textAfterSwap: 750,  // "Design Engineer" settles, then paragraph + nav
    discsAfterText: secs('home.intro.discsDelay', 1.6, 0, 6) // reading pause before the discs arrive
  };
  T.loaderMax = Math.max(T.loaderMax, T.loaderMin);

  const full = html.classList.contains('intro-full');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const loader = document.getElementById('loader');
  const valueEl = loader && loader.querySelector('[data-loader-value]');
  const para = document.querySelector('.hero-intro [data-hold]');
  const hero = document.getElementById('hero');
  try { sessionStorage.setItem('introSeen', '1'); } catch (e) {}

  // stagger order for the masked UI: logo, menu, clock, ©
  document.querySelectorAll('.viewport .nav .logo, .viewport .nav .menu a, .viewport .clock > span, .hero-name .copy')
    .forEach((el, i) => el.style.setProperty('--k', i));

  const lock = on => {
    html.classList.toggle('intro-lock', on);
    if (window.lenis) on ? window.lenis.stop() : window.lenis.start();
  };
  const showText = () => { html.classList.add('t-ui'); if (para) para.classList.add('is-in'); };
  const releaseDiscs = () => { window.__discGo = true; document.dispatchEvent(new Event('discs:go')); };

  /* ---- loading progress: fonts 30% · page 30% · discs 40% ---------------- */
  const got = { fonts: 0, load: 0, discs: 0 };
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { got.fonts = 1; });
  if (document.readyState === 'complete') got.load = 1; else addEventListener('load', () => { got.load = 1; });
  if (!hero || hero.hasAttribute('data-disc-ready')) got.discs = 1;
  document.addEventListener('discs:ready', () => { got.discs = 1; });
  document.addEventListener('discs:failed', () => { got.discs = 1; });

  function count() {
    return new Promise(done => {
      const t0 = performance.now(); let shown = 0, last = t0;
      const step = now => {
        const dt = Math.min(.05, (now - last) / 1000); last = now;
        const el = now - t0;
        const real = el > T.loaderMax ? 1 : got.fonts * .3 + got.load * .3 + got.discs * .4;
        const goal = Math.min(real, el / T.loaderMin) * 100;
        shown += (goal - shown) * Math.min(1, dt * 7);
        if (goal >= 100 && shown > 99.4) shown = 100;
        if (valueEl) valueEl.textContent = Math.floor(shown);
        shown >= 100 ? done() : requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  async function run() {
    if (reduced) {
      if (loader) loader.style.display = 'none';
      html.classList.add('t-b', 't-ui', 'intro-done'); if (para) para.classList.add('is-in');
      releaseDiscs(); return;
    }
    if (full) {
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      scrollTo(0, 0); lock(true);
      await count();
      await wait(T.loaderHold);
      loader.classList.add('is-done');             // 100% slides up out of its mask
      await wait(T.numberOut);
      loader.classList.add('is-out');              // black screen lifts away
      await wait(T.titleInAfterLift);
      html.classList.add('t-a');                   // Human / Agentic
      await wait(950 + T.titleHold);
      html.classList.add('t-b');                   // → Design / Engineer
      await wait(T.textAfterSwap);
      lock(false);
      setTimeout(() => { if (loader) loader.style.display = 'none'; }, 400);
    } else {
      await frame();
      html.classList.add('t-b');                   // Design / Engineer
      await wait(T.textAfterSwap * .6);
    }
    showText();                                    // paragraph, nav, clock, ©
    await wait(T.discsAfterText);
    releaseDiscs();                                // discs fly in
    await wait(1200);
    html.classList.add('intro-done');
  }
  run();
})();
