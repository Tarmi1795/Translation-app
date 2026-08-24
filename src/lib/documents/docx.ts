import JSZip from "jszip";
import type { CanonicalDocument, DocumentNode, LanguageDirection } from "@/types/domain";
import { countDocumentWords } from "@/lib/words";
import { decodeXml, escapeXml } from "@/lib/utils";

const PARAGRAPH_PATTERN = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const TEXT_PATTERN = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

function paragraphText(xml: string) {
  return [...xml.matchAll(TEXT_PATTERN)].map((match) => decodeXml(match[1])).join("");
}

function nodeType(paragraph: string, partPath: string): DocumentNode["type"] {
  if (partPath.includes("header")) return "header";
  if (partPath.includes("footer")) return "footer";
  const style = paragraph.match(/<w:pStyle[^>]*w:val="([^"]+)"/)?.[1]?.toLowerCase() ?? "";
  if (style.includes("title") || style.includes("heading")) return "heading";
  if (/<w:numPr[\s>]/.test(paragraph)) return "list_item";
  return "paragraph";
}

export async function extractDocx(bytes: Uint8Array, title: string, direction: LanguageDirection): Promise<CanonicalDocument> {
  const zip = await JSZip.loadAsync(bytes);
  const partPaths = Object.keys(zip.files)
    .filter((path) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(path))
    .sort((a, b) => (a === "word/document.xml" ? -1 : b === "word/document.xml" ? 1 : a.localeCompare(b)));
  const nodes: DocumentNode[] = [];
  let order = 0;
  let page = 1;

  for (const partPath of partPaths) {
    const xml = await zip.file(partPath)?.async("string");
    if (!xml) continue;
    const paragraphs = xml.match(PARAGRAPH_PATTERN) ?? [];
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const sourceText = paragraphText(paragraph).trim();
      if (!sourceText) return;
      nodes.push({
        id: crypto.randomUUID(),
        type: nodeType(paragraph, partPath),
        sourceText,
        page,
        order: order++,
        style: {
          alignment: /<w:jc[^>]*w:val="center"/.test(paragraph) ? "center" : /<w:jc[^>]*w:val="(right|end)"/.test(paragraph) ? "end" : "start",
          direction: /<w:bidi\/?[\s>]/.test(paragraph) ? "rtl" : "ltr",
          italic: /<w:i\/?[\s>]/.test(paragraph),
          fontWeight: /<w:b\/?[\s>]/.test(paragraph) ? 700 : 400,
        },
        metadata: { partPath, paragraphIndex },
      });
      const breaks = paragraph.match(/<w:br[^>]*w:type="page"[^>]*\/?\s*>/g)?.length ?? 0;
      page += breaks;
    });
  }
  const sourceWordCount = countDocumentWords(nodes.map((node) => node.sourceText));
  return { version: 1, title, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", direction, pageCount: Math.max(1, page), sourceWordCount, nodes, warnings: [] };
}

function replaceParagraphText(paragraph: string, translation: string) {
  let used = false;
  return paragraph.replace(TEXT_PATTERN, (full) => {
    const openTag = full.slice(0, full.indexOf(">") + 1);
    if (used) return `${openTag}</w:t>`;
    used = true;
    return `${openTag}${escapeXml(translation)}</w:t>`;
  });
}

export async function rebuildDocx(sourceBytes: Uint8Array, nodes: DocumentNode[]) {
  const zip = await JSZip.loadAsync(sourceBytes);
  const byPart = new Map<string, Map<number, string>>();
  for (const node of nodes) {
    const partPath = String(node.metadata?.partPath ?? "");
    const paragraphIndex = Number(node.metadata?.paragraphIndex);
    if (!partPath || !Number.isInteger(paragraphIndex) || !node.translatedText) continue;
    const part = byPart.get(partPath) ?? new Map<number, string>();
    part.set(paragraphIndex, node.translatedText);
    byPart.set(partPath, part);
  }
  for (const [partPath, translations] of byPart) {
    const xml = await zip.file(partPath)?.async("string");
    if (!xml) continue;
    let index = -1;
    const updated = xml.replace(PARAGRAPH_PATTERN, (paragraph) => {
      index += 1;
      const translation = translations.get(index);
      return translation === undefined ? paragraph : replaceParagraphText(paragraph, translation);
    });
    zip.file(partPath, updated);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
