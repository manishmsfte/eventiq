const TEMPLATE_PRODUCTS = [
  { id: "documentdb", name: "Azure DocumentDB" },
  { id: "cosmosdb", name: "Azure Cosmos DB" }
];

function getCetTemplateEvents(events) {
  return events.filter((event) =>
    (String(event.timeZone || "").toUpperCase() === "CET" || /\bCET\b/i.test(event.title || ""))
    && !event.unlisted
    && String(event.publicationStatus || "approved").toLowerCase() === "approved"
    && !["canceled", "cancelled"].includes(String(event.status || "").toLowerCase())
  );
}

function getTemplateProduct(event) {
  const title = String(event.title || "");
  if (/document\s?db|\bdocdb\b|mongo/i.test(title)) return "documentdb";
  return /cosmos|nosql/i.test(title) ? "cosmosdb" : "";
}

function cleanTemplateCell(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildCetSessionTemplates(events, sessions) {
  const candidates = getCetTemplateEvents(events)
    .slice()
    .sort((left, right) => String(right.startAt || "").localeCompare(String(left.startAt || "")));
  return TEMPLATE_PRODUCTS.map((product) => {
    const source = candidates.find((event) =>
      getTemplateProduct(event) === product.id
      && sessions.some((session) => String(session.eventId) === String(event.id) && session.rowType === "session")
    );
    if (!source) {
      return { ...product, available: false, reason: `No published CET ${product.name} agenda is available. You can still paste your own agenda.` };
    }
    const rows = sessions
      .filter((session) => String(session.eventId) === String(source.id) && session.rowType === "session")
      .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
    if (rows.some((row) => !String(row.title || "").trim() || !Number.isInteger(Number(row.durationMinutes)) || Number(row.durationMinutes) < 1)) {
      return { ...product, available: false, reason: `The saved CET ${product.name} agenda needs valid session titles and durations before it can be used.` };
    }
    let currentPart = "";
    const agendaRows = rows.map((row, index) => {
      currentPart = cleanTemplateCell(row.part) || currentPart;
      return [
        currentPart,
        cleanTemplateCell(row.sessionCode) || String(index + 1),
        cleanTemplateCell(row.title),
        cleanTemplateCell(row.format) || "Session",
        `${Number(row.durationMinutes)} min`,
        cleanTemplateCell(row.description)
      ].join("\t");
    });
    return {
      ...product,
      available: true,
      sourceEventId: source.id,
      sourceTitle: source.title,
      sourceDate: String(source.startAt || "").split("T")[0],
      sessionCount: rows.length,
      durationMinutes: rows.reduce((total, row) => total + Number(row.durationMinutes), 0),
      agendaTable: ["Part\t#\tSession\tFormat\tDuration\tFocus", ...agendaRows].join("\n")
    };
  });
}

module.exports = { buildCetSessionTemplates, getCetTemplateEvents };
