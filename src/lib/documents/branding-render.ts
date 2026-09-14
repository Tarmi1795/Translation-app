import { createHash } from "node:crypto";
import JSZip from "jszip";
import { XMLSerializer } from "@xmldom/xmldom";
import { brandingListSchema } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import type { BrandingSelection, CanonicalDocument, LayoutWarning } from "@/types/domain";
import { DOCX_MIME, parseWordXml } from "@/lib/documents/docx";

export interface RenderBranding extends BrandingSelection {
  bytes: Uint8Array;
  kind: "letterhead" | "stamp";
  name: string;
  mimeType: "image/png" | "image/jpeg";
  aspect: number;
}

export async function loadRenderBranding(workspaceId: string, selections: unknown, document: CanonicalDocument, source?: Uint8Array) {
  const selected = brandingListSchema.parse(selections ?? []);
  const warnings: LayoutWarning[] = [];
  const assets: RenderBranding[] = [];
  if (!selected.length) return { assets, warnings };
  const db = await createClient();
  const { data, error } = await db.from("workspace_branding").select("id,kind,name,storage_path,sha256,width,height").eq("workspace_id", workspaceId).in("id", selected.map((item) => item.assetId));
  if (error) throw error;
  if (data?.length !== selected.length) throw new Error("A selected branding asset is no longer available in this workspace.");
  const hashes = new Set<string>();
  if (source && document.mimeType === DOCX_MIME) {
    const zip = await JSZip.loadAsync(source);
    for (const path of Object.keys(zip.files).filter((path) => path.startsWith("word/media/") && !zip.files[path].dir)) hashes.add(createHash("sha256").update(await zip.file(path)!.async("uint8array")).digest("hex"));
  }
  for (const selection of selected) {
    const row = data.find((row) => row.id === selection.assetId)!;
    if (selection.alreadyPresent || (selection.skipIfPresent && (hashes.has(row.sha256) || (row.kind === "letterhead" && document.sourceHasLetterhead)))) {
      warnings.push({ code: "branding_skipped", page: 1, severity: "info", message: `${row.name}: skipped because branding is already present or was marked as present.` });
      continue;
    }
    const { data: blob, error } = await db.storage.from("documents").download(row.storage_path);
    if (error) throw error;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assets.push({ ...selection, bytes, kind: row.kind, name: row.name, mimeType: bytes[0] === 137 ? "image/png" : "image/jpeg", aspect: Number(row.width) / Number(row.height) });
  }
  return { assets, warnings };
}

// Add page-relative DrawingML anchors without changing existing body content,
// relationships, media, tables or headers. Word resolves the anchor's page.
export async function brandDocx(bytes: Uint8Array, document: CanonicalDocument, assets: RenderBranding[]) {
  if (!assets.length) return bytes;
  const zip = await JSZip.loadAsync(bytes);
  const contentTypes = parseWordXml(await zip.file("[Content_Types].xml")!.async("string"));
  const bodyDom = parseWordXml(await zip.file("word/document.xml")!.async("string"));
  const body = bodyDom.getElementsByTagName("w:body")[0];
  if (!body) throw new Error("Word document body is missing.");
  const size = document.pages?.[0] ?? { width: 595.28, height: 841.89 };
  for (const [index, asset] of assets.entries()) {
    const extension = asset.mimeType === "image/png" ? "png" : "jpg";
    const mediaName = `translation-branding-${index}.${extension}`;
    zip.file(`word/media/${mediaName}`, asset.bytes);
    if (!Array.from(contentTypes.getElementsByTagName("Default")).some((node) => node.getAttribute("Extension") === extension)) {
      const entry = contentTypes.createElement("Default"); entry.setAttribute("Extension", extension); entry.setAttribute("ContentType", asset.mimeType); contentTypes.documentElement!.appendChild(entry);
    }
    const targets: string[] = [];
    if (asset.pages === "all") {
      // Reuse all existing header variants, including first/even-page headers.
      targets.push(...Object.keys(zip.files).filter((path) => /^word\/header[^/]*\.xml$/.test(path)));
      const sections = Array.from(bodyDom.getElementsByTagName("w:sectPr"));
      if (!sections.length) { const section = bodyDom.createElement("w:sectPr"); body.appendChild(section); sections.push(section); }
      for (const [sectionIndex, section] of sections.entries()) {
        if (section.getElementsByTagName("w:headerReference").length) continue;
        const part = `word/headerTranslation${index}_${sectionIndex}.xml`;
        zip.file(part, '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:hdr>');
        targets.push(part);
        const relId = `rIdTranslationHeader${index}_${sectionIndex}`;
        await addRelationship(zip, "word/document.xml", relId, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header", part.replace("word/", ""));
        const ref = bodyDom.createElement("w:headerReference"); ref.setAttribute("w:type", "default"); ref.setAttribute("r:id", relId); section.insertBefore(ref, section.firstChild);
        const override = contentTypes.createElement("Override"); override.setAttribute("PartName", `/${part}`); override.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"); contentTypes.documentElement!.appendChild(override);
      }
    } else targets.push("word/document.xml");
    for (const path of targets) {
      const dom = path === "word/document.xml" ? bodyDom : parseWordXml(await zip.file(path)!.async("string"));
      const paragraphs = Array.from(dom.getElementsByTagName("w:p"));
      let anchor = asset.pages === "last" ? paragraphs.at(-1) : paragraphs[0];
      if (!anchor) { anchor = dom.createElement("w:p"); (path === "word/document.xml" ? body : dom.documentElement!).insertBefore(anchor, (path === "word/document.xml" ? body : dom.documentElement!).firstChild); }
      const id = `rIdTranslationBrand${index}`;
      const cx = Math.round(asset.width * size.width * 12700);
      const cy = Math.round(cx / asset.aspect);
      if (asset.y * size.height * 12700 + cy > size.height * 12700) throw new Error(`${asset.name} extends below the page. Move or resize it before export.`);
      const drawing = parseWordXml(`<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:drawing><wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${Math.round(asset.x * size.width * 12700)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${Math.round(asset.y * size.height * 12700)}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:wrapNone/><wp:docPr id="${900000 + index}" name="Translation branding ${index}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${900000 + index}" name="Branding"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`);
      anchor.appendChild(dom.importNode(drawing.documentElement!, true));
      await addRelationship(zip, path, id, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", `media/${mediaName}`);
      if (path !== "word/document.xml") zip.file(path, new XMLSerializer().serializeToString(dom));
    }
  }
  bodyDom.documentElement!.setAttribute("xmlns:r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships");
  zip.file("word/document.xml", new XMLSerializer().serializeToString(bodyDom));
  zip.file("[Content_Types].xml", new XMLSerializer().serializeToString(contentTypes));
  return zip.generateAsync({ type: "uint8array" });
}

async function addRelationship(zip: JSZip, part: string, id: string, type: string, target: string) {
  const path = part.replace("word/", "word/_rels/") + ".rels";
  const dom = parseWordXml(await zip.file(path)?.async("string") ?? '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
  const rel = dom.createElement("Relationship"); rel.setAttribute("Id", id); rel.setAttribute("Type", type); rel.setAttribute("Target", target); dom.documentElement!.appendChild(rel);
  zip.file(path, new XMLSerializer().serializeToString(dom));
}
