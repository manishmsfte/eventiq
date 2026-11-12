const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const {
  PARTNER_CONTACT_EXCLUDED_COUNTRIES,
  isPartnerContactConfigured,
  isPartnerContactCountryAllowed
} = require("../services/partner-rules");

const viewsDirectory = path.join(__dirname, "..", "views");

test("returns from Open Event to the publisher workspace without relying on browser history", async () => {
  const breadcrumbs = await renderView("partials/breadcrumbs.ejs", {
    items: [{ label: "Home", href: "/" }, { label: "Publisher", href: "/publisher" }, { label: "Partner workshop" }]
  });
  assert.match(breadcrumbs, /class="breadcrumb-back" href="\/publisher" aria-label="Back to Publisher"/);
  assert.doesNotMatch(breadcrumbs, /history\.back|<script/);
});

test("returns nested event pages to their event even after filters, reloads, or form redirects", async () => {
  for (const label of ["Manage", "Event Team & Sessions", "Feedback", "Registrations", "Organization Report"]) {
    const breadcrumbs = await renderView("partials/breadcrumbs.ejs", {
      items: [
        { label: "Home", href: "/" },
        { label: "Publisher", href: "/publisher" },
        { label: "Partner workshop", href: "/publisher/events/partner-event" },
        { label }
      ]
    });
    assert.match(breadcrumbs, /class="breadcrumb-back" href="\/publisher\/events\/partner-event"/, label);
    assert.match(breadcrumbs, /aria-label="Back to Partner workshop"/);
  }
});

test("ignores the current breadcrumb link and safely handles direct entry pages", async () => {
  const currentLink = await renderView("partials/breadcrumbs.ejs", {
    items: [
      { label: "Publisher", href: "/publisher" },
      { label: "Workshop", href: "/publisher/events/event-1" }
    ]
  });
  const directEntry = await renderView("partials/breadcrumbs.ejs", {
    items: [{ label: "Workshop", href: "/publisher/events/event-1" }]
  });
  assert.match(currentLink, /class="breadcrumb-back" href="\/publisher"/);
  assert.match(directEntry, /class="breadcrumb-back" href="\/" aria-label="Back to Events"/);
});
const commonLocals = {
  assetVersion: "test",
  siteTitle: "Test",
  publicBaseUrl: "https://example.test",
  publisher: null,
  supervisor: null,
  registrant: null,
  facilitator: null,
  currentUser: null,
  partnerAgreement: null,
  partnerContactExcludedCountries: PARTNER_CONTACT_EXCLUDED_COUNTRIES,
  isPartnerContactConfigured,
  isPartnerContactCountryAllowed,
  organizationSizes: [
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
  ]
};

function renderView(name, locals) {
  return ejs.renderFile(path.join(viewsDirectory, name), {
    ...commonLocals,
    ...locals
  });
}

