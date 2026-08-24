import type { CanonicalDocument, LanguageDirection } from "@/types/domain";
import { countDocumentWords } from "@/lib/words";
import { extractDocx } from "@/lib/documents/docx";
import { extractDigitalPdf } from "@/lib/documents/pdf";
import { extractTextDocument } from "@/lib/documents/text";
import { getTranslationProvider } from "@/lib/openai/responses-provider";

export async function extractCanonicalDocument({ bytes, mimeType, title, direction, text }: { bytes?: Uint8Array; mimeType: string; title: string; direction: LanguageDirection; text?: string }): Promise<CanonicalDocument> {
  if (mimeType === "text/plain") return extractTextDocument(text ?? new TextDecoder().decode(bytes), title, direction);
  if (!bytes) throw new Error("Document bytes are required.");
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return extractDocx(bytes, title, direction);
  if (mimeType === "application/pdf") {
    const digital = await extractDigitalPdf(bytes, title, direction);
    if (digital) return digital;
  }
  const ocr = await getTranslationProvider().ocrDocument(bytes, mimeType, title);
  const nodes = ocr.blocks.map((block) => ({ id: crypto.randomUUID(), type: block.type, sourceText: block.text, page: block.page, order: block.order, confidence: block.confidence, bounds: block.bounds, style: { direction: direction === "ar-en" ? "rtl" as const : "ltr" as const }, metadata: { extraction: "openai_vision", ocrBlockId: block.id } }));
  return { version: 1, title, mimeType, direction, pageCount: ocr.pageCount, sourceWordCount: countDocumentWords(nodes.map((node) => node.sourceText)), nodes, warnings: [] };
}
