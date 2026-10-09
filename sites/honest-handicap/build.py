"""Build Honest Handicap.

    python3 build.py                 real pages from published reviews  -> site/
    python3 build.py --preview       the same pages as one locked-preview file -> preview.html
    python3 build.py --sample        use sample placeholder reviews and testers (for previewing the design)
    python3 build.py --data f.json   read {"reviews": [...], "testers": [...]} from a file instead of Supabase

Reviews and testers come from Supabase (hh_published_reviews / hh_public_testers, publishable key
only), so a review appears here only after it has been approved and published in the console.
Placeholders such as [Brand] show with a dashed pink underline and only ever appear with --sample.
site.json "live": false keeps every page noindex until go-live day.
"""
import base64, datetime, hashlib, html, io, json, os, re, shutil, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SRC, BRAND, OUT = (os.path.join(HERE, d) for d in ("src", "brand", "site"))
CFG = json.load(open(os.path.join(HERE, "site.json")))
BASE = CFG["base"].rstrip("/")
ARGS = sys.argv[1:]
PREVIEW, SAMPLE = "--preview" in ARGS, "--sample" in ARGS
TODAY = datetime.date.today()

e = lambda s: html.escape(str(s if s is not None else ""), quote=True)
read = lambda *p: open(os.path.join(*p), encoding="utf-8").read()


def ph(t):
    """Placeholder text: dashed pink underline until the real words arrive."""
    return re.sub(r"(\[[^\]]+\])", r'<span class="ph">\1</span>', t)


def svg_inline(path, label, cls=""):
    s = read(BRAND, path)
    s = re.sub(r'\swidth="[\d.]+" height="[\d.]+"', "", s, count=1)
    return s.replace("<svg ", f'<svg role="img" aria-label="{label}"{" class=" + chr(34) + cls + chr(34) if cls else ""} ', 1).strip()


def nicedate(d):
    d = datetime.date.fromisoformat(str(d)[:10])
    return f"{d.day} {d.strftime('%B %Y')}"


# ---------------------------------------------------------------- shared bits of markup
FLAG = ('<svg viewBox="0 0 22 30" aria-hidden="true"><line x1="3" y1="2" x2="3" y2="30" stroke="#fff" stroke-width="2"/>'
        '<path class="flag-wave" d="M4 3 L20 8 L4 14 Z" fill="#FF2E9A"/><ellipse cx="3" cy="29" rx="3" ry="1" fill="#19D3FF"/></svg>')
CIRCLE = '<svg viewBox="0 0 58 50" aria-hidden="true"><ellipse cx="29" cy="25" rx="26" ry="21" pathLength="100" transform="rotate(-8 29 25)"/></svg>'
CUP = ('<span class="cupball" aria-hidden="true"><svg viewBox="0 0 22 22"><ellipse cx="11" cy="18" rx="9" ry="3" fill="#05051a" opacity=".6"/>'
       '<circle class="b" cx="11" cy="10" r="5" fill="#fff"/></svg></span>')
TEE = ('<svg class="tee" viewBox="0 0 40 52" overflow="visible" aria-hidden="true"><g class="chip" style="transform-box:fill-box;transform-origin:center"><circle cx="20" cy="13" r="12" fill="#fff"/>'
       '<g fill="#d5d7ee"><circle cx="15" cy="9" r="1.4"/><circle cx="21" cy="7" r="1.4"/><circle cx="26" cy="11" r="1.4"/><circle cx="17" cy="15" r="1.4"/><circle cx="23" cy="16" r="1.4"/></g></g>'
       '<path d="M12 25 h16 l-6 6 v18 h-4 v-18 z" fill="#FF2E9A"/></svg>')

