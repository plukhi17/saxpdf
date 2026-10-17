# PDFKit — PDF tools website starter

A responsive, front-end PDF utility website inspired by the general workflow of online PDF tools. This is an independent demo and is not affiliated with iLovePDF.

## Included tools
- Merge PDF
- Split PDF (extract a page range)
- Rotate PDF
- Crop PDF (set top/right/bottom/left margins in PDF points)
- PDF to JPG (downloads each page separately)
- JPG/PNG to PDF
- Add text watermark
- Add page numbers

## Run it
1. Extract the ZIP.
2. Open `index.html` in a modern browser with internet access (the demo loads pdf-lib and PDF.js from CDNs).
3. Select a tool, add file(s), adjust options, then process and download.

For best results, serve the folder using a local static server, e.g. VS Code Live Server or `python -m http.server 8000`, then visit `http://localhost:8000`.

## Important limitations
- Browser libraries are loaded from CDNs, so an internet connection is required unless you download and host the libraries locally.
- Crop PDF uses page crop boxes and changes the visible page boundary; it does not securely erase hidden content.
- Split currently extracts a single page range into one output PDF.
- PDF to JPG creates one download per page; it does not package them into a ZIP.
- Complex PDFs, password-protected PDFs, unusual fonts, and very large files may fail or use significant memory.
- This is a front-end starter, not a production-grade clone. Before public launch, add robust validation, file-size limits, automated tests, accessibility checks, dependency pinning/self-hosting, privacy notices, and security review.
- Advanced PDF compression, OCR, PDF-to-Word, true redaction, and reliable encrypted-PDF handling need additional libraries or a server-side processing engine.

## Files
- `index.html` — page structure
- `styles.css` — responsive visual design
- `app.js` — file handling and PDF processing
