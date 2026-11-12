const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { isValidEmailAddress } = require("../services/registration-rules");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const projectTypes = ["Existing project", "New project"];
const followUpTypes = [
  "Architecture guidance",
  "Migration support",
  "POC implementation help",
  "Performance tuning",
  "Office hours",
  "Other"
];
const eventSessions = [
  { id: "session-1", title: "Architecture" },
  { id: "session-2", title: "Migration" },
  { id: "session-3", title: "Hands-on lab" }
];

async function requestFeedback({ method = "post", body = {}, query = {}, registration = null, event = { id: "event-1", title: "Workshop" }, failSave = false } = {}) {
  const marker = `app.${method}("/events/:id/feedback",`;
  const start = serverSource.indexOf(marker);
  assert.notEqual(start, -1);
  const end = serverSource.indexOf("\napp.", start + 1);
  assert.notEqual(end, -1);
  const created = [];
  const accountUpdates = [];
  let handler;
  vm.runInNewContext(serverSource.slice(start, end), {
    app: {
      [method](route, callback) {
        assert.equal(route, "/events/:id/feedback");
        handler = callback;
      }
    },
    FEEDBACK_PROJECT_TYPES: projectTypes,
    FEEDBACK_FOLLOW_UP_TYPES: followUpTypes,
    isValidEmailAddress,
    getEventById: async () => event,
    listEventSessions: async () => eventSessions,
    findActiveRegistrationByEventAndEmail: async () => registration,
    setRegistrationDatabaseAccountName: async (record, name) => accountUpdates.push({ record, name }),
    createFeedback: async (payload) => {
      if (failSave) throw new Error("Feedback storage unavailable");
      created.push(JSON.parse(JSON.stringify(payload)));
      return { ...payload, id: "feedback-1" };
    }
  });
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, locals) {
      this.view = view;
      this.locals = locals;
      return this;
    },
    send(message) {
      this.message = message;
      return this;
    }
  };
  await handler({
    params: { id: "event-1" },
    session: {},
    query,
    body: { rating: "5", recommendation: "yes", needsProjectHelp: "no", ...body }
  }, response, (error) => { throw error; });
  return { created, response, accountUpdates };
}

test("accepts event feedback without comments, email, follow-up, or session ratings", async () => {
  const { created, response } = await requestFeedback();
  assert.equal(response.view, "feedback-success");
  assert.equal(created.length, 1);
  assert.equal(created[0].rating, 5);
  assert.equal(created[0].comments, "");
  assert.equal(created[0].candidateEmail, "");
  assert.equal(created[0].contactConsent, "no");
  assert.deepEqual(created[0].projectTypes, []);
  assert.deepEqual(created[0].followUpTypes, []);
  assert.deepEqual(created[0].sessionRatings, []);
});

test("stores optional session stars in one event response with canonical session titles", async () => {
  const { created } = await requestFeedback({
    body: { sessionRatings: { "session-1": "4", "session-3": "2" } }
  });
  assert.equal(created.length, 1);
  assert.equal(created[0].rating, 5);
  assert.deepEqual(created[0].sessionRatings, [
    { sessionId: "session-1", sessionTitle: "Architecture", rating: 4 },
    { sessionId: "session-3", sessionTitle: "Hands-on lab", rating: 2 }
  ]);
});

test("rejects fractional, out-of-range, and malformed event stars", async () => {
  for (const rating of ["", "0", "6", "3.5", "5junk", ["5"], {}, 0, 6, 2.5]) {
    const { created, response } = await requestFeedback({ body: { rating } });
    assert.equal(created.length, 0, JSON.stringify(rating));
    assert.equal(response.statusCode, 400);
    assert.match(response.locals.error, /rate the event/);
    assert.equal(response.locals.initialStep, "ratings");
  }
});

test("requires explicit valid recommendation and follow-up answers", async () => {
  for (const body of [{ recommendation: "" }, { recommendation: "maybe" }, { needsProjectHelp: "" }, { needsProjectHelp: "maybe" }]) {
    const { created, response } = await requestFeedback({ body });
    assert.equal(created.length, 0);
    assert.equal(response.statusCode, 400);
  }
});