test("auto-refreshes active lab provisioning status every 30 seconds", () => {
  const template = fs.readFileSync(path.join(viewsDirectory, "publisher-event-manage.ejs"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const db = fs.readFileSync(path.join(__dirname, "..", "db.js"), "utf8");

  assert.match(template, /shouldAutoRefreshLabProvisioning/);
  assert.match(template, /window\.location\.hash !== '#lab-provisioning'/);
  assert.match(template, /window\.location\.replace\(refreshUrl\)/);
  assert.match(template, /}, 30000\)/);
  assert.match(template, /batch\.deployedCount \?\? batch\.importedCount/);
  assert.match(template, /lab-provisioning\/delete/);
  assert.match(template, /name="registrationSequence"/);
  assert.match(template, /24-27/);
  assert.match(template, /value="1-"/);
  assert.match(template, /physical lab numbers that have never been used/);
  assert.match(template, /Missing lab numbers will be skipped/);
  assert.match(server, /const startStudentNumber = requestedStudentNumbers\[0\]/);
  assert.match(server, /allocateLabStudentNumbers\(batches, registrations, studentCount\)/);
  assert.match(server, /Wait for the active lab provisioning batch to finish/);
  assert.match(server, /\/api\/provisioning\/jobs\/:jobId\/progress/);
  assert.match(server, /\/api\/provisioning\/jobs\/:jobId\/deletion/);
  assert.match(server, /\/api\/provisioning\/jobs\/:jobId\/vm-statuses/);
  assert.match(server, /deployedCount \+ failedCount > job\.studentCount/);
  assert.match(server, /if \(job\.status === "completed"\)/);
  assert.match(server, /status: completed \? "completed" : "running"/);
  assert.match(server, /if \(completed\) \{\s+await releaseLabProvisioningRegistrationIds/);
  assert.match(server, /if \(status === "failed"\) \{\s+await releaseLabProvisioningRegistrationIds/);
  assert.match(server, /mapProvisioningRowsToRegistrationIndexes/);
  assert.match(server, /batch \? status === "ready" : status !== "failed"/);
  assert.match(server, /recordApplicationAuditEntry/);
  assert.match(db, /\["completed", "failed", "deleted"\]\.includes\(existingStatus\)/);
  assert.match(template, /placeholder="<%= `1-\$\{count\}` %>"/);
  assert.match(template, /Latest message/);
  assert.match(template, /Avg\/lab:/);
  assert.match(template, /batch\.progressMessage \|\| ""/);
  assert.match(template, /lab-batch-table/);
  assert.match(template, /name="deployStudents"/);
  assert.match(template, /name="deployTeam"/);
  assert.match(template, /No audience is selected by default/);
});

test("renders the partner application pages", async () => {
  const application = await renderView("partner-apply.ejs", {
    error: "",
    formData: {},
    countries: ["United States", "Australia", "India"],
    agreementVersion: "2026-10-13",
    agreementSections: [
      { title: "1. EventIQ Program", paragraphs: ["Partner responsibilities."] }
    ],
    generatedAt: new Date("2026-10-13T10:00:00.000Z")
  });
  const success = await renderView("partner-application-success.ejs", {
    partner: {
      partnerName: "Contoso",
      submitterName: "Ada Lovelace"
    }
  });

  assert.match(application, /Become an Event Partner/);
  assert.match(application, /<html lang="en" class="partner-application-root">/);
  assert.match(application, /<body class="partner-application-page">/);
  assert.equal((application.match(/class="required"/g) || []).length, 12);
  assert.match(application, /name="partnerAddress"[^>]*required/);
  assert.match(application, /name="partnerCountry" required/);
  assert.match(application, /id="partnerLogoPreview"/);
  assert.match(application, /Selected partner logo preview/);
  assert.match(application, /URL\.createObjectURL\(file\)/);
  assert.ok(
    application.indexOf('value="United States"')
      < application.indexOf('value="Australia"')
  );
  assert.match(application, /Signing Authority/);
  assert.match(application, /EventIQ Program Terms and Conditions/);
  assert.match(application, /Part 1/);
  assert.match(application, /Part 2/);
  assert.match(application, /2026-10-13T10:00:00.000Z UTC/);
  assert.match(application, />EventIQ Terms &amp; Conditions<\/a>/);
  assert.match(
    application,
    /<div class="partner-application-actions">\s*<a id="sampleAgreementDownload" class="primary-link agreement-sample-link" href="\/partners\/agreement\/sample\.pdf">Download Sample Agreement \(PDF\)<\/a>\s*<\/div>/
  );
  assert.equal((application.match(/id="sampleAgreementDownload"/g) || []).length, 1);
  assert.ok(
    application.indexOf('id="sampleAgreementDownload"')
      < application.indexOf('<form method="post" action="/partners/apply"')
  );
  assert.match(application, /encodeURIComponent\(partnerName\)/);
  assert.doesNotMatch(application, />https:\/\/example\.test\/partners\/agreement<\/a>/);
  assert.match(application, /name="signAgreementNow" value="true"[^>]*required/);
  assert.match(application, /class="contract-signature-panel"/);
  assert.ok(
    application.indexOf("Schedule A.5 - Microsoft Activities")
      < application.indexOf("Required Digital Signature")
  );
  assert.ok(
    application.indexOf('id="signAgreementNow"')
      < application.indexOf("Required Digital Signature")
  );
  assert.match(
    application,
    /id="partnerContractScroll"[\s\S]*?id="agreementReviewSentinel"[\s\S]*?<\/div>\s*<div class="contract-signature-area">/
  );
  assert.match(application, /name="agreementReviewed" value="false"/);
  assert.match(application, /Scroll through the complete agreement to unlock/);
  assert.match(application, /contractScroll\.scrollTop/);
  assert.match(application, /if \(agreementReviewed\.value === 'true'\)/);
  assert.match(success, /pending supervisor approval/);
});

test("renders the partner agreement and unsigned partner banner", async () => {
  const agreement = await renderView("partner-agreement.ejs", {
    agreementSections: [
      { title: "1. EventIQ Program", paragraphs: ["Partner responsibilities."] }
    ],
    agreementVersion: "2026-10-13",
    generatedAt: new Date("2026-10-13T10:00:00.000Z"),
    partner: {
      partnerName: "Contoso",
      submitterName: "Ada Lovelace",
      submitterEmail: "ada@contoso.example",
      signingAuthorityName: "Ada Lovelace",
      signingAuthorityEmail: "ada@contoso.example"
    },
    required: true,
    canSign: true,
    signed: false,
    error: "",
    downloadedCopy: false,
    publisher: {
      email: "ada@contoso.example",
      partnerId: "partner-1",
      partnerName: "Contoso"
    },
    currentUser: {
      name: "Ada Lovelace",
      persona: "Publisher",
      partnerName: "Contoso"
    },
    partnerAgreement: {
      required: true,
      primarySigner: true
    }
  });

  assert.match(agreement, /Partner agreement required/);
  assert.match(agreement, /Digitally Sign Agreement/);
  assert.match(agreement, /2026-10-13T10:00:00.000Z UTC/);
  assert.match(agreement, /EventIQ Program Terms and Conditions/);
  assert.match(agreement, /Download Sample Agreement \(PDF\)/);
});

test("defaults the public event listing to upcoming while retaining the all-events filter", async () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const home = await renderView("home.ejs", {
    events: [],
    filters: {
      search: "",
      date: "",
      location: "",
      mode: "",
      timeZone: "",
      status: "upcoming",
      sort: "schedule-nearest"
    },
    timeZones: [],
    statusCounts: { upcoming: 1, ongoing: 1, completed: 1, all: 3 },
    status: "",
    formatDualTimezone: (value) => value
  });

  assert.match(server, /req\.query\.status \|\| "upcoming"/);
  assert.match(server, /statusFilter && statusFilter !== "all"/);
  assert.match(home, /value="upcoming" selected/);
  assert.match(home, /href="\/\?status=all&/);
});

const partnerRegistrationLocals = {
  event: {
    id: "event-1",
    title: "Dashboard in a Day",
    description: "Workshop.*text*",
    startAt: "2026-10-01T09:00:00.000Z",
    endAt: "2026-10-01T17:00:00.000Z",
    timeZone: "UTC",
    city: "",
    deliveryMode: "virtual",
    partnerId: "partner-1",
    partnerName: "Contoso",
    partnerWebsiteUrl: "https://contoso.example",
    partnerPrivacyPolicyUrl: "https://contoso.example/privacy"
  },
  renderRichTextDescription: (value) => value,
  formatDualTimezone: (value) => value,
  error: "",
  existingRegistrationCode: null,
  registrationCount: 0,
  remainingSeats: 20,
  knownOrganizations: [],
  countries: ["Australia", "Canada", "China"],
  jobRoles: [],
  countryPhoneCodes: {},
  formData: { country: "Australia" }
};

test("shows shared partner branding on event pages but not internal events", async () => {
  const partnerHeader = await renderView("partials/header.ejs", {
    title: "Open Event",
    event: partnerRegistrationLocals.event
  });
  const internalHeader = await renderView("partials/header.ejs", {
    title: "Open Event",
    event: { id: "internal-event", title: "Internal workshop" }
  });
  assert.match(partnerHeader, /Partner event: Contoso/);
  assert.match(partnerHeader, /aria-label="Partner event"/);
  assert.match(partnerHeader, /src="\/partners\/partner-1\/logo"/);
  assert.doesNotMatch(internalHeader, /event-partner-brand/);
  for (const view of ["home.ejs", "publisher-dashboard.ejs", "supervisor-dashboard.ejs", "facilitator-dashboard.ejs", "registrant-dashboard.ejs", "publisher-sharing.ejs"]) {
    const template = fs.readFileSync(path.join(viewsDirectory, view), "utf8");
    assert.match(template, /include\("partials\/event-partner"/, view);
  }
});

const feedbackLocals = {
  event: partnerRegistrationLocals.event,
  error: "",
  projectTypes: ["Existing project", "New project"],
  followUpTypes: ["Architecture guidance", "Migration support", "POC implementation help", "Performance tuning", "Office hours", "Other"],
  sessions: [
    { id: "session-1", title: "Architecture" },
    { id: "session-2", title: "Hands-on lab" }
  ],
  selectedSession: null,
  lookupEmail: "",
  labAccess: null,
  initialStep: "ratings",
  formData: { needsProjectHelp: "no" },
  formatDualTimezone: (value) => value
};

test("renders compact event stars, optional session stars, automatic date, and conditional follow-up checkboxes", async () => {
  const feedback = await renderView("feedback-form.ejs", feedbackLocals);
  assert.match(feedback, /<body class="feedback-page">/);
  assert.match(feedback, /Partner event/);
  assert.match(feedback, /Oct 1, 2026/);
  assert.match(feedback, /Would you recommend this event to others/);
  assert.match(feedback, /Do you have an existing project, or are you evaluating a new project, where you would like our help\?/);
  assert.equal((feedback.match(/name="rating"/g) || []).length, 5);
  assert.equal((feedback.match(/name="sessionRatings\[session-1\]"/g) || []).length, 5);
  assert.equal((feedback.match(/name="sessionRatings\[session-2\]"/g) || []).length, 5);
  assert.doesNotMatch(feedback, /<select/);
  assert.doesNotMatch(feedback, /type="date"/);
  assert.doesNotMatch(feedback, /name="comments"[^>]*required/);
  assert.match(feedback, /data-feedback-step="follow-up"[^>]*hidden/);
  assert.equal((feedback.match(/type="checkbox" name="projectType"/g) || []).length, 2);
  assert.match(feedback, /Project context \(optional\)/);
  assert.match(feedback, /current setup, challenges, help needed, and timeline/);
  assert.equal((feedback.match(/type="checkbox" name="followUpType"/g) || []).length, 6);
  assert.match(feedback, /type="checkbox" name="contactConsent" value="yes"/);
  assert.match(feedback, /This does not give marketing permission/);
  assert.match(feedback, /href="https:\/\/contoso\.example\/privacy"/);
  assert.match(feedback, /src="\/feedback\.js\?v=test"/);
});

test("restores all session ratings and selected follow-up types on validation errors", async () => {
  const feedback = await renderView("feedback-form.ejs", {
    ...feedbackLocals,
    initialStep: "follow-up",
    error: "Please choose a follow-up type.",
    formData: {
      rating: "4",
      recommendation: "yes",
      needsProjectHelp: "yes",
      candidateEmail: "customer@contoso.example",
      projectType: ["Existing project", "New project"],
      sessionRatings: { "session-1": "3", "session-2": "5" },
      followUpType: ["Migration support", "Office hours"]
    }
  });
  const followUpSection = feedback.match(/<section[^>]*data-feedback-step="follow-up"[^>]*>/)[0];
  assert.doesNotMatch(followUpSection, /\bhidden\b/);
  assert.match(feedback, /name="sessionRatings\[session-1\]" value="3"[^>]*checked/);
  assert.match(feedback, /name="sessionRatings\[session-2\]" value="5"[^>]*checked/);
  assert.match(feedback, /name="followUpType" value="Migration support" checked/);
  assert.match(feedback, /name="followUpType" value="Office hours" checked/);
  assert.match(feedback, /name="projectType" value="Existing project" checked/);
  assert.match(feedback, /name="projectType" value="New project" checked/);
  assert.match(feedback, /type="email" name="candidateEmail"[^>]*required/);
  assert.match(feedback, /role="alert"/);
});

test("keeps feedback without sessions simple and lab credentials on a separate optional screen", async () => {
  const feedback = await renderView("feedback-form.ejs", {
    ...feedbackLocals,
    sessions: [],
    labAccess: {
      labVmUsername: "lab_user1",
      labVmPassword: "sample-password",
      labPortalUsername: "labuser@example.test",
      labDatabaseAccountType: "documentdb",
      labDatabaseAccountName: "documentdb-lab-01",
      labFoundryAccountName: "foundry-lab-01"
    }
  });
  assert.doesNotMatch(feedback, /class="feedback-session-table"/);
  assert.match(feedback, /id="feedbackLabPanel"[^>]*hidden/);
  assert.match(feedback, /Azure DocumentDB User Name:<\/strong> labuser1/);
  assert.match(feedback, /Azure DocumentDB Password:<\/strong> sample-password/);
  assert.match(feedback, /Azure AI Foundry Name/);
  assert.match(feedback, /foundry-lab-01/);
});

test("reports multiple session stars and follow-up types while retaining legacy feedback", async () => {
  const feedback = [
    {
      rating: 5,
      recommendation: "yes",
      contactConsent: "yes",
      candidateEmail: "customer@contoso.example",
      needsProjectHelp: "yes",
      projectTypes: ["Existing project", "New project"],
      followUpTypes: ["Architecture guidance", "Migration support"],
      sessionRatings: [
        { sessionTitle: "Architecture", rating: 4 },
        { sessionTitle: "Hands-on lab", rating: 5 }
      ],
      createdAt: "2026-10-01T18:00:00.000Z"
    },
    {
      rating: 3,
      recommendation: "no",
      followUpType: "Office hours",
      sessionId: "legacy-session",
      sessionTitle: "Legacy session",
      createdAt: "2026-10-01T18:00:00.000Z"
    }
  ];
  const report = await renderView("publisher-feedback.ejs", {
    event: partnerRegistrationLocals.event,
    feedback,
    allFeedback: feedback,
    feedbackReport: { total: 2, averageRating: "4.00", recommends: 1, ratingBuckets: [], recommendationSplit: { yes: 1, no: 1 } },
    filters: {}
  });
  assert.match(report, /Architecture guidance, Migration support/);
  assert.match(report, /Existing project, New project/);
  assert.match(report, /customer@contoso\.example/);
  assert.match(report, /Office hours/);
  assert.match(report, /Architecture<\/td><td>4 \/ 5/);
  assert.match(report, /Hands-on lab<\/td><td>5 \/ 5/);
  assert.match(report, /Legacy session<\/td><td>3 \/ 5/);
});

test("keeps feedback confirmation compact and partner branded", async () => {
  const success = await renderView("feedback-success.ejs", { event: partnerRegistrationLocals.event });
  assert.match(success, /<body class="feedback-page">/);
  assert.match(success, /class="auth-wrap feedback-shell"/);
  assert.match(success, /aria-label="Partner event"/);
});

test("renders partner registration branding and pending success", async () => {
  const { event } = partnerRegistrationLocals;
  const registrationPage = await renderView("register.ejs", partnerRegistrationLocals);
  const successPage = await renderView("registration-success.ejs", {
    event,
    registration: {
      id: "registration-1",
      attendeeName: "Ada Lovelace",
      status: "pending-approval",
      registrationCode: ""
    },
    existing: false,
    deregisterLink: ""
  });

  assert.match(registrationPage, /Dashboard in a Day by Contoso Partner/);
  assert.match(registrationPage, /Workshop\./);
  assert.doesNotMatch(registrationPage, /Workshop\.text/);
  assert.match(registrationPage, /<body class="registration-page">/);
  assert.match(registrationPage, /Microsoft is proud to work with Contoso/);
  assert.match(registrationPage, /Microsoft Teams delivers a rich/);
  assert.match(registrationPage, /name="organizationSize"/);
  assert.match(registrationPage, /Contact Details/);
  assert.match(registrationPage, /Organization Details/);
  assert.match(registrationPage, /Preferences/);
  assert.match(registrationPage, /What best describes the size of your organization\?/);
  assert.match(registrationPage, /name="partnerOptIn"/);
  assert.match(registrationPage, /Contoso may contact me with information about their products, services and events/);
  assert.match(registrationPage, /href="https:\/\/contoso\.example\/privacy"[^>]*>Contoso Privacy Statement<\/a>/);
  const optInInput = registrationPage.match(/<input[^>]*name="partnerOptIn"[^>]*>/)[0];
  assert.doesNotMatch(optInInput, /\b(?:checked|disabled|required)\b/);
  assert.doesNotMatch(registrationPage, /name="contactConsent"/);
  assert.match(registrationPage, /does not collect contact permissions for Microsoft marketing/);
  assert.match(registrationPage, />Register<\/button>/);
  assert.match(successPage, /Your submission is pending approval/);
  assert.doesNotMatch(successPage, /Download Invite/);
});

test("does not preselect or enable partner permissions before a country is chosen", async () => {
  const page = await renderView("register.ejs", {
    ...partnerRegistrationLocals,
    formData: {}
  });
  const optInInput = page.match(/<input[^>]*name="partnerOptIn"[^>]*>/)[0];
  assert.match(optInInput, /\bdisabled\b/);
  assert.doesNotMatch(optInInput, /\bchecked\b/);
  assert.match(page, /Select your country to view partner contact permission options/);
});

test("clears and disables excluded-country permissions even when submitted form data says yes", async () => {
  for (const country of ["China", "Canada"]) {
    const page = await renderView("register.ejs", {
      ...partnerRegistrationLocals,
      formData: { country, partnerOptIn: true }
    });
    const optInInput = page.match(/<input[^>]*name="partnerOptIn"[^>]*>/)[0];
    assert.match(optInInput, /\bdisabled\b/);
    assert.doesNotMatch(optInInput, /\bchecked\b/);
    assert.match(page, /id="partnerOptInLabel"[^>]*\bhidden\b/);
    assert.match(page, /Partner contact permissions are not collected for the selected country/);
    assert.match(page, /You can still register for this event/);
  }
});

test("preserves an eligible explicit selection after a server validation error", async () => {
  const page = await renderView("register.ejs", {
    ...partnerRegistrationLocals,
    error: "First name is required.",
    formData: { country: "Australia", partnerOptIn: true }
  });
  const optInInput = page.match(/<input[^>]*name="partnerOptIn"[^>]*>/)[0];
  assert.match(optInInput, /\bchecked\b/);
  assert.doesNotMatch(optInInput, /\bdisabled\b/);
});

test("does not render partner registration fields for internal events", async () => {
  const registrationPage = await renderView("register.ejs", {
    event: {
      id: "event-2",
      title: "Internal Workshop",
      description: "Workshop",
      startAt: "2026-10-01T09:00:00.000Z",
      endAt: "2026-10-01T17:00:00.000Z",
      timeZone: "UTC",
      city: "",
      deliveryMode: "virtual"
    },
    renderRichTextDescription: (value) => value,
    formatDualTimezone: (value) => value,
    isPreviewEvent: false,
    error: "",
    existingRegistrationCode: null,
    registrationCount: 0,
    remainingSeats: 20,
    knownOrganizations: [],
    countries: [],
    jobRoles: [],
    countryPhoneCodes: {},
    formData: {}
  });

  assert.doesNotMatch(registrationPage, /name="organizationSize"/);
  assert.doesNotMatch(registrationPage, /name="partnerOptIn"/);
});

test("renders password and registrant profile variants", async () => {
  const accountPage = await renderView("account-profile.ejs", {
    account: {
      name: "Ada Lovelace",
      email: "ada@contoso.example",
      userType: "publisher",
      partnerName: "Contoso"
    },
    registrantProfile: null,
    message: "",
    error: ""
  });
  const registrantPage = await renderView("account-profile.ejs", {
    account: null,
    registrantProfile: {
      salutation: "Ms.",
      firstName: "Ada",
      middleName: "",
      lastName: "Lovelace"
    },
    message: "",
    error: ""
  });

  assert.match(accountPage, /Change Password/);
  assert.match(registrantPage, /there is no password to change/);
});

test("renders self-service password controls for publishers, speakers, and proctors", async () => {
  for (const userType of ["publisher", "speaker", "proctor"]) {
    const profile = await renderView("account-profile.ejs", {
      account: { name: "Ada", email: "ada@contoso.example", userType },
      registrantProfile: null,
      message: "",
      error: ""
    });
    assert.match(profile, /action="\/account\/profile\/password"/, userType);
    assert.match(profile, /name="currentPassword" required autocomplete="current-password"/, userType);
    assert.match(profile, /name="newPassword" required minlength="10" autocomplete="new-password"/, userType);
    assert.match(profile, /name="confirmPassword" required minlength="10" autocomplete="new-password"/, userType);
    assert.match(profile, /Update Password/, userType);
  }
});

test("renders supervisor submitter-email editing for pending, approved, and rejected partners", async () => {
  const dashboard = await renderView("supervisor-dashboard.ejs", {
    supervisor: { email: "supervisor@microsoft.com" },
    currentUser: { name: "Supervisor", persona: "Supervisor" },
    message: "",
    timeZones: [],
    filters: { timeZone: "" },
    publisherSummaries: [],
    auditEntries: [],
    events: [],
    selectedEventIds: [],
    customerReport: { rows: [], summary: {} },
    allAccounts: [],
    labProvisioningBatches: [],
    partnerApplications: ["pending", "approved", "rejected"].map((status) => ({
      id: `partner-${status}`,
      partnerName: "Contoso",
      submitterName: "Ada",
      submitterEmail: `${status}@contoso.example`,
      mpnId: "12345",
      websiteUrl: "https://contoso.example",
      privacyPolicyUrl: "https://contoso.example/privacy",
      status
    }))
  });
  for (const status of ["pending", "approved", "rejected"]) {
    assert.match(dashboard, new RegExp(`action="/supervisor/partners/partner-${status}/submitter-email"`));
    assert.match(dashboard, new RegExp(`name="expectedSubmitterEmail" value="${status}@contoso.example"`));
  }
  assert.equal((dashboard.match(/<summary>Edit Submitter Email<\/summary>/g) || []).length, 3);
  assert.equal((dashboard.match(/type="email" name="submitterEmail"/g) || []).length, 3);
  assert.match(dashboard, /password, roles, and event access are retained/);
});

test("renders database-specific and Foundry lab resource names for registrants", async () => {
  const template = fs.readFileSync(path.join(viewsDirectory, "registrant-dashboard.ejs"), "utf8");
  const dashboard = await renderView("registrant-dashboard.ejs", {
    message: "",
    formatDualTimezone: (value) => value,
    upcoming: [
      {
        event: {
          id: "documentdb-event",
          title: "Azure DocumentDB Hands-on Lab",
          startAt: "2026-10-01T09:00:00.000Z",
          endAt: "2026-10-01T17:00:00.000Z",
          timeZone: "UTC"
        },
        eventStatus: "upcoming",
        registration: {
          id: "documentdb-registration",
          status: "registered",
          registrationCode: "DOC123",
          labVmUsername: "lab_user1",
          labVmPassword: "shared-lab-password",
          labPortalUsername: "lab_user1@example.test",
          labPortalPassword: "shared-lab-password",
          labDatabaseAccountType: "documentdb",
          labDatabaseAccountName: "documentdb-lab-01",
          labFoundryAccountName: "foundry-lab-01"
        }
      },
      {
        event: {
          id: "cosmos-event",
          title: "Azure Cosmos DB for NoSQL Hands-on Lab",
          startAt: "2026-10-02T09:00:00.000Z",
          endAt: "2026-10-02T17:00:00.000Z",
          timeZone: "UTC"
        },
        eventStatus: "upcoming",
        registration: {
          id: "cosmos-registration",
          status: "registered",
          registrationCode: "COS123",
          labDatabaseAccountType: "cosmosdb",
          labDatabaseAccountName: "cosmos-lab-01"
        }
      }
    ],
    past: []
  });

  assert.match(dashboard, /Azure DocumentDB Cluster Name/);
  assert.match(dashboard, /documentdb-lab-01/);
  assert.match(dashboard, /Azure Cosmos DB Account Name/);
  assert.match(dashboard, /cosmos-lab-01/);
  assert.match(dashboard, /Azure AI Foundry Name/);
  assert.match(dashboard, /foundry-lab-01/);
  assert.match(dashboard, /VM Password:<\/strong> shared-lab-password/);
  assert.match(dashboard, /Azure DocumentDB User Name:<\/strong> labuser1/);
  assert.match(dashboard, /Azure DocumentDB Password:<\/strong> shared-lab-password/);
  assert.match(template, /VM Status/);
  assert.match(template, /must be <strong>Running<\/strong>/);
  assert.match(template, /Start VM/);
});

test("renders visible bulk report selectors on the publisher dashboard", async () => {
  const dashboard = await renderView("publisher-dashboard.ejs", {
    publisher: {
      name: "Internal Publisher",
      email: "publisher@microsoft.com"
    },
    events: [{
      id: "event-1",
      title: "Workshop",
      startAt: "2026-10-01T09:00:00.000Z",
      endAt: "2026-10-01T17:00:00.000Z",
      timeZone: "UTC",
      computedStatus: "upcoming",
      registrationCount: 2,
      attendedCount: 1,
      speakerCount: 1,
      proctorCount: 1,
      feedbackCount: 0
    }],
    message: "",
    statusFilter: "all",
    visibilityFilter: "all",
    statusCounts: { upcoming: 1, ongoing: 0, completed: 0, canceled: 0, all: 1 },
    scopeFilter: "all",
    scopeCounts: { all: 1, owned: 1, shared: 0 },
    partnerUsers: [],
    filters: { search: "", mode: "", timeZone: "" },
    timeZones: ["UTC"],
    formatDualTimezone: (value) => value
  });

  test("publisher dashboard defaults expose all accessible events", () => {
    const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    const template = fs.readFileSync(path.join(viewsDirectory, "publisher-dashboard.ejs"), "utf8");

    assert.match(server, /renderPublisherDashboard[\s\S]*?req\.query\.status \|\| "all"/);
    assert.match(server, /renderPublisherDashboard[\s\S]*?req\.query\.visibility \|\| "all"/);
    assert.match(template, /Clear filters and show all accessible events/);
    assert.match(template, /status=all&scope=all&visibility=all/);
  });

  test("renders deployed labs and named access entries in the event summary", async () => {
    const output = await renderView("publisher-event-detail.ejs", {
      event: {
        id: "event-1",
        title: "Workshop",
        computedStatus: "upcoming",
        deliveryMode: "virtual",
        startAt: "2026-01-01T10:00:00Z",
        endAt: "2026-01-01T12:00:00Z",
        registrationCount: 2,
        attendedCount: 1,
        speakerCount: 1,
        proctorCount: 1,
        feedbackCount: 0,
        deployedLabCount: 1,
        feedbackLink: "https://example.test/feedback",
        feedbackQrCodeDataUrl: "data:image/png;base64,test"
      },
      collaborators: [{
        collaboratorName: "Alex Publisher",
        collaboratorEmail: "alex@example.test",
        accessLevel: "read",
        createdAt: "2026-01-01T09:00:00Z"
      }],
      speakers: [],
      proctors: [],
      publisherEventPersonas: ["speaker", "proctor"],
      accessLevel: "owner",
      registrationLink: "https://example.test/register",
      message: "",
      error: ""
    });

    assert.match(output, /Labs Deployed/);
    assert.match(output, /Alex Publisher/);
    assert.match(output, /alex@example\.test/);
    assert.match(output, /action="\/publisher\/events\/event-1\/switch-persona"/);
    assert.match(output, /Continue as Speaker/);
    assert.match(output, /Continue as Proctor/);

    const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    assert.match(server, /app\.post\("\/publisher\/events\/:id\/switch-persona"/);
    assert.match(server, /normalizeEmail\(item\.inviteEmail\) === publisherEmail/);
    assert.match(server, /You are not assigned as a \$\{persona\} for this event/);
  });

  assert.match(dashboard, /Registration Report/);
  assert.match(dashboard, /Organization Registrant Report/);
  assert.match(dashboard, /Select all visible events/);
  assert.match(dashboard, /name="selectedEventIds"/);
  assert.equal((dashboard.match(/name="reportTypes"[^>]*checked/g) || []).length, 2);
});

test("labels navigation to the registration management workspace consistently", () => {
  for (const name of [
    "publisher-event-detail.ejs",
    "publisher-organization-report.ejs",
    "facilitator-event-detail.ejs",
    "facilitator-dashboard.ejs"
  ]) {
    const template = fs.readFileSync(path.join(viewsDirectory, name), "utf8");
    assert.match(template, /\/reports\/registrations">Manage Registrations<\/a>/, name);
  }
});

test("renders registration management with separate registration status actions", async () => {
  const report = await renderView("publisher-registrations-report.ejs", {
    publisher: { name: "Publisher", email: "publisher@microsoft.com" },
    event: { id: "event-1", title: "Workshop", computedStatus: "upcoming" },
    accessLevel: "owner",
    registrations: [
      {
        id: "registered-1",
        attendeeName: "Registered User",
        attendeeEmail: "registered@example.com",
        organization: "Contoso",
        registrationCode: "ABC123",
        status: "registered",
        attended: false,
        labWebUri: "https://lab.example.test",
        labVmUsername: "lab-user",
        labVmPassword: "lab-password",
        labPortalUsername: "lab-user@example.test",
        labPortalPassword: "portal-password",
        labDatabaseAccountType: "documentdb",
        labDatabaseAccountName: "documentdb-lab-01",
        labFoundryAccountName: "foundry-lab-01"
      },
      {
        id: "deregistered-1",
        attendeeName: "Deregistered User",
        attendeeEmail: "deregistered@example.com",
        organization: "Fabrikam",
        registrationCode: "XYZ789",
        status: "deregistered",
        attended: false
      }
    ],
    reportSummary: { registered: 1, attended: 0, pending: 0, rejected: 0, deregistered: 1 },
    importPreview: [{
      rowNumber: 2,
      inputEmail: "",
      inputName: "Deregistered User",
      matchedRegistrationId: "deregistered-1",
      matchedName: "Deregistered User",
      matchedEmail: "deregistered@example.com",
      matchedStatus: "deregistered",
      reason: "Matched by name",
      conflict: false,
      selected: true
    }],
    importPayload: "",
    labAccessPreview: null,
    labAccessImportToken: "",
    message: "",
    piiRestricted: false
  });

  assert.match(report, /<title>Manage Registrations<\/title>/);
  assert.match(report, /<h1>Manage Registrations<\/h1>/);
  assert.match(report, /<p>Workshop<\/p>/);
  assert.match(report, /<strong>Manage Registrations<\/strong>/);
  assert.doesNotMatch(report, /Publisher Reporting|>Registration Report</);
  assert.match(report, /Download Excel Report/);
  assert.match(report, /\/registered-1\/deregister/);
  assert.match(report, />De-register</);
  assert.match(report, /\/deregistered-1\/register/);
  assert.match(report, />Register</);
  assert.match(report, /Will be re-registered/);
  assert.match(report, /View Credentials/);
  assert.match(report, /Copy Credentials/);
  assert.match(report, /lab-password/);
  assert.match(report, /DocumentDB cluster/);
  assert.match(report, /documentdb-lab-01/);
  assert.match(report, /Azure AI Foundry account/);
  assert.match(report, /foundry-lab-01/);
  assert.match(report, /DocumentDB username:<\/strong> lab-user/);
  assert.match(report, /DocumentDB password:<\/strong> lab-password/);
  assert.doesNotMatch(report, /Restore &amp; Mark Attended/);
});

test("routes speaker and proctor labs through a credential page", async () => {
  const report = await renderView("publisher-registrations-report.ejs", {
    publisher: { name: "Publisher", email: "publisher@microsoft.com" },
    event: { id: "event-1", title: "Workshop", computedStatus: "upcoming" },
    accessLevel: "owner",
    registrations: [],
    teamLabRecipients: [{
      name: "Test Speaker",
      email: "speaker@example.com",
      roles: ["speaker", "proctor"],
      labAccessUpdatedAt: "2026-10-08T08:00:00.000Z",
      assignment: {
        id: "assignment-1",
        labWebUri: "https://lab.example.test"
      }
    }],
    reportSummary: { registered: 0, attended: 0, pending: 0, rejected: 0, deregistered: 0 },
    importPreview: null,
    importPayload: "",
    labAccessPreview: null,
    labAccessImportToken: "",
    message: "",
    piiRestricted: false
  });

  assert.match(report, /href="\/publisher\/events\/event-1\/team-labs\/assignment-1"/);
  assert.match(report, />View credentials</);
  assert.doesNotMatch(report, /href="https:\/\/lab\.example\.test"/);

  const credentials = await renderView("team-lab-access.ejs", {
    publisher: { name: "Publisher", email: "publisher@microsoft.com" },
    event: { id: "event-1", title: "Workshop" },
    teamMember: {
      name: "Test Speaker",
      email: "speaker@example.com",
      roles: ["speaker", "proctor"]
    },
    lab: {
      labWebUri: "https://lab.example.test",
      labVmUsername: "lab_user",
      labVmPassword: "vm-secret",
      labPortalUsername: "lab-user@example.test",
      labPortalPassword: "portal-secret",
      labResourceGroup: "lab-dev1-event",
      labDatabaseAccountType: "documentdb",
      labDatabaseAccountName: "docdb-l1",
      labFoundryAccountName: "foundry-l1"
    }
  });

  assert.match(credentials, /Lab Credentials/);
  assert.match(credentials, /lab_user/);
  assert.match(credentials, /vm-secret/);
  assert.match(credentials, /VM URI:<\/strong> <a href="https:\/\/lab\.example\.test"/);
  assert.match(credentials, />https:\/\/lab\.example\.test<\/a>/);
  assert.match(credentials, /portal-secret/);
  assert.match(credentials, /docdb-l1/);
  assert.match(credentials, /foundry-l1/);
  assert.match(credentials, /Azure DocumentDB User Name:<\/strong> labuser/);
  assert.match(credentials, /Azure DocumentDB Password:<\/strong> vm-secret/);
  assert.match(credentials, /href="https:\/\/lab\.example\.test"/);
});

test("renders lab access confirmation with a server-side import token", async () => {
  const labAccessPreview = Array.from({ length: 220 }, (_, index) => ({
    rowNumber: index + 2,
    inputEmail: `user${index}@example.com`,
    inputName: `Test User ${index}`,
    matchedRegistrationId: `registration-${index}`,
    matchedName: `Test User ${index}`,
    matchedEmail: `user${index}@example.com`,
    labWebUri: `https://example.test/lab/${index}`,
    labVmUsername: `lab-user-${index}`,
    labVmPassword: `vm-secret-${index}-${"x".repeat(100)}`,
    labPortalPassword: `portal-secret-${index}-${"y".repeat(100)}`,
    labResourceGroup: `rg-lab-${index}`,
    reason: "Matched by email",
    conflict: false,
    selected: true
  }));
  const report = await renderView("publisher-registrations-report.ejs", {
    publisher: { name: "Publisher", email: "publisher@microsoft.com" },
    event: { id: "event-1", title: "Workshop", computedStatus: "upcoming" },
    accessLevel: "owner",
    registrations: [],
    reportSummary: { registered: 0, attended: 0, pending: 0, rejected: 0, deregistered: 0 },
    importPreview: null,
    importPayload: "",
    labAccessPreview,
    labAccessImportToken: "server-token",
    message: "",
    piiRestricted: false
  });

  assert.match(report, /name="labAccessImportToken" value="server-token"/);
  assert.doesNotMatch(report, /name="labAccessPayload"/);
  assert.doesNotMatch(report, /vm-secret-/);
  assert.doesNotMatch(report, /portal-secret-/);
  assert.equal((report.match(/name="selectedRows"/g) || []).length, 220);
});

test("renders organization summary without a timeline", async () => {
  const report = await renderView("publisher-organization-report.ejs", {
    publisher: { name: "Publisher", email: "publisher@microsoft.com" },
    event: { id: "event-1", title: "Workshop", computedStatus: "upcoming" },
    organizations: [{ organization: "Contoso", registered: 2, attended: 1 }],
    totalRegistered: 2,
    totalAttended: 1,
    message: "",
    piiRestricted: false
  });

  assert.match(report, /Organization Registrant Report/);
  assert.match(report, /\/reports\/registrations">Manage Registrations<\/a>/);
  assert.match(report, /Total Registrations/);
  assert.match(report, /Total Attendees/);
  assert.doesNotMatch(report, /Segment|Region|ACR|Growth/);
  assert.doesNotMatch(report, /Registrations Over Time/);
  assert.doesNotMatch(report, /organizationTimeline/);
});

test("renders role-neutral event staffing workspace", async () => {
  const event = {
    id: "event-1",
    title: "Workshop",
    startAt: "2026-09-17T09:00:00.000Z",
    endAt: "2026-09-17T17:00:00.000Z",
    timeZone: "UTC"
  };
  const teamMember = {
    id: "team:person@example.com",
    name: "Test Person",
    email: "person@example.com",
    availableFrom: event.startAt,
    availableTo: event.endAt,
    availableSessionIds: [],
    aliasIds: ["team:person@example.com"],
    speakerSessionCount: 1,
    proctorSessionCount: 1
  };
  const report = await renderView("publisher-event-sessions.ejs", {
    event,
    accessLevel: "owner",
    operatorType: "publisher",
    sessions: [{
      id: "session-1",
      sequence: 1,
      rowType: "session",
      title: "Session One",
      description: "",
      startAt: "2026-09-17T10:00:00.000Z",
      endAt: "2026-09-17T11:00:00.000Z",
      durationMinutes: 60,
      tsgFileName: "session-guide.pdf",
      speakerMember: teamMember,
      proctorMembers: [teamMember]
    }],
    teamMembers: [teamMember],
    existingPeople: [{
      id: "team:partner@example.com",
      name: "Partner Person",
      email: "partner@example.com",
      partnerName: "Contoso"
    }],
    isTeamMemberAvailable: () => true,
    message: "",
    error: ""
  });

  assert.match(report, /Event Team &amp; Sessions/);
  assert.match(report, /A person has no permanent role/);
  assert.match(report, /Speaker and Proctor/);
  assert.match(report, /Assign as Speaker in every available session/);
  assert.match(report, /Assign as Proctor in every available session/);
  assert.match(report, /name="speakerMemberId"/);
  assert.match(report, /name="proctorMemberIds"/);
  assert.match(report, /name="existingPersonEmail"/);
  assert.match(report, /Invite a new person/);
  assert.match(report, /Partner Person - Contoso/);
  assert.equal((report.match(/Partner Person - Contoso/g) || []).length, 1);
  assert.match(report, /session-guide\.pdf/);
  assert.match(report, /Copy TSG Link/);
  assert.match(report, /name="tsgFile"/);
  assert.match(report, /\/sessions\/import/);
  assert.match(report, /\/sessions\/grid/);
  assert.match(report, /\/sessions\/add-breaks/);
  assert.match(report, /name="importMode" value="replace" checked/);
  assert.match(report, /name="importMode" value="append"/);
  assert.match(report, /name="overallDurationMinutes"/);
  assert.match(report, /Save and Rebalance Times/);
  assert.match(report, />Add Breaks</);
  assert.match(report, /<dialog class="agenda-template-dialog" id="paste-agenda-panel"/);
  const pasteDialog = report.match(/<dialog\b[^>]*id="paste-agenda-panel"[\s\S]*?<\/dialog>/)[0];
  assert.match(pasteDialog, /action="\/publisher\/events\/event-1\/sessions\/import"/);
  assert.match(pasteDialog, /<button type="submit">Import Pasted Agenda/);
  assert.match(pasteDialog, /<\/form>\s*<\/dialog>/);
  assert.match(report, /data-workspace-target="session-staffing">Assign Sessions/);
  assert.match(report, /data-templates-url="\/publisher\/events\/event-1\/session-templates"/);
  assert.match(report, /name="assignmentRole" value="both"/);
  assert.match(report, /type="checkbox" name="proctorMemberIds"/);
  assert.doesNotMatch(report, /name="proctorMemberIds" multiple/);
  assert.match(report, /id="agenda-grid-form"[^>]+enctype="multipart\/form-data"/);
  assert.match(report, /name="rows\[0\]\[speakerMemberId\]"/);
  assert.match(report, /name="rows\[0\]\[proctorMemberIds\]"/);
  assert.match(report, /name="rows\[0\]\[tsgFile\]"/);
  assert.match(report, /Everything saves together in this grid/);
  assert.match(report, /agendaWorkspace\.prepend\(agendaSummary\)/);
  assert.equal((report.match(/>Save Agenda</g) || []).length, 2);
  assert.equal((report.match(/>Save and Rebalance Times</g) || []).length, 2);
  assert.match(report, />Part \/ #</);
  assert.match(report, />Format \/ Min</);
  assert.match(report, />Team</);
  assert.match(report, />Files \/ Actions</);
  assert.match(report, />Session \/ Focus</);
  assert.match(report, /sessions added later/);
});

test("renders assigned facilitator event operations and session content", async () => {
  const report = await renderView("facilitator-event-detail.ejs", {
    facilitator: { email: "speaker@example.com", persona: "speaker", switchedFromPublisher: true },
    currentUser: { name: "Speaker", persona: "Speaker" },
    event: {
      id: "event-1",
      title: "Workshop",
      computedStatus: "upcoming",
      startAt: "2026-09-17T09:00:00.000Z",
      endAt: "2026-09-17T17:00:00.000Z"
    },
    sessions: [{
      id: "session-1",
      sequence: 1,
      title: "Build an app",
      description: "Session-specific instructions",
      startAt: "2026-09-17T10:00:00.000Z",
      endAt: "2026-09-17T11:00:00.000Z",
      roles: ["Speaker"],
      tsgFileName: "session-guide.pdf"
    }],
    reportSummary: { registered: 12, attended: 4 },
    persona: "speaker",
    message: ""
  });

  assert.match(report, /\/reports\/registrations">Manage Registrations<\/a>/);
  assert.match(report, /Download Registration Report/);
  assert.match(report, /Session-specific instructions/);
  assert.match(report, /session-guide\.pdf/);
  assert.match(report, /Copy TSG Link/);
  assert.match(report, /action="\/publisher\/restore-persona"/);
  assert.match(report, /Return to Publisher Workspace/);
});

test("renders facilitator login and secure password setup", async () => {
  const login = await renderView("login.ejs", {
    error: "",
    persona: "facilitator",
    attendeeEmail: "",
    registrationCode: ""
  });
  const invitation = await renderView("facilitator-invite.ejs", {
    invitation: { name: "Test Person", email: "person@example.com" },
    token: "invite-token",
    error: "",
    success: ""
  });

  assert.match(login, /value="facilitator" selected/);
  assert.match(invitation, /action="\/facilitator\/invite\/invite-token"/);
  assert.match(invitation, /Your Speaker or Proctor role is assigned separately/);
  assert.doesNotMatch(invitation, /value="invite-token"/);
});
