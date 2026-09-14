import { ApiError, requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const db = await createClient();
    const { data: project, error } = await db.from("projects").select("current_document_id").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!project?.current_document_id) throw new ApiError(404, "Source document not found.");
    const { data: document } = await db.from("documents").select("storage_path,mime_type").eq("id", project.current_document_id).eq("project_id", id).maybeSingle();
    if (!document?.storage_path) throw new ApiError(404, "This project uses pasted text. Review the source in the text editor.");
    const { data, error: storageError } = await db.storage.from("documents").download(document.storage_path);
    if (storageError) throw storageError;
    return new Response(data, { headers: { "Content-Type": document.mime_type, "Content-Disposition": "inline", "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
