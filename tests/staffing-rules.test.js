const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyBulkStaffing,
  buildEventTeam,
  buildExistingPeople,
  getInheritedSessionStaffing,
  isTeamMemberAvailable,
  toTeamMemberId
} = require("../services/staffing-rules");

test("unifies role-specific records into one event team member", () => {
  const team = buildEventTeam({
    assignments: [
      {
        personaType: "speaker",
        inviteEmail: "person@example.com",
        availableFrom: "2026-09-17T09:00:00.000Z",
        availableTo: "2026-09-17T17:00:00.000Z"
      },
      {
        personaType: "proctor",
        inviteEmail: "PERSON@example.com",
        availableFrom: "2026-09-17T09:00:00.000Z",
        availableTo: "2026-09-17T17:00:00.000Z"
      }
    ],
    profiles: [
      { id: "speaker-profile", email: "person@example.com", name: "Test Person" },
      { id: "proctor-profile", email: "person@example.com", name: "Test Person" }
    ],
    sessions: [{
      id: "session-1",
      speakerIds: ["speaker-profile"],
      proctorIds: [toTeamMemberId("person@example.com")]
    }]
  });

  test("inherits full-day speaker and proctor roles for a new session", () => {
    const staffing = getInheritedSessionStaffing([
      {
        personaType: "speaker",
        inviteEmail: "speaker@example.com",
        assignAllSessions: true,
        availableFrom: "2026-09-17T09:00:00.000Z",
        availableTo: "2026-09-17T17:00:00.000Z"
      },
      {
        personaType: "proctor",
        inviteEmail: "proctor@example.com",
        assignAllSessions: true,
        availableFrom: "2026-09-17T09:00:00.000Z",
        availableTo: "2026-09-17T17:00:00.000Z"
      }
    ], {
      id: "new-session",
      startAt: "2026-09-17T10:00:00.000Z",
      endAt: "2026-09-17T11:00:00.000Z"
    });

    assert.deepEqual(staffing, {
      speakerIds: ["team:speaker@example.com"],
      proctorIds: ["team:proctor@example.com"]
    });
  });

  assert.equal(team.length, 1);
  assert.equal(team[0].name, "Test Person");
  assert.equal(team[0].speakerSessionCount, 1);
  assert.equal(team[0].proctorSessionCount, 1);
  assert.ok(team[0].aliasIds.includes("persona:speaker:person@example.com"));
  assert.ok(team[0].aliasIds.includes("persona:proctor:person@example.com"));
});

test("assigns the same person as speaker and proctor across selected sessions", () => {
  const member = {
    id: "team:person@example.com",
    availableFrom: "2026-09-17T09:00:00.000Z",
    availableTo: "2026-09-17T17:00:00.000Z",
    availableSessionIds: []
  };
  const sessions = [
    {
      id: "session-1",
      rowType: "session",
      startAt: "2026-09-17T10:00:00.000Z",
      endAt: "2026-09-17T11:00:00.000Z",
      speakerIds: ["old-speaker"],
      proctorIds: ["existing-proctor"]
    },
    {
      id: "break-1",
      rowType: "lunch",
      startAt: "2026-09-17T11:00:00.000Z",
      endAt: "2026-09-17T12:00:00.000Z",
      speakerIds: [],
      proctorIds: []
    }
  ];

  const updated = applyBulkStaffing(sessions, member, "both", ["session-1", "break-1"]);

  assert.equal(updated.length, 1);
  assert.deepEqual(updated[0].speakerIds, [member.id]);
  assert.deepEqual(updated[0].proctorIds, ["existing-proctor", member.id]);
});

test("checks whole-event and selected-session availability", () => {
  const session = {
    id: "session-2",
    startAt: "2026-09-17T10:00:00.000Z",
    endAt: "2026-09-17T11:00:00.000Z"
  };

  assert.equal(isTeamMemberAvailable({
    availableFrom: "2026-09-17T09:00:00.000Z",
    availableTo: "2026-09-17T17:00:00.000Z",
    availableSessionIds: []
  }, session), true);
  assert.equal(isTeamMemberAvailable({
    availableFrom: "2026-09-17T09:00:00.000Z",
    availableTo: "2026-09-17T17:00:00.000Z",
    availableSessionIds: ["session-1"]
  }, session), false);
});

test("offers every active existing person once and identifies partners", () => {
  const candidates = buildExistingPeople([
    { id: "publisher-1", userType: "publisher", email: "partner@example.com", name: "Partner Person", partnerName: "Contoso" },
    { id: "supervisor-1", userType: "supervisor", email: "internal@example.com", name: "Internal Person" },
    { id: "speaker-1", userType: "speaker", roles: ["speaker", "proctor"], email: "member@example.com", name: "Event Member" },
    { id: "inactive-1", userType: "proctor", email: "inactive@example.com", name: "Inactive Person", active: false }
  ]);

  assert.deepEqual(candidates.map((candidate) => candidate.email), [
    "member@example.com",
    "internal@example.com",
    "partner@example.com"
  ]);
  assert.equal(candidates.find((candidate) => candidate.email === "partner@example.com").partnerName, "Contoso");
  assert.deepEqual(
    candidates.find((candidate) => candidate.email === "member@example.com").roles,
    ["speaker", "proctor"]
  );
});
