import type { CanonicalDocument, LanguageDirection } from "@/types/domain";
import { countDocumentWords } from "@/lib/words";
import { extractDocx } from "@/lib/documents/docx";
import { extractDigitalPdf } from "@/lib/documents/pdf";
import { extractTextDocument } from "@/lib/documents/text";
import { getTranslationProvider } from "@/lib/openai/responses-provider";
import { PDFDocument } from "pdf-lib";
import type { OcrBlock } from "@/lib/openai/provider";

// Providers cap the rendered page payload they will accept; larger pages are
// rasterized down before OCR instead of failing the whole extraction.
const MAX_OCR_PAGE_BYTES = 4 * 1024 * 1024;

function ocrNodes(blocks: OcrBlock[], page: number, width: number, height: number, direction: LanguageDirection) {
  return blocks.map((block) => ({ id: crypto.randomUUID(), type: block.type, sourceText: block.text, page, order: block.order, confidence: Math.min(block.confidence, block.bounds ? 0.95 : 0.75), bounds: block.bounds ? { page, x: block.bounds.x * width / 1000, y: block.bounds.y * height / 1000, width: block.bounds.width * width / 1000, height: block.bounds.height * height / 1000 } : undefined, style: { direction: direction === "ar-en" ? "rtl" as const : "ltr" as const }, metadata: { extraction: "openai_vision", ocrBlockId: block.id } }));
}

// One unreadable page (huge embedded images, exotic encodings) must not kill
// the extraction. Rate limits are transient: retry with backoff before
// conceding, so parallel waves do not silently blank pages.
const OCR_PAGE_ATTEMPTS = [0, 3000, 9000];

async function ocrPageSafe(pageBytes: Uint8Array, mimeType: string, title: string, page: number): Promise<OcrBlock[]> {
  let lastError = "unknown error";
  for (const [attempt, delay] of OCR_PAGE_ATTEMPTS.entries()) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const result = await getTranslationProvider().ocrDocument(pageBytes, mimeType, `${title} - page ${page}`);
      return result.blocks;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`OCR attempt ${attempt + 1} failed for page ${page} of ${title}: ${lastError}`);
    }
  }
  return [];
}

async function rasterizePage(source: PDFDocument, pageIndex: number, force = false): Promise<Uint8Array | null> {
  // Re-encode the page via pdfjs at print scale. Used for oversized vector
  // pages and as the fallback when the provider rejects a page's native
  // image encodings (fax/CCITT, exotic JPEG) — a plain JPEG always works.
  if (!force) return null;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const sourceBytes = await source.save();
    const doc = await pdfjs.getDocument({ data: sourceBytes.slice(), isOffscreenCanvasSupported: false, useSystemFonts: true, isEvalSupported: false }).promise;
    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.5 });
    const { createCanvas } = await import("@napi-rs/canvas");
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
    await doc.destroy();
    return await canvas.encode("jpeg", 80);
  } catch (error) {
    console.warn(`Rasterizing page ${pageIndex + 1} failed:`, error instanceof Error ? error.message : error);
    return null;
  }
}

export async function extractCanonicalDocument({ bytes, mimeType, title, direction, text }: { bytes?: Uint8Array; mimeType: string; title: string; direction: LanguageDirection; text?: string }): Promise<CanonicalDocument> {
  if (mimeType === "text/plain") return extractTextDocument(text ?? new TextDecoder().decode(bytes), title, direction);
  if (!bytes) throw new Error("Document bytes are required.");
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return extractDocx(bytes, title, direction);
  if (mimeType === "application/pdf") {
    const digital = await extractDigitalPdf(bytes, title, direction);
    if (digital) {
      const source = await PDFDocument.load(bytes);
      // OCR the image-only pages in small parallel waves: sequential per-page
      // calls exceed the function budget, while wider waves trip provider
      // rate limits (which retries then back off from).
      const ocrConcurrency = 2;
      const pendingPages: number[] = [];
      for (let page = 1; page <= digital.pageCount; page += 1) {
        if (!digital.nodes.some((node) => node.page === page)) pendingPages.push(page);
      }
      const handlePage = async (page: number) => {
        const single = await PDFDocument.create();
        single.addPage((await single.copyPages(source, [page - 1]))[0]);
        const pageBytes = await single.save();
        let blocks: OcrBlock[] = [];
        if (pageBytes.length <= MAX_OCR_PAGE_BYTES) blocks = await ocrPageSafe(pageBytes, mimeType, title, page);
        if (!blocks.length) {
          const raster = await rasterizePage(source, page - 1, true);
          if (raster && raster.length <= MAX_OCR_PAGE_BYTES) blocks = await ocrPageSafe(raster, "image/jpeg", title, page);
        }
        const size = digital.pages![page - 1];
        digital.nodes.push(...ocrNodes(blocks, page, size.width, size.height, direction));
        digital.warnings.push({ code: "ocr_uncertain", page, severity: "warning", message: blocks.length ? "Scanned page: OCR text and approximate placement require review." : "No text could be read from this page. The original page is preserved in the export; enter any missing text in Text corrections." });
      };
      for (let offset = 0; offset < pendingPages.length; offset += ocrConcurrency) {
        await Promise.all(pendingPages.slice(offset, offset + ocrConcurrency).map((page) => handlePage(page)));
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
