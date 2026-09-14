import { TranslationComposer } from "@/components/translation-composer";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace-context";

export default async function TranslatePage() {
  if (!hasSupabaseEnv()) return <TranslationComposer availableCredits={0} configured={false} />;
  const { activeWorkspace } = await getWorkspaceContext();
  const supabase = await createClient();
  const { data: account } = activeWorkspace ? await supabase.from("credit_accounts").select("balance,reserved").eq("workspace_id", activeWorkspace.id).maybeSingle() : { data: null };
  return <TranslationComposer key={activeWorkspace?.id} workspaceId={activeWorkspace?.id} availableCredits={account ? Number(account.balance) - Number(account.reserved) : 0} configured />;
}
