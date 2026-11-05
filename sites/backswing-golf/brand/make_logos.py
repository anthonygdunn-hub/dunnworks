"""Backswing Golf logo generator: three directions, every glyph outlined to paths,
so the SVGs need no fonts installed anywhere.

  python3 make_logos.py  -> brand/logos/*.svg  + brand/logo-board.html
"""
import math, os, glob
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(HERE, '..', 'fonts')
OUT = os.path.join(HERE, 'logos')
os.makedirs(OUT, exist_ok=True)

INK, TURF, FLAG, MIST, PAPER = '#1E2328', '#1F5C45', '#FFC629', '#EDF0EE', '#FAFAF7'

_cache = {}
def font(fam, w, style='normal'):
    p = os.path.join(FONTS_DIR, f'{fam}-latin-{w}-{style}.woff2')
    if p not in _cache:
        _cache[p] = TTFont(p)
    return _cache[p]

def glyph(f, ch):
    cmap = f.getBestCmap()
    return cmap[ord(ch)]

def text_paths(f, text, size, x, y, track=0.0, skew=0.0, anchor='start'):
    """Outline `text` at baseline (x,y). track in em. Returns (path_d, width)."""
    gs = f.getGlyphSet(); upm = f['head'].unitsPerEm; hmtx = f['hmtx']
    s = size / upm
    names = [glyph(f, c) for c in text]
    adv = [hmtx[n][0] * s + track * size for n in names]
    width = sum(adv) - track * size
    if anchor == 'middle': x -= width / 2
    elif anchor == 'end': x -= width
    d = []
    cx = x
    for n, a in zip(names, adv):
        pen = SVGPathPen(gs)
        # flip y, apply italic skew around baseline
        t = TransformPen(pen, (s, 0, -s * skew, -s, cx, y))
        gs[n].draw(t)
        d.append(pen.getCommands())
        cx += a
    return ' '.join(d), width

def arc_text(f, text, size, cx, cy, r, center_deg, track=0.0, outside=True):
    """Glyphs set along a circle. center_deg: 0 = top. outside=True reads clockwise on top."""
    gs = f.getGlyphSet(); upm = f['head'].unitsPerEm; hmtx = f['hmtx']
    s = size / upm
    names = [glyph(f, c) for c in text]
    adv = [hmtx[n][0] * s + track * size for n in names]
    total = sum(adv) - track * size
    ang_total = total / r
    out = []
    pos = -total / 2
    for n, a in zip(names, adv):
        mid = pos + (a - track * size) / 2
        theta = (mid / r) if outside else -(mid / r)
        base = math.radians(center_deg) + theta
        # glyph centre point on circle
        gx = cx + r * math.sin(base); gy = cy - r * math.cos(base)
        rot = base if outside else base + math.pi
        gw = (a - track * size)
        pen = SVGPathPen(gs)
        c, sn = math.cos(rot), math.sin(rot)
        # local glyph coords: x in [-gw/2, gw/2], baseline at 0, y up
        # map (u,v) -> (gx + c*(u*s - gw/2) - sn*(-v*s) , ...)
        a11, a12 = c * s, sn * s
        a21, a22 = sn * s, -c * s
        tx = gx + c * (-gw / 2)
        ty = gy + sn * (-gw / 2)
        if not outside:
            # bottom text reads left-to-right, upright: baseline sits on the circle, letters inward
            pass
        t = TransformPen(pen, (a11, a21, -a12 * -1 if False else a12 * 1, a22, tx, ty))
        # compose properly: x' = tx + c*u*s - sn*(-v*s)... use matrix (xx,xy,yx,yy)
        pen = SVGPathPen(gs)
        t = TransformPen(pen, (c * s, sn * s, sn * s, -c * s, tx, ty))
        gs[n].draw(t)
        out.append(pen.getCommands())
        pos += a
    return ' '.join(out)

def svg(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{rect}{body}</svg>'

def save(name, s):
    with open(os.path.join(OUT, name), 'w') as fh:
        fh.write(s)

# ---------------------------------------------------------------- A: modern
# Mark: the backswing itself, set in a solid disc so it reads at any size. A thick
# yellow arc traced by the clubhead round the back of the swing, the ball at address.
# Wordmark heavy lowercase; GOLF in a yellow tag.
def mark_a(x, y, r, disc, arc, ball):
    def pt(deg, rr):
        a = math.radians(deg)
        return x + rr * math.sin(a), y - rr * math.cos(a)
    ra = r * 0.6; sw = r * 0.2
    pts = [pt(d, ra) for d in range(196, 414, 3)]
    d = 'M' + ' L'.join(f'{px:.1f} {py:.1f}' for px, py in pts)
    bx, by = pt(180, ra)
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="{disc}"/>'
            f'<path d="{d}" fill="none" stroke="{arc}" stroke-width="{sw:.1f}" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<circle cx="{bx:.1f}" cy="{by:.1f}" r="{sw*0.78:.1f}" fill="{ball}"/>')

def logo_a(ink, disc, arc, ball, tagbg, tagfg, h=200):
    f = font('barlow', 800)
    fs = font('barlow', 700)
    word, ww = text_paths(f, 'backswing', 128, 214, 122, track=-0.025)
    tag, tw = text_paths(fs, 'GOLF', 30, 0, 0, track=0.3)
    tx, ty = 220, 142
    tag, tw = text_paths(fs, 'GOLF', 30, tx + 14, ty + 31, track=0.3)
    pill = f'<rect x="{tx}" y="{ty}" width="{tw + 28:.0f}" height="42" rx="6" fill="{tagbg}"/>'
    w = int(214 + ww + 16)
    return svg(w, h, mark_a(96, 100, 92, disc, arc, ball) +
               f'<path d="{word}" fill="{ink}"/>' + pill + f'<path d="{tag}" fill="{tagfg}"/>')

