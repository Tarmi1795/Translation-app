import { requirePlatformAdmin } from "@/lib/auth";
import { apiData, apiError, parsePagination } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/server";

type WorkspaceRow = {
  id: string;
  name: string;
  kind: string;
  owner_id: string;
  created_at: string;
  workspace_subscriptions: { plan_code: string; status: string } | { plan_code: string; status: string }[] | null;
  credit_accounts: { balance: string | number } | { balance: string | number }[] | null;
  profiles: { email: string } | { email: string }[] | null;
};

function one<T>(embedded: T | T[] | null | undefined): T | null {
  if (Array.isArray(embedded)) return embedded[0] ?? null;
  return embedded ?? null;
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q")?.trim() ?? "").replace(/[%_,()'"\\]/g, " ").replace(/\s+/g, " ");
    const plan = url.searchParams.get("plan")?.trim() ?? "";
    const status = url.searchParams.get("status")?.trim() ?? "";
    const { from: pageFrom, to: pageTo, page, pageSize } = parsePagination(url);
    const admin = createAdminClient();

    // Resolve matching owner emails first so the workspace query only needs
    // simple column filters (name ilike OR owner_id in ...).
    let ownerIds: string[] = [];
    if (q) {
      const { data: ownerProfiles, error: ownerError } = await admin.from("profiles").select("id").ilike("email", `%${q}%`);
      if (ownerError) throw ownerError;
      ownerIds = (ownerProfiles ?? []).map((profile: { id: string }) => profile.id);
    }

    // Subscription join becomes inner while filtering on it; otherwise keep the
    // left join so workspaces without a subscription still appear.
    const subscriptionEmbed = plan || status ? "workspace_subscriptions!inner(plan_code,status)" : "workspace_subscriptions(plan_code,status)";
    let query = admin
      .from("workspaces")
      .select(`id,name,kind,owner_id,created_at,${subscriptionEmbed},credit_accounts(balance),profiles(email)`, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(pageFrom, pageTo);
    if (q) {
      query = ownerIds.length
        ? query.or(`name.ilike.%${q}%,owner_id.in.(${ownerIds.join(",")})`)
        : query.ilike("name", `%${q}%`);
    }
    if (plan) query = query.eq("workspace_subscriptions.plan_code", plan);
    if (status) query = query.eq("workspace_subscriptions.status", status);

    const { data, error, count } = await query;
    if (error) throw error;
    const rows = (data as WorkspaceRow[] | null) ?? [];

    // Batched per-workspace counts for just this page; grouping in JS avoids N+1.
    const ids = rows.map((row) => row.id);
    const [membersRes, documentsRes] = ids.length
      ? await Promise.all([
          admin.from("workspace_members").select("workspace_id").in("workspace_id", ids),
          admin.from("documents").select("workspace_id").in("workspace_id", ids),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (membersRes.error) throw membersRes.error;
    if (documentsRes.error) throw documentsRes.error;
    const countByWorkspace = (rowsList: { workspace_id: string }[] | null | undefined) => {
      const counts = new Map<string, number>();
      for (const row of rowsList ?? []) counts.set(row.workspace_id, (counts.get(row.workspace_id) ?? 0) + 1);
      return counts;
    };
    const memberCounts = countByWorkspace(membersRes.data);
    const documentCounts = countByWorkspace(documentsRes.data);

    const items = rows.map((row) => {
      const subscription = one(row.workspace_subscriptions);
      const account = one(row.credit_accounts);
      const ownerProfile = one(row.profiles);
      return {
        id: row.id,
        name: row.name,
        kind: row.kind,
        ownerEmail: ownerProfile?.email ?? null,
        planCode: subscription?.plan_code ?? null,
        subscriptionStatus: subscription?.status ?? null,
        creditsBalance: Number(account?.balance ?? 0),
        membersCount: memberCounts.get(row.id) ?? 0,
        documentsCount: documentCounts.get(row.id) ?? 0,
      };
    });

    return apiData({ items, total: count ?? 0, page, pageSize });
  } catch (error) { return apiError(error); }
}
