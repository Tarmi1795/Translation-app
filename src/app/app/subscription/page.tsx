import { Suspense } from "react";
import { SubscriptionManager } from "@/components/subscription-manager";
import { SubscriptionSkeleton } from "@/components/skeletons";
import { hasSupabaseEnv } from "@/lib/env";
import { getWorkspaceContext } from "@/lib/workspace-context";

export default function SubscriptionPage() {
  if (!hasSupabaseEnv()) return <SubscriptionManager workspaceId={null} />;
  return (
    <Suspense fallback={<SubscriptionSkeleton />}>
      <SubscriptionBody />
    </Suspense>
  );
}

async function SubscriptionBody() {
  const { activeWorkspace } = await getWorkspaceContext();
  return <SubscriptionManager key={activeWorkspace?.id} workspaceId={activeWorkspace?.id ?? null} />;
}
