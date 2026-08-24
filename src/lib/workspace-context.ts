import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

export interface WorkspaceSummary {
  id: string;
  name: string;
  kind: "personal" | "organization";
  role: "owner" | "admin" | "translator" | "reviewer";
}

export const getWorkspaceContext = cache(async () => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspace:workspaces!inner(id,name,kind)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const workspaces: WorkspaceSummary[] = (data ?? []).flatMap((row) => {
    const workspace = Array.isArray(row.workspace) ? row.workspace[0] : row.workspace;
    if (!workspace) return [];
    return [{
      id: String(workspace.id),
      name: String(workspace.name),
      kind: workspace.kind as WorkspaceSummary["kind"],
      role: row.role as WorkspaceSummary["role"],
    }];
  });
  const cookieStore = await cookies();
  const requestedId = cookieStore.get("eatai_workspace")?.value;
  const activeWorkspace = workspaces.find((workspace) => workspace.id === requestedId) ?? workspaces[0] ?? null;
  return { user, workspaces, activeWorkspace };
});
