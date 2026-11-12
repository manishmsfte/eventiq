const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const accountSecurity = require("../services/account-security");
const { isPartnerAccount } = require("../services/partner-rules");
const { isValidEmailAddress } = require("../services/registration-rules");
const { normalizeEmail } = require("../services/staffing-rules");
const { buildEventUniquenessKey } = require("../services/event-rules");

const dbPath = path.join(__dirname, "..", "db.js");
const dbSource = fs.readFileSync(dbPath, "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const localRequire = createRequire(dbPath);
const oldEmail = "old@contoso.example";
const newEmail = "new@contoso.example";
const password = "Strong!Pass123";
const passwordHash = accountSecurity.hashPassword(password);
const clone = (value) => JSON.parse(JSON.stringify(value));
const identityId = (email) => `login-user-${email.replace(/[^a-z0-9]+/g, "-")}`;
const uniquenessId = (key) => `event-unique-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
const failure = (code, message = `Test failure ${code}`) => Object.assign(new Error(message), { code });

function fixture(email = oldEmail) {
  const partner = {
    id: "partner-1", type: "partner-profile", status: "approved", partnerName: "Contoso",
    submitterName: "Ada", submitterEmail: email, signingAuthorityEmail: email,
    agreementSignerEmail: email, agreementSnapshot: "Original signed terms",
    agreementSignedAt: "2026-10-01T10:00:00.000Z"
  };
  const event = {
    id: "event-1", publisherEmail: email, partnerId: partner.id, title: "Workshop",
    startAt: "2026-11-01T10:00:00.000Z", endAt: "2026-11-01T12:00:00.000Z", timeZone: "UTC"
  };
  const key = buildEventUniquenessKey(event);
  return {
    events: [event, { ...event, id: "shared-event", publisherEmail: "other@contoso.example" }],
    metadata: [
      partner,
      {
        id: identityId(email), type: "login-user", email, userType: "publisher",
        roles: ["publisher", "speaker", "proctor"], accountClass: "partner", partnerId: partner.id,
        partnerName: partner.partnerName, name: "Ada", active: true, password: "", passwordHash,
        createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-25T10:00:00.000Z"
      },
      {
        id: "legacy-speaker", type: "login-user", email, userType: "speaker",
        accountClass: "partner", partnerId: partner.id, active: true, password: "Old!Password123",
        updatedAt: "2026-10-01T10:00:00.000Z"
      },
      { id: "event-key-event-1", type: "event-key", eventId: event.id, publisherEmail: email },
      {
        id: "legacy-owner-collaboration", type: "event-collaborator", eventId: event.id,
        ownerPublisherEmail: email, collaboratorEmail: "other@contoso.example", accessLevel: "write"
      },
      {
        id: `event-collab-shared-event-${email}`, type: "event-collaborator", eventId: "shared-event",
        ownerPublisherEmail: "other@contoso.example", collaboratorEmail: email, accessLevel: "read"
      },
      {
        id: "assignment-1", type: "persona-assignment", eventId: "shared-event",
        publisherEmail: "other@contoso.example", inviteEmail: email, personaType: "speaker",
        labVmName: "existing-team-lab"
      },
      { id: "profile-1", type: "facilitator-profile", email, publisherEmail: email, name: "Ada" },
      {
        id: "session-1", type: "event-session", eventId: event.id, publisherEmail: email,
        speakerIds: [`team:${email}`, `publisher:${email}`, "profile-1"],
        proctorIds: [`persona:proctor:${email}`]
      },
      {
        id: "session-2", type: "event-session", eventId: "shared-event", publisherEmail: "other@contoso.example",
        speakerIds: [`persona:speaker:${email}`], proctorIds: []
      },
      { id: "followup-1", type: "followup-template", eventId: event.id, publisherEmail: email },
      { id: "invite-unused", type: "facilitator-invite", email, usedAt: "" },
      { id: "invite-used", type: "facilitator-invite", email, usedAt: "2026-10-01T10:00:00.000Z" },
      {
        id: "batch-1", type: "lab-provisioning-batch", eventId: event.id,
        requestedRecipients: [
          { id: `team:${email}`, kind: "team", email },
          { id: "registration-1", kind: "registration", email }
        ],
        requestedRecipientIds: [`team:${email}`, "registration-1"]
      },
      { id: uniquenessId(key), type: "event-uniqueness", key },
      { id: "audit-1", type: "application-audit", actorEmail: email }
    ]
  };
}

function createStore(documents = fixture()) {
  let version = 0;
  const containers = new Map();
  const store = { writes: [], queries: [], fail: null };
  const containerFor = (name) => {
    if (containers.has(name)) {
      return containers.get(name);
    }
    const records = new Map();
    const partition = (document) => name === "events" ? document.publisherEmail
      : ["registrations", "feedback"].includes(name) ? document.eventId : document.type;
    const key = (id, partitionKey) => JSON.stringify([partitionKey, id]);
    const save = (document) => {
      const saved = { ...clone(document), _etag: `etag-${++version}` };
      records.set(key(saved.id, partition(saved)), saved);
      return clone(saved);
    };
    const write = (operation, id, partitionKey, document, options) => {
      const error = store.fail?.({ operation, container: name, id, partitionKey, document });
      if (error) {
        throw error;
      }
      const current = records.get(key(id, partitionKey));
      if (operation === "create" && current) {
        throw failure(409);
      }
      if (operation !== "create" && !current) {
        throw failure(404);
      }
      if (options?.accessCondition && options.accessCondition.condition !== current?._etag) {
        throw failure(412);
      }
      store.writes.push({ operation, container: name, id, partitionKey });
      if (operation === "delete") {
        records.delete(key(id, partitionKey));
        return { resource: undefined };
      }
      assert.equal(partition(document), partitionKey, "partition keys must not change in place");
      assert.equal(document.id, id);
      return { resource: save(document) };
    };
    const container = {
      id: name,
      records,
      seed: save,
      item(id, partitionKey) {
        return {
          async read() {
            const resource = records.get(key(id, partitionKey));
            if (!resource) {
              throw failure(404);
            }
            return { resource: clone(resource) };
          },
          async replace(document, options) { return write("replace", id, partitionKey, document, options); },
          async delete(options) { return write("delete", id, partitionKey, null, options); }
        };
      },
      items: {
        async create(document) { return write("create", document.id, partition(document), document); },
        async upsert(document) {
          const current = records.get(key(document.id, partition(document)));
          return write(current ? "replace" : "create", document.id, partition(document), document);
        },
        query(spec, options = {}) {
          store.queries.push({ container: name, spec: clone(spec), ...options });
          return {
            async fetchAll() {
              const params = Object.fromEntries((spec.parameters || []).map((item) => [item.name, item.value]));
              let rows = [...records.values()].filter((item) =>
                options.partitionKey === undefined || partition(item) === options.partitionKey
              );
              if (params["@type"]) {
                rows = rows.filter((item) => item.type === params["@type"]);
              }
              if (name === "events") {
                rows = rows.filter((item) => (!params["@email"] || item.publisherEmail === params["@email"])
                  && (!params["@id"] || item.id === params["@id"]));
              } else if (params["@type"] === "partner-profile" && params["@email"]) {
                rows = rows.filter((item) => item.id !== params["@id"]
                  && normalizeEmail(item.submitterEmail) === params["@email"]);
              } else if (params["@type"] === "login-user") {
                rows = rows.filter((item) =>
                  [params["@email"], params["@previousEmail"]].includes(normalizeEmail(item.email))
                  && (!params["@userType"] || accountSecurity.hasLoginRole(item, params["@userType"]))
                );
              } else if (params["@previousEmail"]) {
                const fields = [...spec.query.matchAll(/LOWER\(c\.(\w+)\) = @previousEmail/g)].map((match) => match[1]);
                const aliases = Object.entries(params).filter(([param]) => param.startsWith("@alias")).map(([, value]) => value);
                rows = rows.filter((item) => fields.some((field) => normalizeEmail(item[field]) === params["@previousEmail"])
                  || aliases.some((alias) => [...(item.speakerIds || []), ...(item.proctorIds || [])].includes(alias))
                  || (params["@prefix"] && item.key?.startsWith(params["@prefix"]))
                  || (spec.query.includes("c.requestedRecipients") && item.requestedRecipients?.some(
                    (recipient) => recipient.kind === "team" && normalizeEmail(recipient.email) === params["@previousEmail"]
                  )));
                if (spec.query.includes("NOT IS_DEFINED(c.usedAt)")) {
                  rows = rows.filter((item) => !item.usedAt);
                }
              } else {
                throw new Error(`Unsupported test query: ${spec.query}`);
              }
              return { resources: clone(rows) };
            }
          };
        }
      }
    };
    containers.set(name, container);
    return container;
  };
  for (const [name, rows] of Object.entries(documents)) {
    rows.forEach((row) => containerFor(name).seed(row));
  }
  const module = { exports: {} };
  vm.runInNewContext(dbSource, {
    module,
    require(name) {
      if (name === "@azure/cosmos") {
        return { CosmosClient: class { database() { return { container: containerFor }; } }, ConnectionMode: { Direct: "Direct" } };
      }
      if (name === "@azure/identity") {
        return { DefaultAzureCredential: class {} };
      }
      return localRequire(name);
    },
    process: { env: { COSMOS_DB_ENDPOINT: "https://cosmos.example.invalid" } },
    console
  }, { filename: dbPath });
  return Object.assign(store, {
    db: module.exports,
    container: containerFor,
    get(id, type, name = "metadata") {
      const item = containerFor(name).records.get(JSON.stringify([type, id]));
      return item ? clone(item) : null;
    },
    snapshot() {
      return [...containers.entries()].flatMap(([name, container]) =>
        [...container.records.values()].map(({ _etag, ...document }) => ({ container: name, ...clone(document) }))
      ).sort((left, right) => `${left.container}:${left.id}:${left.publisherEmail || ""}`.localeCompare(
        `${right.container}:${right.id}:${right.publisherEmail || ""}`
      ));
    }
  });
}

test("transfers the submitter login, credentials, roles, owned events, sharing, staffing, and lab recipients", async () => {
  const store = createStore();
  const partner = await store.db.getPartnerById("partner-1");
  await store.db.updatePartnerSubmitterEmail(partner, " NEW@Contoso.Example ", "supervisor@microsoft.com");
  const migrationQueries = [...store.queries];

  for (const role of ["publisher", "speaker", "proctor"]) {
    assert.equal(await store.db.getLoginUserByEmailAndType(oldEmail, role), null, role);
    const account = await store.db.getLoginUserByEmailAndType(newEmail, role);
    assert.equal(accountSecurity.verifyPassword(account.passwordHash, password), true, role);
    assert.equal(account.active, true);
    assert.equal(account.partnerId, partner.id);
  }
  assert.equal(store.get("legacy-speaker", "login-user"), null);
  assert.equal(store.get("event-1", oldEmail, "events"), null);
  assert.equal((await store.db.getEventById("event-1")).publisherEmail, newEmail);
  assert.equal((await store.db.listEvents()).length, 2);
  assert.equal(store.get("event-key-event-1", "event-key").publisherEmail, newEmail);
  assert.equal(store.get("legacy-owner-collaboration", "event-collaborator").ownerPublisherEmail, newEmail);
  assert.equal((await store.db.getEventCollaboratorAccess("shared-event", newEmail)).accessLevel, "read");
  assert.equal(await store.db.getEventCollaboratorAccess("shared-event", oldEmail), null);
  assert.equal(store.get("assignment-1", "persona-assignment").inviteEmail, newEmail);
  assert.equal(store.get("assignment-1", "persona-assignment").labVmName, "existing-team-lab");
  assert.equal(store.get("profile-1", "facilitator-profile").email, newEmail);
  assert.deepEqual(store.get("session-1", "event-session").speakerIds, [`team:${newEmail}`, `publisher:${newEmail}`, "profile-1"]);
  assert.deepEqual(store.get("session-1", "event-session").proctorIds, [`persona:proctor:${newEmail}`]);
  assert.deepEqual(store.get("session-2", "event-session").speakerIds, [`persona:speaker:${newEmail}`]);
  assert.equal(store.get("followup-1", "followup-template").publisherEmail, newEmail);
  const batch = store.get("batch-1", "lab-provisioning-batch");
  assert.equal(batch.requestedRecipients[0].email, newEmail);
  assert.equal(batch.requestedRecipients[1].email, oldEmail, "registrant identities are separate");
  assert.deepEqual(batch.requestedRecipientIds, [`team:${newEmail}`, "registration-1"]);
  assert.ok(store.get("invite-unused", "facilitator-invite").usedAt);
  assert.equal(store.get("invite-used", "facilitator-invite").email, oldEmail);
  const updated = await store.db.getPartnerById(partner.id);
  assert.equal(updated.submitterEmail, newEmail);
  assert.equal(updated.signingAuthorityEmail, newEmail);
  assert.equal(updated.agreementSignerEmail, oldEmail);
  assert.equal(updated.agreementSnapshot, partner.agreementSnapshot);
  assert.equal(updated.agreementSignedAt, partner.agreementSignedAt);
  assert.equal(updated.submitterEmailUpdatedBy, "supervisor@microsoft.com");
  assert.equal(updated.submitterEmailChangePending, undefined);
  assert.equal(store.get("audit-1", "application-audit").actorEmail, oldEmail);
  const key = buildEventUniquenessKey({ ...fixture().events[0], publisherEmail: newEmail });
  assert.equal(store.get(uniquenessId(key), "event-uniqueness").key, key);
  assert.ok(migrationQueries.every((query) => query.spec.parameters?.length && query.partitionKey));
});

for (const status of ["pending", "rejected"]) {
  test(`updates a ${status} application without creating an account or changing an unrelated login`, async () => {
    const documents = fixture();
    documents.metadata = documents.metadata.filter((item) => ["partner-profile", "login-user"].includes(item.type));
    documents.metadata[0].status = status;
    documents.metadata.slice(1).forEach((item) => { item.partnerId = "other-partner"; });
    const store = createStore(documents);
    const originalLogin = store.get(identityId(oldEmail), "login-user");
    await store.db.updatePartnerSubmitterEmail(await store.db.getPartnerById("partner-1"), newEmail, "supervisor@microsoft.com");
    assert.equal(store.get("partner-1", "partner-profile").submitterEmail, newEmail);
    assert.deepEqual(store.get(identityId(oldEmail), "login-user"), originalLogin);
    assert.equal(await store.db.getLoginUserByEmailAndType(newEmail, "publisher"), null);
    assert.equal(store.writes.length, 1);
  });
}

for (const collision of ["account", "partner", "identity", "supervisor", "missing-publisher", "in-progress"]) {
  test(`rejects ${collision} conflicts before changing access`, async () => {
    const documents = fixture();
    if (collision === "account") {
      documents.metadata.push({ id: "another-user", type: "login-user", email: newEmail.toUpperCase(), userType: "proctor" });
    } else if (collision === "partner") {
      documents.metadata.push({ id: "another-partner", type: "partner-profile", submitterEmail: newEmail });
    } else if (collision === "identity") {
      documents.metadata.push({ id: identityId(newEmail), type: "login-user", email: "new+@contoso.example", userType: "speaker" });
    } else if (collision === "supervisor") {
      documents.metadata.find((item) => item.id === identityId(oldEmail)).roles.push("supervisor");
    } else if (collision === "missing-publisher") {
      documents.metadata = documents.metadata.filter((item) => item.type !== "login-user");
    } else {
      documents.metadata[0].submitterEmailChangePending = { email: "somewhere@contoso.example" };
    }
    const store = createStore(documents);
    const before = store.snapshot();
    await assert.rejects(store.db.updatePartnerSubmitterEmail(await store.db.getPartnerById("partner-1"), newEmail, "supervisor@microsoft.com"),
      (error) => error.code === 409 && Boolean(error.publicMessage));
    assert.deepEqual(store.snapshot(), before);
  });
}

test("keeps an inactive account inactive and handles email addresses with the same canonical ID", async () => {
  const email = "old+alias@contoso.example";
  const replacement = "old-alias@contoso.example";
  const documents = fixture(email);
  documents.metadata.filter((item) => item.type === "login-user").forEach((item) => { item.active = false; });
  const store = createStore(documents);
  await store.db.updatePartnerSubmitterEmail(await store.db.getPartnerById("partner-1"), replacement, "supervisor@microsoft.com");
  const account = await store.db.getLoginUserByEmailAndType(replacement, "publisher");
  assert.equal(account.active, false);
  assert.equal(account.passwordHash, passwordHash);
  assert.equal(await store.db.getLoginUserByEmailAndType(email, "publisher"), null);
  assert.equal((await store.db.getEventById("event-1")).publisherEmail, replacement);
});

test("preserves the latest publisher's legacy password instead of inheriting an older hash", async () => {
  const documents = fixture();
  const legacy = documents.metadata.find((item) => item.id === "legacy-speaker");
  legacy.userType = "publisher";
  legacy.updatedAt = "2026-10-26T10:00:00.000Z";
  const store = createStore(documents);
  await store.db.updatePartnerSubmitterEmail(await store.db.getPartnerById("partner-1"), newEmail, "supervisor@microsoft.com");
  const account = await store.db.getLoginUserByEmailAndType(newEmail, "publisher");
  assert.equal(account.passwordHash, "");
  assert.equal(accountSecurity.verifyPassword(account.password, legacy.password), true);
});

test("preserves the publisher password even when an inconsistent legacy facilitator has newer credentials", async () => {
  const documents = fixture();
  documents.metadata.find((item) => item.id === "legacy-speaker").updatedAt = "2026-10-26T10:00:00.000Z";
  const store = createStore(documents);
  const original = await store.db.getLoginUserByEmailAndType(oldEmail, "publisher");
  await store.db.updatePartnerSubmitterEmail(await store.db.getPartnerById("partner-1"), newEmail, "supervisor@microsoft.com");
  const account = await store.db.getLoginUserByEmailAndType(newEmail, "publisher");
  assert.equal(account.passwordHash, original.passwordHash);
  assert.equal(accountSecurity.verifyPassword(account.passwordHash, password), true);
});

test("unchanged or invalid email submissions never modify stored data", async () => {
  const store = createStore();
  const partner = await store.db.getPartnerById("partner-1");
  assert.equal(await store.db.updatePartnerSubmitterEmail(partner, ` ${oldEmail.toUpperCase()} `, "supervisor@microsoft.com"), partner);
  await assert.rejects(store.db.updatePartnerSubmitterEmail(partner, "bad@@example.com", "supervisor@microsoft.com"), /valid submitter email/);
  assert.equal(store.writes.length, 0);
  assert.equal(store.queries.length, 0);
});

test("rolls back every completed change when a related write fails", async () => {
  const store = createStore();
  const before = store.snapshot();
  let injected = false;
  store.fail = ({ operation, id }) => {
    if (!injected && operation === "replace" && id === "session-1") {
      injected = true;
      return failure(503, "Storage unavailable");
    }
  };
  await assert.rejects(store.db.updatePartnerSubmitterEmail(await store.db.getPartnerById("partner-1"), newEmail, "supervisor@microsoft.com"),
    /Storage unavailable/);
  assert.equal(injected, true);
  assert.deepEqual(store.snapshot(), before);
});

test("restores deleted legacy accounts and the partner contact when final account activation fails", async () => {
  const store = createStore();
  const before = store.snapshot();
  let injected = false;
  store.fail = ({ operation, id, document }) => {
    if (!injected && operation === "replace" && id === identityId(newEmail) && document.active) {
      injected = true;
      return failure(503, "Activation unavailable");
    }
  };
  await assert.rejects(store.db.updatePartnerSubmitterEmail(await store.db.getPartnerById("partner-1"), newEmail, "supervisor@microsoft.com"),
    /Activation unavailable/);
  assert.equal(injected, true);
  assert.deepEqual(store.snapshot(), before);
});

test("rejects stale partner versions and restores login and event access", async () => {
  const store = createStore();
  const stalePartner = await store.db.getPartnerById("partner-1");
  store.container("metadata").seed({ ...stalePartner, partnerName: "Concurrent update" });
  const before = store.snapshot();
  await assert.rejects(store.db.updatePartnerSubmitterEmail(stalePartner, newEmail, "supervisor@microsoft.com"),
    (error) => error.code === 412);
  assert.deepEqual(store.snapshot(), before);
});

test("rejects destination sharing conflicts without overwriting existing permissions", async () => {
  const documents = fixture();
  documents.metadata.push({
    id: `event-collab-shared-event-${newEmail}`, type: "event-collaborator", eventId: "shared-event",
    ownerPublisherEmail: "other@contoso.example", collaboratorEmail: newEmail, accessLevel: "write"
  });
  const store = createStore(documents);
  const before = store.snapshot();
  await assert.rejects(store.db.updatePartnerSubmitterEmail(await store.db.getPartnerById("partner-1"), newEmail, "supervisor@microsoft.com"),
    (error) => error.code === 409);
  assert.deepEqual(store.snapshot(), before);
});

test("surfaces rollback failures and does not overwrite concurrent document changes", async () => {
  const store = createStore();
  let injected = false;
  store.fail = ({ operation, id }) => {
    if (!injected && operation === "replace" && id === "session-1") {
      injected = true;
      store.container("events").seed({ ...store.get("event-1", newEmail, "events"), title: "Concurrent event edit" });
      return failure(503, "Storage unavailable");
    }
  };
  await assert.rejects(store.db.updatePartnerSubmitterEmail(await store.db.getPartnerById("partner-1"), newEmail, "supervisor@microsoft.com"),
    (error) => error.name === "AggregateError" && /could not be fully rolled back/.test(error.message));
  assert.equal(store.get("event-1", newEmail, "events").title, "Concurrent event edit");
});

function functionSource(name) {
  const start = serverSource.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.notEqual(start, -1, name);
  const rest = serverSource.slice(start);
  const end = rest.search(/\r?\n(?:(?:async )?function |app\.)/);
  assert.notEqual(end, -1, name);
  return rest.slice(0, end);
}

function routeSource(method, route) {
  const start = serverSource.indexOf(`app.${method}("${route}",`);
  assert.notEqual(start, -1, route);
  const end = serverSource.indexOf("\napp.", start + 1);
  assert.notEqual(end, -1, route);
  return serverSource.slice(start, end);
}

function createRoutes(store) {
  const routes = new Map();
  const state = { cacheCleared: false };
  const context = {
    ...store.db,
    ...accountSecurity,
    isPartnerAccount,
    isValidEmailAddress,
    normalizeEmail,
    hasCurrentPartnerAgreement: () => true,
    loadAuthConfig: async () => ({ publisherAllowlist: [], supervisorCount: 1 }),
    isPublisherAuthorized: () => true,
    clearEventCaches() { state.cacheCleared = true; },
    authConfigCache: { value: "old", expiresAt: 1 },
    app: Object.fromEntries(["get", "post"].map((method) => [method, (route, ...handlers) => routes.set(`${method}:${route}`, handlers)]))
  };
  const functions = ["clearAllPersonaSessions", "handlePersonaLogin", "getPasswordAccountSession", "requireSupervisor", "isMicrosoftEmail"];
  const endpoints = [
    ["post", "/login"],
    ["get", "/account/profile"],
    ["post", "/account/profile/name"],
    ["post", "/account/profile/password"],
    ["post", "/supervisor/partners/:id/submitter-email"]
  ];
  vm.runInNewContext([
    ...functions.map(functionSource),
    ...endpoints.map(([method, route]) => routeSource(method, route))
  ].join("\n"), context);
  return {
    state,
    async request(method, route, { body = {}, session = {}, id = "partner-1" } = {}) {
      let error;
      const req = {
        body, params: { id }, query: {},
        session: Object.assign(session, { save(callback) { callback(); } })
      };
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        send(message) { this.message = message; return this; },
        redirect(location) { this.location = location; return this; },
        render(view, locals) { this.view = view; this.locals = locals; return this; }
      };
      for (const handler of routes.get(`${method}:${route}`)) {
        let advance = false;
        await handler(req, res, (nextError) => { error = nextError; advance = !nextError; });
        if (!advance) {
          break;
        }
      }
      return { req, res, error };
    }
  };
}

test("limits email editing to supervisors, validates input, rejects stale forms, and clears caches after saving", async () => {
  const store = createStore();
  const routes = createRoutes(store);
  const route = "/supervisor/partners/:id/submitter-email";
  const body = { submitterEmail: newEmail, expectedSubmitterEmail: oldEmail };
  for (const session of [{}, { publisher: { email: oldEmail } }, { facilitator: { email: oldEmail, persona: "speaker" } }]) {
    const result = await routes.request("post", route, { body, session });
    assert.equal(result.res.location, "/login?persona=supervisor");
    assert.equal(store.writes.length, 0);
  }
  for (const override of [{ submitterEmail: "bad@@example.com" }, { expectedSubmitterEmail: "stale@contoso.example" }]) {
    const result = await routes.request("post", route, {
      body: { ...body, ...override }, session: { supervisor: { email: "supervisor@microsoft.com" } }
    });
    assert.equal(result.error, undefined);
    assert.match(result.res.location, /#partners$/);
    assert.equal(store.writes.length, 0);
  }
  const result = await routes.request("post", route, { body, session: { supervisor: { email: "supervisor@microsoft.com" } } });
  assert.equal(result.error, undefined);
  assert.match(decodeURIComponent(result.res.location), /Submitter email updated/);
  assert.equal(routes.state.cacheCleared, true);
  assert.equal((await store.db.getPartnerById("partner-1")).submitterEmail, newEmail);
});

for (const persona of ["publisher", "speaker", "proctor", "facilitator"]) {
  test(`${persona} can open My Profile and change a password, which applies to every shared role`, async () => {
    const store = createStore();
    const routes = createRoutes(store);
    const session = {};
    const login = await routes.request("post", "/login", { body: { persona, email: oldEmail, password }, session });
    assert.equal(login.error, undefined);
    assert.ok(login.res.location, persona);
    const profile = await routes.request("get", "/account/profile", { session });
    assert.equal(profile.error, undefined);
    assert.equal(profile.res.view, "account-profile");
    assert.equal(profile.res.locals.account.email, oldEmail);
    for (const body of [
      { currentPassword: "wrong", newPassword: "Another!Pass123", confirmPassword: "Another!Pass123" },
      { currentPassword: password, newPassword: "Another!Pass123", confirmPassword: "Different!Pass123" },
      { currentPassword: password, newPassword: "short", confirmPassword: "short" }
    ]) {
      const rejected = await routes.request("post", "/account/profile/password", { session, body });
      assert.equal(rejected.error, undefined);
      assert.match(rejected.res.location, /\?error=/);
      assert.equal(accountSecurity.verifyPassword((await store.db.getLoginUserByEmailAndType(oldEmail, "publisher")).passwordHash, password), true);
    }
    const result = await routes.request("post", "/account/profile/password", {
      session, body: { currentPassword: password, newPassword: "Another!Pass123", confirmPassword: "Another!Pass123" }
    });
    assert.equal(result.error, undefined);
    assert.equal(result.res.location, "/account/profile?message=Password%20updated");
    for (const role of ["publisher", "speaker", "proctor"]) {
      const account = await store.db.getLoginUserByEmailAndType(oldEmail, role);
      assert.equal(account.password, "");
      assert.equal(accountSecurity.verifyPassword(account.passwordHash, "Another!Pass123"), true);
      assert.equal(accountSecurity.verifyPassword(account.passwordHash, password), false);
    }
  });
}

test("combined facilitator login resolves proctor-only accounts and remembers the credential role", async () => {
  const documents = fixture();
  documents.metadata = [{
    id: "proctor-only", type: "login-user", userType: "proctor", email: oldEmail,
    accountClass: "internal", passwordHash, active: true
  }];
  const store = createStore(documents);
  const routes = createRoutes(store);
  const session = {};
  await routes.request("post", "/login", { session, body: { persona: "facilitator", email: oldEmail, password } });
  assert.equal(session.facilitator.accountUserType, "proctor");
  const profile = await routes.request("get", "/account/profile", { session });
  assert.equal(profile.res.view, "account-profile");
  const legacySession = { facilitator: { email: oldEmail, persona: "facilitator" } };
  assert.equal((await routes.request("get", "/account/profile", { session: legacySession })).res.view, "account-profile");
  const result = await routes.request("post", "/account/profile/password", {
    session, body: { currentPassword: password, newPassword: "Another!Pass123", confirmPassword: "Another!Pass123" }
  });
  assert.equal(result.res.location, "/account/profile?message=Password%20updated");
});

test("a migrated user signs in with the new email and can still change their shared password", async () => {
  const store = createStore();
  await store.db.updatePartnerSubmitterEmail(await store.db.getPartnerById("partner-1"), newEmail, "supervisor@microsoft.com");
  const routes = createRoutes(store);
  const rejected = await routes.request("post", "/login", { body: { persona: "publisher", email: oldEmail, password } });
  assert.equal(rejected.res.location, undefined);
  const session = {};
  const login = await routes.request("post", "/login", { session, body: { persona: "publisher", email: newEmail, password } });
  assert.equal(login.res.location, "/publisher");
  assert.equal(session.publisher.isPartnerPrimaryPublisher, true);
  const changed = await routes.request("post", "/account/profile/password", {
    session, body: { currentPassword: password, newPassword: "Another!Pass123", confirmPassword: "Another!Pass123" }
  });
  assert.equal(changed.res.location, "/account/profile?message=Password%20updated");
  assert.equal(accountSecurity.verifyPassword((await store.db.getLoginUserByEmailAndType(newEmail, "proctor")).passwordHash, "Another!Pass123"), true);
});

test("renamed partner sessions are cleared before they can keep using the old email", async () => {
  const store = createStore();
  const routes = createRoutes(store);
  const session = {};
  await routes.request("post", "/login", { session, body: { persona: "publisher", email: oldEmail, password } });
  await store.db.updatePartnerSubmitterEmail(await store.db.getPartnerById("partner-1"), newEmail, "supervisor@microsoft.com");
  const start = serverSource.indexOf("app.use(async (req, res, next) => {");
  const end = serverSource.indexOf("\napp.use(", start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  let middleware;
  const context = {
    getLoginUserByEmailAndType: store.db.getLoginUserByEmailAndType,
    app: { use(handler) { middleware = handler; } }
  };
  vm.runInNewContext([
    functionSource("clearAllPersonaSessions"), functionSource("getPasswordAccountSession"), serverSource.slice(start, end)
  ].join("\n"), context);
  let location;
  let nextCalled = false;
  await middleware({ session }, { redirect(value) { location = value; } }, () => { nextCalled = true; });
  assert.match(location, /^\/login\?persona=publisher&error=/);
  assert.equal(session.publisher, null);
  assert.equal(session.facilitator, null);
  assert.equal(nextCalled, false);
});

test("unauthenticated users and registrants cannot change a password", async () => {
  const store = createStore();
  const routes = createRoutes(store);
  for (const session of [{}, { registrant: { attendeeEmail: oldEmail } }]) {
    const result = await routes.request("post", "/account/profile/password", { session });
    assert.equal(result.res.statusCode, 403);
    assert.equal(store.writes.length, 0);
  }
});