KIT = [  # slug, name, plural for page titles, icon path(s)
    ("drivers", "Drivers &amp; woods", "driver and fairway wood", '<path d="M24 3 L13 25"/><path d="M5 26 c-1 5 2 6 7 6 h7 c4 0 4-4 1-6 z"/>'),
    ("irons", "Irons &amp; hybrids", "iron and hybrid", '<path d="M24 3 L15 24"/><path d="M8 24 h11 l2 7 h-15 z"/>'),
    ("wedges", "Wedges", "wedge", '<path d="M24 3 L15 23"/><path d="M8 22 l12 1 l1 9 l-14 -2 z"/>'),
    ("putters", "Putters", "putter", '<path d="M20 3 L18 26"/><path d="M7 26 h17 v5 h-17 z"/>'),
    ("balls", "Balls", "golf ball", '<circle cx="17" cy="17" r="12"/><path d="M12 13h.01M18 11h.01M22 16h.01M14 19h.01M19 22h.01"/>'),
    ("grips", "Grips", "golf grip", '<rect x="12" y="3" width="10" height="28" rx="4"/><path d="M12 9h10M12 15h10M12 21h10"/>'),
    ("shoes", "Shoes", "golf shoe", '<path d="M4 24 c0-6 2-12 5-12 c3 0 4 4 8 5 l10 3 c3 1 4 3 4 6 v2 h-27 z"/><path d="M8 32 h2M14 32 h2M20 32 h2M26 32 h2"/>'),
    ("bags", "Bags &amp; trolleys", "golf bag and trolley", '<rect x="10" y="9" width="12" height="20" rx="3"/><path d="M12 9 V3 M16 9 V2 M20 9 V4"/><circle cx="9" cy="31" r="2"/><circle cx="25" cy="31" r="2"/><path d="M22 14 L29 30"/>'),
    ("tech", "Rangefinders &amp; tech", "rangefinder and golf tech", '<rect x="4" y="11" width="22" height="14" rx="3"/><circle cx="26" cy="18" r="4"/><path d="M9 11 V8 h6 v3"/>'),
    ("clothing", "Clothing", "golf clothing", '<path d="M11 4 l-7 5 l3 6 l4-2 v17 h12 v-17 l4 2 l3-6 l-7-5 c-1 3-3 4-6 4 s-5-1-6-4 z"/>'),
]
CAT = {k: {"name": n, "plain": n.replace("&amp;", "&"), "noun": noun, "icon": i} for k, n, noun, i in KIT}


def icon(cat, size=34):
    return f'<svg class="ic" viewBox="0 0 34 34" width="{size}" height="{size}" aria-hidden="true">{CAT[cat]["icon"]}</svg>'


STEPS = "".join(
    f'<div class="step"><div class="n">{n}</div><h3>{h}</h3><p>{p}</p></div>'
    for n, h, p in [
        ("01", "Real rounds", "At least three rounds, or two plus a range session, before anyone gives a verdict."),
        ("02", "The same card", "Every tester scores performance, feel, build and value, and says whether they'd buy it again with their own money."),
        ("03", "Nothing hidden", "Free or loaned kit is declared at the top of the review, and the verdict is always the tester's own."),
    ])

blades, x, seed = [], 0, 7  # a ragged fringe of grass along the top of the footer
while x < 1200:
    seed = (seed * 1103515245 + 12345) % 2**31
    h = 6 + seed % 14
    blades.append(f"L{x} 22 L{x + 3} {22 - h} L{x + 6} 22")
    x += 7
GRASS = " ".join(blades)


