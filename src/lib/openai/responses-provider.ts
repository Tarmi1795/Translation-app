import OpenAI from "openai";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import type { LanguageDirection } from "@/types/domain";
import type { OcrBlock, TranslatedSegment, TranslationContext, TranslationInputSegment, TranslationProvider } from "@/lib/openai/provider";

const translationOutput = z.object({ segments: z.array(z.object({ id: z.string(), translatedText: z.string() })) });
const ocrOutput = z.object({ pageCount: z.number().int().positive(), blocks: z.array(z.object({ id: z.string(), text: z.string(), page: z.number().int().positive(), order: z.number().int().nonnegative(), confidence: z.number().min(0).max(1), type: z.enum(["heading", "paragraph", "table", "table_cell", "header", "footer"]), bounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number(), page: z.number().int().positive() }).optional() })) });

const translationSchema = { type: "object", additionalProperties: false, required: ["segments"], properties: { segments: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "translatedText"], properties: { id: { type: "string" }, translatedText: { type: "string" } } } } } } as const;
const ocrSchema = { type: "object", additionalProperties: false, required: ["pageCount", "blocks"], properties: { pageCount: { type: "integer", minimum: 1 }, blocks: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "text", "page", "order", "confidence", "type"], properties: { id: { type: "string" }, text: { type: "string" }, page: { type: "integer", minimum: 1 }, order: { type: "integer", minimum: 0 }, confidence: { type: "number", minimum: 0, maximum: 1 }, type: { type: "string", enum: ["heading", "paragraph", "table", "table_cell", "header", "footer"] }, bounds: { type: "object", additionalProperties: false, required: ["x", "y", "width", "height", "page"], properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, page: { type: "integer", minimum: 1 } } } } } } } } as const;

// Provider calls must fail well before the serverless function limit so the
// workflow can retry with backoff instead of hanging a run for minutes.
const PROVIDER_TIMEOUT_MS = 110_000;

const TRANSLATION_INSTRUCTIONS = (source: string, target: string) => `You are a professional ${source}-to-${target} document translator. Preserve meaning over word-count similarity. Do not add, omit, summarize, or explain. Preserve names, numbers, dates, currencies, defined terms, and formatting markers exactly. Apply the supplied glossary consistently. Produce natural domain-appropriate ${target}. Return one result for every input id.`;
const OCR_INSTRUCTIONS = "Extract ALL visible English and Arabic document text without translating it, including headers, footers, stamps and text inside images. Return blocks in natural reading order with page number, block type, confidence from 0 to 1, and bounds using NORMALIZED coordinates 0 to 1000 on each axis, origin TOP LEFT. Bounds x/y/width/height must use that same normalized scale, NOT pixels. Preserve table cell separation. Never invent obscured text; lower confidence instead.";

function parseProviderJson(outputText: string | undefined, what: string) {
  if (!outputText?.trim()) throw new Error(`The translation provider returned no ${what} content. Check the model configuration and API quota, then retry.`);
  try { return JSON.parse(outputText); }
  catch { throw new Error(`The translation provider returned an unreadable ${what} response. Retry the operation.`); }
}

function assertCompleteTranslation(segments: TranslationInputSegment[], parsed: z.infer<typeof translationOutput>) {
  const expected = new Set(segments.map((segment) => segment.id));
  if (parsed.segments.length !== segments.length || new Set(parsed.segments.map((segment) => segment.id)).size !== expected.size || parsed.segments.some((segment) => !expected.has(segment.id) || !segment.translatedText.trim())) throw new Error("The translation provider returned an incomplete or duplicate segment set.");
}

/**
 * Uses the OpenAI Responses API through OpenAI directly or OpenRouter.
 */
export class OpenAIResponsesProvider implements TranslationProvider {
  private client: OpenAI;
  private translationModel: string;
  private ocrModel: string;

