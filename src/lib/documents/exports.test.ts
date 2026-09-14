// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import { assertCompleteTranslation, createDocxExport, renderPdf } from "@/lib/exports";
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
    const extracted = await extractDigitalPdf(new Uint8Array(result.bytes), "output.pdf", "ar-en");
    expect(extracted?.nodes.map((node) => node.sourceText).join(" ")).toContain("END-739");
  });
  it("exports editable Word from PDF input instead of rejecting it", async () => {
    const bytes = await createDocxExport(canonical);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("END-739");
    expect(xml).toContain('w:w="8000"');
  });
});
