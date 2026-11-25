/* ==========================================================================
   WORK — infinite drag / scroll canvas
   Port of the Framer "Infinite Canvas" component used on the original
   (dragSpeed .8, scrollSpeed .4, ease .2, pointer parallax off).
   ========================================================================== */
(function () {
  const S = window.SITE;
  const wrap = $('#canvas-wrap'), canvas = $('#canvas');

  /* Slot positions (% of the 2600×2300 tile) — exact values from the original,
     listed in its DOM order (12 → 01). The 5 projects repeat across the slots
     so the canvas stays as dense as the original. */
  const SLOTS = [
    [17, 13], [61, 10], [86, 87], [88, 18], [13, 77], [86, 56],
    [38, 89], [13, 45], [38, 25], [61, 71], [37, 60], [66, 39]
  ];
  const projects = S.projects.slice(0, 5);
  SLOTS.forEach((pos, k) => {
    const p = projects[(SLOTS.length - 1 - k) % projects.length];
    const el = document.createElement('div');
    el.className = 'item';
    el.style.left = pos[0] + '%';
    el.style.top = pos[1] + '%';
    el.style.position = 'absolute';
    // Each card is a round hit area; the disc itself is drawn by assets/js/discs.js
    el.innerHTML = `
      <a class="wcard wdisc ${p.shape === 'landscape' ? 'landscape' : 'portrait'}" href="project.html?p=${p.slug}" data-cursor="arrow" data-disc-index="${projects.indexOf(p)}" draggable="false" aria-label="${p.title}">
        <div class="nm">${p.title}</div>
      </a>`;
    canvas.appendChild(el);
  });

  requestAnimationFrame(() => $('#work-title').classList.add('is-in'));

  /* ---- engine ---------------------------------------------------------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const speed = e => .1 + (clamp(e, .1, 1) - .1) / .9 * 1.9;
  const easeF = e => .01 + clamp(e, 0, 1) * .19;
  const dist2 = (a, b, c, d) => (a - c) ** 2 + (b - d) ** 2;
  const OPT = { scrollSpeed: .4, dragSpeed: .8, ease: .2, general: 0, child: 0 };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scroll = { targetX: 0, targetY: 0, x: 0, y: 0, lastX: 0, lastY: 0, deltaX: 0, deltaY: 0 };
  const ptr = { targetX: .5, targetY: .5, x: .5, y: .5 };
  const drag = { active: false, id: -1, startX: 0, startY: 0, scrollX: 0, scrollY: 0, moved: 0 };
  let items = [], dims = { width: 0, height: 0, tileWidth: 0, tileHeight: 0 }, raf = null;

  function setup() {
    items.forEach(it => it.clones.forEach(c => c.remove()));
    items = [];
    const t = canvas.getBoundingClientRect();
    $$('.item', canvas).forEach(n => {
      n.style.transform = ''; n.style.left = n.dataset.l || n.style.left; n.style.top = n.dataset.t || n.style.top;
      n.dataset.l = n.style.left; n.dataset.t = n.style.top;
      const r = n.getBoundingClientRect();
      const clones = Array.from({ length: 3 }, () => { const c = n.cloneNode(true); canvas.appendChild(c); return c; });
      [n, ...clones].forEach(e => { e.style.left = '0'; e.style.top = '0'; e.style.width = r.width + 'px'; e.style.height = r.height + 'px'; e.style.touchAction = 'none'; });
      const positions = [];
      for (const ox of [0, t.width]) for (const oy of [0, t.height])
        positions.push({ x: r.left - t.left + ox, y: r.top - t.top + oy, width: r.width, height: r.height, extraX: 0, extraY: 0, variation: Math.random() * .5 + .5 });
      items.push({ real: n, clones, positions, activeIndex: -1 });
    });
    dims = { width: t.width, height: t.height, tileWidth: t.width * 2, tileHeight: t.height * 2 };
    frame(true);
  }

  function frame(instant) {
    const r = reduced || instant, i = scroll, a = ptr, o = r ? 1 : easeF(OPT.ease);
    i.x += (i.targetX - i.x) * o; i.y += (i.targetY - i.y) * o;
    a.x += (a.targetX - a.x) * (r ? 1 : .08); a.y += (a.targetY - a.y) * (r ? 1 : .08);
    const sx = i.x - i.lastX, sy = i.y - i.lastY;
    i.deltaX += (sx - i.deltaX) * (r ? 1 : .08); i.deltaY += (sy - i.deltaY) * (r ? 1 : .08);
    const l = canvas.getBoundingClientRect(), W = innerWidth, H = innerHeight;
    const mx = a.targetX * W, my = a.targetY * H, gx = mx - l.left, gy = my - l.top;
    const vx = i.x >= i.lastX ? 1 : -1, vy = i.y >= i.lastY ? 1 : -1;
    const T = dims, G = OPT.general, K = OPT.child;
    for (const e of items) {
      const pts = e.positions.map(p => {
        const dx = r ? 0 : 5 * i.deltaX * p.variation, dy = r ? 0 : 5 * i.deltaY * p.variation;
        const px = (a.x - .5) * p.width * .6 * G, py = (a.y - .5) * p.height * .6 * G;
        let c = p.x + i.x + p.extraX + dx + px, d = p.y + i.y + p.extraY + dy + py;
        if (vx > 0 && c > T.width) p.extraX -= T.tileWidth;
        if (vx < 0 && c + p.width < 0) p.extraX += T.tileWidth;
        if (vy > 0 && d > T.height) p.extraY -= T.tileHeight;
        if (vy < 0 && d + p.height < 0) p.extraY += T.tileHeight;
        c = p.x + i.x + p.extraX + dx + px; d = p.y + i.y + p.extraY + dy + py;
        const vxp = c + l.left, vyp = d + l.top;
        return { p, x: c, y: d,
          visible: vxp >= -p.width - 1000 && vxp <= W + 1000 && vyp >= -p.height - 1000 && vyp <= H + 1000,
          cd: dist2(vxp + p.width / 2, vyp + p.height / 2, W / 2, H / 2),
          pd: dist2(vxp + p.width / 2, vyp + p.height / 2, mx, my) };
      });
      let n = -1, best = Infinity;
      pts.forEach((q, k) => { if (gx >= q.x && gx <= q.x + q.p.width && gy >= q.y && gy <= q.y + q.p.height && q.pd < best) { best = q.pd; n = k; } });
      if (n < 0 && pts[e.activeIndex] && pts[e.activeIndex].visible) n = e.activeIndex;
      if (n < 0) n = pts.reduce((b, q, k) => q.cd < pts[b].cd ? k : b, 0);
      e.activeIndex = n;
      const pool = [...e.clones];
      pts.forEach((q, k) => {
        const el = k === n ? e.real : pool.pop();
        el.style.transform = `translate(${q.x}px, ${q.y}px)`;
        el.style.opacity = q.visible ? '1' : '0';
        el.style.pointerEvents = q.visible ? 'auto' : 'none';
      });
    }
    i.lastX = i.x; i.lastY = i.y;
    document.dispatchEvent(new Event('work:frame'));
    return !r && (Math.abs(i.targetX - i.x) > .02 || Math.abs(i.targetY - i.y) > .02 || Math.abs(i.deltaX) > .01 || Math.abs(i.deltaY) > .01 || Math.abs(a.targetX - a.x) > 2e-4 || Math.abs(a.targetY - a.y) > 2e-4 || drag.active);
  }
  function run() {
    if (raf !== null) return;
    const step = () => { raf = null; if (frame()) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  }

  wrap.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    Object.assign(drag, { active: true, id: e.pointerId, startX: e.clientX, startY: e.clientY, scrollX: scroll.targetX, scrollY: scroll.targetY, moved: 0 });
    wrap.classList.add('dragging');
    run();
  });
  addEventListener('pointermove', e => {
    ptr.targetX = clamp(e.clientX / innerWidth, 0, 1);
    ptr.targetY = clamp(e.clientY / innerHeight, 0, 1);
    if (drag.active && drag.id === e.pointerId) {
      scroll.targetX = drag.scrollX + (e.clientX - drag.startX) * speed(OPT.dragSpeed);
      scroll.targetY = drag.scrollY + (e.clientY - drag.startY) * speed(OPT.dragSpeed);
      drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY));
      if (e.cancelable) e.preventDefault();
    }
    run();
  }, { passive: false });
  const up = e => { if (drag.id === e.pointerId) { drag.active = false; drag.id = -1; wrap.classList.remove('dragging'); run(); } };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  // a drag should never trigger the card link
  wrap.addEventListener('click', e => { if (drag.moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const s = speed(OPT.scrollSpeed);
    scroll.targetX -= e.deltaX * s; scroll.targetY -= e.deltaY * s;
    run();
  }, { passive: false });
  // keyboard support
  addEventListener('keydown', e => {
    const k = { ArrowLeft: [120, 0], ArrowRight: [-120, 0], ArrowUp: [0, 120], ArrowDown: [0, -120] }[e.key];
    if (!k) return; scroll.targetX += k[0]; scroll.targetY += k[1]; run();
  });
  let rt = null;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { setup(); run(); }, 100); }).observe(canvas);

  setup();
})();
