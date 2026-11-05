// Builds the Backswing Golf client pack with the Dunnworks console's own pack
// builder (assets/js/dw-pack.js), adding showcase, brand, eBay and admin sections,
// then prints it to PDF.  node build_pack.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = '/home/claude/dunnworks', SITE = ROOT + '/sites/backswing-golf', HERE = __dirname;
const FS = '/home/claude/bsg/fontsrc/node_modules/@fontsource';
const { chromium } = require('/home/claude/bsg/fontsrc/node_modules/playwright-core');

const win = {}; vm.runInNewContext(fs.readFileSync(ROOT + '/assets/js/dw-pack.js', 'utf8'), { window: win });
const D = JSON.parse(fs.readFileSync(HERE + '/data.json', 'utf8'));

const b64 = p => fs.readFileSync(p).toString('base64');
const shot = n => `data:image/jpeg;base64,${b64(HERE + '/img/' + n + '.jpg')}`;
const svgUri = s => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64');
const logo = f => fs.readFileSync(SITE + '/brand/logos/' + f, 'utf8');

/* the site recolours logos by swapping the five base colours; same here */
const BASE = { ink: '#1E2328', turf: '#1F5C45', flag: '#FFC629', paper: '#FAFAF7', soft: '#9FC9B4' };
const SCHEMES = [
  ['Fairway', 'Green and flag yellow', { ink: '#1E2328', turf: '#1F5C45', flag: '#FFC629', paper: '#FAFAF7', soft: '#9FC9B4' }, 'home-hero'],
  ['Links', 'Navy and sand', { ink: '#16243A', turf: '#1F3A60', flag: '#E4B866', paper: '#F8F7F2', soft: '#AFC3DE' }, 'sch-links'],
  ['Clubhouse', 'Claret and gold', { ink: '#2A1A1D', turf: '#6E1F2F', flag: '#D9A93F', paper: '#F8F4EC', soft: '#E3B9B9' }, 'sch-claret'],
  ['Tour', 'Black and orange', { ink: '#141618', turf: '#2A2E33', flag: '#FF6A2B', paper: '#F6F6F4', soft: '#B9BEC4' }, 'sch-tour'],
  ['Sky', 'Teal and amber', { ink: '#122630', turf: '#0F6E8C', flag: '#FFB23E', paper: '#F7FAFB', soft: '#A9D3E1' }, 'sch-sky'],
];
const recolour = (svg, sc) => {
  const map = {}; for (const k in BASE) map[BASE[k].toUpperCase()] = sc[k];
  return svg.replace(/#[0-9A-Fa-f]{6}/g, h => map[h.toUpperCase()] || h);
};

const fig = (img, cap, cls = '') => `<figure class="shot ${cls}"><img src="${img}" alt="">${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
const EX = '<span class="ex">Example data</span>';

/* ---------------------------------------------------------------- sections */
const S = [];

S.push({ kicker: 'The website', title: 'A proper shop window for your stock', html: `
<p class="lead">Your eBay shop has the stock and the feedback. What it can't do is look like Backswing, or let a golfer find a left-handed 7 iron in a stiff shaft in two clicks. The new site does both.</p>
${fig(shot('home-hero'), 'The home page. Headline, intro and every line of wording can be changed from your admin')}
<div class="means">
  <div><b>All your stock</b><p>727 listings brought across from eBay with every photo, spec and condition note. 159 are left-handed, which most shops bury.</p></div>
  <div><b>Find your club</b><p>A finder on the home page: type, brand, hand and shaft flex, straight to the right results.</p></div>
  <div><b>Built to sell</b><p>Price tags on every photo, a clear grade on every item, and a big yellow button straight to the eBay listing.</p></div>
</div>
${fig(shot('home-justin'), 'Just in: the newest listings, with price, hand, grade and flex on every card')}
${fig(shot('home-cats'), 'Shop by type: twelve categories, each with its own icon, a real photo and the live stock count')}
`});

S.push({ kicker: 'Shopping', title: 'Finding the right club, fast', html: `
<p class="lead">Golfers shopping second-hand know what they want: the club, the hand, the shaft. The shop is built around that.</p>
${fig(shot('shop'), 'The shop, filtered to left-handed irons. Every filter shows how many items match, and the counts update as you click')}
<p class="note">Filter by type, hand, brand, shaft flex, grade and price, or search for something like "Mizuno 7 iron left". Every filtered page has its own link you can send to a customer.</p>
<div class="g2">${fig(shot('pdp'), 'An item page: big photos, our grade, the eBay condition and your notes')}${fig(shot('pdp-2'), 'Every eBay photo, the reassurance points, and the full specification')}</div>
<div class="box acc"><h3>How customers pay</h3><p style="margin:0">The main button on every item is <b>Buy securely on eBay</b>. It opens the eBay listing, where they pay the way they always do and are covered by the eBay Money Back Guarantee. You keep one stock count and one set of feedback, and there's no second checkout to manage. Items you add only on the website show <b>Reserve this item</b> instead, which emails you.</p></div>
`});

S.push({ kicker: 'Condition and trade-ins', title: 'Honest grading, and a way to buy stock in', html: `
<p class="lead">Two things that make second-hand shops trusted: telling people exactly what they're getting, and making it easy to sell clubs to you.</p>
${fig(shot('home-grades'), 'Five grades, shown on every item next to the eBay condition, with a full condition guide page')}
<table><thead><tr><th>Grade</th><th>What it means</th></tr></thead><tbody>
<tr><td><b>Ex-demo</b></td><td>From fitting carts, demo days and hitting bays. Light face marks at most</td></tr>
<tr><td><b>Excellent</b></td><td>Barely used. Hard to tell from new</td></tr>
<tr><td><b>Very good</b></td><td>Played with care. Light wear on the face and sole</td></tr>
<tr><td><b>Good</b></td><td>Clear signs of play, nothing that affects performance</td></tr>
<tr><td><b>Fair</b></td><td>A known mark or flaw, pictured and priced to match</td></tr></tbody></table>
<p class="note">Every imported item has a grade suggested from your eBay notes. They're marked "to check" in your admin until you confirm them.</p>
${fig(shot('sell'), 'Sell your clubs: a form with up to six photos. Enquiries land in your admin, never in a spam folder')}
${fig(shot('home-sell'), 'The Sell us your clubs band on the home page (a golf ball rolls into the hole) and the footer')}
`});

S.push({ kicker: 'On a phone', title: 'Built for phones first', html: `
<p class="lead">Most golfers will find you on their phone, often from Instagram or Facebook. On a phone the site keeps a Call, WhatsApp and Shop bar at the bottom of every page.</p>
<div class="phones">${fig(shot('m-home'), 'Home page')}${fig(shot('m-cats'), 'Shop by type')}${fig(shot('m-pdp'), 'An item, swipe through the photos')}</div>
<h3>Movement that feels like a golf shop</h3>
<ul class="check two">
  <li><b>Swing arc</b><small>Draws behind the headline as the page opens, from the logo</small></li>
  <li><b>Price tags</b><small>Swing on their hole when you hover over a club</small></li>
  <li><b>Category icons</b><small>Draw themselves in as you scroll down</small></li>
  <li><b>Live counts</b><small>The stock number counts up on the home page</small></li>
  <li><b>WhatsApp pin</b><small>A ball is chipped into the hole every few seconds</small></li>
  <li><b>Putting green</b><small>A ball rolls into the cup on the Sell band</small></li>
</ul>
<p class="note">Anyone who has turned off motion on their phone or computer gets the site without the animations.</p>
`});

const A = logo('a-modern-light.svg'), Ad = logo('a-modern-dark.svg'), Am = logo('a-mark-light.svg');
S.push({ kicker: 'Your brand', title: 'The Modern logo', html: `
<p class="lead">The mark is the backswing itself: the arc the clubhead traces round the back of the swing, with the ball still at address. It sits in a solid green disc so it reads at any size, from a shop sign to a phone icon.</p>
<div class="logohero"><img src="${svgUri(A)}" alt="Backswing Golf logo"></div>
<div class="g3l">
  <div class="tile dark"><img src="${svgUri(Ad)}" alt=""></div>
  <div class="tile turf"><img src="${svgUri(recolour(Am, { ...BASE, turf: '#FAFAF7', flag: '#FFC629', paper: '#1F5C45' }))}" alt="" style="height:24mm"></div>
  <div class="tile"><img src="${svgUri(Am)}" alt="" style="height:24mm"></div>
</div>
<p class="note" style="margin-top:2mm">On dark backgrounds · the mark reversed · the mark on its own, for social profiles, the browser tab and stickers</p>
<h3>Colours (Fairway scheme)</h3>
<div class="sw">
  <div><i style="background:#1E2328"></i><b>Ink</b><span>#1E2328</span></div>
  <div><i style="background:#1F5C45"></i><b>Fairway green</b><span>#1F5C45</span></div>
  <div><i style="background:#FFC629"></i><b>Flag yellow</b><span>#FFC629</span></div>
  <div><i style="background:#FAFAF7;border:1px solid #ddd"></i><b>Paper</b><span>#FAFAF7</span></div>
  <div><i style="background:#EDF0EE"></i><b>Mist</b><span>#EDF0EE</span></div>
</div>
<h3>Type</h3>
<div class="type"><div><span class="bc">Tour-spec clubs.</span><small>Barlow Condensed, extra bold: headings and prices</small></div><div><span class="b">Ex-demo and pre-loved golf clubs, checked and graded.</span><small>Barlow: everything else</small></div></div>
<h3>Brand details used across the site</h3>
<ul class="check two">
  <li><b>The price tag</b><small>Yellow tag with a punched hole on every price</small></li>
  <li><b>The swing arc</b><small>Behind the home page, round the WhatsApp pin</small></li>
  <li><b>Grade dots</b><small>One colour per grade, everywhere a grade appears</small></li>
  <li><b>Real photos</b><small>Your own stock photos, never stock images</small></li>
</ul>
`});

const OPTS = [
  ['b-heritage-light.svg', 'Heritage', 'A filled clubhouse roundel with crossed irons and a BG monogram'],
  ['c-sporty-light.svg', 'Sporty', 'Heavy italic with the pin flag, for shirts, vans and Instagram'],
  ['d-light.svg', '1 · Price tag', 'The whole name on a swing tag. Pure shop'],
  ['e-light.svg', '2 · b-iron', 'The b is an iron: shaft for the stem, clubhead for the bowl'],
  ['f-light.svg', '3 · Swing path', 'A dotted clubhead path loops back over the name'],
  ['g-light.svg', '4 · Second round', 'A golf ball in turning arrows: clubs that go round again'],
  ['h-light.svg', '5 · Crest', 'Shield and crossed clubs, the name either side'],
  ['i-light.svg', '6 · Scorecard', 'The name stamped across a scorecard, birdie circled'],
  ['j-light.svg', '7 · Divot', 'A chunk of turf knocked out of the letters'],
  ['k-light.svg', '8 · Teed up', 'A B sitting on a tee, as an app-style icon'],
  ['l-light.svg', '9 · Script', 'A soft italic with a swing line ending in a ball'],
  ['m-light.svg', '10 · Back / Swing', 'Two heavy words stacked, with a stripe between'],
];
S.push({ kicker: 'Logo options', title: 'Twelve other directions', html: `
<p class="lead">The Modern logo is shown throughout this pack, but it isn't decided. There are twelve other options on the preview, and you can try any of them on the real site.</p>
<div class="lgrid">${OPTS.map(([f, n, d]) => `<div><div class="lgbox"><img src="${svgUri(logo(f))}" alt=""></div><b>${n}</b><span>${d}</span></div>`).join('')}</div>
${fig(shot('lookpick'), 'On the preview, press Try a look (bottom left) to swap the logo and the colour scheme on the real site. Your choice is remembered on that device')}
<p class="note">These are starting points. Once you've picked one, I'll finish it properly: spacing, small sizes, the social versions and the files you need.</p>
`});

S.push({ kicker: 'Colour schemes', title: 'Five colour schemes', html: `
<p class="lead">Every colour on the site comes from one set of five, so the whole site, and whichever logo you choose, can change scheme in one go. Fairway is the one shown in the rest of this pack.</p>
<div class="schemes">${SCHEMES.map(([n, d, c, img]) => `<div class="sch">
  <div class="schtop"><img src="${svgUri(recolour(A, c))}" alt=""><div class="dots">${['ink', 'turf', 'flag', 'paper'].map(k => `<i style="background:${c[k]}"></i>`).join('')}</div></div>
  <img class="schshot" src="${shot(img)}" alt="">
  <b>${n}</b><span>${d} · ${c.ink} · ${c.turf} · ${c.flag}</span></div>`).join('')}</div>
`});

/* the eBay connection */
const diagram = `<svg viewBox="0 0 640 250" class="diag" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans, Arial" font-size="12">
<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#6a00f0"/></marker></defs>
<rect x="10" y="40" width="170" height="150" rx="10" fill="#fff" stroke="#101012" stroke-width="1.5"/>
<text x="95" y="68" text-anchor="middle" font-family="Archivo" font-weight="700" font-size="16">Your eBay shop</text>
<text x="95" y="92" text-anchor="middle" fill="#56525f">You list here, as now</text>
<text x="95" y="112" text-anchor="middle" fill="#56525f">Buyers pay here</text>
<text x="95" y="132" text-anchor="middle" fill="#56525f">Feedback stays here</text>
<text x="95" y="164" text-anchor="middle" font-size="10.5" fill="#56525f">ebay.co.uk/str/backswinggolf</text>
<rect x="235" y="70" width="170" height="90" rx="10" fill="#6a00f0"/>
<text x="320" y="102" text-anchor="middle" font-family="Archivo" font-weight="700" font-size="15" fill="#fff">The eBay link</text>
<text x="320" y="122" text-anchor="middle" fill="#efe6ff">Checks every 15 minutes</text>
<text x="320" y="140" text-anchor="middle" fill="#efe6ff">Runs on its own</text>
<rect x="460" y="40" width="170" height="150" rx="10" fill="#1F5C45"/>
<text x="545" y="68" text-anchor="middle" font-family="Archivo" font-weight="700" font-size="16" fill="#fff">backswinggolf.co.uk</text>
<text x="545" y="92" text-anchor="middle" fill="#dcebe3">Your shop window</text>
<text x="545" y="112" text-anchor="middle" fill="#dcebe3">Your admin</text>
<text x="545" y="132" text-anchor="middle" fill="#dcebe3">Trade-in enquiries</text>
<path d="M182 95 H232" stroke="#6a00f0" stroke-width="2" marker-end="url(#ar)"/><path d="M408 95 H457" stroke="#6a00f0" stroke-width="2" marker-end="url(#ar)"/>
<path d="M457 135 H408" stroke="#6a00f0" stroke-width="2" marker-end="url(#ar)"/><path d="M232 135 H182" stroke="#6a00f0" stroke-width="2" marker-end="url(#ar)"/>
<text x="207" y="86" text-anchor="middle" font-size="10" fill="#6a00f0">listings</text><text x="432" y="86" text-anchor="middle" font-size="10" fill="#6a00f0">new, sold</text>
<text x="432" y="152" text-anchor="middle" font-size="10" fill="#6a00f0">price edits</text><text x="207" y="152" text-anchor="middle" font-size="10" fill="#6a00f0">updates</text>
<path d="M545 192 C545 235 95 235 95 194" fill="none" stroke="#FFC629" stroke-width="2.5" stroke-dasharray="6 5" marker-end="url(#ar)"/>
<text x="320" y="244" text-anchor="middle" font-size="11" fill="#101012">Customers browse on the website, then press Buy securely on eBay</text>
</svg>`;
S.push({ kicker: 'Your eBay shop', title: 'How the website connects to eBay', html: `
<p class="lead">You carry on listing on eBay exactly as you do now. The website reads your eBay shop and shows it properly; customers browse on the website and pay on eBay.</p>
${diagram}
<div class="g2 boxes">
  <div class="box"><span class="num">Today</span><h3>A copy, taken on 5 November</h3><p style="margin:0">All 727 live listings were brought across with their photos, item specifics and condition notes. Until the link is switched on, new eBay listings and sales won't show on the site by themselves.</p></div>
  <div class="box acc"><span class="num">Once linked</span><h3>It keeps itself up to date</h3><p style="margin:0">Every 15 minutes the site checks your eBay shop. New listings appear, sold items are marked sold, and changes you make in the admin are sent back to eBay.</p></div>
</div>
<h3>What goes which way</h3>
<table><thead><tr><th>When you…</th><th>What happens</th></tr></thead><tbody>
<tr><td><b>List something new on eBay</b></td><td>It appears on the website within 15 minutes, photos and all, with a suggested grade for you to check</td></tr>
<tr><td><b>Sell something on eBay</b></td><td>It's marked Sold on the website and drops out of the shop</td></tr>
<tr><td><b>End a listing on eBay</b></td><td>It's hidden on the website</td></tr>
<tr><td><b>Change a price, title or quantity in your admin</b></td><td>The change is sent to the eBay listing</td></tr>
<tr><td><b>Mark something sold or hidden in your admin</b></td><td>The eBay listing is ended</td></tr>
<tr><td><b>Add a new item in your admin</b></td><td>It goes on the website straight away. Listing it on eBay from the admin is an optional extra, switched on once your eBay postage and returns policies are set up</td></tr>
<tr><td><b>Change grades, notes, featured items or photos order</b></td><td>Website only. eBay is left as it is</td></tr>
</tbody></table>
<h3>Linking it: two minutes, once</h3>
<ol class="steps2">
  <li><b>I set up the eBay side</b>I register Backswing's website with eBay's developer programme, so eBay knows it's allowed to ask for access</li>
  <li><b>You press Link eBay in your admin</b>On the eBay link tab, shown on the next pages</li>
  <li><b>You sign in to eBay and press Agree</b>This happens on eBay's own website. Your eBay password is never typed into, or seen by, the website or Dunnworks</li>
  <li><b>That's it</b>You're brought back to the admin, the link shows On, and it checks every 15 minutes from then on</li>
</ol>
<div class="box"><h3>Good to know</h3>
<ul class="check">
  <li><b>No double selling</b><small>Payment only ever happens on eBay, so an item can't be bought twice</small></li>
  <li><b>No extra fees</b><small>A sale through the website is a normal eBay sale, with the same fees you pay now</small></li>
  <li><b>You can switch it off</b><small>The link can be removed at any time from your eBay account settings, and the website keeps the last copy</small></li>
  <li><b>Nothing changes on eBay unless you change it</b><small>The only things sent to eBay are the edits you make in your admin</small></li>
</ul></div>
`});

S.push({ kicker: 'Your admin', title: 'Running the shop yourself', html: `
<p class="lead">Everything you'd want to change is in your admin, at <b>backswinggolf.co.uk/#/admin</b>, or from the Admin link in the footer of every page. It works on a phone as well as a computer.</p>
${fig(shot('adm-login'), 'Sign in with your email and password. First time in, use Set or reset my password and a link arrives by email')}
<h3>Stock</h3>
${fig(shot('adm-stock'), 'Every item, newest changes first. Search by name or eBay item number, filter by status or type, or show only items whose grade still needs checking')}
<div class="g2">${fig(shot('adm-edit'), 'Edit an item: title, price and all the details')}${fig(shot('adm-edit-2'), 'Grade, eBay condition and the "I have checked the grade" tick')}</div>
<ul class="check two">
  <li><b>Photos</b><small>Drag in new ones, reorder, remove; the first is the shop photo. Resized for you</small></li>
  <li><b>Mark as sold</b><small>One button. Comes off the shop, and off eBay once linked</small></li>
  <li><b>Feature on the home page</b><small>Tick it, and it appears under Worth a look</small></li>
  <li><b>Hide</b><small>Take something off the shop without deleting it</small></li>
</ul>
<div class="g2">${fig(shot('adm-add'), 'Add an item that isn\'t on eBay, such as a trade-in you\'ve just bought')}${fig(shot('adm-edit-3'), 'Quantity, status, featured, then Save changes')}</div>
<h3>Trade-ins ${EX}</h3>
${fig(shot('adm-tradeins'), 'Every Sell your clubs enquiry with its photos. Set a status and an offer, keep private notes, and press Email an offer for a ready-written reply. Shown with example enquiries')}
<h3>Page wording</h3>
${fig(shot('adm-wording'), 'Change the headline, the strip across the top, the delivery lines and more. It shows on the site straight away')}
<h3>eBay link</h3>
<div class="g2">${fig(shot('adm-ebay-off'), 'Today: the link is off, with the Link eBay button ready')}${fig(shot('adm-ebay-on'), `Once linked: last checked time and recent activity ${EX}`)}</div>
<p class="note">People who can sign in are added by Dunnworks. Tell me whose email addresses should have access.</p>
`});

S.push({ kicker: 'What happens next', title: 'From preview to live', html: `
<ol class="steps2">
  <li><b>You have a look</b>Open the preview on your phone and computer. Try the logos and colour schemes, and note anything you'd change</li>
  <li><b>You send the details</b>The checklist near the front of this pack: logo, colours, business details, WhatsApp number, delivery wording and domain access</li>
  <li><b>We link eBay</b>I set up the eBay side, then you press Link eBay and agree. From then on the stock looks after itself</li>
  <li><b>You sign it off, and it goes live</b>On backswinggolf.co.uk, hosted the same way as my other client sites: fast, secure, and with no monthly page-builder licence</li>
  <li><b>Then your socials</b>I set up Instagram and Facebook in the new brand and you're added as an admin. Six months of posts are written and scheduled in Buffer: new stock, price drops, left-handed picks, grade explainers and trade-in prompts</li>
</ol>
<div class="box acc"><h3>After launch</h3><p style="margin:0">I'll also give each item its own page that Google can show in search results, list your stock free on Google Shopping, and add visitor stats so you can see what's working. None of it needs anything from you.</p></div>
`});

const pack = {
  for: 'Backswing Golf', from: 'Tony, Dunnworks', title: 'Your new website', kicker: 'Website, brand and eBay shop',
  lede: 'A full shop on your own domain, a new brand, and a two-way link to your eBay shop. Everything in one place.',
  preview_note: 'Every page works, and the stock is live from your eBay shop. Anything highlighted in gold is a detail I need from you.',
  start_title: 'The short version',
  intro: `<p class="lead">Your new website is built as a working preview. All 727 listings from your eBay shop are on it, with their photos, specifications and condition notes. Customers can search and filter them properly, by type, hand, brand, shaft flex, grade and price.</p>
<p>Checkout stays on eBay, so you keep one stock count, your feedback, and eBay's Money Back Guarantee for buyers. Once your eBay account is linked, the two stay in step on their own: new listings appear on the site, sales come off it, and price changes made in your admin go to eBay.</p>
<p>This pack shows the site, the brand and the logo options, explains the eBay link, and walks through your admin. The checklist over the page is everything I need from you.</p>`,
  owners: { backswing: 'You' }, golive_note: 'backswinggolf.co.uk goes live',
  sections: S,
};

const built = win.DWPack.build(D.p, D.t, pack, D.s, { origin: 'https://dunnworks.io', today: '2026-11-05' });
let html = built.html;

/* fonts inline, so the PDF never depends on Google Fonts */
const ff = (fam, file, w, st = 'normal') => `@font-face{font-family:'${fam}';font-weight:${w};font-style:${st};src:url(data:font/woff2;base64,${b64(FS + '/' + file)}) format('woff2')}`;
const fonts = [
  ff('Archivo', 'archivo/files/archivo-latin-500-normal.woff2', 500), ff('Archivo', 'archivo/files/archivo-latin-600-normal.woff2', 600), ff('Archivo', 'archivo/files/archivo-latin-700-normal.woff2', 700),
  ff('IBM Plex Sans', 'ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2', 400), ff('IBM Plex Sans', 'ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2', 500), ff('IBM Plex Sans', 'ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2', 600),
  ff('IBM Plex Mono', 'ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', 400), ff('IBM Plex Mono', 'ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2', 500),
  ff('Barlow', 'barlow/files/barlow-latin-400-normal.woff2', 400), ff('Barlow Condensed', 'barlow-condensed/files/barlow-condensed-latin-800-normal.woff2', 800),
].join('\n');
const extra = `
.shot{margin:4mm 0 5mm;break-inside:avoid}.shot img{width:100%;display:block;border:1px solid var(--line);border-radius:2mm}
.shot figcaption{font-size:8.8pt;line-height:1.45;color:var(--muted);margin-top:2mm}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:5mm;break-inside:avoid}.g2 .shot{margin:2mm 0}
.g2.boxes .box{margin:3mm 0}
.phones{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;break-inside:avoid}.phones img{border-radius:3mm}
.ex{display:inline-block;font:500 7.5pt/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:#7a5b00;background:#fff1c9;padding:3pt 5pt;vertical-align:2pt;margin-left:4pt}
.logohero{background:#FAFAF7;border:1px solid var(--line);border-radius:2mm;padding:8mm;margin:4mm 0 3mm;display:flex;justify-content:center}.logohero img{width:105mm}
.g3l{display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:4mm;break-inside:avoid}
.g3l .tile{border:1px solid var(--line);border-radius:2mm;height:32mm;display:flex;align-items:center;justify-content:center;padding:6mm;background:#FAFAF7}
.g3l .tile img{max-width:100%;max-height:100%}.g3l .tile.dark{background:#1E2328;border-color:#1E2328}.g3l .tile.turf{background:#1F5C45;border-color:#1F5C45}
.sw{display:grid;grid-template-columns:repeat(5,1fr);gap:3mm;margin:3mm 0}.sw i{display:block;height:16mm;border-radius:2mm;margin-bottom:2mm}
.sw b{display:block;font:600 9.5pt/1.2 Archivo,sans-serif}.sw span{font:400 8.5pt/1.4 "IBM Plex Mono",monospace;color:var(--muted)}
.type{display:grid;grid-template-columns:1fr 1.3fr;gap:6mm;align-items:end;border-top:1px solid var(--line);padding-top:3mm}
.type .bc{display:block;font:800 26pt/1 'Barlow Condensed';color:#1E2328}.type .b{display:block;font:400 12pt/1.4 Barlow;color:#1E2328}
.type small{display:block;color:var(--muted);font-size:8.6pt;margin-top:2mm}
.lgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm 4mm;margin:4mm 0}.lgrid>div{break-inside:avoid}
.lgbox{height:30mm;border:1px solid var(--line);border-radius:2mm;background:#FAFAF7;display:flex;align-items:center;justify-content:center;padding:4mm;margin-bottom:2mm}
.lgbox img{max-width:100%;max-height:100%}.lgrid b{display:block;font:600 10pt/1.2 Archivo,sans-serif}.lgrid span{display:block;font-size:8.6pt;color:var(--muted);line-height:1.35;margin-top:1pt}
.schemes{display:grid;grid-template-columns:1fr 1fr;gap:6mm 6mm;margin-top:4mm}.sch{break-inside:avoid}
.schtop{display:flex;align-items:center;justify-content:space-between;margin-bottom:2mm}.schtop img{height:9mm}
.schtop .dots i{display:inline-block;width:6mm;height:6mm;border-radius:50%;margin-left:1.5mm;border:1px solid rgba(0,0,0,.12)}
.schshot{width:100%;border:1px solid var(--line);border-radius:2mm;display:block;aspect-ratio:1440/430;object-fit:cover;object-position:top}
.sch b{display:block;font:700 12pt/1.2 Archivo,sans-serif;margin-top:2mm}.sch span{font:400 8.4pt/1.4 "IBM Plex Mono",monospace;color:var(--muted)}
.diag{width:100%;margin:4mm 0 2mm;break-inside:avoid}
.steps2{counter-reset:s;margin:3mm 0;padding:0;list-style:none}.steps2 li{counter-increment:s;position:relative;padding:0 0 0 13mm;margin:0 0 4mm;break-inside:avoid}
.steps2 li::before{content:counter(s);position:absolute;left:0;top:-1pt;width:8mm;height:8mm;border-radius:50%;background:var(--acc);color:#fff;font:700 11pt/8mm Archivo,sans-serif;text-align:center}
.steps2 li b{display:block;font:600 11pt/1.3 Archivo,sans-serif;margin-bottom:1pt}
`;
html = html.replace(/<link rel="preconnect"[^>]*>/g, '').replace(/<link href="https:\/\/fonts.googleapis.com[^>]*>/, '')
  .replace('<style>', '<style>' + fonts + '\n' + extra + '\n');
fs.writeFileSync(HERE + '/pack.html', html);

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const p = await b.newPage();
  await p.goto('file://' + HERE + '/pack.html', { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: HERE + '/Backswing-Golf-Your-new-website.pdf', preferCSSPageSize: true, printBackground: true });
  await b.close();
  console.log('pdf written', built.file, built.open, 'open');
})();
