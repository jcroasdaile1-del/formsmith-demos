# Formsmith marketing site and live demos

This repository contains the static Formsmith marketing website and the interactive software demonstrations it links to. It is built with HTML, CSS, and vanilla JavaScript so it can run directly on GitHub Pages without a build step or paid web host.

The marketing site is the repository root. Existing demo files and folders remain at their current URLs.

## Site structure

```text
formsmith-demos/
├── index.html                  # Home
├── demos.html                  # Interactive demos
├── portfolio.html              # All projects and statuses
├── industries.html             # Industry-specific examples
├── pricing.html                # Custom pricing approach
├── about.html                  # Brand and company positioning
├── faq.html                    # Frequently asked questions
├── contact.html                # General inquiry form
├── quote.html                  # Five-step quote request wizard
├── privacy.html                # Current website and form privacy notice
├── 404.html                    # GitHub Pages not-found page
├── projects/                   # Reusable project-detail shells
├── assets/
│   ├── css/site.css            # Complete light/dark responsive design system
│   ├── js/site-data.js         # Central projects, demos, industries, FAQs, and settings
│   ├── js/site.js              # Shared navigation, footer, page rendering, and contact form
│   ├── js/quote-wizard.js      # Quote steps, review, validation, and isolated submission
│   └── favicon.svg             # Temporary Formsmith favicon/lettermark
├── portfolio-assets/           # Existing project screenshots
├── tests/site-check.mjs        # Static link, structure, and production-gate checks
├── tests/browser-audit.mjs     # Responsive, theme, interaction, and form regression checks
├── .nojekyll                   # Bypasses Jekyll processing on GitHub Pages
└── [existing demo files]       # Working apps linked from the marketing site
```

## Run locally

The pages can be opened directly, but a small local server more closely matches GitHub Pages.

From this repository folder:

```powershell
py -m http.server 8000
```

If `py` is unavailable, try:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/`.

Stop the server with `Ctrl+C`.

## Where to edit content

### Site-wide data

Edit [`assets/js/site-data.js`](assets/js/site-data.js) for:

- contact information and social links;
- GitHub Pages and custom-domain settings;
- quote and contact form endpoints;
- portfolio projects and live demo URLs;
- project descriptions, status labels, features, and screenshots;
- industries and workflow examples;
- frequently asked questions;
- options shown in the quote wizard.

This is a normal JavaScript object rather than fetched JSON. It supports comments and continues to work when the site is viewed locally without a server.

### Page text

Edit the matching root HTML file for page-specific headlines and sections. Shared project cards, industry sections, FAQs, navigation, and the footer are rendered from `site-data.js` so they only need to be changed once.

### Styling

Edit [`assets/css/site.css`](assets/css/site.css). Colors, spacing, typography, light mode, and dark mode are controlled by variables near the top. Dark mode is automatic through `prefers-color-scheme`; there is intentionally no manual theme switch in this version.

## Replace text and images

1. Add optimized images to `portfolio-assets/` or a new folder under `assets/`.
2. Prefer WebP, AVIF, SVG, or well-compressed PNG/JPEG files.
3. Record the image's real pixel width and height.
4. Update the project's `screenshots` array in `assets/js/site-data.js`.
5. Add accurate `alt`, `width`, `height`, and optional `caption` values.

Example:

```js
screenshots: [
  {
    src: "portfolio-assets/my-project-dashboard.webp",
    alt: "Dashboard showing today's jobs and follow-up items",
    caption: "Daily operations overview",
    width: 1600,
    height: 900,
    placeholder: false
  }
]
```

Screenshots below the fold load lazily. Explicit dimensions prevent layout movement while they load.

The temporary `assets/favicon.svg` and CSS lettermark can be replaced after final branding is selected. The About page intentionally uses a text-based values panel until final brand imagery is available.

## Add a portfolio project

1. Add a new object to the `projects` array in `assets/js/site-data.js`.
2. Give it a unique lowercase `slug` using hyphens.
3. Set an honest `status`, such as `Live Demo` or `In Development`.
4. Add its repository-relative demo URL without a leading slash.
5. Add screenshot data, or leave `screenshots: []` to use the CSS interface preview.
6. Copy an existing file in `projects/` and update its:
   - filename;
   - page title and meta description;
   - canonical and Open Graph URLs;
   - `data-project` slug on the `<body>`.
7. Set `detailPath` in the project object to that new page.
8. Set `homepage: true` and `homepageOrder` only if it should appear in the featured home grid.
9. Run the checks described below.

The shared JavaScript automatically adds the project to Portfolio and, if it has a configured demo URL, to Demos.

## Update demo links

Each project's demo configuration lives in `assets/js/site-data.js`:

```js
demo: {
  url: "my-demo/index.html",
  label: "Launch My Demo",
  external: false,
  placeholder: false,
  notice: "Uses fictional sample information."
}
```

- Use paths relative to the repository root.
- Do not begin a path with `/`; GitHub project sites are hosted under a repository subdirectory.
- Existing internal demos automatically open in a new tab from marketing cards.
- If a demo is not ready, use an empty `url` and `placeholder: true`. The renderer displays a non-clickable “Demo coming soon” control instead of a dead `#` link.

## Connect the forms

Both forms ship in development mode. They validate and the quote wizard builds a complete review, but no information is transmitted. When a visitor presses submit, the site explicitly says that the information was not sent.

Configuration is isolated in `assets/js/site-data.js`:

```js
forms: {
  quote: {
    mode: "development", // change to "endpoint" when ready
    provider: "none",
    endpoint: ""
  },
  contact: {
    mode: "development",
    provider: "none",
    endpoint: ""
  }
}
```

