const { CosmosClient, ConnectionMode } = require("@azure/cosmos");
const { DefaultAzureCredential } = require("@azure/identity");
const { createHash, randomUUID } = require("crypto");
const { isValidEmailAddress, toRegistrationId } = require("./services/registration-rules");
const {
  hasLoginRole,
  mergeLoginUsersByEmail,
  selectLatestLoginUser
} = require("./services/account-security");
const { buildEventSessionId } = require("./services/event-rules");
const { isPartnerAccount } = require("./services/partner-rules");

const endpoint = process.env.COSMOS_DB_ENDPOINT;
const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
const databaseId = process.env.COSMOS_DB_DATABASE || "hol-registrations";
const eventsContainerId = process.env.COSMOS_DB_EVENTS_CONTAINER || "events";
const registrationsContainerId = process.env.COSMOS_DB_REGISTRATIONS_CONTAINER || "registrations";
const feedbackContainerId = process.env.COSMOS_DB_FEEDBACK_CONTAINER || "feedback";
const metadataContainerId = process.env.COSMOS_DB_METADATA_CONTAINER || "metadata";
const autoProvision = String(process.env.COSMOS_DB_AUTO_PROVISION || "false").toLowerCase() === "true";
const preferredLocations = String(process.env.COSMOS_DB_PREFERRED_LOCATIONS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!endpoint && !connectionString) {
  throw new Error("Set COSMOS_DB_ENDPOINT (AAD) or COSMOS_DB_CONNECTION_STRING.");
}

// Prefer AAD token-based auth when endpoint is provided.
const client = endpoint
  ? new CosmosClient({
      endpoint,
      aadCredentials: new DefaultAzureCredential(),
      userAgentSuffix: "labautomation-events",
      connectionPolicy: {
        connectionMode: ConnectionMode.Direct,
        preferredLocations,
        retryOptions: {
          maxRetryAttemptCount: 9,
          fixedRetryIntervalInMilliseconds: 0,
          maxWaitTimeInSeconds: 30
        },
        enableEndpointDiscovery: true
      }
    })
  : new CosmosClient({
      connectionString,
      userAgentSuffix: "labautomation-events",
      connectionPolicy: {
        connectionMode: ConnectionMode.Direct,
        preferredLocations,
        retryOptions: {
          maxRetryAttemptCount: 9,
          fixedRetryIntervalInMilliseconds: 0,
          maxWaitTimeInSeconds: 30
        },
        enableEndpointDiscovery: true
      }
    });
let databasePromise;

async function getDatabase() {
  if (!databasePromise) {
    if (autoProvision) {
      databasePromise = client.databases.createIfNotExists({ id: databaseId }).then(({ database }) => database);
    } else {
      databasePromise = Promise.resolve(client.database(databaseId));
    }
  }

  return databasePromise;
}

async function getEventsContainer() {
  const database = await getDatabase();
  if (autoProvision) {
    const { container } = await database.containers.createIfNotExists({
      id: eventsContainerId,
      partitionKey: "/publisherEmail"
    });

    return container;
  }

  return database.container(eventsContainerId);
}

async function getRegistrationsContainer() {
  const database = await getDatabase();
  if (autoProvision) {
    const { container } = await database.containers.createIfNotExists({
      id: registrationsContainerId,
      partitionKey: "/eventId"
    });

    return container;
  }

  return database.container(registrationsContainerId);
}

async function getFeedbackContainer() {
  const database = await getDatabase();
  if (autoProvision) {
    const { container } = await database.containers.createIfNotExists({
      id: feedbackContainerId,
      partitionKey: "/eventId"
    });

    return container;
  }

  return database.container(feedbackContainerId);
}

async function getMetadataContainer() {
  const database = await getDatabase();
  if (autoProvision) {
    const { container } = await database.containers.createIfNotExists({
      id: metadataContainerId,
      partitionKey: "/type"
    });

    return container;
  }

  return database.container(metadataContainerId);
}

async function queryItems(container, querySpec) {
  const { resources } = await container.items.query(querySpec).fetchAll();
  return resources;
}

async function queryItemsScoped(container, querySpec, partitionKey) {
  const { resources } = await container.items.query(querySpec, { partitionKey }).fetchAll();
  return resources;
}

function toLoginUserId(email, userType) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedType = String(userType || "").trim().toLowerCase();
  const slug = normalizedEmail.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `login-${normalizedType}-${slug}`;
}

function toLoginIdentityId(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const slug = normalizedEmail.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `login-user-${slug}`;
}

function toPersonaAssignmentId(eventId, personaType, inviteEmail) {
  const signature = [
    String(eventId || "").trim(),
    String(personaType || "").trim().toLowerCase(),
    String(inviteEmail || "").trim().toLowerCase()
  ].join("|");
  return `persona-${createHash("sha256").update(signature).digest("hex").slice(0, 32)}`;
}

function toEventLookupId(eventId) {
  return `event-key-${eventId}`;
}

function parseEventIdFromRegistrationId(registrationId) {
  const raw = String(registrationId || "");
  const separatorIndex = raw.indexOf("|");
  if (separatorIndex < 1) {
    return null;
  }

  return raw.slice(0, separatorIndex);
}

function toRegistrationCode() {
  return randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

function normalizePartnerKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toStoredDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }

  return date.toISOString();
}

async function listEvents() {
  const container = await getEventsContainer();
  return queryItems(container, { query: "SELECT * FROM c ORDER BY c.startAt ASC" });
}

async function getEventById(id) {
  const metadataContainer = await getMetadataContainer();
  const lookupId = toEventLookupId(id);

  // Fast path: point-read lookup to get partition key, then point-read event item.
  try {
    const { resource: lookup } = await metadataContainer.item(lookupId, "event-key").read();
    if (lookup && lookup.publisherEmail) {
      const eventsContainer = await getEventsContainer();
      const { resource: event } = await eventsContainer.item(String(id), String(lookup.publisherEmail)).read();
      if (event) {
        return event;
      }
    }
  } catch (error) {
    if (!error || error.code !== 404) {
      throw error;
    }
  }

  // Fallback for legacy data where lookup doc does not exist yet.
  const container = await getEventsContainer();
  const events = await queryItems(container, {
    query: "SELECT * FROM c WHERE c.id = @id OFFSET 0 LIMIT 1",
    parameters: [{ name: "@id", value: String(id) }]
  });

  if (events[0] && events[0].publisherEmail) {
    await metadataContainer.items.upsert({
      id: toEventLookupId(events[0].id),
      type: "event-key",
      eventId: events[0].id,
      publisherEmail: events[0].publisherEmail,
      updatedAt: new Date().toISOString()
    });
  }

  return events[0];
}

function toEventUniquenessId(key) {
  const slug = String(key || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `event-unique-${slug}`;
}

function toLabProvisioningJobId(eventId) {
  return `lab-provisioning-${String(eventId || "").trim()}`;
}

function toLabProvisioningBatchId(eventId, batchId) {
  return `lab-provisioning-batch-${String(eventId || "").trim()}-${String(batchId || "").trim()}`;
}

function toLabProvisioningReservationId(eventId, registrationId) {
  return `lab-provisioning-reservation-${String(eventId || "").trim()}-${String(registrationId || "").trim()}`;
}

// Atomically reserves a uniqueness key so concurrent double-submits (double-click, slow
// network retry) cannot both pass a duplicate check and create two events. Cosmos DB
// create() is atomic and throws 409 on an existing id, so this closes the race that a
// SELECT-then-INSERT duplicate check cannot.
async function reserveEventUniquenessKey(key) {
  const container = await getMetadataContainer();
  const id = toEventUniquenessId(key);
  try {
    await container.items.create({ id, type: "event-uniqueness", key, createdAt: new Date().toISOString() });
    return true;
  } catch (error) {
    if (error && error.code === 409) {
      return false;
    }

    throw error;
  }
}

async function releaseEventUniquenessKey(key) {
  const container = await getMetadataContainer();
  const id = toEventUniquenessId(key);
  try {
    await container.item(id, "event-uniqueness").delete();
  } catch (error) {
    if (!error || error.code !== 404) {
      throw error;
    }
  }
}

async function createEvent(payload) {
  const container = await getEventsContainer();
  const metadataContainer = await getMetadataContainer();
  const event = {
    id: randomUUID(),
    title: payload.title,
    description: payload.description,
    startAt: toStoredDateTime(payload.startAt),
    endAt: toStoredDateTime(payload.endAt),
    city: payload.city || "",
    address: payload.address || "",
    deliveryMode: payload.deliveryMode,
    timeZone: payload.timeZone || "UTC",
    maxSeats: payload.maxSeats,
    teamsLink: payload.teamsLink || "",
    holUri: String(payload.holUri || "").trim(),
    publisherEmail: payload.publisherEmail,
    partnerId: String(payload.partnerId || "").trim(),
    partnerName: String(payload.partnerName || "").trim(),
    partnerWebsiteUrl: String(payload.partnerWebsiteUrl || "").trim(),
    partnerPrivacyPolicyUrl: String(payload.partnerPrivacyPolicyUrl || "").trim(),
    publicationStatus: String(payload.publicationStatus || "approved").trim().toLowerCase(),
    publicationSubmittedAt: payload.partnerId ? new Date().toISOString() : "",
    unlisted: Boolean(payload.unlisted),
    createdAt: new Date().toISOString()
  };

  const { resource } = await container.items.create(event);

  await metadataContainer.items.upsert({
    id: toEventLookupId(resource.id),
    type: "event-key",
    eventId: resource.id,
    publisherEmail: resource.publisherEmail,
    updatedAt: new Date().toISOString()
  });

  return resource;
}

async function findDuplicateEventBySignature(publisherEmail, title, startAt, endAt, timeZone) {
  const container = await getEventsContainer();
  const parameters = [
    { name: "@publisherEmail", value: String(publisherEmail || "").toLowerCase() },
    { name: "@startAt", value: new Date(startAt).toISOString() },
    { name: "@endAt", value: new Date(endAt).toISOString() },
    { name: "@timeZone", value: String(timeZone || "").trim().toLowerCase() }
  ];
  const query =
    "SELECT * FROM c WHERE c.publisherEmail = @publisherEmail AND c.startAt = @startAt AND c.endAt = @endAt AND LOWER(c.timeZone) = @timeZone";

  const events = await queryItemsScoped(
    container,
    { query, parameters },
    String(publisherEmail || "").toLowerCase()
  );

  const normalizedTitle = String(title || "").trim().replace(/\s+/g, " ").toLowerCase();
  return events.find(
    (event) => String(event.title || "").trim().replace(/\s+/g, " ").toLowerCase() === normalizedTitle
  ) || null;
}

async function updateEvent(id, publisherEmail, payload) {
  const container = await getEventsContainer();
  const { resource: current } = await container.item(String(id), String(publisherEmail)).read();
  if (!current) {
    return null;
  }

  const updated = {
    ...current,
    title: payload.title,
    description: payload.description,
    startAt: toStoredDateTime(payload.startAt),
    endAt: toStoredDateTime(payload.endAt),
    city: payload.city || "",
    address: payload.address || "",
    deliveryMode: payload.deliveryMode,
    timeZone: payload.timeZone || "UTC",
    maxSeats: payload.maxSeats,
    teamsLink: payload.teamsLink || "",
    holUri: String(payload.holUri || "").trim(),
    unlisted: Boolean(payload.unlisted),
    publicationStatus: String(payload.publicationStatus || current.publicationStatus || "approved").toLowerCase(),
    publicationSubmittedAt: payload.publicationSubmittedAt ?? current.publicationSubmittedAt,
    publicationReviewedAt: payload.publicationReviewedAt ?? current.publicationReviewedAt,
    publicationReviewedBy: payload.publicationReviewedBy ?? current.publicationReviewedBy,
    publicationRejectionReason: payload.publicationRejectionReason ?? current.publicationRejectionReason,
    updatedAt: new Date().toISOString()
  };

  const { resource } = await container
    .item(String(current.id), String(current.publisherEmail))
    .replace(updated, current._etag ? { accessCondition: { type: "IfMatch", condition: current._etag } } : undefined);
  return resource;
}

async function recordEventAuditEntry(payload) {
  const container = await getMetadataContainer();
  const timestamp = payload.timestamp || new Date().toISOString();
  const doc = {
    id: `event-audit-${String(payload.eventId)}-${randomUUID()}`,
    type: "event-audit",
    eventId: String(payload.eventId),
    action: String(payload.action || "updated"),
    actorEmail: String(payload.actorEmail || "").trim().toLowerCase(),
    actorName: String(payload.actorName || "").trim(),
    timestamp,
    summary: String(payload.summary || "").trim(),
    oldValues: payload.oldValues || {},
    newValues: payload.newValues || {}
  };

  const { resource } = await container.items.create(doc);
  return resource;
}

async function listEventAuditEntries(eventId, limit = 10) {
  const container = await getMetadataContainer();
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 10, 50));
  return queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.type = @type AND c.eventId = @eventId ORDER BY c.timestamp DESC OFFSET 0 LIMIT @limit",
      parameters: [
        { name: "@type", value: "event-audit" },
        { name: "@eventId", value: String(eventId) },
        { name: "@limit", value: safeLimit }
      ]
    },
    "event-audit"
  );
}

