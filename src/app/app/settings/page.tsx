import { Suspense } from "react";
import { PrivacySettings } from "@/components/privacy-settings";
import { SettingsSkeleton } from "@/components/skeletons";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace-context";

export default function SettingsPage() {
  if (!hasSupabaseEnv()) return <PrivacySettings initialConsent={false} />;
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsBody />
    </Suspense>
  );
}

async function SettingsBody() {
  const { activeWorkspace } = await getWorkspaceContext();
  const supabase = await createClient();
  const { data } = activeWorkspace ? await supabase.from("training_consents").select("global_learning").eq("workspace_id", activeWorkspace.id).maybeSingle() : { data: null };
  return <PrivacySettings workspaceId={activeWorkspace?.id} initialConsent={Boolean(data?.global_learning)} />;
}
