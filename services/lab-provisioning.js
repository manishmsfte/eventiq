function parseLabDeletionRange(value, batchStart, batchCount) {
  const input = String(value || "").trim();
  const match = input.match(/^(\d+)(?:-(\d*))?$/);
  if (!match) {
    throw new Error("Lab range must be a number, a closed range such as 1-5, or an open range such as 1-.");
  }

  const minimum = Number(batchStart);
  const maximum = minimum + Number(batchCount) - 1;
  const startStudentNumber = Number(match[1]);
  const hasHyphen = input.includes("-");
  const endStudentNumber = hasHyphen
    ? (match[2] ? Number(match[2]) : maximum)
    : startStudentNumber;
  if (
    !Number.isInteger(minimum)
    || !Number.isInteger(maximum)
    || !Number.isInteger(startStudentNumber)
    || !Number.isInteger(endStudentNumber)
    || startStudentNumber < minimum
    || endStudentNumber > maximum
    || startStudentNumber > endStudentNumber
  ) {
    throw new Error(`Lab range must stay within ${minimum}-${maximum} and start before it ends.`);
  }

  return { startStudentNumber, endStudentNumber };
}

function parseRegistrationSequenceRange(value, registrationCount) {
  const input = String(value || "").trim();
  const match = input.match(/^(\d+)(?:-(\d*))?$/);
  if (!match) {
    throw new Error("Registration sequence must be a number, a closed range such as 24-27, or an open range such as 1-.");
  }

  const maximum = Number(registrationCount);
  const startSequence = Number(match[1]);
  const hasHyphen = input.includes("-");
  const endSequence = hasHyphen
    ? (match[2] ? Number(match[2]) : maximum)
    : startSequence;
  if (
    !Number.isInteger(maximum)
    || maximum < 1
    || !Number.isInteger(startSequence)
    || !Number.isInteger(endSequence)
    || startSequence < 1
    || endSequence > maximum
    || startSequence > endSequence
  ) {
    throw new Error(`Registration sequence must stay within 1-${maximum} and start before it ends.`);
  }

  return { startSequence, endSequence };
}

function getProvisioningRowStudentNumber(row) {
  const value = row?.Student ?? row?.student ?? row?.StudentNumber ?? row?.studentNumber ?? row?.LabNumber ?? row?.labNumber;
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function getMissingProvisioningCredentialFields(row, isDocDB) {
  const normalized = Object.entries(row || {}).reduce((fields, [key, value]) => {
    fields[String(key || "").trim().toLowerCase()] = String(value || "").trim();
    return fields;
  }, {});
  const pick = (...names) =>
    names.map((name) => normalized[String(name).toLowerCase()]).find(Boolean) || "";
  const databaseType = String(
    isDocDB === undefined
      ? pick("labDatabaseAccountType", "DatabaseAccountType")
      : (isDocDB ? "documentdb" : "cosmosdb")
  ).toLowerCase();
  const bastionUri = pick("BastionUri", "LabWebUri", "WebUri", "labWebUri");
  const required = [
    ["BastionUri", bastionUri],
    ["VmName", pick("VmName", "labVmName")],
    ["VmAdminUsername", pick("VmAdminUsername", "VmUsername", "labVmUsername")],
    ["VmAdminPassword", pick("VmAdminPassword", "VmPassword", "Password", "labVmPassword")],
    ["UserPrincipalName", pick("UserPrincipalName", "PortalUsername", "StudentUpn", "labPortalUsername")],
    ["TempPassword", pick("TempPassword", "TempPass", "PortalPassword", "PortalPass", "UserPassword", "labPortalPassword")],
    ["ResourceGroup", pick("ResourceGroup", "ResourceGroupName", "labResourceGroup")]
  ];

  if (databaseType === "documentdb") {
    required.push([
      "DocumentDbCluster",
      pick("DocumentDbCluster", "DocumentDBCluster", "DatabaseAccountName", "labDatabaseAccountName")
    ]);
  } else {
    required.push([
      "CosmosServerlessAccount",
      pick("CosmosServerlessAccount", "DatabaseAccountName", "labDatabaseAccountName")
    ]);
    required.push(["CosmosProvisionedAccount", pick("CosmosProvisionedAccount")]);
  }

  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (bastionUri && !/^https:\/\//i.test(bastionUri)) {
    missing.push("BastionUri (valid HTTPS URL)");
  }
  return missing;
}

function allocateLabStudentNumbers(batches, registrations, count) {
  const usedNumbers = [];
  for (const batch of Array.isArray(batches) ? batches : []) {
    if (Array.isArray(batch?.requestedStudentNumbers) && batch.requestedStudentNumbers.length) {
      usedNumbers.push(...batch.requestedStudentNumbers.map(Number).filter(Number.isInteger));
      continue;
    }
    const start = Number(batch?.startStudentNumber);
    const batchCount = Number(batch?.studentCount);
    if (Number.isInteger(start) && Number.isInteger(batchCount) && start > 0 && batchCount > 0) {
      usedNumbers.push(...Array.from({ length: batchCount }, (_, index) => start + index));
    }
  }
  for (const registration of Array.isArray(registrations) ? registrations : []) {
    const match = String(registration?.labResourceGroup || "").match(/^lab-dev(\d+)-/i);
    if (match) {
      usedNumbers.push(Number(match[1]));
    }
  }

  const requestedCount = Number(count);
  const start = Math.max(0, ...usedNumbers) + 1;
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || start + requestedCount - 1 > 999) {
    throw new Error("No unused physical lab numbers are available for this request.");
  }
  return Array.from({ length: requestedCount }, (_, index) => start + index);
}

