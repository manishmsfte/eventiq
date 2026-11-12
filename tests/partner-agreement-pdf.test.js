const test = require("node:test");
const assert = require("node:assert/strict");

const { parseAgreementSections } = require("../services/partner-agreement-pdf");

test("parses agreement text into numbered legal sections", () => {
  const sections = parseAgreementSections([
    "1. EventIQ Program and Program Materials",
    "1.1 General. First clause.",
    "Second paragraph.",
    "",
    "Schedule A.1 - Partner Activities",
    "Partner activity."
  ].join("\n"));

  assert.deepEqual(sections, [
    {
      title: "1. EventIQ Program and Program Materials",
      paragraphs: ["1.1 General. First clause.", "Second paragraph."]
    },
    {
      title: "Schedule A.1 - Partner Activities",
      paragraphs: ["Partner activity."]
    }
  ]);
});
