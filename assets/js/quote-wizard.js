(function () {
  "use strict";

  const data = window.FORMSMITH_DATA;
  const form = document.querySelector("[data-quote-wizard]");
  if (!data || !form) return;

  const options = data.quoteOptions;
  const steps = Array.from(form.querySelectorAll("[data-form-step]"));
  const progressItems = Array.from(document.querySelectorAll("[data-progress-step]"));
  const progressBar = document.querySelector("[data-progress-bar]");
  const status = form.querySelector("[data-quote-status]");
  const availability = document.querySelector("[data-quote-availability]");
  let currentStep = 0;

  if (availability && (data.site.forms.quote.mode !== "endpoint" || !data.site.forms.quote.endpoint)) {
    availability.hidden = false;
    availability.textContent = "Website preview: you can test every step, but quote submissions are not connected yet and nothing you enter will be sent.";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function optionValue(option) {
    return typeof option === "string" ? option : option.value;
  }

  function optionLabel(option) {
    return typeof option === "string" ? option : option.label;
  }

  function renderChoiceGroups() {
    form.querySelectorAll("[data-choice-options]").forEach((mount) => {
      const key = mount.dataset.choiceOptions;
      const list = options[key] || [];
      const name = mount.dataset.name;
      const type = mount.dataset.type || "checkbox";
      mount.innerHTML = list.map((option, index) => {
        const value = optionValue(option);
        const label = optionLabel(option);
        const id = `${name}-${index}`;
        return `<label class="choice-card" for="${id}"><input type="${type}" id="${id}" name="${escapeHtml(name)}" value="${escapeHtml(value)}"><span class="choice-control" aria-hidden="true"></span><span>${escapeHtml(label)}</span></label>`;
      }).join("");
    });

    form.querySelectorAll("select[data-select-options]").forEach((select) => {
      const key = select.dataset.selectOptions;
      const placeholder = select.dataset.placeholder || "Select an option";
      select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + (options[key] || []).map((option) => `<option value="${escapeHtml(optionValue(option))}">${escapeHtml(optionLabel(option))}</option>`).join("");
    });
  }

  function setStep(index, focusHeading = true) {
    currentStep = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, stepIndex) => {
      const active = stepIndex === currentStep;
      step.hidden = !active;
      step.setAttribute("aria-hidden", String(!active));
    });
    progressItems.forEach((item, itemIndex) => {
      item.classList.toggle("is-active", itemIndex === currentStep);
      item.classList.toggle("is-complete", itemIndex < currentStep);
      if (itemIndex === currentStep) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    if (progressBar) progressBar.style.width = `${(currentStep / (steps.length - 1)) * 100}%`;
    if (currentStep === steps.length - 1) buildReview();
    if (focusHeading) {
      const heading = steps[currentStep].querySelector("h2");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
      const wizardTop = document.querySelector(".quote-card");
      if (wizardTop && wizardTop.getBoundingClientRect().top < 0) wizardTop.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }
  }

  function setGroupError(group, message) {
    const error = group.querySelector("[data-choice-error]");
    if (error) error.textContent = message;
    group.classList.toggle("has-error", Boolean(message));
    group.setAttribute("aria-invalid", String(Boolean(message)));
  }

  function validateStep(index) {
    const step = steps[index];
    let valid = true;
    const fields = Array.from(step.querySelectorAll("input, select, textarea")).filter((field) => !field.disabled && field.type !== "hidden");
    for (const field of fields) {
      if (!field.checkValidity()) {
        valid = false;
        field.reportValidity();
        field.focus();
        break;
      }
    }
    step.querySelectorAll("[data-required-choice]").forEach((group) => {
      const checked = group.querySelectorAll('input[type="checkbox"]:checked, input[type="radio"]:checked').length > 0;
      setGroupError(group, checked ? "" : "Choose at least one option to continue.");
      if (!checked && valid) {
        valid = false;
        const first = group.querySelector("input");
        if (first) first.focus();
      }
    });
    return valid;
  }

  function humanValue(name, value) {
    const lookupKey = {
      employeeCount: "employeeCounts",
      currentTools: "currentTools",
      processFrequency: "processFrequencies",
      capabilities: "capabilities",
      mobileNeeded: "yesNoUnsure",
      dataImportNeeded: "yesNoUnsure",
      idealStart: "startTimeframes",
      budgetRange: "budgetRanges"
    }[name];
    const match = lookupKey ? (options[lookupKey] || []).find((option) => optionValue(option) === value) : null;
    return match ? optionLabel(match) : value;
  }

  function getValues(name) {
    return new FormData(form).getAll(name).filter(Boolean).map((value) => humanValue(name, value));
  }

  function buildReview() {
    const mount = form.querySelector("[data-review-list]");
    if (!mount) return;
    const sections = [
      {
        title: "Business information", step: 0, rows: [
          ["Business name", getValues("businessName")], ["Contact name", getValues("contactName")], ["Email", getValues("email")], ["Phone", getValues("phone")], ["Website", getValues("website")], ["Type of business", getValues("businessType")], ["Number of employees", getValues("employeeCount")]
        ]
      },
      {
        title: "Current process", step: 1, rows: [
          ["Process to improve", getValues("processToImprove")], ["Current tools", [...getValues("currentTools"), ...getValues("currentToolsOther")]], ["Biggest frustration", getValues("biggestFrustration")], ["How often", getValues("processFrequency")]
        ]
      },
      {
        title: "Desired solution", step: 2, rows: [
          ["Capabilities", [...getValues("capabilities"), ...getValues("capabilitiesOther")]], ["Mobile use", getValues("mobileNeeded")], ["Existing data to import", getValues("dataImportNeeded")], ["Ideal outcome", getValues("idealOutcome")]
        ]
      },
      {
        title: "Project expectations", step: 3, rows: [
          ["Ideal start", getValues("idealStart")], ["Target completion date", getValues("targetCompletionDate")], ["Approximate budget", getValues("budgetRange")], ["Anything else", getValues("additionalNotes")]
        ]
      }
    ];

    mount.replaceChildren();
    sections.forEach((section) => {
      const article = document.createElement("article");
      article.className = "review-section";
      const header = document.createElement("div");
      header.className = "review-section__header";
      const heading = document.createElement("h3");
      heading.textContent = section.title;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "text-button";
      edit.textContent = "Edit";
      edit.dataset.editStep = section.step;
      edit.setAttribute("aria-label", `Edit ${section.title.toLowerCase()}`);
      header.append(heading, edit);
      const list = document.createElement("dl");
      section.rows.forEach(([label, values]) => {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = values.length ? values.join(", ") : "Not provided";
        list.append(dt, dd);
      });
      article.append(header, list);
      mount.append(article);
    });
  }

  function serializeForm() {
    const payload = {};
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        if (!Array.isArray(payload[key])) payload[key] = [payload[key]];
        payload[key].push(value);
      } else {
        payload[key] = value;
      }
    }
    payload.submittedAt = new Date().toISOString();
    payload.source = "Formsmith quote wizard";
    payload.privacyPolicyPath = data.site.forms.privacy.policyPath;
    payload.privacyPolicyVersion = data.site.forms.privacy.policyVersion;
    payload.privacyConsentRecordedAt = payload.submittedAt;
    return payload;
  }

  async function submitQuote() {
    status.className = "form-status";
    const config = data.site.forms.quote;

    // FORM INTEGRATION POINT:
    // Set mode to "endpoint" and add your Google Apps Script, Formspree,
    // EmailJS proxy, or other form-service URL in assets/js/site-data.js.
    // Never place a secret API key in this client-side repository.
    if (config.mode !== "endpoint" || !config.endpoint) {
      status.className = "form-status form-status--development";
      status.textContent = config.developmentMessage || "Preview mode: your information was not sent.";
      status.focus();
      return;
    }

    const submitButton = form.querySelector('[data-submit-quote]');
    submitButton.disabled = true;
    submitButton.textContent = "Sending request…";
    try {
      const response = await fetch(config.endpoint, {
        method: config.method || "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializeForm())
      });
      if (!response.ok) throw new Error(`Submission returned ${response.status}`);
      form.hidden = true;
      const success = document.querySelector("[data-quote-success]");
      const successTitle = success.querySelector("h2");
      const successMessage = success.querySelector("p");
      if (successTitle && config.successTitle) successTitle.textContent = config.successTitle;
      if (successMessage && config.successMessage) successMessage.textContent = config.successMessage;
      success.hidden = false;
      success.focus();
      form.reset();
    } catch (error) {
      console.error("Quote submission failed:", error);
      status.className = "form-status form-status--error";
      status.textContent = "Your request could not be sent. Please wait a moment and try again.";
      status.focus();
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit Quote Request";
    }
  }

  renderChoiceGroups();
  form.querySelectorAll("[data-next-step]").forEach((button) => button.addEventListener("click", () => {
    if (validateStep(currentStep)) setStep(currentStep + 1);
  }));
  form.querySelectorAll("[data-previous-step]").forEach((button) => button.addEventListener("click", () => setStep(currentStep - 1)));
  form.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-step]");
    if (edit) setStep(Number(edit.dataset.editStep));
  });
  form.querySelectorAll("[data-required-choice]").forEach((group) => group.addEventListener("change", () => setGroupError(group, "")));
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  form.querySelectorAll('[name="targetCompletionDate"]').forEach((input) => { input.min = localToday; });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (currentStep !== steps.length - 1) return;
    if (!validateStep(currentStep)) return;
    submitQuote();
  });
  setStep(0, false);
})();
