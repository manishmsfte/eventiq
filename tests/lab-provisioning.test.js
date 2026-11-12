const test = require("node:test");
const assert = require("node:assert/strict");

const {
  allocateLabStudentNumbers,
  getMissingProvisioningCredentialFields,
  mapProvisioningRowsToRegistrationIndexes,
  parseLabDeletionRange,
  parseRegistrationSequenceRange,
  selectProvisioningRegistrationEntries,
  selectProvisioningTeamMembers,
  selectProvisioningRowsForBatch
} = require("../services/lab-provisioning");

const completeProvisioningRow = {
  Student: "Lab User 1",
  BastionUri: "https://portal.azure.com/#view/Microsoft_Azure_Bastion/ShareableLink",
  VmName: "lab-vm-l1-01",
  VmAdminUsername: "lab_user1",
  VmAdminPassword: "VM-secret",
  UserPrincipalName: "lab_user1@example.test",
  TempPassword: "Portal-secret",
  ResourceGroup: "lab-dev1-event",
  CosmosServerlessAccount: "cosmosl1",
  CosmosProvisionedAccount: "cosmos-provisioned-l1"
};

test("accepts complete Cosmos and DocumentDB provisioning credentials", () => {
  assert.deepEqual(getMissingProvisioningCredentialFields(completeProvisioningRow, false), []);
  assert.deepEqual(getMissingProvisioningCredentialFields({
    ...completeProvisioningRow,
    CosmosServerlessAccount: "",
    CosmosProvisionedAccount: "",
    DocumentDbCluster: "docdb-l1"
  }, true), []);
});

test("reports every missing or invalid provisioning credential", () => {
  assert.deepEqual(
    getMissingProvisioningCredentialFields({
      ...completeProvisioningRow,
      BastionUri: "not-a-url",
      VmAdminPassword: "",
      TempPassword: "",
      CosmosProvisionedAccount: ""
    }, false),
    [
      "VmAdminPassword",
      "TempPassword",
      "CosmosProvisionedAccount",
      "BastionUri (valid HTTPS URL)"
    ]
  );
});

test("allocates new physical labs after every number used by prior batches", () => {
  const batches = [
    { startStudentNumber: 25, studentCount: 25 },
    { requestedStudentNumbers: [26, 27], studentCount: 2 }
  ];

  assert.deepEqual(allocateLabStudentNumbers(batches, [], 2), [50, 51]);
});

test("also avoids physical lab numbers found on registration resource groups", () => {
  const registrations = [
    { labResourceGroup: "lab-dev52-evt-example" },
    { labResourceGroup: "not-a-lab-resource-group" }
  ];

  assert.deepEqual(allocateLabStudentNumbers([], registrations, 2), [53, 54]);
});

test("parses single, closed, and open lab deletion ranges", () => {
  assert.deepEqual(parseLabDeletionRange("3", 1, 24), {
    startStudentNumber: 3,
    endStudentNumber: 3
  });
  assert.deepEqual(parseLabDeletionRange("1-5", 1, 24), {
    startStudentNumber: 1,
    endStudentNumber: 5
  });
  assert.deepEqual(parseLabDeletionRange("1-", 1, 24), {
    startStudentNumber: 1,
    endStudentNumber: 24
  });
});

test("rejects malformed, reversed, and out-of-batch deletion ranges", () => {
  assert.throws(() => parseLabDeletionRange("all", 1, 24), /must be a number/);
  assert.throws(() => parseLabDeletionRange("5-1", 1, 24), /start before it ends/);
  assert.throws(() => parseLabDeletionRange("0-5", 1, 24), /within 1-24/);
  assert.throws(() => parseLabDeletionRange("1-25", 1, 24), /within 1-24/);
});

test("parses bounded and open registration sequence ranges", () => {
  assert.deepEqual(parseRegistrationSequenceRange("24-27", 50), {
    startSequence: 24,
    endSequence: 27
  });
  assert.deepEqual(parseRegistrationSequenceRange("1-", 50), {
    startSequence: 1,
    endSequence: 50
  });
  assert.deepEqual(parseRegistrationSequenceRange("2-", 50), {
    startSequence: 2,
    endSequence: 50
  });
});

