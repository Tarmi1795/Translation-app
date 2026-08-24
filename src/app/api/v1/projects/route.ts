import { createProjectSchema } from "@/lib/api/schemas";
import { requireWorkspaceRole } from "@/lib/auth";
import { apiData, apiError, parsePagination } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) return Response.json({ error: { code: "validation_error", message: "workspace_id is required." } }, { status: 400 });
    await requireWorkspaceRole(workspaceId);
    const { from, to, page, pageSize } = parsePagination(url);
    const supabase = await createClient();
    const { data, error, count } = await supabase.from("projects").select("id,title,direction,state,source_word_count,created_at,updated_at", { count: "exact" }).eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).range(from, to);
    if (error) throw error;
    return apiData({ items: data ?? [], page, pageSize, total: count ?? 0 });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const input = createProjectSchema.parse(await request.json());
    const { user } = await requireWorkspaceRole(input.workspaceId, ["owner", "admin", "translator"]);
    const supabase = await createClient();
    const { data, error } = await supabase.from("projects").insert({ workspace_id: input.workspaceId, created_by: user.id, title: input.title, direction: input.direction }).select("id,title,direction,state,source_word_count,created_at").single();
    if (error) throw error;
    return apiData(data, { status: 201 });
  } catch (error) { return apiError(error); }
}