# ---------------------------------------------------------------- data
def fetch(fn):
    req = urllib.request.Request(f'{CFG["supabase"]}/rest/v1/rpc/{fn}', data=b"{}", method="POST",
                                 headers={"apikey": CFG["publishable_key"], "Authorization": f'Bearer {CFG["publishable_key"]}', "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def sample_data():
    rows = [
        ("grips", "[Brand] [Model] wet-weather grip", 14, 8), ("shoes", "[Brand] [Model] waterproof golf shoe", 21, 7),
        ("bags", "[Brand] [Model] compact electric trolley", 9, 9), ("clothing", "[Brand] [Model] winter golf glove", 17, 6),
        ("tech", "[Brand] [Model] rangefinder", 12, 8), ("balls", "[Brand] [Model] ball for mid-handicappers", 18, 8),
    ]
    out = []
    for i, (cat, prod, hc, sc) in enumerate(rows):
        out.append({"sample": True, "id": f"s{i}", "slug": f"sample-{cat}-{i}", "category": cat, "product": prod, "title": f"{prod} review",
                    "first_name": "[First name]", "handicap": f"[{hc}]", "course": "[Home course]", "source": "I bought it", "paid": "[£PRICE]",
                    "rounds": "[4 rounds, 1 range session]", "performance": sc, "feel": sc - 1, "build": min(10, sc + 1), "value": sc - 1, "overall": sc,
                    "again": True, "oneline": "[One-line verdict in the tester's words.]",
                    "writeup": "[The tester's write-up, in their own words: the conditions they played in, how it compared with what they had before, and anything that changed over the rounds.]\n\n[A second paragraph: what surprised them, and whether it made any difference to their scores or confidence.]",
                    "suits": "[Who it's right for]", "notsuits": "[Who should look elsewhere]", "annoyed": "[The honest gripe]",
                    "public_photos": [], "buy_links": [{"retailer": "[Retailer]", "url": "#", "price": "[£PRICE]"}], "prices_checked": str(TODAY),
                    "published_at": str(TODAY), "updated_at": str(TODAY), "tester_id": None})
    testers = [{"sample": True, "first_name": "[First name]", "handicap": "[Handicap]", "course": "[Home course]", "reviews": 0} for _ in range(6)]
    return out, testers


if "--data" in ARGS:
    D = json.load(open(ARGS[ARGS.index("--data") + 1]))
    REVIEWS, TESTERS = D.get("reviews", []), D.get("testers", [])
elif SAMPLE:
    REVIEWS, TESTERS = sample_data()
else:
    try:
        REVIEWS, TESTERS = fetch("hh_published_reviews"), fetch("hh_public_testers")
    except Exception as ex:  # the build must never publish an empty site by accident
        sys.exit(f"Could not read reviews from Supabase: {ex}")
REVIEWS = [r for r in REVIEWS if r.get("category") in CAT and r.get("slug")]

PHOTO_BASE = f'{CFG["supabase"]}/storage/v1/object/public/hh-public/'


def url_of(r):
    return f'/reviews/{r["category"]}/{r["slug"]}/'


def t(r, v):
    """Escaped text for a review field; placeholders only light up on sample data."""
    s = e(v)
    return ph(s) if r.get("sample") else s


def hcp(v):
    if v is None or v == "":
        return "?"
    try:
        n = float(v)
        return ("+" + f"{-n:g}") if n < 0 else f"{n:g}"
    except (TypeError, ValueError):
        return str(v)


# ---------------------------------------------------------------- photos
PHOTOS = {}  # review id -> [(full, thumb)] site paths


def get_photos():
    try:
        from PIL import Image, ImageOps
    except ImportError:
        Image = None
    for r in REVIEWS:
        out = []
        for i, p in enumerate(r.get("public_photos") or []):
            src = PHOTO_BASE + "/".join(urllib.request.quote(x) for x in p.split("/"))
            if PREVIEW:
                out.append((src, src)); continue
            rel = f'img/reviews/{r["category"]}/{r["slug"]}/{i + 1}'
            os.makedirs(os.path.join(OUT, os.path.dirname(rel)), exist_ok=True)
            try:
                raw = urllib.request.urlopen(src, timeout=60).read()
            except Exception as ex:
                print("  photo skipped:", p, ex); continue
            if Image:
                im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
                for suffix, w in (("", 1600), ("-sm", 700)):
                    c = im.copy(); c.thumbnail((w, w * 2))
                    c.save(os.path.join(OUT, rel + suffix + ".jpg"), "JPEG", quality=82, optimize=True, progressive=True)
                out.append(("/" + rel + ".jpg", "/" + rel + "-sm.jpg"))
            else:
                open(os.path.join(OUT, rel + ".jpg"), "wb").write(raw)
                out.append(("/" + rel + ".jpg", "/" + rel + ".jpg"))
        PHOTOS[r["id"]] = out


# ---------------------------------------------------------------- pieces
def card(r):
    pics = PHOTOS.get(r["id"]) or []
    pic = (f'<img src="{pics[0][1]}" alt="{e(r["product"])} in use, photographed by {e(r["first_name"])}" loading="lazy" decoding="async">' if pics
           else ('[Product photo]' if r.get("sample") else f'<span style="opacity:.5">{icon(r["category"], 64)}</span>'))
    return (f'<a class="rcard" href="{url_of(r)}" data-cat="{r["category"]}"><div class="pic">{pic}{TEE}</div>'
            f'<div class="bd"><div class="cat">{CAT[r["category"]]["plain"].upper()}</div><h3>{t(r, r["product"])}</h3>'
            f'<div class="meta"><span>Tested by {t(r, r["first_name"])}, {t(r, hcp(r["handicap"]))} handicap</span>'
            f'<span class="verdict" aria-label="Verdict {e(r["overall"])} out of 10">{CIRCLE}{e(r["overall"])}</span></div></div></a>')


def empty_reviews(cat=None):
    what = f'{CAT[cat]["noun"]} reviews' if cat else "reviews"
    return (f'<div class="empty rv-up">{icon(cat or "balls", 70)}<div style="flex:999 1 380px"><h3>No {what} on the card yet</h3>'
            '<p>Our testers are out on the course with the kit now, and nothing goes up until they\'ve played enough rounds to be honest about it. '
            'Got a handicap and an opinion? You could write the first one.</p></div>'
            '<a class="btn btn-pink btn-sm" href="/join/">Become a tester<span class="gb"></span></a></div>')


def cards(rows, cat=None):
    return "".join(card(r) for r in rows) if rows else empty_reviews(cat)


def filters(active):
    a = ' aria-current="page"'
    return ('<nav class="kit" style="margin-bottom:34px" aria-label="Kit categories">'
            f'<a href="/reviews/"{a if not active else ""}><svg viewBox="0 0 34 34" aria-hidden="true"><path d="M6 30 V4 M7 5 L28 11 L7 17"/></svg>Everything</a>'
            + "".join(f'<a href="/reviews/{k}/"{a if active == k else ""}>{icon(k)}{CAT[k]["name"]}</a>' for k in CAT) + "</nav>")


def testers_block():
    if not TESTERS:
        return ('<div class="empty">' + FLAG.replace('viewBox', 'style="width:44px" viewBox', 1) +
                '<div style="flex:999 1 380px"><h3>The first testers are teeing off</h3><p>We\'re signing up the first panel of testers now, starting with members of the '
                'Falkners Arms Golf Society in Hampshire. Their names, handicaps and home courses will appear here as their reviews go up.</p></div>'
                '<a class="btn btn-pink btn-sm" href="/join/">Become a tester<span class="gb"></span></a></div>')
    out = []
    for p in TESTERS:
        smp = p.get("sample")
        f = (lambda v: ph(e(v))) if smp else e
        n = int(p.get("reviews") or 0)
        initial = "?" if smp else e(str(p["first_name"])[:1].upper())
        count = "" if smp else f'<p class="count">{n} review{"" if n == 1 else "s"} published</p>' if n else '<p class="count">First review on its way</p>'
        out.append(f'<div class="tester"><div class="av">{initial}</div><h3 style="font-size:24px;text-transform:none">{f(p["first_name"])}</h3>'
                   f'<div class="hc">{f(hcp(p["handicap"]) if not smp else p["handicap"])} handicap · {f(p.get("course") or "")}</div>{count}</div>')
    return '<div class="testers">' + "".join(out) + "</div>"


def bar(label, v):
    return (f'<div class="bar"><b>{label}</b><span class="track"><span class="fill" style="--w:{int(v) * 10}%"></span></span>'
            f'<span>{e(v)}</span></div>')


def declare(r):
    src, paid = (r.get("source") or "").lower(), r.get("paid")
    if "loan" in src:
        return '<p class="declare loan">Loaned to the tester by the brand. The brand hasn\'t seen this review and the verdict is the tester\'s own.</p>'
    if "free" in src:
        return '<p class="declare loan">Given to the tester free by the brand. The brand hasn\'t seen this review and the verdict is the tester\'s own.</p>'
    if "gift" in src:
        return '<p class="declare">A gift to the tester. Nobody paid for this review.</p>'
    return f'<p class="declare">Bought by the tester{" for " + t(r, paid) if paid else ""} with their own money. Nobody paid for this review.</p>'


PARTNER = {
    "grips": ("Want these fitted?", "Coastal Golf Co regrips from £8 a club, collected from your door from Cranleigh to the coast.", "https://www.coastalgolfco.co.uk/services/regrips/", "Book a regrip"),
    "_clubs": ("New clubs?", "Have them checked, fitted and regripped by Coastal Golf Co, collected from your door from Cranleigh to the coast.", "https://www.coastalgolfco.co.uk/", "Visit Coastal Golf Co"),
}


def review_page(r):
    cat, pics = r["category"], PHOTOS.get(r["id"]) or []
    paras = [p.strip() for p in re.split(r"\n\s*\n|\r\n\s*\r\n", r.get("writeup") or "") if p.strip()]
    three = [(lbl, col, r.get(k)) for lbl, col, k in (("SUITS", "var(--cyan)", "suits"), ("DOESN'T SUIT", "var(--txt3)", "notsuits"), ("ONE THING THAT ANNOYED ME", "var(--pink)", "annoyed")) if r.get(k)]
    p = PARTNER["grips"] if cat == "grips" else PARTNER["_clubs"] if cat in ("drivers", "irons", "wedges", "putters") else None
    links = r.get("buy_links") or []
    more = [x for x in REVIEWS if x["category"] == cat and x["id"] != r["id"]][:5]
    buy = ""
    if links:
        rows = []
        for i, l in enumerate(links[:3]):
            rows.append(('<div style="height:1px;background:var(--line)"></div>' if i else "") +
                        f'<div class="price"><span style="font-weight:600">{t(r, l.get("retailer"))}</span><span class="p">{t(r, l.get("price") or "")}</span></div>'
                        f'<a class="btn {"btn-pink" if i == 0 else "btn-line"} buy" href="{e(l.get("url"))}" rel="sponsored noopener" target="_blank">Buy now (Ad){CUP}</a>')
        checked = f'Prices checked {nicedate(r["prices_checked"])}. ' if r.get("prices_checked") else ""
        buy = (f'<div class="box"><div class="eyebrow" style="font-size:12px">Where to buy</div>{"".join(rows)}'
               f'<p class="small">{checked}These are affiliate links: we earn a commission if you buy through them, at no extra cost to you. It never changes the score. <a href="/affiliate-disclosure/">More</a></p></div>')
    morebox = (f'<div class="box more"><div class="eyebrow" style="font-size:12px">More {CAT[cat]["noun"]} reviews</div>'
               + "".join(f'<a href="{url_of(x)}"><span>{t(x, x["product"])}</span><b>{e(x["overall"])}</b></a>' for x in more)
               + f'<a href="/reviews/{cat}/"><span>All {CAT[cat]["plain"].lower()}</span><b>→</b></a></div>')
    gallery = ""
    if pics:
        gallery = '<div class="gallery">' + "".join(
            f'<a href="{full}" target="_blank" rel="noopener"><img src="{th}" alt="{e(r["product"])}, photo {i + 1} by {e(r["first_name"])}" loading="{"eager" if i == 0 else "lazy"}" decoding="async"></a>'
            for i, (full, th) in enumerate(pics)) + "</div>"
    elif r.get("sample"):
        gallery = '<div class="photo"><span>[Tester\'s photo of the kit in use]</span></div>'
    return f'''<div class="wrap">
<div class="rv">
<article>
<div class="crumbs"><a href="/reviews/">Reviews</a> › <a href="/reviews/{cat}/">{CAT[cat]["name"]}</a> › {t(r, r["product"])}</div>
<h1>{t(r, r["product"])} review</h1>
<p class="lede">{t(r, r.get("oneline"))}</p>
<div class="card5 rv-up">
<div class="r h"><div>Tester</div><div>Handicap</div><div>Home course</div><div>Rounds played</div><div class="vbox" style="justify-content:center">Verdict</div></div>
<div class="r b"><div>{t(r, r["first_name"])}</div><div>{t(r, hcp(r.get("handicap")))}</div><div>{t(r, r.get("course") or "–")}</div><div>{t(r, r.get("rounds") or "–")}</div><div class="vbox"><span class="verdict big" aria-label="Verdict {e(r["overall"])} out of 10">{CIRCLE}{e(r["overall"])}</span></div></div>
</div>
{declare(r)}
<p class="small" style="font-family:var(--mono)">Published {nicedate(r["published_at"])}</p>
{gallery}
<section class="rv-up" style="display:flex;flex-direction:column;gap:14px">
<h2 style="font-size:34px">The scores</h2>
<div class="bars">{bar("Performance", r["performance"])}{bar("Feel", r["feel"])}{bar("Build quality", r["build"])}{bar("Value", r["value"])}</div>
<div class="again"><strong>Buy it again with my own money?</strong>{"Yes" if r.get("again") else "No"}</div>
</section>
<section class="writeup" style="display:flex;flex-direction:column;gap:14px">
<h2 style="font-size:34px">How it played</h2>
{"".join(f"<p>{t(r, x)}</p>" for x in paras)}
</section>
{('<section class="three">' + "".join(f'<div style="border-top-color:{c}"><div class="l" style="color:{c}">{l}</div>{t(r, v)}</div>' for l, c, v in three) + "</section>") if three else ""}
{f'<div class="partner"><div class="t"><div class="eyebrow" style="font-size:12px;margin-bottom:6px">{p[0]}</div>{p[1]}</div><a class="btn btn-line btn-sm" href="{p[2]}" target="_blank" rel="noopener">{p[3]}<span class="gb"></span></a></div>' if p else ""}
</article>
<aside aria-label="Where to buy and more reviews">
{buy}
{morebox}
</aside>
</div>
</div>'''


def review_jsonld(r):
    pics = PHOTOS.get(r["id"]) or []
    img = [BASE + x[0] if x[0].startswith("/") else x[0] for x in pics]
    return [{
        "@context": "https://schema.org", "@type": "Product", "name": r["product"],
        **({"image": img} if img else {}),
        "category": CAT[r["category"]]["plain"],
        "review": {
            "@type": "Review", "name": r.get("title") or f'{r["product"]} review',
            "author": {"@type": "Person", "name": r["first_name"]},
            "publisher": {"@type": "Organization", "name": "Honest Handicap", "url": BASE + "/"},
            "datePublished": str(r["published_at"])[:10],
            "reviewRating": {"@type": "Rating", "ratingValue": r["overall"], "bestRating": 10, "worstRating": 1},
            "reviewBody": r.get("oneline") or "",
        },
    }, {
        "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Reviews", "item": BASE + "/reviews/"},
            {"@type": "ListItem", "position": 2, "name": CAT[r["category"]]["plain"], "item": f'{BASE}/reviews/{r["category"]}/'},
            {"@type": "ListItem", "position": 3, "name": r["product"], "item": BASE + url_of(r)},
        ]}]