async function recordApplicationAuditEntry(payload) {
  const container = await getMetadataContainer();
  const timestamp = payload.timestamp || new Date().toISOString();
  const doc = {
    id: `application-audit-${randomUUID()}`,
    type: "application-audit",
    timestamp,
    method: String(payload.method || "").toUpperCase(),
    path: String(payload.path || "").slice(0, 500),
    statusCode: Number(payload.statusCode || 0),
    actorEmail: String(payload.actorEmail || "").trim().toLowerCase(),
    actorName: String(payload.actorName || "").trim(),
    actorRole: String(payload.actorRole || "anonymous").trim().toLowerCase(),
    eventId: String(payload.eventId || "").trim()
  };

  const { resource } = await container.items.create(doc);
  return resource;
}

async function listApplicationAuditEntries(limit = 500) {
  const container = await getMetadataContainer();
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 500, 2000));
  return queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.type = @type ORDER BY c.timestamp DESC OFFSET 0 LIMIT @limit",
      parameters: [
        { name: "@type", value: "application-audit" },
        { name: "@limit", value: safeLimit }
      ]
    },
    "application-audit"
  );
}

function toEventCollaboratorId(eventId, collaboratorEmail) {
  return `event-collab-${eventId}-${String(collaboratorEmail || "").trim().toLowerCase()}`;
}

async function upsertEventCollaborator(payload) {
  const container = await getMetadataContainer();
  const eventId = String(payload.eventId);
  const collaboratorEmail = String(payload.collaboratorEmail || "").trim().toLowerCase();
  const now = new Date().toISOString();
  const existing = await getEventCollaboratorAccess(eventId, collaboratorEmail);
  const doc = {
    id: toEventCollaboratorId(eventId, collaboratorEmail),
    type: "event-collaborator",
    eventId,
    ownerPublisherEmail: String(payload.ownerPublisherEmail || "").trim().toLowerCase(),
    collaboratorEmail,
    accessLevel: String(payload.accessLevel || "read").toLowerCase() === "write" ? "write" : "read",
    createdAt: payload.createdAt || existing?.createdAt || now,
    updatedAt: now
  };

  const { resource } = await container.items.upsert(doc);
  return resource;
}

async function listEventCollaboratorsByEvent(eventId) {
  const container = await getMetadataContainer();
  return queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.type = @type AND c.eventId = @eventId ORDER BY c.createdAt DESC",
      parameters: [
        { name: "@type", value: "event-collaborator" },
        { name: "@eventId", value: String(eventId) }
      ]
    },
    "event-collaborator"
  );
}

async function listEventCollaboratorsByOwner(ownerPublisherEmail) {
  const container = await getMetadataContainer();
  return queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.type = @type AND c.ownerPublisherEmail = @ownerPublisherEmail ORDER BY c.createdAt ASC",
      parameters: [
        { name: "@type", value: "event-collaborator" },
        { name: "@ownerPublisherEmail", value: String(ownerPublisherEmail || "").trim().toLowerCase() }
      ]
    },
    "event-collaborator"
  );
}

async function listEventCollaborationsByEmail(collaboratorEmail) {
  const container = await getMetadataContainer();
  return queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.type = @type AND c.collaboratorEmail = @collaboratorEmail",
      parameters: [
        { name: "@type", value: "event-collaborator" },
        { name: "@collaboratorEmail", value: String(collaboratorEmail || "").trim().toLowerCase() }
      ]
    },
    "event-collaborator"
  );
}

async function getEventCollaboratorAccess(eventId, collaboratorEmail) {
  const container = await getMetadataContainer();
  try {
    const { resource } = await container
      .item(toEventCollaboratorId(eventId, collaboratorEmail), "event-collaborator")
      .read();
    return resource || null;
  } catch (error) {
    if (error && error.code === 404) {
      return null;
    }

    throw error;
  }
}

async function removeEventCollaborator(eventId, collaboratorEmail) {
  const container = await getMetadataContainer();
  await container.item(toEventCollaboratorId(eventId, collaboratorEmail), "event-collaborator").delete();
}

async function listRegistrationsByEvent(eventId) {
  const container = await getRegistrationsContainer();
  return queryItemsScoped(
    container,
    {
      query:
        "SELECT * FROM c WHERE c.eventId = @eventId AND (NOT IS_DEFINED(c.status) OR (c.status != @status AND c.status != @rejected)) ORDER BY c.createdAt ASC",
      parameters: [
        { name: "@eventId", value: String(eventId) },
        { name: "@status", value: "deregistered" },
        { name: "@rejected", value: "rejected" }
      ]
    },
    String(eventId)
  );
}

async function listAllRegistrationsByEvent(eventId) {
  const container = await getRegistrationsContainer();
  return queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.eventId = @eventId ORDER BY c.createdAt ASC",
      parameters: [{ name: "@eventId", value: String(eventId) }]
    },
    String(eventId)
  );
}

async function countActiveRegistrationsByEvent(eventId) {
  const container = await getRegistrationsContainer();
  const rows = await queryItemsScoped(
    container,
    {
      query:
        "SELECT VALUE COUNT(1) FROM c WHERE c.eventId = @eventId AND (NOT IS_DEFINED(c.status) OR (c.status != @status AND c.status != @rejected))",
      parameters: [
        { name: "@eventId", value: String(eventId) },
        { name: "@status", value: "deregistered" },
        { name: "@rejected", value: "rejected" }
      ]
    },
    String(eventId)
  );

  return Number(rows[0] || 0);
}

async function countAttendedRegistrationsByEvent(eventId) {
  const container = await getRegistrationsContainer();
  const rows = await queryItemsScoped(
    container,
    {
      query:
        "SELECT VALUE COUNT(1) FROM c WHERE c.eventId = @eventId AND c.attended = true AND (NOT IS_DEFINED(c.status) OR c.status = @status)",
      parameters: [
        { name: "@eventId", value: String(eventId) },
        { name: "@status", value: "registered" }
      ]
    },
    String(eventId)
  );

  return Number(rows[0] || 0);
}

async function getRegistrationCountsByEvent(eventId) {
  const container = await getRegistrationsContainer();
  const rows = await queryItemsScoped(
    container,
    {
      query:
        "SELECT COUNT(1) AS registrationCount, SUM(IIF(c.attended = true, 1, 0)) AS attendedCount FROM c WHERE c.eventId = @eventId AND (NOT IS_DEFINED(c.status) OR (c.status != @status AND c.status != @rejected))",
      parameters: [
        { name: "@eventId", value: String(eventId) },
        { name: "@status", value: "deregistered" },
        { name: "@rejected", value: "rejected" }
      ]
    },
    String(eventId)
  );

  const counts = rows[0] || {};
  return {
    registrationCount: Number(counts.registrationCount) || 0,
    attendedCount: Number(counts.attendedCount) || 0
  };
}

async function getRegistrationCountsByEvents(eventIds) {
  const normalizedEventIds = [...new Set(
    (Array.isArray(eventIds) ? eventIds : [])
      .map((eventId) => String(eventId || "").trim())
      .filter(Boolean)
  )];
  if (!normalizedEventIds.length) {
    return new Map();
  }

  const container = await getRegistrationsContainer();
  const rows = await queryItems(container, {
    query:
      "SELECT c.eventId, COUNT(1) AS registrationCount, SUM(IIF(c.attended = true, 1, 0)) AS attendedCount FROM c WHERE ARRAY_CONTAINS(@eventIds, c.eventId) AND (NOT IS_DEFINED(c.status) OR (c.status != @status AND c.status != @rejected)) GROUP BY c.eventId",
    parameters: [
      { name: "@eventIds", value: normalizedEventIds },
      { name: "@status", value: "deregistered" },
      { name: "@rejected", value: "rejected" }
    ]
  });

  return new Map(
    rows.map((row) => [
      String(row.eventId || ""),
      {
        registrationCount: Number(row.registrationCount) || 0,
        attendedCount: Number(row.attendedCount) || 0
      }
    ])
  );
}

async function listRegistrationsByEmail(email) {
  const container = await getRegistrationsContainer();
  return queryItems(container, {
    query:
      "SELECT * FROM c WHERE LOWER(c.attendeeEmail) = @email AND (NOT IS_DEFINED(c.status) OR (c.status != @status AND c.status != @rejected)) ORDER BY c.createdAt DESC",
    parameters: [
      { name: "@email", value: String(email || "").toLowerCase() },
      { name: "@status", value: "deregistered" },
      { name: "@rejected", value: "rejected" }
    ]
  });
}

async function listKnownOrganizations() {
  const container = await getRegistrationsContainer();
  const rows = await queryItems(container, {
    query: "SELECT c.organization FROM c WHERE IS_DEFINED(c.organization)"
  });

  const normalized = new Map();
  for (const row of rows) {
    const raw = String((row && row.organization) || "").trim();
    if (!raw) {
      continue;
    }

    const key = raw.toLowerCase();
    if (!normalized.has(key)) {
      normalized.set(key, raw);
    }
  }

  return [...normalized.values()].sort((a, b) => a.localeCompare(b));
}

