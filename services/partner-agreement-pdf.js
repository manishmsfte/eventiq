const PDFDocument = require("pdfkit");

const COLORS = {
  accent: "#0067b8",
  border: "#34445a",
  headingBackground: "#eaf3fb",
  ink: "#17253a",
  muted: "#536274",
  sample: "#9a031e",
  signed: "#157347",
  white: "#ffffff"
};

function parseAgreementSections(agreementText) {
  const sections = [];
  let currentSection = null;

  String(agreementText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (/^(?:\d+\.\s|Schedule A(?:\.|\s|-))/.test(line)) {
        currentSection = { title: line, paragraphs: [] };
        sections.push(currentSection);
        return;
      }

      if (!currentSection) {
        currentSection = { title: "Agreement Terms", paragraphs: [] };
        sections.push(currentSection);
      }
      currentSection.paragraphs.push(line);
    });

  return sections;
}

function ensureSpace(document, height) {
  const bottom = document.page.height - document.page.margins.bottom - 18;
  if (document.y + height > bottom) {
    document.addPage();
  }
}

function writeDocumentHeader(document) {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  const contentY = document.y;
  document
    .save()
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(COLORS.accent)
    .text("MICROSOFT EVENTIQ", left, 28, { characterSpacing: 1.2 });
  document
    .moveTo(left, 43)
    .lineTo(right, 43)
    .lineWidth(1.25)
    .strokeColor(COLORS.accent)
    .stroke()
    .restore();
  document.y = Math.max(contentY, document.page.margins.top);
}

function writeDetails(document, details) {
  const left = document.page.margins.left;
  const width = document.page.width - document.page.margins.left - document.page.margins.right;
  const rowHeight = 21;
  const labelWidth = 122;
  const top = document.y;

  details.forEach(([label, value], index) => {
    const y = top + (index * rowHeight);
    document
      .save()
      .rect(left, y, width, rowHeight)
      .fillAndStroke(index % 2 ? COLORS.white : "#f6f8fb", "#cbd4df")
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(COLORS.muted)
      .text(label.toUpperCase(), left + 8, y + 6, { width: labelWidth - 12 });
    document
      .font("Helvetica")
      .fillColor(COLORS.ink)
      .text(String(value || ""), left + labelWidth, y + 6, { width: width - labelWidth - 8 });
    document.restore();
  });

  document.y = top + (details.length * rowHeight) + 16;
}

function writeSection(document, section) {
  const isSchedule = section.title.startsWith("Schedule A");
  const firstParagraph = section.paragraphs[0] || "";
  const firstParagraphHeight = document.heightOfString(firstParagraph, {
    width: document.page.width - document.page.margins.left - document.page.margins.right,
    align: "justify",
    lineGap: 2.5
  });
  ensureSpace(document, Math.min(138, 54 + firstParagraphHeight));

  const left = document.page.margins.left;
  const width = document.page.width - document.page.margins.left - document.page.margins.right;
  const top = document.y;
  const headingHeight = document.heightOfString(section.title, {
    width: width - 20,
    lineGap: 1
  }) + 14;

  document
    .save()
    .roundedRect(left, top, width, headingHeight, 4)
    .fillAndStroke(isSchedule ? COLORS.accent : COLORS.headingBackground, COLORS.border)
    .font("Helvetica-Bold")
    .fontSize(isSchedule ? 12 : 11)
    .fillColor(isSchedule ? COLORS.white : COLORS.ink)
    .text(section.title, left + 10, top + 7, {
      width: width - 20,
      lineGap: 1
    })
    .restore();
  document.y = top + headingHeight + 6;

  section.paragraphs.forEach((paragraph) => {
    const paragraphHeight = document.heightOfString(paragraph, {
      width,
      align: "justify",
      lineGap: 2.5
    });
    ensureSpace(document, Math.min(paragraphHeight + 12, 100));
    document
      .font("Helvetica")
      .fontSize(9.3)
      .fillColor(COLORS.ink)
      .text(paragraph, {
        width,
        align: "justify",
        lineGap: 2.5
      })
      .moveDown(0.35);
  });

  document.moveDown(0.1);
}

