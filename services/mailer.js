const nodemailer = require("nodemailer");
const { DefaultAzureCredential } = require("@azure/identity");
const { createInvite } = require("./invite");

const smtpHost = String(process.env.SMTP_HOST || "").trim();
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = String(process.env.SMTP_USER || "").trim();
const smtpPass = String(process.env.SMTP_PASS || "").trim();
const smtpFrom = String(process.env.SMTP_FROM || "noreply@labautomation.local").trim();
const powerAutomateWebhookUrl = String(process.env.POWER_AUTOMATE_WEBHOOK_URL || "").trim();
const powerAutomateScope = String(
  process.env.POWER_AUTOMATE_TOKEN_SCOPE || "https://service.flow.microsoft.com/.default"
).trim();

let transporter;
let powerAutomateCredential;
let powerAutomateTokenCache;

function canSendEmails() {
  return Boolean(smtpHost && smtpUser && smtpPass && smtpFrom);
}

function canSendNotifications() {
  return canSendEmails() || Boolean(powerAutomateWebhookUrl);
}

function getTransporter() {
  if (!canSendEmails()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });
  }

  return transporter;
}

function getPowerAutomateCredential() {
  if (!powerAutomateCredential) {
    powerAutomateCredential = new DefaultAzureCredential();
  }

  return powerAutomateCredential;
}

async function getPowerAutomateAuthorizationHeader() {
  if (!powerAutomateWebhookUrl) {
    return null;
  }

  const now = Date.now();
  if (powerAutomateTokenCache && powerAutomateTokenCache.expiresOnTimestamp - now > 60 * 1000) {
    return `Bearer ${powerAutomateTokenCache.token}`;
  }

  try {
    const token = await getPowerAutomateCredential().getToken(powerAutomateScope);
    if (!token || !token.token) {
      return null;
    }

    powerAutomateTokenCache = token;
    return `Bearer ${token.token}`;
  } catch (error) {
    return null;
  }
}

