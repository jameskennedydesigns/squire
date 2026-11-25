/* ==========================================================================
   HOME page behaviours
   ========================================================================== */
(function () {
  const S = window.SITE;
  const vh = () => innerHeight;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const desktop = () => innerWidth >= 1200;

  /* ---- Hero: intro hides once the page scrolls past the disc carousel ---- */
  const hero = $('#hero'), heroPin = $('[data-disc-pin]');
  const pinEnd = () => heroPin ? heroPin.offsetHeight - innerHeight : 0;
  // (scrollY > 10 guard: some phones report a huge innerHeight while the page is still loading)
  const heroState = () => hero.classList.toggle('scrolled', scrollY > 10 && scrollY > pinEnd() + 10);
  addEventListener('scroll', heroState, { passive: true });
  addEventListener('resize', heroState);
  heroState();
  // The nav logo doubles as the first bold word of the intro (as on the original)
  const indentIntro = () => $$('[data-logo-indent]').forEach(p => {
    const logo = $('.nav .logo'), first = $('.rv-w', p);
    if (logo && first) first.style.marginLeft = (logo.getBoundingClientRect().width - 40 + 6) + 'px';
    p._assign && p._assign();
  });
  indentIntro();
  document.addEventListener('fonts-ready', indentIntro);
  addEventListener('resize', indentIntro);

  /* ---- Scramble (exact port of the Framer "scattered words" component) -- */
  const sc = $('#scramble');
  if (sc) {
    const text = T('home.scramble.sentence', '{name}® brings ideas and code together, turning imagination into clarity and connection into beauty.');
    const words = text.split(/\s+/);
    const seed = +sc.dataset.seed, indentPct = +sc.dataset.indent;
    const rand = n => { const t = Math.sin(n) * 1e4; return t - Math.floor(t); };
    let t = seed;
    const offsets = words.map(() => {
      const ang = rand(t += 1) * 2 * Math.PI, r = rand(t += 1) * +sc.dataset.spread;
      return { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
    });
    sc.setAttribute('aria-label', text);
    const spans = words.map((w, i) => {
      const s = document.createElement('span');
      s.setAttribute('aria-hidden', 'true');
      s.textContent = w + (i < words.length - 1 ? ' ' : '');
      if (i < words.length - 1) s.style.marginRight = '0.25em';
      sc.appendChild(s);
      return s;
    });
    const indent = () => { spans[0].style.textIndent = (indentPct / 100 * sc.offsetWidth) + 'px'; };
    let raf = null;
    const update = () => {
      raf = null;
      const spread = desktop() ? 1 : 0;
      const r = sc.getBoundingClientRect().top, n = vh(), half = n / 2;
      let a;
      if (r <= half) a = 1; else if (r >= n) a = 0; else a = Math.max(0, Math.min(n - r, n - half)) / (n - half);
      spans.forEach((s, i) => {
        s.style.transform = `translate(${offsets[i].x * (1 - a) * spread}px,${offsets[i].y * (1 - a) * spread}px)`;
      });
    };
    const req = () => { raf = raf || requestAnimationFrame(update); };
    addEventListener('scroll', req, { passive: true });
    addEventListener('resize', () => { indent(); req(); });
    indent(); update();
    document.addEventListener('fonts-ready', () => { indent(); update(); });
  }

  /* ---- Big Numbers (digit strips masked with lighten-blended images) --- */
  const bn = $('#big-numbers');
  if (bn) {
    const panels = $$('.bn-panel', bn);
    const imgs = $$('.bn-img', bn);
    const values = panels.map(p => (p.dataset.value || p.dataset.num || '').trim());
    // Values with symbols or more than 2 characters (20+, $50M+) use one rolling
    // column per character; plain 2-digit values keep the original two staggered digits.
    const glyphMode = values.some(v => !/^\d{1,2}$/.test(v));
    if (glyphMode) {
      const box = $('.bn-box', bn);
      $$('.bn-digit', box).forEach(d => d.remove());
      const chars = values.map(v => [...v]);
      const n = Math.max(...chars.map(c => c.length));
      // centre shorter values in the row of columns
      const rows = chars.map(c => { const pad = n - c.length, l = Math.floor(pad / 2); return [...Array(l).fill(''), ...c, ...Array(pad - l).fill('')]; });
      const cols = Array.from({ length: n }, (_, k) => {
        const col = document.createElement('div'); col.className = 'bn-digit g';
        col.innerHTML = `<div class="bn-strip">${rows.map(r => `<div>${r[k] ? r[k].replace(/&/g, '&amp;').replace(/</g, '&lt;') : '&nbsp;'}</div>`).join('')}</div>`;
        box.insertBefore(col, box.firstChild); return col;   // behind the images (they blend over the glyphs)
      });
      let L = 0, cur = -1;
      const gsize = () => {
        const W = box.offsetWidth, H = box.offsetHeight;
        // each column is as wide as its widest character (an "M" is wider than a "1")
        const meas = document.createElement('span'); meas.className = 'bn-measure'; meas.style.fontSize = '100px'; box.appendChild(meas);
        const wOf = ch => { if (!ch) return 0; meas.textContent = ch; return meas.offsetWidth; };
        const per100 = cols.map((_, k) => Math.max(30, ...rows.map(r => wOf(r[k]))) * 1.04);
        meas.remove();
        const total100 = per100.reduce((a, b) => a + b, 0) || 1;
        const fs = Math.min(H * .78, 100 * W * .96 / total100);   // the whole row fits the box
        L = fs * 1.2;   // roomy rows: tall glyphs like "$" never peek into the neighbouring value
        let x = (W - total100 * fs / 100) / 2;
        cols.forEach((c, k) => {
          const stagger = (k % 2 ? -1 : 1) * Math.min(H * .07, L * .12);
          const cw = per100[k] * fs / 100;
          Object.assign(c.style, { left: x + 'px', width: cw + 'px', height: L + 'px', top: (H / 2 + stagger) + 'px' });
          x += cw;
          const s = c.firstChild; s.style.fontSize = fs + 'px'; s.style.lineHeight = L + 'px';
        });
        gset(cur < 0 ? 0 : cur, true);
      };
      const gset = (i, force) => {
        if (i === cur && !force) return;
        cur = i;
        cols.forEach((c, k) => { c.firstChild.style.transitionDelay = (k * 45) + 'ms'; c.firstChild.style.transform = `translateY(${-i * L}px)`; });
        imgs.forEach((im, k) => im.classList.toggle('on', k === i));
      };
      const gscroll = () => {
        const top = bn.getBoundingClientRect().top;
        gset(clamp(Math.floor((-top + vh() * 0.5) / vh()), 0, panels.length - 1));
      };
      addEventListener('scroll', gscroll, { passive: true });
      addEventListener('resize', gsize);
      gsize();
      document.addEventListener('fonts-ready', gsize);
    }
    const strips = glyphMode ? [] : $$('[data-strip]', bn);   // [0] = right digit (B), [1] = left digit (A)
    strips.forEach(s => { s.innerHTML = '0123456789'.split('').map(d => `<div>${d}</div>`).join(''); });
    let L = 0, cur = -1;
    const size = () => {
      if (glyphMode) return;
      const box = strips[0].parentElement;
      const H = box.offsetHeight;
      L = H * (530.9 / 535);                       // line height measured on the original strip
      strips.forEach(s => { s.style.fontSize = (L / 0.8) + 'px'; s.style.lineHeight = L + 'px'; });
      set(cur < 0 ? 0 : cur, true);
    };
    const set = (i, force) => {
      if (glyphMode || (i === cur && !force)) return;
      cur = i;
      const num = panels[i].dataset.num.padStart(2, '0');
      const tens = +num[0], ones = +num[1];
      strips[1].style.transform = `translateY(${-tens * L}px)`;
      strips[0].style.transform = `translateY(${-ones * L}px)`;
      imgs.forEach((im, k) => im.classList.toggle('on', k === i));
    };
    const onScroll = () => {
      const top = bn.getBoundingClientRect().top;
      const i = clamp(Math.floor((-top + vh() * 0.5) / vh()), 0, panels.length - 1);
      set(i);
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', size);
    size();
    document.addEventListener('fonts-ready', size);
  }

  /* ---- Partners: big title fades to 2% once the logos arrive ------------ */
  const pt = $('#partners-title'), logos = $('#logos');
  if (pt && logos) {
    pt.style.transition = 'opacity .9s cubic-bezier(.25,1,.5,1)';
    const f = () => { pt.style.opacity = logos.getBoundingClientRect().top < vh() * 0.75 ? .02 : 1; };
    addEventListener('scroll', f, { passive: true }); f();
  }

  /* ---- Testimonials ------------------------------------------------------ */
  const sl = $('#slides');
  if (sl) {
    const slides = $$('.slide', sl).filter(s => !s.hasAttribute('data-hidden'));   // hidden (HIDE) slides drop out
    if (slides.length && !slides.some(s => s.classList.contains('on'))) slides[0].classList.add('on');
    if (slides.length < 2) sl.classList.add('single');
    // Long quotes: step the type down until quote + name fit the slide (48px → 18px)
    const fitQuotes = () => slides.forEach(s => {
      const q = $('.quote', s), box = $('.q', s); if (!q || !box) return;
      q.style.fontSize = ''; q.style.lineHeight = '';
      const room = sl.offsetHeight;
      const vis = s.classList.contains('on'); if (!vis) s.style.visibility = 'hidden', s.style.opacity = '0', s.classList.add('on');
      let fs = parseFloat(getComputedStyle(q).fontSize);
      while (box.scrollHeight > room && fs > 18) { fs -= 2; q.style.fontSize = fs + 'px'; q.style.lineHeight = fs > 30 ? '120%' : '135%'; }
      if (!vis) { s.classList.remove('on'); s.style.visibility = ''; s.style.opacity = ''; }
    });
    fitQuotes(); addEventListener('resize', fitQuotes); document.addEventListener('fonts-ready', fitQuotes);
    const num = $('.count .num span', sl);
    $('[data-prev]', sl).innerHTML = ICON.arrowLeft;
    $('[data-next]', sl).innerHTML = ICON.arrow;
    let i = Math.max(0, slides.findIndex(s => s.classList.contains('on')));
    const go = d => {
      if (slides.length < 2) return;
      slides[i].classList.remove('on');
      i = (i + d + slides.length) % slides.length;
      slides[i].classList.add('on');
      num.style.transform = `translateY(${d > 0 ? '-' : ''}100%)`;
      setTimeout(() => { num.style.transition = 'none'; num.textContent = i + 1; num.style.transform = `translateY(${d > 0 ? '' : '-'}100%)`; requestAnimationFrame(() => { num.style.transition = ''; num.style.transform = 'none'; }); }, 250);
    };
    $('[data-prev]', sl).addEventListener('click', () => go(-1));
    $('[data-next]', sl).addEventListener('click', () => go(1));
  }

  /* ---- Pricing toggle (number flow) ------------------------------------- */
  const pr = $('#pricing');
  if (pr) {
    const tg = $('.toggle', pr);
    const fmt = v => '$' + Math.round(v).toLocaleString('en-US');
    $$('[data-bill]', tg).forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.bill;
      if (tg.dataset.v === v) return;
      tg.dataset.v = v; pr.dataset.v = v;
      $$('[data-bill]', tg).forEach(x => x.classList.toggle('on', x === b));
      $$('.price .v', pr).forEach(el => {
        const from = +el.dataset[v === 'yearly' ? 'm' : 'y'], to = +el.dataset[v === 'yearly' ? 'y' : 'm'];
        const t0 = performance.now(), dur = 700;
        const step = now => {
          const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
          el.textContent = fmt(from + (to - from) * e);
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }));
  }
})();
