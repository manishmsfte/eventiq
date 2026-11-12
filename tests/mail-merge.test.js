const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const XLSX = require("xlsx");
const { getPartnerEventTitle } = require("../services/partner-rules");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const helpers = ["isApprovedRegistration", "toCsvValue", "sanitizeExportEventTitle", "buildMailMergeCsv"].map((name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}).join("\n");
const buildMailMergeCsv = vm.runInNewContext(`${helpers}\nbuildMailMergeCsv;`, { getPartnerEventTitle });
const event = {
  id: "event-1", title: "Database Workshop", partnerName: "Example Partner",
  startAt: "2026-12-10T09:00:00Z", endAt: "2026-12-10T15:00:00Z", timeZone: "CET",
  deliveryMode: "virtual", teamsLink: "https://teams.example/workshop"
};

test("mail merge exports only approved active recipients with their own app sign-in fields", () => {
  const registrations = [
    { attendeeName: "First Attendee", attendeeEmail: "first+event@example.test", registrationCode: "CODE 1", status: "registered" },
    { attendeeName: "Pending", attendeeEmail: "pending@example.test", registrationCode: "", status: "pending-approval" },
    { attendeeName: "Rejected", attendeeEmail: "rejected@example.test", status: "rejected" },
    { attendeeName: "Deregistered", attendeeEmail: "deregistered@example.test", status: "deregistered" },
    { attendeeName: "Second, Attendee", attendeeEmail: "second@example.test", registrationCode: "CODE-2", status: "REGISTERED" }
  ];
  const csv = buildMailMergeCsv(event, registrations, "https://eventiq.example/");
  const workbook = XLSX.read(csv, { type: "string", raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.Email), ["first+event@example.test", "second@example.test"]);
  assert.deepEqual(rows.map((row) => row.RegistrationCode), ["CODE 1", "CODE-2"]);
  assert.equal(rows[1].FullName, "Second, Attendee");
  assert.equal(rows[0].EventTitle, "Database Workshop - Example Partner");
  assert.equal(rows[0].EventTimeZone, "CET");
  assert.equal(rows[0].Location, event.teamsLink);
  for (const row of rows) {
    const link = new URL(row.RegistrantLoginLink);
    assert.equal(link.origin, "https://eventiq.example");
    assert.equal(link.pathname, "/registrant/login");
    assert.equal(link.searchParams.get("email"), row.Email);
    assert.equal(link.searchParams.get("code"), row.RegistrationCode);
  }
  assert.doesNotMatch(csv, /pending@example|rejected@example|deregistered@example/);
});

test("mail merge exposes the documented field names without exporting VM or Azure passwords", () => {
  const csv = buildMailMergeCsv(event, [{
    attendeeName: "Sample Attendee", attendeeEmail: "sample@example.test", registrationCode: "APP-CODE",
    labVmUsername: "lab-user", labVmPassword: "private-lab-password",
    labPortalPassword: "private-azure-password"
  }], "https://eventiq.example");
  assert.deepEqual(csv.split("\r\n")[0].split(","), [
    "Salutation", "FirstName", "LastName", "FullName", "Email", "Organization", "JobRole",
    "Country", "PhoneNumber", "RegistrationCode", "RegistrationDate", "EventTitle",
    "EventStartAt", "EventEndAt", "EventTimeZone", "Location", "RegistrantLoginLink"
  ]);
  assert.doesNotMatch(csv, /private-lab-password|private-azure-password|labVmPassword|labPortalPassword/);
});
