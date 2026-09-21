import type { CanonicalDocument, LanguageDirection } from "@/types/domain";
import { countDocumentWords } from "@/lib/words";
import { extractDocx } from "@/lib/documents/docx";
import { extractDigitalPdf } from "@/lib/documents/pdf";
import { extractTextDocument } from "@/lib/documents/text";
import { getTranslationProvider } from "@/lib/openai/responses-provider";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, type PDFPage } from "pdf-lib";
import { inflateSync } from "node:zlib";
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

// Scanned pages embed their scan as an image XObject. DCTDecode streams ARE
// JPEG bytes (FlateDecode-wrapped ones just need zlib), so when the provider
// rejects the vector page, its largest embedded image is sent directly — no
// rasterizer needed. CCITT/fax images cannot be converted here.
function embeddedPageImage(page: PDFPage): Uint8Array | null {
  try {
    const resources = page.node.Resources();
    const xobject = resources?.lookup(PDFName.of("XObject"), PDFDict);
    if (!xobject) return null;
    let best: { area: number; jpeg: Uint8Array } | null = null;
    for (const [key] of xobject.entries()) {
      const candidate = xobject.lookup(key);
      if (!(candidate instanceof PDFRawStream)) continue;
      const stream = candidate;
      if (String(stream.dict.get(PDFName.of("Subtype"))) !== "/Image") continue;
      const width = Number(stream.dict.get(PDFName.of("Width")));
      const height = Number(stream.dict.get(PDFName.of("Height")));
      const filterRaw = stream.dict.get(PDFName.of("Filter"));
      const filters = filterRaw instanceof PDFArray ? filterRaw.asArray().map(String) : [String(filterRaw)];
      let jpeg: Uint8Array | null = null;
      if (filters.length === 1 && filters[0] === "/DCTDecode") jpeg = stream.contents;
      else if (filters.length === 2 && filters[0] === "/FlateDecode" && filters[1] === "/DCTDecode") {
        try { jpeg = new Uint8Array(inflateSync(Buffer.from(stream.contents))); } catch { jpeg = null; }
      }
      if (jpeg && width * height > (best?.area ?? 0)) best = { area: width * height, jpeg };
    }
    return best?.jpeg ?? null;
  } catch {
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
          const embedded = embeddedPageImage(source.getPage(page - 1));
          if (embedded && embedded.length <= MAX_OCR_PAGE_BYTES) blocks = await ocrPageSafe(embedded, "image/jpeg", title, page);
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
