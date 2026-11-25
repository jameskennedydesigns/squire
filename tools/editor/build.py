"""Builds the Site Editor artifact page from the site's own content.

  python3 tools/editor/build.py

Reads tools/editor/schema.json (every data-edit / data-img key in the HTML and
its default copy), assets/js/config.js (site settings, projects, posts) and the
project/article templates, then writes tools/editor/site-editor.html.
"""
import json, re, os, html

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()

# ---- site defaults from config.js (JS object literal -> JSON) ----------------
cfg = rd('assets/js/config.js')
obj = cfg[cfg.index('window.SITE = ') + len('window.SITE = '):cfg.rindex('};') + 1]
obj = re.sub(r'/\*.*?\*/', '', obj, flags=re.S)
obj = re.sub(r'(?m)^\s*//.*$', '', obj)
obj = re.sub(r'(,|\{|\[)[ \t]*//[^\n]*$', r'\1', obj, flags=re.M)
obj = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', obj)
obj = re.sub(r',(\s*[}\]])', r'\1', obj)
site = json.loads(obj)

# ---- project case-study defaults from project.html --------------------------
proj = rd('project.html')
case_defaults = {}
for m in re.finditer(r'data-pfield="([^"]+)"[^>]*>(.*?)</p>', proj, flags=re.S):
    t = re.sub(r'<span data-site="name">[^<]*</span>', '{name}', m.group(2))
    case_defaults[m.group(1)] = html.unescape(re.sub(r'<[^>]+>', '', t)).strip()
case_defaults['liveUrl'] = ''

# ---- article body default ---------------------------------------------------
art = rd('article.html')
body = art[art.index('data-afield="body">') + len('data-afield="body">'):]
body = body[:body.index('</div>')]
parts = []
for m in re.finditer(r'<(p|h2|blockquote)>(.*?)</\1>', body, flags=re.S):
    t = html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).strip()
    parts.append(('## ' if m.group(1) == 'h2' else '> ' if m.group(1) == 'blockquote' else '') + t)
article_body = '\n\n'.join(parts)

# ---- page fields ------------------------------------------------------------
schema = json.load(open(os.path.join(HERE, 'schema.json'), encoding='utf-8'))
for e in schema: e.pop('order', None)

def F(key, section, label, default, typ='text', page='Global'):
    return {'key': key, 'page': page, 'section': section, 'label': label, 'default': default, 'type': typ}

def S(key, label, default, options):
    return dict(F(key, 'Intro sequence', label, default, 'select', 'Home'), options=options, first=True)
def N(key, label, default, hint, lo=0, hi=10, step=.1):
    return dict(F(key, 'Intro sequence', label, default, 'number', 'Home'), hint=hint, min=lo, max=hi, step=step, first=True)

