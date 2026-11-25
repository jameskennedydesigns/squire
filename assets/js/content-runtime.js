/* ==========================================================================
   Content runtime — applies edits from assets/js/content.js (exported by the
   content editor) on top of the defaults in the HTML and config.js.
   Loaded right after config.js + content.js, before every other script.

   CONTENT = {
     site:   { ...same shape as SITE in config.js (name, projects, posts…) },
     text:   { "<data-edit key>": "New copy" }     ""  → hides the element
     links:  { "<data-href key>": "https://…" }
     images: { "<data-img key>": "assets/img/x.jpg" | "https://…" | "data:…" }
   }
   Text supports {name} {role} {city} {email} tokens and line breaks.
   ========================================================================== */
(function () {
  const C = window.CONTENT || {};
  const S = window.SITE;
  C.text = C.text || {}; C.links = C.links || {}; C.images = C.images || {};

  /* ---- 1. Site settings (name, projects, posts…) ------------------------ */
  if (C.site) for (const k in C.site) {
    const v = C.site[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) S[k] = v;
    else if (typeof v === 'object' && S[k] && typeof S[k] === 'object' && !Array.isArray(S[k])) S[k] = Object.assign({}, S[k], v);
    else S[k] = v;
  }
  S.projects = (S.projects || []).slice(0, 5);

  /* ---- helpers ---------------------------------------------------------- */
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tokens = s => s.replace(/\{name\}/g, S.name).replace(/\{role\}/g, S.role).replace(/\{city\}/g, S.city || S.location).replace(/\{email\}/g, S.email);
  const has = k => Object.prototype.hasOwnProperty.call(C.text, k);
  // plain value (for attributes, placeholders, JS templates)
  window.T = (key, def) => tokens(has(key) ? C.text[key] : def);
  // HTML value: escaped, tokens, line breaks
  const fmtHTML = (s, reveal) => tokens(esc(s)).replace(/\n/g, reveal ? '<br><br>' : '<br>');
  window.TH = (key, def, reveal) => fmtHTML(has(key) ? C.text[key] : def, reveal);
  window.CONTENT_LINK = (key, def) => C.links[key] || def;

  function setImage(el, url) {
    // "asset:<id>" only exists inside the Site Editor until Claude applies it
    // (downloads it into assets/img/), so it keeps the gray placeholder here.
    if (!url || /^asset:/.test(url) || url === 'none') return;
    [...el.querySelectorAll(':scope > img, :scope > video')].forEach(n => n.remove());
    let m;
    if (/\.(mp4|webm|mov)(\?|#|$)/i.test(url)) {
      m = document.createElement('video');
      Object.assign(m, { src: url, autoplay: true, muted: true, loop: true, playsInline: true });
      m.setAttribute('muted', ''); m.setAttribute('playsinline', '');
    } else {
      m = document.createElement('img');
      m.src = url; m.alt = ''; m.loading = 'lazy'; m.decoding = 'async'; m.draggable = false;
    }
    m.addEventListener('error', () => m.remove());   // a missing file falls back to the placeholder
    if (el.classList.contains('lg')) { el.style.background = 'none'; m.style.objectFit = 'contain'; }
    m.style.cssText += ';position:absolute;inset:0;width:100%;height:100%;object-fit:' + (el.classList.contains('lg') ? 'contain' : 'cover');
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.appendChild(m);
  }
  window.setImage = setImage;

  /* ---- 2. Apply to the static page -------------------------------------- */
  function apply(root = document) {
    root.querySelectorAll('[data-edit]').forEach(el => {
      const k = el.dataset.edit;
      if (!has(k)) return;
      const v = C.text[k];
      if (v === '') { el.style.display = 'none'; return; }
      el.innerHTML = fmtHTML(v, el.hasAttribute('data-reveal') || !!el.closest('[data-reveal]'));
    });
    root.querySelectorAll('[data-href]').forEach(el => { const u = C.links[el.dataset.href]; if (u) el.setAttribute('href', u); });
    root.querySelectorAll('[data-img]').forEach(el => {
      const k = el.dataset.img;
      if (Object.prototype.hasOwnProperty.call(C.images, k) && C.images[k] === '') { el.style.display = 'none'; return; }   // HIDE
      setImage(el, C.images[k]);
    });
    // big numbers: keep the raw value (e.g. "20+", "$50M+"); data-num stays the 2-digit fallback
    root.querySelectorAll('[data-numkey]').forEach(el => {
      const v = C.text[el.dataset.numkey];
      el.dataset.value = String(v || el.dataset.num).trim();
      if (v && /^\d{1,2}$/.test(String(v).trim())) el.dataset.num = String(v).trim().padStart(2, '0');
    });
    root.querySelectorAll('[data-pricekey]').forEach(el => {
      const k = el.dataset.pricekey, n = s => String(s).replace(/[^\d.]/g, '');
      if (C.text[k + '.monthly']) el.dataset.m = n(C.text[k + '.monthly']);
      if (C.text[k + '.yearly']) el.dataset.y = n(C.text[k + '.yearly']);
      el.textContent = '$' + Math.round(+el.dataset.y).toLocaleString('en-US');
      const old = el.parentElement.querySelector('.old');
      if (old && !has(old.dataset.edit)) old.textContent = '$' + Math.round(+el.dataset.m).toLocaleString('en-US');
    });
  }
  window.applyContent = apply;

  /* ---- 3. Auto-hide emptied blocks -------------------------------------
     A section (or a marked group: [data-autohide]) disappears when every
     editable field inside it has been hidden — e.g. a whole Pricing section,
     one service group, or a testimonial slide.                             */
  const hiddenField = el => el.style.display === 'none';
  function autohide(root = document) {
    root.querySelectorAll('[data-autohide], main > section, main > .hero-pin ~ section').forEach(box => {
      const fields = [...box.querySelectorAll('[data-edit], [data-img]')];
      if (fields.length && fields.every(hiddenField)) { box.style.display = 'none'; box.setAttribute('data-hidden', ''); }
    });
  }
  window.autohideContent = autohide;

  const page = document.body.dataset.page;
  const pk = { home: 'home', portfolio: 'portfolio', studio: 'studio', feed: 'feed', contact: 'contact', project: 'project', article: 'article', 404: 'notfound' }[page];
  if (pk) {
    if (has(pk + '.meta.title')) document.title = tokens(C.text[pk + '.meta.title']);
    const md = document.querySelector('meta[name="description"]');
    if (md && has(pk + '.meta.description')) md.setAttribute('content', tokens(C.text[pk + '.meta.description']));
  }
  // Default titles/descriptions still mention "Your Name": swap in the real one
  document.title = document.title.replace(/Your Name/g, S.name);
  apply();
  autohide();
})();
