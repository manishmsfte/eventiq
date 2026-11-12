(() => {
  const form = document.getElementById("eventFeedbackForm");
  if (!form) return;

  const steps = Array.from(form.querySelectorAll("[data-feedback-step]"));
  const followUpFields = document.getElementById("feedbackFollowUpFields");
  const email = form.elements.namedItem("candidateEmail");
  const consent = form.elements.namedItem("contactConsent");
  const projectTypes = Array.from(form.querySelectorAll('input[name="projectType"]'));
  const followUpTypes = Array.from(form.querySelectorAll('input[name="followUpType"]'));
  const submit = document.getElementById("feedbackSubmit");
  const back = document.getElementById("feedbackBack");
  const labPanel = document.getElementById("feedbackLabPanel");
  const labToggle = document.querySelector("[data-feedback-show-lab]");
  const sessionList = form.querySelector(".feedback-session-list");
  const sessionRows = Array.from(form.querySelectorAll(".feedback-session-row"));
  const pagination = form.querySelector(".feedback-session-pagination");
  const pageButtons = Array.from(form.querySelectorAll("[data-feedback-session-page]"));
  let activeStep = form.dataset.initialStep;
  let pageIndex = 0;
  let pageSize = 4;
  let initialSessionPage = true;

  function wantsFollowUp() {
    return form.elements.namedItem("needsProjectHelp").value === "yes";
  }

  function updateRequiredChoices(inputs, message) {
    if (inputs.length) {
      inputs[0].setCustomValidity(
        !followUpFields.disabled && !inputs.some((input) => input.checked) ? message : ""
      );
    }
  }

  function updateFollowUp() {
    const requestingHelp = wantsFollowUp();
    followUpFields.disabled = activeStep !== "follow-up" || !requestingHelp;
    email.required = !followUpFields.disabled;
    consent.required = !followUpFields.disabled;
    updateRequiredChoices(projectTypes, "Please select Existing project, New project, or both.");
    updateRequiredChoices(followUpTypes, "Please choose at least one follow-up type.");
    submit.textContent = activeStep === "ratings" && requestingHelp ? "Continue" : "Submit feedback";
    back.hidden = activeStep !== "follow-up";
  }

  function paginateSessions() {
    if (!sessionList || form.hidden || activeStep !== "ratings") return;
    const firstVisibleIndex = pageIndex * pageSize;
    pagination.hidden = false;
    sessionRows.forEach((row) => { row.hidden = false; });
    const rowHeight = Math.max(...sessionRows.map((row) => row.getBoundingClientRect().height));
    const headerHeight = sessionList.querySelector("thead").getBoundingClientRect().height;
    pageSize = Math.max(1, Math.min(sessionRows.length, Math.floor((sessionList.clientHeight - headerHeight) / rowHeight)));
    const selectedIndex = sessionRows.findIndex((row) => row.dataset.sessionId === form.dataset.selectedSession);
    pageIndex = Math.floor(
      (initialSessionPage && selectedIndex >= 0 ? selectedIndex : firstVisibleIndex) / pageSize
    );
    initialSessionPage = false;
    const pageCount = Math.ceil(sessionRows.length / pageSize);
    pageIndex = Math.min(pageIndex, pageCount - 1);
    const start = pageIndex * pageSize;
    sessionRows.forEach((row, index) => {
      row.hidden = index < start || index >= start + pageSize;
    });
    pagination.hidden = pageCount <= 1;
    form.querySelector("[data-feedback-session-range]").textContent =
      `${start + 1}-${Math.min(start + pageSize, sessionRows.length)} of ${sessionRows.length}`;
    pageButtons[0].disabled = pageIndex === 0;
    pageButtons[1].disabled = pageIndex === pageCount - 1;
  }

  function showStep(step, focus = true) {
    activeStep = step;
    steps.forEach((section) => { section.hidden = section.dataset.feedbackStep !== step; });
    updateFollowUp();
    paginateSessions();
    if (focus) {
      const currentStep = steps.find((section) => !section.hidden);
      const target = currentStep.querySelector("input:checked, input:not([type=hidden])") || currentStep;
      target.focus();
    }
  }

  form.addEventListener("change", (event) => {
    if (event.target.name === "needsProjectHelp" && wantsFollowUp()) {
      showStep("follow-up");
    } else {
      updateFollowUp();
    }
  });
  form.addEventListener("invalid", (event) => {
    const step = event.target.closest("[data-feedback-step]");
    if (step && step.hidden) showStep(step.dataset.feedbackStep, false);
  }, true);
  form.addEventListener("submit", (event) => {
    if (activeStep === "ratings" && wantsFollowUp()) {
      event.preventDefault();
      showStep("follow-up");
    }
  });
  back.addEventListener("click", () => showStep("ratings"));

  pageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      pageIndex += Number(button.dataset.feedbackSessionPage);
      paginateSessions();
    });
  });
  form.querySelectorAll("[data-feedback-clear-rating]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest("tr").querySelectorAll('input[type="radio"]').forEach((input) => { input.checked = false; });
    });
  });

  function showLabDetails(show) {
    labPanel.hidden = !show;
    form.hidden = show;
    labToggle.setAttribute("aria-expanded", String(show));
    if (show) {
      const labTarget = labPanel.querySelector("input[type=email], button, a");
      if (labTarget) labTarget.focus();
    } else {
      showStep(activeStep);
    }
  }

  labToggle.addEventListener("click", () => showLabDetails(labPanel.hidden));
  document.querySelector("[data-feedback-return]").addEventListener("click", () => showLabDetails(false));
  window.addEventListener("resize", paginateSessions);
  window.addEventListener("load", paginateSessions);
  showStep(activeStep, false);
  requestAnimationFrame(paginateSessions);
})();