async function findActiveRegistrationByEventAndEmail(eventId, attendeeEmail) {
  const container = await getRegistrationsContainer();
  const registrations = await queryItemsScoped(
    container,
    {
      query:
        "SELECT * FROM c WHERE c.eventId = @eventId AND LOWER(c.attendeeEmail) = @attendeeEmail AND (NOT IS_DEFINED(c.status) OR (c.status != @status AND c.status != @rejected)) OFFSET 0 LIMIT 1",
      parameters: [
        { name: "@eventId", value: String(eventId) },
        { name: "@attendeeEmail", value: String(attendeeEmail || "").toLowerCase() },
        { name: "@status", value: "deregistered" },
        { name: "@rejected", value: "rejected" }
      ]
    },
    String(eventId)
  );

  return registrations[0] || null;
}

async function findRegistrationByEventAndEmail(eventId, attendeeEmail) {
  const container = await getRegistrationsContainer();
  const registrations = await queryItemsScoped(
    container,
    {
      query:
        "SELECT * FROM c WHERE c.eventId = @eventId AND LOWER(c.attendeeEmail) = @attendeeEmail OFFSET 0 LIMIT 1",
      parameters: [
        { name: "@eventId", value: String(eventId) },
        { name: "@attendeeEmail", value: String(attendeeEmail || "").trim().toLowerCase() }
      ]
    },
    String(eventId)
  );

  return registrations[0] || null;
}

async function getRegistrationByEmailAndCode(attendeeEmail, registrationCode) {
  const container = await getRegistrationsContainer();
  const registrations = await queryItems(container, {
    query:
      "SELECT * FROM c WHERE LOWER(c.attendeeEmail) = @attendeeEmail AND c.registrationCode = @registrationCode AND (NOT IS_DEFINED(c.status) OR c.status = @status) OFFSET 0 LIMIT 1",
    parameters: [
      { name: "@attendeeEmail", value: String(attendeeEmail || "").toLowerCase() },
      { name: "@registrationCode", value: String(registrationCode || "").trim().toUpperCase() },
      { name: "@status", value: "registered" }
    ]
  });

  return registrations[0] || null;
}

async function getRegistrationById(id) {
  const inferredEventId = parseEventIdFromRegistrationId(id);
  if (inferredEventId) {
    const container = await getRegistrationsContainer();
    try {
      const { resource } = await container.item(String(id), inferredEventId).read();
      if (resource) {
        return resource;
      }
    } catch (error) {
      if (!error || error.code !== 404) {
        throw error;
      }
    }
  }

  // Legacy fallback for older IDs that do not carry event partition information.
  const container = await getRegistrationsContainer();
  const registrations = await queryItems(container, {
    query: "SELECT * FROM c WHERE c.id = @id OFFSET 0 LIMIT 1",
    parameters: [{ name: "@id", value: String(id) }]
  });

  return registrations[0];
}

async function createRegistration(payload) {
  const container = await getRegistrationsContainer();
  const eventId = String(payload.eventId);
  const registration = {
    id: toRegistrationId(eventId, payload.attendeeEmail),
    eventId,
    attendeeName: payload.attendeeName,
    salutation: String(payload.salutation || "").trim(),
    firstName: String(payload.firstName || "").trim(),
    middleName: String(payload.middleName || "").trim(),
    lastName: String(payload.lastName || "").trim(),
    attendeeEmail: String(payload.attendeeEmail || "").toLowerCase(),
    organization: payload.organization,
    companyName: payload.companyName || payload.organization || "",
    phoneNumber: String(payload.phoneNumber || "").trim(),
    jobRole: String(payload.jobRole || "").trim(),
    country: String(payload.country || "").trim(),
    organizationSize: String(payload.organizationSize || "").trim(),
    partnerOptIn: Boolean(payload.partnerOptIn),
    eventDiscoverySource: String(payload.eventDiscoverySource || "").trim(),
    contactConsent: String(payload.contactConsent || "").trim().toLowerCase(),
    previewAuthorization: String(payload.previewAuthorization || "").trim().toLowerCase(),
    registrationCode: payload.pendingApproval ? "" : toRegistrationCode(),
    attended: false,
    status: payload.pendingApproval ? "pending-approval" : "registered",
    createdAt: new Date().toISOString()
  };

  const { resource } = await container.items.create(registration);
  return resource;
}

async function setRegistrationApproval(registration, approved, reviewedBy, reason = "") {
  const container = await getRegistrationsContainer();
  const now = new Date().toISOString();
  const updated = {
    ...registration,
    status: approved ? "registered" : "rejected",
    registrationCode: approved ? registration.registrationCode || toRegistrationCode() : "",
    registrationReviewedAt: now,
    registrationReviewedBy: String(reviewedBy || "").trim().toLowerCase(),
    registrationRejectionReason: approved ? "" : String(reason || "").trim()
  };
  const { resource } = await container
    .item(String(registration.id), String(registration.eventId))
    .replace(updated, registration._etag ? { accessCondition: { type: "IfMatch", condition: registration._etag } } : undefined);
  return resource;
}

async function updateRegistrationName(registration, nameParts) {
  const container = await getRegistrationsContainer();
  const salutation = String(nameParts.salutation || "").trim();
  const firstName = String(nameParts.firstName || "").trim();
  const middleName = String(nameParts.middleName || "").trim();
  const lastName = String(nameParts.lastName || "").trim();
  const updated = {
    ...registration,
    salutation,
    firstName,
    middleName,
    lastName,
    attendeeName: [salutation, firstName, middleName, lastName].filter(Boolean).join(" "),
    updatedAt: new Date().toISOString()
  };
  const { resource } = await container
    .item(String(registration.id), String(registration.eventId))
    .replace(updated, registration._etag ? { accessCondition: { type: "IfMatch", condition: registration._etag } } : undefined);
  return resource;
}

async function deregisterRegistration(registration, reason = "") {
  const container = await getRegistrationsContainer();
  const updated = {
    ...registration,
    status: "deregistered",
    deregisterReason: String(reason || ""),
    deregisteredAt: new Date().toISOString(),
    attended: false
  };

  const { resource } = await container.items.upsert(updated);
  return resource;
}

async function restoreRegistration(registration, restoredBy) {
  const container = await getRegistrationsContainer();
  const now = new Date().toISOString();
  const updated = {
    ...registration,
    status: "registered",
    registrationCode: registration.registrationCode || toRegistrationCode(),
    attended: false,
    attendanceMarkedAt: "",
    attendanceMarkedBy: "",
    deregisterReason: "",
    deregisteredAt: "",
    restoredAt: now,
    restoredBy: String(restoredBy || "")
  };

  const { resource } = await container.items.upsert(updated);
  return resource;
}

async function setRegistrationAttendance(registration, attended, markedBy) {
  const container = await getRegistrationsContainer();
  const updated = {
    ...registration,
    attended: Boolean(attended),
    attendanceMarkedAt: new Date().toISOString(),
    attendanceMarkedBy: String(markedBy || "")
  };

  const { resource } = await container.items.upsert(updated);
  return resource;
}

async function setRegistrationLabAccess(registration, labAccess) {
  const container = await getRegistrationsContainer();
  const preserveExistingNames = !labAccess.clearExisting;
  const updated = {
    ...registration,
    labWebUri: String(labAccess.labWebUri || (preserveExistingNames ? registration.labWebUri : "") || "").trim(),
    labVmName: String(labAccess.labVmName || (preserveExistingNames ? registration.labVmName : "") || "").trim(),
    labVmStatus: String(labAccess.labVmStatus || registration.labVmStatus || "unknown").trim().toLowerCase(),
    labVmStatusMessage: String(labAccess.labVmStatusMessage || registration.labVmStatusMessage || "").trim(),
    labVmUsername: String(labAccess.labVmUsername || (preserveExistingNames ? registration.labVmUsername : "") || "").trim(),
    labVmPassword: String(labAccess.labVmPassword || (preserveExistingNames ? registration.labVmPassword : "") || "").trim(),
    labPortalUsername: String(
      labAccess.labPortalUsername || (preserveExistingNames ? registration.labPortalUsername : "") || ""
    ).trim(),
    labPortalPassword: String(
      labAccess.labPortalPassword || (preserveExistingNames ? registration.labPortalPassword : "") || ""
    ).trim(),
    labResourceGroup: String(
      labAccess.labResourceGroup || (preserveExistingNames ? registration.labResourceGroup : "") || ""
    ).trim(),
    labDatabaseAccountName: String(
      labAccess.labDatabaseAccountName || (preserveExistingNames ? registration.labDatabaseAccountName : "") || ""
    ).trim(),
    labDatabaseAccountType: String(
      labAccess.labDatabaseAccountType || (preserveExistingNames ? registration.labDatabaseAccountType : "") || ""
    ).trim().toLowerCase(),
    labFoundryAccountName: String(
      labAccess.labFoundryAccountName || (preserveExistingNames ? registration.labFoundryAccountName : "") || ""
    ).trim(),
    labAccessUpdatedAt: new Date().toISOString()
  };

  const { resource } = await container.items.upsert(updated);
  return resource;
}

async function setPersonaLabAccess(eventId, inviteEmail, labAccess) {
  const container = await getMetadataContainer();
  const assignments = await listPersonaAssignmentsByEvent(eventId);
  const matchingAssignments = assignments.filter(
    (assignment) => String(assignment.inviteEmail || "").toLowerCase() === String(inviteEmail || "").toLowerCase()
  );
  const updatedAt = new Date().toISOString();
  const updatedAssignments = [];
  for (const assignment of matchingAssignments) {
    const updated = {
      ...assignment,
      labWebUri: String(labAccess.labWebUri || assignment.labWebUri || "").trim(),
      labVmName: String(labAccess.labVmName || assignment.labVmName || "").trim(),
      labVmStatus: String(labAccess.labVmStatus || assignment.labVmStatus || "unknown").trim().toLowerCase(),
      labVmStatusMessage: String(labAccess.labVmStatusMessage || assignment.labVmStatusMessage || "").trim(),
      labVmUsername: String(labAccess.labVmUsername || assignment.labVmUsername || "").trim(),
      labVmPassword: String(labAccess.labVmPassword || assignment.labVmPassword || "").trim(),
      labPortalUsername: String(labAccess.labPortalUsername || assignment.labPortalUsername || "").trim(),
      labPortalPassword: String(labAccess.labPortalPassword || assignment.labPortalPassword || "").trim(),
      labResourceGroup: String(labAccess.labResourceGroup || assignment.labResourceGroup || "").trim(),
      labDatabaseAccountName: String(labAccess.labDatabaseAccountName || assignment.labDatabaseAccountName || "").trim(),
      labDatabaseAccountType: String(labAccess.labDatabaseAccountType || assignment.labDatabaseAccountType || "").trim().toLowerCase(),
      labFoundryAccountName: String(labAccess.labFoundryAccountName || assignment.labFoundryAccountName || "").trim(),
      labAccessUpdatedAt: updatedAt,
      updatedAt
    };
    const { resource } = await container.items.upsert(updated);
    updatedAssignments.push(resource);
  }
  return updatedAssignments;
}

