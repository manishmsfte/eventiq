require("dotenv").config();

const path = require("path");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const express = require("express");
const session = require("express-session");
const compression = require("compression");
const QRCode = require("qrcode");
const multer = require("multer");
const XLSX = require("xlsx");

const {
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
  listLoginUsers,
  listPublishers,
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
  upsertCustomerProfile,
  listCustomerProfilesByOrganizationKeys,
  purgeRegistrationsOlderThan,
  purgeFeedbackOlderThan,
  deleteSubjectDataByEmail
} = require("./db");
const { createInvite } = require("./services/invite");
const {
  getPasswordValidationError,
  hasLoginRole,
  hashPassword,
  verifyPassword
} = require("./services/account-security");
const {
  allocateLabStudentNumbers,
  getMissingProvisioningCredentialFields,
  getProvisioningRowStudentNumber,
  mapProvisioningRowsToRegistrationIndexes,
  parseLabDeletionRange,
  parseRegistrationSequenceRange,
  selectProvisioningRegistrationEntries,
  selectProvisioningTeamMembers
} = require("./services/lab-provisioning");
const {
  PARTNER_CONTACT_EXCLUDED_COUNTRIES,
  getPartnerEventTitle,
  getPartnerLogoContentType,
  getPublicationStatus,
  isPartnerAccount,
  isPartnerContactConfigured,
  isPartnerContactCountryAllowed,
  isSafeHttpsUrl
} = require("./services/partner-rules");
const {
  PARTNER_AGREEMENT_SECTIONS,
  PARTNER_AGREEMENT_VERSION,
  getPartnerAgreementText,
  hasCurrentPartnerAgreement,
  personalizePartnerAgreementText
} = require("./services/partner-agreement");
const { createPartnerAgreementPdf } = require("./services/partner-agreement-pdf");
const { buildEventUniquenessKey } = require("./services/event-rules");
const { buildCetSessionTemplates, getCetTemplateEvents } = require("./services/session-templates");
const { htmlErrorPages } = require("./services/web-errors");
const {
  buildScheduledAgenda,
  inheritAgendaParts,
  insertLogicalBreaks,
  parseAgendaTable,
  rebalanceScheduledRows
} = require("./services/agenda-rules");
const {
  findRegistrationMatches,
  isDisallowedOrganizationName,
  isValidEmailAddress,
  normalizeMatchName
} = require("./services/registration-rules");
const {
  applyBulkStaffing,
  buildEventTeam,
  buildExistingPeople,
  getInheritedSessionStaffing,
  isTeamMemberAvailable,
  normalizeEmail,
  toTeamMemberId
} = require("./services/staffing-rules");
const {
  canSendNotifications,
  sendRegistrationEmail,
  sendLabReminderEmail,
  sendPostEventFeedbackEmail,
  sendPersonaInviteEmail,
  sendTeamMemberInviteEmail,
  sendEventChangeNotification,
  sendPlainNotification
} = require("./services/mailer");

// Data constants
const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin",
  "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso",
  "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde", "Central African Republic", "Chad", "Chile", "China",
  "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Czechia",
  "Denmark", "Djibouti", "Dominica", "Dominican Republic", "East Timor", "Ecuador", "Egypt", "El Salvador",
  "Equatorial Guinea", "Eritrea", "Estonia", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia",
  "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
  "Haiti", "Honduras", "Hong Kong", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland",
  "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kosovo",
  "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein",
  "Lithuania", "Luxembourg", "Macao", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta",
  "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia",
  "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand",
  "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau",
  "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia",
  "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia",
  "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands",
  "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname",
  "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste",
  "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda",
  "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu",
  "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
].sort();
const PARTNER_COUNTRIES = [
  "United States",
  ...COUNTRIES.filter((country) => country !== "United States")
];

const JOB_ROLES = [
  "Architect", "Business Analyst", "Data Analyst", "Data Engineer", "Developer", "DevOps Engineer",
  "Manager", "Product Manager", "Security Engineer", "Solutions Architect", "Student", "Other"
].sort();

const ORGANIZATION_SIZES = [
  "1 employee",
  "2-9 employees",
  "10-24 employees",
  "25-49 employees",
  "50-99 employees",
  "100-249 employees",
  "250-499 employees",
  "500-999 employees",
  "1,000-4,999 employees",
  "5,000-9,999 employees",
  "10,000+ employees"
];

const FEEDBACK_PROJECT_TYPES = ["Existing project", "New project"];

const FEEDBACK_FOLLOW_UP_TYPES = [
  "Architecture guidance",
  "Migration support",
  "POC implementation help",
  "Performance tuning",
  "Office hours",
  "Other"
];

const COUNTRY_PHONE_CODES = {
  "Afghanistan": "+93",
  "Albania": "+355",
  "Algeria": "+213",
  "Andorra": "+376",
  "Angola": "+244",
  "Argentina": "+54",
  "Armenia": "+374",
  "Australia": "+61",
  "Austria": "+43",
  "Azerbaijan": "+994",
  "Bahamas": "+1",
  "Bahrain": "+973",
  "Bangladesh": "+880",
  "Barbados": "+1",
  "Belarus": "+375",
  "Belgium": "+32",
  "Belize": "+501",
  "Benin": "+229",
  "Bhutan": "+975",
  "Bolivia": "+591",
  "Bosnia and Herzegovina": "+387",
  "Botswana": "+267",
  "Brazil": "+55",
  "Brunei": "+673",
  "Bulgaria": "+359",
  "Burkina Faso": "+226",
  "Burundi": "+257",
  "Cambodia": "+855",
  "Cameroon": "+237",
  "Canada": "+1",
  "Cape Verde": "+238",
  "Central African Republic": "+236",
  "Chad": "+235",
  "Chile": "+56",
  "China": "+86",
  "Colombia": "+57",
  "Comoros": "+269",
  "Congo": "+242",
  "Costa Rica": "+506",
  "Croatia": "+385",
  "Cuba": "+53",
  "Cyprus": "+357",
  "Czech Republic": "+420",
  "Czechia": "+420",
  "Denmark": "+45",
  "Djibouti": "+253",
  "Dominica": "+1",
  "Dominican Republic": "+1",
  "East Timor": "+670",
  "Ecuador": "+593",
  "Egypt": "+20",
  "El Salvador": "+503",
  "Equatorial Guinea": "+240",
  "Eritrea": "+291",
  "Estonia": "+372",
  "Ethiopia": "+251",
  "Fiji": "+679",
  "Finland": "+358",
  "France": "+33",
  "Gabon": "+241",
  "Gambia": "+220",
  "Georgia": "+995",
  "Germany": "+49",
  "Ghana": "+233",
  "Greece": "+30",
  "Grenada": "+1",
  "Guatemala": "+502",
  "Guinea": "+224",
  "Guinea-Bissau": "+245",
  "Guyana": "+592",
  "Haiti": "+509",
  "Honduras": "+504",
  "Hong Kong": "+852",
  "Hungary": "+36",
  "Iceland": "+354",
  "India": "+91",
  "Indonesia": "+62",
  "Iran": "+98",
  "Iraq": "+964",
  "Ireland": "+353",
  "Israel": "+972",
  "Italy": "+39",
  "Jamaica": "+1",
  "Japan": "+81",
  "Jordan": "+962",
  "Kazakhstan": "+7",
  "Kenya": "+254",
  "Kiribati": "+686",
  "Kosovo": "+383",
  "Kuwait": "+965",
  "Kyrgyzstan": "+996",
  "Laos": "+856",
  "Latvia": "+371",
  "Lebanon": "+961",
  "Lesotho": "+266",
  "Liberia": "+231",
  "Libya": "+218",
  "Liechtenstein": "+423",
  "Lithuania": "+370",
  "Luxembourg": "+352",
  "Macao": "+853",
  "Madagascar": "+261",
  "Malawi": "+265",
  "Malaysia": "+60",
  "Maldives": "+960",
  "Mali": "+223",
  "Malta": "+356",
  "Marshall Islands": "+692",
  "Mauritania": "+222",
  "Mauritius": "+230",
  "Mexico": "+52",
  "Micronesia": "+691",
  "Moldova": "+373",
  "Monaco": "+377",
  "Mongolia": "+976",
  "Montenegro": "+382",
  "Morocco": "+212",
  "Mozambique": "+258",
  "Myanmar": "+95",
  "Namibia": "+264",
  "Nauru": "+674",
  "Nepal": "+977",
  "Netherlands": "+31",
  "New Zealand": "+64",
  "Nicaragua": "+505",
  "Niger": "+227",
  "Nigeria": "+234",
  "North Korea": "+850",
  "North Macedonia": "+389",
  "Norway": "+47",
  "Oman": "+968",
  "Pakistan": "+92",
  "Palau": "+680",
  "Palestine": "+970",
  "Panama": "+507",
  "Papua New Guinea": "+675",
  "Paraguay": "+595",
  "Peru": "+51",
  "Philippines": "+63",
  "Poland": "+48",
  "Portugal": "+351",
  "Qatar": "+974",
  "Romania": "+40",
  "Russia": "+7",
  "Rwanda": "+250",
  "Saint Kitts and Nevis": "+1",
  "Saint Lucia": "+1",
  "Saint Vincent and the Grenadines": "+1",
  "Samoa": "+685",
  "San Marino": "+378",
  "Sao Tome and Principe": "+239",
  "Saudi Arabia": "+966",
  "Senegal": "+221",
  "Serbia": "+381",
  "Seychelles": "+248",
  "Sierra Leone": "+232",
  "Singapore": "+65",
  "Slovakia": "+421",
  "Slovenia": "+386",
  "Solomon Islands": "+677",
  "Somalia": "+252",
  "South Africa": "+27",
  "South Korea": "+82",
  "South Sudan": "+211",
  "Spain": "+34",
  "Sri Lanka": "+94",
  "Sudan": "+249",
  "Suriname": "+597",
  "Sweden": "+46",
  "Switzerland": "+41",
  "Syria": "+963",
  "Taiwan": "+886",
  "Tajikistan": "+992",
  "Tanzania": "+255",
  "Thailand": "+66",
  "Timor-Leste": "+670",
  "Togo": "+228",
  "Tonga": "+676",
  "Trinidad and Tobago": "+1",
  "Tunisia": "+216",
  "Turkey": "+90",
  "Turkmenistan": "+993",
  "Tuvalu": "+688",
  "Uganda": "+256",
  "Ukraine": "+380",
  "United Arab Emirates": "+971",
  "United Kingdom": "+44",
  "United States": "+1",
  "Uruguay": "+598",
  "Uzbekistan": "+998",
  "Vanuatu": "+678",
  "Vatican City": "+379",
  "Venezuela": "+58",
  "Vietnam": "+84",
  "Yemen": "+967",
  "Zambia": "+260",
  "Zimbabwe": "+263"
};

const TIMEZONES = [
  "PST", "MST", "CST", "EST", "GMT", "CET", "IST", "JST", "AEST", "NZST", "UTC"
].sort();

// Timezone UTC offset mapping (in hours)
const TIMEZONE_OFFSETS = {
  "PST": -8,   // Pacific Standard Time
  "MST": -7,   // Mountain Standard Time
  "CST": -6,   // Central Standard Time
  "EST": -5,   // Eastern Standard Time
  "GMT": 0,    // Greenwich Mean Time
  "CET": 1,    // Central European Time
  "IST": 5.5,  // Indian Standard Time
  "JST": 9,    // Japan Standard Time
  "AEST": 10,  // Australian Eastern Standard Time
  "NZST": 12,  // New Zealand Standard Time
  "UTC": 0     // Coordinated Universal Time
};

// Format date in event timezone only (as entered by publisher)
const formatDualTimezone = (dateStr, eventTimezone = "UTC") => {
  if (!dateStr) return "N/A";
  
  // Parse the date - datetime-local inputs are stored as ISO strings
  const d = new Date(dateStr);
  let hours = d.getHours();
  let minutes = d.getMinutes();
  
  // If the date string includes timezone info (Z or offset), adjust for UTC
  // Otherwise, use the values as-is (they represent the entered local time)
  if (typeof dateStr === 'string' && !dateStr.includes('Z') && !dateStr.match(/[+-]\d{2}:\d{2}$/)) {
    // No timezone info in string, so hours/minutes are the browser-interpreted values
    // For consistency with what was entered, recalculate from ISO string
    const parts = dateStr.split('T');
    if (parts[1]) {
      const timeParts = parts[1].split(':');
      hours = parseInt(timeParts[0], 10);
      minutes = parseInt(timeParts[1], 10);
    }
  }
  
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  const timeStr = `${displayHours}:${String(minutes).padStart(2, '0')} ${ampm}`;
  
  return `${timeStr} ${eventTimezone}`;
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRichTextDescription(value) {
  const lines = String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  const renderInline = (text) => escapeHtml(text)
    .replace(/\[small\]([\s\S]*?)\[\/small\]/g, '<span class="rich-small">$1</span>')
    .replace(/\[large\]([\s\S]*?)\[\/large\]/g, '<span class="rich-large">$1</span>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\b_([^_]+)_\b/g, "<em>$1</em>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  const output = [];
  let bulletItems = [];
  const flushBullets = () => {
    if (bulletItems.length) {
      output.push(`<ul>${bulletItems.map((item) => `<li>${item}</li>`).join("")}</ul>`);
      bulletItems = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      bulletItems.push(renderInline(bulletMatch[1]));
      continue;
    }

    flushBullets();
    output.push(`<p>${renderInline(trimmed)}</p>`);
  }

  flushBullets();
  return output.join("");
}

const app = express();
const port = Number(process.env.PORT || 3000);
const bootstrapApiToken = String(process.env.BOOTSTRAP_API_TOKEN || "").trim();
const labProvisioningCallbackToken = String(process.env.LAB_PROVISIONING_CALLBACK_TOKEN || "").trim();
const labProvisioningGithubToken = String(process.env.LAB_PROVISIONING_GITHUB_TOKEN || "").trim();
const labProvisioningGithubOwner = String(process.env.LAB_PROVISIONING_GITHUB_OWNER || "manishmsfte").trim();
const labProvisioningGithubRepo = String(process.env.LAB_PROVISIONING_GITHUB_REPO || "cosmos-workshop-deployment").trim();
const labProvisioningGithubWorkflow = String(process.env.LAB_PROVISIONING_GITHUB_WORKFLOW || "provision-labs.yml").trim();
const labProvisioningGithubDeleteWorkflow = String(process.env.LAB_PROVISIONING_GITHUB_DELETE_WORKFLOW || "delete-labs.yml").trim();
const labProvisioningGithubVmWorkflow = String(process.env.LAB_PROVISIONING_GITHUB_VM_WORKFLOW || "set-lab-vm.yml").trim();
const labProvisioningGithubRef = String(process.env.LAB_PROVISIONING_GITHUB_REF || "main").trim();
const labProvisioningLocation = String(process.env.LAB_PROVISIONING_LOCATION || "westus").trim();
const labProvisioningVmSize = String(process.env.LAB_PROVISIONING_VM_SIZE || "Standard_D2als_v7").trim();
const publicAppBaseUrl = String(process.env.PUBLIC_APP_BASE_URL || "https://nosqlreg.azurewebsites.net").replace(/\/+$/, "");
function getPublicBaseUrl() {
  return publicAppBaseUrl;
}
const piiViewerAllowlist = String(process.env.PII_VIEWER_ALLOWLIST || "manish.sharma@microsoft.com")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

app.post("/facilitator/events/:id/availability", requireFacilitator, async (req, res, next) => {
  try {
    const context = await getFacilitatorEventContext(req, res);
    if (!context) {
      return;
    }
    const availableFrom = normalizeDateTime(req.body.availableFrom);
    const availableTo = normalizeDateTime(req.body.availableTo);
    if (!availableFrom || !availableTo || availableTo.getTime() <= availableFrom.getTime()) {
      return res.redirect(`/facilitator/events/${context.event.id}?message=${encodeURIComponent("Availability end must be after the start.")}`);
    }
    for (const assignment of context.eventAssignments) {
      await createPersonaAssignment({
        ...assignment,
        availableFrom,
        availableTo
      });
    }
    await recordEventAuditEntry({
      eventId: context.event.id,
      actorEmail: req.session.facilitator.email,
      actorName: req.session.facilitator.name || req.session.facilitator.email,
      action: "availability-updated",
      summary: "Updated event-team availability.",
      newValues: {
        availableFrom: availableFrom.toISOString(),
        availableTo: availableTo.toISOString()
      }
    });
    return res.redirect(`/facilitator/events/${context.event.id}?message=${encodeURIComponent("Availability updated.")}`);
  } catch (error) {
    next(error);
  }
});
const tsgUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024
  }
});
const TSG_CONTENT_TYPES = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"
]);
const labAccessImportTtlMs = 30 * 60 * 1000;
const maxLabAccessImportRows = 1000;

let authConfigCache = {
  expiresAt: 0,
  value: null
};
const publisherEventSummaryCache = new Map();
const publisherEventSummaryTtlMs = 30 * 1000;
let eventListCache = {
  freshExpiresAt: 0,
  staleExpiresAt: 0,
  value: null
};
let eventListRefreshPromise = null;
let eventListCacheGeneration = 0;
const eventListCacheFreshTtlMs = 5 * 60 * 1000;
const eventListCacheStaleTtlMs = 30 * 60 * 1000;
// Bust static asset caching (styles.css etc.) on every process restart/deploy.
const assetVersion = String(Date.now());
let knownOrganizationsCache = {
  expiresAt: 0,
  value: []
};
const knownOrganizationsTtlMs = 5 * 60 * 1000;

// Cached wrapper: listKnownOrganizations() does a full cross-partition scan of the
// registrations container, and was being called on every register page view/submit.
async function getKnownOrganizationsCached() {
  const now = Date.now();
  if (knownOrganizationsCache.expiresAt > now) {
    return knownOrganizationsCache.value;
  }

  const organizations = await listKnownOrganizations();
  knownOrganizationsCache = {
    expiresAt: now + knownOrganizationsTtlMs,
    value: organizations
  };

  return organizations;
}

function refreshEventsCache() {
  if (eventListRefreshPromise) {
    return eventListRefreshPromise;
  }

  const generation = eventListCacheGeneration;
  const refreshPromise = Promise.resolve()
    .then(() => listEvents())
    .then((events) => {
      if (generation === eventListCacheGeneration) {
        const refreshedAt = Date.now();
        eventListCache = {
          freshExpiresAt: refreshedAt + eventListCacheFreshTtlMs,
          staleExpiresAt: refreshedAt + eventListCacheFreshTtlMs + eventListCacheStaleTtlMs,
          value: events
        };
      }
      return events;
    })
    .catch((error) => {
      console.error("Event cache refresh failed:", error.message);
      throw error;
    })
    .finally(() => {
      if (eventListRefreshPromise === refreshPromise) {
        eventListRefreshPromise = null;
      }
    });

  eventListRefreshPromise = refreshPromise;
  return refreshPromise;
}

async function getEventsCached() {
  const now = Date.now();
  if (eventListCache.value !== null) {
    if (eventListCache.freshExpiresAt > now) {
      return eventListCache.value;
    }

    if (eventListCache.staleExpiresAt > now) {
      refreshEventsCache().catch(() => {});
      return eventListCache.value;
    }
  }

  return refreshEventsCache();
}

function clearEventCaches() {
  eventListCacheGeneration += 1;
  eventListCache = { freshExpiresAt: 0, staleExpiresAt: 0, value: null };
  eventListRefreshPromise = null;
  publisherEventSummaryCache.clear();
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("view cache", true);
app.locals.organizationSizes = ORGANIZATION_SIZES;
app.locals.partnerContactExcludedCountries = PARTNER_CONTACT_EXCLUDED_COUNTRIES;
app.locals.isPartnerContactConfigured = isPartnerContactConfigured;
app.locals.isPartnerContactCountryAllowed = isPartnerContactCountryAllowed;

app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1y", immutable: true, etag: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false
  })
);

app.use((req, res, next) => {
  res.locals.publisher = req.session.publisher || null;
  res.locals.supervisor = req.session.supervisor || null;
  res.locals.registrant = req.session.registrant || null;
  res.locals.facilitator = req.session.facilitator || null;
  if (req.session.facilitator?.switchedFromPublisher) {
    res.locals.currentUser = {
      name: req.session.facilitator.name || req.session.facilitator.email,
      persona:
        String(req.session.facilitator.persona || "").toLowerCase() === "speaker"
          ? "Speaker"
          : "Proctor",
      partnerName: req.session.facilitator.partnerName || ""
    };
  } else if (req.session.publisher) {
    res.locals.currentUser = {
      name: req.session.publisher.name || req.session.publisher.email,
      persona: "Publisher",
      partnerName: req.session.publisher.partnerName || ""
    };
  } else if (req.session.supervisor) {
    res.locals.currentUser = {
      name: req.session.supervisor.name || req.session.supervisor.email,
      persona: "Supervisor",
      partnerName: ""
    };
  } else if (req.session.registrant) {
    res.locals.currentUser = {
      name: req.session.registrant.attendeeName || req.session.registrant.attendeeEmail,
      persona: "Registrant"
    };
  } else if (req.session.facilitator) {
    res.locals.currentUser = {
      name: req.session.facilitator.name || req.session.facilitator.email,
      persona:
        String(req.session.facilitator.persona || "facilitator").toLowerCase() === "speaker"
          ? "Speaker"
          : "Proctor",
      partnerName: req.session.facilitator.partnerName || ""
    };
  } else {
    res.locals.currentUser = null;
  }
  res.locals.siteTitle = "EventIQ - Complete Event Management App";
  res.locals.formatDualTimezone = formatDualTimezone;
  res.locals.renderRichTextDescription = renderRichTextDescription;
  res.locals.assetVersion = assetVersion;
  res.locals.publicBaseUrl = getPublicBaseUrl();
  res.locals.partnerAgreement = req.session.publisher?.partnerId
    ? {
        required: !req.session.publisher.partnerAgreementSigned,
        primarySigner: Boolean(req.session.publisher.isPartnerPrimaryPublisher)
      }
    : null;
  next();
});

app.use(htmlErrorPages);

app.use(async (req, res, next) => {
  try {
    if (!req.session.publisher?.partnerId && !req.session.facilitator?.partnerId) {
      return next();
    }
    const accountContext = await getPasswordAccountSession(req);
    if (accountContext?.account && accountContext.account.active !== false) {
      return next();
    }
    const persona = req.session.publisher ? "publisher" : req.session.facilitator.persona;
    clearAllPersonaSessions(req);
    return req.session.save((error) => {
      if (error) {
        return next(error);
      }
      return res.redirect(`/login?persona=${encodeURIComponent(persona)}&error=${encodeURIComponent(
        "Your account has changed. Sign in again with your current email address."
      )}`);
    });
  } catch (error) {
    next(error);
  }
});

app.use((req, res, next) => {
  const startedAt = new Date().toISOString();
  res.on("finish", () => {
    const sessionActor = req.session?.supervisor
      || req.session?.publisher
      || req.session?.facilitator
      || req.session?.registrant
      || {};
    const actorRole = req.session?.supervisor
      ? "supervisor"
      : req.session?.publisher
        ? "publisher"
        : req.session?.facilitator
          ? String(req.session.facilitator.persona || "facilitator")
          : req.session?.registrant
            ? "registrant"
            : "automation";
    const actorEmail = sessionActor.email
      || sessionActor.attendeeEmail
      || req.body?.email
      || req.body?.attendeeEmail
      || "";
    const shouldAudit = Boolean(actorEmail) || !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (!shouldAudit) {
      return;
    }
    const eventMatch = req.path.match(/\/events\/([^/]+)/);
    void recordApplicationAuditEntry({
      timestamp: startedAt,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      actorEmail,
      actorName: sessionActor.name || sessionActor.attendeeName || "",
      actorRole,
      eventId: eventMatch ? decodeURIComponent(eventMatch[1]) : ""
    }).catch((error) => {
      console.error("Failed to record application audit entry.", error);
    });
  });
  next();
});

function isMicrosoftEmail(email) {
  return String(email || "").toLowerCase().endsWith("@microsoft.com");
}

function getSessionEmail(req) {
  const candidates = [
    req.session?.publisher?.email,
    req.session?.supervisor?.email,
    req.session?.facilitator?.email,
    req.session?.registrant?.attendeeEmail
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim().toLowerCase();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function canViewPii(req) {
  const email = getSessionEmail(req);
  return Boolean(email && piiViewerAllowlist.includes(email));
}

function canViewEventPii(req, event, accessLevel) {
  const email = getSessionEmail(req);
  if (!email) {
    return false;
  }

  if (piiViewerAllowlist.includes(email)) {
    return true;
  }

  // Owners and collaborators are already vetted by getPublisherEventAccess before this is called.
  if (accessLevel) {
    return true;
  }

  const ownerEmail = String(event?.publisherEmail || "").trim().toLowerCase();
  return email === ownerEmail;
}

function maskName(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "N/A";
  }

  const first = text.charAt(0);
  return `${first}${"*".repeat(Math.min(Math.max(text.length - 1, 2), 8))}`;
}

function maskEmail(value) {
  const email = String(value || "").trim();
  if (!email.includes("@")) {
    return "hidden@example.com";
  }

  const [localPart, domain] = email.split("@");
  const safeLocal = localPart ? `${localPart.charAt(0)}***` : "***";
  return `${safeLocal}@${domain}`;
}

function maskText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "N/A";
  }

  const first = text.charAt(0);
  return `${first}${"*".repeat(Math.min(Math.max(text.length - 1, 2), 8))}`;
}

function maskRegistrationForView(registration, allowPii) {
  if (allowPii) {
    return registration;
  }

  return {
    ...registration,
    attendeeName: maskName(registration.attendeeName),
    attendeeEmail: maskEmail(registration.attendeeEmail),
    organization: maskText(registration.organization || registration.companyName || ""),
    companyName: maskText(registration.companyName || registration.organization || ""),
    phoneNumber: maskText(registration.phoneNumber || ""),
    country: maskText(registration.country || ""),
    jobRole: maskText(registration.jobRole || ""),
    registrationCode: "REDACTED"
  };
}

function maskRegistrationsForView(registrations, allowPii) {
  return (Array.isArray(registrations) ? registrations : []).map((item) =>
    maskRegistrationForView(item, allowPii)
  );
}

function isPublisherAuthorized(email, allowlist) {
  const normalized = String(email || "").toLowerCase();
  if (!normalized.endsWith("@microsoft.com")) {
    return false;
  }

  if (!allowlist.length) {
    return true;
  }

  return allowlist.includes(normalized);
}

function normalizeDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function normalizeIdList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return value ? [String(value).trim()] : [];
}

function hashFacilitatorInvitationToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function findTeamMember(teamMembers, submittedValue) {
  const value = String(submittedValue || "").trim();
  const email = value.startsWith("team:") ? value.slice(5) : value;
  return teamMembers.find((member) => member.email === normalizeEmail(email)) || null;
}

function resolveAssignedTeamMember(teamMembers, assignedId) {
  return teamMembers.find((member) => member.aliasIds.includes(String(assignedId))) || null;
}

function requireLabProvisioningToken(req, res, next) {
  if (!labProvisioningCallbackToken) {
    return res.status(503).json({ error: "Lab provisioning callback token is not configured." });
  }

  const authorization = String(req.headers.authorization || "");
  const bearer = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const provided = String(req.headers["x-lab-provisioning-token"] || req.query.token || bearer || "").trim();
  if (provided !== labProvisioningCallbackToken) {
    return res.status(401).json({ error: "Invalid lab provisioning token." });
  }

  return next();
}

function detectWorkshopProvisioningType(event) {
  const title = String(event?.title || "").toLowerCase();
  if (/document\s*db|documentdb|mongo\s*db|mongodb|mongo-compatible|mongo compatible/.test(title)) {
    return { isDocDB: true, label: "DocumentDB" };
  }

  if (/nosql|cosmos\s*db|cosmosdb/.test(title)) {
    return { isDocDB: false, label: "Cosmos DB for NoSQL" };
  }

  return { isDocDB: null, label: "Ambiguous" };
}

function getCanonicalLabType(record) {
  if (record?.labType === "documentdb" || record?.labType === "nosql") {
    return record.labType;
  }

  return record?.isDocDB ? "documentdb" : "nosql";
}

function getActiveRegistrations(registrations) {
  return registrations
    .filter(isApprovedRegistration)
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
}

function getBatchStudentNumbers(batch) {
  if (Array.isArray(batch?.requestedStudentNumbers) && batch.requestedStudentNumbers.length) {
    return batch.requestedStudentNumbers.map(Number);
  }
  const start = Number(batch?.startStudentNumber || 1);
  return Array.from({ length: Number(batch?.studentCount || 0) }, (_, index) => start + index);
}

function getBatchRegistrationId(batch, studentNumber) {
  const registrationIndex = getBatchStudentNumbers(batch).indexOf(Number(studentNumber));
  return registrationIndex >= 0 ? batch.requestedRegistrationIds[registrationIndex] : "";
}

function isApprovedRegistration(registration) {
  return String(registration?.status || "registered").toLowerCase() === "registered";
}

function hasLabAccess(registration) {
  return Boolean(
    registration?.labWebUri
    || registration?.labVmUsername
    || registration?.labResourceGroup
    || registration?.labPortalUsername
    || registration?.labDatabaseAccountName
    || registration?.labFoundryAccountName
  );
}

function isReservedLabProvisioningBatch(batch) {
  return ["requested", "dispatched", "running", "deleting", "manual-required"].includes(String(batch?.status || "").toLowerCase());
}

function buildLabProvisioningSummary(registrations, batches, personaAssignments = []) {
  const activeRegistrations = getActiveRegistrations(registrations);
  const assignedCount = activeRegistrations.filter(hasLabAccess).length;
  const reservedIds = new Set(batches.filter(isReservedLabProvisioningBatch).flatMap((batch) => batch.requestedRegistrationIds || []));
  const availableRegistrations = activeRegistrations.filter((registration) => !hasLabAccess(registration) && !reservedIds.has(registration.id));
  const reservedRecipientIds = batches
    .filter(isReservedLabProvisioningBatch)
    .flatMap((batch) => batch.requestedRecipientIds || []);
  const availableTeamMembers = selectProvisioningTeamMembers(personaAssignments, reservedRecipientIds);
  const teamMembers = selectProvisioningTeamMembers(personaAssignments, [], true);
  const countForStatuses = (statuses) => batches
    .filter((batch) => statuses.includes(String(batch.status || "").toLowerCase()))
    .reduce((total, batch) => total + Number(batch.studentCount || 0), 0);
  return {
    deployedCount: assignedCount,
    inProgressCount: countForStatuses(["requested", "dispatched", "running", "deleting"]),
    failedCount: countForStatuses(["failed", "manual-required"]),
    unassignedCount: activeRegistrations.length - assignedCount,
    activeRegistrationCount: activeRegistrations.length,
    availableRegistrations,
    availableTeamMembers,
    deployedTeamCount: teamMembers.filter((member) => member.hasLabAccess).length
  };
}

function buildLabProvisioningCommand({ studentCount, startStudentNumber = 1, studentNumbers = [], isDocDB, labId, location, vmSize, accessDurationHours = 72, maxParallelDeployments }) {
  const labIdPart = labId ? ` -LabId ${labId}` : "";
  const endStudentNumber = startStudentNumber + studentCount - 1;
  const studentNumbersPart = studentNumbers.length ? ` -StudentNumbers @(${studentNumbers.join(",")})` : "";
  const maxParallelDeploymentsPart = maxParallelDeployments ? ` -MaxParallelDeployments ${maxParallelDeployments}` : "";
  return `.\\script\\provision-student-environments.ps1 -StudentCount ${endStudentNumber} -StartStudentNumber ${startStudentNumber}${studentNumbersPart}${labIdPart} -NoFabric -location ${location} -vmSize ${vmSize} -IsDocDB ${isDocDB ? 1 : 0} -AccessDurationHours ${accessDurationHours}${maxParallelDeploymentsPart}`;
}

function buildLabAccessFromProvisioningRow(row, isDocDB) {
  const normalized = Object.entries(row || {}).reduce((acc, [key, value]) => {
    acc[String(key || "").trim().toLowerCase()] = String(value || "").trim();
    return acc;
  }, {});
  const pick = (...names) => names.map((name) => normalized[String(name).toLowerCase()]).find(Boolean) || "";
  return {
    labWebUri: pick("BastionUri", "LabWebUri", "WebUri"),
    labVmName: pick("VmName"),
    labVmStatus: "running",
    labVmStatusMessage: "VM is ready for Bastion access.",
    labVmUsername: pick("VmAdminUsername", "VmUsername"),
    labVmPassword: pick("VmAdminPassword", "VmPassword", "Password"),
    labPortalUsername: pick("UserPrincipalName", "PortalUsername", "StudentUpn"),
    labPortalPassword: pick("TempPassword", "TempPass", "PortalPassword", "PortalPass", "UserPassword"),
    labResourceGroup: pick("ResourceGroup", "ResourceGroupName"),
    labDatabaseAccountType: isDocDB ? "documentdb" : "cosmosdb",
    labDatabaseAccountName: isDocDB
      ? pick("DocumentDbCluster", "DocumentDBCluster", "DatabaseAccountName")
      : pick("CosmosServerlessAccount", "CosmosProvisionedAccount", "DatabaseAccountName"),
    labFoundryAccountName: pick(
      "FoundryAccount",
      "FoundryName",
      "AIFoundryAccount",
      "AzureAIFoundryAccount"
    )
  };
}

function parseProvisioningCsv(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: "" });
}

async function dispatchLabProvisioningWorkflow(job) {
  if (!labProvisioningCallbackToken) {
    return { dispatched: false, reason: "Lab provisioning callback token is not configured." };
  }

  if (!labProvisioningGithubToken || !labProvisioningGithubOwner || !labProvisioningGithubRepo) {
    return { dispatched: false, reason: "GitHub dispatch settings are not configured." };
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(labProvisioningGithubOwner)}/${encodeURIComponent(labProvisioningGithubRepo)}/actions/workflows/${encodeURIComponent(labProvisioningGithubWorkflow)}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${labProvisioningGithubToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      ref: labProvisioningGithubRef,
      inputs: {
        jobId: job.id,
        eventId: job.eventId,
        studentCount: String(job.studentCount),
        startStudentNumber: String(job.startStudentNumber || 1),
        studentNumbers: getBatchStudentNumbers(job).join(","),
        isDocDB: job.isDocDB ? "true" : "false",
        labId: job.labId || "",
        location: job.location,
        vmSize: job.vmSize,
        accessDurationHours: String(job.accessDurationHours || 72),
        maxParallelDeployments: String(job.maxParallelDeployments || job.studentCount),
        callbackUrl: job.callbackUrl
      }
    })
  });

  if (!response.ok) {
    return { dispatched: false, reason: await response.text() };
  }

  return { dispatched: true, reason: "Workflow dispatched." };
}

