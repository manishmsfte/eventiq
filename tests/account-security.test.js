const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getPasswordValidationError,
  hasLoginRole,
  hashPassword,
  mergeLoginUsersByEmail,
  selectLatestLoginUser,
  verifyPassword
} = require("../services/account-security");

test("hashes and verifies passwords without storing the original value", () => {
  const password = "Strong!Pass123";
  const hash = hashPassword(password);

  assert.notEqual(hash, password);
  assert.equal(verifyPassword(hash, password), true);
  assert.equal(verifyPassword(hash, "Wrong!Pass123"), false);
});

test("supports existing plaintext passwords during migration", () => {
  assert.equal(verifyPassword("legacy-password", "legacy-password"), true);
  assert.equal(verifyPassword("legacy-password", "other-password"), false);
});

test("requires a strong new password", () => {
  assert.match(getPasswordValidationError("short"), /at least 10/);
  assert.match(getPasswordValidationError("onlylowercase"), /uppercase/);
  assert.equal(getPasswordValidationError("Strong!Pass123"), "");
});

test("merges non-student user roles by normalized email", () => {
  const users = mergeLoginUsersByEmail([
    { id: "publisher", userType: "publisher", email: " Person@Example.com ", active: true },
    { id: "speaker", userType: "speaker", email: "person@example.com", active: true },
    { id: "proctor", userType: "proctor", email: "PERSON@example.com", active: true }
  ]);

  assert.equal(users.length, 1);
  assert.equal(users[0].email, "person@example.com");
  assert.deepEqual(users[0].roles, ["publisher", "speaker", "proctor"]);
  assert.equal(hasLoginRole(users[0], "publisher"), true);
  assert.equal(hasLoginRole(users[0], "proctor"), true);
  assert.equal(hasLoginRole(users[0], "supervisor"), false);
});

test("uses the most recently updated duplicate login identity", () => {
  const users = [
    {
      id: "login-user-person-example-com",
      email: "person@example.com",
      passwordHash: "stale",
      updatedAt: "2026-10-07T10:00:00.000Z"
    },
    {
      id: "legacy-publisher-person-example-com",
      email: "person@example.com",
      passwordHash: "reset",
      updatedAt: "2026-10-07T11:00:00.000Z"
    }
  ];

  assert.equal(selectLatestLoginUser(users).passwordHash, "reset");
  assert.equal(mergeLoginUsersByEmail(users)[0].id, "legacy-publisher-person-example-com");
});
