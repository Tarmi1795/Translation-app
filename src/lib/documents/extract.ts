import type { CanonicalDocument, LanguageDirection } from "@/types/domain";
import { countDocumentWords } from "@/lib/words";
import { extractDocx } from "@/lib/documents/docx";
import { extractDigitalPdf } from "@/lib/documents/pdf";
import { extractTextDocument } from "@/lib/documents/text";
import { getTranslationProvider } from "@/lib/openai/responses-provider";
import { PDFDocument } from "pdf-lib";
import type { OcrBlock } from "@/lib/openai/provider";

function ocrNodes(blocks: OcrBlock[], page: number, width: number, height: number, direction: LanguageDirection) {
  return blocks.map((block) => ({ id: crypto.randomUUID(), type: block.type, sourceText: block.text, page, order: block.order, confidence: Math.min(block.confidence, block.bounds ? 0.95 : 0.75), bounds: block.bounds ? { page, x: block.bounds.x * width / 1000, y: block.bounds.y * height / 1000, width: block.bounds.width * width / 1000, height: block.bounds.height * height / 1000 } : undefined, style: { direction: direction === "ar-en" ? "rtl" as const : "ltr" as const }, metadata: { extraction: "openai_vision", ocrBlockId: block.id } }));
}

export async function extractCanonicalDocument({ bytes, mimeType, title, direction, text }: { bytes?: Uint8Array; mimeType: string; title: string; direction: LanguageDirection; text?: string }): Promise<CanonicalDocument> {
  if (mimeType === "text/plain") return extractTextDocument(text ?? new TextDecoder().decode(bytes), title, direction);
  if (!bytes) throw new Error("Document bytes are required.");
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return extractDocx(bytes, title, direction);
  if (mimeType === "application/pdf") {
    const digital = await extractDigitalPdf(bytes, title, direction);
    if (digital) {
      const source = await PDFDocument.load(bytes);
      for (let page = 1; page <= digital.pageCount; page++) {
        if (digital.nodes.some((node) => node.page === page)) continue;
        const single = await PDFDocument.create();
        single.addPage((await single.copyPages(source, [page - 1]))[0]);
        const result = await getTranslationProvider().ocrDocument(await single.save(), mimeType, `${title} - page ${page}`);
        const size = digital.pages![page - 1];
        digital.nodes.push(...ocrNodes(result.blocks, page, size.width, size.height, direction));
        digital.warnings.push({ code: "ocr_uncertain", page, severity: "warning", message: result.blocks.length ? "Scanned page: OCR text and approximate placement require review." : "No text was detected on this page. The original page is preserved; verify it contains no untranslated text." });
      }
      digital.nodes.sort((a, b) => a.page - b.page || a.order - b.order).forEach((node, order) => { node.order = order; });
      digital.sourceWordCount = countDocumentWords(digital.nodes.map((node) => node.sourceText));
      return digital;
    }
  }
  const ocr = await getTranslationProvider().ocrDocument(bytes, mimeType, title);
  const pdf = await PDFDocument.create();
  const image = mimeType === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const width = 595.28;
  const height = width * image.height / image.width;
  const nodes = ocrNodes(ocr.blocks, 1, width, height, direction);
  return { version: 1, title, mimeType, direction, pageCount: 1, pages: [{ width, height }], sourceWordCount: countDocumentWords(nodes.map((node) => node.sourceText)), nodes, warnings: [{ code: "ocr_uncertain", page: 1, severity: "warning", message: "Scanned source: OCR and approximate placement require review." }] };
}