async function dispatchLabDeletionWorkflow(batch, studentNumbers, callbackUrl) {
  if (!labProvisioningCallbackToken) {
    return { dispatched: false, reason: "Lab provisioning callback token is not configured." };
  }
  if (!labProvisioningGithubToken || !labProvisioningGithubOwner || !labProvisioningGithubRepo) {
    return { dispatched: false, reason: "GitHub dispatch settings are not configured." };
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(labProvisioningGithubOwner)}/${encodeURIComponent(labProvisioningGithubRepo)}/actions/workflows/${encodeURIComponent(labProvisioningGithubDeleteWorkflow)}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${labProvisioningGithubToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      ref: labProvisioningGithubRef,
      inputs: {
        jobId: batch.id,
        eventId: batch.eventId,
        labId: batch.labId,
        studentNumbers: studentNumbers.join(","),
        callbackUrl
      }
    })
  });

  if (!response.ok) {
    return { dispatched: false, reason: await response.text() };
  }
  return { dispatched: true, reason: "Deletion workflow dispatched." };
}

async function dispatchLabVmWorkflow(registration, action, callbackUrl) {
  if (!labProvisioningCallbackToken) {
    return { dispatched: false, reason: "Lab provisioning callback token is not configured." };
  }
  if (!labProvisioningGithubToken || !labProvisioningGithubOwner || !labProvisioningGithubRepo) {
    return { dispatched: false, reason: "GitHub dispatch settings are not configured." };
  }

  const resourceGroup = String(registration.labResourceGroup || "").trim();
  const resourceGroupMatch = resourceGroup.match(/^lab-dev(\d+)-/i);
  const vmName = String(registration.labVmName || (resourceGroupMatch ? `lab-vm-l${resourceGroupMatch[1]}-01` : "")).trim();
  if (!resourceGroup || !vmName) {
    return { dispatched: false, reason: "VM resource details are not available for this registration." };
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(labProvisioningGithubOwner)}/${encodeURIComponent(labProvisioningGithubRepo)}/actions/workflows/${encodeURIComponent(labProvisioningGithubVmWorkflow)}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${labProvisioningGithubToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      ref: labProvisioningGithubRef,
      inputs: {
        registrationId: registration.id,
        resourceGroup,
        vmName,
        action,
        callbackUrl
      }
    })
  });

  if (!response.ok) {
    return { dispatched: false, reason: await response.text() };
  }
  return { dispatched: true, reason: "VM power workflow dispatched." };
}

function toDateTimeInputValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}

function parseBoolean(value) {
  return ["true", "1", "yes", "on"].includes(String(value || "").toLowerCase());
}

function normalizeOrganizationName(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  return raw.replace(/\s+/g, " ");
}

function canonicalizeOrganizationName(input, knownOrganizations) {
  const normalized = normalizeOrganizationName(input);
  if (!normalized) {
    return "";
  }

  const organizationKey = normalizeOrganizationKey(normalized);
  const matchingOrganization = knownOrganizations.find((organization) => (
    normalizeOrganizationKey(organization) === organizationKey
  ));
  return matchingOrganization ? canonicalOrganizationLabel(matchingOrganization) : normalized;
}

function getCanonicalOrganizationSuggestions(organizations) {
  const suggestionsByKey = new Map();
  for (const organization of organizations) {
    if (isDisallowedOrganizationName(organization)) {
      continue;
    }

    const organizationKey = normalizeOrganizationKey(organization);
    if (organizationKey && !suggestionsByKey.has(organizationKey)) {
      suggestionsByKey.set(organizationKey, canonicalOrganizationLabel(organization));
    }
  }

  return [...suggestionsByKey.values()].sort((first, second) => first.localeCompare(second));
}

function deriveCompanyName(emailAddress) {
  const email = String(emailAddress || "").trim().toLowerCase();
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[1]) {
    return "";
  }

  const domain = parts[1].split(".")[0] || "";
  const tokens = domain.split(/[-_]/g);
  return tokens
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function requiresManualCompanyName(emailAddress) {
  const domain = String(emailAddress || "").trim().toLowerCase().split("@")[1] || "";
  return ["gmail.com", "outlook.com", "outlook.live.com", "hotmail.com", "live.com"].includes(domain);
}

function normalizeCountryCode(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }

  const digits = value.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}

function normalizePhoneNumber(countryCode, phone) {
  const cleanPhone = String(phone || "").replace(/[^\d]/g, "");
  const cleanCode = normalizeCountryCode(countryCode);
  if (!cleanPhone) {
    return "";
  }

  return `${cleanCode}${cleanPhone}`;
}

function isPreviewEvent(event) {
  const haystack = `${String(event?.title || "")} ${String(event?.description || "")}`.toLowerCase();
  return haystack.includes("preview");
}

function clearAllPersonaSessions(req) {
  req.session.publisher = null;
  req.session.supervisor = null;
  req.session.registrant = null;
  req.session.facilitator = null;
}

async function handlePersonaLogin(req, res, persona) {
  if (!["publisher", "supervisor", "registrant", "facilitator", "speaker", "proctor"].includes(persona)) {
    return res.status(400).render("login", {
      error: "Select a valid persona.",
      persona: "publisher",
      attendeeEmail: "",
      registrationCode: ""
    });
  }

  if (persona === "publisher") {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const authConfig = await loadAuthConfig();
    const loginUser = await getLoginUserByEmailAndType(email, "publisher");
    const partnerProfile = isPartnerAccount(loginUser) ? await getPartnerById(loginUser.partnerId) : null;

    const approvedPartnerPublisher = loginUser
      && isPartnerAccount(loginUser)
      && loginUser.active !== false
      && String(partnerProfile?.status || "").toLowerCase() === "approved";
    if (isPartnerAccount(loginUser) && !approvedPartnerPublisher) {
      return res.status(403).render("login", {
        error: "Access denied. This partner account is not approved.",
        persona,
        attendeeEmail: "",
        registrationCode: ""
      });
    }
    if (!isPartnerAccount(loginUser) && (!isMicrosoftEmail(email) || !isPublisherAuthorized(email, authConfig.publisherAllowlist))) {
      return res.status(403).render("login", {
        error: "Access denied. Publisher login is restricted to approved Microsoft accounts.",
        persona,
        attendeeEmail: "",
        registrationCode: ""
      });
    }

    const storedPassword = loginUser?.passwordHash || loginUser?.password || "";
    if (!loginUser || loginUser.active === false || !verifyPassword(storedPassword, password)) {
      return res.status(401).render("login", {
        error: "Invalid publisher credentials.",
        persona,
        attendeeEmail: "",
        registrationCode: ""
      });
    }

    if (!loginUser.passwordHash) {
      await upsertLoginUser({
        ...loginUser,
        password: "",
        passwordHash: hashPassword(password)
      });
    }

    clearAllPersonaSessions(req);
    req.session.publisher = {
      email,
      name: String(loginUser.name || "").trim(),
      accountClass: String(loginUser.accountClass || "internal").toLowerCase(),
      partnerId: String(loginUser.partnerId || ""),
      partnerName: String(loginUser.partnerName || ""),
      partnerAgreementSigned: partnerProfile ? hasCurrentPartnerAgreement(partnerProfile) : true,
      isPartnerPrimaryPublisher: partnerProfile
        ? String(partnerProfile.submitterEmail || "").toLowerCase() === email
        : false
    };
    return req.session.save(() => res.redirect("/publisher"));
  }

  if (persona === "supervisor") {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    await loadAuthConfig();

    if (!isMicrosoftEmail(email)) {
      return res.status(403).render("login", {
        error: "Access denied. Supervisor login is restricted to Microsoft accounts.",
        persona,
        attendeeEmail: "",
        registrationCode: ""
      });
    }

    const loginUser = await getLoginUserByEmailAndType(email, "supervisor");
    const storedPassword = loginUser?.passwordHash || loginUser?.password || "";
    if (!loginUser || loginUser.active === false || !verifyPassword(storedPassword, password)) {
      return res.status(401).render("login", {
        error: "Invalid supervisor credentials.",
        persona,
        attendeeEmail: "",
        registrationCode: ""
      });
    }

    if (!loginUser.passwordHash) {
      await upsertLoginUser({
        ...loginUser,
        password: "",
        passwordHash: hashPassword(password)
      });
    }

    clearAllPersonaSessions(req);
    req.session.supervisor = { email, name: String(loginUser.name || "").trim() };
    return req.session.save(() => res.redirect("/supervisor"));
  }

  if (["facilitator", "speaker", "proctor"].includes(persona)) {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const candidateLogins = persona === "facilitator"
      ? await Promise.all([
          getLoginUserByEmailAndType(email, "speaker"),
          getLoginUserByEmailAndType(email, "proctor")
        ])
      : [await getLoginUserByEmailAndType(email, persona)];
    const loginUser = candidateLogins.find((item) => {
      const storedPassword = item?.passwordHash || item?.password || "";
      return item && item.active !== false && verifyPassword(storedPassword, password);
    });
    const partnerProfile = isPartnerAccount(loginUser) ? await getPartnerById(loginUser.partnerId) : null;

    const partnerAccessDenied = isPartnerAccount(loginUser)
      && String(partnerProfile?.status || "").toLowerCase() !== "approved";
    if (!loginUser || partnerAccessDenied) {
      return res.status(401).render("login", {
        error: `Invalid ${persona === "facilitator" ? "facilitator" : persona} credentials.`,
        persona,
        attendeeEmail: "",
        registrationCode: ""
      });
    }

    if (!loginUser.passwordHash) {
      await upsertLoginUser({
        ...loginUser,
        password: "",
        passwordHash: hashPassword(password)
      });
    }

    clearAllPersonaSessions(req);
    req.session.facilitator = {
      email,
      persona,
      accountUserType: persona === "facilitator"
        ? (candidateLogins[0] === loginUser ? "speaker" : "proctor")
        : persona,
      name: String(loginUser.name || "").trim(),
      accountClass: String(loginUser.accountClass || "internal").toLowerCase(),
      partnerId: String(loginUser.partnerId || ""),
      partnerName: String(loginUser.partnerName || "")
    };

    return req.session.save(() => res.redirect("/facilitator/dashboard"));
  }

  const attendeeEmail = String(req.body.attendeeEmail || "").trim().toLowerCase();
  const registrationCode = String(req.body.registrationCode || "").trim().toUpperCase();
  if (!attendeeEmail || !registrationCode) {
    return res.status(400).render("login", {
      error: "Registered email and registration code are required for registrant login.",
      persona,
      attendeeEmail,
      registrationCode
    });
  }

  const registration = await getRegistrationByEmailAndCode(attendeeEmail, registrationCode);
  if (!registration) {
    return res.status(401).render("login", {
      error: "Invalid registration code or email.",
      persona,
      attendeeEmail,
      registrationCode
    });
  }

  clearAllPersonaSessions(req);
  req.session.registrant = {
    attendeeEmail,
    attendeeName: registration.attendeeName
  };

  return req.session.save(() => res.redirect("/registrant/dashboard"));
}

function getEventStatus(event, now = new Date()) {
  if (!event) {
    return "unknown";
  }

  if (String(event.status || "").toLowerCase() === "canceled" || event.canceledAt) {
    return "canceled";
  }

  const startAt = new Date(event.startAt);
  const endAt = new Date(event.endAt);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return "unknown";
  }

  if (now.getTime() > endAt.getTime()) {
    return "completed";
  }

  if (now.getTime() >= startAt.getTime()) {
    return "ongoing";
  }

  return "upcoming";
}

function eventMatchesStatus(event, statusFilter) {
  if (!statusFilter || statusFilter === "all") {
    return true;
  }

  return getEventStatus(event) === statusFilter;
}

function requirePublisher(req, res, next) {
  if (!req.session.publisher) {
    return res.redirect("/login?persona=publisher");
  }

  next();
}

function requirePartnerAgreement(req, res, next) {
  if (
    isPartnerAccount(req.session.publisher)
    && !req.session.publisher.partnerAgreementSigned
  ) {
    return res.redirect("/partners/agreement?required=1");
  }

  next();
}

function requireSupervisor(req, res, next) {
  if (!req.session.supervisor) {
    return res.redirect("/login?persona=supervisor");
  }

  next();
}

function requireRegistrant(req, res, next) {
  if (!req.session.registrant) {
    return res.redirect("/login?persona=registrant");
  }

  next();
}

function requireFacilitator(req, res, next) {
  if (!req.session.facilitator) {
    return res.redirect("/login?persona=speaker");
  }

  next();
}

function requireEventOperator(req, res, next) {
  if (req.session.publisher || req.session.facilitator) {
    return next();
  }

  return res.redirect("/login?persona=publisher");
}

function requireBootstrapToken(req, res, next) {
  if (!bootstrapApiToken) {
    return res.status(503).json({ error: "Bootstrap API token is not configured." });
  }

  const provided = String(req.headers["x-bootstrap-token"] || req.query.token || "");
  if (provided !== bootstrapApiToken) {
    return res.status(401).json({ error: "Invalid bootstrap token." });
  }

  return next();
}

async function loadAuthConfig() {
  const now = Date.now();
  if (authConfigCache.value && authConfigCache.expiresAt > now) {
    return authConfigCache.value;
  }

  const loginUsers = await listLoginUsers();

  if (!loginUsers.length) {
    throw new Error("Missing login-user documents in metadata container.");
  }

  const publishers = loginUsers
    .filter((user) => hasLoginRole(user, "publisher"))
    .map((user) => String(user.email || "").toLowerCase())
    .filter(Boolean);

  const supervisors = loginUsers.filter((user) => hasLoginRole(user, "supervisor"));

  const normalized = {
    publisherAllowlist: [...new Set(publishers)],
    supervisorCount: supervisors.length
  };

  if (!normalized.publisherAllowlist.length && !normalized.supervisorCount) {
    throw new Error("Metadata login-user documents do not contain valid publisher/supervisor records.");
  }

  authConfigCache = {
    value: normalized,
    expiresAt: now + 60 * 1000
  };

  return normalized;
}

function applyFilters(events, query) {
  return events.filter((event) => {
    const searchTerm = String(query.search || "")
      .trim()
      .toLowerCase();
    const statusFilter = String(query.status || "").trim().toLowerCase();
    const modeMatches = query.mode ? event.deliveryMode === query.mode : true;

    const locationMatches = query.location
      ? String(event.city || "")
          .toLowerCase()
          .includes(String(query.location).toLowerCase())
      : true;

    const dateMatches = query.date
      ? new Date(event.startAt).toISOString().slice(0, 10) === query.date
      : true;

    const timeZoneMatches = query.timeZone
      ? String(event.timeZone || "")
          .toLowerCase()
          .includes(String(query.timeZone).toLowerCase())
      : true;

    const statusMatches = statusFilter && statusFilter !== "all"
      ? String(event.computedStatus || "").toLowerCase() === statusFilter
      : true;

    const searchMatches = searchTerm
      ? [
          String(event.title || ""),
          String(event.description || ""),
          String(event.city || ""),
          String(event.timeZone || ""),
          String(event.deliveryMode || ""),
          String(event.partnerName || "")
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm)
      : true;

    return modeMatches && locationMatches && dateMatches && timeZoneMatches && statusMatches && searchMatches;
  });
}

function parseDateSafe(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function compareEventsByScheduleProximity(a, b) {
  const now = Date.now();

  const classifyEvent = (event) => {
    const startAt = parseDateSafe(event.startAt);
    const endAt = parseDateSafe(event.endAt);
    const effectiveEnd = endAt === Number.POSITIVE_INFINITY ? startAt : endAt;

    if (startAt <= now && effectiveEnd >= now) {
      return { bucket: 0, distance: 0, anchor: startAt };
    }

    if (startAt > now) {
      return { bucket: 1, distance: startAt - now, anchor: startAt };
    }

    return { bucket: 2, distance: now - effectiveEnd, anchor: effectiveEnd };
  };

  const left = classifyEvent(a);
  const right = classifyEvent(b);

  if (left.bucket !== right.bucket) {
    return left.bucket - right.bucket;
  }

  if (left.distance !== right.distance) {
    return left.distance - right.distance;
  }

  return left.anchor - right.anchor;
}

function applySort(events, sort) {
  const sorted = [...events];

  if (sort === "schedule-nearest") {
    return sorted.sort(compareEventsByScheduleProximity);
  }

  if (sort === "freshness-oldest") {
    return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  if (sort === "start-latest") {
    return sorted.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }

  if (sort === "start-soonest") {
    return sorted.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }

  return sorted.sort(compareEventsByScheduleProximity);
}

function buildOrganizationReport(registrations) {
  const counts = new Map();

  for (const item of registrations) {
    if (!isApprovedRegistration(item)) {
      continue;
    }

    const rawOrganization = String(item.organization || item.companyName || "Unknown").trim() || "Unknown";
    const organizationKey = normalizeOrganizationKey(rawOrganization);
    if (!counts.has(organizationKey)) {
      counts.set(organizationKey, { organization: canonicalOrganizationLabel(rawOrganization), registered: 0, attended: 0 });
    }

    const row = counts.get(organizationKey);
    row.registered += 1;
    if (item.attended) {
      row.attended += 1;
    }
  }

  return [...counts.values()].sort((a, b) => b.registered - a.registered);
}

function normalizeOrganizationKey(value) {
  const genericWords = new Set([
    "analytics",
    "corp",
    "corporation",
    "inc",
    "limited",
    "llc",
    "ltd",
    "pvt",
    "private",
    "services",
    "software",
    "solutions",
    "technologies",
    "technology"
  ]);
  const words = String(value || "Unknown")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const meaningfulWords = words.filter((word) => !genericWords.has(word));
  return (meaningfulWords.length ? meaningfulWords : words).join("");
}

function canonicalOrganizationLabel(value) {
  const words = String(value || "Unknown")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const key = normalizeOrganizationKey(value);
  if (key === "maq") return "MAQ Software";
  if (key === "quadrant") return "Quadrant Technologies";
  if (key === "tredence") return "Tredence";
  return words.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`).join(" ") || "Unknown";
}

function parseSelectedEventIds(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  return [...new Set(rawValues.flatMap((item) => String(item || "").split(",")).map((item) => item.trim()).filter(Boolean))];
}

function parseCustomerNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const number = Number(text.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(number) ? number : undefined;
}

function parseCustomerEnrichmentWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const records = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: "" });
  const aliases = {
    organization: ["organization", "company", "company name"],
    segment: ["segment", "customer segment"],
    region: ["region", "geography"],
    totalAcrUsdLast6Months: ["total acr usd last 6 months", "total acr 6mo", "total acr"],
    cosmosDbAcrUsdLast6Months: ["cosmos db acr usd last 6 months", "cosmos acr usd last 6 months", "cosmos acr 6mo"],
    cosmosDbAcrUsdLastMonth: ["cosmos db acr usd last month", "cosmos acr usd last month", "cosmos acr last month"],
    cosmosDbAcrGrowthPercent: ["cosmos db acr growth %", "cosmos db acr growth percent", "cosmos acr growth %", "growth %"]
  };
  const normalized = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return records.map((record) => {
    const entries = Object.fromEntries(Object.entries(record).map(([key, value]) => [normalized(key), value]));
    const pick = (names) => names.map(normalized).map((name) => entries[name]).find((value) => value !== undefined);
    return Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, pick(names)]));
  });
}

function buildCustomerReport(events, registrations, profiles) {
  const eventById = new Map(events.map((event) => [String(event.id), event]));
  const profileByKey = new Map(profiles.map((profile) => [String(profile.organizationKey), profile]));
  const customers = new Map();
  for (const registration of registrations) {
    if (!isApprovedRegistration(registration)) continue;
    const rawOrganization = String(registration.organization || registration.companyName || "Unknown").trim() || "Unknown";
    const organizationKey = normalizeOrganizationKey(rawOrganization);
    if (!customers.has(organizationKey)) {
      customers.set(organizationKey, { organizationKey, organization: canonicalOrganizationLabel(rawOrganization), registrations: 0, eventIds: new Set(), sessionNames: new Set(), publisherEmails: new Set() });
    }
    const customer = customers.get(organizationKey);
    const event = eventById.get(String(registration.eventId));
    customer.registrations += 1;
    customer.eventIds.add(String(registration.eventId));
    if (event) {
      customer.sessionNames.add(getPartnerEventTitle(event));
      customer.publisherEmails.add(event.publisherEmail);
    }
  }
  const rows = [...customers.values()].map((customer) => {
    const profile = profileByKey.get(customer.organizationKey) || {};
    return { organizationKey: customer.organizationKey, organization: profile.organization || customer.organization, segment: profile.segment || "", region: profile.region || "", registrations: customer.registrations, sessions: customer.eventIds.size, sessionNames: [...customer.sessionNames].sort().join("; "), publisherEmails: [...customer.publisherEmails].sort().join("; "), totalAcrUsdLast6Months: profile.totalAcrUsdLast6Months, cosmosDbAcrUsdLast6Months: profile.cosmosDbAcrUsdLast6Months, cosmosDbAcrUsdLastMonth: profile.cosmosDbAcrUsdLastMonth, cosmosDbAcrGrowthPercent: profile.cosmosDbAcrGrowthPercent };
  }).sort((a, b) => b.registrations - a.registrations || a.organization.localeCompare(b.organization));
  const sum = (field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  return { rows, summary: { totalCustomers: rows.length, totalRegistrations: sum("registrations"), totalCosmosAcrUsdLast6Months: sum("cosmosDbAcrUsdLast6Months"), averageCosmosAcrUsdLast6Months: rows.length ? sum("cosmosDbAcrUsdLast6Months") / rows.length : 0, totalCosmosAcrUsdLastMonth: sum("cosmosDbAcrUsdLastMonth"), averageCosmosAcrGrowthPercent: rows.length ? sum("cosmosDbAcrGrowthPercent") / rows.length : 0 } };
}

function buildCustomerWorkbook(rows) {
  const sheet = XLSX.utils.json_to_sheet(rows.map((row) => ({ Organization: row.organization, Segment: row.segment, Region: row.region, "Total ACR USD (Last 6 Months)": row.totalAcrUsdLast6Months ?? "", "Cosmos DB ACR USD (Last 6 Months)": row.cosmosDbAcrUsdLast6Months ?? "", "Cosmos DB ACR USD (Last Month)": row.cosmosDbAcrUsdLastMonth ?? "", "Cosmos DB ACR Growth %": row.cosmosDbAcrGrowthPercent ?? "", Registrations: row.registrations, Sessions: row.sessions, "Session Names": row.sessionNames, "Publisher Emails": row.publisherEmails })));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Customers");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function createReportWorksheet(headers, rows) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((header, index) => ({
    wch: Math.min(
      50,
      Math.max(
        header.length + 2,
        ...rows.map((row) => String(row[index] ?? "").length + 2)
      )
    )
  }));
  return sheet;
}

function appendReportSheet(workbook, sheet, requestedName) {
  const baseName = String(requestedName || "Report")
    .replace(/[\\/?*[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Report";
  let suffix = "";
  let counter = 1;
  let sheetName = baseName.slice(0, 31);

  while (workbook.SheetNames.includes(sheetName)) {
    counter += 1;
    suffix = ` (${counter})`;
    sheetName = `${baseName.slice(0, 31 - suffix.length)}${suffix}`;
  }

  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
}

function getEventReportSheetName(eventTitle, reportName) {
  const suffix = ` - ${reportName}`;
  return `${String(eventTitle || "Event").slice(0, 31 - suffix.length)}${suffix}`;
}

function appendRegistrationReportSheet(workbook, event, registrations) {
  const partnerHeaders = event.partnerId
    ? ["Organization Size", "Partner Marketing Consent"]
    : [];
  const headers = [
    "Event Title",
    "Attendee Name",
    "Email",
    "Organization",
    ...partnerHeaders,
    "Job Role",
    "Country",
    "Phone Number",
    "Registration Code",
    "Registration Date",
    "Status",
    "Attended",
    "Lab Deployed To",
    "Lab Deployed Date",
    "Lab Access"
  ];
  const rows = registrations.map((item) => [
    sanitizeExportEventTitle(getPartnerEventTitle(event)),
    item.attendeeName || "",
    item.attendeeEmail || "",
    item.organization || item.companyName || "",
    ...(event.partnerId
      ? [item.organizationSize || "", item.partnerOptIn ? "Yes" : "No"]
      : []),
    item.jobRole || "",
    item.country || "",
    item.phoneNumber || "",
    item.registrationCode || "",
    item.createdAt || "",
    item.status || "registered",
    item.attended ? "Yes" : "No",
    item.attendeeName || item.attendeeEmail || "",
    item.labAccessUpdatedAt || "",
    item.labWebUri || item.labVmUsername || item.labResourceGroup ? "Assigned" : "Not set"
  ]);
  appendReportSheet(
    workbook,
    createReportWorksheet(headers, rows),
    getEventReportSheetName(event.title, "Registrations")
  );
}

function appendOrganizationReportSheet(workbook, event, organizations) {
  const summaryHeaders = [
    "Event Title",
    "Organization",
    "Registrations",
    "Attendees"
  ];
  const eventTitle = sanitizeExportEventTitle(getPartnerEventTitle(event));
  const summaryRows = organizations.map((row) => [
    eventTitle,
    row.organization || "",
    row.registered,
    row.attended
  ]);
  summaryRows.push([
    eventTitle,
    "TOTAL",
    organizations.reduce((total, row) => total + row.registered, 0),
    organizations.reduce((total, row) => total + row.attended, 0)
  ]);

  appendReportSheet(
    workbook,
    createReportWorksheet(summaryHeaders, summaryRows),
    getEventReportSheetName(event.title, "Organizations")
  );
}

function buildPublisherReportsExcel(reportData, reportTypes) {
  const workbook = XLSX.utils.book_new();
  for (const { event, registrations } of reportData) {
    if (reportTypes.includes("registrations")) {
      appendRegistrationReportSheet(workbook, event, registrations);
    }
    if (reportTypes.includes("organizations")) {
      appendOrganizationReportSheet(
        workbook,
        event,
        buildOrganizationReport(registrations)
      );
    }
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildOrganizationExcel(event, organizations) {
  const workbook = XLSX.utils.book_new();
  appendOrganizationReportSheet(workbook, event, organizations);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function toCsvValue(value) {
  const text = String(value === null || value === undefined ? "" : value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildRegistrationReportSummary(registrations) {
  const registered = registrations.filter(
    (item) => String(item.status || "registered").toLowerCase() === "registered"
  );

  return {
    registered: registered.length,
    pending: registrations.filter((item) => String(item.status).toLowerCase() === "pending-approval").length,
    rejected: registrations.filter((item) => String(item.status).toLowerCase() === "rejected").length,
    attended: registered.filter((item) => item.attended).length,
    deregistered: registrations.filter((item) => String(item.status) === "deregistered").length
  };
}

function buildMailMergeCsv(event, registrations, baseUrl = "") {
  const headers = [
    "Salutation",
    "FirstName",
    "LastName",
    "FullName",
    "Email",
    "Organization",
    "JobRole",
    "Country",
    "PhoneNumber",
    "RegistrationCode",
    "RegistrationDate",
    "EventTitle",
    "EventStartAt",
    "EventEndAt",
    "EventTimeZone",
    "Location",
    "RegistrantLoginLink"
  ];

  const eventTitle = sanitizeExportEventTitle(getPartnerEventTitle(event));
  const location = event.deliveryMode === "in-person" ? event.address || event.city || "" : event.teamsLink || "Virtual";
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/$/, "");

  const rows = registrations
    .filter(isApprovedRegistration)
    .map((item) => {
      const registrantLoginLink = `${normalizedBaseUrl}/registrant/login?email=${encodeURIComponent(item.attendeeEmail || "")}&code=${encodeURIComponent(item.registrationCode || "")}`;

      return [
        item.salutation || "",
        item.firstName || "",
        item.lastName || "",
        item.attendeeName || "",
        item.attendeeEmail || "",
        item.organization || item.companyName || "",
        item.jobRole || "",
        item.country || "",
        item.phoneNumber || "",
        item.registrationCode || "",
        item.createdAt || "",
        eventTitle,
        event.startAt || "",
        event.endAt || "",
        event.timeZone || "",
        location,
        registrantLoginLink
      ];
    });

  return [headers, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\r\n");
}

function sanitizeExportEventTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, " ")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchAttendeeRows(rows, registrations) {
  return findRegistrationMatches(rows, registrations, {
    allowedStatuses: ["registered", "deregistered"],
    rejectDuplicateMatches: true
  }).map(({ row, index, matched, matchType, conflict, reason }) => ({
    rowNumber: index + 2,
    inputEmail: row.email || "",
    inputName: row.name || "",
    matchType,
    conflict,
    reason,
    matchedRegistrationId: matched ? matched.id : "",
    matchedName: matched ? matched.attendeeName : "",
    matchedEmail: matched ? matched.attendeeEmail : "",
    matchedStatus: matched ? String(matched.status || "registered").toLowerCase() : "",
    selected: Boolean(matched) && !conflict
  }));
}

// Reconciles an uploaded roster (email/name plus lab connection columns) against
// active registrations, carrying the lab fields through for the confirm step.
function matchLabAccessRows(rows, registrations) {
  return findRegistrationMatches(rows, registrations, { preferEmailMatch: true }).map(
    ({ row, index, matched, matchType, conflict, reason }) => {
      const missingCredentials = getMissingProvisioningCredentialFields(row);
      const hasCredentialConflict = missingCredentials.length > 0;
      return {
        rowNumber: index + 2,
        inputEmail: row.email || "",
        inputName: row.name || "",
        matchType,
        conflict: conflict || hasCredentialConflict,
        reason: hasCredentialConflict
          ? `Missing required lab fields: ${missingCredentials.join(", ")}`
          : reason,
        matchedRegistrationId: matched ? matched.id : "",
        matchedName: matched ? matched.attendeeName : "",
        matchedEmail: matched ? matched.attendeeEmail : "",
        labWebUri: row.labWebUri || "",
        labVmName: row.labVmName || "",
        labVmUsername: row.labVmUsername || "",
        labVmPassword: row.labVmPassword || "",
        labPortalUsername: row.labPortalUsername || "",
        labPortalPassword: row.labPortalPassword || "",
        labResourceGroup: row.labResourceGroup || "",
        labDatabaseAccountType: row.labDatabaseAccountType || "",
        labDatabaseAccountName: row.labDatabaseAccountName || "",
        CosmosProvisionedAccount: row.CosmosProvisionedAccount || "",
        labFoundryAccountName: row.labFoundryAccountName || "",
        selected: Boolean(matched) && !conflict && !hasCredentialConflict
      };
    }
  );
}

function parseAttendeeWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
  const normalizeHeader = (value) => String(value || "").trim().toLowerCase();
  const getHeaderIndex = (headers, candidates) =>
    headers.findIndex((header) => candidates.includes(normalizeHeader(header)));
  const tableRows = [];

  for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
    const headers = grid[rowIndex].map(normalizeHeader);
    const emailIndex = getHeaderIndex(headers, [
      "email",
      "email address",
      "attendee email",
      "participant email",
      "user principal name",
      "upn"
    ]);
    const nameIndex = getHeaderIndex(headers, [
      "name",
      "full name",
      "attendee",
      "attendee name",
      "participant",
      "participant name",
      "display name"
    ]);

    if (emailIndex === -1 && nameIndex === -1) {
      continue;
    }

    for (let dataIndex = rowIndex + 1; dataIndex < grid.length; dataIndex += 1) {
      const row = grid[dataIndex] || [];
      const firstCell = normalizeHeader(row[0]);
      if (/^\d+\.\s+/.test(firstCell)) {
        break;
      }

      const email = emailIndex >= 0 ? String(row[emailIndex] || "").trim() : "";
      const name = nameIndex >= 0 ? String(row[nameIndex] || "").trim() : "";
      if (!email && !name) {
        continue;
      }

      tableRows.push({ email, name });
    }
  }

  if (tableRows.length) {
    const seen = new Set();
    return tableRows.filter((row) => {
      const key = `${String(row.email || "").toLowerCase()}|${normalizeMatchName(row.name)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  const records = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  return records.map((record) => {
    const entries = Object.entries(record).reduce((acc, [key, value]) => {
      acc[String(key).trim().toLowerCase()] = value;
      return acc;
    }, {});

    const email = entries.email || entries["email address"] || entries["attendee email"] || "";
    const firstName = entries["first name"] || entries.firstname || "";
    const lastName = entries["last name"] || entries.lastname || "";
    const name =
      entries.name || entries["full name"] || entries.attendee || [firstName, lastName].filter(Boolean).join(" ");

    return { email: String(email || "").trim(), name: String(name || "").trim() };
  });
}

// Parses a roster-style sheet (matching the cosmos-workshop-2026 provisioning
// roster columns) carrying per-student lab environment connection details.
function parseLabAccessWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName];
  const records = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  return records.map((record) => {
    const entries = Object.entries(record).reduce((acc, [key, value]) => {
      acc[String(key).trim().toLowerCase()] = value;
      return acc;
    }, {});

    const portalUsername =
      entries["portalusername"] || entries["portal username"] || entries["userprincipalname"] || entries["user principal name"] || "";
    const portalPassword =
      entries["portalpassword"] || entries["portal password"] || entries["temppassword"] || entries["temp password"] || entries["temppass"] || entries["userpassword"] || "";
    const email = entries.email || entries["email address"] || portalUsername || "";
    const firstName = entries["first name"] || entries.firstname || "";
    const lastName = entries["last name"] || entries.lastname || "";
    const name =
      entries.name || entries["full name"] || entries.student || [firstName, lastName].filter(Boolean).join(" ");

    const webUri = entries.weburi || entries["web uri"] || entries.bastionuri || entries["bastion uri"] || "";
    const vmName = entries.vmname || entries["vm name"] || "";
    const vmUsername = entries.vmusername || entries["vm username"] || entries.vmadminusername || entries["vm admin username"] || "";
    const vmPassword = entries.vmpassword || entries["vm password"] || entries.vmadminpassword || entries["vm admin password"] || "";
    const resourceGroup = entries.resourcegroup || entries["resource group"] || "";
    const documentDbAccount =
      entries.documentdbcluster || entries["documentdb cluster"] || "";
    const cosmosDbAccount =
      entries.cosmosserverlessaccount
      || entries["cosmos serverless account"]
      || "";
    const cosmosProvisionedAccount =
      entries.cosmosprovisionedaccount
      || entries["cosmos provisioned account"]
      || "";
    const genericDatabaseAccount =
      entries.databaseaccountname || entries["database account name"] || "";
    const foundryAccount =
      entries.foundryaccount
      || entries["foundry account"]
      || entries.foundryname
      || entries["foundry name"]
      || entries.aifoundryaccount
      || entries["ai foundry account"]
      || entries.azureaifoundryaccount
      || entries["azure ai foundry account"]
      || "";

    return {
      email: String(email || "").trim(),
      name: String(name || "").trim(),
      labWebUri: String(webUri || "").trim(),
      labVmName: String(vmName || "").trim(),
      labVmUsername: String(vmUsername || "").trim(),
      labVmPassword: String(vmPassword || "").trim(),
      labPortalUsername: String(portalUsername || "").trim(),
      labPortalPassword: String(portalPassword || "").trim(),
      labResourceGroup: String(resourceGroup || "").trim(),
      labDatabaseAccountType: documentDbAccount ? "documentdb" : cosmosDbAccount ? "cosmosdb" : "",
      labDatabaseAccountName: String(documentDbAccount || cosmosDbAccount || genericDatabaseAccount || "").trim(),
      CosmosProvisionedAccount: String(cosmosProvisionedAccount || "").trim(),
      labFoundryAccountName: String(foundryAccount || "").trim()
    };
  });
}

function maskOrganizationReportRows(rows, allowPii) {
  if (allowPii) {
    return Array.isArray(rows) ? rows : [];
  }

  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    organization: maskText(row.organization || "")
  }));
}

