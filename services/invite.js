function escapeIcsText(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// Event start/end are stored as the wall-clock time entered for the event's time zone
// (not true UTC), so the offset must be applied to produce a correct UTC instant for ICS.
const TIMEZONE_OFFSETS = {
  PDT: -7,
  PST: -8,
  MDT: -6,
  MST: -7,
  CDT: -5,
  CST: -6,
  EDT: -4,
  EST: -5,
  BST: 1,
  GMT: 0,
  CEST: 2,
  CET: 1,
  IST: 5.5,
  JST: 9,
  AEDT: 11,
  AEST: 10,
  NZDT: 13,
  NZST: 12,
  UTC: 0
};

function toIcsDate(dateInput, timeZone) {
  const wallClock = new Date(dateInput);
  const offsetHours = TIMEZONE_OFFSETS[String(timeZone || "").toUpperCase()] ?? 0;
  const date = new Date(wallClock.getTime() - offsetHours * 3600000);
  const pad = (value) => String(value).padStart(2, "0");

  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

function buildEventDescription(event) {
  const lines = [];

  if (event.description) {
    lines.push(event.description);
  }

  if (event.teamsLink) {
    lines.push(`Join Microsoft Teams: ${event.teamsLink}`);
  }

  if (event.address) {
    lines.push(`Venue Address: ${event.address}`);
  }

  return lines.join("\n");
}

function createInvite({ event, attendeeEmail, attendeeName, uidPrefix }) {
  const uid = `${uidPrefix}-${event.id}-${Date.now()}@labautomation.local`;
  const timestamp = toIcsDate(new Date(), "UTC");
  const start = toIcsDate(event.startAt, event.timeZone);
  const end = toIcsDate(event.endAt, event.timeZone);

  const location =
    event.deliveryMode === "virtual"
      ? "Microsoft Teams"
      : event.address || event.city || "TBD";

  const organizer = event.publisherEmail || "publisher@microsoft.com";
  const description = buildEventDescription(event);
  const teamsLink = String(event.teamsLink || "").trim();

  const attendeeBlock = attendeeEmail
    ? `ATTENDEE;CN=${escapeIcsText(attendeeName || attendeeEmail)}:mailto:${escapeIcsText(attendeeEmail)}`
    : "";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LabAutomation//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${timestamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(teamsLink ? `Microsoft Teams: ${teamsLink}` : location)}`,
    teamsLink ? `URL:${teamsLink}` : "",
    teamsLink ? `X-MICROSOFT-SKYPETEAMSMEETINGURL:${teamsLink}` : "",
    teamsLink ? `X-MICROSOFT-ONLINEMEETINGEXTERNALLINK:${teamsLink}` : "",
    `ORGANIZER;CN=Microsoft Publisher:mailto:${escapeIcsText(organizer)}`,
    attendeeBlock,
    "SEQUENCE:0",
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR"
  ]
    .filter(Boolean)
    .join("\r\n");
}

module.exports = {
  createInvite
};