test("rejects malformed and out-of-event registration sequence ranges", () => {
  assert.throws(() => parseRegistrationSequenceRange("all", 50), /must be a number/);
  assert.throws(() => parseRegistrationSequenceRange("27-24", 50), /start before it ends/);
  assert.throws(() => parseRegistrationSequenceRange("0-5", 50), /within 1-50/);
  assert.throws(() => parseRegistrationSequenceRange("24-51", 50), /within 1-50/);
});

test("selects only provisioning rows belonging to the current batch range", () => {
  const rows = [
    { Student: "Student-26", Status: "Ready" },
    { Student: "Student-1", Status: "Ready" },
    { Student: "Student-25", Status: "Ready" },
    { Student: "Student-49", Status: "Ready" },
    { Student: "Student-50", Status: "Ready" }
  ];

  assert.deepEqual(
    selectProvisioningRowsForBatch(rows, 25, 25).map((row) => row.Student),
    ["Student-25", "Student-26", "Student-49"]
  );
});

test("maps sparse physical lab rows to their registration offsets", () => {
  const rows = [
    { Student: "Student-31", Status: "Ready" },
    { Student: "Student-25", Status: "Ready" },
    { Student: "Student-28", Status: "Ready" }
  ];

  assert.deepEqual(
    mapProvisioningRowsToRegistrationIndexes(rows, 25, 25).map(({ registrationIndex, row }) => ({
      registrationIndex,
      student: row.Student
    })),
    [
      { registrationIndex: 0, student: "Student-25" },
      { registrationIndex: 3, student: "Student-28" },
      { registrationIndex: 6, student: "Student-31" }
    ]
  );
});

test("maps rows against explicit registration sequence numbers without compressing gaps", () => {
  const rows = [
    { Student: "Student-29", Status: "Ready" },
    { Student: "Student-26", Status: "Ready" },
    { Student: "Student-28", Status: "Ready" }
  ];

  assert.deepEqual(
    mapProvisioningRowsToRegistrationIndexes(rows, [26, 29]).map(({ registrationIndex, row }) => [
      registrationIndex,
      row.Student
    ]),
    [[0, "Student-26"], [1, "Student-29"]]
  );
});

test("preserves full sequence positions while skipping deregistered and unavailable registrations", () => {
  const registrations = [
    { id: "one", status: "registered", createdAt: "2026-01-01T00:00:01Z" },
    { id: "two", status: "deregistered", createdAt: "2026-01-01T00:00:02Z" },
    { id: "three", status: "registered", createdAt: "2026-01-01T00:00:03Z" },
    { id: "four", status: "registered", createdAt: "2026-01-01T00:00:04Z" }
  ];

  assert.deepEqual(
    selectProvisioningRegistrationEntries(registrations, 1, 4, new Set(["one", "two", "four"]))
      .map(({ registration, sequence }) => [registration.id, sequence]),
    [["one", 1], ["four", 4]]
  );
});

test("selects each speaker or proctor once and skips existing or reserved labs", () => {
  const assignments = [
    { personaType: "speaker", inviteEmail: "TEAM@example.com", personaName: "Team Member" },
    { personaType: "proctor", inviteEmail: "team@example.com", personaName: "Team Member" },
    { personaType: "speaker", inviteEmail: "assigned@example.com", labResourceGroup: "lab-existing" },
    { personaType: "proctor", inviteEmail: "reserved@example.com" }
  ];

  assert.deepEqual(
    selectProvisioningTeamMembers(assignments, ["team:reserved@example.com"]),
    [{
      id: "team:team@example.com",
      email: "team@example.com",
      name: "Team Member",
      roles: ["speaker", "proctor"],
      assignment: assignments[0],
      labAccessUpdatedAt: "",
      hasLabAccess: false
    }]
  );
});

test("deduplicates a large mixed event team without returning assigned labs", () => {
  const assignments = Array.from({ length: 10000 }, (_, index) => ({
    personaType: index % 2 ? "speaker" : "proctor",
    inviteEmail: `member-${index % 2500}@example.com`,
    personaName: `Member ${index % 2500}`,
    labResourceGroup: index % 2500 === 0 ? "existing-lab" : ""
  }));

  const selected = selectProvisioningTeamMembers(assignments);

  assert.equal(selected.length, 2499);
  assert.equal(new Set(selected.map((member) => member.email)).size, selected.length);
  assert.ok(selected.every((member) => !member.hasLabAccess));
});
