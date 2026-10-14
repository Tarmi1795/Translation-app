// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractDigitalPdf } from "@/lib/documents/pdf";

// A minimal letter in the shape of the ELMA regression document: a title, a
// date line, a subject line, then a three-line body paragraph.
async function letterPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText("ONESMARTBIZ", { x: 60, y: 740, size: 16, font: bold });
  page.drawText("Date: September 23, 2026", { x: 60, y: 700, size: 12, font });
  page.drawText("SUBJECT: NOTIFICATION OF DISCLAIMER", { x: 60, y: 676, size: 12, font: bold });
  page.drawText("This official letter serves as formal notification regarding", { x: 60, y: 650, size: 12, font });
  page.drawText("the terms and boundaries of your employment and", { x: 60, y: 634, size: 12, font });
  page.drawText("sponsorship under the regulations of the State of Qatar.", { x: 60, y: 618, size: 12, font });
  return new Uint8Array(await pdf.save());
}

describe("digital PDF extraction geometry", () => {
  it("keeps separately spaced lines as separate nodes with honest heights", async () => {
    const extracted = await extractDigitalPdf(await letterPdf(), "letter.pdf", "en-ar");
    expect(extracted).not.toBeNull();
    const nodes = extracted!.nodes;
    const date = nodes.find((node) => node.sourceText.includes("September 23"));
    const subject = nodes.find((node) => node.sourceText.includes("SUBJECT"));
    expect(date).toBeDefined();
    expect(subject).toBeDefined();
    expect(date!.sourceText).not.toContain("SUBJECT");
    expect(subject!.sourceText).not.toContain("September");
    // Heights must track the point size, not an inflated font bounding box.
    for (const node of [date!, subject!]) {
      expect(node.bounds!.height).toBeGreaterThan(8);
      expect(node.bounds!.height).toBeLessThan(20);
      expect(node.style!.fontSize).toBeLessThan(20);
    }
  });

  it("merges consecutive body lines into one paragraph block", async () => {
    const extracted = await extractDigitalPdf(await letterPdf(), "letter.pdf", "en-ar");
    const body = extracted!.nodes.find((node) => node.sourceText.includes("official letter"));
    expect(body).toBeDefined();
    expect(body!.sourceText).toContain("employment");
    expect(body!.sourceText).toContain("State of Qatar");
    // Three 12pt lines at 16pt leading.
    expect(body!.bounds!.height).toBeGreaterThan(36);
    expect(body!.bounds!.height).toBeLessThan(60);
  });
});
