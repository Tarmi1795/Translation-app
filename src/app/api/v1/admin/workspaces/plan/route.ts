import { ApiError, requirePlatformAdmin } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/server";
import { adminSetPlanSchema } from "@/lib/api/schemas";

export async function POST(request: Request) {
  try {
    const actor = await requirePlatformAdmin();
    const input = adminSetPlanSchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: workspace, error: workspaceError } = await admin.from("workspaces").select("id").eq("id", input.workspaceId).maybeSingle();
    if (workspaceError) throw workspaceError;
    if (!workspace) throw new ApiError(404, "Workspace not found.", "not_found");

    const { data, error } = await admin.rpc("set_workspace_plan", {
      p_workspace_id: input.workspaceId,
      p_plan_code: input.planCode,
      p_period_days: input.periodDays,
      p_provider: "manual",
      p_actor_id: actor.id,
      p_status: "active",
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;

    const { error: auditError } = await admin.from("audit_logs").insert({
      workspace_id: input.workspaceId,
      actor_id: actor.id,
      action: "admin.plan_set",
      target_type: "subscription",
      target_id: input.workspaceId,
      metadata: { planCode: input.planCode, periodDays: input.periodDays },
    });
    if (auditError) throw auditError;

    return apiData(
      {
        planCode: result?.plan_code ?? input.planCode,
        subscriptionId: result?.subscription_id ?? null,
        periodStart: result?.period_start ?? null,
        periodEnd: result?.period_end ?? null,
        creditsGranted: result?.credits_granted ?? 0,
      },
      { status: 201 },
    );
  } catch (error) { return apiError(error); }
}
