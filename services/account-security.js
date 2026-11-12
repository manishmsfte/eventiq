const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");

const PASSWORD_PREFIX = "scrypt";
const KEY_LENGTH = 64;

function hashPassword(password) {
  const value = String(password || "");
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(value, salt, KEY_LENGTH).toString("hex");
  return `${PASSWORD_PREFIX}$${salt}$${hash}`;
}

function verifyPassword(storedPassword, candidatePassword) {
  const stored = String(storedPassword || "");
  const candidate = String(candidatePassword || "");
  if (!stored.startsWith(`${PASSWORD_PREFIX}$`)) {
    return stored === candidate;
  }

  const [, salt, expectedHex] = stored.split("$");
  if (!salt || !expectedHex) {
    return false;
  }

  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(candidate, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function getPasswordValidationError(password) {
  const value = String(password || "");
  if (value.length < 10) {
    return "Password must be at least 10 characters.";
  }
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    return "Password must include uppercase, lowercase, number, and special characters.";
  }
  return "";
}

function selectLatestLoginUser(users) {
  return [...(Array.isArray(users) ? users : [])].sort((left, right) => {
    const leftTimestamp = Date.parse(left?.updatedAt || left?.createdAt || "") || 0;
    const rightTimestamp = Date.parse(right?.updatedAt || right?.createdAt || "") || 0;
    return rightTimestamp - leftTimestamp;
  })[0] || null;
}

function mergeLoginUsersByEmail(users) {
  const usersByEmail = new Map();
  const orderedUsers = [...(Array.isArray(users) ? users : [])].sort((left, right) => {
    const leftTimestamp = Date.parse(left?.updatedAt || left?.createdAt || "") || 0;
    const rightTimestamp = Date.parse(right?.updatedAt || right?.createdAt || "") || 0;
    return leftTimestamp - rightTimestamp;
  });
  for (const user of orderedUsers) {
    const email = String(user?.email || "").trim().toLowerCase();
    if (!email) {
      continue;
    }
    const existing = usersByEmail.get(email);
    const roles = new Set([
      ...(existing?.roles || []),
      ...(Array.isArray(user.roles) ? user.roles : []),
      user.userType
    ].map((role) => String(role || "").trim().toLowerCase()).filter(Boolean));
    usersByEmail.set(email, {
      ...(existing || {}),
      ...user,
      email,
      userType: existing?.userType || String(user.userType || "").toLowerCase(),
      roles: [...roles],
      active: existing ? existing.active !== false || user.active !== false : user.active !== false
    });
  }
  return [...usersByEmail.values()];
}

function hasLoginRole(user, role) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  return [user?.userType, ...(Array.isArray(user?.roles) ? user.roles : [])]
    .some((value) => String(value || "").trim().toLowerCase() === normalizedRole);
}

module.exports = {
  getPasswordValidationError,
  hasLoginRole,
  hashPassword,
  mergeLoginUsersByEmail,
  selectLatestLoginUser,
  verifyPassword
};