  constructor() {
    const env = getServerEnv();
    const useOpenRouter = env.AI_PROVIDER === "openrouter";
    this.client = new OpenAI({
      apiKey: useOpenRouter ? env.OPENROUTER_API_KEY : env.OPENAI_API_KEY,
      timeout: PROVIDER_TIMEOUT_MS,
      maxRetries: 1,
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
      instructions: TRANSLATION_INSTRUCTIONS(source, target),
      input: JSON.stringify({ direction, glossary: context.glossary, approvedPrivateMemoryExamples: context.memory, segments }),
      text: { format: { type: "json_schema", name: "translation_batch", strict: true, schema: translationSchema } },
    });
    const parsed = translationOutput.parse(parseProviderJson(response.output_text, "translation"));
    assertCompleteTranslation(segments, parsed);
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
      instructions: OCR_INSTRUCTIONS,
      input: [{ role: "user", content: [{ type: "input_text", text: `OCR this document: ${title}` }, media] }],
      text: { format: { type: "json_schema", name: "ocr_document", strict: true, schema: ocrSchema } },
    });
    return ocrOutput.parse(parseProviderJson(response.output_text, "OCR")) as { pageCount: number; blocks: OcrBlock[] };
  }
}

/**
 * Z.ai official API (OpenAI-compatible chat completions) at api.z.ai.
 * Chat completions have no native json_schema, so the schema is embedded in
 * the prompt and the reply is parsed and validated with the same zod schemas.
 */
export class ZaiChatProvider implements TranslationProvider {
  private client: OpenAI;
  private translationModel: string;
  private ocrModel: string;

  constructor() {
    const env = getServerEnv();
    this.client = new OpenAI({
      apiKey: env.ZAI_API_KEY,
      baseURL: "https://api.z.ai/api/paas/v4",
      timeout: PROVIDER_TIMEOUT_MS,
      maxRetries: 1,
    });
    this.translationModel = env.ZAI_MODEL_TRANSLATION;
    this.ocrModel = env.ZAI_MODEL_OCR;
  }

  private async completeJson(system: string, user: string | Array<Record<string, unknown>>, model: string): Promise<unknown> {
    const response = await this.client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${system}\nAnswer with a single JSON object only. No markdown fences, no commentary.` },
        { role: "user", content: user as never },
      ],
    });
    return parseProviderJson(response.choices?.[0]?.message?.content ?? undefined, "provider");
  }

  async translateBatch(direction: LanguageDirection, segments: TranslationInputSegment[], context: TranslationContext): Promise<TranslatedSegment[]> {
    const target = direction === "en-ar" ? "Modern Standard Arabic" : "professional English";
    const source = direction === "en-ar" ? "English" : "Arabic";
    const parsed = translationOutput.parse(await this.completeJson(
      `${TRANSLATION_INSTRUCTIONS(source, target)} Use the JSON schema: ${JSON.stringify(translationSchema)}`,
      JSON.stringify({ direction, glossary: context.glossary, approvedPrivateMemoryExamples: context.memory, segments }),
      this.translationModel,
    ));
    assertCompleteTranslation(segments, parsed);
    return parsed.segments;
  }

  async ocrDocument(bytes: Uint8Array, mimeType: string, title: string) {
    const base64 = Buffer.from(bytes).toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const parsed = ocrOutput.parse(await this.completeJson(
      `${OCR_INSTRUCTIONS} Use the JSON schema: ${JSON.stringify(ocrSchema)}`,
      [{ type: "text", text: `OCR this document: ${title}` }, { type: "image_url", image_url: { url: dataUrl } }],
      this.ocrModel,
    )) as { pageCount: number; blocks: OcrBlock[] };
    return parsed;
  }
}

export function getTranslationProvider(): TranslationProvider {
  const env = getServerEnv();
  if (env.AI_PROVIDER === "zai") return new ZaiChatProvider();
  return new OpenAIResponsesProvider();
}