async function setRegistrationVmStatus(registration, status, message = "") {
  const container = await getRegistrationsContainer();
  const updated = {
    ...registration,
    labVmStatus: String(status || "unknown").trim().toLowerCase(),
    labVmStatusMessage: String(message || "").trim(),
    labVmStatusUpdatedAt: new Date().toISOString()
  };

  const { resource } = await container.items.upsert(updated);
  return resource;
}

async function setRegistrationDatabaseAccountName(registration, databaseAccountName) {
  const container = await getRegistrationsContainer();
  const updated = {
    ...registration,
    labDatabaseAccountName: String(databaseAccountName || "").trim(),
    labAccessUpdatedAt: new Date().toISOString()
  };

  const { resource } = await container.items.upsert(updated);
  return resource;
}

async function listFeedbackByEvent(eventId) {
  const container = await getFeedbackContainer();
  return queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.eventId = @eventId ORDER BY c.createdAt DESC",
      parameters: [{ name: "@eventId", value: String(eventId) }]
    },
    String(eventId)
  );
}

async function countFeedbackByEvent(eventId) {
  const container = await getFeedbackContainer();
  const rows = await queryItemsScoped(
    container,
    {
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.eventId = @eventId",
      parameters: [{ name: "@eventId", value: String(eventId) }]
    },
    String(eventId)
  );

  return Number(rows[0] || 0);
}

async function getFeedbackCountsByEvents(eventIds) {
  const normalizedEventIds = [...new Set(
    (Array.isArray(eventIds) ? eventIds : [])
      .map((eventId) => String(eventId || "").trim())
      .filter(Boolean)
  )];
  if (!normalizedEventIds.length) {
    return new Map();
  }

  const container = await getFeedbackContainer();
  const rows = await queryItems(container, {
    query:
      "SELECT c.eventId, COUNT(1) AS feedbackCount FROM c WHERE ARRAY_CONTAINS(@eventIds, c.eventId) GROUP BY c.eventId",
    parameters: [{ name: "@eventIds", value: normalizedEventIds }]
  });

  return new Map(rows.map((row) => [String(row.eventId || ""), Number(row.feedbackCount) || 0]));
}

async function createFeedback(payload) {
  const container = await getFeedbackContainer();
  const feedback = {
    id: randomUUID(),
    schemaVersion: 3,
    eventId: String(payload.eventId),
    candidateName: payload.candidateName,
    candidateEmail: payload.candidateEmail,
    rating: payload.rating,
    recommendation: payload.recommendation,
    comments: payload.comments,
    contactConsent: String(payload.contactConsent || "").trim().toLowerCase(),
    needsProjectHelp: payload.needsProjectHelp,
    projectTypes: payload.projectTypes || [],
    followUpType: payload.followUpType,
    followUpTypes: payload.followUpTypes || [],
    followUpDetails: payload.followUpDetails,
    sessionId: String(payload.sessionId || "").trim(),
    sessionTitle: String(payload.sessionTitle || "").trim(),
    sessionRatings: payload.sessionRatings || [],
    databaseAccountName: String(payload.databaseAccountName || "").trim(),
    createdAt: new Date().toISOString()
  };

  const { resource } = await container.items.create(feedback);
  return resource;
}

async function getAuthConfig() {
  const container = await getMetadataContainer();
  const configs = await queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.id = @id AND c.type = @type OFFSET 0 LIMIT 1",
      parameters: [
        { name: "@id", value: "auth-config" },
        { name: "@type", value: "auth-config" }
      ]
    },
    "auth-config"
  );

  return configs[0] || null;
}

async function upsertCustomerProfile(payload) {
  const container = await getMetadataContainer();
  const organizationKey = String(payload.organizationKey || "").trim();
  if (!organizationKey) {
    throw new Error("Customer profile organization key is required.");
  }

  const id = `customer-profile-${organizationKey}`;
  let existing = null;
  try {
    const response = await container.item(id, "customer-profile").read();
    existing = response.resource || null;
  } catch (error) {
    if (!error || error.code !== 404) {
      throw error;
    }
  }

  const doc = {
    ...(existing || {}),
    id,
    type: "customer-profile",
    organizationKey,
    organization: String(payload.organization || existing?.organization || "").trim(),
    segment: String(payload.segment || "").trim() || existing?.segment || "",
    region: String(payload.region || "").trim() || existing?.region || "",
    updatedAt: new Date().toISOString(),
    updatedBy: String(payload.updatedBy || "").trim().toLowerCase()
  };

  for (const field of ["totalAcrUsdLast6Months", "cosmosDbAcrUsdLast6Months", "cosmosDbAcrUsdLastMonth", "cosmosDbAcrGrowthPercent"]) {
    if (payload[field] !== undefined && payload[field] !== null && payload[field] !== "") {
      doc[field] = payload[field];
    }
  }

  const { resource } = await container.items.upsert(doc);
  return resource;
}

async function listCustomerProfilesByOrganizationKeys(keys) {
  const container = await getMetadataContainer();
  const profiles = await queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.type = @type",
      parameters: [{ name: "@type", value: "customer-profile" }]
    },
    "customer-profile"
  );
  const requestedKeys = Array.isArray(keys) && keys.length ? new Set(keys.map((key) => String(key))) : null;
  return requestedKeys ? profiles.filter((profile) => requestedKeys.has(String(profile.organizationKey))) : profiles;
}

async function listLoginUsers() {
  const container = await getMetadataContainer();
  const users = await queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.type = @type",
      parameters: [{ name: "@type", value: "login-user" }]
    },
    "login-user"
  );
  return mergeLoginUsersByEmail(users);
}

async function getLoginUserById(id) {
  const container = await getMetadataContainer();
  try {
    const { resource } = await container.item(String(id), "login-user").read();
    return resource || null;
  } catch (error) {
    if (error && error.code === 404) {
      return null;
    }

    throw error;
  }
}

async function upsertLabProvisioningJob(payload) {
  const container = await getMetadataContainer();
  const now = new Date().toISOString();
  const eventId = String(payload.eventId || "").trim();
  const existing = payload.id ? await getLabProvisioningJobById(payload.id) : await getLabProvisioningJobByEvent(eventId);
  const labType = payload.labType === "documentdb" || payload.labType === "nosql"
    ? payload.labType
    : (payload.isDocDB ?? existing?.isDocDB) ? "documentdb" : "nosql";
  const requestedAt = payload.requestedAt || existing?.requestedAt || now;
  const configuredAccessDurationHours = Number(payload.accessDurationHours ?? existing?.accessDurationHours ?? 72);
  const accessDurationHours = Number.isInteger(configuredAccessDurationHours) && configuredAccessDurationHours >= 1 && configuredAccessDurationHours <= 720
    ? configuredAccessDurationHours
    : 72;
  const studentCount = Number(payload.studentCount ?? existing?.studentCount ?? 0);
  const configuredMaxParallelDeployments = Number(payload.maxParallelDeployments ?? existing?.maxParallelDeployments ?? studentCount);
  const maxParallelDeployments = studentCount > 0 && Number.isInteger(configuredMaxParallelDeployments) && configuredMaxParallelDeployments >= 1 && configuredMaxParallelDeployments <= Math.min(100, studentCount)
    ? configuredMaxParallelDeployments
    : Math.min(100, Math.max(0, studentCount));
  const requestedAtMilliseconds = new Date(requestedAt).getTime();
  const expiresAt = payload.expiresAt || existing?.expiresAt || new Date(
    (Number.isFinite(requestedAtMilliseconds) ? requestedAtMilliseconds : Date.now()) + accessDurationHours * 60 * 60 * 1000
  ).toISOString();
  const doc = {
    ...(existing || {}),
    id: String(payload.id || existing?.id || toLabProvisioningJobId(eventId)),
    type: "lab-provisioning-job",
    eventId,
    eventTitle: String(payload.eventTitle || existing?.eventTitle || ""),
    status: String(payload.status || existing?.status || "requested"),
    studentCount,
    maxParallelDeployments,
    labType,
    isDocDB: labType === "documentdb",
    labId: String(payload.labId || existing?.labId || ""),
    location: String(payload.location || existing?.location || "westus"),
    vmSize: String(payload.vmSize || existing?.vmSize || "Standard_F2als_v7"),
    accessDurationHours,
    expiresAt,
    callbackUrl: String(payload.callbackUrl || existing?.callbackUrl || ""),
    command: String(payload.command || existing?.command || ""),
    outputFileName: String(payload.outputFileName || existing?.outputFileName || ""),
    deployedCount: Math.min(studentCount, Math.max(0, Number(payload.deployedCount ?? existing?.deployedCount ?? 0) || 0)),
    failedCount: Math.min(studentCount, Math.max(0, Number(payload.failedCount ?? existing?.failedCount ?? 0) || 0)),
    progressMessage: String(payload.progressMessage || existing?.progressMessage || ""),
    importedCount: Number(payload.importedCount ?? existing?.importedCount ?? 0),
    error: String(payload.error || ""),
    requestedBy: String(payload.requestedBy || existing?.requestedBy || ""),
    requestedAt,
    dispatchedAt: payload.dispatchedAt || existing?.dispatchedAt || "",
    completedAt: payload.completedAt || existing?.completedAt || "",
    updatedAt: now
  };

  const { resource } = await container.items.upsert(doc);
  return resource;
}

async function getLabProvisioningJobById(id) {
  const container = await getMetadataContainer();
  try {
    const { resource } = await container.item(String(id), "lab-provisioning-job").read();
    return resource || null;
  } catch (error) {
    if (error && error.code === 404) {
      return null;
    }

    throw error;
  }
}

async function getLabProvisioningJobByEvent(eventId) {
  return getLabProvisioningJobById(toLabProvisioningJobId(eventId));
}

