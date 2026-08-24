import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { ArabicShaper } from "arabic-persian-reshaper";
import bidiFactory from "bidi-js";
import { rebuildDocx } from "@/lib/documents/docx";
import type { CanonicalDocument, LanguageDirection } from "@/types/domain";

const FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansarabic/NotoSansArabic%5Bwdth%2Cwght%5D.ttf";
let fontCache: Uint8Array | null = null;

async function loadArabicFont() {
  if (fontCache) return fontCache;
  const response = await fetch(FONT_URL, { cache: "force-cache" });
  if (!response.ok) throw new Error("The Arabic PDF font could not be loaded.");
  fontCache = new Uint8Array(await response.arrayBuffer());
  return fontCache;
}

function visualRtl(text: string) {
  const shaped = ArabicShaper.convertArabic(text);
  const bidi = bidiFactory();
  return bidi.getReorderedString(shaped, bidi.getEmbeddingLevels(shaped, "rtl"));
}

function wrapText(text: string, maxWidth: number, size: number, widthOf: (value: string, size: number) => number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && widthOf(candidate, size) > maxWidth) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function fitTextToBox(text: string, maxWidth: number, maxHeight: number, rtl: boolean, widthOf: (value: string, size: number) => number, preferredSize: number) {
  for (let size = Math.min(16, Math.max(8, preferredSize)); size >= 6; size -= 0.5) {
    const lines = wrapText(text, maxWidth, size, (value, candidateSize) => widthOf(rtl ? visualRtl(value) : value, candidateSize));
    const lineHeight = size * 1.35;
    if (lines.length * lineHeight <= Math.max(maxHeight, lineHeight)) return { size, lineHeight, lines };
  }
  const size = 6;
  return { size, lineHeight: 8.1, lines: wrapText(text, maxWidth, size, (value, candidateSize) => widthOf(rtl ? visualRtl(value) : value, candidateSize)) };
}

export async function createPdfExport(document: CanonicalDocument, direction: LanguageDirection, sourceBytes?: Uint8Array) {
  const preservesSource = document.mimeType === "application/pdf" && Boolean(sourceBytes);
  const pdf = preservesSource ? await PDFDocument.load(sourceBytes!, { updateMetadata: false }) : await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await loadArabicFont(), { subset: true });
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 52;
  const fontSize = 11;
  const lineHeight = 19;
  let page = preservesSource ? pdf.getPage(0) : pdf.addPage(pageSize);
  let y = pageSize[1] - margin;
  const rtl = direction === "en-ar";

  if (preservesSource) {
    for (const node of document.nodes) {
      const raw = node.translatedText?.trim();
      const bounds = node.bounds;
      if (!raw || !bounds || bounds.page < 1 || bounds.page > pdf.getPageCount()) continue;
      const sourcePage = pdf.getPage(bounds.page - 1);
      const { width: pageWidth, height: pageHeight } = sourcePage.getSize();
      if (bounds.x < 0 || bounds.y < 0 || bounds.x >= pageWidth || bounds.y >= pageHeight) continue;
      const boxWidth = Math.max(12, Math.min(bounds.width, pageWidth - bounds.x));
      const boxHeight = Math.max(10, Math.min(Math.max(bounds.height, (node.style?.fontSize ?? 10) * 1.5), pageHeight - bounds.y));
      const boxY = Math.max(0, pageHeight - bounds.y - boxHeight);
      sourcePage.drawRectangle({ x: bounds.x, y: boxY, width: boxWidth, height: boxHeight, color: rgb(1, 1, 1), opacity: 0.94 });
      const fitted = fitTextToBox(raw, boxWidth, boxHeight, rtl, (value, size) => font.widthOfTextAtSize(value, size), node.style?.fontSize ?? 10);
      fitted.lines.slice(0, Math.max(1, Math.floor(boxHeight / fitted.lineHeight))).forEach((logicalLine, lineIndex) => {
        const line = rtl ? visualRtl(logicalLine) : logicalLine;
        const width = font.widthOfTextAtSize(line, fitted.size);
        sourcePage.drawText(line, {
          x: rtl ? Math.max(bounds.x, bounds.x + boxWidth - width) : bounds.x,
          y: boxY + boxHeight - fitted.size - lineIndex * fitted.lineHeight,
          size: fitted.size,
          font,
          color: rgb(0.08, 0.13, 0.22),
          maxWidth: boxWidth,
        });
      });
    }
    return pdf.save();
  }

  for (const node of document.nodes) {
    const raw = node.translatedText?.trim();
    if (!raw) continue;
    const logicalLines = wrapText(raw, pageSize[0] - margin * 2, fontSize, (value, size) => font.widthOfTextAtSize(rtl ? visualRtl(value) : value, size));
    for (const logicalLine of logicalLines) {
      if (y < margin + lineHeight) { page = pdf.addPage(pageSize); y = pageSize[1] - margin; }
      const line = rtl ? visualRtl(logicalLine) : logicalLine;
      const width = font.widthOfTextAtSize(line, fontSize);
      page.drawText(line, { x: rtl ? pageSize[0] - margin - width : margin, y, size: fontSize, font, color: rgb(0.08, 0.13, 0.22) });
      y -= lineHeight;
    }
    y -= node.type === "heading" ? 9 : 5;
  }
  return pdf.save();
}

export function createTextExport(document: CanonicalDocument) {
  return new TextEncoder().encode(document.nodes.map((node) => node.translatedText).filter(Boolean).join("\n\n"));
}

export async function createDocxExport(document: CanonicalDocument, sourceBytes?: Uint8Array) {
  if (!sourceBytes || document.mimeType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    throw new Error("DOCX export requires an original DOCX source so its OOXML structure can be preserved.");
  }
  return rebuildDocx(sourceBytes, document.nodes);
}
