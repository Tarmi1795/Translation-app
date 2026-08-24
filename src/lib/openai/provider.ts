import type { BoundingBox, LanguageDirection } from "@/types/domain";

export interface TranslationInputSegment { id: string; sourceText: string; contextBefore?: string; contextAfter?: string }
export interface TranslationContext { glossary: Array<{ source: string; target: string }>; memory: Array<{ source: string; target: string }> }
export interface TranslatedSegment { id: string; translatedText: string }
export interface OcrBlock { id: string; text: string; page: number; order: number; confidence: number; type: "heading" | "paragraph" | "table" | "table_cell" | "header" | "footer"; bounds?: BoundingBox }

export interface TranslationProvider {
  translateBatch(direction: LanguageDirection, segments: TranslationInputSegment[], context: TranslationContext): Promise<TranslatedSegment[]>;
  ocrDocument(bytes: Uint8Array, mimeType: string, title: string): Promise<{ pageCount: number; blocks: OcrBlock[] }>;
}
