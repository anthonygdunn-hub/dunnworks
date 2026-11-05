"""The ten extra logo ideas (d to m), drawn for the site header: transparent
background, text outlined, light and dark versions. Uses only the five base
colours so the site's colour schemes recolour them.
Imported by make_logos.py."""
import math

def build(font, text_paths, svg, INK, TURF, FLAG, PAPER, SOFT):
    out = {}
    T = lambda f, t, size, x, y, ls=0, anchor='start', skew=0: text_paths(f, t, size, x, y, track=ls / size, anchor=anchor, skew=skew)

    # d: price tag ---------------------------------------------------------
    def tag(dark):
        fa, fb = font('anton', 400), font('barlow', 800)
        word, ww = T(fa, 'BACKSWING', 112, 0, 0, 1)
        x0 = 92
        word, ww = T(fa, 'BACKSWING', 112, x0, 132, 1)
        sub, sw = T(fb, 'PRE-LOVED GOLF CLUBS', 23, x0 + 4, 172, 5)
        W = x0 + max(ww, sw) + 36
        body = (f'<path fill-rule="evenodd" fill="{FLAG}" d="M60 14 H{W-14} a14 14 0 0 1 14 14 V172 a14 14 0 0 1 -14 14 H60 L8 100 Z '
                f'M46 100 a12 12 0 1 0 0.01 0 Z"/>'
                f'<path d="{word}" fill="{INK}"/><path d="{sub}" fill="{INK}"/>')
        return svg(int(W) + 2, 200, body)
    out['d'] = (tag(False), tag(True))

    # e: the b-iron --------------------------------------------------------
    def biron(dark):
        ink = PAPER if dark else INK
        fb, fs = font('bricolage-grotesque', 800), font('bricolage-grotesque', 500)
        word, ww = T(fb, 'ackswing', 124, 166, 150, -3)
        sub, sw = T(fs, 'golf clubs, second time round', 29, 172, 194, 0.5)
        b = (f'<rect x="10" y="6" width="26" height="182" rx="7" fill="{ink}"/>'
             f'<path d="M36 96 C80 78 140 88 152 128 C160 160 144 186 108 192 L36 196 Z" fill="{ink}"/>'
             f'<g stroke="{FLAG}" stroke-width="6" stroke-linecap="round"><path d="M56 126 L134 122"/><path d="M56 145 L140 143"/><path d="M56 164 L136 164"/><path d="M56 182 L120 183"/></g>')
        return svg(int(166 + max(ww, sw) + 10), 204, b + f'<path d="{word}" fill="{ink}"/><path d="{sub}" fill="{SOFT if dark else TURF}"/>')
    out['e'] = (biron(False), biron(True))

    # f: swing path --------------------------------------------------------
    def swing(dark):
        ink = PAPER if dark else INK
        fu, fb = font('unbounded', 800), font('barlow', 800)
        word, ww = T(fu, 'BACKSWING', 74, 30, 168, -1)
        W = ww + 60
        g, _ = T(fb, 'GOLF', 22, W / 2, 210, 9, anchor='middle')
        x1, x2 = 30, W - 30
        arc = (f'<path d="M{x2-6:.0f} 92 C{x2+10:.0f} 30 {W*0.72:.0f} 12 {W/2:.0f} 12 C{W*0.28:.0f} 12 {x1:.0f} 40 {x1+6:.0f} 86" '
               f'fill="none" stroke="{FLAG}" stroke-width="10" stroke-linecap="round" stroke-dasharray="0.1 22"/>'
               f'<path d="M{x1-8:.0f} 74 L{x1+6:.0f} 96 L{x1+22:.0f} 76" fill="none" stroke="{FLAG}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>'
               f'<circle cx="{x2-4:.0f}" cy="96" r="15" fill="{PAPER if dark else TURF}"/>')
        return svg(int(W), 222, arc + f'<path d="{word}" fill="{ink}"/><path d="{g}" fill="{FLAG if dark else TURF}"/>')
    out['f'] = (swing(False), swing(True))

    # g: second round ------------------------------------------------------
    def second(dark):
        ink = PAPER if dark else INK
        fs = font('space-grotesk', 700)
        cx, cy = 116, 110
        dimples = ''.join(f'<circle cx="{cx+dx}" cy="{cy+dy}" r="7" fill="#C9D0CB"/>' for dx, dy in
                          [(-30,-34),(0,-42),(30,-34),(-44,-4),(-14,-10),(16,-10),(44,-4),(-30,24),(0,18),(30,24),(-12,48),(14,48)])
        ball = (f'<circle cx="{cx}" cy="{cy}" r="78" fill="{PAPER}" stroke="{INK}" stroke-width="6"/>' + dimples +
                f'<path d="M{cx-104} {cy-24} A106 106 0 0 1 {cx+60} {cy-87}" fill="none" stroke="{TURF if not dark else SOFT}" stroke-width="14" stroke-linecap="round"/>'
                f'<path d="M{cx+46} {cy-106} L{cx+76} {cy-86} L{cx+46} {cy-66}Z" fill="{TURF if not dark else SOFT}"/>'
                f'<path d="M{cx+104} {cy+24} A106 106 0 0 1 {cx-60} {cy+87}" fill="none" stroke="{FLAG}" stroke-width="14" stroke-linecap="round"/>'
                f'<path d="M{cx-46} {cy+106} L{cx-76} {cy+86} L{cx-46} {cy+66}Z" fill="{FLAG}"/>')
        word, ww = T(fs, 'backswing', 92, 250, 116, -3)
        sub, sw = T(fs, 'golf · played, loved, played again', 25, 254, 160, 0)
        return svg(int(250 + max(ww, sw) + 12), 224, ball + f'<path d="{word}" fill="{ink}"/><path d="{sub}" fill="{SOFT if dark else TURF}"/>')
    out['g'] = (second(False), second(True))

    # h: clubhouse crest ---------------------------------------------------
    def crest(dark):
        word_c = PAPER if dark else TURF
        fp, fb = font('playfair-display', 800), font('barlow', 800)
        l1, w1 = T(fp, 'BACK', 64, 0, 0)
        cxs = w1 + 40 + 110
        l1, w1 = T(fp, 'BACK', 64, cxs - 120, 140, anchor='end')
        s1, _ = T(fb, 'GOLF', 18, cxs - 120, 172, 6, anchor='end')
        r1, w2 = T(fp, 'SWING', 64, cxs + 120, 140)
        s2, _ = T(fb, 'CLUBS', 18, cxs + 122, 172, 6)
        mono, _ = T(fp, 'B', 40, cxs, 62, anchor='middle')
        c = cxs
        shield = (f'<g transform="translate({c} 8)">'
                  f'<path d="M-96 0 H96 V122 C96 198 32 236 0 252 C-32 236 -96 198 -96 122 Z" fill="{TURF}"/>'
                  f'<path d="M-83 13 H83 V120 C83 186 28 218 0 232 C-28 218 -83 186 -83 120 Z" fill="none" stroke="{FLAG}" stroke-width="3.5"/>'
                  f'<path d="M-83 108 L0 66 L83 108" fill="none" stroke="{FLAG}" stroke-width="13"/>'
                  f'<g stroke="{PAPER}" stroke-width="8" stroke-linecap="round"><path d="M-48 200 L42 114"/><path d="M48 200 L-42 114"/></g>'
                  f'<path d="M42 114 l15 -11 l4 11 z M-42 114 l-15 -11 l-4 11 z" fill="{PAPER}"/>'
                  f'<circle cx="0" cy="172" r="12" fill="{FLAG}"/></g>')
        W = c + 120 + w2 + 10
        return svg(int(W), 268, shield + f'<path d="{mono}" fill="{PAPER}"/><path d="{l1}" fill="{word_c}"/><path d="{r1}" fill="{word_c}"/><path d="{s1}" fill="{word_c}"/><path d="{s2}" fill="{word_c}"/>')
    out['h'] = (crest(False), crest(True))

    # i: scorecard ---------------------------------------------------------
    def score(dark):
        fa, fc = font('alfa-slab-one', 400), font('barlow-condensed', 700)
        word, ww = T(fa, 'BACKSWING', 92, 0, 0)
        W = ww + 64
        word, ww = T(fa, 'BACKSWING', 92, W / 2, 150, anchor='middle')
        nums = ''.join(T(fc, t, 24, x, 37, anchor='middle')[0] for t, x in
                       [('HOLE', 44)] + [(str(i), 70 + i * (W - 110) / 9) for i in range(1, 10)])
        sub, _ = T(fc, 'USED GOLF CLUBS · BOUGHT & SOLD', 22, 26, 196, 2)
        lines = ''.join(f'<path d="M{70 + i * (W - 110) / 9 + (W - 110) / 18:.0f} 50 V66 M{70 + i * (W - 110) / 9 + (W - 110) / 18:.0f} 200 V214"/>' for i in range(1, 9))
        body = (f'<rect x="4" y="4" width="{W-8:.0f}" height="212" rx="10" fill="{PAPER}" stroke="{PAPER if dark else INK}" stroke-width="5"/>'
                f'<path d="M4 14 a10 10 0 0 1 10 -10 H{W-14:.0f} a10 10 0 0 1 10 10 V50 H4 Z" fill="{INK}"/>'
                f'<g stroke="{SOFT}" stroke-width="2">{lines}</g>'
                f'<path d="{nums}" fill="{PAPER}"/><path d="{word}" fill="{INK}"/><path d="{sub}" fill="{TURF}"/>'
                f'<circle cx="{W-44:.0f}" cy="188" r="15" fill="none" stroke="#C8352B" stroke-width="3"/>'
                f'<path d="{T(fc, "3", 22, W - 44, 196, anchor="middle")[0]}" fill="#C8352B"/>')
        return svg(int(W), 220, body)
    out['i'] = (score(False), score(True))

    # j: divot -------------------------------------------------------------
    def divot(dark):
        ink = PAPER if dark else INK
        fa, fb = font('archivo-black', 400), font('barlow', 800)
        word, ww = T(fa, 'BACKSWING', 104, 6, 130, -2)
        W = ww + 24
        sub, _ = T(fb, 'GOLF CLUBS WITH A BIT OF HISTORY', 21, 8, 196, 5.4)
        cut0, cut1 = W * 0.56, W * 0.78
        mid = (cut0 + cut1) / 2
        mid_id = 'dv' + ('d' if dark else 'l')
        body = (f'<defs><mask id="{mid_id}"><rect width="{W:.0f}" height="210" fill="#fff"/>'
                f'<path d="M{cut0:.0f} 132 Q{mid:.0f} 84 {cut1:.0f} 132 Z" fill="#000"/></mask></defs>'
                f'<path d="{word}" fill="{ink}" mask="url(#{mid_id})"/>'
                f'<g transform="translate({cut1 + 6:.0f} 10) rotate(-18)"><path d="M0 34 Q22 0 58 10 Q50 34 0 34Z" fill="{TURF if not dark else SOFT}"/>'
                f'<path d="M14 20 q4 -12 10 -16 M30 14 q2 -12 8 -14" stroke="{TURF if not dark else SOFT}" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>'
                f'<rect x="8" y="152" width="{W-16:.0f}" height="7" fill="{FLAG}"/>'
                f'<path d="{sub}" fill="{ink}"/>')
        return svg(int(W), 210, body)
    out['j'] = (divot(False), divot(True))

    # k: teed up -----------------------------------------------------------
    def teed(dark):
        ink = PAPER if dark else INK
        fr, fb = font('righteous', 400), font('barlow', 800)
        b, _ = T(fr, 'B', 150, 90, 136, anchor='middle')
        word, ww = T(fr, 'Backswing', 92, 200, 124)
        sub, sw = T(fb, 'GOLF · TEED UP AGAIN', 22, 204, 168, 5)
        tile = (f'<rect x="4" y="4" width="172" height="212" rx="38" fill="{TURF}"/>'
                f'<path d="{b}" fill="{PAPER}"/>'
                f'<path d="M58 150 H122 L98 170 L95 200 H85 L82 170 Z" fill="{FLAG}"/>')
        return svg(int(200 + max(ww, sw) + 10), 220, tile + f'<path d="{word}" fill="{ink}"/><path d="{sub}" fill="{FLAG if dark else TURF}"/>')
    out['k'] = (teed(False), teed(True))

    # l: boutique script ---------------------------------------------------
    def script(dark):
        name = PAPER if dark else TURF
        ff, fb = font('fraunces', 700, 'italic'), font('barlow', 800)
        word, ww = T(ff, 'Backswing', 120, 14, 124, -2)
        W = ww + 50
        sub, _ = T(fb, 'PRE-LOVED GOLF', 21, W / 2, 200, 10, anchor='middle')
        line = (f'<path d="M30 152 C{W*0.35:.0f} 182 {W*0.7:.0f} 176 {W-40:.0f} 142" fill="none" stroke="{FLAG}" stroke-width="10" stroke-linecap="round"/>'
                f'<circle cx="{W-26:.0f}" cy="136" r="13" fill="{PAPER if dark else INK}"/>')
        return svg(int(W), 212, f'<path d="{word}" fill="{name}"/>' + line + f'<path d="{sub}" fill="{PAPER if dark else INK}"/>')
    out['l'] = (script(False), script(True))

    # m: back / swing ------------------------------------------------------
    def stacked(dark):
        ink = PAPER if dark else INK
        fa, fc = font('anton', 400), font('barlow-condensed', 700)
        top, tw = T(fa, 'BACK', 132, 6, 120, 2)
        bot, bw = T(fa, 'SWING', 132, 6, 296, 2)
        W = max(tw, bw) + 120
        strip, _ = T(fc, 'USED · EX-DEMO · TOUR · GOLF', 25, W / 2, 158, 5, anchor='middle')
        body = (f'<path d="{top}" fill="{ink}"/><path d="{bot}" fill="{ink}"/>'
                f'<rect x="6" y="132" width="{W-12:.0f}" height="38" fill="{FLAG}"/><path d="{strip}" fill="{INK}"/>'
                f'<path d="M{tw+22:.0f} 34 C{tw+80:.0f} 16 {W-14:.0f} 50 {W-28:.0f} 108" fill="none" stroke="{FLAG}" stroke-width="9" stroke-linecap="round"/>'
                f'<path d="M{W-44:.0f} 94 L{W-28:.0f} 114 L{W-12:.0f} 92" fill="none" stroke="{FLAG}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>'
                f'<circle cx="{bw+40:.0f}" cy="272" r="20" fill="{TURF if not dark else PAPER}"/>')
        return svg(int(W), 306, body)
    out['m'] = (stacked(False), stacked(True))
    return out