function writeSignatureBlock(document, signature) {
  ensureSpace(document, 168);
  const left = document.page.margins.left;
  const width = document.page.width - document.page.margins.left - document.page.margins.right;
  const top = document.y;
  const height = 142;
  const statusColor = signature.signed ? COLORS.signed : COLORS.sample;

  document
    .save()
    .roundedRect(left, top, width, height, 5)
    .fillAndStroke("#f7f9fc", COLORS.border)
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.ink)
    .text("Agreement Execution", left + 12, top + 12);
  document
    .fontSize(9)
    .fillColor(statusColor)
    .text(signature.signed ? "DIGITALLY SIGNED" : "UNSIGNED SAMPLE", left + width - 150, top + 13, {
      width: 138,
      align: "right"
    });

  const fields = [
    ["Partner organization", signature.partnerName],
    ["Signing authority", signature.signerName],
    ["Signer email", signature.signerEmail],
    [signature.signed ? "Signed at" : "Status", signature.signedAt]
  ];
  fields.forEach(([label, value], index) => {
    const y = top + 39 + (index * 22);
    document
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(COLORS.muted)
      .text(label, left + 12, y, { width: 112 });
    document
      .font("Helvetica")
      .fillColor(COLORS.ink)
      .text(String(value || ""), left + 126, y, { width: width - 138 });
  });

  document
    .font("Helvetica-Oblique")
    .fontSize(8)
    .fillColor(statusColor)
    .text(signature.evidenceNote, left + 12, top + height - 20, {
      width: width - 24,
      align: "center"
    })
    .restore();
  document.y = top + height + 12;
}

function writePageFooters(document, agreementVersion) {
  const range = document.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    document.switchToPage(index);
    const left = document.page.margins.left;
    const right = document.page.width - document.page.margins.right;
    const footerY = document.page.height - document.page.margins.bottom - 10;
    document
      .save()
      .moveTo(left, footerY - 8)
      .lineTo(right, footerY - 8)
      .lineWidth(0.6)
      .strokeColor("#cbd4df")
      .stroke()
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLORS.muted)
      .text(`EventIQ Partner Agreement | Version ${agreementVersion}`, left, footerY, {
        width: right - left - 80
      })
      .text(`Page ${index + 1} of ${range.count}`, right - 80, footerY, {
        width: 80,
        align: "right"
      })
      .restore();
  }
}

function createPartnerAgreementPdf(output, options) {
  const document = new PDFDocument({
    size: "LETTER",
    margins: { top: 58, right: 54, bottom: 58, left: 54 },
    bufferPages: true,
    info: {
      Title: options.title,
      Author: "Microsoft EventIQ",
      Subject: "EventIQ Partner Agreement"
    }
  });

  document.on("pageAdded", () => writeDocumentHeader(document));
  if (options.onError) {
    document.on("error", options.onError);
  }
  document.pipe(output);
  writeDocumentHeader(document);

  document
    .moveDown(1.2)
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor(COLORS.ink)
    .text("Microsoft EventIQ Partner Agreement", { align: "center" });
  document
    .moveDown(0.35)
    .font("Helvetica")
    .fontSize(11)
    .fillColor(COLORS.muted)
    .text("EventIQ Program Terms and Conditions", { align: "center" });
  document
    .moveDown(0.7)
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(options.signed ? COLORS.signed : COLORS.sample)
    .text(options.signed ? "DIGITALLY SIGNED AGREEMENT" : "UNSIGNED SAMPLE FOR REVIEW", {
      align: "center"
    })
    .moveDown(1.2);

  writeDetails(document, [
    ["Agreement version", options.agreementVersion],
    [options.signed ? "Signed at" : "Generated at", options.generatedAt],
    ["Terms URL", options.termsUrl],
    ["Partner", options.partnerName]
  ]);

  document
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLORS.ink)
    .text(
      `This Microsoft EventIQ Partner Agreement ("Agreement") is between Microsoft Corporation ("Microsoft") and Partner (${options.partnerName}) and governs Partner (${options.partnerName})'s participation in the Microsoft EventIQ Program.`,
      { align: "justify", lineGap: 3 }
    )
    .moveDown(1);

  parseAgreementSections(options.agreementText).forEach((section) => {
    writeSection(document, section);
  });

  writeSignatureBlock(document, {
    signed: options.signed,
    partnerName: options.partnerName,
    signerName: options.signerName || "Not signed",
    signerEmail: options.signerEmail || "Not signed",
    signedAt: options.signed ? options.generatedAt : "Not signed",
    evidenceNote: options.signed
      ? "Generated from the immutable agreement snapshot stored when the partner digitally signed."
      : "This sample is for review only and is not evidence of acceptance or a completed digital signature."
  });

  writePageFooters(document, options.agreementVersion);
  document.end();
  return document;
}

module.exports = {
  createPartnerAgreementPdf,
  parseAgreementSections
};
