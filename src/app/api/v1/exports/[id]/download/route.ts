import { ApiError, requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = await createClient();
    const { data: row } = await supabase.from("exports").select("id,format,status,storage_path,mime_type,project:projects!inner(title)").eq("id", id).maybeSingle();
    if (!row || row.status !== "ready" || !row.storage_path) throw new ApiError(404, "Export is not ready or has expired.", "not_found");
    const { data: blob, error } = await supabase.storage.from("documents").download(row.storage_path);
    if (error) throw error;
    const project = Array.isArray(row.project) ? row.project[0] : row.project;
    const fileName = `${project?.title ?? "translation"}.${row.format}`.replace(/["\r\n]/g, "");
    const disposition = new URL(request.url).searchParams.get("inline") === "1" ? "inline" : "attachment";
    return new Response(blob, { headers: { "Content-Type": row.mime_type || "application/octet-stream", "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`, "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
