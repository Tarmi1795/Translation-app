import { requireWorkspaceRole } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; termId: string }> }) { try { const { id, termId } = await params; await requireWorkspaceRole(id, ["owner", "admin", "translator"]); const supabase = await createClient(); const { error } = await supabase.from("glossary_terms").delete().eq("id", termId).eq("workspace_id", id); if (error) throw error; return apiData({ deleted: true }); } catch (error) { return apiError(error); } }