# ---------------------------------------------------------------- pages
def fill(body):
    aff = CFG.get("affiliates") or []
    return (body.replace("{{FLAG}}", FLAG).replace("{{CIRCLE}}", CIRCLE).replace("{{CUP}}", CUP).replace("{{STEPS}}", STEPS)
            .replace("{{CARDS3}}", cards(REVIEWS[:3]))
            .replace("{{KIT}}", "".join(f'<a href="/reviews/{k}/">{icon(k)}{CAT[k]["name"]}</a>' for k in CAT))
            .replace("{{TESTERS}}", testers_block())
            .replace("{{CATOPTIONS}}", "".join(f'<option value="{k}">{CAT[k]["name"]}</option>' for k in CAT))
            .replace("{{AFFILIATES}}", ("We currently earn from: " + ", ".join(e(a) for a in aff) + ".") if aff else
                     "We haven't joined any affiliate programmes yet, so nothing on the site earns us a penny at the moment. This list will be updated as soon as that changes.")
            .replace("{{UPDATED}}", nicedate(TODAY)))


PAGES = []


def add(path, page, title, desc, body, index=True, jsonld=None, ogimage=None, ogtype="website", lastmod=None, cur=None):
    PAGES.append(dict(path=path, page=page, title=title, desc=desc, body=fill(body), index=index and not any(r.get("sample") for r in REVIEWS),
                      jsonld=jsonld or [], ogimage=ogimage, ogtype=ogtype, lastmod=lastmod or str(TODAY), cur=cur or page))


