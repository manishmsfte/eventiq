const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buildCetSessionTemplates, getCetTemplateEvents } = require("../services/session-templates");
const { parseAgendaTable } = require("../services/agenda-rules");
const { applyBulkStaffing, isTeamMemberAvailable } = require("../services/staffing-rules");

const events = [
  { id: "docdb", title: "Azure DocumentDB CET", startAt: "2026-09-17T09:00:00Z", publicationStatus: "approved" },
  { id: "cosmos", title: "Azure Cosmos DB Workshop", timeZone: "CET", startAt: "2026-09-18T09:00:00Z" }
];
const sessions = [
  { id: "doc-2", eventId: "docdb", sequence: 3, rowType: "session", title: "Hands-on lab", durationMinutes: 60 },
  { id: "doc-1", eventId: "docdb", sequence: 1, rowType: "session", part: "Part 1", sessionCode: "1A", title: "Introduction", format: "Talk", description: "Architecture overview", durationMinutes: 30, speakerIds: ["private-profile"], password: "not-for-copying" },
  { id: "doc-break", eventId: "docdb", sequence: 2, rowType: "break", title: "Break", durationMinutes: 15 },
  { id: "cosmos-1", eventId: "cosmos", sequence: 1, rowType: "session", title: "NoSQL foundations", durationMinutes: 45 }
];

test("offers both product templates using only public, approved, non-canceled CET events", () => {
  const excluded = [
    { ...events[0], id: "pending", publicationStatus: "pending" },
    { ...events[0], id: "rejected", publicationStatus: "rejected" },
    { ...events[0], id: "private", unlisted: true },
    { ...events[0], id: "canceled", status: "canceled" },
    { ...events[0], id: "cancelled", status: "cancelled" },
    { id: "other-zone", title: "Cosmos DB", timeZone: "IST" },
    { id: "partial-word", title: "Cosmos DB CETology" }
  ];
  assert.deepEqual(getCetTemplateEvents([...events, ...excluded]), events);
  assert.deepEqual(buildCetSessionTemplates(events, sessions).map((item) => [item.id, item.available]), [
    ["documentdb", true], ["cosmosdb", true]
  ]);
});

test("CET templates round-trip through the real agenda parser in session order without breaks or private data", () => {
  const template = buildCetSessionTemplates(events, sessions)[0];
  const parsed = parseAgendaTable(template.agendaTable);
  assert.equal(template.sourceEventId, "docdb");
  assert.equal(template.sourceDate, "2026-09-17");
  assert.equal(template.sessionCount, 2);
  assert.equal(template.durationMinutes, 90);
  assert.deepEqual(parsed.map((item) => [item.part, item.title, item.durationMinutes]), [
    ["Part 1", "Introduction", 30],
    ["Part 1", "Hands-on lab", 60]
  ]);
  assert.equal(parsed[0].focus, "Architecture overview");
  assert.equal(parsed[1].format, "Session");
  assert.doesNotMatch(JSON.stringify(template), /private-profile|not-for-copying|doc-break|speakerIds/);
});

test("chooses the latest CET event with saved workshop sessions for each product", () => {
  const recent = { ...events[0], id: "recent", title: "MongoDB migration CET", startAt: "2026-10-01T09:00:00Z" };
  const empty = { ...recent, id: "empty", startAt: "2026-11-01T09:00:00Z" };
  const templates = buildCetSessionTemplates([...events, recent, empty], [
    ...sessions,
    { ...sessions[1], eventId: "recent", title: "Latest migration agenda" }
  ]);
  assert.equal(templates[0].sourceEventId, "recent");
  assert.match(templates[0].agendaTable, /Latest migration agenda/);
  assert.equal(templates[1].sourceEventId, "cosmos");
});

test("normalizes multiline cells so imported templates keep the required six-column shape", () => {
  const template = buildCetSessionTemplates([events[0]], [{
    ...sessions[1], title: "Introduction\tand\narchitecture", description: "First\r\nSecond\tThird"
  }])[0];
  const parsed = parseAgendaTable(template.agendaTable);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, "Introduction and architecture");
  assert.equal(parsed[0].focus, "First Second Third");
  assert.equal(template.agendaTable.split("\n")[1].split("\t").length, 6);
});

test("reports missing sources and invalid CET rows explicitly rather than inventing an agenda", () => {
  const missing = buildCetSessionTemplates([], []);
  assert.equal(missing.length, 2);
  assert.ok(missing.every((item) => !item.available && item.reason && !item.agendaTable));
  for (const invalid of [{ title: "" }, { durationMinutes: 0 }, { durationMinutes: 1.5 }, { durationMinutes: "bad" }]) {
    const template = buildCetSessionTemplates([events[0]], [{ ...sessions[1], ...invalid }])[0];
    assert.equal(template.available, false);
    assert.match(template.reason, /valid session titles and durations/);
    assert.equal(template.agendaTable, undefined);
  }
});

const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const normalizeStart = serverSource.indexOf("function normalizeIdList(");
const normalizeEnd = serverSource.indexOf("\n}", normalizeStart) + 2;
const normalizeIdList = vm.runInNewContext(`${serverSource.slice(normalizeStart, normalizeEnd)}\nnormalizeIdList;`);

