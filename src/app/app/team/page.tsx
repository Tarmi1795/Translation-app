import { TeamManager } from "@/components/team-manager";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace-context";

export default async function TeamPage() {
  if (!hasSupabaseEnv()) return <TeamManager members={[]} />;
  const { activeWorkspace } = await getWorkspaceContext();
  if (!activeWorkspace) return <TeamManager members={[]} />;
  const supabase = await createClient();
  const { data } = await supabase.from("workspace_members").select("user_id,role,profile:profiles!inner(display_name,email)").eq("workspace_id", activeWorkspace.id).order("created_at");
  const members = (data ?? []).flatMap((row) => { const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile; return profile ? [{ id: row.user_id, name: profile.display_name || profile.email, email: profile.email, role: row.role }] : []; });
  return <TeamManager workspaceId={activeWorkspace.id} kind={activeWorkspace.kind} role={activeWorkspace.role} members={members} />;
}
