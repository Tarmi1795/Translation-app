import OpenAI from "openai";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import type { LanguageDirection } from "@/types/domain";
import type { OcrBlock, TranslatedSegment, TranslationContext, TranslationInputSegment, TranslationProvider } from "@/lib/openai/provider";

const translationOutput = z.object({ segments: z.array(z.object({ id: z.string(), translatedText: z.string() })) });
const ocrOutput = z.object({ pageCount: z.number().int().positive(), blocks: z.array(z.object({ id: z.string(), text: z.string(), page: z.number().int().positive(), order: z.number().int().nonnegative(), confidence: z.number().min(0).max(1), type: z.enum(["heading", "paragraph", "table", "table_cell", "header", "footer"]), bounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number(), page: z.number().int().positive() }).optional() })) });

const translationSchema = { type: "object", additionalProperties: false, required: ["segments"], properties: { segments: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "translatedText"], properties: { id: { type: "string" }, translatedText: { type: "string" } } } } } } as const;
const ocrSchema = { type: "object", additionalProperties: false, required: ["pageCount", "blocks"], properties: { pageCount: { type: "integer", minimum: 1 }, blocks: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "text", "page", "order", "confidence", "type"], properties: { id: { type: "string" }, text: { type: "string" }, page: { type: "integer", minimum: 1 }, order: { type: "integer", minimum: 0 }, confidence: { type: "number", minimum: 0, maximum: 1 }, type: { type: "string", enum: ["heading", "paragraph", "table", "table_cell", "header", "footer"] }, bounds: { type: "object", additionalProperties: false, required: ["x", "y", "width", "height", "page"], properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, page: { type: "integer", minimum: 1 } } } } } } } } as const;

export class OpenAIResponsesProvider implements TranslationProvider {
  private client: OpenAI;
  private translationModel: string;
  private ocrModel: string;

  constructor() {
    const env = getServerEnv();
    const useOpenRouter = env.AI_PROVIDER === "openrouter";
    this.client = new OpenAI({
      apiKey: useOpenRouter ? env.OPENROUTER_API_KEY : env.OPENAI_API_KEY,
      ...(useOpenRouter
        ? {
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: {
              "HTTP-Referer": env.APP_URL,
              "X-OpenRouter-Title": "English Arabic Translate AI",
            },
          }
        : {}),
    });
    this.translationModel = env.OPENAI_MODEL_TRANSLATION;
    this.ocrModel = env.OPENAI_MODEL_OCR;
  }

  async translateBatch(direction: LanguageDirection, segments: TranslationInputSegment[], context: TranslationContext): Promise<TranslatedSegment[]> {
    const target = direction === "en-ar" ? "Modern Standard Arabic" : "professional English";
    const source = direction === "en-ar" ? "English" : "Arabic";
    const response = await this.client.responses.create({
      model: this.translationModel,
      store: false,
      reasoning: { effort: "low" },
      instructions: `You are a professional ${source}-to-${target} document translator. Preserve meaning over word-count similarity. Do not add, omit, summarize, or explain. Preserve names, numbers, dates, currencies, defined terms, and formatting markers exactly. Apply the supplied glossary consistently. Produce natural domain-appropriate ${target}. Return one result for every input id.`,
      input: JSON.stringify({ direction, glossary: context.glossary, approvedPrivateMemoryExamples: context.memory, segments }),
      text: { format: { type: "json_schema", name: "translation_batch", strict: true, schema: translationSchema } },
    });
    const parsed = translationOutput.parse(JSON.parse(response.output_text));
    const expected = new Set(segments.map((segment) => segment.id));
    if (parsed.segments.length !== segments.length || new Set(parsed.segments.map((segment) => segment.id)).size !== expected.size || parsed.segments.some((segment) => !expected.has(segment.id) || !segment.translatedText.trim())) throw new Error("The translation provider returned an incomplete or duplicate segment set.");
    return parsed.segments;
  }

  async ocrDocument(bytes: Uint8Array, mimeType: string, title: string) {
    const base64 = Buffer.from(bytes).toString("base64");
    const media = mimeType === "application/pdf"
      ? { type: "input_file" as const, filename: title.endsWith(".pdf") ? title : `${title}.pdf`, file_data: `data:application/pdf;base64,${base64}` }
      : { type: "input_image" as const, image_url: `data:${mimeType};base64,${base64}`, detail: "high" as const };
    const response = await this.client.responses.create({
      model: this.ocrModel,
      store: false,
      reasoning: { effort: "low" },
      instructions: "Extract ALL visible English and Arabic document text without translating it, including headers, footers, stamps and text inside images. Return blocks in natural reading order with page number, block type, confidence from 0 to 1, and bounds using NORMALIZED coordinates 0 to 1000 on each axis, origin TOP LEFT. Bounds x/y/width/height must use that same normalized scale, NOT pixels. Preserve table cell separation. Never invent obscured text; lower confidence instead.",
      input: [{ role: "user", content: [{ type: "input_text", text: `OCR this document: ${title}` }, media] }],
      text: { format: { type: "json_schema", name: "ocr_document", strict: true, schema: ocrSchema } },
    });
    return ocrOutput.parse(JSON.parse(response.output_text)) as { pageCount: number; blocks: OcrBlock[] };
  }
}

export function getTranslationProvider(): TranslationProvider {
  return new OpenAIResponsesProvider();
}
