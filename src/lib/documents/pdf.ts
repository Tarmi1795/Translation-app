import type { CanonicalDocument, DocumentNode, LanguageDirection } from "@/types/domain";
import { countDocumentWords } from "@/lib/words";
// Static side-effect import: registers globalThis.pdfjsWorker so pdfjs can run
// its fake worker inside the server bundle, where a dynamic workerSrc import
// fails. Bundlers emit this as a regular module dependency.
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

interface PdfTextItem { str: string; transform: number[]; width: number; height: number }

interface LineBox { x: number; top: number; width: number; height: number; text: string }

// Merge vertically adjacent, horizontally overlapping line boxes into one
// paragraph block. Line-level segments force a full translation into a single
// line's height, which Arabic almost never fits; paragraph blocks let the
// translated text reflow across several lines inside the original area.
function mergeLinesIntoBlocks(lineBoxes: LineBox[]): Array<{ x: number; top: number; width: number; height: number; text: string; fontSize: number }> {
  const blocks: Array<{ x: number; top: number; width: number; height: number; text: string; fontSize: number; bottom: number }> = [];
  for (const line of lineBoxes) {
    const previous = blocks.at(-1);
    const verticalGap = previous ? line.top - previous.bottom : Infinity;
    const overlap = previous ? Math.min(previous.x + previous.width, line.x + line.width) - Math.max(previous.x, line.x) : 0;
    const canMerge = previous
      && verticalGap >= -line.height * 0.35
      && verticalGap <= line.height * 0.95
      && overlap > Math.min(previous.width, line.width) * 0.35
      // A size change marks a heading or caption boundary; keep those separate.
      && previous.fontSize / line.height <= 1.15
      && line.height / previous.fontSize <= 1.15;
    if (canMerge && previous) {
      previous.text = `${previous.text} ${line.text}`.replace(/\s+/g, " ").trim();
      previous.fontSize = Math.max(previous.fontSize, line.height);
      const left = Math.min(previous.x, line.x);
      const right = Math.max(previous.x + previous.width, line.x + line.width);
      previous.x = left;
      previous.top = Math.min(previous.top, line.top);
      previous.width = right - left;
      previous.bottom = Math.max(previous.bottom, line.top + line.height);
      previous.height = previous.bottom - previous.top;
    } else {
      blocks.push({ x: line.x, top: line.top, width: line.width, height: line.height, text: line.text, fontSize: line.height, bottom: line.top + line.height });
    }
  }
  return blocks;
}

export async function extractDigitalPdf(bytes: Uint8Array, title: string, direction: LanguageDirection): Promise<CanonicalDocument | null> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs transfers ownership of the input buffer to its worker, which would
  // detach the caller's bytes before they are reused (pdf-lib, exports).
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, isEvalSupported: false });
  const document = await loadingTask.promise;
  const nodes: DocumentNode[] = [];
  const pages: NonNullable<CanonicalDocument["pages"]> = [];
  let order = 0;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ width: viewport.width, height: viewport.height });
    const content = await page.getTextContent();
    const items: PdfTextItem[] = content.items
      .filter((item) => "str" in item && Boolean(item.str.trim()))
      .map((item) => {
        const textItem = item as { str: string; transform: number[]; width: number; height: number };
        const transform = pdfjs.Util.transform(viewport.transform, textItem.transform);
        return { str: textItem.str, transform, width: textItem.width, height: textItem.height };
      });
    const lines = new Map<number, PdfTextItem[]>();
    for (const item of items) {
      const y = Math.round(item.transform[5] / 4) * 4;
      lines.set(y, [...(lines.get(y) ?? []), item]);
    }
    const sortedLines = [...lines.entries()].sort((a, b) => a[0] - b[0]);
    const lineBoxes: LineBox[] = [];
    for (const [y, lineItems] of sortedLines) {
      const sorted = lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
      // A shared baseline may contain several table cells or columns. Keep
      // distant runs separate so one cell cannot overwrite its neighbour.
      const groups: PdfTextItem[][] = [];
      for (const item of sorted) {
        const group = groups.at(-1);
        const previous = group?.at(-1);
        if (!previous || item.transform[4] - (previous.transform[4] + previous.width) > Math.max(14, item.height * 1.5)) groups.push([item]);
        else group!.push(item);
      }
      for (const group of groups) {
        const readingOrder = direction === "ar-en" ? [...group].reverse() : group;
        const text = readingOrder.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
        if (!text) continue;
        const minX = Math.min(...group.map((item) => item.transform[4]));
        const maxX = Math.max(...group.map((item) => item.transform[4] + item.width));
        const height = Math.max(...group.map((item) => item.height || Math.abs(item.transform[3])));
        lineBoxes.push({ x: minX, top: Math.max(0, y - height), width: maxX - minX, height: height * 1.2, text });
      }
    }
    for (const block of mergeLinesIntoBlocks(lineBoxes)) {
      nodes.push({ id: crypto.randomUUID(), type: "paragraph", sourceText: block.text, page: pageNumber, order: order++, bounds: { x: block.x, y: block.top, width: block.width, height: block.height, page: pageNumber }, style: { fontSize: block.fontSize, direction: direction === "ar-en" ? "rtl" : "ltr" }, confidence: 1, metadata: { extraction: "pdf_text" } });
    }
  }
  await document.destroy();
  const sourceWordCount = countDocumentWords(nodes.map((node) => node.sourceText));
  return { version: 1, title, mimeType: "application/pdf", direction, pageCount: pages.length, pages, sourceWordCount, nodes, warnings: [] };
}
