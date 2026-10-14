import type { CanonicalDocument, DocumentNode, LanguageDirection } from "@/types/domain";
import { countDocumentWords } from "@/lib/words";
// Static side-effect import: registers globalThis.pdfjsWorker so pdfjs can run
// its fake worker inside the server bundle, where a dynamic workerSrc import
// fails. Bundlers emit this as a regular module dependency.
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

interface PdfTextItem { str: string; transform: number[]; width: number; height: number; fontSize: number }

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
      // Only lines spaced like running text (leading ≲1.5em) belong to one
      // paragraph; anything looser is a new block, even at the same indent.
      && verticalGap <= line.height * 0.45
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
  // pdfjs v5 evaluates DOM globals at import time; serverless Node lacks them.
  if (!globalThis.DOMMatrix || !globalThis.ImageData || !globalThis.Path2D) {
    const canvas = await import("@napi-rs/canvas");
    globalThis.DOMMatrix ??= canvas.DOMMatrix as unknown as typeof DOMMatrix;
    globalThis.ImageData ??= canvas.ImageData as unknown as typeof ImageData;
    globalThis.Path2D ??= canvas.Path2D as unknown as typeof Path2D;
  }
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
        // pdfjs reports height from the font bounding box, which some embedded
        // CID fonts inflate to ~2x the visual glyph size; inflated heights then
        // swallow neighbouring lines into one block. The text matrix scale is
        // the honest point size, so prefer it and clamp against the bbox.
        const matrixSize = Math.abs(textItem.transform[3]) || Math.abs(textItem.transform[0]);
        const bboxSize = textItem.height > 0 ? textItem.height : matrixSize;
        const fontSize = Math.min(matrixSize > 0 ? matrixSize : bboxSize, bboxSize) || bboxSize;
        return { str: textItem.str, transform, width: textItem.width, height: textItem.height, fontSize: Math.max(4, Math.min(400, fontSize)) };
      });
    // Cluster items into lines by baseline proximity instead of a fixed grid:
    // sub-point and multi-point baseline wobble must join, headings must not.
    const byBaseline = [...items].sort((a, b) => a.transform[5] - b.transform[5]);
    const lines = new Map<number, PdfTextItem[]>();
    let bucket = Number.NaN;
    for (const item of byBaseline) {
      const y = item.transform[5];
      if (!Number.isFinite(bucket) || Math.abs(y - bucket) > Math.max(2, item.fontSize * 0.25)) bucket = y;
      lines.set(bucket, [...(lines.get(bucket) ?? []), item]);
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
        if (!previous || item.transform[4] - (previous.transform[4] + previous.width) > Math.max(8, item.fontSize * 0.8)) groups.push([item]);
        else group!.push(item);
      }
      for (const group of groups) {
        const readingOrder = direction === "ar-en" ? [...group].reverse() : group;
        // Some producers (including this app's own renderer) emit one text
        // operator per character; join adjacent runs without inserting a word
        // space when they sit kerning-tight, so words are not letter-spaced.
        let text = "";
        for (const [index, item] of readingOrder.entries()) {
          const previous = readingOrder[index - 1];
          const gap = previous ? item.transform[4] - (previous.transform[4] + previous.width) : Infinity;
          text += index === 0 || /\s$/.test(text) || /^\s/.test(item.str) ? item.str : gap > Math.max(1.5, item.fontSize * 0.2) ? ` ${item.str}` : item.str;
        }
        text = text.replace(/\s+/g, " ").trim();
        if (!text) continue;
        const minX = Math.min(...group.map((item) => item.transform[4]));
        const maxX = Math.max(...group.map((item) => item.transform[4] + item.width));
        const size = Math.max(...group.map((item) => item.fontSize));
        // Cover the ascender above and the descender below the baseline, and
        // no more: oversized boxes erase neighbouring content when white-out.
        lineBoxes.push({ x: minX, top: Math.max(0, y - size * 0.85), width: maxX - minX, height: size * 1.1, text });
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