async function upsertLabProvisioningBatch(payload) {
  const container = await getMetadataContainer();
  const now = new Date().toISOString();
  const eventId = String(payload.eventId || "").trim();
  const id = String(payload.id || toLabProvisioningBatchId(eventId, payload.batchId)).trim();
  const existing = await getLabProvisioningBatchById(id);
  const labType = payload.labType === "documentdb" || payload.labType === "nosql"
    ? payload.labType
    : (payload.isDocDB ?? existing?.isDocDB) ? "documentdb" : "nosql";
  const requestedAt = payload.requestedAt || existing?.requestedAt || now;
  const accessDurationHours = Number(payload.accessDurationHours ?? existing?.accessDurationHours ?? 72);
  const validAccessDurationHours = Number.isInteger(accessDurationHours) && accessDurationHours >= 1 && accessDurationHours <= 720
    ? accessDurationHours
    : 72;
  const studentCount = Number(payload.studentCount ?? existing?.studentCount ?? 0);
  const configuredMaxParallelDeployments = Number(payload.maxParallelDeployments ?? existing?.maxParallelDeployments ?? studentCount);
  const maxParallelDeployments = studentCount > 0 && Number.isInteger(configuredMaxParallelDeployments) && configuredMaxParallelDeployments >= 1 && configuredMaxParallelDeployments <= Math.min(100, studentCount)
    ? configuredMaxParallelDeployments
    : Math.min(100, Math.max(0, studentCount));
  const requestedAtMilliseconds = new Date(requestedAt).getTime();
  const doc = {
    ...(existing || {}),
    id,
    type: "lab-provisioning-batch",
    eventId,
    eventTitle: String(payload.eventTitle || existing?.eventTitle || ""),
    status: String(payload.status || existing?.status || "requested"),
    studentCount,
    maxParallelDeployments,
    startStudentNumber: Number(payload.startStudentNumber ?? existing?.startStudentNumber ?? 1),
    requestedRegistrationIds: Array.isArray(payload.requestedRegistrationIds)
      ? payload.requestedRegistrationIds.map((value) => String(value).trim()).filter(Boolean)
      : (existing?.requestedRegistrationIds || []),
    registrationSequenceStart: Number(payload.registrationSequenceStart ?? existing?.registrationSequenceStart ?? 0),
    registrationSequenceEnd: Number(payload.registrationSequenceEnd ?? existing?.registrationSequenceEnd ?? 0),
    requestedRecipientIds: Array.isArray(payload.requestedRecipientIds)
      ? payload.requestedRecipientIds.map((value) => String(value).trim()).filter(Boolean)
      : (existing?.requestedRecipientIds || []),
    requestedRecipients: Array.isArray(payload.requestedRecipients)
      ? payload.requestedRecipients
      : (existing?.requestedRecipients || []),
    deploymentAudiences: Array.isArray(payload.deploymentAudiences)
      ? payload.deploymentAudiences.map((value) => String(value).trim()).filter(Boolean)
      : (existing?.deploymentAudiences || []),
    requestedStudentNumbers: Array.isArray(payload.requestedStudentNumbers)
      ? payload.requestedStudentNumbers.map(Number).filter(Number.isInteger)
      : (existing?.requestedStudentNumbers || []),
    labType,
    isDocDB: labType === "documentdb",
    labId: String(payload.labId || existing?.labId || ""),
    location: String(payload.location || existing?.location || "westus"),
    vmSize: String(payload.vmSize || existing?.vmSize || "Standard_D2als_v7"),
    accessDurationHours: validAccessDurationHours,
    expiresAt: payload.expiresAt || existing?.expiresAt || new Date(
      (Number.isFinite(requestedAtMilliseconds) ? requestedAtMilliseconds : Date.now()) + validAccessDurationHours * 60 * 60 * 1000
    ).toISOString(),
    callbackUrl: String(payload.callbackUrl || existing?.callbackUrl || ""),
    command: String(payload.command || existing?.command || ""),
    outputFileName: String(payload.outputFileName || existing?.outputFileName || ""),
    deployedCount: Math.min(studentCount, Math.max(0, Number(payload.deployedCount ?? existing?.deployedCount ?? 0) || 0)),
    failedCount: Math.min(studentCount, Math.max(0, Number(payload.failedCount ?? existing?.failedCount ?? 0) || 0)),
    progressMessage: String(payload.progressMessage || existing?.progressMessage || ""),
    importedCount: Number(payload.importedCount ?? existing?.importedCount ?? 0),
    error: String(payload.error || ""),
    requestedBy: String(payload.requestedBy || existing?.requestedBy || ""),
    requestedAt,
    dispatchedAt: payload.dispatchedAt || existing?.dispatchedAt || "",
    completedAt: payload.completedAt || existing?.completedAt || "",
    updatedAt: now
  };

  const { resource } = await container.items.upsert(doc);
  return resource;
}

async function getLabProvisioningBatchById(id) {
  const container = await getMetadataContainer();
  try {
    const { resource } = await container.item(String(id), "lab-provisioning-batch").read();
    return resource || null;
  } catch (error) {
    if (error && error.code === 404) {
      return null;
    }

    throw error;
  }
}

async function listLabProvisioningBatchesByEvent(eventId) {
  const container = await getMetadataContainer();
  return queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.type = @type AND c.eventId = @eventId ORDER BY c.requestedAt DESC",
      parameters: [
        { name: "@type", value: "lab-provisioning-batch" },
        { name: "@eventId", value: String(eventId) }
      ]
    },
    "lab-provisioning-batch"
  );
}

async function listLabProvisioningBatches() {
  const container = await getMetadataContainer();
  return queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.type = @type ORDER BY c.requestedAt DESC",
      parameters: [{ name: "@type", value: "lab-provisioning-batch" }]
    },
    "lab-provisioning-batch"
  );
}

async function reserveLabProvisioningRegistrationIds(eventId, batchId, registrationIds) {
  const container = await getMetadataContainer();
  const createdIds = [];
  try {
    for (const registrationId of registrationIds) {
      const id = toLabProvisioningReservationId(eventId, registrationId);
      const reservation = {
        id,
        type: "lab-provisioning-reservation",
        eventId: String(eventId),
        registrationId: String(registrationId),
        batchId: String(batchId),
        createdAt: new Date().toISOString()
      };
      try {
        await container.items.create(reservation);
      } catch (error) {
        if (!error || error.code !== 409) {
          throw error;
        }

        const { resource: existingReservation } = await container
          .item(id, "lab-provisioning-reservation")
          .read();
        const existingBatch = existingReservation?.batchId
          ? await getLabProvisioningBatchById(
              toLabProvisioningBatchId(eventId, existingReservation.batchId)
            )
          : null;
        const existingStatus = String(existingBatch?.status || "").toLowerCase();
        if (!["completed", "failed", "deleted"].includes(existingStatus)) {
          throw error;
        }

        await container.item(id, "lab-provisioning-reservation").delete();
        await container.items.create(reservation);
      }
      createdIds.push(id);
    }
    return true;
  } catch (error) {
    await Promise.all(createdIds.map((id) => container.item(id, "lab-provisioning-reservation").delete()));
    if (error && error.code === 409) {
      return false;
    }
    throw error;
  }
}

async function releaseLabProvisioningRegistrationIds(eventId, registrationIds) {
  const container = await getMetadataContainer();
  await Promise.all(registrationIds.map(async (registrationId) => {
    try {
      await container.item(toLabProvisioningReservationId(eventId, registrationId), "lab-provisioning-reservation").delete();
    } catch (error) {
      if (!error || error.code !== 404) {
        throw error;
      }
    }
  }));
}

async function getLoginUserByEmailAndType(email, userType) {
  const container = await getMetadataContainer();
  const normalizedEmail = String(email || "").toLowerCase();
  const normalizedType = String(userType || "").toLowerCase();

  const users = await queryItemsScoped(
    container,
    {
      query:
        "SELECT * FROM c WHERE c.type = @type AND LOWER(c.email) = @email AND (LOWER(c.userType) = @userType OR ARRAY_CONTAINS(c.roles, @userType))",
      parameters: [
        { name: "@type", value: "login-user" },
        { name: "@email", value: normalizedEmail },
        { name: "@userType", value: normalizedType }
      ]
    },
    "login-user"
  );

  return selectLatestLoginUser(users);
}

async function checkContainerExists(containerId) {
  const database = await getDatabase();
  try {
    await database.container(containerId).read();
    return true;
  } catch (error) {
    if (error && error.code === 404) {
      return false;
    }

    throw error;
  }
}

async function getContainerHealth() {
  const checks = [
    ["events", eventsContainerId],
    ["registrations", registrationsContainerId],
    ["feedback", feedbackContainerId],
    ["metadata", metadataContainerId]
  ];

  const results = await Promise.all(
    checks.map(async ([name, containerId]) => ({
      name,
      containerId,
      exists: await checkContainerExists(containerId)
    }))
  );

  return results;
}

async function upsertLoginUser(payload) {
  const container = await getMetadataContainer();
  const email = String(payload.email || "").trim().toLowerCase();
  const userType = String(payload.userType || "").trim().toLowerCase();
  const existingUsers = await queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.type = @type AND LOWER(c.email) = @email",
      parameters: [
        { name: "@type", value: "login-user" },
        { name: "@email", value: email }
      ]
    },
    "login-user"
  );
  const canonicalId = toLoginIdentityId(email);
  const existing = existingUsers.find((user) => String(user.id) === canonicalId)
    || existingUsers.find((user) => String(user.id) === String(payload.id || ""))
    || selectLatestLoginUser(existingUsers);
  const roles = [...new Set([
    ...existingUsers.flatMap((user) => [...(user.roles || []), user.userType]),
    userType
  ].map((role) => String(role || "").trim().toLowerCase()).filter(Boolean))];

  const doc = {
    id: canonicalId,
    type: "login-user",
    userType,
    roles,
    email,
    name: String(payload.name !== undefined ? payload.name : existing?.name || "").trim(),
    password: payload.password !== undefined ? String(payload.password || "") : String(existing?.password || ""),
    passwordHash: payload.passwordHash !== undefined
      ? String(payload.passwordHash || "")
      : String(existing?.passwordHash || ""),
    accountClass: String(payload.accountClass || existing?.accountClass || "internal").toLowerCase(),
    partnerId: String(payload.partnerId || existing?.partnerId || "").trim(),
    partnerName: String(payload.partnerName || existing?.partnerName || "").trim(),
    active: payload.active !== undefined ? payload.active !== false : existing?.active !== false,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const { resource } = await container.items.upsert(doc);
  return resource;
}

async function reservePartnerUniqueness(partnerName, mpnId) {
  const container = await getMetadataContainer();
  const keys = [
    `partner-name-${normalizePartnerKey(partnerName)}`,
    `partner-mpn-${normalizePartnerKey(mpnId)}`
  ];
  const created = [];
  try {
    for (const id of keys) {
      await container.items.create({
        id,
        type: "partner-uniqueness",
        createdAt: new Date().toISOString()
      });
      created.push(id);
    }
    return true;
  } catch (error) {
    await Promise.all(created.map((id) => container.item(id, "partner-uniqueness").delete()));
    if (error && error.code === 409) {
      return false;
    }
    throw error;
  }
}

async function releasePartnerUniqueness(partnerName, mpnId) {
  const container = await getMetadataContainer();
  const keys = [
    `partner-name-${normalizePartnerKey(partnerName)}`,
    `partner-mpn-${normalizePartnerKey(mpnId)}`
  ];
  await Promise.all(keys.map(async (id) => {
    try {
      await container.item(id, "partner-uniqueness").delete();
    } catch (error) {
      if (!error || error.code !== 404) {
        throw error;
      }
    }
  }));
}

async function createPartnerApplication(payload) {
  const container = await getMetadataContainer();
  const now = new Date().toISOString();
  const document = {
    id: `partner-${randomUUID()}`,
    type: "partner-profile",
    partnerName: String(payload.partnerName || "").trim(),
    normalizedPartnerName: normalizePartnerKey(payload.partnerName),
    partnerAddress: String(payload.partnerAddress || "").trim(),
    partnerCountry: String(payload.partnerCountry || "").trim(),
    mpnId: String(payload.mpnId || "").trim(),
    normalizedMpnId: normalizePartnerKey(payload.mpnId),
    websiteUrl: String(payload.websiteUrl || "").trim(),
    privacyPolicyUrl: String(payload.privacyPolicyUrl || "").trim(),
    logoContentType: String(payload.logoContentType || "").trim(),
    logoBase64: String(payload.logoBase64 || ""),
    submitterName: String(payload.submitterName || "").trim(),
    submitterEmail: String(payload.submitterEmail || "").trim().toLowerCase(),
    signingAuthorityName: String(payload.signingAuthorityName || "").trim(),
    signingAuthorityEmail: String(payload.signingAuthorityEmail || "").trim().toLowerCase(),
    agreementVersion: String(payload.agreementVersion || "").trim(),
    agreementSignedAt: String(payload.agreementSignedAt || "").trim(),
    agreementSignerName: String(payload.agreementSignerName || "").trim(),
    agreementSignerEmail: String(payload.agreementSignerEmail || "").trim().toLowerCase(),
    agreementTermsUrl: String(payload.agreementTermsUrl || "").trim(),
    agreementSnapshot: String(payload.agreementSnapshot || ""),
    status: "pending",
    createdAt: now,
    updatedAt: now
  };
  const { resource } = await container.items.create(document);
  return resource;
}

