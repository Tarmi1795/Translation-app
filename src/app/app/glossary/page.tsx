import { GlossaryManager } from "@/components/glossary-manager";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace-context";

export default async function GlossaryPage() {
  if (!hasSupabaseEnv()) return <GlossaryManager initialTerms={[]} memoryCount={0} />;
  const { activeWorkspace } = await getWorkspaceContext();
  if (!activeWorkspace) return <GlossaryManager initialTerms={[]} memoryCount={0} />;
  const supabase = await createClient();
  const [{ data: terms }, { count }] = await Promise.all([
    supabase.from("glossary_terms").select("id,source_term,target_term,notes,case_sensitive").eq("workspace_id", activeWorkspace.id).order("created_at", { ascending: false }),
    supabase.from("translation_memory").select("id", { count: "exact", head: true }).eq("workspace_id", activeWorkspace.id).eq("approved", true),
  ]);
  return <GlossaryManager workspaceId={activeWorkspace.id} initialTerms={(terms ?? []).map((term) => ({ id: term.id, sourceTerm: term.source_term, targetTerm: term.target_term, notes: term.notes ?? undefined, caseSensitive: term.case_sensitive }))} memoryCount={count ?? 0} />;
}