extra = [
    # Home intro sequence settings (read by assets/js/intro.js)
    S('home.intro.loader', 'Black 0–100% loader', 'first', [['first', 'First visit in a browser tab only'], ['every', 'Every time the homepage loads'], ['never', 'Never — start at the title']]),
    N('home.intro.loaderMin', 'Loader minimum length', '1.8', 'seconds (it also waits for the page and discs to load, up to 5 s)', .5, 5),
    N('home.intro.titleHold', 'How long the first title stays', '1.1', 'seconds, before it swaps to the main title', .3, 5),
    N('home.intro.discsDelay', 'Reading pause before the discs', '1.6', 'seconds after the intro text appears', 0, 6),
    # Home extras that live outside plain text nodes
    F('home.scramble.sentence', 'Scramble', 'Scattered-words sentence', '{name}® brings ideas and code together, turning imagination into clarity and connection into beauty.', 'longtext', 'Home'),
    F('home.reel.ticker', 'Reel', 'Scrolling ticker text', 'Ideas in Motion.', 'text', 'Home'),
    F('home.in-numbers.num1', 'In Numbers', 'Big number 1 (two digits)', '12', 'text', 'Home'),
    F('home.in-numbers.num2', 'In Numbers', 'Big number 2 (two digits)', '42', 'text', 'Home'),
    F('home.in-numbers.num3', 'In Numbers', 'Big number 3 (two digits)', '83', 'text', 'Home'),
    F('home.pricing.price1.monthly', 'Pricing', 'Foundation · monthly price', '6500', 'text', 'Home'),
    F('home.pricing.price1.yearly', 'Pricing', 'Foundation · yearly price', '5200', 'text', 'Home'),
    F('home.pricing.price2.monthly', 'Pricing', 'Studio · monthly price', '8000', 'text', 'Home'),
    F('home.pricing.price2.yearly', 'Pricing', 'Studio · yearly price', '6400', 'text', 'Home'),
    F('home.pricing.price3.monthly', 'Pricing', 'Signature · monthly price', '14000', 'text', 'Home'),
    F('home.pricing.price3.yearly', 'Pricing', 'Signature · yearly price', '11200', 'text', 'Home'),
    F('studio.featured.ticker', 'Featured Project', 'Scrolling ticker text', 'Featured Project.', 'text', 'About (Studio)'),
    # Global: navigation, footer, contact form
    F('global.nav.portfolio', 'Navigation', 'Menu item 1', 'Portfolio'),
    F('global.nav.studio', 'Navigation', 'Menu item 2', 'Studio'),
    F('global.nav.feed', 'Navigation', 'Menu item 3', 'Feed'),
    F('global.nav.contact', 'Navigation', 'Menu item 4', 'Contact'),
    F('global.footer.wordmark', 'Footer', 'Big footer wordmark', '{name}®'),
    F('global.footer.newsletter', 'Footer', 'Newsletter blurb', 'Join my newsletter for thoughts on design, engineering, and the craft in between — sent occasionally, when there’s something worth sharing.', 'longtext'),
    F('global.footer.newsletterPlaceholder', 'Footer', 'Newsletter field placeholder', 'Your Email Here'),
    F('global.footer.newsletterThanks', 'Footer', 'Newsletter thank-you', 'Thanks — you’re on the list.'),
    F('global.footer.socialLabel', 'Footer', 'Social column label', 'Social'),
    F('global.footer.legalLabel', 'Footer', 'Legal column label', 'Legal'),
    dict(F('global.footer.privacy', 'Footer', 'Privacy link', 'Privacy Policy'), href='#'),
    dict(F('global.footer.terms', 'Footer', 'Terms link', 'Terms of Service'), href='#'),
    F('global.footer.credit', 'Footer', 'Credit label', 'Designed & built by'),
    F('global.footer.rights', 'Footer', 'Rights line', 'All rights reserved.'),
    F('global.form.title', 'Contact form', 'Form heading', 'Let’s Talk!'),
    F('global.form.line1', 'Contact form', 'Sentence 1', 'Hey {name}, my name is'),
    F('global.form.namePlaceholder', 'Contact form', 'Name field placeholder', 'Your Name *'),
    F('global.form.line2', 'Contact form', 'Sentence 2', 'and I’m writing from'),
    F('global.form.companyPlaceholder', 'Contact form', 'Company field placeholder', 'Company Name'),
    F('global.form.line3', 'Contact form', 'Sentence 3', 'I’m getting in touch because I’d like to'),
    F('global.form.messagePlaceholder', 'Contact form', 'Message field placeholder', 'Message *'),
    F('global.form.line4', 'Contact form', 'Sentence 4', 'My budget is roughly'),
    F('global.form.budgetPlaceholder', 'Contact form', 'Budget placeholder', 'Select a Budget *'),
    F('global.form.budgetOptions', 'Contact form', 'Budget options (one per line)', '$5,000 - $10,000\n$10,000 - $20,000\n$20,000 +', 'longtext'),
    F('global.form.line5', 'Contact form', 'Sentence 5', "and I'd like to start"),
    F('global.form.timeframePlaceholder', 'Contact form', 'Timeframe placeholder', 'Choose a Timeframe *'),
    F('global.form.timeframeOptions', 'Contact form', 'Timeframe options (one per line)', 'As soon as possible\nNext month\nWhenever you’re available', 'longtext'),
    F('global.form.line6', 'Contact form', 'Sentence 6', 'You can contact me at'),
    F('global.form.emailPlaceholder', 'Contact form', 'Email field placeholder', 'Email *'),
    F('global.form.signoff', 'Contact form', 'Sign-off', '…Looking forward to your reply!'),
    F('global.form.fineprint', 'Contact form', 'Fine print', 'By submitting you agree to my Terms and Privacy Policy.'),
    F('global.form.submit', 'Contact form', 'Submit button', 'Get in Touch'),
]
# Put page extras right after their section's existing fields
fields = schema[:]
for e in extra:
    idx = max((i for i, f in enumerate(fields) if f['page'] == e['page'] and f['section'] == e['section']), default=None)
    if idx is None and e.pop('first', False):
        # new section that should open its page
        idx = min((i for i, f in enumerate(fields) if f['page'] == e['page']), default=len(fields)) - 1
    e.pop('first', None)
    if idx is None: fields.append(e)
    else: fields.insert(idx + 1, e)

data = {'site': site, 'fields': fields, 'caseDefaults': case_defaults, 'articleBody': article_body}
tpl = open(os.path.join(HERE, 'template.html'), encoding='utf-8').read()
out = tpl.replace('/*__DATA__*/null', json.dumps(data, ensure_ascii=False).replace('</', '<\\/'))
open(os.path.join(HERE, 'site-editor.html'), 'w', encoding='utf-8').write(out)
print('fields', len(fields), 'bytes', len(out))