async function signPartnerAgreement(partner, payload) {
  const container = await getMetadataContainer();
  const signedAt = new Date().toISOString();
  const updated = {
    ...partner,
    agreementVersion: String(payload.agreementVersion || "").trim(),
    agreementSignedAt: signedAt,
    agreementSignerName: String(payload.signerName || "").trim(),
    agreementSignerEmail: String(payload.signerEmail || "").trim().toLowerCase(),
    agreementTermsUrl: String(payload.termsUrl || "").trim(),
    agreementSnapshot: String(payload.agreementSnapshot || ""),
    updatedAt: signedAt
  };
  const { resource } = await container
    .item(String(partner.id), "partner-profile")
    .replace(updated, partner._etag ? { accessCondition: { type: "IfMatch", condition: partner._etag } } : undefined);
  return resource;
}

async function getPartnerById(id) {
  const container = await getMetadataContainer();
  try {
    const { resource } = await container.item(String(id), "partner-profile").read();
    return resource || null;
  } catch (error) {
    if (error && error.code === 404) {
      return null;
    }
    throw error;
  }
}

async function listPartnerApplications() {
  const container = await getMetadataContainer();
  return queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.type = @type ORDER BY c.createdAt DESC",
      parameters: [{ name: "@type", value: "partner-profile" }]
    },
    "partner-profile"
  );
}

async function setPartnerApplicationDecision(partner, status, reviewedBy, reason = "") {
  const container = await getMetadataContainer();
  const now = new Date().toISOString();
  const updated = {
    ...partner,
    status: String(status || "").toLowerCase(),
    reviewedAt: now,
    reviewedBy: String(reviewedBy || "").trim().toLowerCase(),
    rejectionReason: status === "approved" ? "" : String(reason || "").trim(),
    updatedAt: now
  };
  const { resource } = await container
    .item(String(partner.id), "partner-profile")
    .replace(updated, partner._etag ? { accessCondition: { type: "IfMatch", condition: partner._etag } } : undefined);
  return resource;
}

async function updatePartnerSubmitterEmail(partner, newEmail, updatedBy) {
  const email = String(newEmail || "").trim().toLowerCase();
  const previousEmail = String(partner.submitterEmail || "").trim().toLowerCase();
  const conflict = (message) => Object.assign(new Error(message), { code: 409, publicMessage: message });
  if (!isValidEmailAddress(email)) {
    throw new Error("Enter a valid submitter email address.");
  }
  if (email === previousEmail) {
    return partner;
  }
  if (partner.submitterEmailChangePending) {
    throw conflict("A submitter email change is already in progress. Try again after it completes.");
  }

  const container = await getMetadataContainer();
  const [users, otherPartners] = await Promise.all([
    queryItemsScoped(container, {
      query: "SELECT * FROM c WHERE c.type = @type AND (LOWER(c.email) = @previousEmail OR LOWER(c.email) = @email)",
      parameters: [
        { name: "@type", value: "login-user" },
        { name: "@previousEmail", value: previousEmail },
        { name: "@email", value: email }
      ]
    }, "login-user"),
    queryItemsScoped(container, {
      query: "SELECT c.id FROM c WHERE c.type = @type AND c.id != @id AND LOWER(c.submitterEmail) = @email",
      parameters: [
        { name: "@type", value: "partner-profile" },
        { name: "@id", value: String(partner.id) },
        { name: "@email", value: email }
      ]
    }, "partner-profile")
  ]);
  if (users.some((user) => String(user.email || "").trim().toLowerCase() === email)) {
    throw conflict("Another account already uses this email address.");
  }
  if (otherPartners.length) {
    throw conflict("Another partner application already uses this submitter email.");
  }

  const publisherAccount = selectLatestLoginUser(users.filter((user) => hasLoginRole(user, "publisher")));
  const moveLogin = isPartnerAccount(publisherAccount) && publisherAccount.partnerId === partner.id;
  if (String(partner.status || "").toLowerCase() === "approved" && !moveLogin) {
    throw conflict("The primary partner publisher account was not found. Restore it before changing the email.");
  }
  if (moveLogin && users.some((user) =>
    hasLoginRole(user, "supervisor") || (user.partnerId && user.partnerId !== partner.id)
  )) {
    throw conflict("This email has supervisor access or belongs to another partner and cannot be transferred.");
  }

  const now = new Date().toISOString();
  const undo = [];
  const versions = new Map();
  const condition = (document) => document?._etag
    ? { accessCondition: { type: "IfMatch", condition: document._etag } }
    : undefined;
  const body = (document) => Object.fromEntries(
    Object.entries(document).filter(([key]) => !["_rid", "_self", "_etag", "_attachments", "_ts"].includes(key))
  );
  const readOptional = async (target, id, partitionKey) => {
    try {
      const { resource } = await target.item(id, partitionKey).read();
      return resource || null;
    } catch (error) {
      if (error?.code === 404) {
        return null;
      }
      throw error;
    }
  };
  // Email is the event partition key. Compensate cross-partition writes on failure,
  // checking ETags during both the update and rollback rather than overwriting concurrent edits.
  const write = async (target, partitionKey, before, after) => {
    const id = String((before || after).id);
    const key = JSON.stringify([target.id, partitionKey, id]);
    const previous = versions.has(key) ? versions.get(key) : before;
    const apply = async (current, replacement) => {
      if (!current) {
        const { resource } = await target.items.create(body(replacement));
        return resource;
      }
      if (!replacement) {
        await target.item(id, partitionKey).delete(condition(current));
        return null;
      }
      const { resource } = await target.item(id, partitionKey).replace(body(replacement), condition(current));
      return resource;
    };
    const resource = await apply(previous, after);
    versions.set(key, resource);
    undo.push(async () => versions.set(key, await apply(versions.get(key), previous)));
    return resource;
  };

  try {
    let targetAccount;
    if (moveLogin) {
      await write(container, "partner-profile", partner, {
        ...partner,
        submitterEmailChangePending: { email, startedAt: now }
      });
      const id = toLoginIdentityId(email);
      const existingTarget = await readOptional(container, id, "login-user");
      if (existingTarget && !users.some((user) => user.id === existingTarget.id)) {
        throw conflict("Another account already uses the login identity for this email address.");
      }
      const merged = mergeLoginUsersByEmail(users)[0];
      for (const user of users) {
        await write(container, "login-user", user, { ...user, active: false, updatedAt: now });
      }
      targetAccount = await write(container, "login-user", existingTarget, {
        ...merged,
        id,
        email,
        accountClass: String(publisherAccount.accountClass).toLowerCase(),
        partnerId: partner.id,
        partnerName: partner.partnerName,
        password: String(publisherAccount.password || ""),
        passwordHash: String(publisherAccount.passwordHash || ""),
        active: false,
        updatedAt: now
      });

      const eventsContainer = await getEventsContainer();
      const events = await queryItemsScoped(eventsContainer, {
        query: "SELECT * FROM c WHERE c.publisherEmail = @email",
        parameters: [{ name: "@email", value: previousEmail }]
      }, previousEmail);
      for (const event of events) {
        await write(eventsContainer, email, null, { ...event, publisherEmail: email, updatedAt: now });
        await write(eventsContainer, previousEmail, event, null);
        const lookupId = toEventLookupId(event.id);
        const lookup = await readOptional(container, lookupId, "event-key");
        await write(container, "event-key", lookup, {
          ...lookup,
          id: lookupId,
          type: "event-key",
          eventId: event.id,
          publisherEmail: email,
          updatedAt: now
        });
      }

      const aliases = new Map(["team:", "persona:speaker:", "persona:proctor:", "publisher:"]
        .map((prefix) => [`${prefix}${previousEmail}`, `${prefix}${email}`]));
      const replaceId = (id) => aliases.get(String(id).toLowerCase()) || id;
      const references = [
        { type: "event-collaborator", fields: ["ownerPublisherEmail", "collaboratorEmail"] },
        { type: "persona-assignment", fields: ["publisherEmail", "inviteEmail"] },
        { type: "facilitator-profile", fields: ["publisherEmail", "email"] },
        { type: "event-session", fields: ["publisherEmail"], staffing: true },
        { type: "followup-template", fields: ["publisherEmail"] },
        { type: "facilitator-invite", fields: ["email"] },
        { type: "lab-provisioning-batch", fields: [], recipients: true },
        { type: "event-uniqueness", fields: [], uniqueness: true }
      ];
      const relatedDocuments = await Promise.all(references.map(async (reference) => {
        const filters = reference.fields.map((field) => `LOWER(c.${field}) = @previousEmail`);
        const parameters = [
          { name: "@type", value: reference.type },
          { name: "@previousEmail", value: previousEmail }
        ];
        if (reference.staffing) {
          [...aliases.keys()].forEach((alias, index) => {
            parameters.push({ name: `@alias${index}`, value: alias });
            filters.push(`ARRAY_CONTAINS(c.speakerIds, @alias${index})`, `ARRAY_CONTAINS(c.proctorIds, @alias${index})`);
          });
        }
        if (reference.recipients) {
          filters.push('EXISTS(SELECT VALUE r FROM r IN c.requestedRecipients WHERE r.kind = "team" AND LOWER(r.email) = @previousEmail)');
        }
        if (reference.uniqueness) {
          filters.push("STARTSWITH(c.key, @prefix)");
          parameters.push({ name: "@prefix", value: `${previousEmail}|` });
        }
        const unusedInvitation = reference.type === "facilitator-invite"
          ? ' AND (NOT IS_DEFINED(c.usedAt) OR c.usedAt = "")'
          : "";
        const documents = await queryItemsScoped(container, {
          query: `SELECT * FROM c WHERE c.type = @type AND (${filters.join(" OR ")})${unusedInvitation}`,
          parameters
        }, reference.type);
        return { reference, documents };
      }));
      for (const { reference, documents } of relatedDocuments) {
        for (const document of documents) {
          const updated = { ...document, updatedAt: now };
          for (const field of reference.fields) {
            if (String(document[field] || "").trim().toLowerCase() === previousEmail) {
              updated[field] = email;
            }
          }
          if (reference.type === "event-collaborator" && updated.collaboratorEmail !== document.collaboratorEmail) {
            updated.id = toEventCollaboratorId(updated.eventId, updated.collaboratorEmail);
          }
          if (reference.staffing) {
            for (const field of ["speakerIds", "proctorIds"]) {
              updated[field] = [...new Set((document[field] || []).map(replaceId))];
            }
          }
          if (reference.type === "facilitator-invite" && !document.usedAt) {
            updated.usedAt = now;
          }
          if (reference.recipients) {
            updated.requestedRecipients = document.requestedRecipients.map((recipient) =>
              recipient.kind === "team" && String(recipient.email).toLowerCase() === previousEmail
                ? { ...recipient, id: replaceId(recipient.id), email }
                : recipient
            );
            updated.requestedRecipientIds = (document.requestedRecipientIds || []).map(replaceId);
          }
          if (reference.uniqueness) {
            updated.key = `${email}${document.key.slice(previousEmail.length)}`;
            updated.id = toEventUniquenessId(updated.key);
          }
          if (updated.id !== document.id) {
            await write(container, reference.type, null, updated);
            await write(container, reference.type, document, null);
          } else {
            await write(container, reference.type, document, updated);
          }
        }
      }
      for (const user of users.filter((user) => user.id !== targetAccount.id)) {
        await write(container, "login-user", user, null);
      }
    }

    const updatedPartner = await write(container, "partner-profile", partner, {
      ...partner,
      submitterEmail: email,
      signingAuthorityEmail: String(partner.signingAuthorityEmail || "").trim().toLowerCase() === previousEmail
        ? email
        : partner.signingAuthorityEmail || "",
      previousSubmitterEmail: previousEmail,
      submitterEmailUpdatedBy: String(updatedBy || "").trim().toLowerCase(),
      submitterEmailUpdatedAt: now,
      updatedAt: now
    });
    if (targetAccount) {
      await write(container, "login-user", targetAccount, {
        ...targetAccount,
        active: publisherAccount.active !== false
      });
    }
    return updatedPartner;
  } catch (error) {
    const rollbackErrors = [];
    for (const restore of undo.reverse()) {
      try {
        await restore();
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors],
        "Submitter email update failed and could not be fully rolled back. Contact support before retrying.");
    }
    throw error;
  }
}

