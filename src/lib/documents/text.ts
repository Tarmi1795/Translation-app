import type { CanonicalDocument, LanguageDirection } from "@/types/domain";
import { countDocumentWords } from "@/lib/words";

export function extractTextDocument(text: string, title: string, direction: LanguageDirection): CanonicalDocument {
  const paragraphs = text.normalize("NFC").split(/\n{2,}|\r?\n/).map((value) => value.trim()).filter(Boolean);
  const nodes = paragraphs.map((sourceText, order) => ({ id: crypto.randomUUID(), type: "paragraph" as const, sourceText, page: 1, order, confidence: 1, style: { direction: direction === "ar-en" ? "rtl" as const : "ltr" as const }, metadata: { extraction: "plain_text" } }));
  return { version: 1, title, mimeType: "text/plain", direction, pageCount: 1, sourceWordCount: countDocumentWords(paragraphs), nodes, warnings: [] };
}