test("rejects ratings for sessions from another event", async () => {
  const { created, response } = await requestFeedback({
    body: { sessionRatings: { "other-event-session": "5", "session-1": "4" } }
  });
  assert.equal(created.length, 0);
  assert.match(response.locals.error, /does not belong/);
  assert.equal(response.locals.formData.sessionRatings["session-1"], "4");
});

test("rejects malformed session rating shapes and values", async () => {
  for (const sessionRatings of [null, "5", ["5"], { "session-1": "0" }, { "session-1": "6" }, { "session-1": "2.5" }, { "session-1": "4junk" }, { "session-1": ["4"] }]) {
    const { created, response } = await requestFeedback({ body: { sessionRatings } });
    assert.equal(created.length, 0, JSON.stringify(sessionRatings));
    assert.equal(response.statusCode, 400);
  }
});

const followUpRequest = {
  needsProjectHelp: "yes",
  candidateEmail: "customer@contoso.example",
  contactConsent: "yes",
  projectType: ["Existing project"],
  followUpType: ["Architecture guidance", "Migration support"]
};

test("stores all selected follow-up types and only the explicit contact permission", async () => {
  const { created } = await requestFeedback({
    body: {
      ...followUpRequest,
      candidateEmail: " Customer@Contoso.Example ",
      followUpType: [...followUpRequest.followUpType, "Architecture guidance"],
      followUpDetails: "Review our design."
    }
  });
  assert.equal(created[0].candidateEmail, "customer@contoso.example");
  assert.equal(created[0].contactConsent, "yes");
  assert.deepEqual(created[0].projectTypes, ["Existing project"]);
  assert.equal(created[0].followUpType, "Architecture guidance, Migration support");
  assert.deepEqual(created[0].followUpTypes, followUpRequest.followUpType);
  assert.equal(created[0].followUpDetails, "Review our design.");
});

test("requires email, permission, project type, and help type only for requested follow-up", async () => {
  for (const body of [
    { candidateEmail: "" },
    { candidateEmail: "invalid-email" },
    { candidateEmail: "customer@contoso..example" },
    { contactConsent: "no" },
    { contactConsent: ["yes"] },
    { projectType: undefined },
    { projectType: [] },
    { projectType: "" },
    { followUpType: [] },
    { followUpType: "" }
  ]) {
    const { created, response } = await requestFeedback({ body: { ...followUpRequest, ...body } });
    assert.equal(created.length, 0);
    assert.equal(response.statusCode, 400);
    assert.equal(response.locals.initialStep, "follow-up");
    assert.equal(response.locals.formData.rating, "5");
  }
});

test("accepts either project type or both, normalizes duplicates, and keeps context optional", async () => {
  for (const projectType of ["Existing project", "New project", [" Existing project ", "New project", "Existing project"]]) {
    const { created, response } = await requestFeedback({ body: { ...followUpRequest, projectType } });
    assert.equal(response.view, "feedback-success");
    assert.deepEqual(created[0].projectTypes, Array.isArray(projectType) ? projectTypes : [projectType]);
    assert.equal(created[0].followUpDetails, "");
  }
});

test("rejects unknown and malformed project types without saving feedback", async () => {
  for (const projectType of ["Other", {}, ["Existing project", {}], ["New project", "Other"]]) {
    const { created, response } = await requestFeedback({ body: { ...followUpRequest, projectType } });
    assert.equal(created.length, 0);
    assert.equal(response.statusCode, 400);
    assert.equal(response.locals.initialStep, "follow-up");
    assert.match(response.locals.error, /valid project type/);
    assert.equal(response.locals.formData.candidateEmail, followUpRequest.candidateEmail);
  }
});

test("rejects unknown or malformed follow-up choices", async () => {
  for (const followUpType of ["Not a supported type", {}, ["Architecture guidance", {}]]) {
    const { created, response } = await requestFeedback({ body: { ...followUpRequest, followUpType } });
    assert.equal(created.length, 0);
    assert.match(response.locals.error, /valid follow-up type/);
  }
});

