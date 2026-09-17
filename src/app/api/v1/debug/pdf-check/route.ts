import { requireUser } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";
import { extractCanonicalDocument } from "@/lib/documents/extract";

export const maxDuration = 120;

// TEMPORARY diagnostic route: runs PDF extraction for a validated document and
// reports the failure reason inline instead of a generic 500. Remove after the
// extraction issue is diagnosed.
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
    const steps: Array<{ step: string; ok: boolean; detail?: string; ms: number }> = [];
    const t0 = Date.now();
    try {
      const canonical = await extractCanonicalDocument({ bytes, mimeType: document.mime_type, title: document.file_name, direction: "en-ar" });
      steps.push({ step: "extract", ok: true, detail: `pages=${canonical.pageCount} nodes=${canonical.nodes.length} words=${canonical.sourceWordCount}`, ms: Date.now() - t0 });
      return apiData({ ok: true, steps, warnings: canonical.warnings.map((w) => w.code) });
    } catch (extractError) {
      steps.push({ step: "extract", ok: false, detail: extractError instanceof Error ? `${extractError.message}\n${extractError.stack?.slice(0, 900)}` : String(extractError), ms: Date.now() - t0 });
      return apiData({ ok: false, steps });
    }
  } catch (error) {
    return apiError(error);
  }
}
