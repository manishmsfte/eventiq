const { createHash } = require("node:crypto");

function buildEventUniquenessKey({ publisherEmail, title, startAt, endAt, timeZone }) {
  return [
    String(publisherEmail || "").trim().toLowerCase(),
    String(title || "").trim().replace(/\s+/g, " ").toLowerCase(),
    new Date(startAt).toISOString(),
    new Date(endAt).toISOString(),
    String(timeZone || "").trim().toLowerCase()
  ].join("|");
}

function buildEventSessionId({ eventId, rowType, title, startAt, endAt }) {
  const signature = [
    String(eventId || "").trim(),
    String(rowType || "session").trim().toLowerCase(),
    String(title || "").trim().replace(/\s+/g, " ").toLowerCase(),
    new Date(startAt).toISOString(),
    new Date(endAt).toISOString()
  ].join("|");
  return `event-session-${createHash("sha256").update(signature).digest("hex").slice(0, 32)}`;
}

module.exports = {
  buildEventSessionId,
  buildEventUniquenessKey
};
