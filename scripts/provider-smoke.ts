import { getTranslationProvider } from "../src/lib/openai/responses-provider";

async function main() {
  const provider = getTranslationProvider();
  console.log("[1/2] translateBatch…");
  const translated = await provider.translateBatch("en-ar", [
    { id: "seg-1", sourceText: "This agreement is effective as of August 31, 2026 between OneSmartBiz and the Client." },
    { id: "seg-2", sourceText: "Total invoice amount: QAR 12,450.00 payable within 30 days." },
  ], { glossary: [{ source: "Client", target: "العميل" }], memory: [] });
  console.log(JSON.stringify(translated, null, 2));

  console.log("[2/2] ocrDocument…");
  // 1x1 white PNG
  const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  const ocr = await provider.ocrDocument(png, "image/png", "blank-test.png");
  console.log(`pageCount=${ocr.pageCount} blocks=${ocr.blocks.length}`);
  console.log("PROVIDER_SMOKE_OK");
}

main().catch((error) => {
  console.error("PROVIDER_SMOKE_FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