test("supports a single checkbox value and existing session-specific submissions", async () => {
  const { created } = await requestFeedback({
    body: { ...followUpRequest, followUpType: "Office hours", sessionId: "session-2" }
  });
  assert.deepEqual(created[0].followUpTypes, ["Office hours"]);
  assert.equal(created[0].sessionId, "session-2");
  assert.equal(created[0].sessionTitle, "Migration");
});

test("discards stale contact and follow-up fields after opting out", async () => {
  const { created, accountUpdates } = await requestFeedback({
    body: {
      ...followUpRequest,
      needsProjectHelp: "no",
      followUpDetails: "Old request",
      databaseAccountName: "old-account"
    },
    registration: { id: "registration-1" }
  });
  assert.equal(created[0].candidateEmail, "");
  assert.equal(created[0].contactConsent, "no");
  assert.deepEqual(created[0].projectTypes, []);
  assert.equal(created[0].followUpType, "");
  assert.deepEqual(created[0].followUpTypes, []);
  assert.equal(created[0].followUpDetails, "");
  assert.equal(created[0].databaseAccountName, "");
  assert.equal(accountUpdates.length, 0);
});

test("preserves optional registered database account updates without replacing uploaded lab details", async () => {
  const body = { ...followUpRequest, databaseAccountName: "customer-account" };
  const withoutLabs = await requestFeedback({ body, registration: { id: "registration-1" } });
  assert.equal(withoutLabs.accountUpdates[0].name, "customer-account");
  const withLabs = await requestFeedback({
    body,
    registration: { id: "registration-1", labDatabaseAccountName: "uploaded-account" }
  });
  assert.equal(withLabs.accountUpdates.length, 0);
});

test("opens event feedback first and preserves session deep links and optional lab lookup", async () => {
  const standard = await requestFeedback({ method: "get", query: { sessionId: "session-3" } });
  assert.equal(standard.response.locals.initialStep, "ratings");
  assert.equal(standard.response.locals.formData.needsProjectHelp, "no");
  assert.deepEqual(Array.from(standard.response.locals.projectTypes), projectTypes);
  assert.deepEqual(Array.from(standard.response.locals.formData.projectType), []);
  assert.equal(standard.response.locals.selectedSession.id, "session-3");
  assert.equal(standard.response.locals.showLabDetails, false);
  const labLookup = await requestFeedback({
    method: "get",
    query: { email: "customer@contoso.example", view: "lab" },
    registration: { id: "registration-1", labVmUsername: "lab-user" }
  });
  assert.equal(labLookup.response.locals.showLabDetails, true);
  assert.equal(labLookup.response.locals.labAccess.labVmUsername, "lab-user");
});

test("returns not found for missing events and propagates storage errors", async () => {
  for (const method of ["get", "post"]) {
    const { response } = await requestFeedback({ method, event: null });
    assert.equal(response.statusCode, 404);
  }
  await assert.rejects(requestFeedback({ failSave: true }), /Feedback storage unavailable/);
});

test("persists project types, session arrays, and help types in the event partition", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "db.js"), "utf8");
  const start = source.indexOf("async function createFeedback(payload)");
  const end = source.indexOf("\nasync function getAuthConfig", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  let stored;
  const createFeedback = vm.runInNewContext(`${source.slice(start, end)}\ncreateFeedback;`, {
    randomUUID: () => "feedback-1",
    getFeedbackContainer: async () => ({
      items: {
        create: async (payload) => {
          stored = JSON.parse(JSON.stringify(payload));
          return { resource: payload };
        }
      }
    })
  });
  const sessionRatings = [{ sessionId: "session-1", sessionTitle: "Architecture", rating: 4 }];
  await createFeedback({
    eventId: "event-1",
    rating: 5,
    projectTypes,
    followUpTypes,
    followUpType: followUpTypes.join(", "),
    sessionRatings
  });
  assert.equal(stored.eventId, "event-1");
  assert.equal(stored.schemaVersion, 3);
  assert.deepEqual(stored.projectTypes, projectTypes);
  assert.deepEqual(stored.sessionRatings, sessionRatings);
  assert.deepEqual(stored.followUpTypes, followUpTypes);
  assert.equal(stored.rating, 5);
  assert.ok(stored.createdAt);
});