latest = max([str(r.get("updated_at") or r["published_at"])[:10] for r in REVIEWS] or [str(TODAY)])
add("/", "home", "Honest Handicap | Golf kit, tested by golfers like you",
    "Golf kit reviews written by real club golfers after real rounds, with their handicap on the card. No lab, no tour pro, no hype.",
    read(SRC, "pages", "home.html"), lastmod=latest,
    jsonld=[{"@context": "https://schema.org", "@type": "WebSite", "name": "Honest Handicap", "url": BASE + "/"},
            {"@context": "https://schema.org", "@type": "Organization", "name": "Honest Handicap", "url": BASE + "/", "logo": BASE + "/apple-touch-icon.png",
             "email": "hello@honesthandicap.golf"}])

head = lambda eyebrow, h2, sub: (f'<div class="shead"><div><div class="hole">{FLAG}<span class="eyebrow">{eyebrow}</span></div><h2>{h2}</h2>'
                                 f'<p class="sub">{sub}</p></div></div>')
add("/reviews/", "reviews", "Golf kit reviews by real club golfers | Honest Handicap",
    "Every Honest Handicap review: drivers, irons, putters, balls, grips, shoes, bags, rangefinders and clothing, each tested by a club golfer with their handicap on the card.",
    f'<section class="s" style="padding-top:44px"><div class="wrap">{head("The full card", "All reviews", "Every verdict from every tester. Pick a category to narrow it down.")}'
    f'{filters(None)}<div class="cards">{cards(REVIEWS)}</div></div></section>', index=True, lastmod=latest, cur="reviews")

