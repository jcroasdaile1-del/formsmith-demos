# YardStack Apps Script package

This folder is a copy/paste-ready Apps Script build of the standalone demo. It runs entirely in the browser with seeded `localStorage` data and does **not** require or modify a Google Sheet.

## Files to create in Apps Script

- `Code.gs`
- `Index.html`
- `Stylesheet.html`
- `JavaScript.html`
- `appsscript.json` (enable **Show "appsscript.json" manifest file** in Project Settings)

Deploy as a web app, execute as yourself, and choose the access level appropriate for the people who should be able to preview it. The customer-booking demo requires a shareable deployment rather than **Only myself**.

The three HTML files are generated from the GitHub Pages source. After editing `../index.html`, `../styles.css`, or `../app.js`, run:

```powershell
node build-appscript-version.mjs
```

Do not edit the generated HTML files independently; rebuild them so the static and Apps Script demos stay identical.
