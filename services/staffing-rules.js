function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function toTeamMemberId(email) {
  return `team:${normalizeEmail(email)}`;
}

function buildEventTeam({ assignments = [], profiles = [], sessions = [] }) {
  const membersByEmail = new Map();
  const assignedEmails = new Set(assignments.map((item) => normalizeEmail(item.inviteEmail)).filter(Boolean));
  const referencedIds = new Set(
    sessions.flatMap((session) => [...(session.speakerIds || []), ...(session.proctorIds || [])]).map(String)
  );
  const ensureMember = (email) => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return null;
    }
    if (!membersByEmail.has(normalizedEmail)) {
      membersByEmail.set(normalizedEmail, {
        id: toTeamMemberId(normalizedEmail),
        email: normalizedEmail,
        name: normalizedEmail,
        availableFrom: "",
        availableTo: "",
        availableSessionIds: [],
        aliasIds: new Set([
          toTeamMemberId(normalizedEmail),
          `persona:speaker:${normalizedEmail}`,
          `persona:proctor:${normalizedEmail}`,
          `publisher:${normalizedEmail}`
        ]),
        speakerSessionCount: 0,
        proctorSessionCount: 0,
        fullDaySpeaker: false,
        fullDayProctor: false
      });
    }
    return membersByEmail.get(normalizedEmail);
  };

  for (const profile of profiles) {
    const profileEmail = normalizeEmail(profile.email);
    const profileAliases = [
      String(profile.id || ""),
      toTeamMemberId(profileEmail),
      `persona:speaker:${profileEmail}`,
      `persona:proctor:${profileEmail}`,
      `publisher:${profileEmail}`
    ];
    if (!assignedEmails.has(profileEmail) && !profileAliases.some((id) => referencedIds.has(id))) {
      continue;
    }
    const member = ensureMember(profile.email);
    if (!member) {
      continue;
    }
    member.name = String(profile.name || member.name).trim();
    member.partnerName = String(profile.partnerName || member.partnerName || "").trim();
    member.aliasIds.add(String(profile.id || ""));
  }

  for (const assignment of assignments) {
    const member = ensureMember(assignment.inviteEmail);
    if (!member) {
      continue;
    }
    member.aliasIds.add(`persona:${String(assignment.personaType || "").toLowerCase()}:${member.email}`);
    if (!member.availableFrom || new Date(assignment.availableFrom) < new Date(member.availableFrom)) {
      member.availableFrom = assignment.availableFrom;
    }
    if (!member.availableTo || new Date(assignment.availableTo) > new Date(member.availableTo)) {
      member.availableTo = assignment.availableTo;
    }
    if (Array.isArray(assignment.availableSessionIds) && assignment.availableSessionIds.length) {
      member.availableSessionIds = [...new Set([
        ...member.availableSessionIds,
        ...assignment.availableSessionIds.map(String)
      ])];
    }
    if (assignment.assignAllSessions && String(assignment.personaType).toLowerCase() === "speaker") {
      member.fullDaySpeaker = true;
    }
    if (assignment.assignAllSessions && String(assignment.personaType).toLowerCase() === "proctor") {
      member.fullDayProctor = true;
    }
  }

  for (const session of sessions) {
    for (const member of membersByEmail.values()) {
      if ((session.speakerIds || []).some((id) => member.aliasIds.has(String(id)))) {
        member.speakerSessionCount += 1;
      }
      if ((session.proctorIds || []).some((id) => member.aliasIds.has(String(id)))) {
        member.proctorSessionCount += 1;
      }
    }
  }

  return [...membersByEmail.values()]
    .map((member) => ({ ...member, aliasIds: [...member.aliasIds].filter(Boolean) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildExistingPeople(loginUsers = []) {
  const peopleByEmail = new Map();
  for (const user of loginUsers) {
    const email = normalizeEmail(user.email);
    if (!email || user.active === false) {
      continue;
    }
    const existing = peopleByEmail.get(email);
    peopleByEmail.set(email, {
      id: toTeamMemberId(email),
      email,
      name: String(user.name || existing?.name || email).trim(),
      partnerName: String(user.partnerName || existing?.partnerName || "").trim(),
      roles: [...new Set([
        ...(existing?.roles || []),
        ...(Array.isArray(user.roles) ? user.roles : []),
        String(user.userType || "").toLowerCase()
      ].filter(Boolean))]
    });
  }

  return [...peopleByEmail.values()]
    .sort((left, right) => left.name.localeCompare(right.name));
}

function isTeamMemberAvailable(member, session) {
  if (!member || !session) {
    return false;
  }
  if (
    Array.isArray(member.availableSessionIds)
    && member.availableSessionIds.length
    && !member.availableSessionIds.includes(String(session.id))
  ) {
    return false;
  }

  const sessionStart = new Date(session.startAt).getTime();
  const sessionEnd = new Date(session.endAt).getTime();
  const availableFrom = member.availableFrom ? new Date(member.availableFrom).getTime() : Number.NEGATIVE_INFINITY;
  const availableTo = member.availableTo ? new Date(member.availableTo).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(sessionStart)
    && Number.isFinite(sessionEnd)
    && sessionStart >= availableFrom
    && sessionEnd <= availableTo;
}

function applyBulkStaffing(sessions, member, assignmentRole, selectedSessionIds) {
  const selectedIds = new Set((selectedSessionIds || []).map(String));
  const updatedSessions = [];
  for (const session of sessions) {
    if (
      session.rowType !== "session"
      || !selectedIds.has(String(session.id))
      || !isTeamMemberAvailable(member, session)
    ) {
      continue;
    }
    updatedSessions.push({
      ...session,
      speakerIds: ["speaker", "both"].includes(assignmentRole)
        ? [member.id]
        : session.speakerIds || [],
      proctorIds: ["proctor", "both"].includes(assignmentRole)
        ? [...new Set([...(session.proctorIds || []), member.id])]
        : session.proctorIds || []
    });
  }
  return updatedSessions;
}

function getInheritedSessionStaffing(assignments, session) {
  const speakerIds = [];
  const proctorIds = [];
  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    if (!assignment.assignAllSessions || !isTeamMemberAvailable(assignment, session)) {
      continue;
    }
    const memberId = toTeamMemberId(assignment.inviteEmail);
    if (String(assignment.personaType).toLowerCase() === "speaker") {
      speakerIds.push(memberId);
    }
    if (String(assignment.personaType).toLowerCase() === "proctor") {
      proctorIds.push(memberId);
    }
  }
  return {
    speakerIds: [...new Set(speakerIds)],
    proctorIds: [...new Set(proctorIds)]
  };
}

module.exports = {
  applyBulkStaffing,
  buildEventTeam,
  buildExistingPeople,
  getInheritedSessionStaffing,
  isTeamMemberAvailable,
  normalizeEmail,
  toTeamMemberId
};
