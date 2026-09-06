import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/auth";
import { hasSupabaseEnv, isPlatformAdminEmail } from "@/lib/env";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseEnv()) {
    return (
      <AppShell user={{ name: "Local setup" }} workspaces={[]} activeWorkspace={null} creditBalance={0} isPlatformAdmin={false}>
        <div role="alert" className="mb-6 rounded-xl border border-[color:color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_10%,var(--surface))] p-4 text-sm leading-6 text-[var(--warning)]">
          The interface is running in configuration mode. Copy <code>.env.example</code> to <code>.env.local</code>, add Supabase and OpenAI credentials, and run the migration to enable live data.
        </div>
        {children}
      </AppShell>
    );
  }

  let context;
  try {
    context = await getWorkspaceContext();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/auth/sign-in?next=/app");
    }
    // A workspace or database failure is not an authentication failure. Let
    // the route error boundary report it instead of bouncing a signed-in user
    // through sign-in and back to the landing page.
    throw error;
  }
  const { user, workspaces, activeWorkspace } = context;
  const supabase = await createClient();
  const { data: account } = activeWorkspace
    ? await supabase.from("credit_accounts").select("balance,reserved").eq("workspace_id", activeWorkspace.id).maybeSingle()
    : { data: null };
  const creditBalance = account ? Number(account.balance) - Number(account.reserved) : 0;
  const { data: profile } = await supabase.from("profiles").select("display_name,is_platform_admin").eq("id", user.id).maybeSingle();

  return (
    <AppShell
      user={{ email: user.email, name: profile?.display_name || user.email?.split("@")[0] || "User" }}
      workspaces={workspaces}
      activeWorkspace={activeWorkspace}
      creditBalance={creditBalance}
      isPlatformAdmin={Boolean(profile?.is_platform_admin) || isPlatformAdminEmail(user.email)}
    >
      {children}
    </AppShell>
  );
}