for k in CAT:
    rows = [r for r in REVIEWS if r["category"] == k]
    noun = CAT[k]["noun"]
    add(f"/reviews/{k}/", "reviews", f'{noun[0].upper() + noun[1:]} reviews by club golfers | Honest Handicap',
        f'Honest {noun} reviews from real club golfers, with each tester\'s handicap, home course and rounds played on the card.',
        f'<section class="s" style="padding-top:44px"><div class="wrap">{head("The full card", noun[0].upper() + noun[1:] + " reviews", f"Every {noun} our testers have played with, scored on the same card.")}'
        f'{filters(k)}<div class="cards">{cards(rows, k)}</div></div></section>',
        index=bool(rows), lastmod=max([str(r.get("updated_at") or r["published_at"])[:10] for r in rows] or [str(TODAY)]), cur="reviews")

for r in REVIEWS:
    add(url_of(r), "review", f'{r.get("title") or r["product"] + " review"}: tested by a {hcp(r.get("handicap"))} handicapper | Honest Handicap',
        (f'{r["first_name"]} ({hcp(r.get("handicap"))} handicap) played {r.get("rounds") or "real rounds"} with the {r["product"]} and gave it {r["overall"]}/10. '
         + (r.get("oneline") or ""))[:300],
        "{{REVIEW:" + r["id"] + "}}", ogtype="article", lastmod=str(r.get("updated_at") or r["published_at"])[:10], cur="reviews")

