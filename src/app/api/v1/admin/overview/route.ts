import { requirePlatformAdmin } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/server";

type SubscriptionRow = { plan_code: string };
type PlanRow = { code: string; price_monthly: string | number };
type SaleRow = { amount: string | number };
type FailureRow = {
  id: string;
  error_code: string | null;
  error_message: string | null;
  updated_at: string;
  created_at: string;
  projects: { title: string } | { title: string }[] | null;
};

export async function GET() {
  try {
    await requirePlatformAdmin();
    const admin = createAdminClient();

    const [workspacesRes, subscriptionsRes, plansRes, jobsCompletedRes, jobsFailedRes, salesRes, failuresRes] = await Promise.all([
      admin.from("workspaces").select("id", { count: "exact", head: true }),
      admin.from("workspace_subscriptions").select("plan_code").in("status", ["active", "trialing"]),
      admin.from("plans").select("code,price_monthly"),
      admin.from("translation_jobs").select("id", { count: "exact", head: true }).eq("stage", "completed"),
      admin.from("translation_jobs").select("id", { count: "exact", head: true }).eq("stage", "failed"),
      admin.from("sales").select("amount").neq("status", "void"),
      admin.from("translation_jobs").select("id,error_code,error_message,updated_at,created_at,projects(title)").eq("stage", "failed").order("updated_at", { ascending: false }).limit(5),
    ]);
    if (workspacesRes.error) throw workspacesRes.error;
    if (subscriptionsRes.error) throw subscriptionsRes.error;
    if (plansRes.error) throw plansRes.error;
    if (jobsCompletedRes.error) throw jobsCompletedRes.error;
    if (jobsFailedRes.error) throw jobsFailedRes.error;
    if (salesRes.error) throw salesRes.error;
    if (failuresRes.error) throw failuresRes.error;

    const activeSubscriptions = (subscriptionsRes.data as SubscriptionRow[] | null ?? []).reduce<Record<string, number>>((counts, row) => {
      counts[row.plan_code] = (counts[row.plan_code] ?? 0) + 1;
      return counts;
    }, {});

    const priceByPlan = new Map<string, number>((plansRes.data as PlanRow[] | null ?? []).map((plan) => [plan.code, Number(plan.price_monthly)]));
    const mrr = (subscriptionsRes.data as SubscriptionRow[] | null ?? []).reduce((sum, row) => sum + (priceByPlan.get(row.plan_code) ?? 0), 0);

    // Platform-wide customer business volume (never document content).
    const salesVolume = (salesRes.data as SaleRow[] | null ?? []).reduce((sum, row) => sum + Number(row.amount), 0);

    const lastFailures = (failuresRes.data as FailureRow[] | null ?? []).map((row) => {
      const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
      return {
        jobId: row.id,
        error: row.error_message ?? row.error_code ?? null,
        at: row.updated_at ?? row.created_at,
        projectTitle: project?.title ?? null,
      };
    });

    return apiData({
      workspaces: workspacesRes.count ?? 0,
      activeSubscriptions,
      mrr,
      currency: "QAR",
      jobsCompleted: jobsCompletedRes.count ?? 0,
      jobsFailed: jobsFailedRes.count ?? 0,
      salesVolume,
      lastFailures,
    });
  } catch (error) { return apiError(error); }
}
