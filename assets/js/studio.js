/* ==========================================================================
   STUDIO (About) page behaviours
   ========================================================================== */
(function () {
  const S = window.SITE;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---- Experience timeline: blocks of lines, blank line between entries -- */
  const tl = $('#timeline');
  if (tl) {
    const e = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let any = false;
    $$('[data-timeline]', tl).forEach(list => {
      const raw = T(list.dataset.timeline, '').trim();
      const group = list.closest('.tl-group');
      if (!raw) { group.style.display = 'none'; return; }
      any = true;
      list.innerHTML = raw.split(/\n\s*\n/).map(b => b.split('\n').map(l => l.trim()).filter(Boolean)).filter(b => b.length)
        .map(([org, ...lines]) => `<div class="tl-item"><p class="org">${e(org)}</p>${lines.map(l => `<p class="ln">${e(l)}</p>`).join('')}</div>`).join('');
    });
    const link = $('.tl-link a', tl);
    if (!link || link.getAttribute('href') === '#' || link.style.display === 'none') $('.tl-link', tl).style.display = 'none';
    if (!any) tl.style.display = 'none';
  }

  /* ---- Cursor image trail over the intro (Framer "Cursor Image Trail") -- */
  const trail = $('#trail'), intro = $('#intro');
  if (trail && matchMedia('(hover: hover)').matches) {
    let lx = null, ly = null, n = 0;
    const shades = ['var(--ph)', 'var(--ph-2)', 'var(--ph-3)', 'var(--ph-4)'];
    intro.addEventListener('pointermove', e => {
      const r = trail.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (y > r.height) return;
      if (lx !== null && Math.hypot(x - lx, y - ly) < 110) return;
      lx = x; ly = y;
      const t = document.createElement('div');
      t.className = 't';
      t.style.left = x + 'px'; t.style.top = y + 'px';
      t.style.background = shades[n++ % shades.length];
      trail.appendChild(t);
      setTimeout(() => t.remove(), 1200);
    });
  }

  /* ---- Statement: words darken + image gaps open as you scroll ---------- */
  const team = $('#team'), tr = $('#text-reveal');
  if (team && tr) {
    $$('[data-w]', tr).forEach(seg => {
      seg.innerHTML = seg.textContent.trim().split(/\s+/).map(w => `<span class="wd">${w}</span>`).join(' ');
    });
    const words = $$('.wd', tr), gaps = $$('.gapimg', tr), grid = $('.grid', team);
    // index of the word right after each gap
    const order = [...$$('.gapimg, .wd', tr)];
    const update = () => {
      const r = team.getBoundingClientRect(), vh = innerHeight;
      const p = clamp((-r.top + vh * 0.6) / (vh * 1.0), 0, 1);
      const lit = Math.round(p * order.length);
      order.forEach((el, i) => el.classList.toggle('on', i < lit));
      const gt = grid.firstElementChild.getBoundingClientRect().top;
      tr.style.opacity = clamp((gt - vh * 0.15) / (vh * 0.55), 0, 1);
    };
    addEventListener('scroll', update, { passive: true });
    update();
  }

  /* ---- Featured project link -------------------------------------------- */
  const f = $('#featured');
  if (f && S.projects[0]) {
    f.href = `project.html?p=${S.projects[0].slug}`;
    f.setAttribute('aria-label', 'Featured project: ' + S.projects[0].title);
  }
})();
