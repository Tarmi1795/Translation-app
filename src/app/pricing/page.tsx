import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { cn, formatNumber } from "@/lib/utils";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { PlanSummary } from "@/types/domain";

export const metadata = { title: "Pricing · English Arabic Translate AI" };

// Mirrors the seed rows in the SaaS commercial migration so the page still
// renders before Supabase is configured.
const FALLBACK_PLANS: PlanSummary[] = [
  { code: "free", name: "Free", nameAr: "مجاني", tagline: "Get started with light translation needs", taglineAr: "ابدأ لاحتياجات الترجمة البسيطة", priceMonthly: 0, currency: "QAR", monthlyWordAllowance: 3000, maxSeats: 1, features: ["PDF / DOCX / scan translation", "WYSIWYG correction preview", "3,000 words per month", "1 seat"] },
  { code: "starter", name: "Starter", nameAr: "المبتدئ", tagline: "For freelancers and small offices", taglineAr: "للمستقلين والمكاتب الصغيرة", priceMonthly: 49, currency: "QAR", monthlyWordAllowance: 10000, maxSeats: 3, features: ["Everything in Free", "10,000 words per month", "3 seats", "Private glossary & memory", "Email support"] },
  { code: "business", name: "Business", nameAr: "الأعمال", tagline: "For teams with regular document volume", taglineAr: "للفرق ذات حجم مستندات منتظم", priceMonthly: 149, currency: "QAR", monthlyWordAllowance: 40000, maxSeats: 10, features: ["Everything in Starter", "40,000 words per month", "10 seats", "Team roles & review workflow", "Priority support"] },
  { code: "enterprise", name: "Enterprise", nameAr: "المؤسسات", tagline: "High volume with dedicated onboarding", taglineAr: "حجم كبير مع تهيئة مخصصة", priceMonthly: 499, currency: "QAR", monthlyWordAllowance: 150000, maxSeats: 50, features: ["Everything in Business", "150,000 words per month", "50 seats", "SSO & audit exports", "Dedicated manager"] },
];

export default async function PricingPage() {
  const plans = await loadPlans();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b bg-[color:color-mix(in_srgb,var(--background)_88%,transparent)] px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between gap-4">
          <Brand />
          <div className="flex items-center gap-2">
            <Link href="/" className="hidden min-h-11 items-center rounded-xl px-3 text-sm font-semibold transition-colors hover:bg-[var(--subtle)] sm:inline-flex">Home</Link>
            <Link href="/auth/sign-in" className="inline-flex min-h-11 items-center rounded-xl border border-[color:color-mix(in_srgb,var(--primary)_88%,black)] bg-[var(--primary)] px-4 text-sm font-bold text-white shadow-sm transition-[background-color] duration-200 hover:bg-[var(--primary-hover)] dark:border-transparent dark:text-[#0e1724]">Sign in</Link>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-7xl px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:px-8">
        <section className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Pricing · الأسعار</p>
          <h1 className="mt-4 text-balance text-4xl font-bold leading-[1.08] tracking-[-0.04em] sm:text-5xl">Simple pricing for professional translation</h1>
          <p className="mt-4 text-xl font-semibold leading-8 text-[var(--muted)]" dir="rtl">أسعار بسيطة لترجمة احترافية</p>
          <p className="mt-4 text-base leading-7 text-[var(--muted)]">Start free and move up when your document volume grows. Every plan includes the full inspection, review, and approval workflow.</p>
        </section>

        <section className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" aria-label="Available plans">
          {plans.map((plan) => <PlanCard key={plan.code} plan={plan} />)}
        </section>

        <section className="mt-12 flex flex-col items-center gap-4 rounded-2xl border bg-[var(--surface)] p-6 text-center shadow-sm sm:flex-row sm:justify-between sm:text-start">
          <div className="flex items-start gap-3 text-start">
            <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--success)]" size={20} />
            <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]"><strong className="text-[var(--foreground)]">No card required today.</strong> Online checkout is coming soon — paid plans can also be activated by our support team. Free plan stays free. <span dir="rtl">لا حاجة لبطاقة — الخطط المدفوعة تُفعَّل عبر فريق الدعم.</span></p>
          </div>
          <Link href="/" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border bg-[var(--surface)] px-4 text-sm font-bold shadow-sm transition-colors hover:bg-[var(--subtle)]">Back to home <ArrowRight aria-hidden="true" size={16} className="rtl:rotate-180" /></Link>
        </section>
      </main>
    </div>
  );
}

