import { Suspense } from "react";
import { SalesDashboard } from "@/components/sales-dashboard";
import { SalesSkeleton } from "@/components/skeletons";
import { hasSupabaseEnv } from "@/lib/env";
import { getWorkspaceContext } from "@/lib/workspace-context";

export default function SalesPage() {
  if (!hasSupabaseEnv()) return <SalesDashboard workspaceId={null} />;
  return (
    <Suspense fallback={<SalesSkeleton />}>
      <SalesBody />
    </Suspense>
  );
}

async function SalesBody() {
  const { activeWorkspace } = await getWorkspaceContext();
  return <SalesDashboard key={activeWorkspace?.id} workspaceId={activeWorkspace?.id ?? null} />;
}
