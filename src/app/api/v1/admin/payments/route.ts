import { requirePlatformAdmin } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

type StatementRow = {
  id: string;
  workspace_id: string;
  kind: string;
  amount: string | number;
  currency: string;
  description: string | null;
  plan_code: string | null;
  created_at: string;
  workspaces: { name: string } | { name: string }[] | null;
};

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const rawPage = Number(new URL(request.url).searchParams.get("page") ?? 1);
    const page = Math.max(1, Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1);
    const admin = createAdminClient();

    const [statementsRes, eventsRes] = await Promise.all([
      admin
        .from("billing_statements")
        .select("id,workspace_id,kind,amount,currency,description,plan_code,created_at,workspaces(name)")
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
      admin.from("subscription_events").select("id", { count: "exact", head: true }),
    ]);
    if (statementsRes.error) throw statementsRes.error;
    if (eventsRes.error) throw eventsRes.error;

    const items = (statementsRes.data as StatementRow[] | null ?? []).map((row) => {
      const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        workspaceName: workspace?.name ?? null,
        kind: row.kind,
        amount: Number(row.amount),
        currency: row.currency,
        description: row.description,
        planCode: row.plan_code,
        createdAt: row.created_at,
      };
    });

    return apiData({ items, events: { total: eventsRes.count ?? 0 }, page, pageSize: PAGE_SIZE });
  } catch (error) { return apiError(error); }
}