async function setEventPublicationDecision(event, status, reviewedBy, reason = "") {
  const container = await getEventsContainer();
  const now = new Date().toISOString();
  const updated = {
    ...event,
    publicationStatus: String(status || "").toLowerCase(),
    publicationReviewedAt: now,
    publicationReviewedBy: String(reviewedBy || "").trim().toLowerCase(),
    publicationRejectionReason: status === "approved" ? "" : String(reason || "").trim(),
    updatedAt: now
  };
  const { resource } = await container
    .item(String(event.id), String(event.publisherEmail))
    .replace(updated, event._etag ? { accessCondition: { type: "IfMatch", condition: event._etag } } : undefined);
  return resource;
}

async function listPublishers() {
  const users = await listLoginUsers();
  return users
    .filter((user) => [user.userType, ...(user.roles || [])].some(
      (role) => String(role || "").toLowerCase() === "publisher"
    ))
    .sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
}

async function cancelEvent(id, publisherEmail, reason = "") {
  const container = await getEventsContainer();
  const { resource: event } = await container.item(String(id), String(publisherEmail)).read();
  if (!event) {
    return null;
  }

  const updated = {
    ...event,
    status: "canceled",
    cancellationReason: String(reason || ""),
    canceledAt: new Date().toISOString()
  };

  const { resource } = await container.items.upsert(updated);
  return resource;
}

async function createPersonaAssignment(payload) {
  const container = await getMetadataContainer();
  const now = new Date().toISOString();
  const doc = {
    id: String(payload.id || toPersonaAssignmentId(payload.eventId, payload.personaType, payload.inviteEmail)),
    type: "persona-assignment",
    eventId: String(payload.eventId),
    publisherEmail: String(payload.publisherEmail || "").toLowerCase(),
    partnerId: String(payload.partnerId || "").trim(),
    partnerName: String(payload.partnerName || "").trim(),
    personaType: String(payload.personaType || "").toLowerCase(),
    inviteEmail: String(payload.inviteEmail || "").toLowerCase(),
    personaName: String(payload.personaName || "").trim(),
    availableFrom: toStoredDateTime(payload.availableFrom),
    availableTo: toStoredDateTime(payload.availableTo),
    availableSessionIds: Array.isArray(payload.availableSessionIds)
      ? [...new Set(payload.availableSessionIds.map(String).filter(Boolean))]
      : [],
    assignAllSessions: Boolean(payload.assignAllSessions),
    labWebUri: String(payload.labWebUri || "").trim(),
    labVmName: String(payload.labVmName || "").trim(),
    labVmStatus: String(payload.labVmStatus || "").trim().toLowerCase(),
    labVmStatusMessage: String(payload.labVmStatusMessage || "").trim(),
    labVmUsername: String(payload.labVmUsername || "").trim(),
    labVmPassword: String(payload.labVmPassword || "").trim(),
    labPortalUsername: String(payload.labPortalUsername || "").trim(),
    labPortalPassword: String(payload.labPortalPassword || "").trim(),
    labResourceGroup: String(payload.labResourceGroup || "").trim(),
    labDatabaseAccountName: String(payload.labDatabaseAccountName || "").trim(),
    labDatabaseAccountType: String(payload.labDatabaseAccountType || "").trim().toLowerCase(),
    labFoundryAccountName: String(payload.labFoundryAccountName || "").trim(),
    labAccessUpdatedAt: String(payload.labAccessUpdatedAt || "").trim(),
    createdAt: payload.createdAt || now,
    updatedAt: now
  };

  const { resource } = await container.items.upsert(doc);
  return resource;
}

async function findPersonaAssignment(eventId, personaType, inviteEmail) {
  const container = await getMetadataContainer();
  const rows = await queryItemsScoped(
    container,
    {
      query:
        "SELECT * FROM c WHERE c.type = @type AND c.eventId = @eventId AND LOWER(c.personaType) = @personaType AND LOWER(c.inviteEmail) = @inviteEmail OFFSET 0 LIMIT 1",
      parameters: [
        { name: "@type", value: "persona-assignment" },
        { name: "@eventId", value: String(eventId) },
        { name: "@personaType", value: String(personaType || "").toLowerCase() },
        { name: "@inviteEmail", value: String(inviteEmail || "").toLowerCase() }
      ]
    },
    "persona-assignment"
  );

  return rows[0] || null;
}

async function listPersonaAssignmentsByEmailAndType(inviteEmail, personaType) {
  const container = await getMetadataContainer();
  return queryItemsScoped(
    container,
    {
      query:
        "SELECT * FROM c WHERE c.type = @type AND LOWER(c.inviteEmail) = @inviteEmail AND LOWER(c.personaType) = @personaType ORDER BY c.availableFrom DESC",
      parameters: [
        { name: "@type", value: "persona-assignment" },
        { name: "@inviteEmail", value: String(inviteEmail || "").toLowerCase() },
        { name: "@personaType", value: String(personaType || "").toLowerCase() }
      ]
    },
    "persona-assignment"
  );
}

async function listPersonaAssignmentsByEmail(inviteEmail) {
  const container = await getMetadataContainer();
  return queryItemsScoped(
    container,
    {
      query:
        "SELECT * FROM c WHERE c.type = @type AND LOWER(c.inviteEmail) = @inviteEmail ORDER BY c.availableFrom DESC",
      parameters: [
        { name: "@type", value: "persona-assignment" },
        { name: "@inviteEmail", value: String(inviteEmail || "").toLowerCase() }
      ]
    },
    "persona-assignment"
  );
}

async function createFacilitatorInvitation(payload) {
  const container = await getMetadataContainer();
  const now = new Date().toISOString();
  const doc = {
    id: `facilitator-invite-${String(payload.tokenHash)}`,
    type: "facilitator-invite",
    tokenHash: String(payload.tokenHash),
    eventId: String(payload.eventId),
    email: String(payload.email || "").trim().toLowerCase(),
    name: String(payload.name || "").trim(),
    expiresAt: toStoredDateTime(payload.expiresAt),
    usedAt: "",
    createdBy: String(payload.createdBy || "").trim().toLowerCase(),
    createdAt: now,
    updatedAt: now
  };
  const { resource } = await container.items.create(doc);
  return resource;
}

async function getFacilitatorInvitation(tokenHash) {
  const container = await getMetadataContainer();
  try {
    const { resource } = await container
      .item(`facilitator-invite-${String(tokenHash)}`, "facilitator-invite")
      .read();
    return resource || null;
  } catch (error) {
    if (error && error.code === 404) {
      return null;
    }
    throw error;
  }
}

async function consumeFacilitatorInvitation(invitation) {
  const container = await getMetadataContainer();
  const updated = {
    ...invitation,
    usedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const { resource } = await container
    .item(String(invitation.id), "facilitator-invite")
    .replace(
      updated,
      invitation._etag
        ? { accessCondition: { type: "IfMatch", condition: invitation._etag } }
        : undefined
    );
  return resource;
}

async function listPersonaAssignmentsByEvent(eventId) {
  const container = await getMetadataContainer();
  return queryItemsScoped(
    container,
    {
      query:
        "SELECT * FROM c WHERE c.type = @type AND c.eventId = @eventId ORDER BY c.createdAt DESC",
      parameters: [
        { name: "@type", value: "persona-assignment" },
        { name: "@eventId", value: String(eventId) }
      ]
    },
    "persona-assignment"
  );
}

async function countPersonaAssignmentsByEvent(eventId, personaType) {
  const container = await getMetadataContainer();
  const rows = await queryItemsScoped(
    container,
    {
      query:
        "SELECT VALUE COUNT(1) FROM c WHERE c.type = @type AND c.eventId = @eventId AND LOWER(c.personaType) = @personaType",
      parameters: [
        { name: "@type", value: "persona-assignment" },
        { name: "@eventId", value: String(eventId) },
        { name: "@personaType", value: String(personaType || "").toLowerCase() }
      ]
    },
    "persona-assignment"
  );

  return Number(rows[0] || 0);
}

async function listAllPersonaAssignments() {
  const container = await getMetadataContainer();
  return queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.type = @type ORDER BY c.createdAt DESC",
      parameters: [{ name: "@type", value: "persona-assignment" }]
    },
    "persona-assignment"
  );
}

async function upsertFacilitatorProfile(payload) {
  const container = await getMetadataContainer();
  const profileType = String(payload.profileType || "speaker").toLowerCase();
  const profileId = String(payload.id || `facilitator-profile-${randomUUID()}`);
  const now = new Date().toISOString();
  const doc = {
    id: profileId,
    type: "facilitator-profile",
    profileType,
    email: String(payload.email || "").trim().toLowerCase(),
    firstName: String(payload.firstName || "").trim(),
    lastName: String(payload.lastName || "").trim(),
    name: String(payload.name || "").trim(),
    experience: String(payload.experience || "").trim(),
    role: String(payload.role || "").trim(),
    organization: String(payload.organization || "").trim(),
    expertise: String(payload.expertise || "").trim(),
    bio: String(payload.bio || "").trim(),
    publisherEmail: String(payload.publisherEmail || "").trim().toLowerCase(),
    createdAt: payload.createdAt || now,
    updatedAt: now
  };

  const { resource } = await container.items.upsert(doc);
  return resource;
}

