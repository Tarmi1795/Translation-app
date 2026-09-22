import { requirePlatformAdmin } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

type AuditRow = {
  id: number;
  workspace_id: string | null;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const rawPage = Number(new URL(request.url).searchParams.get("page") ?? 1);
    const page = Math.max(1, Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1);
    const admin = createAdminClient();

    const { data, error, count } = await admin
      .from("audit_logs")
      .select("id,workspace_id,actor_id,action,target_type,target_id,metadata,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data as AuditRow[] | null) ?? [];

    // audit_logs.actor_id references auth.users (not profiles), so the actor
    // profile is resolved with one batched in() lookup instead of an embed.
    const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];
    const profilesRes = actorIds.length
      ? await admin.from("profiles").select("id,email,display_name").in("id", actorIds)
      : { data: [], error: null };
    if (profilesRes.error) throw profilesRes.error;
    const profileByActor = new Map((profilesRes.data ?? []).map((profile: { id: string; email: string; display_name: string | null }) => [profile.id, profile]));

    const items = rows.map((row) => {
      const actor = row.actor_id ? profileByActor.get(row.actor_id) : undefined;
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        actorId: row.actor_id,
        actorName: actor?.display_name ?? null,
        actorEmail: actor?.email ?? null,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        metadata: row.metadata,
        createdAt: row.created_at,
      };
    });

    return apiData({ items, total: count ?? 0, page, pageSize: PAGE_SIZE });
  } catch (error) { return apiError(error); }
}