async function requestRoute(method, route, { body = {}, context = {}, allowAccess = true } = {}) {
  const marker = `app.${method}("${route}",`;
  const start = serverSource.indexOf(marker);
  assert.notEqual(start, -1, marker);
  const end = serverSource.indexOf("\napp.", start + 1);
  let handler;
  let failure;
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    send(value) { this.message = value; return this; },
    json(value) { this.body = JSON.parse(JSON.stringify(value)); return this; },
    redirect(value) { this.location = value; return this; }
  };
  const access = async (req, res, options) => {
    assert.equal(options.requireWrite, true);
    if (!allowAccess) {
      res.status(403).send("Not authorized.");
      return null;
    }
    return { event: { id: "event-1" } };
  };
  vm.runInNewContext(serverSource.slice(start, end), {
    app: { [method](...args) { handler = args.at(-1); } },
    requireEventOperator() {},
    requirePublisher() {},
    getEventOperatorAccess: access,
    getPublisherEventAccess: access,
    getCetTemplateEvents,
    buildCetSessionTemplates,
    getEventsCached: async () => events,
    getEventStatus: (event) => event.status || "upcoming",
    listEventSessionsByEvents: async () => sessions,
    normalizeIdList,
    normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
    ...context
  });
  await handler({ params: { id: "event-1" }, body, session: {} }, response, (error) => { failure = error; });
  return { response, failure };
}

test("template API requires write access and only queries eligible source event IDs", async () => {
  let queried;
  const result = await requestRoute("get", "/publisher/events/:id/session-templates", {
    context: {
      getEventsCached: async () => [...events, { ...events[0], id: "private", unlisted: true }],
      listEventSessionsByEvents: async (ids) => { queried = Array.from(ids); return sessions; }
    }
  });
  assert.equal(result.failure, undefined);
  assert.deepEqual(queried, ["docdb", "cosmos"]);
  assert.ok(result.response.body.templates.every((item) => item.available));
  let read = false;
  const denied = await requestRoute("get", "/publisher/events/:id/session-templates", {
    allowAccess: false,
    context: { getEventsCached: async () => { read = true; return events; } }
  });
  assert.equal(denied.response.statusCode, 403);
  assert.equal(read, false);
});

test("template API surfaces storage failures without returning success-shaped empty templates", async () => {
  const failure = new Error("Storage unavailable");
  const result = await requestRoute("get", "/publisher/events/:id/session-templates", {
    context: { listEventSessionsByEvents: async () => { throw failure; } }
  });
  assert.equal(result.failure, failure);
  assert.equal(result.response.body, undefined);
});

const member = {
  id: "team:person@example.test",
  name: "Example Person",
  availableFrom: "2026-09-17T09:00:00Z",
  availableTo: "2026-09-17T17:00:00Z",
  availableSessionIds: ["session-1"]
};
const staffingSessions = [
  { id: "session-1", rowType: "session", startAt: "2026-09-17T10:00:00Z", endAt: "2026-09-17T11:00:00Z", speakerIds: ["old-speaker"], proctorIds: ["existing-proctor"] },
  { id: "session-2", rowType: "session", startAt: "2026-09-17T11:00:00Z", endAt: "2026-09-17T12:00:00Z", speakerIds: [], proctorIds: [] },
  { id: "break-1", rowType: "break", speakerIds: [], proctorIds: [] }
];

async function requestStaffing(route, body, context = {}) {
  const saved = [];
  const result = await requestRoute("post", `/publisher/events/:id/session-staffing/${route}`, {
    body,
    context: {
      listEventSessions: async () => staffingSessions,
      listFacilitatorProfiles: async () => [],
      listPersonaAssignmentsByEvent: async () => [],
      listLoginUsers: async () => [],
      buildEventTeam: () => [member],
      findTeamMember: (team, id) => team.find((person) => person.id === id),
      applyBulkStaffing,
      isTeamMemberAvailable,
      createEventSession: async (value) => saved.push(JSON.parse(JSON.stringify(value))),
      ...context
    }
  });
  assert.equal(result.failure, undefined);
  return { ...result, saved };
}

test("bulk staffing applies both roles, preserves proctors, and reports skipped availability", async () => {
  const { response, saved } = await requestStaffing("bulk", {
    teamMemberId: member.id, assignmentRole: "both", selectedSessionIds: ["session-1", "session-2"]
  });
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].speakerIds, [member.id]);
  assert.deepEqual(saved[0].proctorIds, ["existing-proctor", member.id]);
  assert.match(decodeURIComponent(response.location), /Updated 1 available session\(s\). Skipped 1 unavailable/);
  assert.match(response.location, /#session-staffing$/);
});

test("bulk staffing rejects foreign rows, breaks, empty selection, and zero available sessions before saving", async () => {
  for (const selectedSessionIds of [["session-1", "foreign"], ["break-1"], [], ["session-2"]]) {
    const { response, saved } = await requestStaffing("bulk", {
      teamMemberId: member.id, assignmentRole: "speaker", selectedSessionIds
    });
    assert.equal(saved.length, 0);
    assert.match(response.location, /\?error=/);
    assert.match(response.location, /#session-staffing$/);
  }
  assert.deepEqual(staffingSessions[0].speakerIds, ["old-speaker"]);
});

test("individual session checkboxes save one or several roles without requiring multi-select keys", async () => {
  const { response, saved } = await requestStaffing("session", {
    sessionId: "session-1", speakerMemberId: member.id, proctorMemberIds: member.id
  });
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].speakerIds, [member.id]);
  assert.deepEqual(saved[0].proctorIds, [member.id]);
  assert.match(response.location, /message=.*#session-staffing$/);
});

test("individual staffing rejects stale team IDs and unavailable people without clearing saved assignments", async () => {
  for (const body of [
    { sessionId: "session-1", speakerMemberId: "foreign" },
    { sessionId: "session-1", proctorMemberIds: ["foreign", member.id] },
    { sessionId: "session-2", speakerMemberId: member.id }
  ]) {
    const { response, saved } = await requestStaffing("session", body);
    assert.equal(saved.length, 0);
    assert.match(response.location, /\?error=.*#session-staffing$/);
  }
});
