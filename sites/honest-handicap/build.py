"""Build Honest Handicap: src/index.html + brand/ -> site/index.html (one file, no dependencies)."""
import base64, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "src", "index.html")).read()


def svg_inline(path, label, cls=""):
    s = open(os.path.join(HERE, "brand", path)).read()
    s = re.sub(r'\swidth="[\d.]+" height="[\d.]+"', "", s, count=1)
    return s.replace("<svg ", f'<svg role="img" aria-label="{label}"{" class=" + chr(34) + cls + chr(34) if cls else ""} ', 1).strip()


def ph(t):
    """Placeholder text: shown with a dashed pink underline until the real words arrive."""
    return re.sub(r"(\[[^\]]+\])", r'<span class="ph">\1</span>', t)


FLAG = ('<svg viewBox="0 0 22 30" aria-hidden="true"><line x1="3" y1="2" x2="3" y2="30" stroke="#fff" stroke-width="2"/>'
        '<path class="flag-wave" d="M4 3 L20 8 L4 14 Z" fill="#FF2E9A"/><ellipse cx="3" cy="29" rx="3" ry="1" fill="#19D3FF"/></svg>')
CIRCLE = '<svg viewBox="0 0 58 50" aria-hidden="true"><ellipse cx="29" cy="25" rx="26" ry="21" pathLength="100" transform="rotate(-8 29 25)"/></svg>'
CUP = ('<span class="cupball" aria-hidden="true"><svg viewBox="0 0 22 22"><ellipse cx="11" cy="18" rx="9" ry="3" fill="#05051a" opacity=".6"/>'
       '<circle class="b" cx="11" cy="10" r="5" fill="#fff"/></svg></span>')
TEE = ('<svg class="tee" viewBox="0 0 40 52" overflow="visible" aria-hidden="true"><g class="chip" style="transform-box:fill-box;transform-origin:center"><circle cx="20" cy="13" r="12" fill="#fff"/>'
       '<g fill="#d5d7ee"><circle cx="15" cy="9" r="1.4"/><circle cx="21" cy="7" r="1.4"/><circle cx="26" cy="11" r="1.4"/><circle cx="17" cy="15" r="1.4"/><circle cx="23" cy="16" r="1.4"/></g></g>'
       '<path d="M12 25 h16 l-6 6 v18 h-4 v-18 z" fill="#FF2E9A"/></svg>')

KIT = [  # slug, name, icon path(s)
    ("drivers", "Drivers &amp; woods", '<path d="M24 3 L13 25"/><path d="M5 26 c-1 5 2 6 7 6 h7 c4 0 4-4 1-6 z"/>'),
    ("irons", "Irons &amp; hybrids", '<path d="M24 3 L15 24"/><path d="M8 24 h11 l2 7 h-15 z"/>'),
    ("wedges", "Wedges", '<path d="M24 3 L15 23"/><path d="M8 22 l12 1 l1 9 l-14 -2 z"/>'),
    ("putters", "Putters", '<path d="M20 3 L18 26"/><path d="M7 26 h17 v5 h-17 z"/>'),
    ("balls", "Balls", '<circle cx="17" cy="17" r="12"/><path d="M12 13h.01M18 11h.01M22 16h.01M14 19h.01M19 22h.01"/>'),
    ("grips", "Grips", '<rect x="12" y="3" width="10" height="28" rx="4"/><path d="M12 9h10M12 15h10M12 21h10"/>'),
    ("shoes", "Shoes", '<path d="M4 24 c0-6 2-12 5-12 c3 0 4 4 8 5 l10 3 c3 1 4 3 4 6 v2 h-27 z"/><path d="M8 32 h2M14 32 h2M20 32 h2M26 32 h2"/>'),
    ("bags", "Bags &amp; trolleys", '<rect x="10" y="9" width="12" height="20" rx="3"/><path d="M12 9 V3 M16 9 V2 M20 9 V4"/><circle cx="9" cy="31" r="2"/><circle cx="25" cy="31" r="2"/><path d="M22 14 L29 30"/>'),
    ("tech", "Rangefinders &amp; tech", '<rect x="4" y="11" width="22" height="14" rx="3"/><circle cx="26" cy="18" r="4"/><path d="M9 11 V8 h6 v3"/>'),
    ("clothing", "Clothing", '<path d="M11 4 l-7 5 l3 6 l4-2 v17 h12 v-17 l4 2 l3-6 l-7-5 c-1 3-3 4-6 4 s-5-1-6-4 z"/>'),
]
CATNAME = {k: re.sub("&amp;", "&", n) for k, n, _ in KIT}