function selectProvisioningRowsForBatch(rows, batchStart, batchCount) {
  const start = Number(batchStart);
  const count = Number(batchCount);
  const end = start + count - 1;
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      const studentNumber = getProvisioningRowStudentNumber(row);
      return studentNumber >= start && studentNumber <= end;
    })
    .sort((left, right) => getProvisioningRowStudentNumber(left) - getProvisioningRowStudentNumber(right));
}

function mapProvisioningRowsToRegistrationIndexes(rows, batchStartOrStudentNumbers, batchCount) {
  const studentNumbers = Array.isArray(batchStartOrStudentNumbers)
    ? batchStartOrStudentNumbers.map(Number)
    : Array.from({ length: Number(batchCount) }, (_, index) => Number(batchStartOrStudentNumbers) + index);
  const registrationIndexByStudentNumber = new Map(
    studentNumbers.map((studentNumber, index) => [studentNumber, index])
  );
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      registrationIndex: registrationIndexByStudentNumber.get(getProvisioningRowStudentNumber(row)),
      row
    }))
    .filter(({ registrationIndex }) => Number.isInteger(registrationIndex))
    .sort((left, right) => left.registrationIndex - right.registrationIndex);
}

function selectProvisioningRegistrationEntries(registrations, startSequence, endSequence, availableRegistrationIds) {
  const availableIds = availableRegistrationIds instanceof Set
    ? availableRegistrationIds
    : new Set(availableRegistrationIds || []);
  return [...(Array.isArray(registrations) ? registrations : [])]
    .sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime())
    .slice(Number(startSequence) - 1, Number(endSequence))
    .map((registration, index) => ({
      registration,
      sequence: Number(startSequence) + index
    }))
    .filter(({ registration }) =>
      String(registration?.status || "registered").toLowerCase() === "registered"
      && availableIds.has(registration.id)
    );
}

function selectProvisioningTeamMembers(assignments, reservedRecipientIds = [], includeAssigned = false) {
  const reservedIds = new Set(reservedRecipientIds || []);
  const membersByEmail = new Map();
  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    const email = String(assignment?.inviteEmail || "").trim().toLowerCase();
    const recipientId = email ? `team:${email}` : "";
    if (!email || reservedIds.has(recipientId)) {
      continue;
    }
    const current = membersByEmail.get(email);
    const assignmentHasLabAccess = Boolean(
      assignment.labWebUri
      || assignment.labVmUsername
      || assignment.labResourceGroup
      || assignment.labPortalUsername
      || assignment.labDatabaseAccountName
      || assignment.labFoundryAccountName
    );
    const roles = new Set(current?.roles || []);
    roles.add(String(assignment.personaType || "").toLowerCase());
    const member = {
      id: recipientId,
      email,
      name: String(assignment.personaName || current?.name || email).trim(),
      roles: [...roles].filter((role) => ["speaker", "proctor"].includes(role)),
      assignment: assignmentHasLabAccess ? assignment : current?.assignment || assignment,
      labAccessUpdatedAt: assignment.labAccessUpdatedAt || current?.labAccessUpdatedAt || ""
    };
    if (assignmentHasLabAccess) {
      member.hasLabAccess = true;
    } else {
      member.hasLabAccess = Boolean(current?.hasLabAccess);
    }
    membersByEmail.set(email, member);
  }
  return [...membersByEmail.values()].filter((member) => includeAssigned || !member.hasLabAccess);
}

module.exports = {
  allocateLabStudentNumbers,
  getMissingProvisioningCredentialFields,
  getProvisioningRowStudentNumber,
  mapProvisioningRowsToRegistrationIndexes,
  parseLabDeletionRange,
  parseRegistrationSequenceRange,
  selectProvisioningRegistrationEntries,
  selectProvisioningTeamMembers,
  selectProvisioningRowsForBatch
};
