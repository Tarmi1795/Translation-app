import { requireWorkspaceRole } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/server";
import { cancelSubscriptionSchema } from "@/lib/api/schemas";

export async function POST(request: Request) {
  try {
    const input = cancelSubscriptionSchema.parse(await request.json());
    const { user } = await requireWorkspaceRole(input.workspaceId, ["owner", "admin"]);
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("cancel_workspace_subscription", {
      p_workspace_id: input.workspaceId,
      p_immediate: input.immediate,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;

    const { error: auditError } = await admin.from("audit_logs").insert({
      workspace_id: input.workspaceId,
      actor_id: user.id,
      action: "subscription.cancelled",
      target_type: "subscription",
      target_id: input.workspaceId,
      metadata: { immediate: input.immediate, status: result?.status ?? null },
    });
    if (auditError) throw auditError;

    return apiData({ status: result?.status ?? (input.immediate ? "canceled" : "cancel_at_period_end") });
  } catch (error) { return apiError(error); }
}
