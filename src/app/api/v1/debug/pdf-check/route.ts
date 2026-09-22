import { requireUser } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";
import { extractCanonicalDocument } from "@/lib/documents/extract";

export const maxDuration = 300;

// TEMPORARY diagnostic route: runs PDF extraction for a validated document and
// reports per-page capture instead of a generic 500. Remove once stable.
export async function POST(request: Request) {
  try {
    await requireUser();
    const { documentId } = (await request.json()) as { documentId?: string };
    const supabase = await createClient();
    const { data: document } = await supabase.from("documents").select("id,file_name,mime_type,status,storage_path").eq("id", documentId ?? "").maybeSingle();
    if (!document?.storage_path) return apiData({ error: "document not found" });
    const { data: blob, error: dlError } = await supabase.storage.from("documents").download(document.storage_path);
    if (dlError) return apiData({ error: "download failed", detail: dlError.message });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const t0 = Date.now();
    try {
      const canonical = await extractCanonicalDocument({ bytes, mimeType: document.mime_type, title: document.file_name, direction: "en-ar" });
      const byPage: Record<number, number> = {};
      for (const node of canonical.nodes) byPage[node.page] = (byPage[node.page] ?? 0) + (node.sourceText.trim() ? 1 : 0);
      return apiData({ ok: true, ms: Date.now() - t0, pages: canonical.pageCount, nodes: canonical.nodes.length, words: canonical.sourceWordCount, byPage, emptyPages: canonical.warnings.filter((w) => w.message.includes("No text could be read")).length });
    } catch (extractError) {
      return apiData({ ok: false, ms: Date.now() - t0, name: extractError instanceof Error ? extractError.name : typeof extractError, message: extractError instanceof Error ? extractError.message : String(extractError), stack: extractError instanceof Error ? extractError.stack?.slice(0, 1200) : undefined });
    }
  } catch (error) {
    return apiError(error);
  }
}
