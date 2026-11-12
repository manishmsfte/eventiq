const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findRegistrationMatches,
  isDisallowedOrganizationName,
  isValidEmailAddress,
  normalizeMatchName,
  toRegistrationId
} = require("../services/registration-rules");

const registrations = [
  {
    id: "suwarna",
    attendeeName: "Ms. Suwarna Shriram Hande",
    attendeeEmail: "suwarna.barsagade@gmail.com",
    status: "registered"
  },
  {
    id: "madhuri",
    attendeeName: "Ms. MADHURI YERRA",
    attendeeEmail: "ymadhuri01@gmail.com",
    status: "registered"
  }
];

test("matches a registration when the attendance name omits the middle name", () => {
  const [result] = findRegistrationMatches([
    {
      name: "Suwarna Hande",
      email: "Suwarna.Hande@AirservicesAustralia.com"
    }
  ], registrations);

  assert.equal(result.matched?.id, "suwarna");
  assert.equal(result.matchType, "name");
  assert.equal(result.conflict, false);
});

test("matches by name when the attendance email is missing or different", () => {
  const results = findRegistrationMatches([
    { name: "MADHURI YERRA", email: "" },
    { name: "MADHURI YERRA", email: "madhuri.yerra@live.vu.edu.au" }
  ], registrations);

  assert.deepEqual(results.map((result) => result.matched?.id), ["madhuri", "madhuri"]);
  assert.deepEqual(results.map((result) => result.matchType), ["name", "name"]);
});

test("ignores Teams external and unverified name suffixes", () => {
  assert.equal(normalizeMatchName("Suwarna Hande - (External)"), "suwarna hande");
  assert.equal(normalizeMatchName("MADHURI YERRA (Unverified)"), "madhuri yerra");
});

test("does not auto-match duplicate first and last names", () => {
  const [result] = findRegistrationMatches(
    [{ name: "Suwarna Hande", email: "" }],
    [
      ...registrations,
      {
        id: "another-suwarna",
        attendeeName: "Suwarna K Hande",
        attendeeEmail: "another@example.com",
        status: "registered"
      }
    ]
  );

  assert.equal(result.matched, null);
  assert.equal(result.matchType, "ambiguous");
  assert.equal(result.conflict, true);
});

test("matches only approved and legacy registrations", () => {
  const candidates = [
    {
      id: "legacy",
      attendeeName: "Legacy User",
      attendeeEmail: "legacy@example.com"
    },
    {
      id: "pending",
      attendeeName: "Pending User",
      attendeeEmail: "pending@example.com",
      status: "pending-approval"
    },
    {
      id: "rejected",
      attendeeName: "Rejected User",
      attendeeEmail: "rejected@example.com",
      status: "rejected"
    }
  ];
  const results = findRegistrationMatches(
    candidates.map((item) => ({
      name: item.attendeeName,
      email: item.attendeeEmail
    })),
    candidates
  );

  assert.equal(results[0].matched?.id, "legacy");
  assert.equal(results[1].matched, null);
  assert.equal(results[2].matched, null);
});

test("matches unique name prefixes and reordered name tokens", () => {
  const candidates = [
    {
      id: "ebeymon",
      attendeeName: "Ebeymon Samuel",
      attendeeEmail: "esamuel@example.com",
      status: "registered"
    },
    {
      id: "russel",
      attendeeName: "Aaron Forensics Russel Brown",
      attendeeEmail: "russel@example.com",
      status: "registered"
    }
  ];
  const results = findRegistrationMatches([
    { name: "Ebey Samuel (External)", email: "" },
    { name: "Brown, Russel (External)", email: "different@example.com" }
  ], candidates);

  assert.equal(results[0].matched?.id, "ebeymon");
  assert.equal(results[1].matched?.id, "russel");
});

