import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractDocx, rebuildDocx } from "@/lib/documents/docx";

async function sampleDocx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types />");
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Supplier agreement</w:t></w:r></w:p>
    <w:p><w:r><w:t>Payment is due in 30 days.</w:t></w:r></w:p>
  </w:body></w:document>`);
  zip.file("word/header1.xml", `<?xml version="1.0"?><w:hdr xmlns:w="w"><w:p><w:r><w:t>Private</w:t></w:r></w:p></w:hdr>`);
  zip.file("word/footer1.xml", `<?xml version="1.0"?><w:ftr xmlns:w="w"><w:p><w:r><w:t>Page footer</w:t></w:r></w:p></w:ftr>`);
  zip.file("word/media/image1.png", new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
  return zip.generateAsync({ type: "uint8array" });
}

describe("DOCX canonical extraction and reconstruction", () => {
  it("translates text while preserving OOXML parts, styles, and media", async () => {
    const source = await sampleDocx();
    const canonical = await extractDocx(source, "agreement.docx", "en-ar");
    expect(canonical.nodes).toHaveLength(4);
    expect(canonical.nodes.find((node) => node.sourceText === "Supplier agreement")?.type).toBe("heading");
    canonical.nodes.forEach((node) => { node.translatedText = `AR:${node.sourceText}`; });

    const rebuilt = await rebuildDocx(source, canonical.nodes);
    const output = await JSZip.loadAsync(rebuilt);
    const documentXml = await output.file("word/document.xml")!.async("string");
    const headerXml = await output.file("word/header1.xml")!.async("string");
    const sourceZip = await JSZip.loadAsync(source);
    expect(documentXml).toContain("AR:Supplier agreement");
    expect(documentXml).toContain("<w:b/>");
    expect(headerXml).toContain("AR:Private");
    expect(await output.file("word/media/image1.png")!.async("uint8array")).toEqual(await sourceZip.file("word/media/image1.png")!.async("uint8array"));
  });
});