def mark_only_a(disc, arc, ball, bg=None):
    return svg(200, 200, mark_a(100, 100, 96, disc, arc, ball), bg)

# ---------------------------------------------------------------- B: heritage
# Roundel: name around the top, what they do around the bottom, crossed irons
# and a BG monogram in the middle. Serif for the name, Barlow for the small print.
def irons(cx, cy, col):
    out = []
    for sgn in (-1, 1):
        rot = 32 * sgn
        out.append(
            f'<g transform="rotate({rot} {cx} {cy})">'
            f'<rect x="{cx-3}" y="{cy-92}" width="6" height="168" rx="3" fill="{col}"/>'
            f'<rect x="{cx-5}" y="{cy-96}" width="10" height="40" rx="4" fill="{col}"/>'
            f'<path d="M{cx-3} {cy+70} L{cx+3} {cy+70} L{cx+3+16*sgn*-1 if False else cx+3} {cy+92} '
            f'Q{cx-24*sgn} {cy+104} {cx-34*sgn} {cy+90} L{cx-3} {cy+70}Z" fill="{col}"/>'
            f'</g>')
    return ''.join(out)

def logo_b(ring, fill, ink, accent, size=400):
    c = size / 2
    serif = font('dm-serif-display', 400)
    small = font('barlow', 700)
    top = arc_text(serif, "BACKSWING", 52, c, c, 144, 0, track=0.08, outside=True)
    bottom = arc_text(small, 'PRE-LOVED GOLF CLUBS', 22, c, c, 168, 180, track=0.22, outside=False)
    mono, _ = text_paths(serif, 'BG', 74, c, c + 26, anchor='middle')
    body = (
        f'<circle cx="{c}" cy="{c}" r="{c-6}" fill="{fill}"/>'
        f'<circle cx="{c}" cy="{c}" r="{c-8}" fill="none" stroke="{ring}" stroke-width="12"/>'
        f'<circle cx="{c}" cy="{c}" r="{c-22}" fill="none" stroke="{ring}" stroke-width="2"/>'
        f'<circle cx="{c}" cy="{c}" r="{c-66}" fill="none" stroke="{ring}" stroke-width="2.5"/>'
        f'<path d="{top}" fill="{ink}"/>'
        f'<path d="{bottom}" fill="{ink}"/>'
        f'<circle cx="{c-150}" cy="{c+12}" r="6" fill="{accent}"/><circle cx="{c+150}" cy="{c+12}" r="6" fill="{accent}"/>'
        f'<g opacity="1">{irons(c, c+2, accent)}</g>'
        f'<circle cx="{c}" cy="{c}" r="60" fill="{fill}" stroke="{ring}" stroke-width="5"/>'
        f'<path d="{mono}" fill="{ink}"/>'
    )
    return svg(size, size, body)

# ---------------------------------------------------------------- C: sporty
# Heavy condensed italic, the yellow pin flag cutting in from the left like a
# speed mark. Built for a shirt, a van, an Instagram square.
def logo_c(ink, flag, sub, w=820, h=220):
    f = font('barlow-condensed', 800, 'italic')
    fs = font('barlow-condensed', 600, 'italic')
    word, ww = text_paths(f, 'BACKSWING', 160, 150, 152, track=0.0)
    tag, _ = text_paths(font('barlow-condensed', 800, 'italic'), 'GOLF  /  USED & EX-DEMO CLUBS', 32, 160, 210, track=0.1)
    flagd = (f'<path d="M38 18 L60 18 L48 168 L26 168 Z" fill="{ink}"/>'
             f'<path d="M60 18 L142 44 L54 86 Z" fill="{flag}"/>'
             f'<path d="M14 172 L72 172 L68 186 L10 186 Z" fill="{flag}"/>')
    stripe = f'<path d="M162 168 L{150 + ww - 6:.0f} 168 L{146 + ww - 6:.0f} 176 L158 176 Z" fill="{flag}"/>'
    return svg(int(150 + ww + 20), h + 14, flagd + f'<path d="{word}" fill="{ink}"/>' + stripe + f'<path d="{tag}" fill="{sub}"/>')

def mark_only_c(ink, flag, bg=None):
    return svg(200, 200,
               f'<g transform="translate(36 6)"><path d="M38 18 L60 18 L48 168 L26 168 Z" fill="{ink}"/>'
               f'<path d="M60 18 L142 44 L54 86 Z" fill="{flag}"/>'
               f'<path d="M14 172 L72 172 L68 186 L10 186 Z" fill="{flag}"/></g>', bg)

files = {
    'a-modern-light.svg':  logo_a(INK, TURF, FLAG, PAPER, FLAG, INK),
    'a-modern-dark.svg':   logo_a(PAPER, TURF, FLAG, PAPER, FLAG, INK),
    'a-mark-light.svg':    mark_only_a(TURF, FLAG, PAPER),
    'a-mark-dark.svg':     mark_only_a(TURF, FLAG, PAPER, INK),
    'b-heritage-light.svg': logo_b(FLAG, TURF, PAPER, FLAG),
    'b-heritage-dark.svg':  logo_b(FLAG, TURF, PAPER, FLAG),
    'c-sporty-light.svg':  logo_c(INK, FLAG, TURF),
    'c-sporty-dark.svg':   logo_c(PAPER, FLAG, FLAG),
    'c-mark-light.svg':    mark_only_c(INK, FLAG),
    'c-mark-dark.svg':     mark_only_c(PAPER, FLAG, INK),
}
for k, v in files.items():
    save(k, v)
print('wrote', len(files), 'logos to', OUT)