test("keeps flexible name matches ambiguous when multiple registrations qualify", () => {
  const [result] = findRegistrationMatches(
    [{ name: "Ebey Samuel", email: "" }],
    [
      { id: "one", attendeeName: "Ebeymon Samuel", status: "registered" },
      { id: "two", attendeeName: "Ebeyson Samuel", status: "registered" }
    ]
  );

  assert.equal(result.matched, null);
  assert.equal(result.matchType, "ambiguous");
  assert.equal(result.conflict, true);
});

test("includes deregistered attendees only when requested", () => {
  const candidate = {
    id: "kastelle",
    attendeeName: "Kastelle Adamson",
    attendeeEmail: "kastellea@example.com",
    status: "deregistered"
  };
  const [defaultResult] = findRegistrationMatches(
    [{ name: "Kastelle Adamson", email: "different@example.com" }],
    [candidate]
  );
  const [attendanceResult] = findRegistrationMatches(
    [{ name: "Kastelle Adamson", email: "different@example.com" }],
    [candidate],
    { allowedStatuses: ["registered", "deregistered"] }
  );

  assert.equal(defaultResult.matched, null);
  assert.equal(attendanceResult.matched?.id, "kastelle");
});

test("uses email-matched attendance names as aliases and flags later duplicates", () => {
  const results = findRegistrationMatches(
    [
      {
        name: "Alampalli, Sudheer (RIS-SYD) (External)",
        email: "sudheer.alampalli@example.com"
      },
      {
        name: "Alampalli, Sudheer (RIS-SYD) (External)",
        email: ""
      }
    ],
    [{
      id: "sudheer",
      attendeeName: "Mr. Sudheer AVN",
      attendeeEmail: "sudheer.alampalli@example.com",
      status: "registered"
    }],
    { rejectDuplicateMatches: true }
  );

  assert.equal(results[0].matched?.id, "sudheer");
  assert.equal(results[0].matchType, "email");
  assert.equal(results[1].matched?.id, "sudheer");
  assert.equal(results[1].matchType, "duplicate");
  assert.equal(results[1].conflict, true);
});

test("prefers exact emails for lab rosters with repeated placeholder names", () => {
  const candidates = [
    {
      id: "first",
      attendeeName: "Harneet Rekhi",
      attendeeEmail: "harneet.rekhi@stewart.com",
      status: "registered"
    },
    {
      id: "second",
      attendeeName: "Another Registrant",
      attendeeEmail: "another.registrant@example.com",
      status: "registered"
    }
  ];

  const results = findRegistrationMatches(
    [
      { name: "Lab User 1", email: "harneet.rekhi@stewart.com" },
      { name: "Lab User 1", email: "another.registrant@example.com" }
    ],
    candidates,
    { preferEmailMatch: true }
  );

  assert.deepEqual(results.map((result) => result.matched?.id), ["first", "second"]);
  assert.deepEqual(results.map((result) => result.matchType), ["email", "email"]);
  assert.deepEqual(results.map((result) => result.conflict), [false, false]);
});

test("rejects commas and malformed email addresses", () => {
  assert.equal(isValidEmailAddress("dm.tech,hk@hkmd.net"), false);
  assert.equal(isValidEmailAddress("valid.user@example.com"), true);
  assert.equal(isValidEmailAddress("missing-domain@example"), false);
});

test("rejects placeholder organization names case-insensitively", () => {
  for (const value of ["nil", " NIL ", "Personal", "student"]) {
    assert.equal(isDisallowedOrganizationName(value), true);
  }
  assert.equal(isDisallowedOrganizationName("Victoria University"), false);
});

test("scopes registration email uniqueness to one event", () => {
  const first = toRegistrationId("event-1", " Person@Example.com ");

  assert.equal(first, toRegistrationId("event-1", "person@example.com"));
  assert.notEqual(first, toRegistrationId("event-2", "person@example.com"));
  assert.notEqual(first, toRegistrationId("event-1", "other@example.com"));
});
