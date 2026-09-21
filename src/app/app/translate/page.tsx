import { Suspense } from "react";
import { TranslationComposer } from "@/components/translation-composer";
import { TranslateSkeleton } from "@/components/skeletons";
import { hasSupabaseEnv } from "@/lib/env";
import { getWorkspaceContext } from "@/lib/workspace-context";

export default function TranslatePage() {
  if (!hasSupabaseEnv()) return <TranslationComposer availableCredits={0} configured={false} />;
  return (
    <Suspense fallback={<TranslateSkeleton />}>
      <TranslateBody />
    </Suspense>
  );
}

async function TranslateBody() {
  const { activeWorkspace, accounts } = await getWorkspaceContext();
  const account = accounts.find((entry) => entry.workspaceId === activeWorkspace?.id);
  const availableCredits = activeWorkspace && account ? account.balance - account.reserved : 0;
  return <TranslationComposer key={activeWorkspace?.id} workspaceId={activeWorkspace?.id} availableCredits={availableCredits} configured />;
}
