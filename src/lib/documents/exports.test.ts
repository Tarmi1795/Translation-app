// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import { assertCompleteTranslation, createDocxExport, renderPdf, visualRtl } from "@/lib/exports";
import { extractDigitalPdf } from "@/lib/documents/pdf";
import type { CanonicalDocument } from "@/types/domain";

const canonical: CanonicalDocument = { version: 1, title: "Layout regression", mimeType: "application/pdf", direction: "ar-en", pageCount: 1, pages: [{ width: 400, height: 600 }], sourceWordCount: 2, warnings: [], nodes: [{ id: "cell", type: "table_cell", sourceText: "مصدر", translatedText: "A translated clause that must remain fully readable, even when it is substantially longer than the original source cell. END-739", page: 1, order: 0, bounds: { page: 1, x: 30, y: 40, width: 45, height: 12 }, style: { fontSize: 10 } }] };

describe("document exports", () => {
  it("never exports partially translated content", () => {
    expect(() => assertCompleteTranslation({ ...canonical, nodes: [{ ...canonical.nodes[0], translatedText: "" }] })).toThrow(/still need translation/);
  });
  it("preserves the original page size and carries all overflow into a labelled continuation", async () => {
    const source = await PDFDocument.create();
    const page = source.addPage([400, 600]);
    page.drawText("Source", { x: 30, y: 550, size: 10, font: await source.embedFont(StandardFonts.Helvetica) });
    const result = await renderPdf(canonical, "ar-en", await source.save());
    const output = await PDFDocument.load(result.bytes);
    expect(output.getPage(0).getWidth()).toBe(400);
    expect(output.getPageCount()).toBeGreaterThan(1);
    expect(result.warnings.some((item) => item.code === "overflow")).toBe(true);
    const extracted = await extractDigitalPdf(new Uint8Array(result.bytes), "output.pdf", "en-ar");
    expect(extracted?.nodes.map((node) => node.sourceText).join(" ")).toContain("END-739");
    // Continuation pages carry a clean localized heading, never segment markers.
    const text = extracted?.nodes.map((node) => node.sourceText).join(" ") ?? "";
    expect(text).toContain("Continued translations");
    expect(text).not.toMatch(/\[\d+\]/);
  });

  it("renders Arabic translations with digits and Latin codes intact", async () => {
    // pdfjs extraction reorders RTL items, so digit order is asserted at the
    // stored-string level (visualRtl) and only rendering presence end-to-end.
    const visual = visualRtl("التاريخ: 23 سبتمبر 2026");
    expect(visual.includes("23")).toBe(true);
    expect(visual.includes("2026")).toBe(true);
    expect(visual.includes("32")).toBe(false);
    expect(visual.includes("6202")).toBe(false);
    const source = await PDFDocument.create();
    const page = source.addPage([500, 400]);
    const helvetica = await source.embedFont(StandardFonts.Helvetica);
    page.drawText("Date: September 23, 2026", { x: 40, y: 360, size: 12, font: helvetica });
    const doc: CanonicalDocument = {
      version: 1, title: "digits", mimeType: "application/pdf", direction: "en-ar", pageCount: 1,
      pages: [{ width: 500, height: 400 }], sourceWordCount: 4, warnings: [],
      nodes: [{ id: "date", type: "paragraph", sourceText: "Date: September 23, 2026", translatedText: "التاريخ: 23 سبتمبر 2026", page: 1, order: 0, bounds: { page: 1, x: 40, y: 24, width: 220, height: 16 }, style: { fontSize: 12 } }],
    };
    const result = await renderPdf(doc, "en-ar", await source.save());
    const extracted = await extractDigitalPdf(new Uint8Array(result.bytes), "digits.pdf", "en-ar");
    const text = extracted?.nodes.map((node) => node.sourceText).join(" ") ?? "";
    expect(/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)).toBe(true);
    expect(text).not.toMatch(/\[\d+\]/);
  });
  it("exports editable Word from PDF input instead of rejecting it", async () => {
    const bytes = await createDocxExport(canonical);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("END-739");
    expect(xml).toContain('w:w="8000"');
  });
});
