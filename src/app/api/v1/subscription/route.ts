import { ApiError, requireWorkspaceRole } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { changePlanSchema } from "@/lib/api/schemas";
import type { BillingStatement, SubscriptionSummary } from "@/types/domain";

type Client = Awaited<ReturnType<typeof createClient>>;

type SubscriptionRow = {
  plan_code: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  provider: string;
  plans: { name: string; monthly_word_allowance: string | number } | { name: string; monthly_word_allowance: string | number }[] | null;
};

// Re-reads the workspace subscription joined with its plan; null when absent.
async function readSubscription(supabase: Client, workspaceId: string): Promise<{ subscription: SubscriptionSummary; allowance: number; periodStart: string } | null> {
  const { data, error } = await supabase
    .from("workspace_subscriptions")
    .select("plan_code,status,current_period_start,current_period_end,cancel_at_period_end,provider,plans(name,monthly_word_allowance)")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  const row = data as SubscriptionRow | null;
  if (!row) return null;
  const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans;
  return {
    subscription: {
      planCode: row.plan_code,
      planName: plan?.name ?? row.plan_code,
      status: row.status as SubscriptionSummary["status"],
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      provider: row.provider,
    },
    allowance: Number(plan?.monthly_word_allowance ?? 0),
    periodStart: row.current_period_start,
  };
}

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspace_id");
    if (!workspaceId) throw new ApiError(400, "A workspace_id query parameter is required.", "validation_error");
    await requireWorkspaceRole(workspaceId);
    const supabase = await createClient();

    const current = await readSubscription(supabase, workspaceId);

    // Words consumed since the period began; usage rows carry negative deltas.
    let wordsUsedThisPeriod = 0;
    if (current) {
      const { data: usageRows, error: usageError } = await supabase
        .from("credit_ledger")
        .select("delta")
        .eq("workspace_id", workspaceId)
        .eq("entry_type", "translation_usage")
        .gte("created_at", current.periodStart);
      if (usageError) throw usageError;
      wordsUsedThisPeriod = (usageRows ?? []).reduce((sum, row: { delta: string | number }) => sum + Math.abs(Number(row.delta)), 0);
    }

    const { data: statementRows, error: statementsError } = await supabase
      .from("billing_statements")
      .select("id,kind,amount,currency,description,plan_code,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (statementsError) throw statementsError;
    const statements: BillingStatement[] = (statementRows ?? []).map((row: { id: string; kind: string; amount: string | number; currency: string; description: string | null; plan_code: string | null; created_at: string }) => ({
      id: row.id,
      kind: row.kind,
      amount: Number(row.amount),
      currency: row.currency,
      description: row.description,
      planCode: row.plan_code,
      createdAt: row.created_at,
    }));

    return apiData({
      subscription: current?.subscription ?? null,
      usage: { wordsUsedThisPeriod, allowance: current?.allowance ?? 0 },
      statements,
    });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const input = changePlanSchema.parse(await request.json());
    const { user } = await requireWorkspaceRole(input.workspaceId, ["owner", "admin"]);
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: plan, error: planError } = await admin.from("plans").select("code,name,price_monthly").eq("code", input.planCode).maybeSingle();
    if (planError) throw planError;
    if (!plan) throw new ApiError(404, "Plan not found.", "not_found");
    if (Number(plan.price_monthly) > 0 && !process.env.NOQOODY_WEBHOOK_SECRET) {
      throw new ApiError(402, "Online checkout is not available yet. Contact support to activate a paid plan.", "checkout_unavailable");
    }

    const { error: rpcError } = await admin.rpc("set_workspace_plan", {
      p_workspace_id: input.workspaceId,
      p_plan_code: input.planCode,
      p_period_days: 30,
      p_provider: "manual",
      p_actor_id: user.id,
      p_status: "active",
    });
    if (rpcError) throw rpcError;

    const { error: auditError } = await admin.from("audit_logs").insert({
      workspace_id: input.workspaceId,
      actor_id: user.id,
      action: "subscription.plan_changed",
      target_type: "subscription",
      target_id: input.workspaceId,
      metadata: { planCode: input.planCode, planName: plan.name },
    });
    if (auditError) throw auditError;

    const current = await readSubscription(supabase, input.workspaceId);
    return apiData({ subscription: current?.subscription ?? null });
  } catch (error) { return apiError(error); }
}