async function getPublisherEvent(req, res) {
  const event = await getEventById(req.params.id);
  if (!event) {
    res.status(404).send("Event not found");
    return null;
  }

  if (event.publisherEmail !== req.session.publisher.email) {
    res.status(403).send("Not authorized.");
    return null;
  }

  return event;
}

// Resolves owner-or-collaborator access for shared publisher events.
// requireWrite=true also accepts owners; read-only collaborators are rejected.
async function getPublisherEventAccess(req, res, { requireWrite = false } = {}) {
  const event = await getEventById(req.params.id);
  if (!event) {
    res.status(404).send("Event not found");
    return null;
  }

  const sessionEmail = String(req.session.publisher.email || "").toLowerCase();
  if (String(event.publisherEmail || "").toLowerCase() === sessionEmail) {
    return { event, accessLevel: "owner", isOwner: true };
  }

  if (!isPartnerAccount(req.session.publisher) && event.partnerId) {
    return { event, accessLevel: "write", isOwner: false, isInternalPartnerReviewer: true };
  }

  const [collaboration, personaAssignments] = await Promise.all([
    getEventCollaboratorAccess(event.id, sessionEmail),
    listPersonaAssignmentsByEmail(sessionEmail)
  ]);
  const hasTeamAccess = personaAssignments.some((assignment) => String(assignment.eventId) === String(event.id));
  if (hasTeamAccess) {
    return { event, accessLevel: "write", isOwner: false, isTeamMember: true };
  }
  if (!collaboration || (requireWrite && collaboration.accessLevel !== "write")) {
    res.status(403).send("Not authorized for this event.");
    return null;
  }

  return { event, accessLevel: collaboration.accessLevel, isOwner: false };
}

function getEventOperatorEmail(req) {
  return normalizeEmail(
    req.session.publisher?.email || req.session.facilitator?.email
  );
}

async function listCurrentFacilitatorAssignments(req) {
  const facilitator = req.session.facilitator;
  if (!facilitator) {
    return [];
  }

  return facilitator.persona === "facilitator"
    ? listPersonaAssignmentsByEmail(facilitator.email)
    : listPersonaAssignmentsByEmailAndType(facilitator.email, facilitator.persona);
}

async function getFacilitatorEventAccess(req, res, eventId = req.params.id) {
  const [event, assignments] = await Promise.all([
    getEventById(eventId),
    listCurrentFacilitatorAssignments(req)
  ]);
  if (!event) {
    res.status(404).send("Event not found");
    return null;
  }

  const eventAssignments = assignments.filter(
    (assignment) => String(assignment.eventId) === String(event.id)
  );
  if (!eventAssignments.length) {
    res.status(403).send("Not authorized for this event.");
    return null;
  }

  return { event, eventAssignments };
}

async function getFacilitatorEventContext(req, res, eventId = req.params.id) {
  const access = await getFacilitatorEventAccess(req, res, eventId);
  if (!access) {
    return null;
  }

  const { event, eventAssignments } = access;
  const [sessions, facilitatorProfiles] = await Promise.all([
    listEventSessions(event.id),
    listFacilitatorProfiles()
  ]);
  const member = buildEventTeam({
    assignments: eventAssignments,
    profiles: facilitatorProfiles,
    sessions
  }).find((item) => item.email === normalizeEmail(req.session.facilitator.email));
  const assignedSessions = member
    ? sessions.filter((sessionItem) =>
      sessionItem.rowType === "session"
      && (
        (sessionItem.speakerIds || []).some((id) => member.aliasIds.includes(String(id)))
        || (sessionItem.proctorIds || []).some((id) => member.aliasIds.includes(String(id)))
      )
    )
    : [];

  return { event, eventAssignments, sessions, member, assignedSessions };
}

async function getEventOperatorAccess(req, res, options = {}) {
  if (req.session.publisher) {
    const access = await getPublisherEventAccess(req, res, options);
    return access ? { ...access, operatorType: "publisher" } : null;
  }

  const access = options.includeFacilitatorContext
    ? await getFacilitatorEventContext(req, res)
    : await getFacilitatorEventAccess(req, res);
  if (!access) {
    return null;
  }

  return {
    event: access.event,
    accessLevel: "write",
    isOwner: false,
    operatorType: req.session.facilitator.persona,
    facilitatorContext: options.includeFacilitatorContext ? access : undefined
  };
}

async function renderPublisherEventDetailPage(req, res, event, options = {}) {
  const [eventSummary, personas, collaboratorRecords, loginUsers] = await Promise.all([
    buildPublisherEventSummary(event, req, { includeFeedbackQr: true }),
    listPersonaAssignmentsByEvent(event.id),
    listEventCollaboratorsByEvent(event.id),
    listLoginUsers()
  ]);
  const loginUserByEmail = new Map(
    loginUsers.map((user) => [String(user.email || "").trim().toLowerCase(), user])
  );
  const collaborators = collaboratorRecords
    .map((collaborator) => ({
      ...collaborator,
      collaboratorName: loginUserByEmail.get(collaborator.collaboratorEmail)?.name || ""
    }))
    .sort((left, right) =>
      new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
    );
  const speakers = personas.filter((item) => String(item.personaType) === "speaker");
  const proctors = personas.filter((item) => String(item.personaType) === "proctor");
  const publisherEmail = normalizeEmail(req.session.publisher?.email);
  const publisherEventPersonas = [...new Set(
    personas
      .filter((item) => normalizeEmail(item.inviteEmail) === publisherEmail)
      .map((item) => String(item.personaType || "").toLowerCase())
      .filter((persona) => ["speaker", "proctor"].includes(persona))
  )];
  const registrationLink = `${getPublicBaseUrl()}/events/${event.id}/register`;

  return res.render("publisher-event-detail", {
    event: eventSummary,
    speakers,
    proctors,
    publisherEventPersonas,
    collaborators,
    accessLevel: options.accessLevel || "owner",
    registrationLink,
    message: String(options.message || ""),
    error: String(options.error || "")
  });
}

async function renderPublisherEventManagePage(req, res, event, options = {}) {
  const eventSummary = await buildPublisherEventSummary(event, req);
  const [followUpTemplate, collaborators, labProvisioningJob, labProvisioningBatches, registrations, personaAssignments, auditEntries] = await Promise.all([
    getFollowUpTemplateByEvent(event.id),
    listEventCollaboratorsByEvent(event.id),
    getLabProvisioningJobByEvent(event.id),
    listLabProvisioningBatchesByEvent(event.id),
    listAllRegistrationsByEvent(event.id),
    listPersonaAssignmentsByEvent(event.id),
    listEventAuditEntries(event.id)
  ]);
  const latestLabProvisioningRecord = labProvisioningJob || labProvisioningBatches[0] || null;

  return res.render("publisher-event-manage", {
    event: eventSummary,
    followUpTemplate,
    collaborators,
    labProvisioningJob,
    labProvisioningBatches,
    defaultLabType: latestLabProvisioningRecord
      ? getCanonicalLabType(latestLabProvisioningRecord)
      : (detectWorkshopProvisioningType(event).isDocDB ? "documentdb" : "nosql"),
    labProvisioningSummary: buildLabProvisioningSummary(registrations, labProvisioningBatches, personaAssignments),
    auditEntries,
    labProvisioningConfig: {
      githubConfigured: Boolean(labProvisioningGithubToken && labProvisioningGithubOwner && labProvisioningGithubRepo),
      callbackConfigured: Boolean(labProvisioningCallbackToken),
      location: labProvisioningLocation,
      vmSize: labProvisioningVmSize,
      workflow: labProvisioningGithubWorkflow
    },
    accessLevel: options.accessLevel || "owner",
    timeZones: TIMEZONES,
    message: String(options.message || ""),
    updateFormData: options.updateFormData || null,
    followUpFormData: options.followUpFormData || null,
    cancelFormData: options.cancelFormData || null
  });
}

const EVENT_AUDIT_FIELDS = [
  "title",
  "description",
  "startAt",
  "endAt",
  "city",
  "address",
  "deliveryMode",
  "timeZone",
  "maxSeats",
  "teamsLink",
  "holUri",
  "unlisted"
];

function buildEventAuditValues(before, after) {
  const oldValues = {};
  const newValues = {};

  for (const field of EVENT_AUDIT_FIELDS) {
    const oldValue = before[field] instanceof Date ? before[field].toISOString() : before[field];
    const newValue = after[field] instanceof Date ? after[field].toISOString() : after[field];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      oldValues[field] = oldValue ?? "";
      newValues[field] = newValue ?? "";
    }
  }

  return { oldValues, newValues };
}

function getPublisherAuditActor(req) {
  const operator = req.session.publisher || req.session.facilitator || {};
  return {
    actorEmail: String(operator.email || "").trim().toLowerCase(),
    actorName: String(operator.name || operator.email || "").trim()
  };
}

async function notifyEventParticipants(req, event, changeType, changeSummary) {
  const registrations = await listRegistrationsByEvent(event.id);
  const personas = await listPersonaAssignmentsByEvent(event.id);
  const participantMap = new Map();

  for (const item of registrations) {
    const email = String(item.attendeeEmail || "").toLowerCase();
    if (!email) {
      continue;
    }

    participantMap.set(`registrant:${email}`, {
      email,
      role: "registrant"
    });
  }

  for (const item of personas) {
    const email = String(item.inviteEmail || "").toLowerCase();
    if (!email) {
      continue;
    }

    participantMap.set(`persona:${email}:${item.personaType}`, {
      email,
      role: String(item.personaType || "persona")
    });
  }

  const recipients = [...participantMap.values()];
  for (const recipient of recipients) {
    try {
      await sendEventChangeNotification({
        baseUrl: getPublicBaseUrl(),
        event,
        recipientEmail: recipient.email,
        recipientType: recipient.role,
        changeType,
        changeSummary
      });
    } catch (error) {
      console.error(`Failed to notify ${recipient.email} about event change`, error);
    }
  }

  return recipients.length;
}

async function buildPublisherEventSummary(event, req, options = {}) {
  const now = Date.now();
  const includeFeedbackQr = Boolean(options.includeFeedbackQr);
  const cacheKey = `${String(event.id || "")}:${includeFeedbackQr ? "with-qr" : "without-qr"}`;
  const cached = publisherEventSummaryCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const [registrationCounts, feedbackCount, sessions, registrations] = await Promise.all([
    getRegistrationCountsByEvent(event.id),
    countFeedbackByEvent(event.id),
    listEventSessions(event.id),
    listAllRegistrationsByEvent(event.id)
  ]);
  const { registrationCount, attendedCount } = registrationCounts;
  const speakerIds = new Set();
  const proctorIds = new Set();
  for (const session of sessions) {
    for (const id of Array.isArray(session.speakerIds) ? session.speakerIds : []) {
      const normalizedId = String(id || "").trim();
      if (normalizedId) {
        speakerIds.add(normalizedId);
      }
    }
    for (const id of Array.isArray(session.proctorIds) ? session.proctorIds : []) {
      const normalizedId = String(id || "").trim();
      if (normalizedId) {
        proctorIds.add(normalizedId);
      }
    }
  }
  const speakerCount = speakerIds.size;
  const proctorCount = proctorIds.size;
  const maxSeats = Number.isInteger(event.maxSeats) ? event.maxSeats : null;
  const feedbackLink = `${getPublicBaseUrl()}/events/${event.id}/feedback`;
  const feedbackQrCodeDataUrl = includeFeedbackQr
    ? await QRCode.toDataURL(feedbackLink, { margin: 1, width: 180 })
    : undefined;

  const value = {
    ...event,
    computedStatus: getEventStatus(event),
    registrationCount,
    attendedCount,
    speakerCount,
    proctorCount,
    deployedLabCount: registrations.filter((registration) =>
      isApprovedRegistration(registration) && hasLabAccess(registration)
    ).length,
    remainingSeats: maxSeats === null ? null : Math.max(maxSeats - registrationCount, 0),
    feedbackCount,
    feedbackLink,
    ...(includeFeedbackQr ? { feedbackQrCodeDataUrl } : {})
  };

  publisherEventSummaryCache.set(cacheKey, {
    expiresAt: now + publisherEventSummaryTtlMs,
    value
  });

  return value;
}

async function buildPublisherDashboardSummaries(events, req) {
  const eventIds = events.map((event) => String(event.id || "").trim()).filter(Boolean);
  const [registrationCountsByEvent, feedbackCountsByEvent, sessions] = await Promise.all([
    getRegistrationCountsByEvents(eventIds),
    getFeedbackCountsByEvents(eventIds),
    listEventSessionsByEvents(eventIds)
  ]);
  const sessionsByEvent = new Map();
  for (const session of sessions) {
    const eventId = String(session.eventId || "").trim();
    if (!sessionsByEvent.has(eventId)) {
      sessionsByEvent.set(eventId, []);
    }
    sessionsByEvent.get(eventId).push(session);
  }

  const feedbackBaseUrl = `${getPublicBaseUrl()}/events`;
  return events.map((event) => {
    const eventId = String(event.id || "").trim();
    const registrationCounts = registrationCountsByEvent.get(eventId) || {};
    const registrationCount = Number(registrationCounts.registrationCount) || 0;
    const attendedCount = Number(registrationCounts.attendedCount) || 0;
    const speakerIds = new Set();
    const proctorIds = new Set();
    for (const session of sessionsByEvent.get(eventId) || []) {
      for (const id of Array.isArray(session.speakerIds) ? session.speakerIds : []) {
        const normalizedId = String(id || "").trim();
        if (normalizedId) {
          speakerIds.add(normalizedId);
        }
      }
      for (const id of Array.isArray(session.proctorIds) ? session.proctorIds : []) {
        const normalizedId = String(id || "").trim();
        if (normalizedId) {
          proctorIds.add(normalizedId);
        }
      }
    }

    const maxSeats = Number.isInteger(event.maxSeats) ? event.maxSeats : null;
    return {
      ...event,
      computedStatus: event.computedStatus || getEventStatus(event),
      registrationCount,
      attendedCount,
      speakerCount: speakerIds.size,
      proctorCount: proctorIds.size,
      remainingSeats: maxSeats === null ? null : Math.max(maxSeats - registrationCount, 0),
      feedbackCount: Number(feedbackCountsByEvent.get(eventId)) || 0,
      feedbackLink: `${feedbackBaseUrl}/${eventId}/feedback`
    };
  });
}

function splitAssignedAndAvailablePersonas(currentEventId, allAssignments) {
  const byIdentity = new Map();
  for (const item of allAssignments) {
    const key = `${String(item.personaType || "").toLowerCase()}:${String(item.inviteEmail || "").toLowerCase()}`;
    if (!byIdentity.has(key)) {
      byIdentity.set(key, {
        personaType: String(item.personaType || "").toLowerCase(),
        inviteEmail: String(item.inviteEmail || "").toLowerCase(),
        lastAvailableFrom: item.availableFrom,
        lastAvailableTo: item.availableTo,
        assignedEventIds: new Set()
      });
    }

    const entry = byIdentity.get(key);
    entry.assignedEventIds.add(String(item.eventId || ""));
    if (!entry.lastAvailableFrom || new Date(item.availableFrom).getTime() > new Date(entry.lastAvailableFrom).getTime()) {
      entry.lastAvailableFrom = item.availableFrom;
      entry.lastAvailableTo = item.availableTo;
    }
  }

  const assigned = [];
  const available = [];
  for (const item of byIdentity.values()) {
    const normalized = {
      personaType: item.personaType,
      inviteEmail: item.inviteEmail,
      availableFrom: item.lastAvailableFrom,
      availableTo: item.lastAvailableTo
    };

    if (item.assignedEventIds.has(String(currentEventId))) {
      assigned.push(normalized);
    } else {
      available.push(normalized);
    }
  }

  // Proctors are cross-trained and should also surface as reusable speaker options.
  const availableSpeakersByEmail = new Map();
  available
    .filter((item) => item.personaType === "speaker" || item.personaType === "proctor")
    .forEach((item) => {
      if (!availableSpeakersByEmail.has(item.inviteEmail)) {
        availableSpeakersByEmail.set(item.inviteEmail, item);
      }
    });

  return {
    assigned,
    availableSpeakers: [...availableSpeakersByEmail.values()],
    availableProctors: available.filter((item) => item.personaType === "proctor")
  };
}

async function listPublisherAccessibleEvents(publisherSession) {
  const sessionEmail = String(publisherSession?.email || "").toLowerCase();
  const events = await getEventsCached();
  const [collaborations, personaAssignments] = await Promise.all([
    listEventCollaborationsByEmail(sessionEmail),
    listPersonaAssignmentsByEmail(sessionEmail)
  ]);
  const collaborationByEventId = new Map(collaborations.map((item) => [String(item.eventId), item]));
  const teamEventIds = new Set(personaAssignments.map((item) => String(item.eventId)));
  const eventsById = new Map(events.map((item) => [String(item.id), item]));
  const accessibleEventIds = new Set([
    ...events
      .filter((item) =>
        String(item.publisherEmail || "").toLowerCase() === sessionEmail
        || (!isPartnerAccount(publisherSession) && Boolean(item.partnerId))
      )
      .map((item) => String(item.id)),
    ...collaborationByEventId.keys(),
    ...teamEventIds
  ]);

  return [...accessibleEventIds]
    .map((id) => eventsById.get(id))
    .filter(Boolean)
    .map((item) => {
      const isOwner = String(item.publisherEmail || "").toLowerCase() === sessionEmail;
      const collaboration = collaborationByEventId.get(String(item.id));
      const hasTeamAccess = teamEventIds.has(String(item.id));
      const hasAutomaticPartnerAccess = !isPartnerAccount(publisherSession) && Boolean(item.partnerId);
      return {
        ...item,
        computedStatus: getEventStatus(item),
        accessLevel: isOwner || hasAutomaticPartnerAccess || hasTeamAccess
          ? (isOwner ? "owner" : "write")
          : collaboration?.accessLevel || "read",
        isShared: !isOwner
      };
    });
}

async function renderPublisherDashboard(req, res, message = "") {
  const statusFilter = String(req.query.status || "all").toLowerCase();
  const search = String(req.query.search || "").trim().toLowerCase();
  const modeFilter = String(req.query.mode || "").trim().toLowerCase();
  const timeZoneFilter = String(req.query.timeZone || "").trim().toLowerCase();
  const visibilityFilter = String(req.query.visibility || "all").trim().toLowerCase();
  const scopeFilter = String(req.query.scope || "all").toLowerCase();
  const publisherEventsRaw = await listPublisherAccessibleEvents(req.session.publisher);

  const statusCounts = {
    upcoming: publisherEventsRaw.filter((item) => item.computedStatus === "upcoming").length,
    ongoing: publisherEventsRaw.filter((item) => item.computedStatus === "ongoing").length,
    completed: publisherEventsRaw.filter((item) => item.computedStatus === "completed").length,
    canceled: publisherEventsRaw.filter((item) => item.computedStatus === "canceled").length,
    all: publisherEventsRaw.length
  };

  const scopeCounts = {
    all: publisherEventsRaw.length,
    owned: publisherEventsRaw.filter((item) => !item.isShared).length,
    shared: publisherEventsRaw.filter((item) => item.isShared).length
  };

  const timeZones = [...new Set(publisherEventsRaw.map((event) => event.timeZone).filter(Boolean))].sort();

  const publisherEvents = publisherEventsRaw
    .filter((item) => eventMatchesStatus(item, statusFilter))
    .filter((item) => (modeFilter ? String(item.deliveryMode || "").toLowerCase() === modeFilter : true))
    .filter((item) =>
      timeZoneFilter ? String(item.timeZone || "").toLowerCase().includes(timeZoneFilter) : true
    )
    .filter((item) =>
      visibilityFilter === "listed" ? !item.unlisted : visibilityFilter === "unlisted" ? Boolean(item.unlisted) : true
    )
    .filter((item) => (scopeFilter === "owned" ? !item.isShared : scopeFilter === "shared" ? item.isShared : true))
    .filter((item) =>
      search
        ? [String(item.title || ""), String(item.description || ""), String(item.city || ""), String(item.timeZone || "")]
            .join(" ")
            .toLowerCase()
            .includes(search)
        : true
    )
    .sort(compareEventsByScheduleProximity);

  const eventsWithCounts = await buildPublisherDashboardSummaries(publisherEvents, req);
  const partnerUsers = isPartnerAccount(req.session.publisher)
    ? (await listLoginUsers()).filter(
        (user) => user.partnerId === req.session.publisher.partnerId && user.active !== false
      )
    : [];

  return res.render("publisher-dashboard", {
    events: eventsWithCounts,
    message,
    statusFilter,
    visibilityFilter,
    statusCounts,
    scopeFilter,
    scopeCounts,
    partnerUsers,
    filters: {
      search: String(req.query.search || ""),
      mode: modeFilter,
      timeZone: String(req.query.timeZone || "")
    },
    timeZones
  });
}

app.get("/", async (req, res, next) => {
  const attendeeEmail = String(req.query.email || req.query.attendeeEmail || "").trim().toLowerCase();
  const registrationCode = String(req.query.code || req.query.registrationCode || "").trim().toUpperCase();
  if (attendeeEmail || registrationCode) {
    const params = new URLSearchParams({ persona: "registrant" });
    if (attendeeEmail) {
      params.set("email", attendeeEmail);
    }
    if (registrationCode) {
      params.set("code", registrationCode);
    }
    return res.redirect(`/login?${params.toString()}`);
  }

  try {
    const events = await getEventsCached();
    const statusFilter = String(req.query.status || "upcoming").trim().toLowerCase();
    const publicEventQuery = {
      ...req.query,
      status: statusFilter
    };
    const visibleEvents = events
      .map((event) => ({
        ...event,
        displayTitle: getPartnerEventTitle(event),
        computedStatus: getEventStatus(event)
      }))
      .filter((event) =>
        event.computedStatus !== "canceled"
        && !event.unlisted
        && getPublicationStatus(event) === "approved"
      );

    const filtered = applySort(applyFilters(visibleEvents, publicEventQuery), req.query.sort || "schedule-nearest");
    const timeZones = [...new Set(events.map((event) => event.timeZone).filter(Boolean))].sort();
    const statusCounts = {
      upcoming: visibleEvents.filter((event) => event.computedStatus === "upcoming").length,
      ongoing: visibleEvents.filter((event) => event.computedStatus === "ongoing").length,
      completed: visibleEvents.filter((event) => event.computedStatus === "completed").length,
      all: visibleEvents.length
    };

    res.render("home", {
      events: filtered,
      filters: {
        search: req.query.search || "",
        date: req.query.date || "",
        location: req.query.location || "",
        mode: req.query.mode || "",
        timeZone: req.query.timeZone || "",
        status: statusFilter,
        sort: req.query.sort || "schedule-nearest"
      },
      timeZones,
      statusCounts,
      status: req.query.notice || ""
    });
  } catch (error) {
    const errorCode = Number(error?.code || 0);
    const errorText = String(error?.body?.message || error?.message || "").toLowerCase();
    const isCosmosAccessIssue = errorCode === 403 || errorText.includes("cosmos") || errorText.includes("forbidden");

    if (isCosmosAccessIssue) {
      return res.status(200).render("home", {
        events: [],
        filters: {
          search: req.query.search || "",
          date: req.query.date || "",
          location: req.query.location || "",
          mode: req.query.mode || "",
          timeZone: req.query.timeZone || "",
          status: String(req.query.status || "upcoming").trim().toLowerCase(),
          sort: req.query.sort || "schedule-nearest"
        },
        timeZones: TIMEZONES,
        statusCounts: {
          upcoming: 0,
          ongoing: 0,
          completed: 0,
          all: 0
        },
        status: "Data service temporarily unavailable. Please try again shortly."
      });
    }

    next(error);
  }
});

app.get("/partners/apply", (req, res) => {
  return res.render("partner-apply", {
    error: "",
    formData: {},
    countries: PARTNER_COUNTRIES,
    agreementVersion: PARTNER_AGREEMENT_VERSION,
    agreementSections: PARTNER_AGREEMENT_SECTIONS,
    generatedAt: new Date()
  });
});

app.post("/partners/apply", upload.single("partnerLogo"), async (req, res, next) => {
  const formData = {
    partnerName: String(req.body.partnerName || "").trim(),
    partnerAddress: String(req.body.partnerAddress || "").trim(),
    partnerCountry: String(req.body.partnerCountry || "").trim(),
    websiteUrl: String(req.body.websiteUrl || "").trim(),
    privacyPolicyUrl: String(req.body.privacyPolicyUrl || "").trim(),
    mpnId: String(req.body.mpnId || "").trim(),
    submitterName: String(req.body.submitterName || "").trim(),
    submitterEmail: String(req.body.submitterEmail || "").trim().toLowerCase(),
    signingAuthorityName: String(req.body.signingAuthorityName || "").trim(),
    signingAuthorityEmail: String(req.body.signingAuthorityEmail || "").trim().toLowerCase(),
    signAgreementNow: req.body.signAgreementNow === "true",
    agreementReviewed: req.body.agreementReviewed === "true"
  };
  const renderError = (error) => res.status(400).render("partner-apply", {
    error,
    formData,
    countries: PARTNER_COUNTRIES,
    agreementVersion: PARTNER_AGREEMENT_VERSION,
    agreementSections: PARTNER_AGREEMENT_SECTIONS,
    generatedAt: new Date()
  });

  try {
    const requiredApplicationFields = [
      formData.partnerName,
      formData.partnerAddress,
      formData.partnerCountry,
      formData.websiteUrl,
      formData.privacyPolicyUrl,
      formData.mpnId,
      formData.submitterName,
      formData.submitterEmail,
      formData.signingAuthorityName,
      formData.signingAuthorityEmail
    ];
    if (requiredApplicationFields.some((value) => !value) || !req.file) {
      return renderError("Complete all fields and provide a partner logo.");
    }
    if (!PARTNER_COUNTRIES.includes(formData.partnerCountry)) {
      return renderError("Select a valid partner country.");
    }
    if (!isValidEmailAddress(formData.submitterEmail)) {
      return renderError("Enter a valid submitter email address.");
    }
    if (!isValidEmailAddress(formData.signingAuthorityEmail)) {
      return renderError("Enter a valid signing authority email address.");
    }
    if (
      formData.signingAuthorityEmail !== formData.submitterEmail
      || formData.signingAuthorityName.toLowerCase() !== formData.submitterName.toLowerCase()
    ) {
      return renderError("The submitter must be the primary publisher and signing authority.");
    }
    if (!formData.agreementReviewed || !formData.signAgreementNow) {
      return renderError("Review the complete EventIQ Partner Agreement, then digitally sign it to submit the application.");
    }
    if (await getLoginUserByEmailAndType(formData.submitterEmail, "publisher")) {
      return renderError("A publisher account already exists for this email address.");
    }
    if (!isSafeHttpsUrl(formData.websiteUrl) || !isSafeHttpsUrl(formData.privacyPolicyUrl)) {
      return renderError("Partner website and privacy policy must use valid HTTPS URLs.");
    }
    if (req.file.size > 512 * 1024) {
      return renderError("Partner logo must be 512 KB or smaller.");
    }

    const logoContentType = getPartnerLogoContentType(req.file.buffer);
    if (!logoContentType) {
      return renderError("Partner logo must be a valid PNG or JPEG image.");
    }

    const reserved = await reservePartnerUniqueness(formData.partnerName, formData.mpnId);
    if (!reserved) {
      return renderError("A partner application already exists with this partner name or MPN ID.");
    }

    let partner;
    try {
      partner = await createPartnerApplication({
        ...formData,
        logoContentType,
        logoBase64: req.file.buffer.toString("base64"),
        agreementVersion: PARTNER_AGREEMENT_VERSION,
        agreementSignedAt: new Date().toISOString(),
        agreementSignerName: formData.signingAuthorityName,
        agreementSignerEmail: formData.signingAuthorityEmail,
        agreementTermsUrl: `${getPublicBaseUrl()}/partners/agreement`,
        agreementSnapshot: getPartnerAgreementText(formData.partnerName)
      });
    } catch (error) {
      await releasePartnerUniqueness(formData.partnerName, formData.mpnId);
      throw error;
    }

    const supervisors = (await listLoginUsers()).filter(
      (user) => user.active !== false && hasLoginRole(user, "supervisor")
    );
    const notificationResults = await Promise.allSettled(supervisors.map((supervisorUser) =>
      sendPlainNotification({
        to: supervisorUser.email,
        subject: `Partner application pending: ${partner.partnerName}`,
        text: `${partner.submitterName} (${partner.submitterEmail}) submitted partner ${partner.partnerName}, MPN ID ${partner.mpnId}, for approval.`
      })
    ));
    notificationResults.forEach((result) => {
      if (result.status === "rejected") {
        console.error("Partner application supervisor notification failed", result.reason);
      }
    });

    return res.render("partner-application-success", { partner });
  } catch (error) {
    next(error);
  }
});

app.get("/partners/agreement", async (req, res, next) => {
  try {
    const partner = req.session.publisher?.partnerId
      ? await getPartnerById(req.session.publisher.partnerId)
      : null;
    return res.render("partner-agreement", {
      agreementSections: PARTNER_AGREEMENT_SECTIONS,
      agreementVersion: PARTNER_AGREEMENT_VERSION,
      generatedAt: new Date(),
      partner,
      required: req.query.required === "1",
      canSign: Boolean(
        partner
        && req.session.publisher?.isPartnerPrimaryPublisher
        && !hasCurrentPartnerAgreement(partner)
      ),
      signed: hasCurrentPartnerAgreement(partner),
      error: "",
      downloadedCopy: false
    });
  } catch (error) {
    next(error);
  }
});

app.post("/partners/agreement/sign", requirePublisher, async (req, res, next) => {
  try {
    if (!isPartnerAccount(req.session.publisher)) {
      return res.status(403).send("Only partner publishers can sign this agreement.");
    }
    const partner = await getPartnerById(req.session.publisher.partnerId);
    if (!partner) {
      return res.status(404).send("Partner profile not found.");
    }
    const signerName = String(req.body.signerName || "").trim();
    const signerEmail = String(req.body.signerEmail || "").trim().toLowerCase();
    const authorityName = String(partner.signingAuthorityName || partner.submitterName || "").trim();
    const authorityEmail = String(partner.signingAuthorityEmail || partner.submitterEmail || "").trim().toLowerCase();
    const accepted = req.body.acceptAgreement === "true";
    const renderError = (error) => res.status(400).render("partner-agreement", {
      agreementSections: PARTNER_AGREEMENT_SECTIONS,
      agreementVersion: PARTNER_AGREEMENT_VERSION,
      generatedAt: new Date(),
      partner,
      required: true,
      canSign: true,
      signed: false,
      error,
      downloadedCopy: false
    });

    if (
      !req.session.publisher.isPartnerPrimaryPublisher
      || signerEmail !== authorityEmail
      || signerName.toLowerCase() !== authorityName.toLowerCase()
    ) {
      return renderError("The agreement must be signed by the primary publisher named in the partner application.");
    }
    if (!accepted) {
      return renderError("Confirm that you have authority and agree to the EventIQ Program Terms and Conditions.");
    }

    const signedPartner = await signPartnerAgreement(partner, {
      agreementVersion: PARTNER_AGREEMENT_VERSION,
      signerName,
      signerEmail,
      termsUrl: `${getPublicBaseUrl()}/partners/agreement`,
      agreementSnapshot: getPartnerAgreementText(partner.partnerName)
    });
    req.session.publisher.partnerAgreementSigned = true;
    return req.session.save(() =>
      res.redirect(`/partners/agreement?signed=1&at=${encodeURIComponent(signedPartner.agreementSignedAt)}`)
    );
  } catch (error) {
    next(error);
  }
});

app.get("/partners/agreement/sample.pdf", (req, res, next) => {
  try {
    const requestedPartnerName = String(req.query.partnerName || "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    const partnerName = requestedPartnerName || "Sample Partner Organization";
    const safePartnerName = partnerName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "Sample-Partner";
    const generatedAt = new Date().toISOString();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="EventIQ-Partner-Agreement-Sample-${safePartnerName}.pdf"`
    );

    createPartnerAgreementPdf(res, {
      title: "EventIQ Partner Agreement - Unsigned Sample",
      signed: false,
      agreementVersion: PARTNER_AGREEMENT_VERSION,
      generatedAt: `${generatedAt} UTC`,
      termsUrl: `${getPublicBaseUrl()}/partners/agreement`,
      partnerName,
      agreementText: getPartnerAgreementText(partnerName),
      onError: next
    });
    return undefined;
  } catch (error) {
    next(error);
  }
});

app.get("/partners/agreement/download", requirePublisher, async (req, res, next) => {
  try {
    if (!isPartnerAccount(req.session.publisher)) {
      return res.status(403).send("Only partner publishers can download a signed agreement.");
    }
    const partner = await getPartnerById(req.session.publisher.partnerId);
    if (!partner || !hasCurrentPartnerAgreement(partner)) {
      return res.redirect("/partners/agreement?required=1");
    }
    const safePartnerName = String(partner.partnerName || "Partner").replace(/[^a-z0-9]+/gi, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="EventIQ-Partner-Agreement-${safePartnerName}.pdf"`
    );

    createPartnerAgreementPdf(res, {
      title: "EventIQ Program Terms and Conditions",
      signed: true,
      agreementVersion: partner.agreementVersion,
      generatedAt: `${partner.agreementSignedAt} UTC`,
      termsUrl: partner.agreementTermsUrl,
      partnerName: partner.partnerName,
      signerName: partner.agreementSignerName,
      signerEmail: partner.agreementSignerEmail,
      agreementText: personalizePartnerAgreementText(
        partner.agreementSnapshot || getPartnerAgreementText(),
        partner.partnerName
      ),
      onError: next
    });
    return undefined;
  } catch (error) {
    next(error);
  }
});

