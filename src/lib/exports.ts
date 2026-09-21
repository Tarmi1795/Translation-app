import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import { ArabicShaper } from "arabic-persian-reshaper";
import bidiFactory from "bidi-js";
import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import { rebuildDocx, DOCX_MIME } from "@/lib/documents/docx";
import { brandDocx, type RenderBranding } from "@/lib/documents/branding-render";
import { appliesToPage } from "@/lib/branding";
import { fitText, intersects, wrapText } from "@/lib/documents/layout";
import type { CanonicalDocument, DocumentNode, LanguageDirection, LayoutWarning } from "@/types/domain";

let fontCache: Uint8Array | null = null;
async function loadArabicFont() {
  if (fontCache) return fontCache;
  fontCache = new Uint8Array(await readFile(path.join(process.cwd(), "public/fonts/NotoSansArabic.ttf")));
  return fontCache;
}
function visualRtl(text: string) {
  const shaped = ArabicShaper.convertArabic(text);
  const bidi = bidiFactory();
  const reordered = bidi.getReorderedString(shaped, bidi.getEmbeddingLevels(shaped, "rtl"));
  // Bidi reordering places a combining mark before its base letter in visual
  // order; fontkit's mark attachment then returns null positions and crashes
  // the layout. Swap each mark back behind its base so the glyph run shapes.
  const isMark = (character: string) => /[\u064B-\u0655\u0670]/.test(character);
  const isArabicBase = (character: string) => /[\u0621-\u063A\u0641-\u064A\uFB50-\uFDFF\uFE70-\uFEFF]/.test(character);
  const chars = Array.from(reordered);
  for (let index = 0; index < chars.length - 1; index += 1) {
    if (isMark(chars[index]) && isArabicBase(chars[index + 1])) {
      [chars[index], chars[index + 1]] = [chars[index + 1], chars[index]];
      index += 1;
    }
  }
  return chars.join("");
}
export function assertCompleteTranslation(document: CanonicalDocument) {
  const missing = document.nodes.filter((node) => node.sourceText.trim() && !node.translatedText?.trim());
  if (missing.length) throw new Error(`${missing.length} segment(s) still need translation. Complete them before exporting.`);
}
export async function renderPdf(document: CanonicalDocument, direction: LanguageDirection, sourceBytes?: Uint8Array, branding: RenderBranding[] = []) {
  assertCompleteTranslation(document);
  const warnings: LayoutWarning[] = [...document.warnings];
  const preservesSource = Boolean(sourceBytes) && (document.mimeType === "application/pdf" || document.mimeType.startsWith("image/"));
  const pdf = document.mimeType === "application/pdf" && sourceBytes ? await PDFDocument.load(sourceBytes, { updateMetadata: false }) : await PDFDocument.create();
  if (document.mimeType.startsWith("image/") && sourceBytes) {
    const image = document.mimeType === "image/png" ? await pdf.embedPng(sourceBytes) : await pdf.embedJpg(sourceBytes);
    const size = document.pages?.[0] ?? { width: 595.28, height: 595.28 * image.height / image.width };
    pdf.addPage([size.width, size.height]).drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
  }
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await loadArabicFont(), { subset: true });
  const rtl = direction === "en-ar";
  // Control characters (e.g. tabs in model output) have no glyph in the Arabic
  // font and crash pdf-lib's layout with a null glyph; normalize them to spaces.
  const unsupported = /[\u0000-\u001F\u007F\u200B-\u200F\u2028\u2029]/g;
  const visual = (text: string) => {
    const cleaned = text.replace(unsupported, " ");
    return rtl ? visualRtl(cleaned) : cleaned;
  };
  const measure = (text: string, size: number) => {
    try { return font.widthOfTextAtSize(visual(text), size); }
    catch { return Array.from(text).length * size * 0.6; }
  };
  const defaultSize = document.pages?.[0] ?? { width: 595.28, height: 841.89, margin: 52 };
  const placed: Array<{ page: number; x: number; y: number; width: number; height: number }> = [];
  const deferred: DocumentNode[] = [];

  const drawLine = (page: PDFPage, text: string, x: number, top: number, width: number, size: number, alignment?: string) => {
    const line = visual(text);
    let textWidth: number;
    try { textWidth = font.widthOfTextAtSize(line, size); }
    catch { textWidth = Array.from(line).length * size * 0.6; }
    const align = alignment === "center" ? (width - textWidth) / 2 : rtl || alignment === "end" ? width - textWidth : 0;
    const at = { x: x + Math.max(0, align), y: page.getHeight() - top - size, size, font, color: rgb(0.08, 0.1, 0.14) };
    try { page.drawText(line, at); }
    catch {
      // A glyph outside the embedded font must not fail the whole export:
      // draw character by character and skip the few unsupported ones.
      let cursor = at.x;
      for (const character of Array.from(line)) {
        const charWidth = font.widthOfTextAtSize(character, size);
        try { page.drawText(character, { ...at, x: cursor }); }
        catch { /* Skip the unrenderable glyph; the surrounding line stays. */ }
        cursor += charWidth;
      }
    }
  };

  if (preservesSource) {
    // Erase all source regions before drawing translated text, so neighbouring
    // source masks cannot erase an earlier translation.
    // Collect placement outcomes and emit a compact summary instead of one
    // warning per segment — dense documents otherwise flood the review list.
    const movedByPage = new Map<number, number>();
    const noPosition: number[] = [];
    const reduced: number[] = [];
    let smallestReduced = Number.POSITIVE_INFINITY;
    for (const node of document.nodes.filter((node) => node.sourceText.trim())) {
      const b = node.bounds;
      if (!b || ![b.x,b.y,b.width,b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0 || b.page < 1 || b.page > pdf.getPageCount()) {
        deferred.push(node); noPosition.push(node.order + 1); continue;
      }
      const page = pdf.getPage(b.page - 1);
      if (page.getRotation().angle !== 0 || b.x < 0 || b.y < 0 || b.x + b.width > page.getWidth() + 1 || b.y + b.height > page.getHeight() + 1) {
        deferred.push(node); noPosition.push(node.order + 1); continue;
      }
      page.drawRectangle({ x: b.x, y: page.getHeight() - b.y - b.height, width: b.width, height: b.height, color: rgb(1,1,1) });
    }
    for (const node of document.nodes.filter((node) => node.sourceText.trim() && !deferred.includes(node))) {
      const b = node.bounds!;
      // Never enlarge into neighbouring cells or reduce below 9pt.
      const fitted = fitText(node.translatedText!, b.width, b.height, node.style?.fontSize ?? 11, measure);
      const collision = placed.some((box) => box.page === b.page && intersects(box, b));
      if (!fitted || collision) {
        deferred.push(node);
        movedByPage.set(b.page, (movedByPage.get(b.page) ?? 0) + 1);
        const reference = `[${node.order + 1}]`;
        if (b.width >= measure(reference, 9) && b.height >= 12) drawLine(pdf.getPage(b.page - 1), reference, b.x, b.y, b.width, 9);
        continue;
      }
      placed.push(b);
      fitted.lines.forEach((line, index) => drawLine(pdf.getPage(b.page - 1), line, b.x, b.y + index * fitted.lineHeight, b.width, fitted.size, node.style?.alignment));
      if (fitted.size < (node.style?.fontSize ?? 11) - 0.5) { reduced.push(node.order + 1); smallestReduced = Math.min(smallestReduced, fitted.size); }
    }
    const overflowTotal = [...movedByPage.values()].reduce((sum, count) => sum + count, 0);
    if (noPosition.length) warnings.push({ code: "material_reflow", page: 1, severity: "warning", message: `${noPosition.length} segment${noPosition.length === 1 ? "" : "s"} (numbers ${noPosition.slice(0, 8).join(", ")}${noPosition.length > 8 ? "…" : ""}) had no usable position — their translations are on continuation pages.` });
    for (const [page, count] of [...movedByPage.entries()].sort((a, b) => a[0] - b[0])) {
      warnings.push({ code: "overflow", page, severity: "warning", message: `${count} segment${count === 1 ? "" : "s"} on page ${page} did not fit legibly (marked [n] in place). Full translations are on the continuation pages.` });
    }
    if (reduced.length) warnings.push({ code: "material_reflow", page: 1, severity: "info", message: `${reduced.length} segment${reduced.length === 1 ? " was" : "s were"} reduced in size to fit (smallest ${smallestReduced.toFixed(1)} pt).` });
    warnings.push({ code: "font_substitution", page: 1, severity: "info", message: "Translated text uses an embedded Arabic-capable font; check coloured backgrounds and table rules in the PDF." });
  } else {
    deferred.push(...document.nodes.filter((node) => node.sourceText.trim()));
    if (document.mimeType !== "text/plain") warnings.push({ code: "formatting_approximate", page: 1, severity: "warning", message: "PDF is a readable reconstruction, not a 1:1 Word rendering. Original tables, images, headers and margins are best preserved in the editable Word download." });
  }

  let flowPage: PDFPage | undefined;
  let top = 0;
  let sourcePage = -1;
  const margin = Math.max(24, Math.min(defaultSize.margin ?? 52, defaultSize.width / 4));
  function addFlowPage() {
    flowPage = pdf.addPage([defaultSize.width, defaultSize.height]);
    top = margin;
    // Reserve branding areas on reconstructed pages where placement is known.
    for (const asset of branding.filter((item) => item.pages === "all" || (item.pages === "first" && pdf.getPageCount() === 1))) {
      const bottom = asset.y * defaultSize.height + asset.width * defaultSize.width / asset.aspect;
      if (asset.kind === "letterhead" && asset.y < 0.25) top = Math.max(top, bottom + 12);
    }
    if (top > defaultSize.height * 0.55) throw new Error("Letterhead leaves too little space for readable text. Reduce its size or move it.");
  }
  for (const node of deferred) {
    if (!flowPage || (!preservesSource && node.page !== sourcePage)) { addFlowPage(); sourcePage = node.page; }
    if (preservesSource) {
      if (top + 35 > defaultSize.height - margin) addFlowPage();
      drawLine(flowPage!, `Page ${node.page} / Segment ${node.order + 1}`, margin, top, defaultSize.width - margin * 2, 9, "start");
      top += 18;
    }
    const size = Math.min(24, Math.max(10, node.style?.fontSize ?? (node.type === "heading" ? 16 : 11)));
    const lineHeight = size * 1.5;
    for (const line of wrapText(node.translatedText!, defaultSize.width - margin * 2, size, measure)) {
      if (top + lineHeight > defaultSize.height - margin) addFlowPage();
      drawLine(flowPage!, line, margin, top, defaultSize.width - margin * 2, size, node.style?.alignment);
      placed.push({ page: pdf.getPageCount(), x: margin, y: top, width: defaultSize.width - margin * 2, height: lineHeight });
      top += lineHeight;
    }
    top += 8;
  }
  if (!pdf.getPageCount()) pdf.addPage([defaultSize.width, defaultSize.height]);
  for (const asset of branding) {
    const image = asset.mimeType === "image/png" ? await pdf.embedPng(asset.bytes) : await pdf.embedJpg(asset.bytes);
    for (const [index, page] of pdf.getPages().entries()) {
      if (!appliesToPage(asset, index + 1, pdf.getPageCount())) continue;
      const box = { page: index + 1, x: asset.x * page.getWidth(), y: asset.y * page.getHeight(), width: asset.width * page.getWidth(), height: asset.width * page.getWidth() / asset.aspect };
      if (box.y + box.height > page.getHeight()) throw new Error(`${asset.name} extends beyond page ${index + 1}. Adjust its placement.`);
      if (placed.some((text) => text.page === index + 1 && intersects(text, box))) {
        // Preserve readable content. The user can reposition branding and retry.
        warnings.push({ code: "branding_overlap", page: index + 1, severity: "error", message: `${asset.name} overlaps translated text and was not applied. Adjust placement and rebuild the preview.` });
        continue;
      }
      page.drawImage(image, { x: box.x, y: page.getHeight() - box.y - box.height, width: box.width, height: box.height });
    }
  }
  return { bytes: await pdf.save(), warnings };
}
export async function createPdfExport(document: CanonicalDocument, direction: LanguageDirection, sourceBytes?: Uint8Array) {
  return (await renderPdf(document, direction, sourceBytes)).bytes;
}
export function createTextExport(document: CanonicalDocument) {
  assertCompleteTranslation(document);
  return new TextEncoder().encode(document.nodes.map((node) => node.translatedText).filter(Boolean).join("\n\n"));
}
export async function createDocxExport(document: CanonicalDocument, sourceBytes?: Uint8Array, branding: RenderBranding[] = []) {
  assertCompleteTranslation(document);
  let bytes: Uint8Array;
  if (sourceBytes && document.mimeType === DOCX_MIME) {
    bytes = await rebuildDocx(sourceBytes, document.nodes, document.direction);
  } else {
    const pageNumbers = [...new Set(document.nodes.map((node) => node.page))].sort((a,b) => a-b);
    const docx = new Document({
      sections: pageNumbers.map((pageNumber) => {
        const size = document.pages?.[pageNumber - 1] ?? { width: 595.28, height: 841.89 };
        return {
          properties: { page: { size: { width: Math.round(size.width * 20), height: Math.round(size.height * 20) }, margin: { top: 1040, bottom: 1040, left: 1040, right: 1040 } } },
          children: document.nodes.filter((node) => node.page === pageNumber && node.translatedText?.trim()).map((node) => new Paragraph({
            bidirectional: document.direction === "en-ar",
            alignment: node.style?.alignment === "center" ? AlignmentType.CENTER : document.direction === "en-ar" ? AlignmentType.RIGHT : AlignmentType.LEFT,
            spacing: { after: 160 },
            children: [new TextRun({ text: node.translatedText!, rightToLeft: document.direction === "en-ar", size: Math.round(Math.max(10, node.style?.fontSize ?? 11) * 2), bold: node.type === "heading" || (node.style?.fontWeight ?? 400) >= 600, italics: node.style?.italic, font: "Arial" })],
          })),
        };
      }),
    });
    bytes = new Uint8Array(await Packer.toBuffer(docx));
  }
  return brandDocx(bytes, document, branding);
}