To connect Google Apps Script, Formspree, or another service:

1. Create and test the public form endpoint.
2. Review its CORS rules and expected request format.
3. Put the public endpoint URL in `endpoint`.
4. Set `mode` to `"endpoint"`.
5. If the service requires a different payload or headers, edit only the submission block in `assets/js/quote-wizard.js` or `assets/js/site.js`.
6. Submit test data and confirm the real success state appears only after the service returns a successful HTTP response.
7. Update `privacy.html` with the provider, retention practice, and final privacy contact.
8. Enforce validation, request-size limits, allowed origins/CORS, and spam or rate controls at the endpoint. Browser validation is not a security boundary.

Never put a secret API key, private token, or service-account credential in this repository. GitHub Pages JavaScript is public.

The quote wizard deliberately does not use `localStorage` or `sessionStorage` for customer information.

## Validate the site

Install the test dependency once, then run the repository checks with Node.js:

```powershell
npm install
npm run test:site
npm run test:archery
node --check assets/js/site-data.js
node --check assets/js/site.js
node --check assets/js/quote-wizard.js
```

The site check verifies the marketing pages, relative links, unique titles, valid non-placeholder canonical and Open Graph URLs, duplicate IDs, image alternative text and dimensions, project/demo/screenshot paths, required ownership and budget rules, and quote step structure. The Archery suite separately exercises six import formats and five full season sizes, including odd-team own-average matchups.

After real contact details and form endpoints are configured, run the stricter launch gate:

```powershell
npm run test:production
```

The production gate intentionally fails while contact channels, form providers/endpoints, or preview-only contact and privacy wording remain unfinished.

Run the full browser regression suite with the locally declared Puppeteer dependency:

```powershell
npm run test:browser
```

It sweeps every marketing page across phone, tablet, laptop, and desktop widths in light and dark modes, and smoke-tests every configured demo at phone, laptop, and desktop widths. It also exercises the mobile menu, filters, FAQ ownership answer, development and mocked-endpoint behavior for both forms, the complete quote wizard, no-JavaScript fallbacks, nested 404 behavior, and the GitHub Pages project path.

Before a production launch, also review at these widths in a real browser:

- 360px mobile;
- 768px tablet;
- 1280px desktop;
- operating-system light mode;
- operating-system dark mode;
- keyboard-only navigation;
- reduced-motion mode.

Test the mobile menu, every portfolio filter, every demo link, contact-form validation, all quote wizard Back/Continue/Edit controls, an empty quote submission, and development-mode submission messaging. A Lighthouse pass in Chrome is also recommended.

## Deploy with GitHub Pages

This repository is deployment-compatible with GitHub Pages from the repository root. It is not production-ready until `node tests/site-check.mjs --production` passes and the real contact/form configuration has been verified.

1. Push the files to GitHub.
2. Open the repository on GitHub.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)` folder.
6. Save and wait for the Pages build to finish.
7. Open the URL shown by GitHub Pages.

For this repository, the current Pages URL is:

```text
https://jcroasdaile1-del.github.io/formsmith-demos/
```

Because all internal assets use relative paths, the site works from that project URL. The existing demo routes remain inside the same repository.

## Connect a custom domain later

1. Buy or choose the domain.
2. Follow GitHub's current Pages instructions for the required DNS records.
3. Add the domain in **Settings → Pages → Custom domain** and enable HTTPS after DNS is valid.
4. Update `customDomain` and `canonicalBaseUrl` in `assets/js/site-data.js`.
5. Replace `https://jcroasdaile1-del.github.io/formsmith-demos/` in every marketing/project HTML file, `sitemap.xml`, and `robots.txt` with the final HTTPS origin.
6. Update Open Graph image URLs if the asset path changes.
7. Change the project-root paths in `404.html` if the repository path changes; use `/` when a custom domain serves the site from the domain root.
8. Confirm GitHub's generated `CNAME` file is committed if applicable.
9. Re-run both validation scripts and inspect the deployed canonical URLs.

Do not add a manual `<base>` element. Relative paths are what allow the site to work both under the GitHub project path and a future custom domain.

## Placeholder values still to replace

Search the central configuration for `REPLACE_ME`, `REPLACE-ME`, `000)`, and `isPlaceholder`.

Before launch, confirm or replace:

- final email address;
- final phone number and click-to-call value;
- Facebook Messenger page URL and label;
- final service-area wording;
- custom domain and the current GitHub Pages canonical/Open Graph URLs, if applicable;
- contact and quote form endpoints/provider settings;
- privacy provider, retention, contact process, and legal review;
- final logo, favicon, and brand imagery;
- dedicated screenshots for Travel Agency Manager, Teacher Tracker, and Equipment Inventory and Profit Tracker;
- project statuses, descriptions, technologies, and demo notices;
- final social sharing image choices.

The existing demo URLs are already configured and are not placeholders.

## Editing cautions

- Keep normal internal paths repository-relative and do not begin them with `/`. The root-aware paths in `404.html` are the deliberate exception required for nested GitHub Pages 404 requests.
- Preserve `target="_blank"` with `rel="noopener noreferrer"` for live demo links.
- Do not describe an in-development build as completed.
- Do not add client names, testimonials, usage statistics, pricing, or performance claims without verification.
- Do not commit customer form submissions or production secrets.
- Project-detail pages use JavaScript for the full shared layout and include concise `<noscript>` summaries. Keep their unique static titles, descriptions, social metadata, and fallback summaries accurate.
