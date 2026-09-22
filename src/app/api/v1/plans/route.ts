import { apiData, apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";
import type { PlanSummary } from "@/types/domain";

export async function GET() {
  try {
    // Plans carry an RLS policy allowing anon/authenticated reads of public rows.
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("plans")
      .select("code,name,name_ar,tagline,tagline_ar,price_monthly,currency,monthly_word_allowance,max_seats,features")
      .eq("is_public", true)
      .order("sort_order");
    if (error) throw error;
    const plans: PlanSummary[] = (data ?? []).map((plan) => ({
      code: plan.code,
      name: plan.name,
      nameAr: plan.name_ar,
      tagline: plan.tagline,
      taglineAr: plan.tagline_ar,
      priceMonthly: Number(plan.price_monthly),
      currency: plan.currency,
      monthlyWordAllowance: Number(plan.monthly_word_allowance),
      maxSeats: plan.max_seats,
      features: Array.isArray(plan.features) ? plan.features.map((feature: unknown) => String(feature)) : [],
    }));
    return apiData(plans);
  } catch (error) { return apiError(error); }
}
