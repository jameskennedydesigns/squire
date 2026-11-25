/* ==========================================================================
   Shared runtime: nav, clock, cursor, smooth scroll, reveals, buttons, footer
   ========================================================================== */
(function () {
  const S = window.SITE;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---- Icons (Phosphor, exact paths used on the original) --------------- */
  const ICON = {
    arrowBold: '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M224.49,136.49l-72,72a12,12,0,0,1-17-17L187,140H40a12,12,0,0,1,0-24H187L135.51,64.48a12,12,0,0,1,17-17l72,72A12,12,0,0,1,224.49,136.49Z"/></svg>',
    arrow: '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/></svg>',
    arrowLeft: '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M224,128a8,8,0,0,1-8,8H59.31l58.35,58.34a8,8,0,0,1-11.32,11.32l-72-72a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,11.32L59.31,120H216A8,8,0,0,1,224,128Z"/></svg>',
    check: '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/></svg>',
    plus: '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"/></svg>',
    drag: '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M240.49,136.49l-32,32a12,12,0,0,1-17-17L203,140H53l11.52,11.51a12,12,0,0,1-17,17l-32-32a12,12,0,0,1,0-17l32-32a12,12,0,1,1,17,17L53,116H203l-11.52-11.51a12,12,0,0,1,17-17l32,32A12,12,0,0,1,240.49,136.49Z"/></svg>',
    play: '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z"/></svg>'
  };
  window.ICON = ICON;

  const page = document.body.dataset.page || '';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const yy = String(new Date().getFullYear()).slice(-2);

  /* ---- Fill config text ------------------------------------------------- */
  const edited = el => { const t = (window.CONTENT || {}).text || {}; return el.closest('[data-edit]') && Object.prototype.hasOwnProperty.call(t, el.closest('[data-edit]').dataset.edit); };
  $$('[data-site]').forEach(el => {
    if (edited(el)) return;   // text set in the Site Editor wins over the automatic fill
    const k = el.dataset.site;
    if (k === 'name') el.textContent = S.name;
    if (k === 'name-r') el.textContent = S.name + '®';
    if (k === 'role') el.textContent = S.role;
    if (k === 'email') { el.textContent = S.email; if (el.tagName === 'A') el.href = 'mailto:' + S.email; }
    if (k === 'copy') el.textContent = `© ${S.since}-${yy}`;
  });

  /* ---- Letter roll (menu hover) ------------------------------------------ */
  function roll(el) {
    const t = el.textContent.trim();
    el.textContent = '';
    el.classList.add('roll');
    el.setAttribute('aria-label', t);
    [...t].forEach((c, i) => {
      const ch = document.createElement('span');
      ch.className = 'ch';
      ch.setAttribute('aria-hidden', 'true');
      ch.style.setProperty('--i', i);
      const ch2 = c === ' ' ? ' ' : c;
      ch.innerHTML = `<span><b>${ch2}</b><b>${ch2}</b></span>`;
      el.appendChild(ch);
    });
    el._kernUnits = $$('.ch', el);
  }

  /* ---- Kerning for split-letter text -------------------------------------
     Splitting a word into one element per letter drops the font's kerning
     pairs. We measure each pair on a canvas with the element's real font
     (kern = width(ab) − width(a) − width(b)) and add it back as a margin in
     em, so it stays correct at every breakpoint.                           */
  const kctx = document.createElement('canvas').getContext('2d');
  function applyKerning(units, styleEl) {
    if (!units || units.length < 2) return;
    const cs = getComputedStyle(styleEl);
    const size = parseFloat(cs.fontSize);
    kctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    if ('fontKerning' in kctx) kctx.fontKerning = 'normal';
    const up = cs.textTransform === 'uppercase';
    const ch = u => { const t = (u.dataset.char ?? u.textContent).slice(0, 1); return up ? t.toUpperCase() : t; };
    const w = s => kctx.measureText(s).width;
    units.forEach((u, i) => {
      const n = units[i + 1];
      if (!n) { u.style.marginRight = ''; return; }
      const a = ch(u), b = ch(n);
      const k = w(a + b) - w(a) - w(b);
      u.style.marginRight = Math.abs(k) > .01 ? (k / size) + 'em' : '';
    });
  }
  window.applyKerning = applyKerning;
  function kernAll() {
    $$('.roll').forEach(r => applyKerning(r._kernUnits, r));
    $$('[data-kern]').forEach(h => applyKerning(h._kernUnits, h));
  }

  // Generic split for headings marked data-kern (used by the Portfolio title)
  $$('[data-kern]').forEach(h => {
    const t = h.textContent.trim();
    h.setAttribute('aria-label', t);
    h.textContent = '';
    h._kernUnits = [...t].map((c, i) => {
      const w = document.createElement('span'); w.className = 'w'; w.dataset.char = c; w.setAttribute('aria-hidden', 'true');
      const s = document.createElement('span'); s.style.setProperty('--i', i); s.textContent = c;
      w.appendChild(s); h.appendChild(w); return w;
    });
  });

  /* ---- Nav + viewport overlay -------------------------------------------- */
  const vp = document.createElement('div');
  vp.className = 'viewport';
  vp.innerHTML = `
    <nav class="nav" aria-label="Main">
      <section><a class="logo" href="index.html" data-cursor="hidden">${esc(S.brand || S.name + '®')}</a></section>
      <section></section>
      <section><div class="menu">
        <a href="portfolio.html" data-roll data-cursor="hidden">${esc(T('global.nav.portfolio', 'Portfolio'))}</a>
        <a href="studio.html" data-roll data-cursor="hidden">${esc(T('global.nav.studio', 'Studio'))}</a>
        <a href="feed.html" data-roll data-cursor="hidden">${esc(T('global.nav.feed', 'Feed'))}</a>
        <a href="contact.html" data-roll data-cursor="hidden">${esc(T('global.nav.contact', 'Contact'))}</a>
      </div></section>
    </nav>
    <div class="clock" aria-label="Local time"><span class="loc">${S.location}</span><span class="tm"></span></div>`;
  document.body.prepend(vp);

  /* ---- Clock ------------------------------------------------------------- */
  const tm = $('.clock .tm', vp);
  const tick = () => {
    try {
      tm.textContent = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: S.timezone }).format(new Date());
    } catch (e) {
      tm.textContent = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
    }
  };
  tick(); setInterval(tick, 10000);

  /* ---- Footer ------------------------------------------------------------ */
  const foot = $('[data-footer]');
  if (foot) {
    foot.className = 'footer';
    foot.innerHTML = `
      <div class="name">
        <div class="row">
          <div class="fit" data-fit><span class="fit-text"><span>${esc(T('global.footer.wordmark', '{name}®'))}</span></span></div>
          <div class="copy">© ${S.since}-${yy}</div>
        </div>
        <div class="blinds" aria-hidden="true">${'<div></div>'.repeat(6).replace(/<div>/g, (m, i) => m)}</div>
      </div>
      <div>
        <div class="cols">
          <div class="nl">
            <p class="t-16 w-400">${TH('global.footer.newsletter', 'Join my newsletter for thoughts on design, engineering, and the craft in between — sent occasionally, when there’s something worth sharing.')}</p>
            <form class="nl-form" data-nl>
              <input class="field" type="email" required placeholder="${esc(T('global.footer.newsletterPlaceholder', 'Your Email Here'))}" aria-label="Email address">
              <button type="submit" aria-label="Subscribe">${ICON.arrowBold}${ICON.arrowBold}</button>
            </form>
          </div>
          <div><p class="label">${esc(T('global.footer.socialLabel', 'Social'))}</p><div class="links">${S.socials.map(s => `<a href="${s.href}" target="_blank" rel="noopener">${s.label}</a>`).join('')}</div></div>
          <div><p class="label">${esc(T('global.footer.legalLabel', 'Legal'))}</p><div class="links"><a href="${esc(CONTENT_LINK('global.footer.privacy', '#'))}">${esc(T('global.footer.privacy', 'Privacy Policy'))}</a><a href="${esc(CONTENT_LINK('global.footer.terms', '#'))}">${esc(T('global.footer.terms', 'Terms of Service'))}</a><a href="404.html">404</a></div></div>
        </div>
        <div class="base">
          <div class="l"><span class="label">${esc(T('global.footer.credit', 'Designed & built by'))}</span>&nbsp;<a href="index.html" data-roll>${S.name}</a></div>
          <div><span class="label">© ${new Date().getFullYear()} ${esc(S.name)}. ${esc(T('global.footer.rights', 'All rights reserved.'))}</span></div>
          <div></div>
        </div>
      </div>`;
    $$('.blinds div', foot).forEach((d, i) => d.style.setProperty('--i', i));
  }

  $$('[data-roll]').forEach(roll);

  /* ---- Buttons ----------------------------------------------------------- */
  $$('.btn-b').forEach(b => {
    b.insertAdjacentHTML('beforeend', `<span class="arrows" aria-hidden="true">${ICON.arrowBold}${ICON.arrowBold}</span><span class="uline"></span>`);
    b.dataset.cursor = b.dataset.cursor || 'hidden';
  });
  $$('.btn-a').forEach(b => {
    b.insertAdjacentHTML('afterbegin', '<span class="bd"></span>');
    b.insertAdjacentHTML('beforeend', ICON.arrowBold.replace('<svg', '<svg class="a1"') + ICON.arrowBold.replace('<svg', '<svg class="a2"'));
    b.dataset.cursor = b.dataset.cursor || 'hidden';
  });
  $$('[data-icon]').forEach(el => { el.innerHTML = ICON[el.dataset.icon] || ''; });

  /* ---- Fit text (Framer "fit text" SVG equivalent) ----------------------- */
  function fit() {
    $$('[data-fit]').forEach(box => {
      const t = $('.fit-text', box);
      t.style.fontSize = '240px';
      const lines = $$('span', t);
      const nat = Math.max(...lines.map(l => { l.style.display = 'inline-block'; const w = l.getBoundingClientRect().width; l.style.display = ''; return w; }));
      const w = box.getBoundingClientRect().width;
      if (nat > 0) t.style.fontSize = (240 * w / nat) + 'px';
    });
  }
  window.fitText = fit;
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { fit(); kernAll(); document.dispatchEvent(new Event('fonts-ready')); });
  addEventListener('resize', () => { fit(); kernAll(); });

  /* ---- Text reveal: split into lines / words ----------------------------- */
  function splitReveal(el) {
    const mode = el.dataset.reveal || 'lines';
    const stagger = +(el.dataset.stagger || (mode === 'words' ? 60 : 120));
    const delay = +(el.dataset.delay || 100);
    const paras = el.innerHTML.split(/<br\s*\/?>\s*<br\s*\/?>/i);
    const raw = el.textContent;
    el.setAttribute('aria-label', raw.replace(/\s+/g, ' ').trim());
    el.innerHTML = '';
    const words = [];
    paras.forEach(p => {
      const tmp = document.createElement('div'); tmp.innerHTML = p;
      const line = document.createElement('span'); line.className = 'rv-line'; line.setAttribute('aria-hidden', 'true');
      // keep <b>/<strong> runs
      const tokens = [];
      tmp.childNodes.forEach(n => {
        const bold = n.nodeType === 1 && /^(B|STRONG)$/.test(n.tagName);
        (n.textContent || '').split(/(\s+)/).forEach(w => { if (w.trim()) tokens.push({ w, bold }); });
      });
      tokens.forEach((t, i) => {
        const w = document.createElement('span'); w.className = 'rv-w';
        const inner = document.createElement('span'); inner.className = 'rv-i';
        inner.textContent = t.w + (i < tokens.length - 1 ? ' ' : '');
        if (t.bold) inner.style.fontWeight = 800;
        w.appendChild(inner); line.appendChild(w); words.push(inner);
      });
      el.appendChild(line);
    });
    const assign = () => {
      let li = -1, top = null;
      words.forEach((w, i) => {
        const t = w.parentNode.getBoundingClientRect().top;
        if (top === null || Math.abs(t - top) > 5) { li++; top = t; }
        const idx = mode === 'words' ? i : li;
        w.style.transitionDelay = (delay + idx * stagger) + 'ms';
      });
    };
    assign();
    el._assign = assign;
  }
  $$('[data-reveal]').forEach(splitReveal);
  document.addEventListener('fonts-ready', () => $$('[data-reveal]').forEach(e => e._assign && !e.classList.contains('is-in') && e._assign()));

  /* ---- In-view observer -------------------------------------------------- */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }), { rootMargin: '-10% 0px -10% 0px' });
  window.observeIn = el => io.observe(el);
  $$('[data-reveal],[data-rise],[data-drop],[data-fade],.reveal-img,.timeline,.footer,[data-inview]').forEach(el => {
    if (!el.hasAttribute('data-hold')) io.observe(el);   // [data-hold]: a script decides when it reveals (hero intro)
  });

  /* ---- Smooth scroll (Lenis, intensity 20 → duration 2) ------------------ */
  let lenis = null;
  if (window.Lenis && page !== 'portfolio' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    lenis = new Lenis({ duration: 2, smoothWheel: true, wheelMultiplier: 1 });
    const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
  window.lenis = lenis;
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href'); if (id.length < 2) return;
    const t = $(id); if (!t) return; e.preventDefault();
    lenis ? lenis.scrollTo(t) : t.scrollIntoView({ behavior: 'smooth' });
  }));

  /* ---- Custom cursor ----------------------------------------------------- */
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fine) {
    document.documentElement.classList.add('has-cursor');
    const c = document.createElement('div');
    c.className = 'cursor is-out';
    c.innerHTML = `<div class="dot">${ICON.arrow.replace('<svg', '<svg class="i-arrow"')}${ICON.drag.replace('<svg', '<svg class="i-drag"')}${ICON.play.replace('<svg', '<svg class="i-play"')}</div>`;
    document.body.appendChild(c);
    let x = -100, y = -100;
    addEventListener('pointermove', e => {
      x = e.clientX; y = e.clientY;
      c.style.transform = `translate3d(${x}px,${y}px,0)`;
      c.classList.remove('is-out');
      const t = e.target.closest && e.target.closest('[data-cursor]');
      c.dataset.v = t ? t.dataset.cursor : '';
    }, { passive: true });
    document.addEventListener('pointerleave', () => c.classList.add('is-out'));
    window.addEventListener('blur', () => c.classList.add('is-out'));
  }

  /* ---- Accordions (FAQ + Experience) ------------------------------------- */
  $$('[data-acc]').forEach(group => {
    const items = $$('[data-acc-item]', group);
    items.forEach(it => it.addEventListener('click', e => {
      if (e.target.closest('a,button,input')) return;
      const open = it.classList.contains('open');
      items.forEach(o => o.classList.remove('open'));
      if (!open) it.classList.add('open');
      setTimeout(() => lenis && lenis.resize(), 650);
    }));
  });

  /* ---- Forms ------------------------------------------------------------- */
  $$('select.field').forEach(s => s.addEventListener('change', () => s.classList.toggle('has-v', !!s.value)));
  $$('form[data-contact]').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const body = `Hey ${S.name}, my name is ${d.name || ''} and I'm writing from ${d.company || ''}.\n\nI'm getting in touch because I'd like to ${d.message || ''}\n\nMy budget is roughly ${d.budget || '—'} and I'd like to start ${d.timeframe || '—'}.\n\nYou can contact me at ${d.email || ''}.`;
    location.href = `mailto:${S.email}?subject=${encodeURIComponent('New enquiry from ' + (d.name || 'your website'))}&body=${encodeURIComponent(body)}`;
  }));
  $$('form[data-nl]').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const i = $('input', f); i.value = ''; i.placeholder = T('global.footer.newsletterThanks', 'Thanks — you’re on the list.');
  }));

  /* ---- Tickers (Framer Ticker, ~100px/s, pauses off-screen) ------------- */
  $$('[data-ticker]').forEach(tk => {
    const track = $('.track', tk), item = track.firstElementChild;
    const speed = +tk.dataset.ticker; // px/s, negative = left
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    let w = 0, x = 0, visible = true, last = performance.now();
    const build = () => {
      [...track.children].slice(1).forEach(n => n.remove());
      const items = [item];
      w = item.getBoundingClientRect().width + gap;
      const n = Math.ceil(tk.offsetWidth / w) + 2;
      for (let i = 1; i < n; i++) track.appendChild(item.cloneNode(true));
    };
    new IntersectionObserver(([e]) => visible = e.isIntersecting).observe(tk);
    const loop = now => {
      const dt = Math.min(64, now - last) / 1000; last = now;
      if (visible && w) {
        x = (x + Math.abs(speed) * dt) % w;
        track.style.transform = `translate3d(${speed < 0 ? -x : x - w}px,0,0)`;
      }
      requestAnimationFrame(loop);
    };
    build();
    document.addEventListener('fonts-ready', build);
    addEventListener('resize', build);
    requestAnimationFrame(loop);
  });

  /* ---- Year-in-copy helper for pages ------------------------------------ */
  window.$ = $; window.$$ = $$;
})();