async function listFacilitatorProfiles(profileType) {
  const container = await getMetadataContainer();
  const parameters = [{ name: "@type", value: "facilitator-profile" }];
  let query = "SELECT * FROM c WHERE c.type = @type";
  if (profileType) {
    query += " AND LOWER(c.profileType) = @profileType";
    parameters.push({ name: "@profileType", value: String(profileType).toLowerCase() });
  }
  query += " ORDER BY c.name ASC";

  return queryItemsScoped(
    container,
    { query, parameters },
    "facilitator-profile"
  );
}

async function deleteFacilitatorProfile(profileId) {
  const container = await getMetadataContainer();
  await container.item(String(profileId), "facilitator-profile").delete();
}

async function createEventSession(payload) {
  const container = await getMetadataContainer();
  const now = new Date().toISOString();
  const doc = {
    id: String(payload.id || buildEventSessionId(payload)),
    type: "event-session",
    eventId: String(payload.eventId),
    publisherEmail: String(payload.publisherEmail || "").trim().toLowerCase(),
    rowType: String(payload.rowType || "session").toLowerCase(),
    part: String(payload.part || "").trim(),
    sessionCode: String(payload.sessionCode || "").trim(),
    format: String(payload.format || "").trim(),
    title: String(payload.title || "").trim(),
    description: String(payload.description || "").trim(),
    durationMinutes: Number(payload.durationMinutes || 0),
    startAt: toStoredDateTime(payload.startAt),
    endAt: toStoredDateTime(payload.endAt),
    speakerIds: Array.isArray(payload.speakerIds) ? payload.speakerIds.map(String) : [],
    proctorIds: Array.isArray(payload.proctorIds) ? payload.proctorIds.map(String) : [],
    tsgFileName: String(payload.tsgFileName || "").trim(),
    tsgContentType: String(payload.tsgContentType || "").trim(),
    tsgBase64: String(payload.tsgBase64 || ""),
    sequence: Number(payload.sequence || 1),
    createdAt: payload.createdAt || now,
    updatedAt: now
  };

  const { resource } = await container.items.upsert(doc);
  return resource;
}

async function listEventSessions(eventId) {
  const container = await getMetadataContainer();
  return queryItemsScoped(
    container,
    {
      query: "SELECT * FROM c WHERE c.type = @type AND c.eventId = @eventId ORDER BY c.sequence ASC",
      parameters: [
        { name: "@type", value: "event-session" },
        { name: "@eventId", value: String(eventId) }
      ]
    },
    "event-session"
  );
}

async function listEventSessionsByEvents(eventIds) {
  const normalizedEventIds = [...new Set(
    (Array.isArray(eventIds) ? eventIds : [])
      .map((eventId) => String(eventId || "").trim())
      .filter(Boolean)
  )];
  if (!normalizedEventIds.length) {
    return [];
  }

  const container = await getMetadataContainer();
  return queryItemsScoped(
    container,
    {
      query:
        "SELECT * FROM c WHERE c.type = @type AND ARRAY_CONTAINS(@eventIds, c.eventId) ORDER BY c.sequence ASC",
      parameters: [
        { name: "@type", value: "event-session" },
        { name: "@eventIds", value: normalizedEventIds }
      ]
    },
    "event-session"
  );
}

async function deleteEventSession(sessionId) {
  const container = await getMetadataContainer();
  const { resource } = await container.item(String(sessionId), "event-session").delete();
  return resource;
}

async function upsertFollowUpTemplateByEvent(payload) {
  const container = await getMetadataContainer();
  const eventId = String(payload.eventId || "");
  const doc = {
    id: `followup-template-${eventId}`,
    type: "followup-template",
    eventId,
    publisherEmail: String(payload.publisherEmail || "").toLowerCase(),
    subject: String(payload.subject || "").trim(),
    body: String(payload.body || "").trim(),
    attachmentFileName: payload.attachmentFileName || "",
    attachmentContentType: payload.attachmentContentType || "",
    attachmentBase64: payload.attachmentBase64 || "",
    updatedAt: new Date().toISOString()
  };

  const { resource } = await container.items.upsert(doc);
  return resource;
}

async function getFollowUpTemplateByEvent(eventId) {
  const container = await getMetadataContainer();
  try {
    const { resource } = await container.item(`followup-template-${String(eventId)}`, "followup-template").read();
    return resource || null;
  } catch (error) {
    if (error && error.code === 404) {
      return null;
    }

    throw error;
  }
}

async function purgeRegistrationsOlderThan(cutoffIso, dryRun = true) {
  const container = await getRegistrationsContainer();
  const rows = await queryItems(container, {
    query: "SELECT c.id, c.eventId, c.createdAt FROM c WHERE IS_DEFINED(c.createdAt) AND c.createdAt < @cutoff",
    parameters: [{ name: "@cutoff", value: String(cutoffIso) }]
  });

  if (dryRun) {
    return {
      examined: rows.length,
      deleted: 0,
      samples: rows.slice(0, 5)
    };
  }

  let deleted = 0;
  for (const row of rows) {
    if (!row?.id || !row?.eventId) {
      continue;
    }

    await container.item(String(row.id), String(row.eventId)).delete();
    deleted += 1;
  }

  return {
    examined: rows.length,
    deleted,
    samples: rows.slice(0, 5)
  };
}

async function purgeFeedbackOlderThan(cutoffIso, dryRun = true) {
  const container = await getFeedbackContainer();
  const rows = await queryItems(container, {
    query: "SELECT c.id, c.eventId, c.createdAt FROM c WHERE IS_DEFINED(c.createdAt) AND c.createdAt < @cutoff",
    parameters: [{ name: "@cutoff", value: String(cutoffIso) }]
  });

  if (dryRun) {
    return {
      examined: rows.length,
      deleted: 0,
      samples: rows.slice(0, 5)
    };
  }

  let deleted = 0;
  for (const row of rows) {
    if (!row?.id || !row?.eventId) {
      continue;
    }

    await container.item(String(row.id), String(row.eventId)).delete();
    deleted += 1;
  }

  return {
    examined: rows.length,
    deleted,
    samples: rows.slice(0, 5)
  };
}

async function deleteSubjectDataByEmail(email, dryRun = true) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return {
      registrationsMatched: 0,
      feedbackMatched: 0,
      registrationsDeleted: 0,
      feedbackDeleted: 0
    };
  }

  const registrationsContainer = await getRegistrationsContainer();
  const feedbackContainer = await getFeedbackContainer();

  const registrations = await queryItems(registrationsContainer, {
    query: "SELECT c.id, c.eventId, c.attendeeEmail FROM c WHERE LOWER(c.attendeeEmail) = @email",
    parameters: [{ name: "@email", value: normalizedEmail }]
  });

  const feedback = await queryItems(feedbackContainer, {
    query: "SELECT c.id, c.eventId, c.candidateEmail FROM c WHERE LOWER(c.candidateEmail) = @email",
    parameters: [{ name: "@email", value: normalizedEmail }]
  });

  if (dryRun) {
    return {
      registrationsMatched: registrations.length,
      feedbackMatched: feedback.length,
      registrationsDeleted: 0,
      feedbackDeleted: 0,
      registrationSamples: registrations.slice(0, 5),
      feedbackSamples: feedback.slice(0, 5)
    };
  }

  let registrationsDeleted = 0;
  for (const row of registrations) {
    if (!row?.id || !row?.eventId) {
      continue;
    }

    await registrationsContainer.item(String(row.id), String(row.eventId)).delete();
    registrationsDeleted += 1;
  }

  let feedbackDeleted = 0;
  for (const row of feedback) {
    if (!row?.id || !row?.eventId) {
      continue;
    }

    await feedbackContainer.item(String(row.id), String(row.eventId)).delete();
    feedbackDeleted += 1;
  }

  return {
    registrationsMatched: registrations.length,
    feedbackMatched: feedback.length,
    registrationsDeleted,
    feedbackDeleted,
    registrationSamples: registrations.slice(0, 5),
    feedbackSamples: feedback.slice(0, 5)
  };
}

module.exports = {
  listEvents,
  getEventById,
  createEvent,
  reserveEventUniquenessKey,
  releaseEventUniquenessKey,
  upsertLabProvisioningJob,
  getLabProvisioningJobById,
  getLabProvisioningJobByEvent,
  upsertLabProvisioningBatch,
  getLabProvisioningBatchById,
  listLabProvisioningBatchesByEvent,
  listLabProvisioningBatches,
  reserveLabProvisioningRegistrationIds,
  releaseLabProvisioningRegistrationIds,
  updateEvent,
  recordEventAuditEntry,
  listEventAuditEntries,
  recordApplicationAuditEntry,
  listApplicationAuditEntries,
  findDuplicateEventBySignature,
  upsertEventCollaborator,
  listEventCollaboratorsByEvent,
  listEventCollaboratorsByOwner,
  listEventCollaborationsByEmail,
  getEventCollaboratorAccess,
  removeEventCollaborator,
  listRegistrationsByEvent,
  listAllRegistrationsByEvent,
  countActiveRegistrationsByEvent,
  countAttendedRegistrationsByEvent,
  getRegistrationCountsByEvent,
  getRegistrationCountsByEvents,
  listRegistrationsByEmail,
  listKnownOrganizations,
  findActiveRegistrationByEventAndEmail,
  findRegistrationByEventAndEmail,
  getRegistrationByEmailAndCode,
  getRegistrationById,
  createRegistration,
  setRegistrationApproval,
  updateRegistrationName,
  deregisterRegistration,
  restoreRegistration,
  setRegistrationAttendance,
  setRegistrationLabAccess,
  setPersonaLabAccess,
  setRegistrationVmStatus,
  setRegistrationDatabaseAccountName,
  listFeedbackByEvent,
  countFeedbackByEvent,
  getFeedbackCountsByEvents,
  createFeedback,
  getAuthConfig,
  upsertCustomerProfile,
  listCustomerProfilesByOrganizationKeys,
  listLoginUsers,
  getLoginUserByEmailAndType,
  getLoginUserById,
  getContainerHealth,
  upsertLoginUser,
  reservePartnerUniqueness,
  releasePartnerUniqueness,
  createPartnerApplication,
  getPartnerById,
  listPartnerApplications,
  signPartnerAgreement,
  setPartnerApplicationDecision,
  updatePartnerSubmitterEmail,
  setEventPublicationDecision,
  listPublishers,
  cancelEvent,
  createPersonaAssignment,
  listPersonaAssignmentsByEvent,
  countPersonaAssignmentsByEvent,
  listAllPersonaAssignments,
  findPersonaAssignment,
  listPersonaAssignmentsByEmailAndType,
  listPersonaAssignmentsByEmail,
  createFacilitatorInvitation,
  getFacilitatorInvitation,
  consumeFacilitatorInvitation,
  upsertFacilitatorProfile,
  listFacilitatorProfiles,
  deleteFacilitatorProfile,
  createEventSession,
  listEventSessions,
  listEventSessionsByEvents,
  deleteEventSession,
  upsertFollowUpTemplateByEvent,
  getFollowUpTemplateByEvent,
  purgeRegistrationsOlderThan,
  purgeFeedbackOlderThan,
  deleteSubjectDataByEmail
};
