(() => {
  const dialog = document.getElementById("notificationDialog");
  if (!dialog) return;
  const title = document.getElementById("notificationTitle");
  const body = document.getElementById("notificationBody");
  const close = dialog.querySelector("[data-dismiss-notification]");
  const displayed = new WeakMap();
  let returnFocus = null;
  let scanScheduled = false;

  function notify(message, { type = "info", focusTarget = null } = {}) {
    const messages = Array.isArray(message) ? message : [message];
    const texts = [...new Set(messages.map((value) => String(value || "").trim()).filter(Boolean))];
    if (!texts.length) return;
    if (!dialog.open) {
      body.replaceChildren();
      returnFocus = focusTarget || document.activeElement;
    } else if (focusTarget) {
      returnFocus = focusTarget;
    }
    if (type === "error" || !dialog.open) {
      dialog.dataset.type = type;
      title.textContent = type === "error" ? "Attention needed" : type === "success" ? "Completed" : "Update";
    }
    const existing = new Set(Array.from(body.children, (node) => node.textContent));
    texts.forEach((text) => {
      if (existing.has(text)) return;
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      body.append(paragraph);
    });
    if (!dialog.open) {
      dialog.showModal();
      close.focus();
    }
  }

  async function copyText(text, message = "Copied to clipboard.") {
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(String(text));
          copied = true;
        } catch (error) {
          console.warn("Clipboard API unavailable; trying local copy fallback", error);
        }
      }
      if (!copied) {
        const previousFocus = document.activeElement;
        const input = document.createElement("textarea");
        input.value = String(text);
        input.className = "clipboard-fallback";
        document.body.append(input);
        try {
          input.select();
          copied = document.execCommand("copy");
        } finally {
          input.remove();
          previousFocus?.focus();
        }
        if (!copied) throw new Error("Clipboard copy was not accepted.");
      }
      notify(message, { type: "success" });
      return true;
    } catch (error) {
      console.error("Clipboard copy failed", error);
      notify("Could not copy to the clipboard. Select the text and copy it manually.", { type: "error" });
      return false;
    }
  }

  function scanMessages() {
    scanScheduled = false;
    const errors = [];
    const successes = [];
    const updates = [];
    document.querySelectorAll("p.error, p.status:not(.pill), .error-banner, .status-banner, .error-message, [data-notification]").forEach((node) => {
      const text = node.textContent.trim();
      if (!text) {
        displayed.delete(node);
        return;
      }
      if (node.closest("dialog") || !node.getClientRects().length) {
        displayed.delete(node);
        return;
      }
      if (displayed.get(node) === text) return;
      displayed.set(node, text);
      const isError = node.matches(".error, .error-banner, .error-message") || node.dataset.notification === "error"
        || (node.matches("p.status") && new URLSearchParams(location.search).get("notification") === "error");
      (isError ? errors : node.dataset.notification === "success" ? successes : updates).push(text);
    });
    if (errors.length || updates.length || successes.length) {
      notify([...errors, ...updates, ...successes], { type: errors.length ? "error" : updates.length ? "info" : "success" });
    }
  }

  window.EventIQ = { ...(window.EventIQ || {}), notify, copyText };
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (returnFocus?.isConnected) returnFocus.focus();
  });
  const invalidFields = new Set();
  document.addEventListener("invalid", (event) => {
    event.preventDefault();
    invalidFields.add(event.target);
    if (invalidFields.size !== 1) return;
    setTimeout(() => {
      const fields = [...invalidFields];
      invalidFields.clear();
      notify(fields.map((field) => {
        const label = field.labels?.[0]?.textContent.trim().replace(/\s+/g, " ") || field.name || "Required field";
        return `${label}: ${field.validationMessage}`;
      }), { type: "error", focusTarget: fields[0] });
    }, 0);
  }, true);
  new MutationObserver((mutations) => {
    if (scanScheduled || mutations.every((mutation) => dialog.contains(mutation.target))) return;
    scanScheduled = true;
    requestAnimationFrame(scanMessages);
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });
  window.addEventListener("unhandledrejection", () => {
    notify("The action could not be completed. Please try again, or contact your event publisher if the problem continues.", { type: "error" });
  });
  window.addEventListener("error", (event) => {
    if (event.message) notify("A page action could not be completed. Please try again or reload the page.", { type: "error" });
  });
  scanMessages();
})();
