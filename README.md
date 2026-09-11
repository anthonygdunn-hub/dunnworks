# dunnworks.io

Static website for Dunnworks, a website design and development business. Plain HTML, CSS and JavaScript, no build step, no dependencies.

## Files

```
index.html          home
services.html       services and prices
work.html           four case studies
about.html          about, principles, tools
contact.html        enquiry form and direct details
404.html            not found page
CNAME               custom domain for GitHub Pages
.nojekyll           stops GitHub Pages processing the folder as Jekyll
robots.txt
sitemap.xml
assets/css/styles.css
assets/js/main.js
assets/img/mark.svg, favicon.svg, shot-*.webp (project screenshots)
```

## Before it goes live

Email is info@dunnworks.io, which runs through Wix and Gmail. Phone is +44 (0)7377 599 023, shown on the contact page and in every footer.

Work through this list. Everything marked placeholder is visible on the page, so nothing gets published by accident.

1. Background paragraph. about.html has a placeholder note asking for 2 or 3 lines on your background. Write it and delete the note.
2. Prices. £750, £1,450, £950 and £35 a month are starting points, and the extras run from £150 to £600. Change any of them, then check the same figures on index.html, services.html and contact.html.
3. Claims to confirm. Four numbers appear as counters: 30+ sites live, 2 weeks typical build, 1 working day reply, £0 monthly platform fee. The comparison table on the home page quotes £17 to £45 for platform fees and 2 to 5 MB page weight. Confirm you are happy standing behind each one.
4. Screenshots. The four project cards now show real home page screenshots from assets/img. Retake any of them when a site changes: capture the top of the home page, crop to roughly 2 by 1, save as WebP under 20 KB, and keep the same file name.
5. Web3Forms key. In contact.html, replace `REPLACE-WITH-YOUR-WEB3FORMS-ACCESS-KEY` with the key from web3forms.com. Until you do, the form opens the visitor's email app instead, so the page still works.

## Putting it live on GitHub Pages

Same pattern as combustion-consulting and falkners-golf-society.

1. Create a repository, for example `anthonygdunn-hub/dunnworks`, and upload the contents of this folder to the root of the default branch.
2. Settings, then Pages. Choose the default branch and the root folder as the source.
3. Custom domain: dunnworks.io. The CNAME file already holds it.
4. Tick enforce HTTPS once the certificate is issued, usually within an hour.

## DNS

At whoever holds dunnworks.io, point the apex at GitHub Pages:

```
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
CNAME www   anthonygdunn-hub.github.io
```

If DNS stays at Wix, the A records work but AAAA records cannot be added, exactly as on tcooperinteriors.co.uk. That is fine, IPv6 visitors reach the site through the CNAME on www.

## After launch

1. Add the site to Google Search Console and submit https://dunnworks.io/sitemap.xml.
2. Create a Google Business Profile for the business and link it to the site.
3. Send the domain through pagespeed.web.dev and keep the result.
4. Refresh the project screenshots whenever one of those sites changes.

## Changing the look

Everything is set by the tokens at the top of assets/css/styles.css. The accent is `--accent: #7000ff`. Change that one value and the buttons, rules, counters and dot field all follow.

## Wording

Copy is written in first person singular, since Dunnworks is one person and that converts better than a team voice. If you would rather use "we", search for " I " and rewrite the affected sentences, mainly on the about and contact pages.

## The admin at /admin/

`/admin/` signs you in with a link emailed by Supabase, then lists every preview
and case study from the `dw_projects` table in project `acdpgarasgfhvupzsbxf`.
It is `noindex` and there is no link to it from anywhere on the site.

Set up once:

1. Run `supabase/dunnworks-schema.sql` in the SQL editor of that project.
2. Paste the project's anon key into `assets/js/dw-config.js`.
3. Go to `/admin/`, enter `info@dunnworks.io` and open the link it sends.

Sign in is gated on that one address, set in `dw_is_owner()` in the schema. Any
other address gets a session but the database refuses every read and write.

The tick marked **This one is live** moves the project from In progress to
Launched on `/preview/`, straight away, with nothing to rebuild or push. The
previews page reads the table on load and falls back to the markup in
`preview/index.html` if Supabase does not answer.

Passphrases live in `dw_project_secrets`, which no anonymous policy touches, so
the anon key on the public page cannot reach them.

## Reissuing a preview passphrase

A locked preview is encrypted with one AES key that never changes. The
passphrase's only job is to unwrap that key, and the wrapper is a row in
`dw_project_keys`. So reissuing a passphrase rewrites a few hundred bytes in the
database rather than rebuilding a 1MB file, and takes effect immediately.

In the admin, **New passphrase** makes one up and puts it live on the preview
and its project sheet together. **Use what I typed** does the same with your own
wording. Before writing anything it fetches the live locked page and decrypts it
with the recovered key, so a wrong stored passphrase fails safely and changes
nothing.

Two things follow from the design:

- the previous passphrase stops working, as long as Supabase is reachable
- if Supabase is down the gate falls back to the passphrase the file was built
  with, so an outage never locks a client out of their own preview

If a passphrase has to be properly dead rather than superseded, rebuild the file:

```
node tools/unlock.mjs --in=preview/<slug>/index.html --out=/tmp/p.html --pass="OLD"
node tools/lock.mjs   --in=/tmp/p.html --out=preview/<slug>/index.html \
  --client="Name" --pass="NEW"
node tools/rekey.mjs  --in=preview/<slug>/index.html --slug=<slug> --doc=site
```

`tools/rekey.mjs` swaps the gate script for the unwrapping one and prints the new
`file_salt`, which goes into that project's `dw_project_keys` row with the wrap
columns cleared.