for slug, page, title, desc, idx in [
    ("how-we-test", "how-we-test", "How we test golf kit | Honest Handicap", "Every Honest Handicap tester fills in the same scorecard after real rounds: performance, feel, build, value and whether they'd buy it again.", True),
    ("testers", "testers", "The testers | Honest Handicap", "Meet the club golfers behind Honest Handicap's reviews, with their handicaps and home courses.", True),
    ("join", "join", "Become a golf kit tester | Honest Handicap", "Play at least twice a month and happy to tell the truth about your kit? Join the Honest Handicap testers.", True),
    ("submit", "submit", "Hand in a review card | Honest Handicap", "For Honest Handicap testers: hand in your review card.", False),
    ("about", "about", "About | Honest Handicap", "Honest Handicap is golf kit reviews by club golfers, started by society golfers in Hampshire.", True),
    ("affiliate-disclosure", "disclosure", "Affiliate disclosure | Honest Handicap", "How Honest Handicap makes money from affiliate links marked (Ad), and why it never changes a score.", True),
    ("privacy", "privacy", "Privacy and cookies | Honest Handicap", "What Honest Handicap collects, why, and your rights.", True),
]:
    add(f"/{slug}/", page, title, desc, read(SRC, "pages", page + ".html"), index=idx, cur=page)
add("/404.html", "lost", "Lost ball | Honest Handicap", "That page is in the rough.", read(SRC, "pages", "lost.html"), index=False)


# ---------------------------------------------------------------- render
LAYOUT = read(SRC, "layout.html")
CSS, JS = read(SRC, "site.css"), read(SRC, "site.js")
ICON = read(BRAND, "icon.svg")
LOGO, LOGOFOOT = svg_inline("logo-dark.svg", "Honest Handicap"), svg_inline("logo-dark.svg", "Honest Handicap", "lg")


def render(p, styles, scripts, body=None):
    robots = "index, follow" if (CFG.get("live") and p["index"]) else "noindex, nofollow"
    canon = f'<link rel="canonical" href="{BASE}{p["path"]}">' if p["path"] != "/404.html" else ""
    img = p["ogimage"] or BASE + "/og.png"
    ld = "".join(f'<script type="application/ld+json">{json.dumps(j, ensure_ascii=False)}</script>' for j in p["jsonld"])
    out = LAYOUT
    for k in ("reviews", "how-we-test", "testers", "about"):
        out = out.replace("{{CUR_" + k + "}}", ' aria-current="page"' if p["cur"] == k else "")
    rep = {"TITLE": e(p["title"]), "DESC": e(p["desc"]), "ROBOTS": robots, "CANONICAL": canon, "OGTYPE": p["ogtype"], "OGTITLE": e(p["title"]),
           "OGIMAGE": img, "ROOT": "/", "STYLES": styles, "JSONLD": ld, "PAGE": p["page"], "LOGO": LOGO, "LOGOFOOT": LOGOFOOT,
           "BODY": body if body is not None else p["body"], "GRASS": GRASS, "SCRIPTS": scripts, "YEAR": str(TODAY.year)}
    for k, v in rep.items():
        out = out.replace("{{" + k + "}}", v)
    left = re.findall(r"\{\{[A-Z_:0-9a-z-]+\}\}", out)
    assert not left, (p["path"], left)
    return out


