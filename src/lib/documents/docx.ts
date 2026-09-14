import JSZip from "jszip";
import { DOMParser, XMLSerializer, type Element } from "@xmldom/xmldom";
import type { CanonicalDocument, DocumentNode, LanguageDirection } from "@/types/domain";
import { countDocumentWords } from "@/lib/words";

export const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export function parseWordXml(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML entities are not supported in Word documents.");
  return new DOMParser().parseFromString(xml, "application/xml");
}
function elements(root: Element, tag: string) { return Array.from(root.getElementsByTagName(tag)); }
function ownTexts(paragraph: Element) {
  return elements(paragraph, "w:t").filter((text) => {
    let parent = text.parentNode;
    while (parent && parent !== paragraph) {
      if (parent.nodeName === "w:p") return false;
      parent = parent.parentNode;
    }
    return parent === paragraph;
  });
}
function value(root: Element, tag: string, attribute = "w:val") {
  return elements(root, tag)[0]?.getAttribute(attribute) ?? undefined;
}
export async function extractDocx(bytes: Uint8Array, title: string, direction: LanguageDirection): Promise<CanonicalDocument> {
  const zip = await JSZip.loadAsync(bytes);
  const paths = Object.keys(zip.files).filter((path) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(path)).sort((a, b) => a === "word/document.xml" ? -1 : b === "word/document.xml" ? 1 : a.localeCompare(b));
  const nodes: DocumentNode[] = [];
  let page = 1;
  let sourceHasLetterhead = false;
  let pageSize = { width: 595.28, height: 841.89, margin: 52 };
  for (const partPath of paths) {
    const xml = await zip.file(partPath)!.async("string");
    const dom = parseWordXml(xml);
    if (partPath.includes("header") && /<(w:drawing|w:pict)/.test(xml)) sourceHasLetterhead = true;
    if (partPath === "word/document.xml") {
      const section = dom.getElementsByTagName("w:sectPr")[0];
      if (section) pageSize = {
        width: Number(value(section, "w:pgSz", "w:w") ?? 11906) / 20,
        height: Number(value(section, "w:pgSz", "w:h") ?? 16838) / 20,
        margin: Number(value(section, "w:pgMar", "w:left") ?? 1040) / 20,
      };
    }
    Array.from(dom.getElementsByTagName("w:p")).forEach((paragraph, paragraphIndex) => {
      const sourceText = ownTexts(paragraph).map((text) => text.textContent ?? "").join("").trim();
      const body = partPath === "word/document.xml";
      if (body && elements(paragraph, "w:pageBreakBefore").length && nodes.length) page++;
      if (sourceText) {
        const styleName = value(paragraph, "w:pStyle")?.toLowerCase() ?? "";
        let parent = paragraph.parentNode;
        let inTable = false;
        while (parent) { if (parent.nodeName === "w:tc") inTable = true; parent = parent.parentNode; }
        nodes.push({
          id: crypto.randomUUID(), sourceText, page: body ? page : 1, order: nodes.length,
          type: partPath.includes("header") ? "header" : partPath.includes("footer") ? "footer" : inTable ? "table_cell" : /heading|title/.test(styleName) ? "heading" : elements(paragraph, "w:numPr").length ? "list_item" : "paragraph",
          style: { fontSize: Number(value(paragraph, "w:sz") ?? 22) / 2, fontWeight: elements(paragraph, "w:b").length ? 700 : 400, italic: elements(paragraph, "w:i").length > 0, alignment: value(paragraph, "w:jc") === "center" ? "center" : /right|end/.test(value(paragraph, "w:jc") ?? "") ? "end" : "start", direction: elements(paragraph, "w:bidi").length ? "rtl" : "ltr" },
          metadata: { partPath, paragraphIndex, mixedRuns: ownTexts(paragraph).length > 1 },
        });
      }
      if (body) page += elements(paragraph, "w:br").filter((br) => br.getAttribute("w:type") === "page").length;
    });
  }
  return { version: 1, title, mimeType: DOCX_MIME, direction, pageCount: page, pages: Array.from({ length: page }, () => ({ ...pageSize })), sourceHasLetterhead, sourceWordCount: countDocumentWords(nodes.map((node) => node.sourceText)), nodes, warnings: [{ code: "formatting_approximate", page: 1, severity: "warning", message: "Word styles, tables, images and section settings are retained. Translation can change automatic pagination and emphasis within mixed-style text; check the Word preview." }] };
}
function setProperty(parent: Element, tag: string, enabled: boolean) {
  Array.from(parent.childNodes).filter((child) => child.nodeName === tag).forEach((child) => parent.removeChild(child));
  if (enabled) parent.appendChild(parent.ownerDocument!.createElementNS(WORD_NS, tag));
}
export async function rebuildDocx(sourceBytes: Uint8Array, nodes: DocumentNode[], direction?: LanguageDirection) {
  const zip = await JSZip.loadAsync(sourceBytes);
  const byPart = new Map<string, DocumentNode[]>();
  for (const node of nodes) {
    const path = String(node.metadata?.partPath ?? "");
    if (!path || !node.translatedText?.trim()) continue;
    byPart.set(path, [...(byPart.get(path) ?? []), node]);
  }
  for (const [path, partNodes] of byPart) {
    const xml = await zip.file(path)?.async("string");
    if (!xml) throw new Error("An original Word part is missing.");
    const dom = parseWordXml(xml);
    const paragraphs = Array.from(dom.getElementsByTagName("w:p"));
    for (const node of partNodes) {
      const paragraph = paragraphs[Number(node.metadata?.paragraphIndex)];
      if (!paragraph) throw new Error("A translated paragraph no longer matches the original document.");
      const texts = ownTexts(paragraph);
      if (!texts.length) throw new Error("A translated paragraph has no editable Word text.");
      // Retain runs, drawing anchors, field instructions and breaks. Distribute
      // on word boundaries, never through a joined Arabic word.
      const tokens = node.translatedText!.match(/\S+\s*|\s+/gu) ?? [node.translatedText!];
      const total = texts.reduce((sum, text) => sum + (text.textContent?.length ?? 0), 0) || 1;
      let cursor = 0;
      let weight = 0;
      texts.forEach((text, index) => {
        weight += text.textContent?.length ?? 0;
        const end = index === texts.length - 1 ? tokens.length : Math.round(tokens.length * weight / total);
        text.textContent = tokens.slice(cursor, end).join("");
        text.setAttribute("xml:space", "preserve");
        cursor = end;
      });
      if (direction) {
        let props = Array.from(paragraph.childNodes).find((child) => child.nodeName === "w:pPr") as Element | undefined;
        if (!props) { props = dom.createElementNS(WORD_NS, "w:pPr"); paragraph.insertBefore(props, paragraph.firstChild); }
        setProperty(props, "w:bidi", direction === "en-ar");
        for (const run of elements(paragraph, "w:r")) {
          let rpr = Array.from(run.childNodes).find((child) => child.nodeName === "w:rPr") as Element | undefined;
          if (!rpr) { rpr = dom.createElementNS(WORD_NS, "w:rPr"); run.insertBefore(rpr, run.firstChild); }
          setProperty(rpr, "w:rtl", direction === "en-ar");
        }
      }
    }
    zip.file(path, new XMLSerializer().serializeToString(dom));
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
