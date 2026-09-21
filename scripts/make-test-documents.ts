import { writeFile } from "node:fs/promises";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function main() {
  const docx = new Document({
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun("Service Agreement")] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Between OneSmartBiz and Gulf Logistics LLC", italics: true })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun("This Service Agreement (the \"Agreement\") is entered into on 31 August 2026 by and between OneSmartBiz Software Solutions W.L.L, a company registered in Doha, Qatar (the \"Provider\"), and Gulf Logistics LLC (the \"Client\").")] }),
        new Paragraph({ children: [new TextRun({ text: "1. Scope of Services. ", bold: true }), new TextRun("The Provider will deliver translation, localisation, and software integration services as described in Statement of Work No. 4 attached to this Agreement.")] }),
        new Paragraph({ children: [new TextRun({ text: "2. Fees and Payment. ", bold: true }), new TextRun("The Client shall pay a fixed fee of QAR 24,500.00 per month, invoiced on the first business day of each calendar month, payable within thirty (30) days of the invoice date.")] }),
        new Paragraph({ children: [new TextRun({ text: "3. Term. ", bold: true }), new TextRun("The initial term of this Agreement is twelve (12) months commencing on 1 September 2026 and ending on 31 August 2027, unless terminated earlier in accordance with Clause 9.")] }),
        new Paragraph({ children: [new TextRun({ text: "4. Confidentiality. ", bold: true }), new TextRun("Each party shall keep the other party's confidential information secret and shall not disclose it to any third party except as required by law or regulation.")] }),
        new Paragraph({ text: "" }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Schedule A — Deliverables")] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Item", bold: true })] })] }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Quantity", bold: true })] })] }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Unit price (QAR)", bold: true })] })] })] }),
            new TableRow({ children: [new TableCell({ children: [new Paragraph("Document translation")] }), new TableCell({ children: [new Paragraph("120 pages")] }), new TableCell({ children: [new Paragraph("8,400.00")] })] }),
            new TableRow({ children: [new TableCell({ children: [new Paragraph("Glossary development")] }), new TableCell({ children: [new Paragraph("1 project")] }), new TableCell({ children: [new Paragraph("3,200.00")] })] }),
            new TableRow({ children: [new TableCell({ children: [new Paragraph("Software localisation")] }), new TableCell({ children: [new Paragraph("2 applications")] }), new TableCell({ children: [new Paragraph("12,900.00")] })] }),
          ],
        }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun("Signed on 31 August 2026 in Doha, Qatar.")] }),
      ],
    }],
  });
  await writeFile("tmp-test/fixtures/agreement.docx", await Packer.toBuffer(docx));
  console.log("DOCX written");

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28, 841.89]);
  const lines: Array<[string, typeof font, number]> = [
    ["QUARTERLY PROJECT STATUS REPORT", bold, 16],
    ["Prepared for: Gulf Logistics LLC", font, 11],
    ["Reporting period: June - August 2026", font, 11],
    ["", font, 11],
    ["1. Executive Summary", bold, 13],
    ["The migration phase completed on schedule and under budget. All 14", font, 11],
    ["integration points passed acceptance testing on 12 August 2026.", font, 11],
    ["Remaining risk items are tracked in the project register with owners", font, 11],
    ["and target dates agreed at the steering committee meeting.", font, 11],
    ["", font, 11],
    ["2. Key Metrics", bold, 13],
    ["Documents processed: 1,284        Accuracy target: 99.2%", font, 11],
    ["Average turnaround: 3.4 hours     On-time delivery: 97.8%", font, 11],
    ["", font, 11],
    ["3. Next Steps", bold, 13],
    ["Complete the failover rehearsal during the first week of October", font, 11],
    ["and confirm the support handover plan with the operations team.", font, 11],
  ];
  let y = 780;
  for (const [text, useFont, size] of lines) {
    page.drawText(text, { x: 56, y, size, font: useFont, color: rgb(0.08, 0.1, 0.14) });
    y -= size + 9;
  }
  await writeFile("tmp-test/fixtures/status-report.pdf", await pdf.save());
  console.log("PDF written");
}

main().catch((error) => { console.error(error); process.exit(1); });