function PlanCard({ plan }: { plan: PlanSummary }) {
  const popular = plan.code === "business";
  return (
    <div className={cn("interactive-surface relative flex flex-col rounded-2xl border bg-[var(--surface)] p-6 shadow-sm", popular ? "border-[var(--accent)] shadow-[0_14px_36px_color-mix(in_srgb,var(--accent)_14%,transparent)]" : "hover:border-[var(--border-strong)]")}>
      {popular && (
        <span className="absolute -top-3 start-1/2 -translate-x-1/2 rounded-full border border-[color:color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-bold text-[var(--accent)] rtl:translate-x-1/2">Most popular</span>
      )}
      <div>
        <h2 className="text-lg font-bold">{plan.name}</h2>
        {plan.nameAr && <p className="mt-0.5 text-sm font-semibold text-[var(--muted)]" dir="rtl">{plan.nameAr}</p>}
      </div>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <span className="text-3xl font-bold tabular-nums tracking-[-0.03em]">{plan.priceMonthly === 0 ? "Free" : formatNumber(plan.priceMonthly)}</span>
        {plan.priceMonthly > 0 && <span className="text-sm font-semibold text-[var(--muted)]">{plan.currency} / month · شهرياً</span>}
      </p>
      {plan.tagline && <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{plan.tagline}</p>}
      {plan.taglineAr && <p className="mt-1 text-sm leading-6 text-[var(--muted)]" dir="rtl">{plan.taglineAr}</p>}
      <div className="mt-5 rounded-xl border bg-[var(--surface-muted)] p-3.5">
        <p className="text-sm font-bold tabular-nums">{formatNumber(plan.monthlyWordAllowance)} words <span className="font-normal text-[var(--muted)]">/ month</span></p>
        <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{plan.maxSeats} {plan.maxSeats === 1 ? "seat" : "seats"} · {plan.maxSeats === 1 ? "مقعد" : "مقاعد"}</p>
      </div>
      <ul className="mt-5 flex-1 space-y-2.5 text-sm leading-6">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2"><Check aria-hidden="true" className="mt-1 shrink-0 text-[var(--success)]" size={15} /> {feature}</li>
        ))}
      </ul>
      <Link
        href="/auth/sign-in"
        className={cn("group mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition-[background-color,border-color,box-shadow,transform] duration-200 active:scale-[0.985]",
          popular
            ? "border-[color:color-mix(in_srgb,var(--primary)_88%,black)] bg-[var(--primary)] text-white shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_18%,transparent)] hover:bg-[var(--primary-hover)] dark:border-transparent dark:text-[#0e1724]"
            : "border-[var(--border)] bg-[var(--surface)] shadow-sm hover:border-[var(--border-strong)] hover:bg-[var(--subtle)]")}
      >
        {plan.priceMonthly === 0 ? "Start free" : `Choose ${plan.name}`} <ArrowRight aria-hidden="true" size={16} className="transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
      </Link>
    </div>
  );
}

async function loadPlans(): Promise<PlanSummary[]> {
  if (!hasSupabaseEnv()) return FALLBACK_PLANS;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("plans")
      .select("code,name,name_ar,tagline,tagline_ar,price_monthly,currency,monthly_word_allowance,max_seats,features")
      .eq("is_public", true)
      .order("sort_order");
    const plans = (data ?? []).map((plan) => ({
      code: plan.code,
      name: plan.name,
      nameAr: plan.name_ar ?? null,
      tagline: plan.tagline ?? null,
      taglineAr: plan.tagline_ar ?? null,
      priceMonthly: Number(plan.price_monthly),
      currency: plan.currency,
      monthlyWordAllowance: Number(plan.monthly_word_allowance),
      maxSeats: Number(plan.max_seats),
      features: Array.isArray(plan.features) ? plan.features.map(String) : [],
    }));
    return plans.length ? plans : FALLBACK_PLANS;
  } catch {
    return FALLBACK_PLANS;
  }
}