app.get("/partners/:id/logo", async (req, res, next) => {
  try {
    const partner = await getPartnerById(req.params.id);
    if (
      (String(partner?.status || "").toLowerCase() !== "approved" && !req.session.supervisor)
      || !partner.logoBase64
      || !["image/png", "image/jpeg"].includes(partner.logoContentType)
    ) {
      return res.status(404).send("Partner logo not found.");
    }
    res.setHeader("Content-Type", partner.logoContentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(Buffer.from(partner.logoBase64, "base64"));
  } catch (error) {
    next(error);
  }
});

app.get("/admin/bootstrap/status", requireBootstrapToken, async (req, res, next) => {
  try {
    const containerHealth = await getContainerHealth();
    const loginUsers = await listLoginUsers();

    return res.json({
      ok: containerHealth.every((item) => item.exists),
      containerHealth,
      loginUsers: {
        total: loginUsers.length,
        publishers: loginUsers.filter((item) => hasLoginRole(item, "publisher")).length,
        supervisors: loginUsers.filter((item) => hasLoginRole(item, "supervisor")).length
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/admin/bootstrap/seed-logins", requireBootstrapToken, async (req, res, next) => {
  try {
    const publishers = Array.isArray(req.body.publishers) ? req.body.publishers : [];
    const supervisors = Array.isArray(req.body.supervisors) ? req.body.supervisors : [];
    const loginRecords = [
      ...publishers.map((item) => ({ ...item, userType: "publisher" })),
      ...supervisors.map((item) => ({ ...item, userType: "supervisor" }))
    ];
    const upserts = [];

    if (!loginRecords.length) {
      return res.status(400).json({
        error: "No login records provided. Submit publishers and/or supervisors arrays."
      });
    }

    for (const item of loginRecords) {
      const email = String(item.email || "").trim().toLowerCase();
      const password = String(item.password || "");
      const passwordError = getPasswordValidationError(password);
      if (!isValidEmailAddress(email) || !String(item.name || "").trim() || passwordError) {
        return res.status(400).json({
          error: `Invalid ${item.userType} login record${passwordError ? `: ${passwordError}` : "."}`
        });
      }
      upserts.push(
        upsertLoginUser({
          id: item.id,
          userType: item.userType,
          email,
          name: item.name,
          password: "",
          passwordHash: hashPassword(password),
          active: item.active !== false
        })
      );
    }

    authConfigCache = { expiresAt: 0, value: null };
    const saved = await Promise.all(upserts);
    return res.json({
      message: "Login metadata records upserted.",
      count: saved.length
    });
  } catch (error) {
    next(error);
  }
});

app.post("/admin/notifications/run", requireBootstrapToken, async (req, res, next) => {
  try {
    const dryRun = req.body.dryRun !== undefined ? parseBoolean(req.body.dryRun) : true;
    const now = new Date();
    const nowMs = now.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const events = await getEventsCached();

    const summary = {
      dryRun,
      notificationChannelConfigured: canSendNotifications(),
      inWindowCalendarBlocks: 0,
      credentialReminders: 0,
      postEventFeedbacks: 0,
      sent: 0,
      skipped: 0,
      errors: []
    };

    for (const event of events) {
      if (getEventStatus(event, now) === "canceled") {
        continue;
      }

      const registrations = await listRegistrationsByEvent(event.id);
      for (const registration of registrations) {
        const startAtMs = new Date(event.startAt).getTime();
        const endAtMs = new Date(event.endAt).getTime();

        const inWindow = nowMs >= startAtMs && nowMs <= endAtMs;
        const beforeStart = startAtMs > nowMs && startAtMs - nowMs <= oneDayMs;
        const afterEnd = nowMs > endAtMs && nowMs - endAtMs <= oneDayMs;

        if (inWindow) {
          summary.inWindowCalendarBlocks += 1;
          if (!dryRun) {
            const result = await sendLabReminderEmail({
              baseUrl: getPublicBaseUrl(),
              event,
              registration
            });
            if (result.skipped) {
              summary.skipped += 1;
            } else {
              summary.sent += 1;
            }
          }
        }

        if (beforeStart) {
          summary.credentialReminders += 1;
          if (!dryRun) {
            const result = await sendLabReminderEmail({
              baseUrl: getPublicBaseUrl(),
              event,
              registration
            });
            if (result.skipped) {
              summary.skipped += 1;
            } else {
              summary.sent += 1;
            }
          }
        }

        if (afterEnd) {
          summary.postEventFeedbacks += 1;
          if (!dryRun) {
            const followUpTemplate = await getFollowUpTemplateByEvent(event.id);
            const result = await sendPostEventFeedbackEmail({
              baseUrl: getPublicBaseUrl(),
              event,
              registration,
              followUpTemplate
            });
            if (result.skipped) {
              summary.skipped += 1;
            } else {
              summary.sent += 1;
            }
          }
        }
      }
    }

    return res.json(summary);
  } catch (error) {
    next(error);
  }
});

app.post("/admin/notifications/test", requireBootstrapToken, async (req, res, next) => {
  try {
    const to = String(req.body.to || "").trim();
    const subject = String(req.body.subject || "Lab Automation test notification").trim();
    const text = String(
      req.body.text ||
        "This is a test notification from Lab Automation. If you received this, Power Automate or SMTP transport is configured correctly."
    ).trim();

    if (!to) {
      return res.status(400).json({ error: "Provide recipient email in body field 'to'." });
    }

    const result = await sendPlainNotification({ to, subject, text });
    return res.json({ ok: true, result });
  } catch (error) {
    next(error);
  }
});

app.get("/admin/compliance/checklist", requireBootstrapToken, async (req, res) => {
  return res.render("admin-compliance-checklist", {
    defaults: {
      invitationMethod: String(req.query.invitationMethod || ""),
      consentSource: String(req.query.consentSource || ""),
      toolName: String(req.query.toolName || "Microsoft Forms"),
      surveyLink: String(req.query.surveyLink || ""),
      privacyLink: String(req.query.privacyLink || "http://go.microsoft.com/fwlink/?LinkId=521839"),
      piiInventory: String(req.query.piiInventory || "name,email,company,country,jobRole,feedback"),
      dsrPlan: String(req.query.dsrPlan || "Use /admin/data-subject/delete endpoint for lookup + delete."),
      senderInfo: String(req.query.senderInfo || "Lab Automation Service")
    }
  });
});

app.post("/admin/data-retention/purge", requireBootstrapToken, async (req, res, next) => {
  try {
    const retentionDays = Number.parseInt(req.body.retentionDays, 10);
    const dryRun = req.body.dryRun !== undefined ? parseBoolean(req.body.dryRun) : true;

    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
      return res.status(400).json({ error: "retentionDays must be a positive integer." });
    }

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const cutoffIso = cutoff.toISOString();

    const registrations = await purgeRegistrationsOlderThan(cutoffIso, dryRun);
    const feedback = await purgeFeedbackOlderThan(cutoffIso, dryRun);

    return res.json({
      ok: true,
      dryRun,
      retentionDays,
      cutoffIso,
      registrations,
      feedback
    });
  } catch (error) {
    next(error);
  }
});

app.post("/admin/data-subject/delete", requireBootstrapToken, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const dryRun = req.body.dryRun !== undefined ? parseBoolean(req.body.dryRun) : true;

    if (!email) {
      return res.status(400).json({ error: "Provide email in body field 'email'." });
    }

    const result = await deleteSubjectDataByEmail(email, dryRun);
    return res.json({
      ok: true,
      dryRun,
      email,
      result
    });
  } catch (error) {
    next(error);
  }
});

app.get("/login", (req, res) => {
  return res.render("login", {
    error: String(req.query.error || ""),
    persona: String(req.query.persona || "registrant").toLowerCase(),
    attendeeEmail: String(req.query.email || req.query.attendeeEmail || "").trim().toLowerCase(),
    registrationCode: String(req.query.code || req.query.registrationCode || "").trim().toUpperCase()
  });
});

app.post("/login", async (req, res, next) => {
  try {
    const persona = String(req.body.persona || "").trim().toLowerCase();
    return handlePersonaLogin(req, res, persona);
  } catch (error) {
    next(error);
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

async function getPasswordAccountSession(req) {
  const sessionKey = ["publisher", "supervisor", "facilitator"]
    .find((key) => req.session[key]);
  if (!sessionKey) {
    return null;
  }
  const sessionUser = req.session[sessionKey];
  const userTypes = sessionKey !== "facilitator"
    ? [sessionKey]
    : sessionUser.persona === "facilitator"
      ? ["speaker", "proctor"].includes(sessionUser.accountUserType)
        ? [sessionUser.accountUserType]
        : ["speaker", "proctor"]
      : [sessionUser.persona];
  const accounts = await Promise.all(userTypes.map(
    (userType) => getLoginUserByEmailAndType(sessionUser.email, userType)
  ));
  return {
    sessionKey,
    sessionUser,
    account: accounts.find((account) => account && account.active !== false) || accounts.find(Boolean) || null
  };
}

app.get("/account/profile", async (req, res, next) => {
  try {
    const accountContext = await getPasswordAccountSession(req);
    if (accountContext) {
      const { account } = accountContext;
      if (!account) {
        return res.status(404).send("Account not found.");
      }
      return res.render("account-profile", {
        account,
        registrantProfile: null,
        message: String(req.query.message || ""),
        error: String(req.query.error || "")
      });
    }

    if (req.session.registrant) {
      const registrations = await listRegistrationsByEmail(req.session.registrant.attendeeEmail);
      const registration = registrations.find(
        (item) => String(item.status || "registered").toLowerCase() === "registered"
      );
      if (!registration) {
        return res.status(404).send("Approved registration not found.");
      }
      return res.render("account-profile", {
        account: null,
        registrantProfile: registration,
        message: String(req.query.message || ""),
        error: String(req.query.error || "")
      });
    }

    return res.redirect("/login");
  } catch (error) {
    next(error);
  }
});

app.post("/account/profile/name", async (req, res, next) => {
  try {
    const accountContext = await getPasswordAccountSession(req);
    if (accountContext) {
      const name = String(req.body.name || "").trim();
      if (!name) {
        return res.redirect("/account/profile?error=Name%20is%20required");
      }
      const { account } = accountContext;
      if (!account) {
        return res.status(404).send("Account not found.");
      }
      await upsertLoginUser({ ...account, name });
      req.session[accountContext.sessionKey].name = name;
      return req.session.save(() =>
        res.redirect("/account/profile?message=Name%20updated")
      );
    }

    if (!req.session.registrant) {
      return res.redirect("/login");
    }
    const nameParts = {
      salutation: String(req.body.salutation || "").trim(),
      firstName: String(req.body.firstName || "").trim(),
      middleName: String(req.body.middleName || "").trim(),
      lastName: String(req.body.lastName || "").trim()
    };
    if (!nameParts.firstName || !nameParts.lastName) {
      return res.redirect("/account/profile?error=First%20and%20last%20name%20are%20required");
    }
    const registrations = await listRegistrationsByEmail(req.session.registrant.attendeeEmail);
    const approvedRegistrations = registrations.filter(
      (item) => String(item.status || "registered").toLowerCase() === "registered"
    );
    const updatedRegistrations = await Promise.all(
      approvedRegistrations.map((registration) => updateRegistrationName(registration, nameParts))
    );
    req.session.registrant.attendeeName = updatedRegistrations[0]?.attendeeName
      || [nameParts.salutation, nameParts.firstName, nameParts.middleName, nameParts.lastName].filter(Boolean).join(" ");
    return req.session.save(() =>
      res.redirect("/account/profile?message=Name%20updated")
    );
  } catch (error) {
    next(error);
  }
});

app.post("/account/profile/password", async (req, res, next) => {
  try {
    const accountContext = await getPasswordAccountSession(req);
    if (!accountContext) {
      return res.status(403).send("This persona does not use a password.");
    }
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    const confirmPassword = String(req.body.confirmPassword || "");
    const { account } = accountContext;
    if (!account) {
      return res.status(404).send("Account not found.");
    }
    if (!verifyPassword(account.passwordHash || account.password, currentPassword)) {
      return res.redirect("/account/profile?error=Current%20password%20is%20incorrect");
    }
    if (newPassword !== confirmPassword) {
      return res.redirect("/account/profile?error=New%20password%20confirmation%20does%20not%20match");
    }
    const passwordError = getPasswordValidationError(newPassword);
    if (passwordError) {
      return res.redirect(`/account/profile?error=${encodeURIComponent(passwordError)}`);
    }

    await upsertLoginUser({
      ...account,
      password: "",
      passwordHash: hashPassword(newPassword)
    });
    return res.redirect("/account/profile?message=Password%20updated");
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/login", (req, res) => {
  return res.redirect("/login?persona=publisher");
});

app.post("/publisher/login", async (req, res, next) => {
  try {
    return handlePersonaLogin(req, res, "publisher");
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/logout", (req, res) => {
  return res.redirect(307, "/logout");
});

app.get("/supervisor/login", (req, res) => {
  return res.redirect("/login?persona=supervisor");
});

app.post("/supervisor/login", async (req, res, next) => {
  try {
    return handlePersonaLogin(req, res, "supervisor");
  } catch (error) {
    next(error);
  }
});

app.post("/supervisor/logout", (req, res) => {
  return res.redirect(307, "/logout");
});

app.get("/supervisor", requireSupervisor, async (req, res, next) => {
  try {
    const events = await getEventsCached();
    const selectedTimeZone = String(req.query.timeZone || "");
    const filteredEvents = selectedTimeZone
      ? events.filter((event) => String(event.timeZone || "") === selectedTimeZone)
      : events;

    const eventsWithCounts = await Promise.all(
      filteredEvents.map(async (event) => {
        const registrations = await listRegistrationsByEvent(event.id);
        return {
          ...event,
          registrationCount: registrations.length,
          attendedCount: registrations.filter((item) => item.attended).length,
          computedStatus: getEventStatus(event)
        };
      })
    );

    const publisherSummaryMap = new Map();
    for (const event of eventsWithCounts) {
      const key = event.publisherEmail;
      if (!publisherSummaryMap.has(key)) {
        publisherSummaryMap.set(key, {
          publisherEmail: key,
          eventCount: 0,
          registrationCount: 0,
          attendedCount: 0
        });
      }

      const summary = publisherSummaryMap.get(key);
      summary.eventCount += 1;
      summary.registrationCount += event.registrationCount;
      summary.attendedCount += event.attendedCount;
    }

    const publisherSummaries = [...publisherSummaryMap.values()].sort((a, b) =>
      a.publisherEmail.localeCompare(b.publisherEmail)
    );

    const [publishers, labProvisioningBatches, loginUsers, partnerApplications, auditEntries] = await Promise.all([
      listPublishers(),
      listLabProvisioningBatches(),
      listLoginUsers(),
      listPartnerApplications(),
      listApplicationAuditEntries()
    ]);
    const allAccounts = loginUsers.sort((a, b) =>
      String(a.email || "").localeCompare(String(b.email || ""))
    );
    const timeZones = [...new Set(events.map((event) => event.timeZone).filter(Boolean))].sort();
    const requestedEventIds = parseSelectedEventIds(req.query.selectedEventIds);
    const selectedEventIds = requestedEventIds.length ? requestedEventIds : eventsWithCounts.map((event) => String(event.id));
    const selectedEvents = eventsWithCounts.filter((event) => selectedEventIds.includes(String(event.id)));
    const selectedRegistrations = (await Promise.all(selectedEvents.map((event) => listAllRegistrationsByEvent(event.id)))).flat();
    const organizationKeys = [...new Set(selectedRegistrations.map((item) => normalizeOrganizationKey(item.organization || item.companyName || "Unknown")))];
    const customerReport = buildCustomerReport(selectedEvents, selectedRegistrations, await listCustomerProfilesByOrganizationKeys(organizationKeys));

    return res.render("supervisor-dashboard", {
      events: applySort(eventsWithCounts, "schedule-nearest"),
      publisherSummaries,
      publishers,
      allAccounts,
      partnerApplications,
      labProvisioningBatches,
      auditEntries,
      filters: {
        timeZone: selectedTimeZone
      },
      timeZones,
      selectedEventIds,
      customerReport,
      message: String(req.query.message || "")
    });
  } catch (error) {
    next(error);
  }
});

function toCsvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

app.get("/supervisor/audit.csv", requireSupervisor, async (req, res, next) => {
  try {
    const entries = await listApplicationAuditEntries(2000);
    const lines = [
      ["Timestamp", "Actor", "Role", "Method", "Path", "Status", "Event ID"].map(toCsvCell).join(","),
      ...entries.map((entry) => [
        entry.timestamp,
        entry.actorEmail || entry.actorName || "automation",
        entry.actorRole,
        entry.method,
        entry.path,
        entry.statusCode,
        entry.eventId
      ].map(toCsvCell).join(","))
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="application-audit.csv"');
    return res.send(`\uFEFF${lines.join("\r\n")}`);
  } catch (error) {
    next(error);
  }
});

app.get("/supervisor/customers.xlsx", requireSupervisor, async (req, res, next) => {
  try {
    const events = await getEventsCached();
    const selectedEventIds = parseSelectedEventIds(req.query.selectedEventIds);
    const selectedEvents = events.filter((event) => selectedEventIds.includes(String(event.id)));
    if (!selectedEventIds.length || selectedEvents.length !== selectedEventIds.length) return res.status(400).send("Select one or more valid sessions.");
    const registrations = (await Promise.all(selectedEvents.map((event) => listAllRegistrationsByEvent(event.id)))).flat();
    const organizationKeys = [...new Set(registrations.map((item) => normalizeOrganizationKey(item.organization || item.companyName || "Unknown")))];
    const workbook = buildCustomerWorkbook(buildCustomerReport(selectedEvents, registrations, await listCustomerProfilesByOrganizationKeys(organizationKeys)).rows);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=consolidated-customer-list.xlsx");
    return res.send(workbook);
  } catch (error) {
    next(error);
  }
});

app.post("/supervisor/customers/import", requireSupervisor, upload.single("customerFile"), async (req, res, next) => {
  try {
    const selectedEventIds = parseSelectedEventIds(req.body.selectedEventIds);
    const selectionQuery = selectedEventIds.map((id) => `selectedEventIds=${encodeURIComponent(id)}`).join("&");
    if (!req.file || !selectedEventIds.length) return res.redirect(`/supervisor?${selectionQuery}&message=${encodeURIComponent("Select sessions and upload a customer workbook.")}`);
    const events = await getEventsCached();
    if (events.filter((event) => selectedEventIds.includes(String(event.id))).length !== selectedEventIds.length) return res.redirect(`/supervisor?${selectionQuery}&message=${encodeURIComponent("One or more selected sessions are invalid.")}`);
    const rows = parseCustomerEnrichmentWorkbook(req.file.buffer).filter((row) => String(row.organization || "").trim());
    await Promise.all(rows.map((row) => upsertCustomerProfile({ organizationKey: normalizeOrganizationKey(row.organization), organization: canonicalOrganizationLabel(row.organization), segment: row.segment, region: row.region, totalAcrUsdLast6Months: parseCustomerNumber(row.totalAcrUsdLast6Months), cosmosDbAcrUsdLast6Months: parseCustomerNumber(row.cosmosDbAcrUsdLast6Months), cosmosDbAcrUsdLastMonth: parseCustomerNumber(row.cosmosDbAcrUsdLastMonth), cosmosDbAcrGrowthPercent: parseCustomerNumber(row.cosmosDbAcrGrowthPercent), updatedBy: req.session.supervisor.email })));
    return res.redirect(`/supervisor?${selectionQuery}&message=${encodeURIComponent(`Imported ${rows.length} customer profile${rows.length === 1 ? "" : "s"}.`)}`);
  } catch (error) {
    next(error);
  }
});

app.post("/supervisor/publishers", requireSupervisor, async (req, res, next) => {
  try {
    const userType = String(req.body.userType || "publisher").trim().toLowerCase();
    const email = String(req.body.email || "").trim().toLowerCase();
    const name = String(req.body.name || "").trim();
    const password = String(req.body.password || "").trim();

    if (!["publisher", "speaker", "proctor"].includes(userType)) {
      return res.redirect("/supervisor?message=Select%20a%20valid%20account%20type");
    }

    if (userType === "publisher" && !isMicrosoftEmail(email)) {
      return res.redirect("/supervisor?message=Publisher%20email%20must%20be%20a%20microsoft.com%20account");
    }

    if (!email) {
      return res.redirect("/supervisor?message=Email%20is%20required");
    }

    if (!name) {
      return res.redirect(`/supervisor?message=${encodeURIComponent(`${userType} name is required`)}`);
    }

    if (!password) {
      return res.redirect(`/supervisor?message=${encodeURIComponent(`${userType} password is required`)}`);
    }
    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      return res.redirect(`/supervisor?message=${encodeURIComponent(passwordError)}`);
    }

    await upsertLoginUser({
      userType,
      email,
      name,
      password: "",
      passwordHash: hashPassword(password),
      accountClass: "internal",
      active: true
    });
    authConfigCache = { expiresAt: 0, value: null };
    req.session.touch();

    return req.session.save(() =>
      res.redirect(`/supervisor?message=${encodeURIComponent(`${userType} account created successfully`)}`)
    );
  } catch (error) {
    next(error);
  }
});

app.post("/supervisor/accounts/:id/update", requireSupervisor, async (req, res, next) => {
  try {
    const existing = await getLoginUserById(req.params.id);
    if (!existing) {
      return res.status(404).send("Account not found");
    }

    const name = String(req.body.name || "").trim();
    const password = String(req.body.password || "").trim();
    const active = req.body.active === "true";
    const passwordError = password ? getPasswordValidationError(password) : "";
    if (passwordError) {
      return res.redirect(`/supervisor?message=${encodeURIComponent(passwordError)}`);
    }

    await upsertLoginUser({
      id: existing.id,
      userType: existing.userType,
      email: existing.email,
      name: name || existing.name,
      password: password ? "" : existing.password,
      passwordHash: password ? hashPassword(password) : existing.passwordHash,
      accountClass: existing.accountClass,
      partnerId: existing.partnerId,
      partnerName: existing.partnerName,
      active
    });
    authConfigCache = { expiresAt: 0, value: null };

    return res.redirect("/supervisor?message=Account%20updated%20successfully");
  } catch (error) {
    next(error);
  }
});

app.post("/supervisor/partners/:id/approve", requireSupervisor, async (req, res, next) => {
  try {
    const partner = await getPartnerById(req.params.id);
    if (!partner) {
      return res.status(404).send("Partner application not found.");
    }
    if (String(partner.status || "").toLowerCase() !== "pending") {
      return res.redirect("/supervisor#partners");
    }
    if (await getLoginUserByEmailAndType(partner.submitterEmail, "publisher")) {
      return res.redirect(
        "/supervisor?message=A%20publisher%20account%20already%20exists%20for%20this%20email#partners"
      );
    }

    const password = String(req.body.password || "");
    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      return res.redirect(`/supervisor?message=${encodeURIComponent(passwordError)}#partners`);
    }

    await upsertLoginUser({
      userType: "publisher",
      email: partner.submitterEmail,
      name: partner.submitterName,
      password: "",
      passwordHash: hashPassword(password),
      accountClass: "partner",
      partnerId: partner.id,
      partnerName: partner.partnerName,
      active: true
    });
    await setPartnerApplicationDecision(partner, "approved", req.session.supervisor.email);
    authConfigCache = { expiresAt: 0, value: null };

    try {
      await sendPlainNotification({
        to: partner.submitterEmail,
        subject: `Partner application approved: ${partner.partnerName}`,
        text: `Your partner application has been approved. Sign in as a publisher with your email address and the temporary password provided separately by the supervisor.`
      });
    } catch (notificationError) {
      console.error("Partner approval notification failed", notificationError);
    }

    return res.redirect("/supervisor?message=Partner%20application%20approved#partners");
  } catch (error) {
    next(error);
  }
});

app.post("/supervisor/partners/:id/reject", requireSupervisor, async (req, res, next) => {
  try {
    const partner = await getPartnerById(req.params.id);
    if (!partner) {
      return res.status(404).send("Partner application not found.");
    }
    if (String(partner.status || "").toLowerCase() !== "pending") {
      return res.redirect("/supervisor#partners");
    }

    const reason = String(req.body.reason || "").trim();
    if (!reason) {
      return res.redirect("/supervisor?message=Rejection%20reason%20is%20required#partners");
    }

    await setPartnerApplicationDecision(partner, "rejected", req.session.supervisor.email, reason);
    try {
      await sendPlainNotification({
        to: partner.submitterEmail,
        subject: `Partner application update: ${partner.partnerName}`,
        text: `Your partner application was not approved. Reason: ${reason}`
      });
    } catch (notificationError) {
      console.error("Partner rejection notification failed", notificationError);
    }

    return res.redirect("/supervisor?message=Partner%20application%20rejected#partners");
  } catch (error) {
    next(error);
  }
});

app.post("/supervisor/partners/:id/submitter-email", requireSupervisor, async (req, res, next) => {
  try {
    const partner = await getPartnerById(req.params.id);
    if (!partner) {
      return res.status(404).send("Partner application not found.");
    }
    const submitterEmail = normalizeEmail(req.body.submitterEmail);
    if (!isValidEmailAddress(submitterEmail)) {
      return res.redirect("/supervisor?notification=error&message=Enter%20a%20valid%20submitter%20email%20address#partners");
    }
    if (normalizeEmail(req.body.expectedSubmitterEmail) !== normalizeEmail(partner.submitterEmail)) {
      return res.redirect("/supervisor?notification=error&message=The%20submitter%20email%20has%20changed.%20Reload%20and%20try%20again#partners");
    }
    if (submitterEmail === normalizeEmail(partner.submitterEmail)) {
      return res.redirect("/supervisor?message=Submitter%20email%20is%20unchanged#partners");
    }

    await updatePartnerSubmitterEmail(partner, submitterEmail, req.session.supervisor.email);
    authConfigCache = { expiresAt: 0, value: null };
    clearEventCaches();
    return res.redirect("/supervisor?message=Submitter%20email%20updated.%20Existing%20accounts%20must%20sign%20in%20with%20the%20new%20email%20and%20their%20current%20password#partners");
  } catch (error) {
    if (error?.code === 409 || error?.code === 412) {
      const message = error.publicMessage || (error.code === 412
        ? "Partner or account details changed while saving. Reload and try again."
        : "The new email or a related access record is already in use. No changes were saved.");
      return res.redirect(`/supervisor?notification=error&message=${encodeURIComponent(message)}#partners`);
    }
    next(error);
  }
});

app.post("/supervisor/notifications/test", requireSupervisor, async (req, res, next) => {
  try {
    const to = String(req.body.to || "").trim();
    const subject = String(req.body.subject || "Lab Automation test notification").trim();
    const text = String(
      req.body.text ||
        `Hello, this is a supervisor-initiated test notification from ${req.session.supervisor.email}.`
    ).trim();

    if (!to) {
      return res.redirect("/supervisor?message=Recipient%20email%20is%20required%20for%20test%20notification");
    }

    const result = await sendPlainNotification({ to, subject, text });
    if (result && result.skipped) {
      return res.redirect(
        `/supervisor?message=${encodeURIComponent(
          `Notification skipped: ${result.reason || "No delivery channel configured."}`
        )}`
      );
    }

    return res.redirect("/supervisor?message=Test%20notification%20sent%20successfully");
  } catch (error) {
    console.error("Supervisor test notification failed", error);
    return res.redirect("/supervisor?message=Failed%20to%20send%20test%20notification");
  }
});

app.get("/supervisor/events/:id", requireSupervisor, async (req, res, next) => {
  try {
    const event = await getEventById(req.params.id);
    if (!event) {
      return res.status(404).send("Event not found");
    }
    const registrations = await listAllRegistrationsByEvent(event.id);
    const piiAccess = canViewPii(req);
    const registrationsForView = maskRegistrationsForView(registrations, piiAccess);
    const feedback = await listFeedbackByEvent(event.id);
    const organizations = buildOrganizationReport(registrations);
    const organizationsForView = maskOrganizationReportRows(organizations, piiAccess);

    return res.render("supervisor-event-detail", {
      event: {
        ...event,
        computedStatus: getEventStatus(event)
      },
      registrations: registrationsForView,
      feedback,
      organizations: organizationsForView,
      piiRestricted: !piiAccess
    });
  } catch (error) {
    next(error);
  }
});

app.get("/publisher", requirePublisher, async (req, res, next) => {
  try {
    await renderPublisherDashboard(req, res, req.query.message || "");
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/partner-users", requirePublisher, async (req, res, next) => {
  try {
    if (!isPartnerAccount(req.session.publisher)) {
      return res.status(403).send("Only partner publishers can add partner users.");
    }
    const userType = String(req.body.userType || "").trim().toLowerCase();
    const email = String(req.body.email || "").trim().toLowerCase();
    const name = String(req.body.name || "").trim();
    const password = String(req.body.password || "");
    if (!["publisher", "speaker", "proctor"].includes(userType) || !isValidEmailAddress(email) || !name) {
      return res.redirect("/publisher?message=Enter%20valid%20partner%20user%20details");
    }
    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      return res.redirect(`/publisher?message=${encodeURIComponent(passwordError)}`);
    }
    const existing = await getLoginUserByEmailAndType(email, userType);
    if (existing) {
      return res.redirect("/publisher?message=An%20account%20already%20exists%20for%20this%20email%20and%20persona");
    }

    await upsertLoginUser({
      userType,
      email,
      name,
      password: "",
      passwordHash: hashPassword(password),
      accountClass: "partner",
      partnerId: req.session.publisher.partnerId,
      partnerName: req.session.publisher.partnerName,
      active: true
    });
    return res.redirect("/publisher?message=Partner%20user%20created");
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/reports.xlsx", requirePublisher, async (req, res, next) => {
  try {
    const selectedEventIds = parseSelectedEventIds(req.query.selectedEventIds);
    const requestedReportTypes = parseSelectedEventIds(req.query.reportTypes);
    const reportTypes = requestedReportTypes.filter((type) =>
      ["registrations", "organizations"].includes(type)
    );

    if (!selectedEventIds.length) {
      return res.status(400).send("Select one or more events.");
    }
    if (!reportTypes.length || reportTypes.length !== requestedReportTypes.length) {
      return res.status(400).send("Select Registration Report, Organization Registrant Report, or both.");
    }

    const accessibleEvents = await listPublisherAccessibleEvents(req.session.publisher);
    const eventById = new Map(accessibleEvents.map((event) => [String(event.id), event]));
    const selectedEvents = selectedEventIds.map((id) => eventById.get(id)).filter(Boolean);
    if (selectedEvents.length !== selectedEventIds.length) {
      return res.status(403).send("One or more selected events are unavailable or unauthorized.");
    }

    const reportData = await Promise.all(
      selectedEvents.map(async (event) => {
        const registrations = await listAllRegistrationsByEvent(event.id);
        const piiAccess = canViewEventPii(req, event, event.accessLevel);
        return {
          event,
          registrations: maskRegistrationsForView(registrations, piiAccess)
        };
      })
    );
    const workbook = buildPublisherReportsExcel(reportData, reportTypes);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="publisher-event-reports.xlsx"');
    return res.send(workbook);
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/events/new", requirePublisher, requirePartnerAgreement, async (req, res, next) => {
  try {
    const duplicateFrom = String(req.query.duplicateFrom || "").trim();
    let formData = null;

    if (duplicateFrom) {
      const sourceEvent = await getEventById(duplicateFrom);
      if (!sourceEvent || String(sourceEvent.publisherEmail || "").toLowerCase() !== String(req.session.publisher.email || "").toLowerCase()) {
        return res.status(404).send("Event not found");
      }

      formData = {
        duplicateFrom,
        title: sourceEvent.title || "",
        description: sourceEvent.description || "",
        startAt: sourceEvent.startAt ? new Date(sourceEvent.startAt).toISOString().slice(0, 16) : "",
        endAt: sourceEvent.endAt ? new Date(sourceEvent.endAt).toISOString().slice(0, 16) : "",
        timeZone: sourceEvent.timeZone || "",
        maxSeats: sourceEvent.maxSeats || "",
        city: sourceEvent.city || "",
        deliveryMode: sourceEvent.deliveryMode || "virtual",
        address: sourceEvent.address || "",
        teamsLink: sourceEvent.teamsLink || "",
        holUri: sourceEvent.holUri || ""
      };
    }

    return res.render("publisher-event-new", {
      message: duplicateFrom ? "Duplicating an existing event. Review details, adjust timing if needed, then publish." : String(req.query.message || ""),
      isError: false,
      formData,
      timeZones: TIMEZONES
    });
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events", requirePublisher, requirePartnerAgreement, async (req, res, next) => {
  try {
    const deliveryMode = String(req.body.deliveryMode || "").trim();
    const city = deliveryMode === "virtual" ? "" : String(req.body.city || "").trim();
    const address = ["in-person", "hybrid"].includes(deliveryMode) ? String(req.body.address || "").trim() : "";
    const teamsLink = ["virtual", "hybrid"].includes(deliveryMode) ? String(req.body.teamsLink || "").trim() : "";
    const holUri = String(req.body.holUri || "").trim();
    const timeZone = String(req.body.timeZone || "").trim();
    const maxSeats = Number.parseInt(req.body.maxSeats, 10);
    const startAt = normalizeDateTime(req.body.startAt);
    const endAt = normalizeDateTime(req.body.endAt);
    const partnerProfile = isPartnerAccount(req.session.publisher)
      ? await getPartnerById(req.session.publisher.partnerId)
      : null;

    const payload = {
      title: String(req.body.title || "").trim(),
      description: String(req.body.description || "").trim(),
      startAt,
      endAt,
      city,
      address,
      deliveryMode,
      timeZone,
      maxSeats,
      teamsLink,
      holUri,
      unlisted: parseBoolean(req.body.unlisted),
      publisherEmail: req.session.publisher.email,
      partnerId: String(req.session.publisher.partnerId || ""),
      partnerName: String(req.session.publisher.partnerName || ""),
      partnerWebsiteUrl: String(partnerProfile?.websiteUrl || ""),
      partnerPrivacyPolicyUrl: String(partnerProfile?.privacyPolicyUrl || ""),
      publicationStatus: isPartnerAccount(req.session.publisher) ? "pending" : "approved"
    };
    const duplicateFrom = String(req.body.duplicateFrom || "").trim();

    const renderCreateEventValidationError = (message) =>
      res.status(400).render("publisher-event-new", {
        message,
        isError: true,
        timeZones: TIMEZONES,
        formData: {
          ...req.body,
          duplicateFrom,
          deliveryMode,
          city,
          timeZone,
          holUri,
          maxSeats: Number.isInteger(maxSeats) ? maxSeats : req.body.maxSeats
        }
      });

    if (!payload.title || !payload.startAt || !payload.endAt || !payload.deliveryMode) {
      return renderCreateEventValidationError("Missing required event fields");
    }

    if (!["virtual", "in-person", "hybrid"].includes(payload.deliveryMode)) {
      return renderCreateEventValidationError("Select a valid delivery mode");
    }

    if (["in-person", "hybrid"].includes(payload.deliveryMode) && !payload.city) {
      return renderCreateEventValidationError("City is required for in-person and hybrid events");
    }

    if (["virtual", "hybrid"].includes(payload.deliveryMode) && !payload.teamsLink) {
      return renderCreateEventValidationError("Teams link is required for virtual and hybrid events");
    }

    if (!payload.timeZone) {
      return renderCreateEventValidationError("Time zone is required");
    }

    if (!Number.isInteger(payload.maxSeats) || payload.maxSeats < 1) {
      return renderCreateEventValidationError("Max seats must be a positive whole number");
    }

    if (["in-person", "hybrid"].includes(payload.deliveryMode) && !payload.address) {
      return renderCreateEventValidationError("Address is required for in-person and hybrid events");
    }

    if (payload.endAt.getTime() <= payload.startAt.getTime()) {
      return renderCreateEventValidationError("End date/time must be after start date/time");
    }

    const duplicate = await findDuplicateEventBySignature(
      req.session.publisher.email,
      payload.title,
      payload.startAt,
      payload.endAt,
      payload.timeZone
    );
    if (duplicate) {
      return renderCreateEventValidationError(
        "An event with the same title, date and time, and time zone already exists. Change at least one of those details before saving."
      );
    }

    // The database check covers existing and legacy events. The atomic reservation also
    // prevents two concurrent saves with the same signature from both succeeding.
    const uniquenessKey = buildEventUniquenessKey(payload);

    const reserved = await reserveEventUniquenessKey(uniquenessKey);
    if (!reserved) {
      return renderCreateEventValidationError(
        "This event was already created. Change the title, date and time, or time zone before saving."
      );
    }

    try {
      const event = await createEvent(payload);
      clearEventCaches();
      const message = isPartnerAccount(req.session.publisher)
        ? "Event submitted for approval"
        : "Event published successfully";
      return res.redirect(`/publisher?message=${encodeURIComponent(message)}`);
    } catch (error) {
      await releaseEventUniquenessKey(uniquenessKey);
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/events/:id", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res);
    if (!access) {
      return;
    }

    return renderPublisherEventDetailPage(req, res, access.event, {
      message: String(req.query.message || ""),
      accessLevel: access.accessLevel
    });
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/switch-persona", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res);
    if (!access) {
      return;
    }

    const persona = String(req.body.persona || "").trim().toLowerCase();
    if (!["speaker", "proctor"].includes(persona)) {
      return res.status(400).send("Select a valid event persona.");
    }

    const publisherEmail = normalizeEmail(req.session.publisher.email);
    const assignments = await listPersonaAssignmentsByEvent(access.event.id);
    const assignment = assignments.find((item) =>
      normalizeEmail(item.inviteEmail) === publisherEmail
      && String(item.personaType || "").toLowerCase() === persona
    );
    if (!assignment) {
      return res.status(403).send(`You are not assigned as a ${persona} for this event.`);
    }

    req.session.facilitator = {
      email: publisherEmail,
      persona,
      name: String(assignment.personaName || req.session.publisher.name || "").trim(),
      accountClass: String(req.session.publisher.accountClass || "internal").toLowerCase(),
      partnerId: String(req.session.publisher.partnerId || ""),
      partnerName: String(req.session.publisher.partnerName || ""),
      switchedFromPublisher: true,
      publisherEventId: access.event.id
    };
    return req.session.save(() => res.redirect(`/facilitator/events/${access.event.id}`));
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/restore-persona", requirePublisher, (req, res) => {
  const eventId = String(req.session.facilitator?.publisherEventId || "").trim();
  req.session.facilitator = null;
  return req.session.save(() => {
    res.redirect(eventId ? `/publisher/events/${encodeURIComponent(eventId)}` : "/publisher");
  });
});

app.post("/publisher/events/:id/publication/approve", requirePublisher, async (req, res, next) => {
  try {
    if (isPartnerAccount(req.session.publisher)) {
      return res.status(403).send("Partner publishers cannot approve partner events.");
    }
    const event = await getEventById(req.params.id);
    if (!event?.partnerId) {
      return res.status(400).send("Only partner events require publication approval.");
    }

    const updated = await setEventPublicationDecision(
      event,
      "approved",
      req.session.publisher.email
    );
    clearEventCaches();
    try {
      await sendPlainNotification({
        to: event.publisherEmail,
        subject: `Event approved: ${getPartnerEventTitle(event)}`,
        text: `Your event has been approved and is now visible on the public event listing.`
      });
    } catch (notificationError) {
      console.error("Event approval notification failed", notificationError);
    }
    return res.redirect(`/publisher/events/${updated.id}?message=Event%20approved`);
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/publication/reject", requirePublisher, async (req, res, next) => {
  try {
    if (isPartnerAccount(req.session.publisher)) {
      return res.status(403).send("Partner publishers cannot reject partner events.");
    }
    const event = await getEventById(req.params.id);
    if (!event?.partnerId) {
      return res.status(400).send("Only partner events require publication approval.");
    }
    const reason = String(req.body.reason || "").trim();
    if (!reason) {
      return res.redirect(`/publisher/events/${event.id}?message=Rejection%20reason%20is%20required`);
    }

    const updated = await setEventPublicationDecision(
      event,
      "rejected",
      req.session.publisher.email,
      reason
    );
    clearEventCaches();
    try {
      await sendPlainNotification({
        to: event.publisherEmail,
        subject: `Event changes required: ${getPartnerEventTitle(event)}`,
        text: `Your event was not approved. Reason: ${reason}`
      });
    } catch (notificationError) {
      console.error("Event rejection notification failed", notificationError);
    }
    return res.redirect(`/publisher/events/${updated.id}?message=Event%20rejected`);
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/events/:id/manage", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }

    return renderPublisherEventManagePage(req, res, access.event, {
      accessLevel: access.accessLevel,
      message: String(req.query.message || "")
    });
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/collaborators", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }
    const event = access.event;

    const collaboratorEmail = String(req.body.collaboratorEmail || "").trim().toLowerCase();
    const accessLevel = "write";
    const collaboratorUser = await getLoginUserByEmailAndType(collaboratorEmail, "publisher");
    const canShareWithPartnerPublisher = collaboratorUser
      && collaboratorUser.active !== false
      && isPartnerAccount(collaboratorUser)
      && collaboratorUser.partnerId === req.session.publisher.partnerId;

    if (!collaboratorEmail || (!isMicrosoftEmail(collaboratorEmail) && !canShareWithPartnerPublisher)) {
      return res.redirect(`/publisher/events/${event.id}/manage?message=Enter%20an%20eligible%20publisher%20email%20to%20share%20access`);
    }

    if (collaboratorEmail === String(event.publisherEmail || "").toLowerCase()) {
      return res.redirect(`/publisher/events/${event.id}/manage?message=Event%20owner%20already%20has%20full%20access`);
    }

    await upsertEventCollaborator({
      eventId: event.id,
      ownerPublisherEmail: event.publisherEmail,
      collaboratorEmail,
      accessLevel
    });
    await recordEventAuditEntry({
      eventId: event.id,
      ...getPublisherAuditActor(req),
      action: "access-shared",
      summary: `Shared writable event access with ${collaboratorEmail}.`,
      newValues: { collaboratorEmail, accessLevel }
    });

    return res.redirect(`/publisher/events/${event.id}/manage?message=Shared%20${accessLevel}%20access%20with%20${encodeURIComponent(collaboratorEmail)}`);
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/collaborators/:email/remove", requirePublisher, async (req, res, next) => {
  try {
    const event = await getPublisherEvent(req, res);
    if (!event) {
      return;
    }

    await removeEventCollaborator(event.id, req.params.email);
    return res.redirect(`/publisher/events/${event.id}/manage?message=Access%20removed`);
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/sharing", requirePublisher, async (req, res, next) => {
  try {
    const sessionEmail = String(req.session.publisher.email || "").toLowerCase();
    const events = await getEventsCached();
    const ownedEvents = events
      .filter((item) => String(item.publisherEmail || "").toLowerCase() === sessionEmail)
      .sort(compareEventsByScheduleProximity);

    const collaborators = await listEventCollaboratorsByOwner(sessionEmail);
    const eventsById = new Map(ownedEvents.map((item) => [String(item.id), item]));
    const collaboratorsByEvent = new Map();
    collaborators.forEach((item) => {
      const eventId = String(item.eventId);
      if (!eventsById.has(eventId)) {
        return;
      }
      const list = collaboratorsByEvent.get(eventId) || [];
      list.push(item);
      collaboratorsByEvent.set(eventId, list);
    });

    const sharedEvents = ownedEvents
      .filter((item) => collaboratorsByEvent.has(String(item.id)))
      .map((item) => ({
        event: item,
        collaborators: collaboratorsByEvent.get(String(item.id)) || []
      }));

    return res.render("publisher-sharing", {
      ownedEvents,
      sharedEvents,
      message: String(req.query.message || ""),
      error: String(req.query.error || "")
    });
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/sharing", requirePublisher, async (req, res, next) => {
  try {
    const sessionEmail = String(req.session.publisher.email || "").toLowerCase();
    const collaboratorEmail = String(req.body.collaboratorEmail || "").trim().toLowerCase();
    const accessLevel = String(req.body.accessLevel || "read").toLowerCase() === "write" ? "write" : "read";
    const eventIdsRaw = req.body.eventIds;
    const eventIds = Array.isArray(eventIdsRaw) ? eventIdsRaw : eventIdsRaw ? [eventIdsRaw] : [];

    const collaboratorUser = await getLoginUserByEmailAndType(collaboratorEmail, "publisher");
    const canShareWithPartnerPublisher = collaboratorUser
      && collaboratorUser.active !== false
      && isPartnerAccount(collaboratorUser)
      && collaboratorUser.partnerId === req.session.publisher.partnerId;
    if (!collaboratorEmail || (!isMicrosoftEmail(collaboratorEmail) && !canShareWithPartnerPublisher)) {
      return res.redirect("/publisher/sharing?error=Enter%20an%20eligible%20publisher%20email%20to%20share%20access");
    }

    if (collaboratorEmail === sessionEmail) {
      return res.redirect("/publisher/sharing?error=You%20already%20have%20full%20access%20to%20your%20own%20events");
    }

    if (!eventIds.length) {
      return res.redirect("/publisher/sharing?error=Select%20at%20least%20one%20event%20to%20share");
    }

    const events = await getEventsCached();
    const ownedEventIds = new Set(
      events
        .filter((item) => String(item.publisherEmail || "").toLowerCase() === sessionEmail)
        .map((item) => String(item.id))
    );

    const validEventIds = eventIds.map(String).filter((id) => ownedEventIds.has(id));
    if (!validEventIds.length) {
      return res.redirect("/publisher/sharing?error=None%20of%20the%20selected%20events%20belong%20to%20you");
    }

    await Promise.all(
      validEventIds.map((eventId) =>
        upsertEventCollaborator({
          eventId,
          ownerPublisherEmail: sessionEmail,
          collaboratorEmail,
          accessLevel
        })
      )
    );

    return res.redirect(
      `/publisher/sharing?message=Shared%20${accessLevel}%20access%20to%20${validEventIds.length}%20event(s)%20with%20${encodeURIComponent(collaboratorEmail)}`
    );
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/sharing/:eventId/:email/remove", requirePublisher, async (req, res, next) => {
  try {
    const sessionEmail = String(req.session.publisher.email || "").toLowerCase();
    const event = await getEventById(req.params.eventId);
    if (!event || String(event.publisherEmail || "").toLowerCase() !== sessionEmail) {
      return res.status(403).send("Not authorized.");
    }

    await removeEventCollaborator(event.id, req.params.email);
    return res.redirect("/publisher/sharing?message=Access%20removed");
  } catch (error) {
    next(error);
  }
});

app.post(
  "/publisher/events/:id/follow-up-template",
  requirePublisher,
  upload.single("attachment"),
  async (req, res, next) => {
    try {
      const access = await getPublisherEventAccess(req, res, { requireWrite: true });
      if (!access) {
        return;
      }
      const event = access.event;

      const subject = String(req.body.subject || "").trim();
      const body = String(req.body.body || "").trim();
      if (!subject || !body) {
        return renderPublisherEventManagePage(req, res, event, {
          accessLevel: access.accessLevel,
          message: "Follow-up subject and body are required",
          followUpFormData: {
            subject: req.body.subject,
            body: req.body.body
          }
        });
      }

      const existing = await getFollowUpTemplateByEvent(event.id);
      const attachmentFileName = req.file ? req.file.originalname : String(existing?.attachmentFileName || "");
      const attachmentContentType = req.file
        ? req.file.mimetype
        : String(existing?.attachmentContentType || "");
      const attachmentBase64 = req.file
        ? req.file.buffer.toString("base64")
        : String(existing?.attachmentBase64 || "");

      await upsertFollowUpTemplateByEvent({
        eventId: event.id,
        publisherEmail: event.publisherEmail,
        subject,
        body,
        attachmentFileName,
        attachmentContentType,
        attachmentBase64
      });

      return res.redirect(`/publisher/events/${event.id}/manage?message=Post-event%20follow-up%20template%20saved`);
    } catch (error) {
      next(error);
    }
  }
);

app.post("/publisher/events/:id/cancel", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }
    const event = access.event;

    const confirmationText = String(req.body.confirmationText || "").trim().toUpperCase();
    const confirmationEventId = String(req.body.confirmationEventId || "").trim();
    const reason = String(req.body.reason || "").trim();

    if (confirmationText !== "CANCEL" || confirmationEventId !== event.id) {
      return renderPublisherEventManagePage(req, res, event, {
        accessLevel: access.accessLevel,
        message: "Cancellation failed. Type CANCEL and event ID to confirm.",
        cancelFormData: {
          reason: req.body.reason,
          confirmationText: req.body.confirmationText,
          confirmationEventId: req.body.confirmationEventId
        }
      });
    }

    const updated = await cancelEvent(event.id, event.publisherEmail, reason);
    await recordEventAuditEntry({
      eventId: event.id,
      ...getPublisherAuditActor(req),
      action: "canceled",
      summary: reason,
      oldValues: {
        status: event.status || "active",
        cancellationReason: event.cancellationReason || ""
      },
      newValues: {
        status: "canceled",
        cancellationReason: reason
      }
    });
    clearEventCaches();
    await notifyEventParticipants(req, updated || event, "event-canceled", reason || "Event has been canceled.");
    return res.redirect(`/publisher/events/${event.id}?message=Event%20cancelled%20and%20notifications%20sent`);
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/lab-provisioning/request", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }

    const event = access.event;
    const labType = String(req.body.labType || "").trim().toLowerCase();
    if (labType !== "documentdb" && labType !== "nosql") {
      return res.redirect(`/publisher/events/${event.id}/manage?message=${encodeURIComponent("Lab Type must be DocumentDB or NoSQL API.")}#lab-provisioning`);
    }
    const isDocDB = labType === "documentdb";

    const deployStudents = parseBoolean(req.body.deployStudents);
    const deployTeam = parseBoolean(req.body.deployTeam);
    if (!deployStudents && !deployTeam) {
      return res.redirect(`/publisher/events/${event.id}/manage?message=${encodeURIComponent("Select at least one deployment audience: students or speakers/proctors.")}#lab-provisioning`);
    }

    const [registrations, storedBatches, personaAssignments] = await Promise.all([
      listAllRegistrationsByEvent(event.id),
      listLabProvisioningBatchesByEvent(event.id),
      listPersonaAssignmentsByEvent(event.id)
    ]);
    const batches = await Promise.all(storedBatches.map((batchItem) => {
      const hasPersistedRecipients = (batchItem.requestedRegistrationIds || []).length
        || (batchItem.requestedRecipientIds || []).length;
      if (isReservedLabProvisioningBatch(batchItem) && Number(batchItem.studentCount) > 0 && !hasPersistedRecipients) {
        return upsertLabProvisioningBatch({
          ...batchItem,
          status: "failed",
          error: "Recipient details were not retained by an earlier request. Submit the deployment again."
        });
      }
      return batchItem;
    }));
    const provisioningSummary = buildLabProvisioningSummary(registrations, batches, personaAssignments);
    if (batches.some(isReservedLabProvisioningBatch)) {
      return res.redirect(`/publisher/events/${event.id}/manage?message=${encodeURIComponent("Wait for the active lab provisioning batch to finish before submitting another request.")}#lab-provisioning`);
    }
    let registrationSequence = { startSequence: 0, endSequence: 0 };
    let requestedRegistrationEntries = [];
    if (deployStudents) {
      try {
        registrationSequence = parseRegistrationSequenceRange(
          req.body.registrationSequence,
          registrations.length
        );
      } catch (error) {
        return res.redirect(`/publisher/events/${event.id}/manage?message=${encodeURIComponent(error.message)}#lab-provisioning`);
      }
      const availableRegistrationIds = new Set(
        provisioningSummary.availableRegistrations.map((registration) => registration.id)
      );
      requestedRegistrationEntries = selectProvisioningRegistrationEntries(
        registrations,
        registrationSequence.startSequence,
        registrationSequence.endSequence,
        availableRegistrationIds
      );
    }

    const requestedRegistrations = requestedRegistrationEntries.map(({ registration }) => registration);
    const requestedTeamMembers = deployTeam ? provisioningSummary.availableTeamMembers : [];
    const requestedRecipients = [
      ...requestedRegistrations.map((registration) => ({
        id: registration.id,
        kind: "registration",
        name: registration.attendeeName || registration.attendeeEmail,
        email: registration.attendeeEmail
      })),
      ...requestedTeamMembers.map((member) => ({
        id: member.id,
        kind: "team",
        name: member.name,
        email: member.email,
        roles: member.roles
      }))
    ];
    if (!requestedRecipients.length) {
      return res.redirect(`/publisher/events/${event.id}/manage?message=${encodeURIComponent("No selected recipients need lab access. People who are deregistered, reserved, or already assigned a lab were skipped.")}#lab-provisioning`);
    }

    const studentCount = requestedRecipients.length;
    const requestedStudentNumbers = allocateLabStudentNumbers(batches, registrations, studentCount);
    // Deploy every requested lab at once; Azure quota is the only practical ceiling.
    const maxParallelDeployments = Math.min(100, studentCount);
    const accessDurationHours = Number(req.body.accessDurationHours);
    if (!Number.isInteger(accessDurationHours) || accessDurationHours < 1 || accessDurationHours > 720) {
      return res.redirect(`/publisher/events/${event.id}/manage?message=${encodeURIComponent("Delete labs after (hours) must be a whole number from 1 to 720.")}#lab-provisioning`);
    }

    const location = String(req.body.location || "").trim().toLowerCase();
    if (!/^[a-z]+[a-z0-9]*$/.test(location) || location.length > 64) {
      return res.redirect(`/publisher/events/${event.id}/manage?message=${encodeURIComponent("Azure location must use letters and numbers only, beginning with a letter.")}#lab-provisioning`);
    }
    const vmSize = String(req.body.vmSize || "").trim();
    if (!vmSize) {
      return res.redirect(`/publisher/events/${event.id}/manage?message=${encodeURIComponent("VM SKU is required.")}#lab-provisioning`);
    }

    const baseUrl = `https://${req.get("host")}`;
    const labId = `evt-${String(event.id).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 20)}`;
    const requestedAt = new Date().toISOString();
    const deploymentAudiences = [
      ...(deployStudents ? ["students"] : []),
      ...(deployTeam ? ["team"] : [])
    ];
    const startStudentNumber = requestedStudentNumbers[0];
    const batchId = `batch-${randomUUID()}`;
    const reserved = await reserveLabProvisioningRegistrationIds(
      event.id,
      batchId,
      requestedRegistrations.map((registration) => registration.id)
    );
    if (!reserved) {
      return res.redirect(`/publisher/events/${event.id}/manage?message=${encodeURIComponent("Some registrations were just reserved by another provisioning request. Refresh and try again.")}#lab-provisioning`);
    }
    let batch = await upsertLabProvisioningBatch({
      id: `lab-provisioning-batch-${event.id}-${batchId}`,
      eventId: event.id,
      eventTitle: event.title,
      status: labProvisioningCallbackToken ? "requested" : "manual-required",
      studentCount,
      maxParallelDeployments,
      startStudentNumber,
      registrationSequenceStart: registrationSequence.startSequence,
      registrationSequenceEnd: registrationSequence.endSequence,
      requestedRegistrationIds: requestedRegistrations.map((registration) => registration.id),
      requestedRecipientIds: requestedRecipients.map((recipient) => recipient.id),
      requestedRecipients,
      deploymentAudiences,
      requestedStudentNumbers,
      labType,
      isDocDB,
      labId,
      location,
      vmSize,
      accessDurationHours,
      expiresAt: new Date(Date.now() + accessDurationHours * 60 * 60 * 1000).toISOString(),
      callbackUrl: `${baseUrl}/api/provisioning/jobs/lab-provisioning-batch-${event.id}-${batchId}/lab-details`,
      command: buildLabProvisioningCommand({
        studentCount,
        startStudentNumber,
        studentNumbers: requestedStudentNumbers,
        isDocDB,
        labId,
        location,
        vmSize,
        accessDurationHours,
        maxParallelDeployments
      }),
      requestedBy: req.session.publisher.email,
      requestedAt
    });
    await recordEventAuditEntry({
      eventId: event.id,
      ...getPublisherAuditActor(req),
      action: "lab-deployment-requested",
      summary: `Requested ${studentCount} lab(s) for ${deploymentAudiences.join(" and ")}.`,
      newValues: {
        recipients: requestedRecipients.map((recipient) => recipient.name || recipient.email),
        requestedAt
      }
    });

    const dispatch = await dispatchLabProvisioningWorkflow(batch);
    batch = await upsertLabProvisioningBatch({
      ...batch,
      status: dispatch.dispatched ? "dispatched" : "manual-required",
      dispatchedAt: dispatch.dispatched ? new Date().toISOString() : "",
      error: dispatch.dispatched ? "" : dispatch.reason
    });
    await upsertLabProvisioningJob({
      eventId: event.id,
      eventTitle: event.title,
      status: batch.status,
      studentCount,
      maxParallelDeployments,
      labType,
      isDocDB,
      labId,
      location,
      vmSize,
      accessDurationHours,
      expiresAt: batch.expiresAt,
      callbackUrl: batch.callbackUrl,
      command: batch.command,
      importedCount: batch.importedCount,
      error: batch.error,
      requestedBy: batch.requestedBy,
      requestedAt,
      dispatchedAt: batch.dispatchedAt
    });

    return res.redirect(
      `/publisher/events/${event.id}/manage?message=${encodeURIComponent(dispatch.dispatched ? `Lab provisioning workflow dispatched for ${studentCount} recipient(s). People already assigned or reserved were skipped.` : `Lab provisioning job created for ${studentCount} recipient(s). People already assigned or reserved were skipped. GitHub dispatch is not configured; use the manual command shown below.`)}#lab-provisioning`
    );
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/lab-provisioning/delete", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }

    const batch = await getLabProvisioningBatchById(req.body.batchId);
    if (!batch || batch.eventId !== access.event.id) {
      return res.status(404).send("Lab provisioning batch not found.");
    }
    if (["requested", "dispatched", "running", "deleting"].includes(String(batch.status || "").toLowerCase())) {
      return res.redirect(`/publisher/events/${access.event.id}/manage?message=${encodeURIComponent("Wait for the current provisioning or deletion operation to finish.")}#lab-provisioning`);
    }

    let range;
    try {
      range = parseLabDeletionRange(req.body.range, 1, batch.studentCount);
    } catch (error) {
      return res.redirect(`/publisher/events/${access.event.id}/manage?message=${encodeURIComponent(error.message)}#lab-provisioning`);
    }

    const studentNumbers = getBatchStudentNumbers(batch)
      .slice(range.startStudentNumber - 1, range.endStudentNumber);
    const callbackUrl = `https://${req.get("host")}/api/provisioning/jobs/${encodeURIComponent(batch.id)}/deletion`;
    const dispatch = await dispatchLabDeletionWorkflow(batch, studentNumbers, callbackUrl);
    await upsertLabProvisioningBatch({
      ...batch,
      status: dispatch.dispatched ? "deleting" : batch.status,
      progressMessage: dispatch.dispatched
        ? `Deleting batch labs ${range.startStudentNumber}-${range.endStudentNumber}. Missing labs will be skipped.`
        : batch.progressMessage,
      error: dispatch.dispatched ? "" : dispatch.reason
    });

    return res.redirect(
      `/publisher/events/${access.event.id}/manage?message=${encodeURIComponent(dispatch.dispatched ? `Deletion requested for batch labs ${range.startStudentNumber}-${range.endStudentNumber}.` : `Deletion could not be dispatched: ${dispatch.reason}`)}#lab-provisioning`
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/provisioning/jobs/due", requireLabProvisioningToken, async (req, res, next) => {
  try {
    const now = Date.now();
    const windowEnd = now + 72 * 60 * 60 * 1000;
    const dueJobs = [];
    const events = await getEventsCached();

    for (const event of events) {
      const startAt = new Date(event.startAt).getTime();
      if (!Number.isFinite(startAt) || startAt < now || startAt > windowEnd || getEventStatus(event) === "canceled") {
        continue;
      }

      const existingJob = await getLabProvisioningJobByEvent(event.id);
      if (existingJob) {
        continue;
      }

      const provisioningType = detectWorkshopProvisioningType(event);
      if (provisioningType.isDocDB === null) {
        await upsertLabProvisioningJob({
          eventId: event.id,
          eventTitle: event.title,
          status: "needs-review",
          error: "Event title does not clearly indicate DocumentDB or NoSQL."
        });
        continue;
      }

      const registrations = getActiveRegistrations(await listAllRegistrationsByEvent(event.id));
      if (!registrations.length) {
        continue;
      }

      const labId = `evt-${String(event.id).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 20)}`;
      const accessDurationHours = 72;
      const requestedAt = new Date().toISOString();
      const job = await upsertLabProvisioningJob({
        eventId: event.id,
        eventTitle: event.title,
        status: "dispatched",
        studentCount: registrations.length,
        isDocDB: provisioningType.isDocDB,
        labId,
        location: labProvisioningLocation,
        vmSize: labProvisioningVmSize,
        accessDurationHours,
        maxParallelDeployments: Math.min(100, registrations.length),
        expiresAt: new Date(Date.now() + accessDurationHours * 60 * 60 * 1000).toISOString(),
        callbackUrl: `https://${req.get("host")}/api/provisioning/jobs/lab-provisioning-${event.id}/lab-details`,
        command: buildLabProvisioningCommand({
          studentCount: registrations.length,
          isDocDB: provisioningType.isDocDB,
          labId,
          location: labProvisioningLocation,
          vmSize: labProvisioningVmSize,
          accessDurationHours,
          maxParallelDeployments: Math.min(100, registrations.length)
        }),
        requestedBy: "automation",
        requestedAt,
        dispatchedAt: requestedAt
      });
      dueJobs.push(job);
    }

    return res.json({ jobs: dueJobs });
  } catch (error) {
    next(error);
  }
});

app.post("/api/provisioning/jobs/:jobId/progress", requireLabProvisioningToken, async (req, res, next) => {
  try {
    const batch = await getLabProvisioningBatchById(req.params.jobId);
    const job = batch || await getLabProvisioningJobById(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Provisioning job not found." });
    }
    if (job.status === "completed") {
      return res.json({
        ok: true,
        jobId: job.id,
        status: job.status,
        deployedCount: job.deployedCount || job.importedCount || 0,
        failedCount: job.failedCount || 0
      });
    }

    const reportedDeployedCount = Number(req.body.deployedCount);
    const reportedFailedCount = Number(req.body.failedCount || 0);
    const priorRosterCount = batch && !batch.requestedStudentNumbers?.length
      ? Math.max(0, Number(batch.startStudentNumber || 1) - 1)
      : 0;
    const deployedCount = Math.max(0, reportedDeployedCount - priorRosterCount);
    const failedCount = reportedFailedCount;
    const status = String(req.body.status || "running").trim().toLowerCase();
    if (
      !Number.isInteger(reportedDeployedCount)
      || !Number.isInteger(reportedFailedCount)
      || !Number.isInteger(deployedCount)
      || !Number.isInteger(failedCount)
      || reportedDeployedCount < 0
      || reportedFailedCount < 0
      || deployedCount < 0
      || failedCount < 0
      || deployedCount + failedCount > job.studentCount
    ) {
      return res.status(400).json({ error: "Progress counts must be non-negative integers within the batch size." });
    }
    if (!["running", "failed"].includes(status)) {
      return res.status(400).json({ error: "Progress status must be running or failed." });
    }

    const progressMessage = batch
      ? `${deployedCount} of ${batch.studentCount} labs ready; ${failedCount} failed.`
      : String(req.body.message || "").trim().slice(0, 500);
    const progressPayload = {
      ...job,
      status,
      deployedCount,
      failedCount,
      progressMessage,
      error: status === "failed" ? progressMessage : ""
    };
    const updatedJob = batch
      ? await upsertLabProvisioningBatch(progressPayload)
      : await upsertLabProvisioningJob(progressPayload);
    if (batch) {
      await upsertLabProvisioningJob({
        id: `lab-provisioning-${batch.eventId}`,
        eventId: batch.eventId,
        eventTitle: batch.eventTitle,
        status,
        studentCount: batch.studentCount,
        maxParallelDeployments: batch.maxParallelDeployments,
        isDocDB: batch.isDocDB,
        labId: batch.labId,
        location: batch.location,
        vmSize: batch.vmSize,
        accessDurationHours: batch.accessDurationHours,
        expiresAt: batch.expiresAt,
        callbackUrl: batch.callbackUrl,
        command: batch.command,
        deployedCount,
        failedCount,
        progressMessage,
        error: status === "failed" ? progressMessage : "",
        requestedBy: batch.requestedBy,
        requestedAt: batch.requestedAt,
        dispatchedAt: batch.dispatchedAt
      });
      if (status === "failed") {
        await releaseLabProvisioningRegistrationIds(batch.eventId, batch.requestedRegistrationIds);
      }
    }

    return res.json({
      ok: true,
      jobId: updatedJob.id,
      status: updatedJob.status,
      deployedCount: updatedJob.deployedCount,
      failedCount: updatedJob.failedCount
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/provisioning/jobs/:jobId/deletion", requireLabProvisioningToken, async (req, res, next) => {
  try {
    const batch = await getLabProvisioningBatchById(req.params.jobId);
    if (!batch) {
      return res.status(404).json({ error: "Provisioning batch not found." });
    }

    const normalizeNumbers = (values) => [...new Set((Array.isArray(values) ? values : [])
      .map(Number)
      .filter(Number.isInteger))];
    const deletedNumbers = normalizeNumbers(req.body.deletedNumbers);
    const skippedNumbers = normalizeNumbers(req.body.skippedNumbers);
    const failedNumbers = normalizeNumbers(req.body.failedNumbers);
    const completedNumbers = [...new Set([...deletedNumbers, ...skippedNumbers])];
    const batchStudentNumbers = new Set(getBatchStudentNumbers(batch));
    if ([...completedNumbers, ...failedNumbers].some((number) => !batchStudentNumbers.has(number))) {
      return res.status(400).json({ error: "Deletion results must contain only labs from this batch." });
    }

    const clearedRegistrationIds = [];
    for (const studentNumber of completedNumbers) {
      const registrationId = getBatchRegistrationId(batch, studentNumber);
      if (!registrationId) {
        continue;
      }
      const registration = await getRegistrationById(registrationId);
      if (registration) {
        await setRegistrationLabAccess(registration, { clearExisting: true, labVmStatus: "deleted" });
      }
      clearedRegistrationIds.push(registrationId);
    }
    if (clearedRegistrationIds.length) {
      await releaseLabProvisioningRegistrationIds(batch.eventId, clearedRegistrationIds);
    }

    const previousCount = Number(batch.deployedCount ?? batch.importedCount ?? batch.studentCount);
    const remainingCount = Math.max(0, previousCount - clearedRegistrationIds.length);
    const status = failedNumbers.length ? "failed" : (remainingCount === 0 ? "deleted" : "completed");
    const message = `${deletedNumbers.length} deleted, ${skippedNumbers.length} already missing, ${failedNumbers.length} failed.`;
    const updatedBatch = await upsertLabProvisioningBatch({
      ...batch,
      status,
      deployedCount: remainingCount,
      importedCount: remainingCount,
      failedCount: failedNumbers.length,
      progressMessage: message,
      error: failedNumbers.length ? `Deletion failed for labs: ${failedNumbers.join(", ")}.` : "",
      completedAt: status === "deleted" ? new Date().toISOString() : batch.completedAt
    });

    return res.json({
      ok: true,
      jobId: updatedBatch.id,
      status: updatedBatch.status,
      remainingCount,
      deletedNumbers,
      skippedNumbers,
      failedNumbers
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/registrations/:registrationId/vm-status", requireLabProvisioningToken, async (req, res, next) => {
  try {
    const registration = await getRegistrationById(req.params.registrationId);
    if (!registration) {
      return res.status(404).json({ error: "Registration not found." });
    }

    const status = String(req.body.status || "").trim().toLowerCase();
    if (!["running", "deallocated", "failed"].includes(status)) {
      return res.status(400).json({ error: "VM status must be running, deallocated, or failed." });
    }
    const updated = await setRegistrationVmStatus(registration, status, req.body.message);
    return res.json({
      ok: true,
      registrationId: updated.id,
      status: updated.labVmStatus,
      message: updated.labVmStatusMessage
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/provisioning/jobs/:jobId/vm-statuses", requireLabProvisioningToken, async (req, res, next) => {
  try {
    const batch = await getLabProvisioningBatchById(req.params.jobId);
    if (!batch) {
      return res.status(404).json({ error: "Provisioning batch not found." });
    }

    const updates = Array.isArray(req.body.updates) ? req.body.updates : [];
    const batchStudentNumbers = new Set(getBatchStudentNumbers(batch));
    let updatedCount = 0;
    for (const update of updates) {
      const studentNumber = Number(update.studentNumber);
      const status = String(update.status || "").trim().toLowerCase();
      if (
        !Number.isInteger(studentNumber)
        || !batchStudentNumbers.has(studentNumber)
        || !["running", "deallocated", "failed", "unknown"].includes(status)
      ) {
        return res.status(400).json({ error: "VM status updates must use lab numbers from this batch and a supported status." });
      }

      const registrationId = getBatchRegistrationId(batch, studentNumber);
      const registration = registrationId ? await getRegistrationById(registrationId) : null;
      if (registration) {
        await setRegistrationVmStatus(registration, status, update.message);
        updatedCount += 1;
      }
    }

    return res.json({ ok: true, jobId: batch.id, updatedCount });
  } catch (error) {
    next(error);
  }
});

app.post("/api/provisioning/jobs/:jobId/lab-details", requireLabProvisioningToken, upload.single("file"), async (req, res, next) => {
  try {
    const batch = await getLabProvisioningBatchById(req.params.jobId);
    const job = batch || await getLabProvisioningJobById(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Provisioning job not found." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Upload the provisioning CSV as form field 'file'." });
    }

    const parsedRows = parseProvisioningCsv(req.file.buffer);
    const readyRows = parsedRows
      .filter((row) => {
        const status = String(row.Status || row.status || "").trim().toLowerCase();
        return batch ? status === "ready" : status !== "failed";
      })
      .sort((left, right) => getProvisioningRowStudentNumber(left) - getProvisioningRowStudentNumber(right));
    const rows = batch
      ? readyRows.filter((row) => getBatchStudentNumbers(batch).includes(getProvisioningRowStudentNumber(row)))
      : readyRows;
    const incompleteRows = rows
      .map((row) => ({
        studentNumber: getProvisioningRowStudentNumber(row),
        missing: getMissingProvisioningCredentialFields(row, Boolean(job.isDocDB))
      }))
      .filter((row) => row.missing.length);
    if (incompleteRows.length) {
      const details = incompleteRows
        .slice(0, 10)
        .map((row) => `lab ${row.studentNumber || "unknown"}: ${row.missing.join(", ")}`)
        .join("; ");
      const remaining = incompleteRows.length > 10 ? `; ${incompleteRows.length - 10} more incomplete row(s)` : "";
      return res.status(400).json({
        error: `Provisioning CSV contains Ready rows with missing required credentials (${details}${remaining}).`
      });
    }
    const recipients = batch?.requestedRecipients?.length
      ? await Promise.all(batch.requestedRecipients.map(async (recipient) => ({
        ...recipient,
        record: recipient.kind === "registration"
          ? await getRegistrationById(recipient.id)
          : recipient
      })))
      : null;
    const registrations = batch
      ? await Promise.all((batch.requestedRegistrationIds || []).map((registrationId) => getRegistrationById(registrationId)))
      : getActiveRegistrations(await listAllRegistrationsByEvent(job.eventId));

    if (!batch && rows.length < registrations.length) {
      const failedJob = {
        ...job,
        status: "failed",
        error: `Provisioning CSV has ${rows.length} ready row(s), but ${registrations.length} active registration(s) exist.`
      };
      if (batch) {
        await upsertLabProvisioningBatch(failedJob);
        await releaseLabProvisioningRegistrationIds(batch.eventId, batch.requestedRegistrationIds);
      } else {
        await upsertLabProvisioningJob(failedJob);
      }
      return res.status(400).json({ error: "Provisioning CSV has fewer rows than this provisioning batch requires." });
    }

    let updatedCount = 0;
    const importedRegistrationIndexes = new Set();
    if (batch) {
      const mappedRows = mapProvisioningRowsToRegistrationIndexes(
        rows,
        getBatchStudentNumbers(batch)
      );
      for (const { registrationIndex, row } of mappedRows) {
        const recipient = recipients?.[registrationIndex];
        const registration = recipient?.kind === "registration"
          ? recipient.record
          : registrations[registrationIndex];
        if (recipient?.kind === "team") {
          await setPersonaLabAccess(job.eventId, recipient.email, buildLabAccessFromProvisioningRow(row, job.isDocDB));
          importedRegistrationIndexes.add(registrationIndex);
          updatedCount += 1;
          continue;
        }
        if (!registration || !isApprovedRegistration(registration)) {
          continue;
        }
        await setRegistrationLabAccess(registration, buildLabAccessFromProvisioningRow(row, job.isDocDB));
        importedRegistrationIndexes.add(registrationIndex);
        updatedCount += 1;
      }
    } else {
      for (let index = 0; index < registrations.length; index += 1) {
        await setRegistrationLabAccess(registrations[index], buildLabAccessFromProvisioningRow(rows[index], job.isDocDB));
        updatedCount += 1;
      }
    }

    const importedCount = batch
      ? (recipients || registrations).filter((recipient, index) => {
          const registration = recipient?.kind === "registration" ? recipient.record : recipient;
          return importedRegistrationIndexes.has(index)
            || (recipient?.kind !== "team" && registration && isApprovedRegistration(registration) && hasLabAccess(registration));
        }).length
      : updatedCount;
    const completed = importedCount >= job.studentCount;
    const importPayload = {
      ...job,
      status: completed ? "completed" : "running",
      outputFileName: req.file.originalname,
      importedCount,
      deployedCount: importedCount,
      progressMessage: completed
        ? `${importedCount} of ${job.studentCount} labs deployed and assigned.`
        : `${importedCount} of ${job.studentCount} labs deployed and assigned; provisioning continues.`,
      completedAt: completed ? new Date().toISOString() : "",
      error: ""
    };
    const updatedJob = batch
      ? await upsertLabProvisioningBatch(importPayload)
      : await upsertLabProvisioningJob(importPayload);
    if (batch) {
      await upsertLabProvisioningJob({
        eventId: batch.eventId,
        eventTitle: batch.eventTitle,
        status: importPayload.status,
        studentCount: batch.studentCount,
        maxParallelDeployments: batch.maxParallelDeployments,
        isDocDB: batch.isDocDB,
        labId: batch.labId,
        location: batch.location,
        vmSize: batch.vmSize,
        accessDurationHours: batch.accessDurationHours,
        expiresAt: batch.expiresAt,
        callbackUrl: batch.callbackUrl,
        command: batch.command,
        outputFileName: req.file.originalname,
        importedCount,
        error: "",
        requestedBy: batch.requestedBy,
        requestedAt: batch.requestedAt,
        dispatchedAt: batch.dispatchedAt,
        completedAt: importPayload.completedAt
      });
      if (completed) {
        await releaseLabProvisioningRegistrationIds(batch.eventId, batch.requestedRegistrationIds);
        await recordEventAuditEntry({
          eventId: batch.eventId,
          actorEmail: "lab-provisioning",
          actorName: "Lab provisioning workflow",
          action: "lab-deployment-completed",
          summary: `Assigned ${importedCount} lab(s).`,
          newValues: {
            recipients: (batch.requestedRecipients || []).map((recipient) => recipient.name || recipient.email),
            completedAt: importPayload.completedAt
          }
        });
      }
    }

    return res.json({
      ok: true,
      jobId: updatedJob.id,
      importedCount,
      updatedCount,
      status: updatedJob.status
    });
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/update", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }
    const event = access.event;

    const deliveryMode = String(req.body.deliveryMode || "").trim();
    const city = deliveryMode === "virtual" ? "" : String(req.body.city || "").trim();
    const address = ["in-person", "hybrid"].includes(deliveryMode) ? String(req.body.address || "").trim() : "";
    const teamsLink = ["virtual", "hybrid"].includes(deliveryMode) ? String(req.body.teamsLink || "").trim() : "";
    const holUri = String(req.body.holUri || "").trim();
    const timeZone = String(req.body.timeZone || "").trim();
    const maxSeats = Number.parseInt(req.body.maxSeats, 10);
    const startAt = normalizeDateTime(req.body.startAt);
    const endAt = normalizeDateTime(req.body.endAt);
    const changeSummary = String(req.body.changeSummary || "").trim();
    const unlisted = parseBoolean(req.body.unlisted);

    const payload = {
      title: String(req.body.title || "").trim(),
      description: String(req.body.description || "").trim(),
      startAt,
      endAt,
      city,
      address,
      deliveryMode,
      timeZone,
      maxSeats,
      teamsLink,
      holUri,
      unlisted,
      publicationStatus: event.partnerId ? "pending" : getPublicationStatus(event),
      publicationSubmittedAt: event.partnerId ? new Date().toISOString() : event.publicationSubmittedAt,
      publicationReviewedAt: event.partnerId ? "" : event.publicationReviewedAt,
      publicationReviewedBy: event.partnerId ? "" : event.publicationReviewedBy,
      publicationRejectionReason: ""
    };

    const renderEventUpdateValidationError = (message) =>
      renderPublisherEventManagePage(req, res, event, {
        accessLevel: access.accessLevel,
        message,
        updateFormData: {
          ...req.body,
          deliveryMode,
          city,
          address: String(req.body.address || "").trim(),
          teamsLink: String(req.body.teamsLink || "").trim(),
          holUri: String(req.body.holUri || "").trim(),
          timeZone,
          maxSeats: Number.isInteger(maxSeats) ? maxSeats : req.body.maxSeats,
          startAt: String(req.body.startAt || ""),
          endAt: String(req.body.endAt || ""),
          unlisted
        }
      });

    if (!payload.title || !payload.startAt || !payload.endAt || !payload.deliveryMode) {
      return renderEventUpdateValidationError("Missing required fields for event update");
    }

    if (!["virtual", "in-person", "hybrid"].includes(payload.deliveryMode)) {
      return renderEventUpdateValidationError("Select a valid delivery mode");
    }

    if (["in-person", "hybrid"].includes(payload.deliveryMode) && !payload.city) {
      return renderEventUpdateValidationError("City is required for in-person and hybrid events");
    }

    if (["virtual", "hybrid"].includes(payload.deliveryMode) && !payload.teamsLink) {
      return renderEventUpdateValidationError("Teams link is required for virtual and hybrid events");
    }

    if (!payload.timeZone) {
      return renderEventUpdateValidationError("Time zone is required");
    }

    if (!Number.isInteger(payload.maxSeats) || payload.maxSeats < 1) {
      return renderEventUpdateValidationError("Max seats must be a positive whole number");
    }

    if (["in-person", "hybrid"].includes(payload.deliveryMode) && !payload.address) {
      return renderEventUpdateValidationError("Address is required for in-person and hybrid events");
    }

    if (payload.endAt.getTime() <= payload.startAt.getTime()) {
      return renderEventUpdateValidationError("End date/time must be after start date/time");
    }

    const duplicate = await findDuplicateEventBySignature(
      event.publisherEmail,
      payload.title,
      payload.startAt,
      payload.endAt,
      payload.timeZone
    );
    if (duplicate && String(duplicate.id) !== String(event.id)) {
      return renderEventUpdateValidationError(
        "Another event already exists with the same title, date and time, and time zone"
      );
    }

    const updated = await updateEvent(event.id, event.publisherEmail, payload);
    const auditValues = buildEventAuditValues(event, payload);
    await recordEventAuditEntry({
      eventId: event.id,
      ...getPublisherAuditActor(req),
      action: "updated",
      summary: changeSummary,
      ...auditValues
    });
    clearEventCaches();
    await notifyEventParticipants(
      req,
      updated || event,
      "event-updated",
      changeSummary || "Event details (time/location/link/capacity) were updated."
    );

    const updateMessage = event.partnerId
      ? "Event updated and returned for approval"
      : "Event updated and notifications sent";
    return res.redirect(`/publisher/events/${event.id}?message=${encodeURIComponent(updateMessage)}`);
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/events/:id/registrations", requireEventOperator, (req, res) => {
  const query = req.query.message ? `?message=${encodeURIComponent(req.query.message)}` : "";
  return res.redirect(`/publisher/events/${req.params.id}/reports/registrations${query}`);
});

app.post(
  "/publisher/events/:id/registrations/:registrationId/approve",
  requireEventOperator,
  async (req, res, next) => {
    try {
      const access = await getEventOperatorAccess(req, res);
      if (!access) {
        return;
      }
      const registration = await getRegistrationById(req.params.registrationId);
      if (
        !registration
        || registration.eventId !== access.event.id
        || String(registration.status || "").toLowerCase() !== "pending-approval"
      ) {
        return res.status(404).send("Pending registration not found.");
      }

      const approved = await setRegistrationApproval(
        registration,
        true,
        getEventOperatorEmail(req)
      );
      try {
        await sendRegistrationEmail({
          baseUrl: getPublicBaseUrl(),
          event: {
            ...access.event,
            title: getPartnerEventTitle(access.event)
          },
          registration: approved
        });
      } catch (emailError) {
        console.error("Approved registration email failed", emailError);
      }

      return res.redirect(
        `/publisher/events/${access.event.id}/reports/registrations?message=Registration%20approved`
      );
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/publisher/events/:id/registrations/:registrationId/reject",
  requireEventOperator,
  async (req, res, next) => {
    try {
      const access = await getEventOperatorAccess(req, res);
      if (!access) {
        return;
      }
      const registration = await getRegistrationById(req.params.registrationId);
      if (
        !registration
        || registration.eventId !== access.event.id
        || String(registration.status || "").toLowerCase() !== "pending-approval"
      ) {
        return res.status(404).send("Pending registration not found.");
      }
      const reason = String(req.body.reason || "").trim();
      if (!reason) {
        return res.redirect(
          `/publisher/events/${access.event.id}/reports/registrations?message=Rejection%20reason%20is%20required`
        );
      }

      await setRegistrationApproval(
        registration,
        false,
        getEventOperatorEmail(req),
        reason
      );
      try {
        await sendPlainNotification({
          to: registration.attendeeEmail,
          subject: `Registration update: ${getPartnerEventTitle(access.event)}`,
          text: `Your registration was not approved. Reason: ${reason}`
        });
      } catch (emailError) {
        console.error("Registration rejection email failed", emailError);
      }

      return res.redirect(
        `/publisher/events/${access.event.id}/reports/registrations?message=Registration%20rejected`
      );
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/publisher/events/:id/registrations/:registrationId/attendance",
  requireEventOperator,
  async (req, res, next) => {
    try {
      const access = await getEventOperatorAccess(req, res);
      if (!access) {
        return;
      }

      const registration = await getRegistrationById(req.params.registrationId);
      if (!registration || registration.eventId !== access.event.id) {
        return res.status(404).send("Registration not found");
      }
      if (!isApprovedRegistration(registration)) {
        return res.status(409).send("Approve the registration before marking attendance.");
      }

      const updated = await setRegistrationAttendance(
        registration,
        parseBoolean(req.body.attended),
        getEventOperatorEmail(req)
      );
      if (req.accepts(["html", "json"]) === "json" || req.get("X-Requested-With") === "fetch") {
        return res.json({
          ok: true,
          registrationId: updated.id,
          attended: Boolean(updated.attended)
        });
      }

      return res.redirect(`/publisher/events/${access.event.id}/reports/registrations?message=Attendance%20updated`);
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/publisher/events/:id/registrations/:registrationId/deregister",
  requireEventOperator,
  async (req, res, next) => {
    try {
      const access = await getEventOperatorAccess(req, res);
      if (!access) {
        return;
      }

      const registration = await getRegistrationById(req.params.registrationId);
      if (!registration || registration.eventId !== access.event.id) {
        return res.status(404).send("Registration not found");
      }
      if (!isApprovedRegistration(registration)) {
        return res.status(409).send("Only registered attendees can be deregistered.");
      }

      await deregisterRegistration(
        registration,
        `Deregistered by event operator ${getEventOperatorEmail(req)}`
      );
      return res.redirect(
        `/publisher/events/${access.event.id}/reports/registrations?message=Registrant%20deregistered`
      );
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/publisher/events/:id/registrations/:registrationId/register",
  requireEventOperator,
  async (req, res, next) => {
    try {
      const access = await getEventOperatorAccess(req, res);
      if (!access) {
        return;
      }

      const registration = await getRegistrationById(req.params.registrationId);
      if (!registration || registration.eventId !== access.event.id) {
        return res.status(404).send("Registration not found");
      }
      if (String(registration.status || "").toLowerCase() !== "deregistered") {
        return res.status(409).send("Only deregistered attendees can be registered.");
      }

      await restoreRegistration(registration, getEventOperatorEmail(req));
      return res.redirect(
        `/publisher/events/${access.event.id}/reports/registrations?message=Registrant%20registered`
      );
    } catch (error) {
      next(error);
    }
  }
);

app.get("/publisher/events/:id/registrations/mail-merge.csv", requireEventOperator, async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res);
    if (!access) {
      return;
    }

    const registrations = await listAllRegistrationsByEvent(access.event.id);
    const sortedRegistrations = registrations
      .filter((item) => String(item.status || "registered").toLowerCase() === "registered")
      .sort(
      (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      );
    const csv = buildMailMergeCsv(access.event, sortedRegistrations, getPublicBaseUrl());
    const filenameTitle = sanitizeExportEventTitle(access.event.title)
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "event";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filenameTitle}-mail-merge.csv"`
    );

    return res.send(csv);
  } catch (error) {
    next(error);
  }
});

app.post(
  "/publisher/events/:id/registrations/import/preview",
  requireEventOperator,
  upload.single("attendeeFile"),
  async (req, res, next) => {
    try {
      const access = await getEventOperatorAccess(req, res);
      if (!access) {
        return;
      }

      if (!req.file) {
        return res.redirect(
          `/publisher/events/${access.event.id}/reports/registrations?message=Select%20an%20Excel%20or%20CSV%20file%20to%20upload`
        );
      }

      const rows = parseAttendeeWorkbook(req.file.buffer);
      const registrations = await listAllRegistrationsByEvent(access.event.id);
      const matches = matchAttendeeRows(rows, registrations);
      const piiAccess = canViewEventPii(req, access.event, access.accessLevel);

      return res.render("publisher-registrations-report", {
        event: {
          ...access.event,
          computedStatus: getEventStatus(access.event)
        },
        accessLevel: access.accessLevel,
        operatorType: access.operatorType,
        canManageRegistrations: true,
        registrations: maskRegistrationsForView(registrations, piiAccess),
        reportSummary: buildRegistrationReportSummary(registrations),
        importPreview: matches,
        importPayload: JSON.stringify(matches.filter((row) => row.matchedRegistrationId)),
        labAccessPreview: null,
        labAccessImportToken: "",
        message: "",
        piiRestricted: !piiAccess
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post("/publisher/events/:id/registrations/import/confirm", requireEventOperator, async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res);
    if (!access) {
      return;
    }

    const selectedIds = [...new Set(normalizeIdList(req.body.selectedRegistrationIds))];
    const registrations = await listAllRegistrationsByEvent(access.event.id);
    const byId = new Map(registrations.map((item) => [item.id, item]));

    let updatedCount = 0;
    let restoredCount = 0;
    for (const id of selectedIds) {
      const registration = byId.get(id);
      if (!registration) {
        continue;
      }

      let activeRegistration = registration;
      if (String(registration.status || "").toLowerCase() === "deregistered") {
        activeRegistration = await restoreRegistration(registration, getEventOperatorEmail(req));
        restoredCount += 1;
      }
      if (isApprovedRegistration(activeRegistration)) {
        await setRegistrationAttendance(activeRegistration, true, getEventOperatorEmail(req));
        updatedCount += 1;
      }
    }

    return res.redirect(
      `/publisher/events/${access.event.id}/reports/registrations?message=${encodeURIComponent(
        `Marked ${updatedCount} attendee(s) as attended${restoredCount ? ` and re-registered ${restoredCount}` : ""}`
      )}`
    );
  } catch (error) {
    next(error);
  }
});

app.post(
  "/publisher/events/:id/registrations/lab-access/import/preview",
  requireEventOperator,
  upload.single("labAccessFile"),
  async (req, res, next) => {
    try {
      const access = await getEventOperatorAccess(req, res);
      if (!access) {
        return;
      }

      if (!req.file) {
        return res.redirect(
          `/publisher/events/${access.event.id}/reports/registrations?message=Select%20an%20Excel%20or%20CSV%20roster%20to%20upload`
        );
      }

      const rows = parseLabAccessWorkbook(req.file.buffer);
      if (rows.length > maxLabAccessImportRows) {
        return res.redirect(
          `/publisher/events/${access.event.id}/reports/registrations?message=${encodeURIComponent(
            `Lab roster has ${rows.length} rows; the maximum is ${maxLabAccessImportRows}`
          )}`
        );
      }
      const registrations = await listAllRegistrationsByEvent(access.event.id);
      const matches = matchLabAccessRows(rows, registrations);
      const piiAccess = canViewEventPii(req, access.event, access.accessLevel);
      const labAccessImportToken = randomUUID();
      req.session.labAccessImport = {
        token: labAccessImportToken,
        eventId: access.event.id,
        operatorEmail: getEventOperatorEmail(req),
        createdAt: Date.now(),
        rows: matches.filter((row) => row.matchedRegistrationId)
      };

      return res.render("publisher-registrations-report", {
        event: {
          ...access.event,
          computedStatus: getEventStatus(access.event)
        },
        accessLevel: access.accessLevel,
        operatorType: access.operatorType,
        canManageRegistrations: true,
        registrations: maskRegistrationsForView(registrations, piiAccess),
        reportSummary: buildRegistrationReportSummary(registrations),
        importPreview: null,
        importPayload: "",
        labAccessPreview: matches,
        labAccessImportToken,
        message: "",
        piiRestricted: !piiAccess
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post("/publisher/events/:id/registrations/lab-access/import/confirm", requireEventOperator, async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res);
    if (!access) {
      return;
    }

    const labAccessImport = req.session.labAccessImport;
    delete req.session.labAccessImport;
    const importExpired =
      !labAccessImport
      || Date.now() - Number(labAccessImport.createdAt || 0) > labAccessImportTtlMs;
    if (
      importExpired
      || labAccessImport.token !== String(req.body.labAccessImportToken || "")
      || labAccessImport.eventId !== access.event.id
      || labAccessImport.operatorEmail !== getEventOperatorEmail(req)
      || !Array.isArray(labAccessImport.rows)
    ) {
      return res.redirect(
        `/publisher/events/${access.event.id}/reports/registrations?message=Lab%20access%20preview%20expired%20or%20is%20invalid%2C%20please%20re-upload`
      );
    }

    const submittedRows = labAccessImport.rows;
    const selectedIndexes = new Set(normalizeIdList(req.body.selectedRows));
    const registrations = await listAllRegistrationsByEvent(access.event.id);
    const byId = new Map(registrations.map((item) => [item.id, item]));

    let updatedCount = 0;
    for (let index = 0; index < submittedRows.length; index += 1) {
      if (!selectedIndexes.has(String(index))) {
        continue;
      }

      const row = submittedRows[index];
      const registration = byId.get(row.matchedRegistrationId);
      if (
        !registration
        || registration.eventId !== access.event.id
        || !isApprovedRegistration(registration)
      ) {
        continue;
      }

      await setRegistrationLabAccess(registration, {
        labWebUri: row.labWebUri,
        labVmUsername: row.labVmUsername,
        labVmPassword: row.labVmPassword,
        labPortalUsername: row.labPortalUsername,
        labPortalPassword: row.labPortalPassword,
        labResourceGroup: row.labResourceGroup,
        labDatabaseAccountType: row.labDatabaseAccountType,
        labDatabaseAccountName: row.labDatabaseAccountName,
        labFoundryAccountName: row.labFoundryAccountName
      });
      updatedCount += 1;
    }

    return res.redirect(
      `/publisher/events/${access.event.id}/reports/registrations?message=Assigned%20lab%20access%20for%20${updatedCount}%20registrant(s)`
    );
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/events/:id/reports/registrations", requireEventOperator, async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res);
    if (!access) {
      return;
    }

    const [registrations, personaAssignments] = await Promise.all([
      listAllRegistrationsByEvent(access.event.id),
      listPersonaAssignmentsByEvent(access.event.id)
    ]);
    const piiAccess = canViewEventPii(req, access.event, access.accessLevel);
    const registrationsForView = maskRegistrationsForView(registrations, piiAccess);

    return res.render("publisher-registrations-report", {
      event: {
        ...access.event,
        computedStatus: getEventStatus(access.event)
      },
      accessLevel: access.accessLevel,
      operatorType: access.operatorType,
      canManageRegistrations: true,
      registrations: registrationsForView,
      teamLabRecipients: selectProvisioningTeamMembers(personaAssignments, [], true)
        .filter((member) => member.hasLabAccess),
      reportSummary: buildRegistrationReportSummary(registrations),
      importPreview: null,
      importPayload: "",
      labAccessPreview: null,
      labAccessImportToken: "",
      message: String(req.query.message || ""),
      piiRestricted: !piiAccess
    });
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/events/:id/team-labs/:assignmentId", requireEventOperator, async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res);
    if (!access) {
      return;
    }

    const assignments = await listPersonaAssignmentsByEvent(access.event.id);
    const teamMember = selectProvisioningTeamMembers(assignments, [], true)
      .find((member) => member.hasLabAccess && member.assignment?.id === req.params.assignmentId);
    if (!teamMember) {
      return res.status(404).send("Lab assignment not found.");
    }

    return res.render("team-lab-access", {
      event: access.event,
      teamMember,
      lab: teamMember.assignment
    });
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/events/:id/reports/registrations.xlsx", requireEventOperator, async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res);
    if (!access) {
      return;
    }

    const registrations = await listAllRegistrationsByEvent(access.event.id);
    const piiAccess = canViewEventPii(req, access.event, access.accessLevel);
    const workbook = buildPublisherReportsExcel(
      [{
        event: access.event,
        registrations: maskRegistrationsForView(registrations, piiAccess)
      }],
      ["registrations"]
    );
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="event-${access.event.id}-registration-report.xlsx"`);
    return res.send(workbook);
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/events/:id/reports/organizations.xlsx", requireEventOperator, async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res);
    if (!access) {
      return;
    }

    const registrations = await listAllRegistrationsByEvent(access.event.id);
    const organizations = buildOrganizationReport(registrations);
    const workbook = buildOrganizationExcel(access.event, organizations);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="event-${access.event.id}-organization-report.xlsx"`);
    return res.send(workbook);
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/events/:id/reports/organizations", requireEventOperator, async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res);
    if (!access) {
      return;
    }

    const registrations = await listAllRegistrationsByEvent(access.event.id);
    const organizations = buildOrganizationReport(registrations);
    const piiAccess = canViewEventPii(req, access.event, access.accessLevel);
    const organizationsForView = maskOrganizationReportRows(organizations, piiAccess);

    return res.render("publisher-organization-report", {
      event: {
        ...access.event,
        computedStatus: getEventStatus(access.event)
      },
      organizations: organizationsForView,
      totalRegistered: organizations.reduce((total, row) => total + row.registered, 0),
      totalAttended: organizations.reduce((total, row) => total + row.attended, 0),
      message: String(req.query.message || ""),
      piiRestricted: !piiAccess
    });
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/events/:id/feedback", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res);
    if (!access) {
      return;
    }

    const event = access.event;
    const feedback = await listFeedbackByEvent(event.id);
    const selectedRating = Number.parseInt(req.query.rating, 10);
    const filteredFeedback = Number.isInteger(selectedRating)
      ? feedback.filter((item) => Number(item.rating) === selectedRating)
      : feedback;

    const averageRating = feedback.length
      ? (feedback.reduce((sum, item) => sum + Number(item.rating || 0), 0) / feedback.length).toFixed(2)
      : null;

    const ratingBuckets = [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count: feedback.filter((item) => Number(item.rating) === rating).length
    }));

    const recommendationSplit = {
      yes: feedback.filter((item) => item.recommendation === "yes").length,
      no: feedback.filter((item) => item.recommendation === "no").length
    };

    const followUpInterest = {
      yes: feedback.filter((item) => String(item.needsProjectHelp || "").toLowerCase() === "yes").length,
      no: feedback.filter((item) => String(item.needsProjectHelp || "").toLowerCase() === "no").length
    };

    return res.render("publisher-feedback", {
      event: {
        ...event,
        computedStatus: getEventStatus(event)
      },
      feedback: filteredFeedback,
      allFeedback: feedback,
      feedbackReport: {
        total: feedback.length,
        averageRating,
        recommends: recommendationSplit.yes,
        recommendationSplit,
        ratingBuckets,
        followUpInterest
      },
      filters: {
        rating: Number.isInteger(selectedRating) ? selectedRating : ""
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/personas", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }

    const event = access.event;
    const personaType = String(req.body.personaType || "").trim().toLowerCase();
    const inviteEmail = String(req.body.inviteEmail || "").trim().toLowerCase();
    const personaName = String(req.body.personaName || "").trim();
    const personaPassword = String(req.body.personaPassword || "").trim();
    const availableFrom = normalizeDateTime(req.body.availableFrom);
    const availableTo = normalizeDateTime(req.body.availableTo);

    if (!["speaker", "proctor"].includes(personaType) || !inviteEmail || !availableFrom || !availableTo) {
      return res.redirect(
        `/publisher/events/${event.id}/personas?message=Persona%20invite%20requires%20type%2C%20email%2C%20start%20and%20end%20time.`
      );
    }

    if (availableTo.getTime() <= availableFrom.getTime()) {
      return res.redirect(`/publisher/events/${event.id}/personas?message=Persona%20availability%20end%20must%20be%20after%20start.`);
    }

    const existingAssignment = await findPersonaAssignment(event.id, personaType, inviteEmail);
    if (existingAssignment) {
      return res.redirect(
        `/publisher/events/${event.id}/personas?message=This%20${personaType}%20is%20already%20assigned%20to%20the%20event`
      );
    }

    const existingLogin = await getLoginUserByEmailAndType(inviteEmail, personaType);
    // A publisher account can double as a speaker/proctor without setting a separate password.
    const existingPublisherLogin = !existingLogin ? await getLoginUserByEmailAndType(inviteEmail, "publisher") : null;
    const reusablePassword = existingLogin?.password || existingPublisherLogin?.password || "";
    const reusablePasswordHash = existingLogin?.passwordHash || existingPublisherLogin?.passwordHash || "";

    if (
      isPartnerAccount(req.session.publisher)
      && existingLogin?.partnerId
      && existingLogin.partnerId !== req.session.publisher.partnerId
    ) {
      return res.redirect(
        `/publisher/events/${event.id}/personas?message=This%20user%20belongs%20to%20another%20partner`
      );
    }

    if (!reusablePassword && !reusablePasswordHash && !personaPassword) {
      return res.redirect(
        `/publisher/events/${event.id}/personas?message=Provide%20a%20login%20password%20for%20new%20${personaType}%20users`
      );
    }
    const passwordError = personaPassword ? getPasswordValidationError(personaPassword) : "";
    if (passwordError) {
      return res.redirect(
        `/publisher/events/${event.id}/personas?message=${encodeURIComponent(passwordError)}`
      );
    }

    await upsertLoginUser({
      userType: personaType,
      email: inviteEmail,
      name: personaName || existingLogin?.name || existingPublisherLogin?.name || inviteEmail,
      password: personaPassword ? "" : reusablePassword,
      passwordHash: personaPassword ? hashPassword(personaPassword) : reusablePasswordHash,
      accountClass: isPartnerAccount(req.session.publisher) ? "partner" : existingLogin?.accountClass || "internal",
      partnerId: isPartnerAccount(req.session.publisher) ? req.session.publisher.partnerId : existingLogin?.partnerId || "",
      partnerName: isPartnerAccount(req.session.publisher) ? req.session.publisher.partnerName : existingLogin?.partnerName || "",
      active: true
    });

    const persona = await createPersonaAssignment({
      eventId: event.id,
      publisherEmail: event.publisherEmail,
      partnerId: String(event.partnerId || ""),
      partnerName: String(event.partnerName || ""),
      personaType,
      inviteEmail,
      personaName: personaName || existingLogin?.name || existingPublisherLogin?.name || inviteEmail,
      availableFrom,
      availableTo
    });
    if (existingPublisherLogin && inviteEmail !== String(event.publisherEmail || "").toLowerCase()) {
      await upsertEventCollaborator({
        eventId: event.id,
        ownerPublisherEmail: event.publisherEmail,
        collaboratorEmail: inviteEmail,
        accessLevel: "write"
      });
    }
    await recordEventAuditEntry({
      eventId: event.id,
      ...getPublisherAuditActor(req),
      action: "team-member-added",
      summary: `Added ${inviteEmail} as ${personaType} with writable event access.`,
      newValues: {
        name: personaName || existingLogin?.name || existingPublisherLogin?.name || inviteEmail,
        email: inviteEmail,
        role: personaType,
        availableFrom: availableFrom.toISOString(),
        availableTo: availableTo.toISOString()
      }
    });

    try {
      await sendPersonaInviteEmail({ event, persona });
    } catch (emailError) {
      console.error("Persona invite email failed", emailError);
    }

    await notifyEventParticipants(
      req,
      event,
      "persona-updated",
      `${personaType} availability updated for ${inviteEmail}`
    );

    return res.redirect(`/publisher/events/${event.id}/personas?message=Persona%20invite%20created%20for%20${encodeURIComponent(inviteEmail)}`);
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/events/:id/session-templates", requireEventOperator, async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res, { requireWrite: true });
    if (!access) return;
    const events = getCetTemplateEvents(await getEventsCached())
      .filter((event) => getEventStatus(event) !== "canceled");
    const sessions = await listEventSessionsByEvents(events.map((event) => event.id));
    return res.json({ templates: buildCetSessionTemplates(events, sessions) });
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/events/:id/sessions", requireEventOperator, async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res);
    if (!access) {
      return;
    }

    const event = access.event;
    const [sessions, profiles, personas, loginUsers] = await Promise.all([
      listEventSessions(event.id),
      listFacilitatorProfiles(),
      listPersonaAssignmentsByEvent(event.id),
      listLoginUsers()
    ]);
    const sessionFeedbackBaseUrl = `${getPublicBaseUrl()}/events/${encodeURIComponent(event.id)}/feedback`;
    const sessionsWithInheritedParts = inheritAgendaParts(sessions);
    const sessionsWithFeedback = await Promise.all(
      sessionsWithInheritedParts.map(async (item) => {
        if (item.rowType !== "session") {
          return item;
        }

        const feedbackLink = `${sessionFeedbackBaseUrl}?sessionId=${encodeURIComponent(item.id)}`;
        const feedbackQrCodeDataUrl = await QRCode.toDataURL(feedbackLink, {
          margin: 1,
          width: 120
        });
        return { ...item, feedbackLink, feedbackQrCodeDataUrl };
      })
    );
    const accountProfiles = loginUsers.map((user) => ({
      id: String(user.id || `${user.userType}:${normalizeEmail(user.email)}`),
      email: user.email,
      name: user.name || user.email,
      partnerName: user.partnerName || ""
    }));
    const teamMembers = buildEventTeam({
      assignments: personas,
      profiles: [...profiles, ...accountProfiles],
      sessions: sessionsWithInheritedParts
    });
    const existingPeople = buildExistingPeople(loginUsers);
    const staffingSessions = sessionsWithFeedback.map((sessionItem) => ({
      ...sessionItem,
      speakerMember: resolveAssignedTeamMember(teamMembers, (sessionItem.speakerIds || [])[0]),
      proctorMembers: (sessionItem.proctorIds || [])
        .map((id) => resolveAssignedTeamMember(teamMembers, id))
        .filter(Boolean)
    }));

    return res.render("publisher-event-sessions", {
      event,
      accessLevel: access.accessLevel,
      operatorType: access.operatorType,
      sessions: staffingSessions,
      teamMembers,
      existingPeople,
      isTeamMemberAvailable,
      message: String(req.query.message || ""),
      error: String(req.query.error || "")
    });
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/team-members", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }

    const event = access.event;
    const selectedExistingEmail = normalizeEmail(req.body.existingPersonEmail);
    const loginUsers = selectedExistingEmail ? await listLoginUsers() : [];
    const selectedExistingPerson = loginUsers.find(
      (user) => user.active !== false && normalizeEmail(user.email) === selectedExistingEmail
    );
    if (selectedExistingEmail && !selectedExistingPerson) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=The%20selected%20existing%20person%20is%20not%20available.`);
    }
    const email = selectedExistingPerson
      ? normalizeEmail(selectedExistingPerson.email)
      : normalizeEmail(req.body.email);
    const name = selectedExistingPerson
      ? String(selectedExistingPerson.name || selectedExistingPerson.email).trim()
      : String(req.body.name || "").trim();
    const availabilityMode = String(req.body.availabilityMode || "event").toLowerCase();
    const sessions = await listEventSessions(event.id);
    const workshopSessions = sessions.filter((item) => item.rowType === "session");
    const selectedAvailabilityIds = normalizeIdList(req.body.availableSessionIds)
      .filter((id) => workshopSessions.some((item) => item.id === id));
    let availableFrom = normalizeDateTime(event.startAt);
    let availableTo = normalizeDateTime(event.endAt);

    if (availabilityMode === "selected") {
      const selectedSessions = workshopSessions.filter((item) => selectedAvailabilityIds.includes(item.id));
      if (!selectedSessions.length) {
        return res.redirect(`/publisher/events/${event.id}/sessions?error=Select%20at%20least%20one%20available%20session.`);
      }
      availableFrom = new Date(Math.min(...selectedSessions.map((item) => new Date(item.startAt).getTime())));
      availableTo = new Date(Math.max(...selectedSessions.map((item) => new Date(item.endAt).getTime())));
    } else if (availabilityMode === "custom") {
      availableFrom = normalizeDateTime(req.body.availableFrom);
      availableTo = normalizeDateTime(req.body.availableTo);
    }

    if (
      !isValidEmailAddress(email)
      || !name
      || !["event", "selected", "custom"].includes(availabilityMode)
      || !availableFrom
      || !availableTo
      || availableTo <= availableFrom
    ) {
      return res.redirect(
        `/publisher/events/${event.id}/sessions?error=Provide%20a%20name%2C%20valid%20email%2C%20and%20availability.`
      );
    }

    const [speakerLogin, proctorLogin, publisherLogin, profiles] = await Promise.all([
      getLoginUserByEmailAndType(email, "speaker"),
      getLoginUserByEmailAndType(email, "proctor"),
      getLoginUserByEmailAndType(email, "publisher"),
      listFacilitatorProfiles()
    ]);
    const sourceLogin = selectedExistingPerson || speakerLogin || proctorLogin || publisherLogin;

    const accountDetails = {
      email,
      name,
      password: sourceLogin?.password || "",
      passwordHash: sourceLogin?.passwordHash || "",
      accountClass: sourceLogin?.accountClass || (isPartnerAccount(req.session.publisher) ? "partner" : "internal"),
      partnerId: sourceLogin?.partnerId || (isPartnerAccount(req.session.publisher) ? req.session.publisher.partnerId : ""),
      partnerName: sourceLogin?.partnerName || (isPartnerAccount(req.session.publisher) ? req.session.publisher.partnerName : ""),
      active: true
    };
    await upsertLoginUser({
      ...accountDetails,
      userType: "speaker",
      password: speakerLogin?.password ?? accountDetails.password,
      passwordHash: speakerLogin?.passwordHash ?? accountDetails.passwordHash
    });
    await upsertLoginUser({
      ...accountDetails,
      userType: "proctor",
      password: proctorLogin?.password ?? accountDetails.password,
      passwordHash: proctorLogin?.passwordHash ?? accountDetails.passwordHash
    });

    const profileNameParts = name.split(/\s+/).filter(Boolean);
    for (const profileType of ["speaker", "proctor"]) {
      const existingProfile = profiles.find(
        (profile) =>
          normalizeEmail(profile.email) === email
          && String(profile.profileType || "").toLowerCase() === profileType
          && normalizeEmail(profile.publisherEmail) === normalizeEmail(event.publisherEmail)
      );
      await upsertFacilitatorProfile({
        id: existingProfile?.id,
        createdAt: existingProfile?.createdAt,
        profileType,
        email,
        firstName: existingProfile?.firstName || profileNameParts[0] || name,
        lastName: existingProfile?.lastName || profileNameParts.slice(1).join(" "),
        name,
        experience: existingProfile?.experience || "",
        role: existingProfile?.role || "",
        organization: existingProfile?.organization || "",
        expertise: existingProfile?.expertise || "",
        bio: existingProfile?.bio || "",
        publisherEmail: event.publisherEmail
      });
    }

    const availableSessionIds = availabilityMode === "selected" ? selectedAvailabilityIds : [];
    const assignSpeakerAll = parseBoolean(req.body.assignSpeakerAll);
    const assignProctorAll = parseBoolean(req.body.assignProctorAll);
    for (const personaType of ["speaker", "proctor"]) {
      const existingAssignment = await findPersonaAssignment(event.id, personaType, email);
      await createPersonaAssignment({
        ...existingAssignment,
        id: existingAssignment?.id,
        createdAt: existingAssignment?.createdAt,
        eventId: event.id,
        publisherEmail: event.publisherEmail,
        partnerId: String(event.partnerId || ""),
        partnerName: String(event.partnerName || ""),
        personaType,
        inviteEmail: email,
        availableFrom,
        availableTo,
        availableSessionIds,
        assignAllSessions: personaType === "speaker" ? assignSpeakerAll : assignProctorAll
      });
    }
    const writableAccessShared = Boolean(
      publisherLogin
      && email !== normalizeEmail(event.publisherEmail)
    );
    if (writableAccessShared) {
      await upsertEventCollaborator({
        eventId: event.id,
        ownerPublisherEmail: event.publisherEmail,
        collaboratorEmail: email,
        accessLevel: "write"
      });
    }
    await recordEventAuditEntry({
      eventId: event.id,
      ...getPublisherAuditActor(req),
      action: "team-member-added",
      summary: `Added ${email} to the event team${writableAccessShared ? " and shared writable publisher access" : ""}.`,
      newValues: {
        name,
        email,
        roles: ["speaker", "proctor"],
        availableFrom: availableFrom.toISOString(),
        availableTo: availableTo.toISOString(),
        writableAccessShared
      }
    });

    const member = {
      id: toTeamMemberId(email),
      email,
      availableFrom: availableFrom.toISOString(),
      availableTo: availableTo.toISOString(),
      availableSessionIds
    };
    if (assignSpeakerAll || assignProctorAll) {
      await Promise.all(workshopSessions.map((sessionItem) => {
        if (!isTeamMemberAvailable(member, sessionItem)) {
          return Promise.resolve();
        }
        return createEventSession({
          ...sessionItem,
          speakerIds: assignSpeakerAll ? [member.id] : sessionItem.speakerIds || [],
          proctorIds: assignProctorAll
            ? [...new Set([...(sessionItem.proctorIds || []), member.id])]
            : sessionItem.proctorIds || []
        });
      }));
    }

    let setupUrl = "";
    if (!sourceLogin?.password && !sourceLogin?.passwordHash) {
      const token = randomBytes(32).toString("base64url");
      await createFacilitatorInvitation({
        tokenHash: hashFacilitatorInvitationToken(token),
        eventId: event.id,
        email,
        name,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdBy: req.session.publisher.email
      });
      setupUrl = new URL(`/facilitator/invite/${token}`, getPublicBaseUrl()).toString();
    }

    let invitationSent = true;
    try {
      await sendTeamMemberInviteEmail({ event, email, name, setupUrl });
    } catch (emailError) {
      console.error("Event team invitation email failed", emailError);
      invitationSent = false;
    }

    return res.redirect(
      `/publisher/events/${event.id}/sessions?message=${encodeURIComponent(
        `${name} was added to the event team${assignSpeakerAll || assignProctorAll ? " and assigned to available sessions" : ""}.${invitationSent ? " Invitation sent." : " Invitation email failed; submit the person again to retry."}`
      )}${invitationSent ? "" : "&notification=error"}#session-staffing`
    );
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/session-staffing/bulk", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }
    const event = access.event;
    const [sessions, profiles, assignments, loginUsers] = await Promise.all([
      listEventSessions(event.id),
      listFacilitatorProfiles(),
      listPersonaAssignmentsByEvent(event.id),
      listLoginUsers()
    ]);
    const teamMembers = buildEventTeam({
      assignments,
      profiles: [
        ...profiles,
        ...loginUsers.map((user) => ({
          id: String(user.id || `${user.userType}:${normalizeEmail(user.email)}`),
          email: user.email,
          name: user.name || user.email,
          partnerName: user.partnerName || ""
        }))
      ],
      sessions
    });
    const member = findTeamMember(teamMembers, req.body.teamMemberId);
    const assignmentRole = String(req.body.assignmentRole || "").toLowerCase();
    const selectedSessionIds = new Set(normalizeIdList(req.body.selectedSessionIds));
    if (!member || !["speaker", "proctor", "both"].includes(assignmentRole) || !selectedSessionIds.size) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=Choose%20a%20team%20member%2C%20role%2C%20and%20at%20least%20one%20session.#session-staffing`);
    }

    const updatedSessions = applyBulkStaffing(
      sessions,
      member,
      assignmentRole,
      [...selectedSessionIds]
    );
    const selectedSessions = sessions.filter((item) => item.rowType === "session" && selectedSessionIds.has(String(item.id)));
    if (selectedSessions.length !== selectedSessionIds.size) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=Select%20valid%20workshop%20sessions.#session-staffing`);
    }
    if (!updatedSessions.length) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=This%20person%20is%20not%20available%20for%20the%20selected%20sessions.#session-staffing`);
    }
    for (const sessionItem of updatedSessions) {
      await createEventSession(sessionItem);
    }
    return res.redirect(
      `/publisher/events/${event.id}/sessions?message=${encodeURIComponent(`Updated ${updatedSessions.length} available session(s).${selectedSessions.length > updatedSessions.length ? ` Skipped ${selectedSessions.length - updatedSessions.length} unavailable session(s).` : ""}`)}#session-staffing`
    );
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/session-staffing/session", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }
    const event = access.event;
    const [sessions, profiles, assignments, loginUsers] = await Promise.all([
      listEventSessions(event.id),
      listFacilitatorProfiles(),
      listPersonaAssignmentsByEvent(event.id),
      listLoginUsers()
    ]);
    const sessionItem = sessions.find((item) => item.id === String(req.body.sessionId || ""));
    if (!sessionItem || sessionItem.rowType !== "session") {
      return res.status(404).send("Workshop session not found.");
    }
    const teamMembers = buildEventTeam({
      assignments,
      profiles: [
        ...profiles,
        ...loginUsers.map((user) => ({
          id: String(user.id || `${user.userType}:${normalizeEmail(user.email)}`),
          email: user.email,
          name: user.name || user.email,
          partnerName: user.partnerName || ""
        }))
      ],
      sessions
    });
    const speaker = req.body.speakerMemberId
      ? findTeamMember(teamMembers, req.body.speakerMemberId)
      : null;
    const proctors = normalizeIdList(req.body.proctorMemberIds)
      .map((id) => findTeamMember(teamMembers, id))
      .filter(Boolean);
    if ((req.body.speakerMemberId && !speaker) || proctors.length !== normalizeIdList(req.body.proctorMemberIds).length) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=Choose%20people%20from%20this%20event%20team.#session-staffing`);
    }
    if (
      (speaker && !isTeamMemberAvailable(speaker, sessionItem))
      || proctors.some((member) => !isTeamMemberAvailable(member, sessionItem))
    ) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=One%20or%20more%20selected%20people%20are%20not%20available%20for%20that%20session.#session-staffing`);
    }
    await createEventSession({
      ...sessionItem,
      speakerIds: speaker ? [speaker.id] : [],
      proctorIds: [...new Set(proctors.map((member) => member.id))]
    });
    return res.redirect(`/publisher/events/${event.id}/sessions?message=Session%20staffing%20updated.#session-staffing`);
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/facilitator-profiles", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }

    const event = access.event;
    const profileType = String(req.body.profileType || "").trim().toLowerCase();
    const email = String(req.body.email || "").trim().toLowerCase();
    const firstName = String(req.body.firstName || "").trim();
    const lastName = String(req.body.lastName || "").trim();
    const name = [firstName, lastName].filter(Boolean).join(" ") || String(req.body.name || "").trim();
    if (!["speaker", "proctor"].includes(profileType) || !email || !firstName || !lastName) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=Profile%20type%2C%20first%20name%2C%20last%20name%2C%20and%20email%20are%20required.`);
    }

    let existingProfile = null;
    if (req.body.id) {
      existingProfile = (await listFacilitatorProfiles()).find((profile) => profile.id === String(req.body.id));
      if (!existingProfile || existingProfile.publisherEmail !== String(event.publisherEmail || "").toLowerCase()) {
        return res.status(403).send("Not authorized.");
      }
    }

    await upsertFacilitatorProfile({
      id: existingProfile?.id,
      createdAt: existingProfile?.createdAt,
      profileType,
      email,
      firstName,
      lastName,
      name,
      experience: req.body.experience,
      role: req.body.role,
      organization: req.body.organization,
      expertise: req.body.expertise,
      bio: req.body.bio,
      publisherEmail: event.publisherEmail
    });

    return res.redirect(`/publisher/events/${event.id}/sessions?message=${encodeURIComponent(`${profileType} profile saved.`)}`);
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/facilitator-profiles/:profileId/delete", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }

    const event = access.event;
    const profile = (await listFacilitatorProfiles()).find((item) => item.id === req.params.profileId);
    if (!profile || profile.publisherEmail !== String(event.publisherEmail || "").toLowerCase()) {
      return res.status(403).send("Not authorized.");
    }

    await deleteFacilitatorProfile(req.params.profileId);
    return res.redirect(`/publisher/events/${event.id}/sessions?message=Facilitator%20profile%20removed.`);
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/sessions/grid", requireEventOperator, tsgUpload.any(), async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }
    const event = access.event;
    const [existingSessions, profiles, assignments, loginUsers] = await Promise.all([
      listEventSessions(event.id),
      listFacilitatorProfiles(),
      listPersonaAssignmentsByEvent(event.id),
      listLoginUsers()
    ]);
    const teamMembers = buildEventTeam({
      assignments,
      profiles: [
        ...profiles,
        ...loginUsers.map((user) => ({
          id: String(user.id || `${user.userType}:${normalizeEmail(user.email)}`),
          email: user.email,
          name: user.name || user.email,
          partnerName: user.partnerName || ""
        }))
      ],
      sessions: existingSessions
    });
    const existingById = new Map(existingSessions.map((sessionItem) => [String(sessionItem.id), sessionItem]));
    const rowEntries = Object.entries(req.body.rows || {});
    if (!rowEntries.length) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=No%20session%20rows%20were%20submitted.`);
    }
    const tsgFilesByRow = new Map();
    for (const file of req.files || []) {
      const match = String(file.fieldname || "").match(/^rows\[(.+)\]\[tsgFile\]$/);
      if (!match) {
        continue;
      }
      if (!TSG_CONTENT_TYPES.has(String(file.mimetype || "").toLowerCase())) {
        return res.redirect(
          `/publisher/events/${event.id}/sessions?error=TSG%20files%20must%20be%20PDF%2C%20Office%2C%20or%20text%20documents.`
        );
      }
      tsgFilesByRow.set(match[1], file);
    }

    const updates = [];
    const shouldRebalance = parseBoolean(req.body.rebalance);
    for (const [rowKey, row] of rowEntries) {
      const existing = existingById.get(String(row.id || ""));
      if (!existing) {
        return res.redirect(`/publisher/events/${event.id}/sessions?error=One%20or%20more%20session%20rows%20no%20longer%20exist.`);
      }
      if (parseBoolean(row.remove)) {
        updates.push({ remove: true, existing });
        continue;
      }
      const startAt = normalizeDateTime(row.startAt);
      const durationMinutes = Number.parseInt(row.durationMinutes, 10);
      const endAt = startAt && Number.isInteger(durationMinutes)
        ? new Date(startAt.getTime() + durationMinutes * 60000)
        : null;
      const title = String(row.title || "").trim();
      if (!title || !startAt || !endAt || !Number.isInteger(durationMinutes) || durationMinutes < 1) {
        return res.redirect(`/publisher/events/${event.id}/sessions?error=Every%20grid%20row%20needs%20a%20title%2C%20start%2C%20and%20positive%20duration.`);
      }
      if (!shouldRebalance && (startAt < new Date(event.startAt) || endAt > new Date(event.endAt))) {
        return res.redirect(`/publisher/events/${event.id}/sessions?error=Every%20grid%20row%20must%20fit%20inside%20the%20event%20window.`);
      }
      const speaker = existing.rowType === "session" && row.speakerMemberId
        ? findTeamMember(teamMembers, row.speakerMemberId)
        : null;
      const proctors = existing.rowType === "session"
        ? normalizeIdList(row.proctorMemberIds).map((id) => findTeamMember(teamMembers, id)).filter(Boolean)
        : [];
      const scheduledRow = { ...existing, startAt, endAt };
      if (
        (speaker && !isTeamMemberAvailable(speaker, scheduledRow))
        || proctors.some((member) => !isTeamMemberAvailable(member, scheduledRow))
      ) {
        return res.redirect(`/publisher/events/${event.id}/sessions?error=One%20or%20more%20selected%20people%20are%20not%20available%20for%20that%20session.`);
      }
      const tsgFile = tsgFilesByRow.get(rowKey);
      const removeTsg = parseBoolean(row.removeTsg);
      updates.push({
        remove: false,
        existing,
        value: {
          ...existing,
          sequence: Number.parseInt(row.sequence, 10) || existing.sequence,
          part: row.part,
          sessionCode: row.sessionCode,
          title,
          format: row.format,
          description: String(row.focus || "").trim(),
          durationMinutes,
          startAt,
          endAt,
          speakerIds: speaker ? [speaker.id] : [],
          proctorIds: [...new Set(proctors.map((member) => member.id))],
          tsgFileName: removeTsg ? "" : tsgFile?.originalname || existing.tsgFileName || "",
          tsgContentType: removeTsg ? "" : tsgFile?.mimetype || existing.tsgContentType || "",
          tsgBase64: removeTsg ? "" : tsgFile?.buffer.toString("base64") || existing.tsgBase64 || ""
        }
      });
    }

    if (shouldRebalance) {
      const activeUpdates = updates
        .filter((item) => !item.remove)
        .sort((left, right) => Number(left.value.sequence) - Number(right.value.sequence));
      const rebalanced = rebalanceScheduledRows(activeUpdates.map((item) => item.value), event.startAt);
      if (rebalanced.at(-1)?.endAt > new Date(event.endAt)) {
        return res.redirect(`/publisher/events/${event.id}/sessions?error=The%20rebalanced%20agenda%20extends%20past%20the%20event%20end.`); 
      }
      const unavailableAfterRebalance = rebalanced.find((value) => {
        const assignedMembers = [...(value.speakerIds || []), ...(value.proctorIds || [])]
          .map((id) => findTeamMember(teamMembers, id))
          .filter(Boolean);
        return assignedMembers.some((member) => !isTeamMemberAvailable(member, value));
      });
      if (unavailableAfterRebalance) {
        return res.redirect(`/publisher/events/${event.id}/sessions?error=${encodeURIComponent(`Rebalancing moves ${unavailableAfterRebalance.title} outside an assigned team member's availability.`)}`);
      }
      rebalanced.forEach((value, index) => {
        activeUpdates[index].value = value;
      });
    }

    for (const update of updates) {
      if (update.remove) {
        await deleteEventSession(update.existing.id);
      } else {
        await createEventSession(update.value);
      }
    }
    await recordEventAuditEntry({
      eventId: event.id,
      ...getPublisherAuditActor(req),
      action: "agenda-grid-updated",
      summary: `${shouldRebalance ? "Rebalanced and updated" : "Updated"} ${updates.filter((item) => !item.remove).length} and removed ${updates.filter((item) => item.remove).length} agenda row(s).`
    });
    return res.redirect(`/publisher/events/${event.id}/sessions?message=${shouldRebalance ? "Agenda%20saved%20and%20rebalanced." : "Agenda%20grid%20saved."}`);
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/sessions/add-breaks", requireEventOperator, async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }
    const event = access.event;
    const sessions = await listEventSessions(event.id);
    const scheduledRows = rebalanceScheduledRows(
      insertLogicalBreaks(sessions.sort((left, right) => Number(left.sequence) - Number(right.sequence))),
      event.startAt
    );
    if (scheduledRows.at(-1)?.endAt > new Date(event.endAt)) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=Breaks%20do%20not%20fit%20inside%20the%20event%20window.%20Extend%20the%20event%20or%20shorten%20sessions.`);
    }

    for (const sessionItem of sessions.filter((item) => ["lunch", "snack"].includes(String(item.rowType).toLowerCase()))) {
      await deleteEventSession(sessionItem.id);
    }
    for (const row of scheduledRows) {
      await createEventSession({
        ...row,
        id: row.id,
        eventId: event.id,
        publisherEmail: event.publisherEmail
      });
    }
    const breakCount = scheduledRows.filter((row) => ["lunch", "snack"].includes(row.rowType)).length;
    await recordEventAuditEntry({
      eventId: event.id,
      ...getPublisherAuditActor(req),
      action: "agenda-breaks-added",
      summary: `Rebuilt the agenda with ${breakCount} logical break(s) and rebalanced all start times.`
    });
    return res.redirect(`/publisher/events/${event.id}/sessions?message=${encodeURIComponent(`${breakCount} logical break(s) added and the agenda rebalanced.`)}`);
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/sessions/import", requireEventOperator, async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }
    const event = access.event;
    const importMode = String(req.body.importMode || "replace").trim().toLowerCase();
    if (!["replace", "append"].includes(importMode)) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=Choose%20whether%20to%20replace%20or%20append%20the%20agenda.`);
    }
    const overwrite = importMode === "replace";
    const overallDurationMinutes = Number.parseInt(req.body.overallDurationMinutes, 10);
    if (!Number.isInteger(overallDurationMinutes) || overallDurationMinutes < 15 || overallDurationMinutes > 10080) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=Overall%20event%20duration%20must%20be%20between%2015%20and%2010080%20minutes.`);
    }
    const requestedEventEnd = new Date(new Date(event.startAt).getTime() + overallDurationMinutes * 60000);
    const [existingSessions, assignments] = await Promise.all([
      listEventSessions(event.id),
      listPersonaAssignmentsByEvent(event.id)
    ]);
    let agendaRows;
    try {
      agendaRows = parseAgendaTable(req.body.agendaTable);
    } catch (error) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=${encodeURIComponent(error.message)}`);
    }
    const scheduleStart = overwrite || !existingSessions.length
      ? new Date(event.startAt)
      : new Date(Math.max(...existingSessions.map((item) => new Date(item.endAt).getTime())));
    const scheduledRows = buildScheduledAgenda(agendaRows, scheduleStart);
    if (scheduledRows[scheduledRows.length - 1].endAt > requestedEventEnd) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=${encodeURIComponent("The pasted agenda extends beyond the event end time. Increase the event duration or shorten the agenda.")}`);
    }
    const duplicate = await findDuplicateEventBySignature(
      event.publisherEmail,
      event.title,
      event.startAt,
      requestedEventEnd,
      event.timeZone
    );
    if (duplicate && String(duplicate.id) !== String(event.id)) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=${encodeURIComponent("Another event already exists with the same title, date and time, and time zone.")}`);
    }

    if (overwrite) {
      for (const sessionItem of existingSessions) {
        await deleteEventSession(sessionItem.id);
      }
    }
    const sequenceOffset = overwrite
      ? 0
      : Math.max(0, ...existingSessions.map((item) => Number(item.sequence) || 0));
    for (const row of scheduledRows) {
      const staffing = getInheritedSessionStaffing(assignments, row);
      await createEventSession({
        eventId: event.id,
        publisherEmail: event.publisherEmail,
        ...row,
        sequence: sequenceOffset + row.sequence,
        speakerIds: staffing.speakerIds,
        proctorIds: staffing.proctorIds
      });
    }
    if (requestedEventEnd.getTime() !== new Date(event.endAt).getTime()) {
      await updateEvent(event.id, event.publisherEmail, {
        ...event,
        endAt: requestedEventEnd
      });
      clearEventCaches();
    }
    await recordEventAuditEntry({
      eventId: event.id,
      ...getPublisherAuditActor(req),
      action: overwrite ? "agenda-overwritten" : "agenda-imported",
      summary: `${overwrite ? "Replaced the agenda with" : "Added"} ${scheduledRows.length} pasted session(s) and set the event duration to ${overallDurationMinutes} minutes.`,
      newValues: {
        importMode,
        sessionCount: scheduledRows.length,
        overallDurationMinutes,
        eventEndAt: requestedEventEnd.toISOString()
      }
    });
    return res.redirect(`/publisher/events/${event.id}/sessions?message=${encodeURIComponent(`${overwrite ? "Replaced" : "Added"} ${scheduledRows.length} agenda session(s).`)}`);
  } catch (error) {
    next(error);
  }
});

app.post(
  "/publisher/events/:id/sessions",
  requireEventOperator,
  tsgUpload.single("tsgFile"),
  async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }

    const event = access.event;
    const rowType = String(req.body.rowType || "session").trim().toLowerCase();
    const title = String(req.body.title || (rowType === "lunch" ? "Lunch Break" : rowType === "snack" ? "Snack Break" : "")).trim();
    const description = String(req.body.description || "").trim();
    const durationMinutes = Number.parseInt(req.body.durationMinutes, 10);
    const sessionId = String(req.body.sessionId || "").trim();
    const sequence = Number.parseInt(req.body.sequence, 10) || 1;
    const requestedStart = normalizeDateTime(req.body.startAt);
    const requestedEnd = normalizeDateTime(req.body.endAt);
    const [existingSessions, assignments] = await Promise.all([
      listEventSessions(event.id),
      listPersonaAssignmentsByEvent(event.id)
    ]);
    const existing = sessionId ? existingSessions.find((item) => item.id === sessionId) : null;
    if (req.file && !TSG_CONTENT_TYPES.has(String(req.file.mimetype || "").toLowerCase())) {
      return res.redirect(
        `/publisher/events/${event.id}/sessions?error=TSG%20must%20be%20a%20PDF%2C%20Office%20document%2C%20or%20text%20file.`
      );
    }
    const removeTsg = parseBoolean(req.body.removeTsg);
    const previousSessions = existingSessions
      .filter((item) => item.id !== sessionId && Number(item.sequence) < sequence)
      .sort((a, b) => Number(b.sequence) - Number(a.sequence));
    const previousEnd = previousSessions[0] ? normalizeDateTime(previousSessions[0].endAt) : null;
    const startAt = requestedStart || previousEnd || normalizeDateTime(event.startAt);
    const endAt = requestedEnd || (startAt && Number.isInteger(durationMinutes) ? new Date(startAt.getTime() + durationMinutes * 60000) : null);

    if (!["session", "lunch", "snack"].includes(rowType) || !title || !startAt || !endAt || !Number.isInteger(durationMinutes) || durationMinutes < 1) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=Provide%20a%20row%20type%2C%20title%2C%20duration%2C%20and%20valid%20schedule.`);
    }

    const eventStart = normalizeDateTime(event.startAt);
    const eventEnd = normalizeDateTime(event.endAt);
    if (endAt <= startAt || (eventStart && startAt < eventStart) || (eventEnd && endAt > eventEnd)) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=Session%20timing%20must%20fit%20inside%20the%20event%20window.`);
    }
    const normalizedTitle = title.replace(/\s+/g, " ").toLowerCase();
    const duplicateSession = existingSessions.find((item) =>
      String(item.id) !== sessionId
      && String(item.rowType || "session").toLowerCase() === rowType
      && String(item.title || "").trim().replace(/\s+/g, " ").toLowerCase() === normalizedTitle
      && new Date(item.startAt).getTime() === startAt.getTime()
      && new Date(item.endAt).getTime() === endAt.getTime()
    );
    if (duplicateSession) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=An%20identical%20session%20already%20exists.`);
    }
    const inheritedStaffing = existing
      ? { speakerIds: existing.speakerIds || [], proctorIds: existing.proctorIds || [] }
      : getInheritedSessionStaffing(
        assignments,
        { id: "", startAt, endAt }
      );
    const inheritedPart = [...existingSessions]
      .filter((item) => item.id !== sessionId && Number(item.sequence) < sequence && String(item.part || "").trim())
      .sort((left, right) => Number(right.sequence) - Number(left.sequence))[0]?.part || "";

    await createEventSession({
      id: existing?.id,
      eventId: event.id,
      publisherEmail: event.publisherEmail,
      rowType,
      title,
      description,
      part: req.body.part || existing?.part || inheritedPart,
      sessionCode: req.body.sessionCode,
      format: req.body.format,
      durationMinutes,
      startAt,
      endAt,
      speakerIds: Object.prototype.hasOwnProperty.call(req.body, "speakerId")
        ? (req.body.speakerId ? [String(req.body.speakerId).trim()] : [])
        : inheritedStaffing.speakerIds,
      proctorIds: Object.prototype.hasOwnProperty.call(req.body, "proctorIds")
        ? normalizeIdList(req.body.proctorIds)
        : inheritedStaffing.proctorIds,
      tsgFileName: removeTsg ? "" : req.file?.originalname || existing?.tsgFileName || "",
      tsgContentType: removeTsg ? "" : req.file?.mimetype || existing?.tsgContentType || "",
      tsgBase64: removeTsg
        ? ""
        : req.file?.buffer.toString("base64") || existing?.tsgBase64 || "",
      sequence
    });

    return res.redirect(`/publisher/events/${event.id}/sessions?message=${encodeURIComponent(existing ? "Session updated." : "Session added.")}`);
  } catch (error) {
    next(error);
  }
  }
);

app.post("/publisher/events/:id/sessions/auto-generate", requireEventOperator, async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }

    const event = access.event;
    const eventStart = normalizeDateTime(event.startAt);
    const eventEnd = normalizeDateTime(event.endAt);
    if (!eventStart || !eventEnd || eventEnd <= eventStart) {
      return res.redirect(`/publisher/events/${event.id}/sessions?error=Event%20schedule%20is%20invalid.`);
    }

    const [existingSessions, assignments] = await Promise.all([
      listEventSessions(event.id),
      listPersonaAssignmentsByEvent(event.id)
    ]);
    const existingStartTimes = new Set(
      existingSessions
        .map((item) => normalizeDateTime(item.startAt))
        .filter(Boolean)
        .map((date) => date.getTime())
    );
    const maxSequence = existingSessions.reduce((max, item) => Math.max(max, Number(item.sequence || 0)), 0);

    const oneHourMs = 60 * 60000;
    const slots = [];
    let cursor = eventStart.getTime();
    while (cursor < eventEnd.getTime()) {
      const slotStart = new Date(cursor);
      const slotEndMs = Math.min(cursor + oneHourMs, eventEnd.getTime());
      const slotEnd = new Date(slotEndMs);
      slots.push({
        startAt: slotStart,
        endAt: slotEnd,
        durationMinutes: Math.round((slotEndMs - cursor) / 60000)
      });
      cursor = slotEndMs;
    }

    const missingSlots = slots.filter((slot) => !existingStartTimes.has(slot.startAt.getTime()));
    if (!missingSlots.length) {
      return res.redirect(
        `/publisher/events/${event.id}/sessions?message=Hourly%20session%20slots%20already%20exist%20for%20this%20event%20window.`
      );
    }

    await missingSlots.reduce(
      (chain, slot, index) =>
        chain.then(() => {
          const staffing = getInheritedSessionStaffing(assignments, slot);
          return createEventSession({
            eventId: event.id,
            publisherEmail: event.publisherEmail,
            rowType: "session",
            title: `Session ${maxSequence + index + 1}`,
            description: "",
            durationMinutes: slot.durationMinutes,
            startAt: slot.startAt,
            endAt: slot.endAt,
            speakerIds: staffing.speakerIds,
            proctorIds: staffing.proctorIds,
            sequence: maxSequence + index + 1
          });
        }),
      Promise.resolve()
    );

    return res.redirect(
      `/publisher/events/${event.id}/sessions?message=${encodeURIComponent(`${missingSlots.length} hourly session slot(s) created. Assign a speaker and proctors to each row below.`)}`
    );
  } catch (error) {
    next(error);
  }
});

app.post("/publisher/events/:id/sessions/:sessionId/delete", requireEventOperator, async (req, res, next) => {
  try {
    const access = await getEventOperatorAccess(req, res, { requireWrite: true });
    if (!access) {
      return;
    }

    const event = access.event;
    const sessions = await listEventSessions(event.id);
    if (!sessions.some((item) => item.id === req.params.sessionId)) {
      return res.status(404).send("Session not found");
    }

    await deleteEventSession(req.params.sessionId);
    return res.redirect(`/publisher/events/${event.id}/sessions?message=Session%20removed.`);
  } catch (error) {
    next(error);
  }
});

app.get("/help", (req, res) => {
  res.render("help");
});

app.get("/events/:id/register", async (req, res, next) => {
  try {
    const event = await getEventById(req.params.id);
    if (!event) {
      return res.status(404).send("Event not found");
    }
    if (getPublicationStatus(event) !== "approved") {
      return res.status(404).send("Event registration is not available.");
    }

    const eventStatus = getEventStatus(event);
    const organizations = await getKnownOrganizationsCached();
    const knownOrganizations = getCanonicalOrganizationSuggestions(organizations);
    if (["completed", "canceled"].includes(eventStatus)) {
      return res.status(400).render("register", {
        event: {
          ...event,
          computedStatus: eventStatus
        },
        error: "Registrations are closed for this event.",
        registrationCount: 0,
        remainingSeats: 0,
        organizations,
        knownOrganizations,
        countries: COUNTRIES,
        jobRoles: JOB_ROLES,
        countryPhoneCodes: COUNTRY_PHONE_CODES
      });
    }

    const registrations = await listRegistrationsByEvent(event.id);
    const registrationCount = registrations.length;
    const maxSeats = Number.isInteger(event.maxSeats) ? event.maxSeats : null;
    const remainingSeats = maxSeats === null ? null : Math.max(maxSeats - registrationCount, 0);
    const previewEvent = isPreviewEvent(event);
    return res.render("register", {
      event: {
        ...event,
        computedStatus: eventStatus
      },
      isPreviewEvent: previewEvent,
      error: "",
      existingRegistrationCode: null,
      registrationCount,
      remainingSeats,
      organizations,
      knownOrganizations,
      countries: COUNTRIES,
      jobRoles: JOB_ROLES,
      countryPhoneCodes: COUNTRY_PHONE_CODES,
      formData: {
        salutation: "",
        firstName: "",
        middleName: "",
        lastName: "",
        companyName: "",
        contactConsent: "no",
        previewAuthorization: previewEvent ? "no" : "yes"
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/events/:id/register", async (req, res, next) => {
  try {
    const event = await getEventById(req.params.id);
    if (!event) {
      return res.status(404).send("Event not found");
    }
    if (getPublicationStatus(event) !== "approved") {
      return res.status(404).send("Event registration is not available.");
    }

    const organizations = await getKnownOrganizationsCached();
    const knownOrganizations = getCanonicalOrganizationSuggestions(organizations);
    const eventStatus = getEventStatus(event);
    if (["completed", "canceled"].includes(eventStatus)) {
      return res.status(400).render("register", {
        event: {
          ...event,
          computedStatus: eventStatus
        },
        error: "Registrations are closed for this event.",
        registrationCount: 0,
        remainingSeats: 0,
        organizations,
        knownOrganizations,
        countries: COUNTRIES,
        jobRoles: JOB_ROLES,
        countryPhoneCodes: COUNTRY_PHONE_CODES,
        isPreviewEvent: isPreviewEvent(event),
        existingRegistrationCode: null,
        formData: {}
      });
    }

    const salutation = String(req.body.salutation || "").trim();
    const firstName = String(req.body.firstName || "").trim();
    const middleName = String(req.body.middleName || "").trim();
    const lastName = String(req.body.lastName || "").trim();
    const attendeeName = [salutation, firstName, middleName, lastName].filter(Boolean).join(" ");
    const attendeeEmail = String(req.body.attendeeEmail || "").trim().toLowerCase();
    const jobRole = String(req.body.jobRole || "").trim();
    const country = String(req.body.country || "").trim();
    const countryCode = normalizeCountryCode(req.body.phoneCountryCode);
    const phoneRaw = String(req.body.phoneNumber || "").trim();
    const phoneNumber = normalizePhoneNumber(countryCode, phoneRaw);
    const organizationSize = event.partnerId
      ? String(req.body.organizationSize || "").trim()
      : "";
    const partnerContactAllowed = isPartnerContactConfigured(event)
      && isPartnerContactCountryAllowed(country, COUNTRIES);
    const partnerOptIn = partnerContactAllowed && req.body.partnerOptIn === "yes";
    const eventDiscoverySource = String(req.body.eventDiscoverySource || "").trim();
    const companyNameInput = String(req.body.companyName || "").trim();
    const manualCompanyNameRequired = requiresManualCompanyName(attendeeEmail);
    const derivedCompanyName = manualCompanyNameRequired ? "" : deriveCompanyName(attendeeEmail);
    const companyName = companyNameInput || derivedCompanyName;
    const organization = canonicalizeOrganizationName(companyName, organizations);
    // Event registration does not grant Microsoft marketing contact permissions.
    const contactConsent = "no";
    const previewAuthorization = String(req.body.previewAuthorization || "").trim().toLowerCase();
    const previewEvent = isPreviewEvent(event);
    const formDataBase = {
      salutation,
      firstName,
      middleName,
      lastName,
      attendeeEmail,
      jobRole,
      country,
      phoneCountryCode: countryCode,
      phoneNumber: phoneRaw,
      organizationSize,
      partnerOptIn,
      eventDiscoverySource,
      companyName,
      contactConsent,
      previewAuthorization
    };
    const renderDuplicateRegistration = async (existingRegistration = null) => {
      const registrations = await listRegistrationsByEvent(event.id);
      const registrationCount = registrations.length;
      const maxSeats = Number.isInteger(event.maxSeats) ? event.maxSeats : null;
      const remainingSeats = maxSeats === null ? null : Math.max(maxSeats - registrationCount, 0);

      return res.status(409).render("register", {
        event: {
          ...event,
          computedStatus: eventStatus
        },
        isPreviewEvent: previewEvent,
        error: "This email address has already been used to sign up for this event.",
        existingRegistrationCode: existingRegistration?.registrationCode || null,
        registrationCount,
        remainingSeats,
        organizations,
        knownOrganizations,
        countries: COUNTRIES,
        jobRoles: JOB_ROLES,
        countryPhoneCodes: COUNTRY_PHONE_CODES,
        isPreviewEvent: isPreviewEvent(event),
        existingRegistrationCode: null,
        formData: req.body || {},
        formData: formDataBase
      });
    };

    if (event.partnerId && !ORGANIZATION_SIZES.includes(organizationSize)) {
      const registrations = await listRegistrationsByEvent(event.id);
      const registrationCount = registrations.length;
      const maxSeats = Number.isInteger(event.maxSeats) ? event.maxSeats : null;
      const remainingSeats = maxSeats === null ? null : Math.max(maxSeats - registrationCount, 0);

      return res.status(400).render("register", {
        event: {
          ...event,
          computedStatus: eventStatus
        },
        isPreviewEvent: previewEvent,
        error: "Select the size of your organization.",
        registrationCount,
        remainingSeats,
        organizations,
        knownOrganizations,
        countries: COUNTRIES,
        jobRoles: JOB_ROLES,
        countryPhoneCodes: COUNTRY_PHONE_CODES,
        formData: formDataBase
      });
    }

    if (event.partnerId && req.body.partnerOptIn === "yes" && !partnerContactAllowed) {
      const registrations = await listRegistrationsByEvent(event.id);
      const registrationCount = registrations.length;
      const maxSeats = Number.isInteger(event.maxSeats) ? event.maxSeats : null;
      const remainingSeats = maxSeats === null ? null : Math.max(maxSeats - registrationCount, 0);

      return res.status(400).render("register", {
        event: {
          ...event,
          computedStatus: eventStatus
        },
        isPreviewEvent: previewEvent,
        error: "Partner contact permissions are not available for this event or selected country. You can register without selecting this option.",
        registrationCount,
        remainingSeats,
        organizations,
        knownOrganizations,
        countries: COUNTRIES,
        jobRoles: JOB_ROLES,
        countryPhoneCodes: COUNTRY_PHONE_CODES,
        formData: formDataBase
      });
    }

    if (previewEvent && previewAuthorization !== "yes") {
      const registrations = await listRegistrationsByEvent(event.id);
      const registrationCount = registrations.length;
      const maxSeats = Number.isInteger(event.maxSeats) ? event.maxSeats : null;
      const remainingSeats = maxSeats === null ? null : Math.max(maxSeats - registrationCount, 0);

      return res.status(400).render("register", {
        event: {
          ...event,
          computedStatus: eventStatus
        },
        isPreviewEvent: previewEvent,
        error: "Preview authorization consent is required to continue.",
        registrationCount,
        remainingSeats,
        organizations,
        knownOrganizations,
        countries: COUNTRIES,
        jobRoles: JOB_ROLES,
        countryPhoneCodes: COUNTRY_PHONE_CODES,
        formData: formDataBase
      });
    }

    if (!firstName || !lastName || !attendeeEmail) {
      const registrations = await listRegistrationsByEvent(event.id);
      const registrationCount = registrations.length;
      const maxSeats = Number.isInteger(event.maxSeats) ? event.maxSeats : null;
      const remainingSeats = maxSeats === null ? null : Math.max(maxSeats - registrationCount, 0);

      return res.status(400).render("register", {
        event: {
          ...event,
          computedStatus: eventStatus
        },
        isPreviewEvent: previewEvent,
        error: "First name, last name, and email are required.",
        registrationCount,
        remainingSeats,
        organizations,
        knownOrganizations,
        countries: COUNTRIES,
        jobRoles: JOB_ROLES,
        countryPhoneCodes: COUNTRY_PHONE_CODES,
        formData: formDataBase
      });
    }

    if (!isValidEmailAddress(attendeeEmail)) {
      const registrations = await listRegistrationsByEvent(event.id);
      const registrationCount = registrations.length;
      const maxSeats = Number.isInteger(event.maxSeats) ? event.maxSeats : null;
      const remainingSeats = maxSeats === null ? null : Math.max(maxSeats - registrationCount, 0);

      return res.status(400).render("register", {
        event: {
          ...event,
          computedStatus: eventStatus
        },
        isPreviewEvent: previewEvent,
        error: "Enter a valid email address without commas or spaces.",
        registrationCount,
        remainingSeats,
        organizations,
        knownOrganizations,
        countries: COUNTRIES,
        jobRoles: JOB_ROLES,
        countryPhoneCodes: COUNTRY_PHONE_CODES,
        formData: formDataBase
      });
    }

    if (manualCompanyNameRequired && !companyNameInput) {
      const registrations = await listRegistrationsByEvent(event.id);
      const registrationCount = registrations.length;
      const maxSeats = Number.isInteger(event.maxSeats) ? event.maxSeats : null;
      const remainingSeats = maxSeats === null ? null : Math.max(maxSeats - registrationCount, 0);

      return res.status(400).render("register", {
        event: {
          ...event,
          computedStatus: eventStatus
        },
        isPreviewEvent: previewEvent,
        error: "Company name is required for Gmail and Outlook email addresses.",
        registrationCount,
        remainingSeats,
        organizations,
        knownOrganizations,
        countries: COUNTRIES,
        jobRoles: JOB_ROLES,
        countryPhoneCodes: COUNTRY_PHONE_CODES,
        formData: formDataBase
      });
    }

    if (isDisallowedOrganizationName(companyNameInput)) {
      const registrations = await listRegistrationsByEvent(event.id);
      const registrationCount = registrations.length;
      const maxSeats = Number.isInteger(event.maxSeats) ? event.maxSeats : null;
      const remainingSeats = maxSeats === null ? null : Math.max(maxSeats - registrationCount, 0);

      return res.status(400).render("register", {
        event: {
          ...event,
          computedStatus: eventStatus
        },
        isPreviewEvent: previewEvent,
        error: "Enter your actual organization name. Nil, personal, and student are not accepted.",
        registrationCount,
        remainingSeats,
        organizations,
        knownOrganizations,
        countries: COUNTRIES,
        jobRoles: JOB_ROLES,
        countryPhoneCodes: COUNTRY_PHONE_CODES,
        formData: formDataBase
      });
    }

    if (attendeeEmail.endsWith("@gmail.com") && !companyNameInput) {
      const registrations = await listRegistrationsByEvent(event.id);
      const registrationCount = registrations.length;
      const maxSeats = Number.isInteger(event.maxSeats) ? event.maxSeats : null;
      const remainingSeats = maxSeats === null ? null : Math.max(maxSeats - registrationCount, 0);

      return res.status(400).render("register", {
        event: {
          ...event,
          computedStatus: eventStatus
        },
        isPreviewEvent: previewEvent,
        error: "Company name is required for gmail.com email addresses.",
        registrationCount,
        remainingSeats,
        organizations,
        knownOrganizations,
        countries: COUNTRIES,
        jobRoles: JOB_ROLES,
        countryPhoneCodes: COUNTRY_PHONE_CODES,
        formData: formDataBase
      });
    }

    const existing = await findRegistrationByEventAndEmail(event.id, attendeeEmail);
    if (existing) {
      if (String(existing.status || "").toLowerCase() === "pending-approval") {
        return res.redirect(`/registrations/${existing.id}/success?existing=true`);
      }
      return renderDuplicateRegistration(existing);
    }

    const registrations = await listRegistrationsByEvent(event.id);
    if (Number.isInteger(event.maxSeats) && registrations.length >= event.maxSeats) {
      return res.status(400).render("register", {
        event: {
          ...event,
          computedStatus: eventStatus
        },
        isPreviewEvent: previewEvent,
        error: "All seats are filled for this event.",
        registrationCount: registrations.length,
        remainingSeats: 0,
        organizations,
        knownOrganizations,
        countries: COUNTRIES,
        jobRoles: JOB_ROLES,
        countryPhoneCodes: COUNTRY_PHONE_CODES,
        formData: formDataBase
      });
    }

    let registration;
    try {
      registration = await createRegistration({
        eventId: event.id,
        attendeeName,
        salutation,
        firstName,
        middleName,
        lastName,
        attendeeEmail,
        organization,
        companyName,
        phoneNumber,
        jobRole,
        country,
        organizationSize,
        partnerOptIn,
        eventDiscoverySource,
        contactConsent,
        previewAuthorization: previewEvent ? previewAuthorization : "not-applicable",
        pendingApproval: Boolean(event.partnerId)
      });
    } catch (error) {
      if (error && error.code === 409) {
        return renderDuplicateRegistration();
      }
      throw error;
    }

    if (event.partnerId) {
      try {
        await sendPlainNotification({
          to: event.publisherEmail,
          subject: `Registration pending: ${getPartnerEventTitle(event)}`,
          text: `${registration.attendeeName} (${registration.attendeeEmail}) submitted a registration that requires approval.`
        });
      } catch (emailError) {
        console.error("Pending registration notification failed", emailError);
      }
    } else {
      try {
        await sendRegistrationEmail({
          baseUrl: getPublicBaseUrl(),
          event,
          registration
        });
      } catch (emailError) {
        console.error("Registration email failed", emailError);
      }
    }

    return res.redirect(`/registrations/${registration.id}/success`);
  } catch (error) {
    next(error);
  }
});

app.get("/events/:id/feedback", async (req, res, next) => {
  try {
    const event = await getEventById(req.params.id);
    if (!event) {
      return res.status(404).send("Event not found");
    }

    const sessions = await listEventSessions(event.id);
    const sessionId = String(req.query.sessionId || "").trim();
    const selectedSession = sessions.find((item) => item.id === sessionId) || null;
    const lookupEmail = String(
      req.query.email || req.session.registrant?.attendeeEmail || ""
    ).trim().toLowerCase();
    let matchedRegistration = null;
    if (lookupEmail) {
      matchedRegistration = await findActiveRegistrationByEventAndEmail(event.id, lookupEmail);
    }

    const hasLabAccess = Boolean(
      matchedRegistration &&
        (matchedRegistration.labWebUri ||
          matchedRegistration.labVmUsername ||
          matchedRegistration.labPortalUsername ||
          matchedRegistration.labResourceGroup ||
          matchedRegistration.labDatabaseAccountName)
    );

    return res.render("feedback-form", {
      event,
      error: "",
      projectTypes: FEEDBACK_PROJECT_TYPES,
      followUpTypes: FEEDBACK_FOLLOW_UP_TYPES,
      sessions,
      selectedSession,
      lookupEmail,
      labAccess: hasLabAccess ? matchedRegistration : null,
      showLabDetails: req.query.view === "lab",
      initialStep: "ratings",
      formData: {
        rating: "",
        recommendation: "",
        comments: "",
        candidateEmail: "",
        contactConsent: "no",
        needsProjectHelp: "no",
        projectType: [],
        followUpType: [],
        followUpDetails: "",
        sessionId: selectedSession?.id || "",
        sessionRatings: {},
        databaseAccountName: matchedRegistration?.labDatabaseAccountName || ""
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/events/:id/feedback", async (req, res, next) => {
  try {
    const event = await getEventById(req.params.id);
    if (!event) {
      return res.status(404).send("Event not found");
    }

    const sessions = await listEventSessions(event.id);
    const sessionId = String(req.body.sessionId || "").trim();
    const selectedSession = sessionId ? sessions.find((item) => item.id === sessionId) || null : null;
    const comments = String(req.body.comments || "").trim();
    const recommendation = String(req.body.recommendation || "").trim().toLowerCase();
    const rating = typeof req.body.rating === "number"
      ? req.body.rating
      : typeof req.body.rating === "string" && /^[1-5]$/.test(req.body.rating)
        ? Number(req.body.rating)
        : NaN;
    const needsProjectHelp = String(req.body.needsProjectHelp || "").trim().toLowerCase();
    const wantsFollowUp = needsProjectHelp === "yes";
    const candidateEmail = wantsFollowUp ? String(req.body.candidateEmail || "").trim().toLowerCase() : "";
    const contactConsent = wantsFollowUp && req.body.contactConsent === "yes" ? "yes" : "no";
    const submittedProjectTypes = wantsFollowUp ? req.body.projectType : [];
    const projectChoices = Array.isArray(submittedProjectTypes)
      ? submittedProjectTypes
      : submittedProjectTypes ? [submittedProjectTypes] : [];
    const projectTypes = [...new Set(
      projectChoices.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean)
    )];
    const submittedFollowUpTypes = wantsFollowUp ? req.body.followUpType : [];
    const followUpChoices = Array.isArray(submittedFollowUpTypes)
      ? submittedFollowUpTypes
      : submittedFollowUpTypes ? [submittedFollowUpTypes] : [];
    const followUpTypes = [...new Set(
      followUpChoices.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean)
    )];
    const followUpDetails = wantsFollowUp ? String(req.body.followUpDetails || "").trim() : "";
    const lookupEmail = String(req.body.lookupEmail || candidateEmail || req.session.registrant?.attendeeEmail || "")
      .trim()
      .toLowerCase();
    const databaseAccountName = wantsFollowUp ? String(req.body.databaseAccountName || "").trim() : "";
    const submittedSessionRatings = req.body.sessionRatings === undefined ? {} : req.body.sessionRatings;
    const hasSessionRatingsObject = submittedSessionRatings !== null
      && typeof submittedSessionRatings === "object"
      && !Array.isArray(submittedSessionRatings);
    const eventSessions = new Map(sessions.map((item) => [String(item.id), item]));
    const sessionRatings = [];
    const sessionRatingValues = {};
    let sessionRatingError = hasSessionRatingsObject ? "" : "Please use the session star buttons to rate sessions.";
    if (hasSessionRatingsObject) {
      for (const [ratedSessionId, value] of Object.entries(submittedSessionRatings)) {
        const ratedSession = eventSessions.get(ratedSessionId);
        if (!ratedSession) {
          sessionRatingError = "A rated session does not belong to this event.";
        } else if (typeof value !== "string" || !/^[1-5]$/.test(value)) {
          sessionRatingError = "Each session rating must be between 1 and 5 stars.";
        } else {
          sessionRatingValues[ratedSessionId] = value;
          sessionRatings.push({
            sessionId: ratedSessionId,
            sessionTitle: ratedSession.title,
            rating: Number(value)
          });
        }
      }
    }

    let matchedRegistration = null;
    if (lookupEmail) {
      matchedRegistration = await findActiveRegistrationByEventAndEmail(event.id, lookupEmail);
    }
    const hasLabAccess = Boolean(
      matchedRegistration &&
        (matchedRegistration.labWebUri ||
          matchedRegistration.labVmUsername ||
          matchedRegistration.labPortalUsername ||
          matchedRegistration.labResourceGroup ||
          matchedRegistration.labDatabaseAccountName)
    );
    const labAccess = hasLabAccess ? matchedRegistration : null;

    const formData = {
      rating: Number.isInteger(rating) ? String(rating) : "",
      recommendation,
      comments,
      candidateEmail,
      contactConsent,
      needsProjectHelp,
      projectType: projectTypes,
      followUpType: followUpTypes,
      followUpDetails,
      sessionId,
      sessionRatings: sessionRatingValues,
      databaseAccountName
    };

    const renderFeedbackError = (error, initialStep = "ratings") =>
      res.status(400).render("feedback-form", {
        event,
        error,
        projectTypes: FEEDBACK_PROJECT_TYPES,
        followUpTypes: FEEDBACK_FOLLOW_UP_TYPES,
        sessions,
        selectedSession,
        lookupEmail,
        labAccess,
        initialStep,
        formData
      });

    if (sessionId && !selectedSession) {
      return renderFeedbackError("The selected session does not belong to this event.");
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return renderFeedbackError("Please rate the event from 1 to 5 stars.");
    }

    if (!["yes", "no"].includes(recommendation)) {
      return renderFeedbackError("Please choose whether you would recommend this event to others.");
    }

    if (sessionRatingError) {
      return renderFeedbackError(sessionRatingError);
    }

    if (!["yes", "no"].includes(needsProjectHelp)) {
      return renderFeedbackError("Please choose whether you would like help with an existing or new project.");
    }

    if (wantsFollowUp && !isValidEmailAddress(candidateEmail)) {
      return renderFeedbackError("Provide a valid email address for your requested follow-up.", "follow-up");
    }

    if (wantsFollowUp && contactConsent !== "yes") {
      return renderFeedbackError("Please allow Microsoft to contact you about the follow-up you requested.", "follow-up");
    }

    if (wantsFollowUp && (
      projectChoices.some((value) => typeof value !== "string")
      || projectTypes.some((value) => !FEEDBACK_PROJECT_TYPES.includes(value))
    )) {
      return renderFeedbackError("Please choose a valid project type from the checkbox list.", "follow-up");
    }

    if (wantsFollowUp && !projectTypes.length) {
      return renderFeedbackError("Please select Existing project, New project, or both.", "follow-up");
    }

    if (wantsFollowUp && (
      followUpChoices.some((value) => typeof value !== "string")
      || followUpTypes.some((value) => !FEEDBACK_FOLLOW_UP_TYPES.includes(value))
    )) {
      return renderFeedbackError("Please choose a valid follow-up type from the checkbox list.", "follow-up");
    }

    if (wantsFollowUp && !followUpTypes.length) {
      return renderFeedbackError("Please select at least one follow-up type.", "follow-up");
    }

    if (matchedRegistration && !hasLabAccess && databaseAccountName) {
      await setRegistrationDatabaseAccountName(matchedRegistration, databaseAccountName);
    }

    await createFeedback({
      eventId: event.id,
      candidateName: candidateEmail ? candidateEmail.split("@")[0] : "Responder",
      candidateEmail,
      comments,
      recommendation,
      rating,
      contactConsent,
      needsProjectHelp,
      projectTypes,
      followUpType: followUpTypes.join(", "),
      followUpTypes,
      followUpDetails,
      sessionId: selectedSession?.id || "",
      sessionTitle: selectedSession?.title || "",
      sessionRatings,
      databaseAccountName
    });

    return res.render("feedback-success", {
      event
    });
  } catch (error) {
    next(error);
  }
});

app.get("/registrations/:id/success", async (req, res, next) => {
  try {
    const registration = await getRegistrationById(req.params.id);
    if (!registration) {
      return res.status(404).send("Registration not found");
    }

    const event = await getEventById(registration.eventId);
    if (!event) {
      return res.status(404).send("Event not found");
    }

    return res.render("registration-success", {
      registration,
      event,
      existing: parseBoolean(req.query.existing),
      deregisterLink: `/registrant/deregister?email=${encodeURIComponent(registration.attendeeEmail)}&code=${encodeURIComponent(registration.registrationCode)}`
    });
  } catch (error) {
    next(error);
  }
});

app.get("/registrations/:id/invite.ics", async (req, res, next) => {
  try {
    const registration = await getRegistrationById(req.params.id);
    if (!registration) {
      return res.status(404).send("Registration not found");
    }
    if (String(registration.status || "registered").toLowerCase() !== "registered" || !registration.registrationCode) {
      return res.status(403).send("Calendar invite is available after registration approval.");
    }

    // Anonymous access is allowed for the just-registered success page, but a logged-in
    // registrant must own the registration to prevent downloading another attendee's invite.
    if (
      req.session.registrant &&
      String(registration.attendeeEmail || "").toLowerCase() !== req.session.registrant.attendeeEmail
    ) {
      return res.status(403).send("Not authorized for this invite.");
    }

    const event = await getEventById(registration.eventId);
    if (!event) {
      return res.status(404).send("Event not found");
    }

    const invite = createInvite({
      event: {
        ...event,
        title: getPartnerEventTitle(event)
      },
      attendeeEmail: registration.attendeeEmail,
      attendeeName: registration.attendeeName,
      uidPrefix: "attendee"
    });

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="event-${event.id}-registration-${registration.id}.ics"`
    );

    return res.send(invite);
  } catch (error) {
    next(error);
  }
});

app.get("/events/:id/publisher-invite.ics", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res);
    if (!access) {
      return;
    }

    const event = access.event;
    const invite = createInvite({
      event,
      attendeeEmail: req.session.publisher.email,
      attendeeName: "Publisher",
      uidPrefix: "publisher"
    });

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="event-${event.id}-publisher.ics"`);

    return res.send(invite);
  } catch (error) {
    next(error);
  }
});

app.get("/registrant/login", (req, res) => {
  const params = new URLSearchParams({ persona: "registrant" });
  const email = String(req.query.email || req.query.attendeeEmail || "").trim().toLowerCase();
  const code = String(req.query.code || req.query.registrationCode || "").trim().toUpperCase();
  if (email) {
    params.set("email", email);
  }
  if (code) {
    params.set("code", code);
  }
  return res.redirect(`/login?${params.toString()}`);
});

app.post("/registrant/login", async (req, res, next) => {
  try {
    return handlePersonaLogin(req, res, "registrant");
  } catch (error) {
    next(error);
  }
});

app.post("/registrant/logout", (req, res) => {
  return res.redirect(307, "/logout");
});

app.get(
  "/events/:id/sessions/:sessionId/tsg",
  requireEventOperator,
  async (req, res, next) => {
    try {
      const access = await getEventOperatorAccess(req, res, {
        includeFacilitatorContext: true
      });
      if (!access) {
        return;
      }

      const sessions = access.facilitatorContext?.sessions
        || await listEventSessions(access.event.id);
      const sessionItem = sessions.find(
        (item) => String(item.id) === String(req.params.sessionId)
      );
      if (!sessionItem) {
        return res.status(404).send("Session not found");
      }
      if (
        access.facilitatorContext
        && !access.facilitatorContext.assignedSessions.some(
          (item) => String(item.id) === String(sessionItem.id)
        )
      ) {
        return res.status(403).send("Not authorized for this session.");
      }
      if (!sessionItem.tsgBase64 || !sessionItem.tsgFileName) {
        return res.status(404).send("TSG attachment not found");
      }

      const fileName = String(sessionItem.tsgFileName).replace(/[\r\n"]/g, "").trim() || "session-tsg";
      res.setHeader("Content-Type", sessionItem.tsgContentType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      return res.send(Buffer.from(sessionItem.tsgBase64, "base64"));
    } catch (error) {
      next(error);
    }
  }
);

app.get("/facilitator/invite/:token", async (req, res, next) => {
  try {
    const invitation = await getFacilitatorInvitation(
      hashFacilitatorInvitationToken(req.params.token)
    );
    const expired = !invitation || new Date(invitation.expiresAt).getTime() <= Date.now();
    if (expired || invitation.usedAt) {
      return res.status(410).render("facilitator-invite", {
        invitation: null,
        token: "",
        error: "This invitation link is invalid, expired, or has already been used.",
        success: ""
      });
    }
    return res.render("facilitator-invite", {
      invitation,
      token: req.params.token,
      error: "",
      success: ""
    });
  } catch (error) {
    next(error);
  }
});

app.post("/facilitator/invite/:token", async (req, res, next) => {
  try {
    const invitation = await getFacilitatorInvitation(
      hashFacilitatorInvitationToken(req.params.token)
    );
    const expired = !invitation || new Date(invitation.expiresAt).getTime() <= Date.now();
    if (expired || invitation.usedAt) {
      return res.status(410).render("facilitator-invite", {
        invitation: null,
        token: "",
        error: "This invitation link is invalid, expired, or has already been used.",
        success: ""
      });
    }
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");
    const passwordError = getPasswordValidationError(password);
    if (passwordError || password !== confirmPassword) {
      return res.status(400).render("facilitator-invite", {
        invitation,
        token: req.params.token,
        error: passwordError || "Passwords do not match.",
        success: ""
      });
    }

    await consumeFacilitatorInvitation(invitation);
    const passwordHash = hashPassword(password);
    for (const userType of ["speaker", "proctor"]) {
      const loginUser = await getLoginUserByEmailAndType(invitation.email, userType);
      await upsertLoginUser({
        ...loginUser,
        userType,
        email: invitation.email,
        name: invitation.name || loginUser?.name || invitation.email,
        password: "",
        passwordHash,
        active: true
      });
    }
    return res.render("facilitator-invite", {
      invitation,
      token: "",
      error: "",
      success: "Your facilitator password is set. You can now sign in."
    });
  } catch (error) {
    next(error);
  }
});

app.get("/facilitator/dashboard", requireFacilitator, async (req, res, next) => {
  try {
    const assignments = req.session.facilitator.persona === "facilitator"
      ? await listPersonaAssignmentsByEmail(req.session.facilitator.email)
      : await listPersonaAssignmentsByEmailAndType(
          req.session.facilitator.email,
          req.session.facilitator.persona
        );
    const assignmentsByEvent = new Map();
    for (const assignment of assignments) {
      const eventId = String(assignment.eventId || "");
      if (!assignmentsByEvent.has(eventId)) {
        assignmentsByEvent.set(eventId, {
          ...assignment,
          roles: []
        });
      }
      const role = String(assignment.personaType || "").toLowerCase();
      if (role && !assignmentsByEvent.get(eventId).roles.includes(role)) {
        assignmentsByEvent.get(eventId).roles.push(role);
      }
    }
    const facilitatorProfiles = await listFacilitatorProfiles();

    const hydrated = await Promise.all(
      [...assignmentsByEvent.values()].map(async (assignment) => {
        const [event, sessions, registrationCounts] = await Promise.all([
          getEventById(assignment.eventId),
          listEventSessions(assignment.eventId),
          getRegistrationCountsByEvent(assignment.eventId)
        ]);
        const [member] = buildEventTeam({
          assignments: [assignment],
          profiles: facilitatorProfiles,
          sessions
        });
        const sessionRoles = sessions
          .filter((sessionItem) => sessionItem.rowType === "session")
          .map((sessionItem) => {
            const roles = [];
            if (member && (sessionItem.speakerIds || []).some((id) => member.aliasIds.includes(String(id)))) {
              roles.push("Speaker");
            }
            if (member && (sessionItem.proctorIds || []).some((id) => member.aliasIds.includes(String(id)))) {
              roles.push("Proctor");
            }
            return roles.length ? { title: sessionItem.title, roles } : null;
          })
          .filter(Boolean);
        return {
          assignment,
          event,
          eventStatus: getEventStatus(event),
          registrationCount: registrationCounts.registrationCount,
          attendedCount: registrationCounts.attendedCount,
          sessionRoles
        };
      })
    );

    const upcoming = hydrated.filter((item) => ["upcoming", "ongoing"].includes(item.eventStatus));
    const past = hydrated.filter((item) => item.eventStatus === "completed");

    return res.render("facilitator-dashboard", {
      upcoming,
      past,
      persona: req.session.facilitator.persona,
      message: String(req.query.message || "")
    });
  } catch (error) {
    next(error);
  }
});

app.get("/facilitator/events/:id", requireFacilitator, async (req, res, next) => {
  try {
    const context = await getFacilitatorEventContext(req, res);
    if (!context) {
      return;
    }

    const registrations = await listAllRegistrationsByEvent(context.event.id);
    const sessions = context.assignedSessions.map((sessionItem) => {
      const roles = [];
      if ((sessionItem.speakerIds || []).some((id) => context.member.aliasIds.includes(String(id)))) {
        roles.push("Speaker");
      }
      if ((sessionItem.proctorIds || []).some((id) => context.member.aliasIds.includes(String(id)))) {
        roles.push("Proctor");
      }
      return { ...sessionItem, roles };
    });

    return res.render("facilitator-event-detail", {
      event: {
        ...context.event,
        computedStatus: getEventStatus(context.event)
      },
      sessions,
      reportSummary: buildRegistrationReportSummary(registrations),
      persona: req.session.facilitator.persona,
      assignments: context.eventAssignments,
      member: context.member,
      message: String(req.query.message || "")
    });
  } catch (error) {
    next(error);
  }
});

app.get("/registrant/dashboard", requireRegistrant, async (req, res, next) => {
  try {
    const registrations = await listRegistrationsByEmail(req.session.registrant.attendeeEmail);
    const hydrated = await Promise.all(
      registrations.map(async (registration) => {
        const event = await getEventById(registration.eventId);
        return {
          registration,
          event,
          eventStatus: getEventStatus(event)
        };
      })
    );

    const upcoming = hydrated.filter((item) => ["upcoming", "ongoing"].includes(item.eventStatus));
    const past = hydrated.filter((item) => item.eventStatus === "completed");

    return res.render("registrant-dashboard", {
      upcoming,
      past,
      message: String(req.query.message || "")
    });
  } catch (error) {
    next(error);
  }
});

app.post("/registrant/labs/:registrationId/vm-power", requireRegistrant, async (req, res, next) => {
  try {
    const registration = await getRegistrationById(req.params.registrationId);
    if (
      !registration
      || String(registration.attendeeEmail || "").trim().toLowerCase() !== req.session.registrant.attendeeEmail
    ) {
      return res.status(404).send("Registration not found for this logged-in account.");
    }

    const action = String(req.body.action || "").trim().toLowerCase();
    if (!["start", "stop"].includes(action)) {
      return res.status(400).send("VM action must be start or stop.");
    }
    const callbackUrl = `https://${req.get("host")}/api/registrations/${encodeURIComponent(registration.id)}/vm-status`;
    const dispatch = await dispatchLabVmWorkflow(registration, action, callbackUrl);
    if (!dispatch.dispatched) {
      return res.redirect(`/registrant/dashboard?message=${encodeURIComponent(`VM action could not be started: ${dispatch.reason}`)}`);
    }

    const pendingStatus = action === "start" ? "starting" : "stopping";
    await setRegistrationVmStatus(
      registration,
      pendingStatus,
      action === "start" ? "VM start requested. Wait for Running before opening Bastion." : "VM shutdown requested."
    );
    return res.redirect(`/registrant/dashboard?message=${encodeURIComponent(`VM ${action} requested. Status will update automatically.`)}`);
  } catch (error) {
    next(error);
  }
});

app.get("/registrant/deregister", (req, res) => {
  return res.render("registrant-deregister", {
    message: "",
    error: "",
    defaults: {
      attendeeEmail: String(req.query.email || ""),
      registrationCode: String(req.query.code || "")
    }
  });
});

app.post("/registrant/deregister", async (req, res, next) => {
  try {
    let registration;

    if (req.session.registrant && req.body.registrationId) {
      registration = await getRegistrationById(req.body.registrationId);
      if (
        !registration ||
        String(registration.attendeeEmail || "").toLowerCase() !== req.session.registrant.attendeeEmail
      ) {
        return res.status(404).render("registrant-deregister", {
          message: "",
          error: "Registration not found for this logged-in account.",
          defaults: {
            attendeeEmail: req.session.registrant.attendeeEmail,
            registrationCode: ""
          }
        });
      }
    } else {
      const attendeeEmail = String(req.body.attendeeEmail || "").trim().toLowerCase();
      const registrationCode = String(req.body.registrationCode || "").trim().toUpperCase();
      if (!attendeeEmail || !registrationCode) {
        return res.status(400).render("registrant-deregister", {
          message: "",
          error: "Email and registration code are required.",
          defaults: {
            attendeeEmail,
            registrationCode
          }
        });
      }

      registration = await getRegistrationByEmailAndCode(attendeeEmail, registrationCode);
      if (!registration) {
        return res.status(404).render("registrant-deregister", {
          message: "",
          error: "No active registration found with this email and code.",
          defaults: {
            attendeeEmail,
            registrationCode
          }
        });
      }
    }

    await deregisterRegistration(registration, String(req.body.reason || "").trim());

    if (req.session.registrant) {
      return res.redirect("/registrant/dashboard?message=Registration%20deregistered%20successfully");
    }

    return res.render("registrant-deregister", {
      message: "Registration has been deregistered successfully.",
      error: "",
      defaults: {
        attendeeEmail: "",
        registrationCode: ""
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/publisher/events/:id/personas", requirePublisher, async (req, res, next) => {
  try {
    const access = await getPublisherEventAccess(req, res);
    if (!access) {
      return;
    }
    const params = new URLSearchParams();
    if (req.query.message) {
      params.set("message", String(req.query.message));
    }
    const query = params.toString();
    return res.redirect(
      `/publisher/events/${access.event.id}/sessions${query ? `?${query}` : ""}#event-team`
    );
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  const errorCode = Number(error?.code || 500);
  const errorText = String(error?.body?.message || error?.message || "");
  if (error?.type === "entity.too.large" || error?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).send(
      "The uploaded file or submitted form is too large. Keep roster files under 5 MB and try again."
    );
  }
  if (errorCode === 403 && errorText.toLowerCase().includes("cosmos")) {
    return res.status(503).send("Cosmos DB access is blocked by firewall settings. Please allow this app's outbound IPs and your current public IP in Cosmos DB networking.");
  }

  res.status(500).send(`Unexpected server error: ${errorText || "Internal server error"}`);
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
