import { ApiError, requireUser } from "@/lib/auth";
import { apiData, apiError, parsePagination } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const { from, to, page, pageSize } = parsePagination(new URL(request.url));
    const supabase = await createClient();
    const { data, error, count } = await supabase.from("segment_revisions").select("id,field_name,old_value,new_value,reason,editor_id,created_at", { count: "exact" }).eq("segment_id", id).order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;
    if (!data) throw new ApiError(404, "Segment not found.", "not_found");
    return apiData({ items: data, page, pageSize, total: count ?? 0 });
  } catch (error) { return apiError(error); }
}
