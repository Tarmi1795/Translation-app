declare module "arabic-persian-reshaper" {
  export const ArabicShaper: { convertArabic(value: string): string };
}

// Imported for its side effect: registering globalThis.pdfjsWorker so pdfjs
// can run its fake worker inside the server bundle.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";

declare module "bidi-js" {
  interface EmbeddingLevels { levels: Uint8Array; paragraphs: Array<{ start: number; end: number; level: number }> }
  interface Bidi { getEmbeddingLevels(text: string, direction?: "ltr" | "rtl"): EmbeddingLevels; getReorderedString(text: string, levels: EmbeddingLevels): string }
  export default function bidiFactory(): Bidi;
}

// pdfjs worker module registers globalThis.pdfjsWorker when imported.
declare module "pdfjs-dist/build/pdf.worker.mjs";

interface Window { pdfjsWorker?: { WorkerMessageHandler: unknown } }
