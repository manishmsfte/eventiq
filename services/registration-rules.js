const DISALLOWED_ORGANIZATION_NAMES = new Set(["nil", "personal", "student"]);
const NAME_PREFIXES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "professor"]);

function isValidEmailAddress(value) {
  const email = String(value || "").trim();
  if (!email || email.length > 254 || email.includes("..")) {
    return false;
  }

  const parts = email.split("@");
  if (parts.length !== 2) {
    return false;
  }

  const [localPart, domain] = parts;
  if (
    !localPart
    || localPart.length > 64
    || localPart.startsWith(".")
    || localPart.endsWith(".")
    || !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(localPart)
  ) {
    return false;
  }

  const domainLabels = domain.toLowerCase().split(".");
  return domainLabels.length >= 2 && domainLabels.every(
    (label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
  );
}

function isDisallowedOrganizationName(value) {
  return DISALLOWED_ORGANIZATION_NAMES.has(
    String(value || "").trim().toLowerCase().replace(/\s+/g, " ")
  );
}

function normalizeMatchName(value) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s*(?:-\s*)?\((?:external|unverified)\)\s*$/giu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

  const parts = normalized.split(" ").filter(Boolean);
  while (parts.length > 1 && NAME_PREFIXES.has(parts[0])) {
    parts.shift();
  }
  return parts.join(" ");
}

function getNameMatchKeys(value) {
  const normalized = normalizeMatchName(value);
  if (!normalized) {
    return [];
  }

  const parts = normalized.split(" ");
  const keys = new Set([normalized]);
  if (parts.length > 2) {
    keys.add(`${parts[0]} ${parts[parts.length - 1]}`);
  }
  return [...keys];
}

function getNameTokens(value) {
  return normalizeMatchName(value).split(" ").filter(Boolean);
}

function areNameTokensCompatible(left, right) {
  if (left === right) {
    return true;
  }
  return Math.min(left.length, right.length) >= 4
    && (left.startsWith(right) || right.startsWith(left));
}

function isFlexibleNameMatch(leftName, rightName) {
  const leftTokens = getNameTokens(leftName);
  const rightTokens = getNameTokens(rightName);
  if (leftTokens.length < 2 || rightTokens.length < 2) {
    return false;
  }

  const [shorter, longer] = leftTokens.length <= rightTokens.length
    ? [leftTokens, rightTokens]
    : [rightTokens, leftTokens];
  const matchedLongerIndexes = new Set();
  let exactMatches = 0;

  for (const token of shorter) {
    const matchIndex = longer.findIndex(
      (candidate, index) =>
        !matchedLongerIndexes.has(index) && areNameTokensCompatible(token, candidate)
    );
    if (matchIndex === -1) {
      return false;
    }
    matchedLongerIndexes.add(matchIndex);
    if (token === longer[matchIndex]) {
      exactMatches += 1;
    }
  }

  return exactMatches >= 1;
}

function findRegistrationMatches(rows, registrations, options = {}) {
  const allowedStatuses = new Set(
    (options.allowedStatuses || ["registered"]).map((status) => String(status).toLowerCase())
  );
  const eligibleRegistrations = registrations.filter(
    (item) => allowedStatuses.has(String(item.status || "registered").toLowerCase())
  );

  const byEmail = new Map();
  const byNameKey = new Map();
  const addNameAlias = (name, registration) => {
    for (const nameKey of getNameMatchKeys(name)) {
      if (!byNameKey.has(nameKey)) {
        byNameKey.set(nameKey, new Set());
      }
      byNameKey.get(nameKey).add(registration);
    }
  };

  for (const registration of eligibleRegistrations) {
    const email = String(registration.attendeeEmail || "").trim().toLowerCase();
    if (email) {
      byEmail.set(email, registration);
    }
    addNameAlias(registration.attendeeName, registration);
  }

  const seenMatches = new Map();
  return rows.map((row, index) => {
    const inputEmail = String(row.email || "").trim().toLowerCase();
    const inputName = String(row.name || "").trim();
    const emailMatch = inputEmail ? byEmail.get(inputEmail) : null;
    const nameMatches = new Set();
    for (const nameKey of getNameMatchKeys(inputName)) {
      for (const registration of byNameKey.get(nameKey) || []) {
        nameMatches.add(registration);
      }
    }
    if (!nameMatches.size && inputName) {
      for (const registration of eligibleRegistrations) {
        if (isFlexibleNameMatch(inputName, registration.attendeeName)) {
          nameMatches.add(registration);
        }
      }
    }
    const matchedByName = [...nameMatches];

    let matched = null;
    let matchType = "none";
    let conflict = false;
    let reason = "No matching registration found";

    if (
      emailMatch
      && matchedByName.length
      && !nameMatches.has(emailMatch)
      && !options.preferEmailMatch
    ) {
      conflict = true;
      matchType = "conflict";
      reason = "Email and name matched different registrants";
    } else if (emailMatch) {
      matched = emailMatch;
      matchType = "email";
      reason = "Matched by email";
    } else if (matchedByName.length === 1) {
      matched = matchedByName[0];
      matchType = "name";
      reason = "Matched by name";
    } else if (matchedByName.length > 1) {
      conflict = true;
      matchType = "ambiguous";
      reason = `Ambiguous name - ${matchedByName.length} registrants share this first and last name`;
    } else if (!inputEmail && !inputName) {
      conflict = true;
      reason = "Row has no email or name to match";
    } else {
      conflict = true;
    }

    if (matched && !conflict && inputName) {
      addNameAlias(inputName, matched);
    }

    if (matched && !conflict && options.rejectDuplicateMatches) {
      const firstRowIndex = seenMatches.get(matched.id);
      if (firstRowIndex !== undefined) {
        conflict = true;
        matchType = "duplicate";
        reason = `Duplicate attendance row - already matched row ${firstRowIndex + 2}`;
      } else {
        seenMatches.set(matched.id, index);
      }
    }

    return { row, index, matched, matchType, conflict, reason };
  });
}

module.exports = {
  findRegistrationMatches,
  isDisallowedOrganizationName,
  isValidEmailAddress,
  normalizeMatchName,
  toRegistrationId
};
const { createHash } = require("node:crypto");

function toRegistrationId(eventId, attendeeEmail) {
  const normalizedEventId = String(eventId || "").trim();
  const normalizedEmail = String(attendeeEmail || "").trim().toLowerCase();
  const emailHash = createHash("sha256").update(normalizedEmail).digest("hex");
  return `${normalizedEventId}|registration-${emailHash}`;
}
