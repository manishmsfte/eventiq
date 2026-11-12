/* eslint-disable no-console */
require("dotenv").config();

const {
  listEvents,
  getLoginUserByEmailAndType,
  findActiveRegistrationByEventAndEmail,
  getFollowUpTemplateByEvent
} = require("../db");
const { sendPostEventFeedbackEmail } = require("../services/mailer");

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  console.log("Running smoke checks...");

  const events = await listEvents();
  assertCondition(Array.isArray(events), "Events query did not return an array");
  assertCondition(events.length > 0, "No events found in store for smoke validation");

  const firstEvent = events[0];
  assertCondition(firstEvent && firstEvent.id, "First event is missing id");
  console.log(`Using event: ${firstEvent.id} (${firstEvent.title || "untitled"})`);

  const personaChecks = ["publisher", "supervisor", "speaker", "proctor"];
  const personaSummary = [];
  for (const persona of personaChecks) {
    const user = await getLoginUserByEmailAndType(process.env.SMOKE_LOGIN_EMAIL || "", persona);
    personaSummary.push({ persona, found: Boolean(user) });
  }

  console.log("Persona login lookup summary (email from SMOKE_LOGIN_EMAIL):", personaSummary);

  const dedupeEmail = String(process.env.SMOKE_REG_EMAIL || "smoke.registrant@example.com").toLowerCase();
  const existingRegistration = await findActiveRegistrationByEventAndEmail(firstEvent.id, dedupeEmail);
  if (existingRegistration) {
    console.log(
      `Registration dedupe check OK: active registration already exists for ${dedupeEmail} on event ${firstEvent.id}`
    );
  } else {
    console.log(
      `Registration dedupe check NOTE: no active registration for ${dedupeEmail} on event ${firstEvent.id}; route-level dedupe path cannot be asserted against existing data.`
    );
  }

  const followUpTemplate = await getFollowUpTemplateByEvent(firstEvent.id);
  console.log(
    `Follow-up template ${followUpTemplate ? "found" : "not found"} for event ${firstEvent.id}`
  );

  if (String(process.env.SMOKE_SEND_FOLLOWUP || "false").toLowerCase() === "true") {
    assertCondition(process.env.SMOKE_FOLLOWUP_TO, "Set SMOKE_FOLLOWUP_TO to send test follow-up email");

    const result = await sendPostEventFeedbackEmail({
      baseUrl: process.env.BASE_URL || "http://localhost:3000",
      event: firstEvent,
      registration: {
        attendeeEmail: String(process.env.SMOKE_FOLLOWUP_TO).trim().toLowerCase()
      },
      followUpTemplate
    });

    console.log("Follow-up send result:", result);
  } else {
    console.log("Skipping follow-up send (set SMOKE_SEND_FOLLOWUP=true to execute send path).");
  }

  console.log("Smoke checks completed.");
}

run().catch((error) => {
  console.error("Smoke checks failed:", error.message);
  process.exitCode = 1;
});
