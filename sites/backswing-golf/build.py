"""Backswing Golf site generator.

  python3 build.py            -> site.html  review preview: placeholders highlighted, logo chooser on
  python3 build.py live       -> also live/index.html: placeholders unmarked, no logo chooser, noindex
  python3 build.py live golive -> launch build: indexable, CNAME added

Stock and wording are read live from Supabase, so most changes never need a rebuild.
"""
import base64, json, os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
BRAND = os.path.join(HERE, 'brand', 'logos')
FONTS_DIR = os.path.join(HERE, 'fonts')

LOGO = 'a'  # chosen logo for the live build: a modern, b heritage, c sporty
SCHEME = 'fairway'  # chosen colour scheme: fairway, links, claret, tour, sky
WHATSAPP = ''  # Backswing's mobile in international form without +, e.g. 447700900123. Empty = placeholder
EMAIL = 'info@backswinggolf.co.uk'
EBAY_STORE = 'https://www.ebay.co.uk/str/backswinggolf'
SUPABASE_URL = 'https://acdpgarasgfhvupzsbxf.supabase.co'
ANON_KEY = 'sb_publishable_OWTVpDyadL1lITnCp4gfAQ_EZxVHldY'
DOMAIN = 'www.backswinggolf.co.uk'

FONTS = [('barlow', 400, 'normal'), ('barlow', 500, 'normal'), ('barlow', 600, 'normal'), ('barlow', 700, 'normal'),
         ('barlow-condensed', 700, 'normal'), ('barlow-condensed', 800, 'normal')]

def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()

def b64(p):
    with open(p, 'rb') as f:
        return base64.b64encode(f.read()).decode()

def fonts_css():
    out = []
    for fam, w, st in FONTS:
        name = 'Barlow Condensed' if fam == 'barlow-condensed' else 'Barlow'
        data = b64(os.path.join(FONTS_DIR, f'{fam}-latin-{w}-{st}.woff2'))
        out.append(f"@font-face{{font-family:'{name}';font-style:{st};font-weight:{w};font-display:swap;src:url(data:font/woff2;base64,{data}) format('woff2')}}")
    return '\n'.join(out)

def svg_uri(name):
    return 'data:image/svg+xml;base64,' + b64(os.path.join(BRAND, name))

def logos():
    return {
        'a-light': svg_uri('a-modern-light.svg'), 'a-dark': svg_uri('a-modern-dark.svg'),
        'b-light': svg_uri('b-heritage-light.svg'), 'b-dark': svg_uri('b-heritage-dark.svg'),
        'c-light': svg_uri('c-sporty-light.svg'), 'c-dark': svg_uri('c-sporty-dark.svg'),
    }

def build(preview=True, golive=False):
    html = read(os.path.join(SRC, 'index.html'))
    lg = logos()
    if not preview:
        lg = {k: v for k, v in lg.items() if k.startswith(LOGO)}
    cfg = {'supabaseUrl': SUPABASE_URL, 'anonKey': ANON_KEY, 'email': EMAIL, 'preview': preview, 'logos': lg, 'logo': LOGO, 'scheme': SCHEME,
           'adminUrl': f'https://{DOMAIN}/#/admin' if golive else ('https://dunnworks.io/preview/backswing-golf/#/admin' if preview else 'https://anthonygdunn-hub.github.io/backswing-golf/#/admin')}
    mark = {'a': 'a-mark-light.svg', 'b': 'b-heritage-light.svg', 'c': 'c-mark-light.svg'}[LOGO]
    rep = {
        '/*FONTS*/': fonts_css(), '/*CSS*/': read(os.path.join(SRC, 'style.css')),
        '/*APPJS*/': read(os.path.join(SRC, 'app.js')), '/*ADMINJS*/': read(os.path.join(SRC, 'admin.js')),
        '/*CONFIG*/': json.dumps(cfg), '/*EMAIL*/': EMAIL, '/*EBAY_STORE*/': EBAY_STORE,
        '/*FAVICON*/': svg_uri(mark),
        '<!--ROBOTS-->': '' if golive else '<meta name="robots" content="noindex, nofollow">',
    }
    if WHATSAPP:
        rep['/*WA_LINK*/'] = f'https://wa.me/{WHATSAPP}?text=' + 'Hi%20Backswing%20Golf%2C%20'
        rep['/*TEL_LINK*/'] = 'tel:+' + WHATSAPP
    else:
        rep['/*WA_LINK*/'] = '#/contact'
        rep['/*TEL_LINK*/'] = '#/contact'
    for k, v in rep.items():
        html = html.replace(k, v)
    html = html.replace('<html lang="en-GB">', f'<html lang="en-GB" data-scheme="{SCHEME}">')
    if not WHATSAPP:
        if preview:
            # show where it goes, highlighted, until the number arrives
            html = html.replace('class="wa-pin"', 'class="wa-pin ph" title="WhatsApp number to come"')
        else:
            html = re.sub(r'<a class="wa-pin".*?</a>\n', '', html, flags=re.S)
            html = re.sub(r'<nav class="mbar".*?</nav>\n', '', html, flags=re.S)
    if not preview:
        # placeholders stay in the wording but lose the highlight
        html = re.sub(r'\s?class="ph"', '', html)
        html = html.replace(' ph"', '"')
    return html

def main():
    args = sys.argv[1:]
    with open(os.path.join(HERE, 'site.html'), 'w', encoding='utf-8') as f:
        f.write(build(preview=True))
    print('site.html', os.path.getsize(os.path.join(HERE, 'site.html')) // 1024, 'KB')
    if 'live' in args:
        out = os.path.join(HERE, 'live'); shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
        golive = 'golive' in args
        with open(os.path.join(out, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(build(preview=False, golive=golive))
        open(os.path.join(out, '.nojekyll'), 'w').close()
        with open(os.path.join(out, 'robots.txt'), 'w') as f:
            f.write('User-agent: *\n' + ('Allow: /\n' if golive else 'Disallow: /\n'))
        if golive:
            with open(os.path.join(out, 'CNAME'), 'w') as f:
                f.write(DOMAIN + '\n')
        print('live/ written', '(go-live)' if golive else '(noindex test copy)')

if __name__ == '__main__':
    main()
