const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PARTNER_CONTACT_EXCLUDED_COUNTRIES,
  getPartnerEventTitle,
  getPartnerLogoContentType,
  getPublicationStatus,
  isPartnerAccount,
  isPartnerContactConfigured,
  isPartnerContactCountryAllowed,
  isSafeHttpsUrl
} = require("../services/partner-rules");
const {
  PARTNER_AGREEMENT_VERSION,
  getPartnerAgreementText,
  hasCurrentPartnerAgreement,
  personalizePartnerAgreementText
} = require("../services/partner-agreement");

test("keeps legacy users and events internal and approved", () => {
  assert.equal(isPartnerAccount({ email: "publisher@microsoft.com" }), false);
  assert.equal(getPublicationStatus({ title: "Legacy event" }), "approved");
});

test("identifies affiliated partner accounts", () => {
  assert.equal(isPartnerAccount({ accountClass: "partner", partnerId: "partner-1" }), true);
});

test("adds the partner suffix only once", () => {
  assert.equal(
    getPartnerEventTitle({ title: "Dashboard in a Day", partnerName: "MAQ Software" }),
    "Dashboard in a Day - MAQ Software"
  );
  assert.equal(
    getPartnerEventTitle({ title: "Dashboard in a Day - MAQ Software", partnerName: "MAQ Software" }),
    "Dashboard in a Day - MAQ Software"
  );
});

test("allows only HTTPS partner links", () => {
  assert.equal(isSafeHttpsUrl("https://partner.example/privacy"), true);
  assert.equal(isSafeHttpsUrl("http://partner.example/privacy"), false);
  assert.equal(isSafeHttpsUrl("javascript:alert(1)"), false);
});

test("collects contact permissions only for a named partner with an HTTPS privacy statement", () => {
  const event = {
    partnerId: "partner-1",
    partnerName: "Contoso",
    partnerPrivacyPolicyUrl: "https://contoso.example/privacy"
  };
  assert.equal(isPartnerContactConfigured(event), true);
  assert.equal(isPartnerContactConfigured({ ...event, partnerId: "" }), false);
  assert.equal(isPartnerContactConfigured({ ...event, partnerName: " " }), false);
  assert.equal(isPartnerContactConfigured({ ...event, partnerPrivacyPolicyUrl: "" }), false);
  assert.equal(isPartnerContactConfigured({
    ...event,
    partnerPrivacyPolicyUrl: "http://contoso.example/privacy"
  }), false);
});

test("excludes China, Canada, and unknown countries from partner contact permissions", () => {
  const countries = ["Australia", "Canada", "China", "United States"];
  assert.deepEqual(PARTNER_CONTACT_EXCLUDED_COUNTRIES, ["China", "Canada"]);
  for (const country of ["Canada", "China", "CANADA", "CA", "CN", "", "Unknown"]) {
    assert.equal(isPartnerContactCountryAllowed(country, countries), false, country);
  }
  assert.equal(isPartnerContactCountryAllowed("Australia", countries), true);
  assert.equal(isPartnerContactCountryAllowed("United States", countries), true);
  assert.equal(isPartnerContactCountryAllowed(" Canada ", countries), false);
});

test("detects PNG and JPEG logos from file signatures", () => {
  assert.equal(
    getPartnerLogoContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/png"
  );
  assert.equal(getPartnerLogoContentType(Buffer.from([0xff, 0xd8, 0xff])), "image/jpeg");
  assert.equal(getPartnerLogoContentType(Buffer.from("<svg></svg>")), "");
});

test("requires a complete signature for the current agreement version", () => {
  assert.equal(hasCurrentPartnerAgreement({}), false);
  assert.equal(
    hasCurrentPartnerAgreement({
      agreementVersion: PARTNER_AGREEMENT_VERSION,
      agreementSignedAt: "2026-10-13T10:00:00.000Z",
      agreementSignerName: "Ada Lovelace",
      agreementSignerEmail: "ada@contoso.example"
    }),
    true
  );
  assert.equal(
    hasCurrentPartnerAgreement({
      agreementVersion: "old-version",
      agreementSignedAt: "2026-10-13T10:00:00.000Z",
      agreementSignerName: "Ada Lovelace",
      agreementSignerEmail: "ada@contoso.example"
    }),
    false
  );
});

test("uses EventIQ branding in the agreement snapshot", () => {
  const agreement = getPartnerAgreementText();
  assert.match(agreement, /EventIQ Program/);
  assert.doesNotMatch(agreement, /XiaD/);
});

test("includes the complete EventIQ program prerequisites and performance terms", () => {
  const agreement = getPartnerAgreementText();
  assert.match(agreement, /Azure Cosmos DB Developer Specialty certification \(DP-420\)/);
  assert.match(agreement, /minimum of five active DP-420 certifications/);
  assert.match(agreement, /140% to 150% of maximum event capacity/);
  assert.match(agreement, /minimum 60% post-event survey completion rate/);
  assert.match(agreement, /Net Satisfaction \(NSAT\) score greater than 160/);
  assert.match(agreement, /Partner Success Plan/);
  assert.match(agreement, /lead attestation for every EventIQ event/);
  assert.match(agreement, /Schedule A\.5 - Microsoft Activities/);
});

test("personalizes every partner reference in signed agreement exports", () => {
  const personalizedAgreement = getPartnerAgreementText("Contoso Ltd.");
  assert.match(personalizedAgreement, /Partner \(Contoso Ltd\.\) acknowledges/);
  assert.match(personalizedAgreement, /Partner \(Contoso Ltd\.\)'s exclusive remedy/);
  assert.match(personalizedAgreement, /Schedule A\.1 - Partner \(Contoso Ltd\.\) Activities/);
  assert.doesNotMatch(personalizedAgreement, /\bPartner\b(?! \(Contoso Ltd\.\))/);

  const genericSnapshot = getPartnerAgreementText();
  const personalizedSnapshot = personalizePartnerAgreementText(genericSnapshot, "Contoso $&");
  assert.match(personalizedSnapshot, /Partner \(Contoso \$&\) acknowledges/);
  assert.equal(
    personalizePartnerAgreementText(personalizedSnapshot, "Contoso $&"),
    personalizedSnapshot
  );
});
