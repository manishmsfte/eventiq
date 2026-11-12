const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const partnerRules = require("../services/partner-rules");
const registrationRules = require("../services/registration-rules");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const routeStart = serverSource.indexOf('app.post("/events/:id/register",');
assert.notEqual(routeStart, -1);
const routeEnd = serverSource.indexOf("\napp.", routeStart + 1);
assert.notEqual(routeEnd, -1);
const registrationRouteSource = serverSource.slice(routeStart, routeEnd);

async function submitRegistration(body = {}, eventOverrides = {}) {
  const event = {
    id: "event-1",
    title: "Partner workshop",
    partnerId: "partner-1",
    partnerName: "Contoso",
    partnerPrivacyPolicyUrl: "https://contoso.example/privacy",
    publisherEmail: "publisher@contoso.example",
    ...eventOverrides
  };
  const created = [];
  const notifications = [];
  let handler;
  vm.runInNewContext(registrationRouteSource, {
    app: {
      post(route, callback) {
        assert.equal(route, "/events/:id/register");
        handler = callback;
      }
    },
    ...partnerRules,
    ...registrationRules,
    COUNTRIES: ["Australia", "Canada", "China", "United States"],
    JOB_ROLES: [],
    COUNTRY_PHONE_CODES: {},
    ORGANIZATION_SIZES: ["2-9 employees"],
    getEventById: async () => event,
    getKnownOrganizationsCached: async () => [],
    getCanonicalOrganizationSuggestions: (items) => items,
    getEventStatus: () => "upcoming",
    isPreviewEvent: () => false,
    normalizeCountryCode: (value) => value || "+1",
    normalizePhoneNumber: () => "",
    requiresManualCompanyName: () => false,
    deriveCompanyName: () => "Contoso",
    canonicalizeOrganizationName: (value) => value,
    listRegistrationsByEvent: async () => [],
    findRegistrationByEventAndEmail: async () => null,
    createRegistration: async (payload) => {
      created.push(payload);
      return { ...payload, id: "registration-1" };
    },
    sendPlainNotification: async (message) => notifications.push(message),
    sendRegistrationEmail: async (message) => notifications.push(message),
    getPublicBaseUrl: () => "https://example.test",
    console
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
    redirect(location) {
      this.location = location;
      return this;
    }
  };
  await handler({
    params: { id: event.id },
    body: {
      firstName: "Ada",
      lastName: "Lovelace",
      attendeeEmail: "ada@contoso.example",
      companyName: "Contoso",
      country: "Australia",
      organizationSize: "2-9 employees",
      ...body
    }
  }, response, (error) => { throw error; });
  return { created, notifications, response };
}

test("stores explicit partner permission without granting Microsoft contact permissions", async () => {
  const { created, response } = await submitRegistration({
    partnerOptIn: "yes",
    contactConsent: "yes"
  });
  assert.equal(created.length, 1);
  assert.equal(created[0].partnerOptIn, true);
  assert.equal(created[0].contactConsent, "no");
  assert.equal(created[0].pendingApproval, true);
  assert.equal(response.location, "/registrations/registration-1/success");
});

test("accepts registration without either contact permission field", async () => {
  const { created, notifications, response } = await submitRegistration();
  assert.equal(created[0].partnerOptIn, false);
  assert.equal(created[0].contactConsent, "no");
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].subject, /Registration pending/);
  assert.equal(response.location, "/registrations/registration-1/success");
});

for (const country of ["China", "Canada"]) {
  test(`keeps event registration available without partner contact permissions in ${country}`, async () => {
    const { created, response } = await submitRegistration({ country });
    assert.equal(created.length, 1);
    assert.equal(created[0].partnerOptIn, false);
    assert.equal(created[0].contactConsent, "no");
    assert.equal(response.location, "/registrations/registration-1/success");
  });
}

test("rejects forged or stale permission submissions for excluded and unrecognized countries", async () => {
  for (const country of ["China", "Canada", "CANADA", "CA", "CN", "", "Unknown"]) {
    const { created, response } = await submitRegistration({ country, partnerOptIn: "yes" });
    assert.equal(created.length, 0, country);
    assert.equal(response.statusCode, 400, country);
    assert.match(response.locals.error, /Partner contact permissions are not available/);
    assert.equal(response.locals.formData.partnerOptIn, false);
    assert.equal(response.locals.formData.contactConsent, "no");
  }
});

test("does not treat other submitted checkbox values as an explicit opt-in", async () => {
  for (const partnerOptIn of ["no", "on", "true", ["yes"]]) {
    const { created } = await submitRegistration({ partnerOptIn });
    assert.equal(created[0].partnerOptIn, false);
  }
});

test("does not collect partner or Microsoft permissions for internal events", async () => {
  const { created, notifications } = await submitRegistration({
    partnerOptIn: "yes",
    contactConsent: "yes"
  }, { partnerId: "" });
  assert.equal(created[0].partnerOptIn, false);
  assert.equal(created[0].contactConsent, "no");
  assert.equal(created[0].pendingApproval, false);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].event.partnerId, "");
});

test("rejects permission collection when partner identification or privacy details are missing", async () => {
  for (const event of [{ partnerName: "" }, { partnerPrivacyPolicyUrl: "" }]) {
    const { created, response } = await submitRegistration({ partnerOptIn: "yes" }, event);
    assert.equal(created.length, 0);
    assert.equal(response.statusCode, 400);
    assert.equal(response.locals.formData.partnerOptIn, false);
  }
});

test("retains an eligible explicit choice after unrelated form validation fails", async () => {
  const { created, response } = await submitRegistration({ firstName: "", partnerOptIn: "yes" });
  assert.equal(created.length, 0);
  assert.equal(response.statusCode, 400);
  assert.equal(response.locals.formData.partnerOptIn, true);
});
