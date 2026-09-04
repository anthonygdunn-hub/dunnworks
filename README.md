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
assets/img/mark.svg, favicon.svg
```

## Before it goes live

Email is info@dunnworks.io, which runs through Wix and Gmail. Phone is +44 (0)7377 599 023, shown on the contact page and in every footer.

Work through this list. Everything marked placeholder is visible on the page, so nothing gets published by accident.

1. Background paragraph. about.html has a placeholder note asking for 2 or 3 lines on your background. Write it and delete the note.
2. Prices. £750, £1,450, £950 and £35 a month are starting points, and the extras run from £150 to £600. Change any of them, then check the same figures on index.html, services.html and contact.html.
3. Claims to confirm. Four numbers appear as counters: 4 sites live, 2 weeks typical build, 1 working day reply, £0 monthly platform fee. The comparison table on the home page quotes £17 to £45 for platform fees and 2 to 5 MB page weight. Confirm you are happy standing behind each one.
4. Screenshots. The four project cards use a drawn browser frame rather than a picture. Real screenshots would be stronger. Take one of each site at 1600 by 1000, save as WebP in assets/img, and replace the `<div class="mock">` block with an `<img>`.
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
4. Add real screenshots as soon as you have them.

## Changing the look

Everything is set by the tokens at the top of assets/css/styles.css. The accent is `--accent: #7000ff`. Change that one value and the buttons, rules, counters and dot field all follow.

## Wording

Copy is written in first person singular, since Dunnworks is one person and that converts better than a team voice. If you would rather use "we", search for " I " and rewrite the affected sentences, mainly on the about and contact pages.
