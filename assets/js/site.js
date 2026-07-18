(function () {
  "use strict";

  const data = window.FORMSMITH_DATA;
  if (!data) {
    console.error("Formsmith site data did not load.");
    return;
  }

  const body = document.body;
  const base = body.dataset.base || ".";
  const currentPage = body.dataset.page || "";

  function resolvePath(path) {
    if (!path || /^(?:[a-z]+:|#)/i.test(path)) return path || "";
    return `${base}/${path}`.replace(/\/\.\//g, "/");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function icon(name, className = "") {
    const paths = {
      arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
      chart: '<path d="M4 19V9M10 19V5M16 19v-8M22 19H2"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      chevron: '<path d="m9 18 6-6-6-6"/>',
      clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
      email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
      external: '<path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
      file: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6"/>',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
      layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
      menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
      message: '<path d="M21 12a8 8 0 0 1-8 8H5l-3 2 1-5a9 9 0 1 1 18-5Z"/>',
      phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.3 19.3 0 0 1-6-6A19.7 19.7 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c1 .3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      spark: '<path d="m12 2 1.5 5.2L19 9l-5.5 1.8L12 16l-1.5-5.2L5 9l5.5-1.8z"/>',
      users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
      wrench: '<path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5l8.4 8.4a2.1 2.1 0 0 1-3 3Z"/>'
    };
    return `<svg class="icon ${className}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.spark}</svg>`;
  }

  function brandMark() {
    return '<svg class="brand-mark" aria-hidden="true" viewBox="0 0 40 40"><path d="M8 8h24v7H15v4h14v7H15v8H8V8Z" fill="currentColor"/><path d="M15 19h14l-3.5 7H15v-7Z" fill="currentColor" opacity=".58"/></svg>';
  }

  function renderHeader() {
    const mount = document.querySelector("[data-site-header]");
    if (!mount) return;
    const links = data.navigation.filter((item) => !item.isPrimaryCta).map((item) => {
      const active = item.page === currentPage;
      return `<a class="nav-link${active ? " is-active" : ""}" href="${resolvePath(item.path)}"${active ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`;
    }).join("");
    mount.innerHTML = `
      <header class="site-header">
        <div class="header-inner shell">
          <a class="brand" href="${resolvePath("index.html")}" aria-label="Formsmith home">
            ${brandMark()}
            <span class="brand-copy"><strong>Formsmith</strong><small>Forged to order.</small></span>
          </a>
          <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation" aria-label="Open navigation menu">
            <span class="menu-open">${icon("menu")}</span><span class="menu-close">${icon("close")}</span>
          </button>
          <nav class="primary-nav" id="primary-navigation" aria-label="Primary navigation">
            <div class="nav-links">${links}</div>
            <a class="button button--small nav-cta" href="${resolvePath("quote.html")}">Request a Quote ${icon("arrow")}</a>
          </nav>
        </div>
      </header>`;

    const toggle = mount.querySelector(".menu-toggle");
    const nav = mount.querySelector(".primary-nav");
    const backgroundRegions = [document.querySelector("main"), document.querySelector("[data-site-footer]")].filter(Boolean);
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
      nav.classList.toggle("is-open", open);
      body.classList.toggle("menu-is-open", open);
      backgroundRegions.forEach((region) => { region.inert = open; });
      if (open) requestAnimationFrame(() => nav.querySelector("a")?.focus());
    };
    toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
    const desktopNavigation = window.matchMedia("(min-width: 56.25rem)");
    desktopNavigation.addEventListener("change", (event) => {
      if (event.matches && toggle.getAttribute("aria-expanded") === "true") setOpen(false);
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
      if (event.key === "Tab" && toggle.getAttribute("aria-expanded") === "true") {
        const focusable = [toggle, ...nav.querySelectorAll("a[href], button:not([disabled])")];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  function renderFooter() {
    const mount = document.querySelector("[data-site-footer]");
    if (!mount) return;
    const contact = data.site.contact;
    const contactLine = contact.isPlaceholder
      ? '<p class="config-note">Contact details will be added before launch.</p>'
      : `<p class="footer-email"><a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a></p>`;
    mount.innerHTML = `
      <footer class="site-footer">
        <div class="shell footer-grid">
          <div class="footer-brand">
            <a class="brand brand--footer" href="${resolvePath("index.html")}">${brandMark()}<span class="brand-copy"><strong>Formsmith</strong><small>Forged to order.</small></span></a>
            <p>Practical custom business software shaped around the way your small business already works.</p>
          </div>
          <div>
            <h2 class="footer-heading">Explore</h2>
            <ul class="footer-links"><li><a href="${resolvePath("demos.html")}">Live demos</a></li><li><a href="${resolvePath("portfolio.html")}">All projects</a></li><li><a href="${resolvePath("industries.html")}">Industries</a></li><li><a href="${resolvePath("pricing.html")}">Pricing approach</a></li></ul>
          </div>
          <div>
            <h2 class="footer-heading">Company</h2>
            <ul class="footer-links"><li><a href="${resolvePath("about.html")}">About Formsmith</a></li><li><a href="${resolvePath("faq.html")}">Frequently asked questions</a></li><li><a href="${resolvePath("contact.html")}">Contact</a></li><li><a href="${resolvePath("privacy.html")}">Privacy</a></li></ul>
          </div>
          <div>
            <h2 class="footer-heading">Start a conversation</h2>
            <p class="footer-contact">Tell us what is slowing the business down. The initial quote request is free.</p>
            <a class="text-link" href="${resolvePath("quote.html")}">Request a Quote ${icon("arrow")}</a>
            ${contactLine}
          </div>
        </div>
        <div class="shell footer-bottom"><p>&copy; <span data-current-year></span> Formsmith. All rights reserved.</p><p>Custom software for practical work.</p></div>
      </footer>`;
  }

  function projectVisual(project, eager = false) {
    const shot = project.screenshot || (project.screenshots && project.screenshots[0]);
    if (shot && shot.src) {
      return `<div class="project-visual"><img src="${resolvePath(shot.src)}" alt="${escapeHtml(shot.alt)}" width="${shot.width || 1920}" height="${shot.height || 946}" loading="${eager ? "eager" : "lazy"}" decoding="async"></div>`;
    }
    return `<div class="project-visual project-visual--generated theme-${escapeHtml(project.theme || "teal")}" role="img" aria-label="${escapeHtml(project.title)} interface concept preview">
      <div class="mini-appbar"><span></span><span></span><span></span><b>${escapeHtml(project.shortTitle || project.title)}</b></div>
      <div class="mini-layout"><div class="mini-sidebar"><i></i><i></i><i></i><i></i><i></i></div><div class="mini-main"><div class="mini-title"></div><div class="mini-stats"><i></i><i></i><i></i></div><div class="mini-panel"><span></span><span></span><span></span><span></span></div></div></div>
    </div>`;
  }

  function statusClass(status) {
    return status.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function demoAction(project, className = "button button--small") {
    if (!project.demo || !project.demo.url || project.demo.placeholder) {
      return `<span class="${className} button--disabled" aria-disabled="true">Demo coming soon</span>`;
    }
    const label = project.demo.label || "Launch Demo";
    return `<a class="${className}" href="${resolvePath(project.demo.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ${icon("external")}<span class="visually-hidden"> (opens in a new tab)</span></a>`;
  }

  function projectCard(project, index) {
    const features = (project.features || []).slice(0, 4).map((item) => `<li>${icon("check")}<span>${escapeHtml(item)}</span></li>`).join("");
    const context = [project.classification, project.demo?.notice ? "Sample data" : ""].filter(Boolean);
    return `<article class="project-card reveal" style="--reveal-delay:${Math.min(index, 3) * 70}ms" data-project-status="${statusClass(project.status)}">
      ${projectVisual(project)}
      <div class="project-card__body">
        <div class="card-eyebrow"><span>${escapeHtml(project.industry)}</span><span class="status status--${statusClass(project.status)}">${escapeHtml(project.status)}</span></div>
        <h3>${escapeHtml(project.title)}</h3>
        <div class="project-context" aria-label="Project context">${context.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
        <p>${escapeHtml(project.summary)}</p>
        <ul class="feature-list feature-list--compact">${features}</ul>
        <div class="card-actions">${demoAction(project)}<a class="button button--small button--ghost" href="${resolvePath(project.detailPath)}">View Details ${icon("chevron")}</a></div>
      </div>
    </article>`;
  }

  function renderProjectGrids() {
    document.querySelectorAll("[data-project-grid]").forEach((mount) => {
      let projects = [...data.projects];
      const mode = mount.dataset.projectGrid;
      if (mode === "home") {
        const featuredSlug = data.projects.find((project) => project.featured)?.slug;
        projects = projects
          .filter((project) => project.homepage && project.slug !== featuredSlug)
          .sort((a, b) => (a.homepageOrder ?? 99) - (b.homepageOrder ?? 99));
      }
      if (mode === "demos") {
        projects = projects
          .filter((project) => project.demo && project.demo.url && !project.demo.placeholder)
          .sort((a, b) => (a.demoOrder ?? 99) - (b.demoOrder ?? 99));
      }
      const limit = Number(mount.dataset.limit || 0);
      if (limit) projects = projects.slice(0, limit);
      mount.innerHTML = projects.map(projectCard).join("");
      if (mode === "portfolio") {
        const results = document.querySelector("[data-filter-results]");
        if (results) results.textContent = `Showing ${projects.length} ${projects.length === 1 ? "project" : "projects"}.`;
      }
    });

    const filterGroup = document.querySelector("[data-project-filters]");
    if (filterGroup) {
      filterGroup.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-filter]");
        if (!button) return;
        filterGroup.querySelectorAll("button").forEach((item) => {
          const active = item === button;
          item.setAttribute("aria-pressed", String(active));
          item.classList.toggle("is-active", active);
        });
        const filter = button.dataset.filter;
        document.querySelectorAll("[data-project-grid='portfolio'] .project-card").forEach((card) => {
          card.hidden = filter !== "all" && card.dataset.projectStatus !== filter;
        });
        const count = document.querySelectorAll("[data-project-grid='portfolio'] .project-card:not([hidden])").length;
        const results = document.querySelector("[data-filter-results]");
        if (results) results.textContent = `Showing ${count} ${count === 1 ? "project" : "projects"}.`;
      });
    }
  }

  function renderFeaturedProject() {
    const mount = document.querySelector("[data-featured-project]");
    if (!mount) return;
    const project = data.projects.find((item) => item.featured) || data.projects[0];
    mount.innerHTML = `
      <div class="featured-project__content">
        <div class="eyebrow"><span class="eyebrow-dot"></span>Featured Build</div>
        <span class="status status--${statusClass(project.status)}">${escapeHtml(project.status)}</span>
        <h2>${escapeHtml(project.title)}</h2>
        <p class="lede">${escapeHtml(project.overview || project.summary)}</p>
        <ul class="feature-cloud">${project.features.map((item) => `<li>${icon("check")} ${escapeHtml(item)}</li>`).join("")}</ul>
        <div class="button-row"><a class="button" href="${resolvePath(project.detailPath)}">View Project Details ${icon("arrow")}</a>${demoAction(project, "button button--secondary")}</div>
      </div>
      <div class="featured-project__visual">${projectVisual(project, true)}<div class="visual-note"><span>${icon("wrench")}</span><div><strong>Built around the workflow</strong><small>From first step to finished work</small></div></div></div>`;
  }

  function renderIndustryGrid() {
    document.querySelectorAll("[data-industry-grid]").forEach((mount) => {
      const limit = Number(mount.dataset.limit || 0);
      const items = limit ? data.industries.slice(0, limit) : data.industries;
      mount.innerHTML = items.map((industry, index) => `<a class="industry-card reveal" style="--reveal-delay:${Math.min(index % 4, 3) * 60}ms" href="${resolvePath(`industries.html#${industry.slug}`)}"><span class="industry-card__icon">${icon(industry.icon || "gear")}</span><h3>${escapeHtml(industry.name)}</h3><p>${escapeHtml(industry.summary)}</p><span class="card-link">See examples ${icon("arrow")}</span></a>`).join("");
    });

    const detailMount = document.querySelector("[data-industry-details]");
    if (detailMount) {
      detailMount.innerHTML = data.industries.map((industry, index) => `<article class="industry-detail reveal" id="${escapeHtml(industry.slug)}">
        <div class="industry-detail__intro"><span class="number">${String(index + 1).padStart(2, "0")}</span><span class="industry-card__icon">${icon(industry.icon || "gear")}</span><h2>${escapeHtml(industry.name)}</h2><p>${escapeHtml(industry.longDescription || industry.summary)}</p><a class="text-link" href="${resolvePath("quote.html")}">Discuss your workflow ${icon("arrow")}</a></div>
        <div class="industry-detail__examples"><h3>What Formsmith might build</h3><ul class="check-grid">${industry.examples.map((item) => `<li>${icon("check")}<span>${escapeHtml(item)}</span></li>`).join("")}</ul></div>
      </article>`).join("");
    }
  }

  function renderFaqs() {
    const mount = document.querySelector("[data-faq-list]");
    if (!mount) return;
    mount.innerHTML = data.faqs.map((faq, index) => `<details class="faq-item reveal"${index === 0 ? " open" : ""}><summary><span>${escapeHtml(faq.question)}</span><span class="faq-toggle" aria-hidden="true"></span></summary><div class="faq-answer"><p>${escapeHtml(faq.answer)}</p></div></details>`).join("");
  }

  function renderProjectDetail() {
    const mount = document.querySelector("[data-project-detail]");
    if (!mount) return;
    const slug = body.dataset.project;
    const project = data.projects.find((item) => item.slug === slug);
    if (!project) {
      mount.innerHTML = '<section class="section shell"><h1>Project not found</h1><p>This project entry could not be loaded.</p></section>';
      return;
    }
    const screenshots = (project.screenshots || []).filter((shot) => shot && shot.src);
    const isConcept = project.classification === "Concept Demo";
    const isInternal = project.classification === "Internal Project";
    const previousHeading = isConcept ? "A typical starting point" : isInternal ? "The operating challenge" : "The previous process";
    const solutionHeading = isConcept ? "The demo approach" : isInternal ? "The build direction" : "The proposed solution";
    mount.innerHTML = `
      <section class="project-hero section section--first">
        <div class="shell project-hero__grid">
          <div class="project-hero__copy">
            <a class="back-link" href="${resolvePath("portfolio.html")}">${icon("arrow")} All projects</a>
            <div class="eyebrow">${escapeHtml(project.industry)}</div>
            <div class="project-status-row"><span class="status status--${statusClass(project.status)}">${escapeHtml(project.status)}</span><span class="status status--${statusClass(project.classification)}">${escapeHtml(project.classification)}</span></div>
            <h1>${escapeHtml(project.title)}</h1>
            <p class="lede">${escapeHtml(project.summary)}</p>
            ${project.demo?.notice ? `<div class="demo-notice"><strong>Demo note:</strong> ${escapeHtml(project.demo.notice)} Please do not enter real or sensitive information.</div>` : ""}
            <div class="button-row">${demoAction(project)}<a class="button button--ghost" href="${resolvePath("quote.html")}">Request Something Similar ${icon("arrow")}</a></div>
          </div>
          ${projectVisual(project, true)}
        </div>
      </section>
      <section class="section"><div class="shell narrative-grid">
        <article><span class="section-label">01 / Overview</span><h2>Project overview</h2><p>${escapeHtml(project.overview || project.summary)}</p></article>
        <article><span class="section-label">02 / The challenge</span><h2>The business problem</h2><p>${escapeHtml(project.problem)}</p></article>
        <article><span class="section-label">03 / Starting point</span><h2>${previousHeading}</h2><p>${escapeHtml(project.previousProcess)}</p></article>
        <article><span class="section-label">04 / The system</span><h2>${solutionHeading}</h2><p>${escapeHtml(project.solution)}</p></article>
      </div></section>
      <section class="section section--tint"><div class="shell split-heading"><div><div class="eyebrow">Built for the work</div><h2>Key capabilities</h2></div><p>Every feature is included because it supports the workflow—not because it fills a generic software checklist.</p></div><div class="shell feature-grid">${project.features.map((feature, index) => `<div class="feature-tile"><span>${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(feature)}</h3></div>`).join("")}</div></section>
      <section class="section"><div class="shell"><div class="split-heading"><div><div class="eyebrow">Interface preview</div><h2>See the system in context</h2></div><p>${screenshots.length ? "Real interface screens from the current build or demonstration." : "A layout preview until final project imagery is ready."}</p></div><div class="screenshot-grid">${screenshots.length ? screenshots.map((shot) => `<figure><img src="${resolvePath(shot.src)}" alt="${escapeHtml(shot.alt)}" width="${shot.width || 1920}" height="${shot.height || 946}" loading="lazy" decoding="async"><figcaption>${escapeHtml(shot.caption || project.title)}</figcaption></figure>`).join("") : projectVisual(project)}</div></div></section>
      <section class="section section--cta"><div class="shell cta-panel"><div><div class="eyebrow eyebrow--light">Have a similar bottleneck?</div><h2>Your workflow deserves its own system.</h2><p>Tell Formsmith what you are managing today and what needs to work better.</p></div><a class="button button--light" href="${resolvePath("quote.html")}">Request a Quote ${icon("arrow")}</a></div></section>`;
  }

  function renderContactDetails() {
    const mount = document.querySelector("[data-contact-options]");
    if (!mount) return;
    const contact = data.site.contact;
    const options = [
      { icon: "email", label: "Email", value: contact.email, href: `mailto:${contact.email}` },
      { icon: "message", label: "Facebook Messenger", value: contact.facebookMessengerLabel || "Message Formsmith", href: contact.facebookMessengerUrl },
      { icon: "phone", label: "Phone", value: contact.phoneDisplay, href: `tel:${contact.phoneHref}` }
    ];
    mount.innerHTML = options.map((item) => {
      const isPlaceholder = contact.isPlaceholder || !item.href || /^(?:tel:|mailto:)$/i.test(item.href) || /YOUR_|REPLACE-ME|000\)/i.test(item.value) || /YOUR_|REPLACE-ME/i.test(item.href);
      if (isPlaceholder) return `<div class="contact-option contact-option--placeholder"><span>${icon(item.icon)}</span><div><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(item.label)} details coming soon</strong><em>Not an active contact channel yet</em></div></div>`;
      return `<a class="contact-option" href="${escapeHtml(item.href)}"${item.icon === "message" ? ' target="_blank" rel="noopener noreferrer"' : ""}><span>${icon(item.icon)}</span><div><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(item.value)}</strong></div>${icon("arrow")}</a>`;
    }).join("");
  }

  function setupContactForm() {
    const form = document.querySelector("[data-contact-form]");
    if (!form) return;
    const status = form.querySelector("[data-form-status]");
    const config = data.site.forms.contact;
    const availability = document.querySelector("[data-contact-availability]");
    if (availability && (config.mode !== "endpoint" || !config.endpoint)) {
      availability.hidden = false;
      availability.textContent = "Website preview: this form is available for testing, but submissions are not connected yet and nothing you enter will be sent.";
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.className = "form-status";
      if (!form.reportValidity()) return;
      if (config.mode !== "endpoint" || !config.endpoint) {
        status.className = "form-status form-status--development";
        status.textContent = config.developmentMessage || "Preview mode: your message was not sent.";
        status.focus();
        return;
      }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = "Sending…";
      try {
        const payload = Object.fromEntries(new FormData(form).entries());
        const privacy = data.site.forms.privacy || {};
        payload.submittedAt = new Date().toISOString();
        payload.source = "Formsmith general inquiry form";
        payload.privacyPolicyPath = privacy.policyPath || "privacy.html";
        payload.privacyPolicyVersion = privacy.policyVersion || "unversioned";
        payload.privacyConsentRecordedAt = payload.submittedAt;
        const response = await fetch(config.endpoint, { method: config.method || "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error("Submission failed");
        form.reset();
        status.className = "form-status form-status--success";
        status.textContent = config.successMessage || "Thanks—your message has been sent. Formsmith will follow up using the contact information you provided.";
      } catch (error) {
        status.className = "form-status form-status--error";
        status.textContent = "The message could not be sent. Please wait a moment and try again.";
      } finally {
        button.disabled = false;
        button.innerHTML = `Send Inquiry ${icon("arrow")}`;
        status.focus();
      }
    });
  }

  function setupReveals() {
    const items = document.querySelectorAll(".reveal");
    if (!items.length) return;
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -7%", threshold: 0.08 });
    items.forEach((item) => observer.observe(item));
  }

  function setupMisc() {
    document.querySelectorAll("[data-current-year]").forEach((node) => { node.textContent = new Date().getFullYear(); });
    document.querySelectorAll("[data-print-page]").forEach((button) => button.addEventListener("click", () => window.print()));
  }

  renderHeader();
  renderFooter();
  renderFeaturedProject();
  renderProjectGrids();
  renderIndustryGrid();
  renderFaqs();
  renderProjectDetail();
  renderContactDetails();
  setupContactForm();
  setupMisc();
  requestAnimationFrame(setupReveals);
})();
