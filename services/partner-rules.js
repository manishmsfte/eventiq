const PARTNER_CONTACT_EXCLUDED_COUNTRIES = Object.freeze(["China", "Canada"]);

function isPartnerAccount(user) {
  return String(user?.accountClass || "internal").toLowerCase() === "partner" && Boolean(user?.partnerId);
}

function isPartnerContactConfigured(event) {
  return Boolean(
    event?.partnerId
    && String(event.partnerName || "").trim()
    && isSafeHttpsUrl(event.partnerPrivacyPolicyUrl)
  );
}

function isPartnerContactCountryAllowed(country, countries) {
  const selectedCountry = String(country || "").trim();
  return countries.includes(selectedCountry)
    && !PARTNER_CONTACT_EXCLUDED_COUNTRIES.includes(selectedCountry);
}

function getPartnerEventTitle(event) {
  const title = String(event?.title || "").trim();
  const partnerName = String(event?.partnerName || "").trim();
  if (!partnerName || title.toLowerCase().includes(partnerName.toLowerCase())) {
    return title;
  }
  return `${title} - ${partnerName}`;
}

function getPublicationStatus(event) {
  return String(event?.publicationStatus || "approved").toLowerCase();
}

function isSafeHttpsUrl(value) {
  try {
    return new URL(String(value || "")).protocol === "https:";
  } catch (_) {
    return false;
  }
}

function getPartnerLogoContentType(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return "";
  }
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
  if (isPng) {
    return "image/png";
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "image/jpeg";
  }
  return "";
}

module.exports = {
  PARTNER_CONTACT_EXCLUDED_COUNTRIES,
  getPartnerEventTitle,
  getPartnerLogoContentType,
  getPublicationStatus,
  isPartnerAccount,
  isPartnerContactConfigured,
  isPartnerContactCountryAllowed,
  isSafeHttpsUrl
};
