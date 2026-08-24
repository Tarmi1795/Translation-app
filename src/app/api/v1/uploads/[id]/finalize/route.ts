import { ApiError, requireUser } from "@/lib/auth";
import { validateUploadedFile } from "@/lib/documents/validation";
import { apiData, apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let path: string | null = null;
  try {
    await requireUser();
    const supabase = await createClient();
    const { data: document, error } = await supabase.from("documents").select("id,project_id,workspace_id,file_name,mime_type,size_bytes,storage_path").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!document?.storage_path) throw new ApiError(404, "Upload record not found.", "not_found");
    path = document.storage_path;
    const { data: blob, error: downloadError } = await supabase.storage.from("documents").download(document.storage_path);
    if (downloadError) throw downloadError;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length !== Number(document.size_bytes)) throw new ApiError(400, "Uploaded file size does not match the request.", "file_size_mismatch");
    const validated = await validateUploadedFile(bytes, document.file_name, document.mime_type);
    const { error: updateError } = await supabase.from("documents").update({ mime_type: validated.mimeType, input_kind: validated.inputKind, sha256: validated.sha256, status: "validated" }).eq("id", id);
    if (updateError) throw updateError;
    await supabase.from("projects").update({ current_document_id: id }).eq("id", document.project_id);
    return apiData({ id, status: "validated", mimeType: validated.mimeType, sha256: validated.sha256 });
  } catch (error) {
    if (path) {
      const supabase = await createClient();
      await supabase.storage.from("documents").remove([path]);
      await supabase.from("documents").update({ status: "rejected", rejection_reason: error instanceof Error ? error.message : "Validation failed" }).eq("id", id);
    }
    return apiError(error);
  }
}
