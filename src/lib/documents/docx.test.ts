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

  it("counts empty page breaks and preserves table cells, mixed runs and RTL", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Important </w:t></w:r><w:r><w:t>terms here</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr><w:pgSz w:w="16838" w:h="11906"/></w:sectPr></w:body></w:document>`);
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const document = await extractDocx(bytes, "table.docx", "en-ar");
    expect(document.nodes[0].page).toBe(2);
    expect(document.nodes[0].type).toBe("table_cell");
    expect(document.pages?.[0].width).toBe(841.9);
    document.nodes[0].translatedText = "شروط مهمة هنا";
    const rebuilt = await JSZip.loadAsync(await rebuildDocx(bytes, document.nodes, "en-ar"));
    const xml = await rebuilt.file("word/document.xml")!.async("string");
    expect(xml).toContain("<w:bidi/>");
    expect(xml).toContain("<w:rtl/>");
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain('<w:br w:type="page"/>');
    const roundtrip = await extractDocx(await rebuilt.generateAsync({ type: "uint8array" }), "translated.docx", "ar-en");
    expect(roundtrip.nodes[0].sourceText).toBe("شروط مهمة هنا");
  });
});
