/* Builds markup that is shared between pages. Runs BEFORE site.js so the
   reveal / button / cursor wiring in site.js picks these elements up.     */
(function () {
  const S = window.SITE;
  const CHECK = '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/></svg>';
  document.querySelectorAll('[data-icon-li]').forEach(li => li.insertAdjacentHTML('afterbegin', CHECK));
  document.querySelectorAll('[data-mail]').forEach(a => a.href = 'mailto:' + S.email);

  /* ---- Post card ---- */
  window.postCard = (p, i) => `
    <article class="post">
      ${p.image === 'none' ? '' : `<a href="article.html?p=${p.slug}" class="reveal-img img" data-cursor="arrow" aria-label="${p.title}"><div class="ph ${['', 'v2', 'v3', 'v4'][i % 4]}" style="position:absolute;inset:0">${p.image && !/^asset:/.test(p.image) ? `<img src="${p.image}" alt="" onerror="this.remove()">` : ''}</div></a>`}
      <p class="date">${p.date}</p>
      <a class="ttl2" href="article.html?p=${p.slug}" data-cursor="hidden">${p.title}</a>
      <p class="t-16 ex">${p.excerpt}</p>
    </article>`;
  const hn = document.getElementById('home-notes');
  if (hn) hn.innerHTML = S.posts.slice(0, 2).map(postCard).join('');
  document.querySelectorAll('.post .img').forEach(a => a.style.position = 'relative');

  /* ---- Let's Talk form (every string is editable via content keys) ---- */
  const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const words = (k, d) => T(k, d).split(/\s+/).filter(Boolean).map(w => `<span>${esc(w)}</span>`).join('');
  const opts = (k, d) => T(k, d).split('\n').map(o => o.trim()).filter(Boolean).map(o => `<option>${esc(o)}</option>`).join('');
  const ph = (k, d) => esc(T(k, d));
  const talk = document.querySelector('[data-talk]');
  if (talk) talk.innerHTML = `
    <h2 class="t-160" data-reveal>${TH('global.form.title', 'Let’s Talk!')}</h2>
    <form class="form" data-contact novalidate>
      <div class="para">
        ${words('global.form.line1', 'Hey {name}, my name is')}<i class="brk"></i>
        <input class="field w440" name="name" required placeholder="${ph('global.form.namePlaceholder', 'Your Name *')}" aria-label="Your name">
        ${words('global.form.line2', 'and I’m writing from')}<i class="brk"></i>
        <input class="field w440" name="company" placeholder="${ph('global.form.companyPlaceholder', 'Company Name')}" aria-label="Company name"><span>.</span>
      </div>
      <div class="para">
        ${words('global.form.line3', 'I’m getting in touch because I’d like to')}<i class="brk"></i>
        <textarea class="field" name="message" required placeholder="${ph('global.form.messagePlaceholder', 'Message *')}" aria-label="Message"></textarea>
      </div>
      <div class="para">
        ${words('global.form.line4', 'My budget is roughly')}
        <select class="field w240" name="budget" aria-label="Budget"><option value="">${ph('global.form.budgetPlaceholder', 'Select a Budget *')}</option>${opts('global.form.budgetOptions', '$5,000 - $10,000\n$10,000 - $20,000\n$20,000 +')}</select>
        ${words('global.form.line5', "and I'd like to start")}<i class="brk"></i>
        <select class="field w480" name="timeframe" aria-label="Timeframe"><option value="">${ph('global.form.timeframePlaceholder', 'Choose a Timeframe *')}</option>${opts('global.form.timeframeOptions', 'As soon as possible\nNext month\nWhenever you’re available')}</select><span>.</span>
      </div>
      <div class="para">
        ${words('global.form.line6', 'You can contact me at')}
        <input class="field w440" type="email" name="email" required placeholder="${ph('global.form.emailPlaceholder', 'Email *')}" aria-label="Email"><i class="brk"></i>
        <span>${esc(T('global.form.signoff', '…Looking forward to your reply!'))}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:24px;align-items:flex-start">
        <p class="fine">${esc(T('global.form.fineprint', 'By submitting you agree to my Terms and Privacy Policy.'))}</p>
        <button class="btn-a" type="submit" style="border:0;background:none;cursor:pointer">${esc(T('global.form.submit', 'Get in Touch'))}</button>
      </div>
    </form>`;
})();
