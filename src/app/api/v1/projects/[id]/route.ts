import { ApiError, requireUser } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase.from("projects").select("*, documents(id,file_name,mime_type,status,created_at), translation_jobs(id,stage,progress,error_code,error_message,created_at)").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, "Project not found.", "not_found");
    return apiData(data);
  } catch (error) { return apiError(error); }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = await createClient();
    const [{ data: documents }, { data: exports }] = await Promise.all([
      supabase.from("documents").select("storage_path").eq("project_id", id),
      supabase.from("exports").select("storage_path").eq("project_id", id),
    ]);
    const paths = [...(documents ?? []), ...(exports ?? [])].map((row) => row.storage_path).filter((path): path is string => Boolean(path));
    if (paths.length) await supabase.storage.from("documents").remove(paths);
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw error;
    return apiData({ deleted: true });
  } catch (error) { return apiError(error); }
}
