# SAXPDF SEO-ready static project

## Included
- `index.html`: homepage with crawlable links to all eight tool pages.
- Eight dedicated tool pages in folders: `merge-pdf/`, `split-pdf/`, `rotate-pdf/`, `crop-pdf/`, `pdf-to-jpg/`, `jpg-to-pdf/`, `add-watermark-to-pdf/`, `add-page-numbers-to-pdf/`.
- `app.js` and `styles.css`: shared tool logic and design.
- `sitemap.xml` and `robots.txt`.
- `privacy.html`, `terms.html`, `contact.html`, and `legal.css`.

## Test locally
- You can double-click `index.html`; internal navigation has a `file://` compatibility shim for local browsing.
- For the most accurate test (especially PDF.js worker behavior), run a local server from this folder: `python3 -m http.server 8000`, then open `http://localhost:8000`.
- Stop the server with `Ctrl+C`.

## Deploy
1. Back up your current GitHub/Vercel project.
2. Upload the contents of this project folder to the root of the repository that Vercel deploys. Keep the folder structure intact.
3. Ensure Vercel serves static folders with their `index.html` files (default static behavior works).
4. Open each tool URL and test selecting a file, processing it, and downloading the result.
5. Open `/sitemap.xml` and `/robots.txt`, then submit the sitemap in Google Search Console.

## Before publishing
- Confirm the Google Analytics measurement ID `G-0HQPKYNRGJ` is the correct property. The GA4 script loader is included on the homepage and each tool page.
- The homepage's AdSense configuration remains disabled and uses placeholder publisher/slot IDs. Ads will not be activated by this project. Do not enable ads until real IDs and required consent/disclosure behavior are configured.
- Replace any contact email placeholders in `privacy.html`, `terms.html`, and `contact.html` with an email address you monitor.
- Confirm the privacy statement accurately describes your implementation. The tools are designed to process selected files locally, but the site still loads third-party scripts and uses hosting/analytics services.
- If your existing production `app.js` or `styles.css` contains changes not in the uploaded `index.html`, merge those changes before deploying. This package uses the starter versions of those two files because only `index.html` was supplied for this update.

## Tool behavior notes
- The crop tool sets the PDF crop box; it does not securely erase underlying content outside the crop boundary.
- PDF-to-JPG creates one downloadable JPG per page.
- JPG-to-PDF supports JPG/JPEG and PNG.