def resolve(p):
    m = re.fullmatch(r"\{\{REVIEW:(.+)\}\}", p["body"])
    if m:
        r = next(x for x in REVIEWS if x["id"] == m.group(1))
        p["body"] = review_page(r)
        p["jsonld"] = review_jsonld(r)
        pics = PHOTOS.get(r["id"]) or []
        if pics:
            p["ogimage"] = pics[0][0] if not pics[0][0].startswith("/") else BASE + pics[0][0]


def build_site():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "assets"))
    get_photos()
    v = hashlib.sha1((CSS + JS).encode()).hexdigest()[:8]
    open(os.path.join(OUT, "assets", "site.css"), "w").write(CSS)
    open(os.path.join(OUT, "assets", "site.js"), "w").write(JS)
    styles = f'<link rel="stylesheet" href="/assets/site.css?v={v}">'
    scripts = f'<script src="/assets/site.js?v={v}" defer></script>'
    for p in PAGES:
        resolve(p)
        dest = os.path.join(OUT, "404.html") if p["path"] == "/404.html" else os.path.join(OUT, p["path"].strip("/"), "index.html")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, "w").write(render(p, styles, scripts))
    shutil.copy(os.path.join(BRAND, "icon.svg"), os.path.join(OUT, "favicon.svg"))
    for f in ("og.png", "apple-touch-icon.png"):
        shutil.copy(os.path.join(BRAND, f), os.path.join(OUT, f))
    live = CFG.get("live")
    urls = [p for p in PAGES if p["index"] and p["path"] != "/404.html"]
    open(os.path.join(OUT, "sitemap.xml"), "w").write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f'  <url><loc>{BASE}{p["path"]}</loc><lastmod>{p["lastmod"]}</lastmod></url>\n' for p in urls) + "</urlset>\n")
    open(os.path.join(OUT, "robots.txt"), "w").write(
        ("User-agent: *\nAllow: /\nDisallow: /submit/\n" if live else "User-agent: *\nDisallow: /\n") + f"\nSitemap: {BASE}/sitemap.xml\n")
    open(os.path.join(OUT, "CNAME"), "w").write(BASE.split("//")[1] + "\n")
    open(os.path.join(OUT, ".nojekyll"), "w").write("")
    print(f"built site/: {len(PAGES)} pages, {len(REVIEWS)} reviews, {len(TESTERS)} testers, {len(urls)} in the sitemap, live={bool(live)}")


ROUTER = r"""<script>
/* preview only: one file, every page, addresses after the # */
(function(){
  var pages=[].slice.call(document.querySelectorAll('.page')), lost=document.querySelector('.page[data-path="/404.html"]');
  function go(){
    var h=(location.hash||'#/').slice(1); if(h.charAt(0)!=='/')return;
    h=h.split('?')[0]; if(!/\/$/.test(h)&&h.indexOf('.')<0)h+='/';
    var on=pages.filter(function(p){return p.dataset.path===h;})[0]||lost;
    pages.forEach(function(p){p.classList.toggle('on',p===on);});
    document.title=on.dataset.title; document.body.dataset.page=on.dataset.page;
    document.querySelectorAll('nav.main a').forEach(function(a){var c=a.getAttribute('href');
      if(on.dataset.cur&&c==='#/'+on.dataset.cur+'/')a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    scrollTo(0,0); window.HHcloseMenu&&HHcloseMenu(); window.HHobserve&&HHobserve(on);
  }
  addEventListener('hashchange',go); go();
})();
</script>"""


def build_preview():
    get_photos()
    for p in PAGES:
        resolve(p)
    body = "\n".join(f'<div class="page" data-path="{p["path"]}" data-page="{p["page"]}" data-cur="{p["cur"]}" data-title="{e(p["title"])}">\n{p["body"]}\n</div>'
                     for p in PAGES)
    home = PAGES[0]
    out = render(home, f"<style>{CSS}</style>", f"<script>{JS}</script>{ROUTER}", body=body)
    out = out.replace('href="/favicon.svg"', 'href="data:image/svg+xml;base64,' + base64.b64encode(ICON.encode()).decode() + '"')
    out = re.sub(r'(href)="/(?!/)', r'\1="#/', out)  # site links become #/ addresses
    out = out.replace('href="#/favicon', 'href="/favicon')
    open(os.path.join(HERE, "preview.html"), "w").write(out)
    print(f"built preview.html: {len(PAGES)} pages, {len(REVIEWS)} reviews, {len(out) // 1024} KB")


build_preview() if PREVIEW else build_site()