async function sendMail({ to, subject, text, icsContent, icsFileName, extraAttachments }) {
  const mailTransporter = getTransporter();
  if (mailTransporter) {
    const payload = {
      from: smtpFrom,
      to,
      subject,
      text
    };

    const attachments = [];
    if (icsContent && icsFileName) {
      attachments.push(
        {
          filename: icsFileName,
          content: icsContent,
          contentType: "text/calendar; charset=utf-8"
        }
      );
    }

    if (Array.isArray(extraAttachments) && extraAttachments.length) {
      for (const item of extraAttachments) {
        if (!item || !item.filename || !item.content) {
          continue;
        }

        attachments.push({
          filename: item.filename,
          content: item.content,
          contentType: item.contentType || "application/octet-stream",
          encoding: item.encoding || undefined
        });
      }
    }

    if (attachments.length) {
      payload.attachments = attachments;
    }

    const info = await mailTransporter.sendMail(payload);
    return {
      skipped: false,
      provider: "smtp",
      messageId: info.messageId,
      to,
      subject
    };
  }

  if (powerAutomateWebhookUrl) {
    const authorizationHeader = await getPowerAutomateAuthorizationHeader();
    const response = await fetch(powerAutomateWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authorizationHeader ? { Authorization: authorizationHeader } : {})
      },
      body: JSON.stringify({
        to,
        subject,
        text,
        attachments: [
          ...(icsContent && icsFileName
            ? [
                {
                  fileName: icsFileName,
                  contentType: "text/calendar",
                  contentBase64: Buffer.from(icsContent, "utf8").toString("base64")
                }
              ]
            : []),
          ...((Array.isArray(extraAttachments) ? extraAttachments : [])
            .filter((item) => item && item.filename && item.content)
            .map((item) => ({
              fileName: item.filename,
              contentType: item.contentType || "application/octet-stream",
              contentBase64:
                item.encoding === "base64"
                  ? String(item.content)
                  : Buffer.from(String(item.content), "utf8").toString("base64")
            })))
        ]
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Power Automate webhook failed (${response.status}): ${body.slice(0, 200)}`);
    }

    return {
      skipped: false,
      provider: "power-automate",
      to,
      subject
    };
  }

  return {
    skipped: true,
    reason: "Neither SMTP nor Power Automate webhook is configured.",
    to,
    subject
  };
}

function buildDeregisterLink(baseUrl, attendeeEmail, registrationCode) {
  const url = new URL("/registrant/deregister", baseUrl);
  url.searchParams.set("email", String(attendeeEmail || ""));
  url.searchParams.set("code", String(registrationCode || ""));
  return url.toString();
}

async function sendRegistrationEmail({ baseUrl, event, registration }) {
  const deregisterLink = buildDeregisterLink(baseUrl, registration.attendeeEmail, registration.registrationCode);
  const invite = createInvite({
    event,
    attendeeEmail: registration.attendeeEmail,
    attendeeName: registration.attendeeName,
    uidPrefix: "attendee"
  });

  const text = [
    `Hi ${registration.attendeeName},`,
    "",
    `You are registered for ${event.title}.`,
    `Registration code: ${registration.registrationCode}`,
    `Start: ${new Date(event.startAt).toLocaleString()}`,
    `End: ${new Date(event.endAt).toLocaleString()}`,
    event.teamsLink ? `Teams link: ${event.teamsLink}` : "",
    `Deregister quickly: ${deregisterLink}`,
    "",
    "Thanks,",
    "Lab Automation Team"
  ]
    .filter(Boolean)
    .join("\n");

  return sendMail({
    to: registration.attendeeEmail,
    subject: `Registration confirmed: ${event.title}`,
    text,
    icsContent: invite,
    icsFileName: `event-${event.id}-registration.ics`
  });
}

async function sendLabReminderEmail({ baseUrl, event, registration }) {
  const deregisterLink = buildDeregisterLink(baseUrl, registration.attendeeEmail, registration.registrationCode);
  const text = [
    `Reminder for ${event.title}`,
    "",
    `Hi ${registration.attendeeName}, your lab credentials reminder is active for this event window:`,
    `${new Date(event.startAt).toLocaleString()} to ${new Date(event.endAt).toLocaleString()}`,
    event.teamsLink ? `Join Teams: ${event.teamsLink}` : "",
    `Unable to attend? Deregister here: ${deregisterLink}`
  ]
    .filter(Boolean)
    .join("\n");

  return sendMail({
    to: registration.attendeeEmail,
    subject: `Lab reminder: ${event.title}`,
    text
  });
}

async function sendPostEventFeedbackEmail({ baseUrl, event, registration, followUpTemplate }) {
  const feedbackLink = new URL(`/events/${event.id}/feedback`, baseUrl).toString();
  const defaultText = [
    `Thanks for attending ${event.title}.`,
    "",
    `Please submit your feedback: ${feedbackLink}`,
    "Need help with a Cosmos DB project? Choose a follow-up option in the feedback form."
  ].join("\n");

  const text = followUpTemplate && followUpTemplate.body ? followUpTemplate.body : defaultText;
  const subject =
    followUpTemplate && followUpTemplate.subject
      ? followUpTemplate.subject
      : `Post-event feedback: ${event.title}`;

  const extraAttachments =
    followUpTemplate && followUpTemplate.attachmentBase64 && followUpTemplate.attachmentFileName
      ? [
          {
            filename: followUpTemplate.attachmentFileName,
            content: followUpTemplate.attachmentBase64,
            contentType: followUpTemplate.attachmentContentType || "application/octet-stream",
            encoding: "base64"
          }
        ]
      : [];

  return sendMail({
    to: registration.attendeeEmail,
    subject,
    text,
    extraAttachments
  });
}

async function sendPersonaInviteEmail({ event, persona }) {
  const personaEvent = {
    ...event,
    title: `${event.title} (${String(persona.personaType || "persona").toUpperCase()} slot)`,
    startAt: persona.availableFrom,
    endAt: persona.availableTo
  };

  const invite = createInvite({
    event: personaEvent,
    attendeeEmail: persona.inviteEmail,
    attendeeName: persona.inviteEmail,
    uidPrefix: `persona-${persona.personaType}`
  });

  const text = [
    `You have been invited as ${persona.personaType} for ${event.title}.`,
    `Availability window: ${new Date(persona.availableFrom).toLocaleString()} to ${new Date(persona.availableTo).toLocaleString()}`,
    event.teamsLink ? `Teams link: ${event.teamsLink}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  return sendMail({
    to: persona.inviteEmail,
    subject: `Persona invite (${persona.personaType}): ${event.title}`,
    text,
    icsContent: invite,
    icsFileName: `event-${event.id}-${persona.personaType}.ics`
  });
}

async function sendTeamMemberInviteEmail({ event, email, name, setupUrl }) {
  const invite = createInvite({
    event,
    attendeeEmail: email,
    attendeeName: name || email,
    uidPrefix: "facilitator"
  });
  const text = [
    `You have been added to the event team for ${event.title}.`,
    "Your speaker or proctor role is assigned separately for each workshop session.",
    setupUrl ? `Set your password using this secure link: ${setupUrl}` : "Use your existing facilitator login.",
    setupUrl ? "The password setup link expires in 24 hours and can be used once." : "",
    event.teamsLink ? `Teams link: ${event.teamsLink}` : ""
  ].filter(Boolean).join("\n");

  return sendMail({
    to: email,
    subject: `Event team invitation: ${event.title}`,
    text,
    icsContent: invite,
    icsFileName: `event-${event.id}-facilitator.ics`
  });
}

async function sendEventChangeNotification({
  baseUrl,
  event,
  recipientEmail,
  recipientType,
  changeType,
  changeSummary
}) {
  const eventLink = new URL(`/events/${event.id}/register`, baseUrl).toString();
  const feedbackLink = new URL(`/events/${event.id}/feedback`, baseUrl).toString();

  const text = [
    `Event update for ${event.title}`,
    "",
    `Hi ${recipientType},`,
    `A publisher has made a change: ${changeType}`,
    changeSummary ? `Summary: ${changeSummary}` : "",
    `Status: ${event.status || "active"}`,
    `Start: ${new Date(event.startAt).toLocaleString()}`,
    `End: ${new Date(event.endAt).toLocaleString()}`,
    event.teamsLink ? `Teams link: ${event.teamsLink}` : "",
    `Event details: ${eventLink}`,
    `Feedback link: ${feedbackLink}`
  ]
    .filter(Boolean)
    .join("\n");

  return sendMail({
    to: recipientEmail,
    subject: `Event changed: ${event.title}`,
    text
  });
}

async function sendPlainNotification({ to, subject, text }) {
  return sendMail({ to, subject, text });
}

module.exports = {
  canSendEmails,
  canSendNotifications,
  sendRegistrationEmail,
  sendLabReminderEmail,
  sendPostEventFeedbackEmail,
  sendPersonaInviteEmail,
  sendTeamMemberInviteEmail,
  sendEventChangeNotification,
  sendPlainNotification
};
