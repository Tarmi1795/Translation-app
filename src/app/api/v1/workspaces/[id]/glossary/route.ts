import { glossarySchema } from "@/lib/api/schemas";
import { requireWorkspaceRole } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; await requireWorkspaceRole(id); const supabase = await createClient(); const { data, error } = await supabase.from("glossary_terms").select("*").eq("workspace_id", id).order("source_term"); if (error) throw error; return apiData(data ?? []); } catch (error) { return apiError(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; const input = glossarySchema.parse(await request.json()); const { user } = await requireWorkspaceRole(id, ["owner", "admin", "translator"]); const supabase = await createClient(); const { data, error } = await supabase.from("glossary_terms").insert({ workspace_id: id, direction: input.direction, source_term: input.sourceTerm, target_term: input.targetTerm, notes: input.notes, case_sensitive: input.caseSensitive, created_by: user.id }).select("id").single(); if (error) throw error; return apiData(data, { status: 201 }); } catch (error) { return apiError(error); }
}
