import type { CanonicalDocument, DocumentNode, LanguageDirection } from "@/types/domain";
import { countDocumentWords } from "@/lib/words";

interface PdfTextItem { str: string; transform: number[]; width: number; height: number }

export async function extractDigitalPdf(bytes: Uint8Array, title: string, direction: LanguageDirection): Promise<CanonicalDocument | null> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false });
  const document = await loadingTask.promise;
  const nodes: DocumentNode[] = [];
  let order = 0;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PdfTextItem[] = content.items
      .filter((item) => "str" in item && Boolean(item.str.trim()))
      .map((item) => {
        const textItem = item as { str: string; transform: number[]; width: number; height: number };
        return { str: textItem.str, transform: textItem.transform, width: textItem.width, height: textItem.height };
      });
    const lines = new Map<number, PdfTextItem[]>();
    for (const item of items) {
      const y = Math.round(item.transform[5] / 4) * 4;
      lines.set(y, [...(lines.get(y) ?? []), item]);
    }
    const sortedLines = [...lines.entries()].sort((a, b) => b[0] - a[0]);
    for (const [y, lineItems] of sortedLines) {
      const sorted = lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
      const sourceText = sorted.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
      const minX = Math.min(...sorted.map((item) => item.transform[4]));
      const maxX = Math.max(...sorted.map((item) => item.transform[4] + item.width));
      const height = Math.max(...sorted.map((item) => item.height || Math.abs(item.transform[3])));
      nodes.push({ id: crypto.randomUUID(), type: "paragraph", sourceText, page: pageNumber, order: order++, bounds: { x: minX, y: viewport.height - y, width: maxX - minX, height, page: pageNumber }, style: { fontSize: height, direction: direction === "ar-en" ? "rtl" : "ltr" }, confidence: 1, metadata: { extraction: "pdf_text" } });
    }
  }
  await document.destroy();
  const sourceWordCount = countDocumentWords(nodes.map((node) => node.sourceText));
  if (sourceWordCount < 3) return null;
  return { version: 1, title, mimeType: "application/pdf", direction, pageCount: document.numPages, sourceWordCount, nodes, warnings: [] };
}