REVIEWS = [  # category, title (placeholders in brackets), tester handicap placeholder, score placeholder
    ("grips", "[Brand] [Model] wet-weather grip", "[14]", "8"),
    ("shoes", "[Brand] [Model] waterproof golf shoe", "[21]", "7"),
    ("bags", "[Brand] [Model] compact electric trolley", "[9]", "9"),
    ("clothing", "[Brand] [Model] winter golf glove", "[17]", "6"),
    ("tech", "[Brand] [Model] rangefinder", "[12]", "8"),
    ("clothing", "[Brand] [Model] quiet waterproof jacket", "[24]", "7"),
    ("balls", "[Brand] [Model] ball for mid-handicappers", "[18]", "8"),
    ("grips", "Midsize or standard grips? Tested", "[11]", "–"),
    ("bags", "[Brand] [Model] lightweight stand bag", "[15]", "9"),
    ("drivers", "Ex-demo [Brand] [Model] driver", "[8]", "7"),
]


def card(r):
    cat, title, hc, score = r
    sc = f'<span class="ph" style="border:0">{score}</span>' if score != "–" else "–"
    return (f'<a class="rcard" href="#/review/sample" data-cat="{cat}"><div class="pic">[Product photo]{TEE}</div>'
            f'<div class="bd"><div class="cat">{CATNAME[cat].upper()}</div><h3>{ph(title)}</h3>'
            f'<div class="meta"><span>Tested by <span class="ph">[Tester]</span>, {ph(hc)} handicap</span>'
            f'<span class="verdict">{CIRCLE}{sc}</span></div></div></a>')


STEPS = "".join(
    f'<div class="step"><div class="n">{n}</div><h3>{h}</h3><p>{p}</p></div>'
    for n, h, p in [
        ("01", "Real rounds", "At least three rounds, or two plus a range session, before anyone gives a verdict."),
        ("02", "The same card", "Every tester scores performance, feel, build and value, and says whether they'd buy it again with their own money."),
        ("03", "Nothing hidden", "Free or loaned kit is declared at the top of the review, and the verdict is always the tester's own."),
    ])

TESTERS = "".join(
    '<div class="tester"><div class="av">?</div><h3 style="font-size:24px;text-transform:none"><span class="ph">[First name]</span></h3>'
    '<div class="hc"><span class="ph">[Handicap]</span> · <span class="ph">[Home course]</span></div>'
    '<p style="color:var(--txt2);font-size:15px"><span class="ph">[What they play, and what they\'re hard on]</span></p></div>'
    for _ in range(6))

# a ragged fringe of grass along the top of the footer
blades, x, seed = [], 0, 7
while x < 1200:
    seed = (seed * 1103515245 + 12345) % 2**31
    h = 6 + seed % 14
    blades.append(f"L{x} 22 L{x + 3} {22 - h} L{x + 6} 22")
    x += 7

ICON = open(os.path.join(HERE, "brand", "icon.svg")).read()
out = (src
       .replace("{{FAVICON}}", "data:image/svg+xml;base64," + base64.b64encode(ICON.encode()).decode())
       .replace("{{LOGO}}", svg_inline("logo-dark.svg", "Honest Handicap"))
       .replace("{{LOGOFOOT}}", svg_inline("logo-dark.svg", "Honest Handicap", "lg"))
       .replace("{{FLAG}}", FLAG).replace("{{CIRCLE}}", CIRCLE).replace("{{CUP}}", CUP)
       .replace("{{CARDS3}}", "".join(card(r) for r in REVIEWS[:3]))
       .replace("{{CARDSALL}}", "".join(card(r) for r in REVIEWS))
       .replace("{{KIT}}", "".join(f'<a href="#/reviews/{k}"><svg viewBox="0 0 34 34" aria-hidden="true">{i}</svg>{n}</a>' for k, n, i in KIT))
       .replace("{{FILTERS}}", '<a href="#/reviews" data-cat="all"><svg viewBox="0 0 34 34" aria-hidden="true"><path d="M6 30 V4 M7 5 L28 11 L7 17"/></svg>Everything</a>'
                + "".join(f'<a href="#/reviews/{k}" data-cat="{k}"><svg viewBox="0 0 34 34" aria-hidden="true">{i}</svg>{n}</a>' for k, n, i in KIT))
       .replace("{{STEPS}}", STEPS).replace("{{TESTERS}}", TESTERS)
       .replace("{{CATOPTIONS}}", "".join(f"<option>{n}</option>" for _, n, _ in KIT))
       .replace("{{GRASS}}", " ".join(blades)))
left = re.findall(r"\{\{[A-Z0-9]+\}\}", out)
assert not left, left
os.makedirs(os.path.join(HERE, "site"), exist_ok=True)
open(os.path.join(HERE, "site", "index.html"), "w").write(out)
print("built site/index.html", len(out) // 1024, "KB")
