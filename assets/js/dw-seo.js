/* Dunnworks console: SEO (#/seo).
 *
 * Three sources, and it is worth knowing which is which:
 *
 *   1. Live audit   this file fetches every page in sitemap.xml from the browser
 *                   and reads the real HTML. Nothing is cached or stored, so what
 *                   you see is the site as it is right now, not as it was.
 *   2. Our counter  rpc dw_seo(days) over dw_pageviews, for search arrivals.
 *   3. Back links   edge function dw-seo-links fetches each live client site and
 *                   looks for a real link back to dunnworks.io.
 *
 * What is deliberately NOT here: positions, impressions and the words people
 * typed. Only Google knows those and only Search Console will hand them over.
 * The panel at the bottom says so rather than guessing.
 *
 * Scoring is checks passed divided by checks run. No weighting, no curve, so a
 * number going up always means a real check started passing.
 */
(function (w) {
  'use strict';

  var S = { days: 28, audit: null, links: null, search: null, busy: false };
  var root = null, say = function () {};

  /* pages robots.txt keeps out, so the audit does not flag our own back rooms */
  var PRIVATE = /^\/(console|admin|preview|client|editor)(\/|$)/;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function num(x) { return x == null || isNaN(x) ? '-' : Number(x).toLocaleString('en-GB'); }
  function q(sel) { return root && root.querySelector(sel); }
  function fill(id, html) { var el = q('[data-sec="' + id + '"]'); if (el) el.innerHTML = html; }
  function pct(a, b) { return !b ? 0 : Math.round(100 * a / b); }

  function stat(label, value, note) {
    return '<div class="dwt-stat"><b>' + value + '</b><span>' + esc(label) + '</span>' +
      (note ? '<em>' + note + '</em>' : '') + '</div>';
  }

  function ring(score) {
    var cls = score >= 85 ? 'good' : score >= 65 ? 'ok' : 'bad';
    return '<span class="dws-score ' + cls + '">' + score + '</span>';
  }

  /* ------------------------------------------------------------ the crawler */

  function absPath(href, base) {
    try {
      var u = new URL(href, new URL(base, location.origin));
      if (u.origin !== location.origin) return null;
      var p = u.pathname;
      if (p === '/index.html') p = '/';
      return p;
    } catch (e) { return null; }
  }

  /* every @type in a JSON-LD blob, @graph and arrays included */
  function ldTypes(obj) {
    var out = [];
    (function walk(x) {
      if (!x) return;
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if (typeof x !== 'object') return;
      if (x['@type']) out = out.concat([].concat(x['@type']));
      if (x['@graph']) walk(x['@graph']);
    })(obj);
    return out;
  }

  function wanted(path) {
    if (path === '/') return ['ProfessionalService', 'LocalBusiness', 'Organization'];
    if (/^\/web-design-/.test(path)) return ['ProfessionalService', 'LocalBusiness'];
    if (/^\/work\/.+/.test(path)) return ['Article', 'CreativeWork', 'CaseStudy'];
    if (/^\/how-much/.test(path)) return ['Article', 'FAQPage'];
    if (path === '/services.html') return ['Service', 'OfferCatalog', 'FAQPage', 'ProfessionalService'];
    if (path === '/work.html') return ['CollectionPage', 'ItemList'];
    if (path === '/about.html') return ['AboutPage', 'Organization'];
    if (path === '/contact.html') return ['ContactPage', 'LocalBusiness'];
    return null; /* nothing expected, e.g. the cookie notice */
  }

  function readPage(path) {
    return fetch(path + (path.indexOf('?') < 0 ? '?' : '&') + '_a=' + Date.now(), { cache: 'reload' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (html) {
        var d = new DOMParser().parseFromString(html, 'text/html');
        var title = ((d.querySelector('title') || {}).textContent || '').trim();
        var dm = d.querySelector('meta[name="description"]');
        var desc = (dm ? dm.getAttribute('content') || '' : '').trim();
        var can = d.querySelector('link[rel="canonical"]');
        var main = d.querySelector('main') || d.body;
        var clone = main.cloneNode(true);
        clone.querySelectorAll('script,style,nav,footer,svg,noscript').forEach(function (n) { n.remove(); });
        var words = clone.textContent.trim().split(/\s+/).filter(Boolean).length;

        var types = [], badLd = 0;
        d.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
          try { types = types.concat(ldTypes(JSON.parse(s.textContent))); } catch (e) { badLd++; }
        });

        var imgs = [].slice.call(d.querySelectorAll('img'));
        var noAlt = imgs.filter(function (i) { return !(i.getAttribute('alt') || '').trim(); });

        var out = {}, ext = {};
        [].slice.call(d.querySelectorAll('a[href]')).forEach(function (a) {
          var h = a.getAttribute('href') || '';
          if (/^(mailto:|tel:|javascript:|#)/i.test(h)) return;
          var p = absPath(h, path);
          if (p) { if (p !== path && !PRIVATE.test(p)) out[p] = 1; }
          else { try { ext[new URL(h, location.origin).hostname] = 1; } catch (e) {} }
        });

        return {
          path: path, ok: true, bytes: html.length,
          title: title, desc: desc,
          canonical: can ? can.getAttribute('href') : null,
          h1: [].slice.call(d.querySelectorAll('h1')).map(function (n) { return n.textContent.trim(); }),
          h2: d.querySelectorAll('h2').length,
          words: words,
          types: types.filter(function (t, i) { return types.indexOf(t) === i; }),
          badLd: badLd,
          imgs: imgs.length, noAlt: noAlt.length,
          outLinks: Object.keys(out),
          ext: Object.keys(ext).filter(function (h) { return h && !/dunnworks\.io$/.test(h); }),
          ogTitle: !!d.querySelector('meta[property="og:title"]'),
          ogImage: !!d.querySelector('meta[property="og:image"]'),
          noindex: /noindex/i.test((d.querySelector('meta[name="robots"]') || { getAttribute: function () { return ''; } }).getAttribute('content') || '')
        };
      })
      .catch(function (e) { return { path: path, ok: false, error: e.message }; });
  }

  /* run jobs n-at-a-time so we do not fire 15 requests at once */
  function pool(items, n, worker) {
    var out = [], i = 0;
    function next() {
      if (i >= items.length) return Promise.resolve();
      var k = i++;
      return worker(items[k]).then(function (r) { out[k] = r; return next(); });
    }
    var runners = [];
    for (var j = 0; j < Math.min(n, items.length); j++) runners.push(next());
    return Promise.all(runners).then(function () { return out; });
  }

  function crawl() {
    var robots = null, sitemap = [];
    return fetch('/robots.txt?_a=' + Date.now(), { cache: 'reload' })
      .then(function (r) { return r.ok ? r.text() : null; }).catch(function () { return null; })
      .then(function (t) {
        robots = t;
        return fetch('/sitemap.xml?_a=' + Date.now(), { cache: 'reload' })
          .then(function (r) { return r.ok ? r.text() : null; }).catch(function () { return null; });
      })
      .then(function (xml) {
        if (xml) {
          var d = new DOMParser().parseFromString(xml, 'text/xml');
          sitemap = [].slice.call(d.querySelectorAll('url > loc')).map(function (n) {
            return absPath(n.textContent.trim(), '/');
          }).filter(Boolean);
        }
        if (!sitemap.length) sitemap = ['/'];
        return pool(sitemap, 4, readPage);
      })
      .then(function (pages) {
        /* anything linked from a crawled page but missing from the sitemap */
        var known = {}, discovered = [];
        sitemap.forEach(function (p) { known[p] = 1; });
        pages.forEach(function (p) {
          (p.outLinks || []).forEach(function (t) {
            if (!known[t] && discovered.indexOf(t) < 0 && !/\.(pdf|png|jpg|jpeg|svg|webp|zip)$/i.test(t)) discovered.push(t);
          });
        });
        return pool(discovered, 4, readPage).then(function (extra) {
          return { robots: robots, sitemap: sitemap, pages: pages, extra: extra.filter(function (p) { return p.ok; }) };
        });
      })
      .then(function (r) {
        var all = r.pages.concat(r.extra);
        var inbound = {};
        all.forEach(function (p) {
          (p.outLinks || []).forEach(function (t) { inbound[t] = (inbound[t] || 0) + 1; });
        });
        all.forEach(function (p) { p.inbound = inbound[p.path] || 0; });
        r.all = all;
        r.at = new Date().toISOString();
        score(r);
        return r;
      });
  }

  /* ------------------------------------------------------------- the checks */

  function score(r) {
    var issues = [], cat = {
      tech:   { pass: 0, total: 0, name: 'Technical' },
      content:{ pass: 0, total: 0, name: 'Content' },
      schema: { pass: 0, total: 0, name: 'Structured data' },
      links:  { pass: 0, total: 0, name: 'Internal links' }
    };

    function check(group, ok, sev, page, what, fix) {
      cat[group].total++;
      if (ok) { cat[group].pass++; return; }
      issues.push({ sev: sev, page: page, what: what, fix: fix, group: cat[group].name });
    }

    /* duplicate titles and descriptions across the site */
    var byTitle = {}, byDesc = {};
    r.all.forEach(function (p) {
      if (!p.ok) return;
      if (p.title) (byTitle[p.title] = byTitle[p.title] || []).push(p.path);
      if (p.desc) (byDesc[p.desc] = byDesc[p.desc] || []).push(p.path);
    });

    r.all.forEach(function (p) {
      if (!p.ok) {
        issues.push({ sev: 'high', page: p.path, what: 'The page would not load (' + p.error + ')',
          fix: 'Open it in a browser. If it is gone for good, take it out of sitemap.xml so Google stops asking.', group: 'Technical' });
        return;
      }
      var inSitemap = r.sitemap.indexOf(p.path) >= 0;

      /* --- technical --- */
      check('tech', !!p.title, 'high', p.path, 'No page title',
        'Add a <title>. It is the blue line in the search result, so it does more than anything else on this list.');
      if (p.title) {
        check('tech', p.title.length >= 30 && p.title.length <= 62, 'low', p.path,
          'Title is ' + p.title.length + ' characters (' + (p.title.length < 30 ? 'short' : 'long') + ')',
          p.title.length < 30
            ? 'Aim for 30-60. There is room to say what it is and where you are.'
            : 'Google cuts off around 60 characters, so the end of this is not being read.');
      }
      check('tech', !!p.desc, 'high', p.path, 'No meta description',
        'Add one. Google will write its own from the page text if you do not, and it writes worse copy than you do.');
      if (p.desc) {
        check('tech', p.desc.length >= 70 && p.desc.length <= 165, 'low', p.path,
          'Description is ' + p.desc.length + ' characters',
          'Aim for 70-160. This one is being ' + (p.desc.length < 70 ? 'wasted' : 'truncated') + '.');
      }
      check('tech', !!p.canonical, 'med', p.path, 'No canonical link',
        'Add <link rel="canonical"> pointing at itself, so query strings and stray copies do not split the page in two.');
      check('tech', !p.noindex || !inSitemap, 'high', p.path, 'In the sitemap but marked noindex',
        'Pick one. Either let it be indexed or take it out of the sitemap.');
      check('tech', p.ogTitle, 'low', p.path, 'No og:title',
        'Add it, or shares on Facebook and WhatsApp fall back to whatever the scraper guesses.');
      check('tech', p.ogImage, 'low', p.path, 'No og:image',
        'Add it. A share with no picture gets far fewer clicks.');

      /* --- content --- */
      check('content', p.h1.length === 1, 'med', p.path,
        p.h1.length === 0 ? 'No H1' : p.h1.length + ' H1 headings',
        p.h1.length === 0 ? 'Add one H1 saying plainly what the page is for.'
                          : 'Keep one H1 and demote the rest to H2. More than one muddles what the page is about.');
      check('content', p.words >= 300, p.words < 150 ? 'high' : 'med', p.path,
        'Only ' + p.words + ' words of content',
        'Under 300 words rarely ranks for anything competitive. Say more about the actual job, in your own words.');
      check('content', p.h2 >= 2 || p.words < 300, 'low', p.path,
        'Only ' + p.h2 + ' subheading' + (p.h2 === 1 ? '' : 's') + ' across ' + p.words + ' words',
        'Break it up with H2s. People scan headings before they read, and so does Google.');
      check('content', p.noAlt === 0, p.noAlt > 5 ? 'med' : 'low', p.path,
        p.noAlt + ' of ' + p.imgs + ' images have no alt text',
        'Describe each image in its alt attribute. It is how Google Images finds them and how a screen reader reads them.');

      /* --- structured data --- */
      var want = wanted(p.path);
      check('schema', p.badLd === 0, 'high', p.path, 'Broken JSON-LD on the page',
        'The schema block will not parse, so Google ignores it. Check it in the Rich Results test.');
      if (want) {
        var got = p.types.some(function (t) { return want.indexOf(t) >= 0; });
        check('schema', got, 'med', p.path,
          p.types.length ? 'Schema is ' + p.types.join(', ') + ', not ' + want[0] : 'No schema markup',
          'Add ' + want[0] + ' markup. It is what puts your prices, reviews and breadcrumbs in the result instead of a plain link.');
      }

      /* --- internal links --- */
      check('links', p.inbound >= 1, 'high', p.path, 'Nothing on the site links to it',
        'Link to it from a page people actually reach. An orphan page is one Google finds last and trusts least.');
      check('links', p.inbound >= 3 || p.path === '/', 'low', p.path,
        'Only ' + p.inbound + ' internal link' + (p.inbound === 1 ? '' : 's') + ' point here',
        'Add a couple more from related pages. Internal links are the one ranking factor entirely in your hands.');
      check('links', (p.outLinks || []).length >= 3, 'low', p.path,
        'Links out to only ' + (p.outLinks || []).length + ' other pages',
        'Send people somewhere next. A page with no way onward is where the visit ends.');

      if (!inSitemap) {
        issues.push({ sev: 'med', page: p.path, what: 'Linked from the site but missing from sitemap.xml',
          fix: 'Add it to sitemap.xml so it gets crawled on purpose rather than by luck.', group: 'Technical' });
      }
    });

    /* site-wide */
    Object.keys(byTitle).forEach(function (t) {
      if (byTitle[t].length > 1) issues.push({ sev: 'high', page: byTitle[t].join(', '),
        what: 'These pages share the same title', fix: 'Give each its own. Identical titles make Google pick one and bury the rest.', group: 'Technical' });
    });
    Object.keys(byDesc).forEach(function (t) {
      if (byDesc[t].length > 1) issues.push({ sev: 'med', page: byDesc[t].join(', '),
        what: 'These pages share the same meta description', fix: 'Write one each.', group: 'Technical' });
    });
    cat.tech.total++;
    if (r.robots && /Sitemap:/i.test(r.robots)) cat.tech.pass++;
    else issues.push({ sev: 'med', page: '/robots.txt', what: 'robots.txt does not point at the sitemap',
      fix: 'Add a Sitemap: line. It is the first place a crawler looks.', group: 'Technical' });

    var order = { high: 0, med: 1, low: 2 };
    issues.sort(function (a, b) { return order[a.sev] - order[b.sev] || a.page.localeCompare(b.page); });

    var pass = 0, total = 0;
    Object.keys(cat).forEach(function (k) { pass += cat[k].pass; total += cat[k].total; });
    r.cat = cat;
    r.issues = issues;
    r.score = pct(pass, total);
    r.counts = {
      high: issues.filter(function (i) { return i.sev === 'high'; }).length,
      med:  issues.filter(function (i) { return i.sev === 'med'; }).length,
      low:  issues.filter(function (i) { return i.sev === 'low'; }).length
    };
  }

  /* ----------------------------------------------------------------- render */

  function view(viewEl, sayFn) {
    css();
    root = viewEl; say = sayFn || say;
    viewEl.innerHTML =
      '<div class="dwt-bar-top">' +
        '<button type="button" class="mini" data-dws="run">Run the audit again</button>' +
        '<button type="button" class="mini" data-dws="copy">Copy the fix list</button>' +
        '<span class="sp"></span>' +
        '<a class="mini" href="https://search.google.com/search-console?resource_id=sc-domain%3Adunnworks.io" target="_blank" rel="noopener">Search Console</a>' +
        '<a class="mini" href="https://search.google.com/test/rich-results?url=https%3A%2F%2Fdunnworks.io%2F" target="_blank" rel="noopener">Rich results</a>' +
        '<a class="mini" href="https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fdunnworks.io%2F" target="_blank" rel="noopener">PageSpeed</a>' +
      '</div>' +
      '<div class="dwt-sec" data-sec="score"><p class="dwt-loading">Reading every page on the site...</p></div>' +
      '<section class="dwt-sec"><h2>What to fix <small>Worst first</small></h2>' +
        '<p class="dwt-lede">Each line is a check that failed on the live site just now, with the reason it matters. ' +
        'Work down from the top: the high ones cost you rankings, the low ones are polish.</p>' +
        '<div data-sec="fixes"><p class="dwt-loading">Loading...</p></div></section>' +
      '<section class="dwt-sec"><h2>Every page <small>As it stands right now</small></h2>' +
        '<div data-sec="pages"><p class="dwt-loading">Loading...</p></div></section>' +
      '<section class="dwt-sec"><h2>Arriving from search <small>Our own counter</small></h2>' +
        '<p class="dwt-lede">Visits that came from a search engine. This counts arrivals, not rankings - ' +
        'the words people typed are only in Search Console.</p>' +
        '<div data-sec="search"><p class="dwt-loading">Loading...</p></div></section>' +
      '<section class="dwt-sec"><h2>Links back from client sites <small>Checked live</small></h2>' +
        '<p class="dwt-lede">Every site you have built, fetched just now and searched for a real link to dunnworks.io. ' +
        'A credit in the footer of a site that ranks is worth more than anything you can do to your own pages.</p>' +
        '<div data-sec="links"><p class="dwt-loading">Loading...</p></div></section>' +
      '<section class="dwt-sec"><h2>What this cannot see <small>Honestly</small></h2>' +
        '<div data-sec="gap"></div></section>';
    drawGap();
    load();
  }

  function load() {
    if (S.busy) return;
    S.busy = true;
    say('Reading the site...');

    crawl().then(function (a) {
      S.audit = a;
      drawScore(); drawFixes(); drawPages();
      say('');
    }).catch(function (e) {
      fill('score', '<p class="dwt-err">The audit could not run: ' + esc(e.message) + '</p>');
      ['fixes', 'pages'].forEach(function (k) { fill(k, ''); });
    }).then(function () { S.busy = false; });

    DWData.rest('rpc/dw_seo', { method: 'POST', body: { days: S.days } })
      .then(function (t) { S.search = t; drawSearch(); })
      .catch(function (e) { fill('search', '<p class="dwt-err">Couldn\'t read the counter: ' + esc(e.message) + '</p>'); });

    DWData.fn('dw-seo-links', {})
      .then(function (t) { S.links = t; drawLinks(); })
      .catch(function (e) { fill('links', '<p class="dwt-err">Couldn\'t check the client sites: ' + esc(e.message) + '</p>'); });
  }

  function drawScore() {
    var a = S.audit, c = a.counts;
    var subs = ['tech', 'content', 'schema', 'links'].map(function (k) {
      var x = a.cat[k];
      return stat(x.name, pct(x.pass, x.total), x.pass + ' of ' + x.total + ' checks pass');
    }).join('');
    fill('score',
      '<div class="dws-head">' +
        ring(a.score) +
        '<div><b>' + num(a.all.length) + ' pages read, ' + num(a.issues.length) + ' checks failed</b>' +
        '<p>' + (c.high ? '<span class="dws-sev high">' + c.high + ' high</span>' : '') +
        (c.med ? '<span class="dws-sev med">' + c.med + ' medium</span>' : '') +
        (c.low ? '<span class="dws-sev low">' + c.low + ' low</span>' : '') +
        (a.issues.length ? '' : 'Every check passed.') + '</p></div>' +
      '</div>' +
      '<div class="dwt-stats">' + subs + '</div>');
  }

  function drawFixes() {
    var a = S.audit;
    if (!a.issues.length) { fill('fixes', '<p class="dwt-none">Nothing failed. Enjoy it while it lasts.</p>'); return; }
    var groups = {};
    a.issues.forEach(function (i) { (groups[i.what] = groups[i.what] || []).push(i); });

    fill('fixes', '<div class="dws-fixes">' + Object.keys(groups).map(function (whatKey) {
      var g = groups[whatKey], f = g[0];
      var pages = g.map(function (i) { return i.page; });
      return '<div class="dws-fix ' + f.sev + '">' +
        '<div class="dws-fh"><span class="dws-sev ' + f.sev + '">' + f.sev + '</span>' +
          '<b>' + esc(f.what) + '</b>' +
          '<span class="dws-ct">' + pages.length + ' page' + (pages.length === 1 ? '' : 's') + '</span></div>' +
        '<p class="dws-why">' + esc(f.fix) + '</p>' +
        '<p class="dws-pages">' + pages.slice(0, 8).map(function (p) {
            return '<a href="https://dunnworks.io' + esc(p) + '" target="_blank" rel="noopener">' + esc(p) + '</a>';
          }).join(' ') + (pages.length > 8 ? ' <em>and ' + (pages.length - 8) + ' more</em>' : '') + '</p>' +
      '</div>';
    }).join('') + '</div>');
  }

  function drawPages() {
    var a = S.audit;
    var rows = a.all.slice().sort(function (x, y) { return (y.inbound || 0) - (x.inbound || 0); });
    fill('pages',
      '<div class="dws-scroll"><table class="dwt-tbl dws-tbl"><thead><tr>' +
        '<th>Page</th><th class="n">Title</th><th class="n">Desc</th><th class="n">Words</th>' +
        '<th class="n">H1</th><th>Schema</th><th class="n">Alt</th><th class="n">In</th><th class="n">Out</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (p) {
        if (!p.ok) return '<tr><td>' + esc(p.path) + '</td><td class="n bad" colspan="8">' + esc(p.error) + '</td></tr>';
        var f = function (ok, txt) { return '<td class="n ' + (ok ? '' : 'bad') + '">' + txt + '</td>'; };
        return '<tr>' +
          '<td><a href="https://dunnworks.io' + esc(p.path) + '" target="_blank" rel="noopener">' + esc(p.path) + '</a></td>' +
          f(p.title.length >= 30 && p.title.length <= 62, p.title.length) +
          f(p.desc.length >= 70 && p.desc.length <= 165, p.desc.length) +
          f(p.words >= 300, num(p.words)) +
          f(p.h1.length === 1, p.h1.length) +
          '<td class="' + (p.types.length ? '' : 'bad') + '" style="font-size:12px">' + (p.types.length ? esc(p.types.join(', ')) : 'none') + '</td>' +
          f(p.noAlt === 0, p.noAlt + '/' + p.imgs) +
          f(p.inbound >= 1, p.inbound) +
          f((p.outLinks || []).length >= 3, (p.outLinks || []).length) +
        '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="dws-note">Title and Desc are character counts. Alt is images with no alt text over images on the page. ' +
      'In and Out are internal links. Red is a failed check.</p>');
  }

  function drawSearch() {
    var t = S.search;
    if (!t) { fill('search', '<p class="dwt-none">No counter data yet.</p>'); return; }
    var tot = t.totals || {}, eng = t.engines || [], land = t.landing || [];
    var young = (tot.views || 0) < 100;
    fill('search',
      (young ? '<div class="dwt-flag"><b>The counter is new.</b> ' + num(tot.views) + ' views recorded so far, so there is ' +
        'nothing here to read a trend from yet. Search arrivals also lag: a page published this week will not show up ' +
        'in this panel until Google has crawled it, ranked it and someone has clicked it.</div>' : '') +
      '<div class="dwt-stats">' +
        stat('From search', num(tot.search), 'last ' + t.days + ' days') +
        stat('Direct', num(tot.direct)) +
        stat('From other sites', num(tot.referral)) +
        stat('All views', num(tot.views), num(tot.visitors) + ' visitors') +
      '</div>' +
      '<div class="dwt-cols">' +
        '<div><h3 class="dws-h3">Search engines</h3>' +
          (eng.length ? '<div class="dwt-bars">' + eng.map(function (e) {
            return '<div class="dwt-bar"><span class="dwt-bk">' + esc(e.engine) + '</span>' +
              '<span class="dwt-bt"><i style="width:' + Math.max(2, pct(e.views, eng[0].views)) + '%"></i></span>' +
              '<span class="dwt-bn">' + num(e.views) + '</span></div>';
          }).join('') + '</div>' : '<p class="dwt-none">Nobody has arrived from a search engine yet.</p>') + '</div>' +
        '<div><h3 class="dws-h3">Pages they landed on</h3>' +
          (land.length ? '<div class="dwt-bars">' + land.map(function (p) {
            return '<div class="dwt-bar"><span class="dwt-bk" title="' + esc(p.path) + '">' + esc(p.path) + '</span>' +
              '<span class="dwt-bt"><i style="width:' + Math.max(2, pct(p.views, land[0].views)) + '%"></i></span>' +
              '<span class="dwt-bn">' + num(p.views) + '</span></div>';
          }).join('') + '</div>' : '<p class="dwt-none">Nothing yet.</p>') + '</div>' +
      '</div>');
  }

  function drawLinks() {
    var t = S.links;
    if (!t || !t.sites) { fill('links', '<p class="dwt-none">No sites to check.</p>'); return; }
    var s = t.summary || {};
    fill('links',
      '<div class="dwt-stats">' +
        stat('Sites checked', num(s.checked)) +
        stat('Linking back', num(s.with_link)) +
        stat('Followed links', num(s.follow), 'the ones that pass value') +
        stat('Unreachable', num(s.unreachable)) +
      '</div>' +
      '<div class="dws-fixes">' + t.sites.map(function (x) {
        var cls = !x.ok ? 'high' : x.found ? (x.follow ? 'okk' : 'med') : 'med';
        var verdict = !x.ok ? 'Could not be read' + (x.status ? ' (HTTP ' + x.status + ')' : '')
          : x.found ? (x.follow ? 'Linking back, followed' : 'Linking back, but nofollow')
          : (x.mentions ? 'Names you ' + x.mentions + ' time' + (x.mentions === 1 ? '' : 's') + ' but does not link'
                        : 'No link and no mention');
        return '<div class="dws-fix ' + cls + '">' +
          '<div class="dws-fh"><b>' + esc(x.name) + '</b>' +
            '<span class="dws-ct"><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' +
              esc(String(x.url).replace(/^https?:\/\//, '')) + '</a></span></div>' +
          '<p class="dws-why">' + esc(verdict) +
            (x.links && x.links.length ? ' &mdash; anchor text &ldquo;' + esc(x.links[0].anchor) + '&rdquo;' : '') +
            (x.error ? ' &mdash; ' + esc(x.error) : '') + '</p>' +
          (!x.found && x.ok ? '<p class="dws-pages"><em>Add a credit line in the footer linking to dunnworks.io.</em></p>' : '') +
        '</div>';
      }).join('') + '</div>');
  }

  function drawGap() {
    fill('gap',
      '<p class="dwt-lede">Everything above is measured, not estimated. These four things are not here because ' +
      'no honest number for them exists without connecting Google:</p>' +
      '<div class="dws-fixes">' +
        '<div class="dws-fix info"><div class="dws-fh"><b>What people typed</b></div>' +
          '<p class="dws-why">The actual search terms, impressions and your average position. Only Search Console has these. ' +
          'The button at the top opens it. Reading it in here would need a Google sign-in and an API key, which is a job ' +
          'in itself - say the word and it gets built.</p></div>' +
        '<div class="dws-fix info"><div class="dws-fh"><b>Whether Google has indexed a page</b></div>' +
          '<p class="dws-why">Being in the sitemap is not the same as being in the index. Search Console&rsquo;s coverage ' +
          'report is the only place that says so for certain.</p></div>' +
        '<div class="dws-fix info"><div class="dws-fh"><b>Who links to you from elsewhere</b></div>' +
          '<p class="dws-why">The panel above checks your own client sites, which is the part you control. Links from ' +
          'anywhere else would need a paid backlink index.</p></div>' +
        '<div class="dws-fix info"><div class="dws-fh"><b>Page speed as Google scores it</b></div>' +
          '<p class="dws-why">Core Web Vitals come from real Chrome users and take 28 days to settle. The PageSpeed ' +
          'button at the top is the live test.</p></div>' +
      '</div>');
  }

  function asText() {
    var a = S.audit;
    if (!a) return 'The audit has not run yet.';
    var L = ['Dunnworks SEO audit, ' + new Date(a.at).toLocaleString('en-GB'),
             'Score ' + a.score + '/100 across ' + a.all.length + ' pages',
             ''];
    ['high', 'med', 'low'].forEach(function (sev) {
      var g = a.issues.filter(function (i) { return i.sev === sev; });
      if (!g.length) return;
      L.push(sev.toUpperCase() + ' (' + g.length + ')');
      g.forEach(function (i) { L.push('  - [' + i.page + '] ' + i.what + ' -> ' + i.fix); });
      L.push('');
    });
    return L.join('\n');
  }

  /* -------------------------------------------------------------------- css */

  function css() {
    if (document.getElementById('dws-css')) return;
    var s = document.createElement('style'); s.id = 'dws-css';
    s.textContent = [
      '.dws-head{display:flex;gap:18px;align-items:center;margin-bottom:18px;flex-wrap:wrap}',
      '.dws-head b{font-family:var(--font-display);font-size:19px;display:block}',
      '.dws-head p{margin:6px 0 0;display:flex;gap:7px;flex-wrap:wrap;color:var(--muted);font-size:13.5px}',
      '.dws-score{font-family:var(--font-display);font-size:40px;line-height:1;padding:16px 20px;border-radius:var(--radius);border:1px solid var(--line);background:var(--ink-2);min-width:96px;text-align:center}',
      '.dws-score.good{color:#4fd08a;border-color:#4fd08a55}',
      '.dws-score.ok{color:#f0c24f;border-color:#f0c24f55}',
      '.dws-score.bad{color:#ff6b8a;border-color:#ff6b8a55}',
      '.dws-sev{font-family:var(--font-mono);font-size:10px;letter-spacing:.09em;text-transform:uppercase;padding:3px 7px;border-radius:2px;border:1px solid var(--line);white-space:nowrap}',
      '.dws-sev.high{color:#ff6b8a;border-color:#ff6b8a55}',
      '.dws-sev.med{color:#f0c24f;border-color:#f0c24f55}',
      '.dws-sev.low{color:var(--muted-2)}',
      '.dws-fixes{display:grid;gap:10px}',
      '.dws-fix{border:1px solid var(--line);border-left:2px solid var(--line);border-radius:var(--radius);background:var(--ink-2);padding:13px 15px}',
      '.dws-fix.high{border-left-color:#ff6b8a}',
      '.dws-fix.med{border-left-color:#f0c24f}',
      '.dws-fix.low{border-left-color:var(--ink-3)}',
      '.dws-fix.okk{border-left-color:#4fd08a}',
      '.dws-fix.info{border-left-color:var(--accent)}',
      '.dws-fh{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}',
      '.dws-fh b{font-size:14.5px;color:var(--paper);flex:1 1 220px}',
      '.dws-ct{font-family:var(--font-mono);font-size:11px;color:var(--muted-2);white-space:nowrap}',
      '.dws-why{margin:7px 0 0;color:var(--muted);font-size:13.5px;max-width:78ch}',
      '.dws-pages{margin:8px 0 0;display:flex;gap:6px;flex-wrap:wrap;font-family:var(--font-mono);font-size:11px}',
      '.dws-pages a{color:var(--muted-2);border-bottom:1px solid var(--ink-3);text-decoration:none}',
      '.dws-pages a:hover{color:var(--accent-2)}',
      '.dws-pages em{color:var(--muted-2);font-style:normal}',
      '.dws-h3{font-size:13px;font-family:var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted-2);font-weight:400;margin-bottom:10px}',
      '.dws-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}',
      '.dws-tbl{min-width:760px}',
      '.dws-tbl td.bad{color:#ff6b8a}',
      '.dws-tbl td a{color:var(--paper);text-decoration:none;border-bottom:1px solid var(--ink-3)}',
      '.dws-note{margin-top:10px;color:var(--muted-2);font-size:12px;max-width:78ch}',
      '@media (max-width:620px){.dws-score{font-size:32px;min-width:78px;padding:12px 14px}}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ----------------------------------------------------------------- events */

  document.addEventListener('click', function (e) {
    if (!root || !root.contains(e.target)) return;
    var b = e.target.closest('[data-dws]');
    if (!b) return;
    var act = b.getAttribute('data-dws');
    if (act === 'run') {
      fill('score', '<p class="dwt-loading">Reading every page on the site...</p>');
      load();
    }
    if (act === 'copy') {
      var txt = asText();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { say('Fix list copied.', 'ok'); },
          function () { say('Could not copy.', 'bad'); });
      } else { say('Clipboard is not available in this browser.', 'bad'); }
    }
  });

  w.DWSEO = {
    view: view,
    /* the menu tile only needs a page count, so this stays to one small request */
    summary: function () {
      return fetch('/sitemap.xml?_a=' + Date.now(), { cache: 'reload' })
        .then(function (r) { return r.ok ? r.text() : null; })
        .then(function (xml) {
          if (!xml) return null;
          var d = new DOMParser().parseFromString(xml, 'text/xml');
          return { pages: d.querySelectorAll('url > loc').length };
        }).catch(function () { return null; });
    }
  };
})(window);
