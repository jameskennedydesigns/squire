"""Apply the Site Editor's saved content to the site.

  python3 tools/editor/apply.py <editor-content.json> <downloaded-assets-dir>

<editor-content.json> is the editor's saved document (db `editor/content`).
<downloaded-assets-dir> holds the uploaded files, named <asset-id>.<ext>
(what the Artifact read of each asset id saves).

For every "asset:<id>" the editor stored, the upload is resized for the web
(longest side 1600px, JPEG quality 76 — PNG/GIF/SVG/WebP keep their format;
MP4/MOV/M4V videos over 5 MB, and every MOV/M4V, are re-encoded to a muted
H.264 MP4 under 5 MB by compress_video.swift) and saved under a readable name in assets/img/, and the
reference is rewritten to that path. Fields reset to default (null) are
dropped. Finally assets/js/content.js is rewritten.
"""
import json, os, re, shutil, subprocess, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMG_DIR = os.path.join(ROOT, 'assets', 'img')
MAX_SIDE = 1600
VIDEO_MAX_MB = 5            # videos are compressed to fit under this, for phones

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:80] or 'image'

def find_asset(dir_, aid):
    for f in os.listdir(dir_):
        if f.startswith(aid + '.') or f == aid:
            return os.path.join(dir_, f)
    return None

def compress_video(src, out):
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'compress_video.swift')
    r = subprocess.run(['swift', '-suppress-warnings', script, src, out, str(VIDEO_MAX_MB), str(MAX_SIDE)], capture_output=True, text=True)
    for f in os.listdir(os.path.dirname(out)):          # temp files AVFoundation can leave behind
        if f.startswith(os.path.basename(out) + '.sb-'): os.remove(os.path.join(os.path.dirname(out), f))
    if r.returncode:
        raise RuntimeError((r.stderr or r.stdout).strip()[-300:])
    return r.stdout.strip()

def optimise(src, name):
    ext = os.path.splitext(src)[1].lower()
    os.makedirs(IMG_DIR, exist_ok=True)
    if ext in ('.mp4', '.mov', '.m4v'):
        out = os.path.join(IMG_DIR, name + '.mp4')
        if ext != '.mp4' or os.path.getsize(src) > VIDEO_MAX_MB * 1_000_000:
            try:
                print(f'video  {name}: {os.path.getsize(src) / 1e6:.1f} MB -> ' + compress_video(src, out))
                return out
            except Exception as e:
                print(f'video  {name}: could not compress ({e}); using the original', file=sys.stderr)
        out = os.path.join(IMG_DIR, name + ext); shutil.copyfile(src, out); return out
    if ext == '.webm' and os.path.getsize(src) > VIDEO_MAX_MB * 1_000_000:
        print(f'video  {name}: WebM over {VIDEO_MAX_MB} MB can\'t be compressed here; upload an MP4 instead', file=sys.stderr)
    if ext in ('.webm', '.svg', '.gif'):
        out = os.path.join(IMG_DIR, name + ext); shutil.copyfile(src, out); return out
    keep = ext in ('.png', '.webp')
    out = os.path.join(IMG_DIR, name + ('.png' if ext == '.png' else '.webp' if ext == '.webp' else '.jpg'))
    args = ['sips', '-Z', str(MAX_SIDE)]
    if not keep: args += ['-s', 'format', 'jpeg', '-s', 'formatOptions', '76']
    try:
        subprocess.run(args + [src, '--out', out], check=True, capture_output=True)
    except Exception:
        shutil.copyfile(src, out)   # no sips (not macOS): copy as-is
    return out

def main(doc_path, assets_dir):
    doc = json.load(open(doc_path, encoding='utf-8'))
    d = doc.get('data', doc)
    content = {k: d.get(k, {}) for k in ('site', 'text', 'links', 'images')}
    for g in ('text', 'links', 'images'):
        content[g] = {k: v for k, v in content[g].items() if v is not None}
    done, missing = {}, []

    def resolve(value, name):
        if not (isinstance(value, str) and value.startswith('asset:')): return value
        aid = value[6:]
        if aid in done: return done[aid]
        src = find_asset(assets_dir, aid)
        if not src: missing.append((name, aid)); return value
        out = optimise(src, slug(name))
        done[aid] = os.path.relpath(out, ROOT).replace(os.sep, '/')
        return done[aid]

    for k, v in list(content['images'].items()):
        content['images'][k] = resolve(v, k)
    s = content['site']
    for i, p in enumerate(s.get('projects', [])):
        base = 'project-' + (p.get('slug') or str(i + 1))
        for f in ('disc', 'image'): p[f] = resolve(p.get(f), f'{base}-{f}')
        for n in range(1, 9):          # gallery under /2: up to 8 blocks
            c = p.get('case') or {}
            if f'gallery{n}' in c: c[f'gallery{n}'] = resolve(c[f'gallery{n}'], f'{base}-gallery{n}')
        c = p.get('case') or {}
        for n in (3, 4, 5):            # optional section images under /3, /4, /5
            if f'image{n}' in c: c[f'image{n}'] = resolve(c[f'image{n}'], f'{base}-image{n}')
    for i, p in enumerate(s.get('posts', [])):
        p['image'] = resolve(p.get('image'), 'note-' + (p.get('slug') or str(i + 1)))

    out = os.path.join(ROOT, 'assets', 'js', 'content.js')
    open(out, 'w', encoding='utf-8').write(
        '/* Content overrides — applied from the Site Editor on ' + datetime.date.today().isoformat() + '.\n'
        '   Replace this whole file with the one the editor exports.\n'
        '   Empty = the site shows its built-in defaults. */\n'
        'window.CONTENT = ' + json.dumps(content, ensure_ascii=False, indent=2) + ';\n')
    for aid, path in done.items():
        print(f'image  {path}  ({os.path.getsize(os.path.join(ROOT, path)) // 1024} KB, from asset {aid})')
    for name, aid in missing:
        print(f'MISSING upload for {name}: asset {aid} not found in {assets_dir}')
    print('wrote', os.path.relpath(out, ROOT))
    return 1 if missing else 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1], sys.argv[2]))
