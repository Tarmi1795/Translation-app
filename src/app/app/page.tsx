import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
import { DashboardSkeleton } from "@/components/skeletons";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace-context";

export default function DashboardPage() {
  if (!hasSupabaseEnv()) {
    return <Dashboard name="there" availableCredits={0} reservedCredits={0} projects={[]} reviewCount={0} failedCount={0} configured={false} />;
  }
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardBody />
    </Suspense>
  );
}

async function DashboardBody() {
  const { user, activeWorkspace, accounts } = await getWorkspaceContext();
  if (!activeWorkspace) return <Dashboard name={user.email?.split("@")[0] ?? "there"} availableCredits={0} reservedCredits={0} projects={[]} reviewCount={0} failedCount={0} configured />;
  const supabase = await createClient();
  const account = accounts.find((entry) => entry.workspaceId === activeWorkspace.id);
  const [{ data: projects }, { count: reviewCount }, { count: failedCount }] = await Promise.all([
    supabase.from("projects").select("id,title,state,direction,source_word_count,updated_at").eq("workspace_id", activeWorkspace.id).order("updated_at", { ascending: false }).limit(8),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", activeWorkspace.id).eq("state", "review"),
    supabase.from("translation_jobs").select("id", { count: "exact", head: true }).eq("workspace_id", activeWorkspace.id).eq("stage", "failed"),
  ]);
  return (
    <Dashboard
      name={user.user_metadata?.display_name || user.email?.split("@")[0] || "there"}
      availableCredits={account ? account.balance - account.reserved : 0}
      reservedCredits={account ? account.reserved : 0}
      projects={(projects ?? []).map((project) => ({ id: project.id, title: project.title, state: project.state, direction: project.direction, sourceWordCount: Number(project.source_word_count), updatedAt: project.updated_at }))}
      reviewCount={reviewCount ?? 0}
      failedCount={failedCount ?? 0}
      configured
    />
  );
}
