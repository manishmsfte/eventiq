(() => {
  const dialog = document.getElementById("paste-agenda-panel");
  const choices = document.getElementById("agendaTemplateChoices");
  const status = document.getElementById("agendaTemplateStatus");
  const retry = document.getElementById("retryAgendaTemplates");
  let templatesLoaded = false;
  let loading = false;

  async function loadTemplates() {
    if (!dialog || templatesLoaded || loading) return;
    loading = true;
    retry.hidden = true;
    status.textContent = "Loading CET session templates...";
    try {
      const response = await fetch(dialog.dataset.templatesUrl, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(await response.text() || "CET templates could not be loaded.");
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("Sign in again to load CET templates.");
      }
      const result = await response.json();
      if (!Array.isArray(result.templates) || !result.templates.length) throw new Error("No CET templates were returned.");
      choices.replaceChildren();
      result.templates.forEach((template) => {
        const card = document.createElement("section");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `Use ${template.name} CET template`;
        button.disabled = !template.available;
        const description = document.createElement("p");
        description.textContent = template.available
          ? `${template.sourceTitle} (${template.sourceDate}). ${template.sessionCount} sessions, ${template.durationMinutes} minutes.`
          : template.reason;
        card.append(button, description);
        choices.append(card);
        button.addEventListener("click", () => {
          document.getElementById("agendaTable").value = template.agendaTable;
          const duration = document.getElementById("overallDurationMinutes");
          duration.value = String(Math.max(Number(duration.value) || 0, template.durationMinutes));
          duration.dispatchEvent(new Event("input", { bubbles: true }));
          status.textContent = `${template.name} CET template loaded for review. Nothing is saved until Import Pasted Agenda. Add breaks after importing.`;
        });
      });
      status.textContent = "Choose a CET template above or paste your own agenda below.";
      if (!result.templates.some((template) => template.available)) {
        EventIQ.notify("No published CET session templates are currently available. You can still paste your own agenda.", { type: "error" });
      }
      templatesLoaded = true;
    } catch (error) {
      console.error("CET template lookup failed", error);
      status.textContent = "CET templates could not be loaded. Retry, or paste your own agenda below.";
      retry.hidden = false;
      EventIQ.notify(error.message, { type: "error" });
    } finally {
      loading = false;
    }
  }
  dialog?.addEventListener("agenda:open", loadTemplates);
  retry?.addEventListener("click", loadTemplates);

  const member = document.getElementById("bulkStaffingMember");
  const selectAll = document.getElementById("selectAllStaffingSessions");
  const checkboxes = Array.from(document.querySelectorAll(".staffing-session-checkbox"));
  const summary = document.getElementById("staffingSelectionSummary");
  const apply = document.getElementById("applyBulkStaffing");
  if (!member) return;

  function updateSelection(reset = false) {
    checkboxes.forEach((checkbox) => {
      const available = JSON.parse(checkbox.closest("tr").dataset.availableMembers).includes(member.value);
      checkbox.disabled = !available;
      if (!available) checkbox.checked = false;
      else if (reset) checkbox.checked = true;
    });
    const available = checkboxes.filter((checkbox) => !checkbox.disabled);
    const selected = available.filter((checkbox) => checkbox.checked);
    selectAll.disabled = !available.length;
    selectAll.checked = available.length > 0 && selected.length === available.length;
    selectAll.indeterminate = selected.length > 0 && selected.length < available.length;
    apply.disabled = !member.value || !selected.length;
    summary.textContent = !member.value
      ? "Choose a team member to see available sessions."
      : `${selected.length} of ${available.length} available sessions selected. ${checkboxes.length - available.length} outside this person's availability.`;
    apply.textContent = selected.length ? `Apply to ${selected.length} Selected Session${selected.length === 1 ? "" : "s"}` : "Apply to Selected Sessions";
  }
  member.addEventListener("change", () => updateSelection(true));
  checkboxes.forEach((checkbox) => checkbox.addEventListener("change", () => updateSelection()));
  selectAll.addEventListener("change", () => updateSelection());
  updateSelection();
})();
