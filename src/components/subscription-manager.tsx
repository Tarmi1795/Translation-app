"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Ban,
  BadgeCheck,
  CalendarRange,
  Check,
  CreditCard,
  Info,
  LoaderCircle,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";
import type { BillingStatement, PlanSummary, SubscriptionSummary } from "@/types/domain";

interface SubscriptionPayload {
  subscription: SubscriptionSummary | null;
  usage: { wordsUsedThisPeriod: number; allowance: number };
  statements: BillingStatement[];
}

class ApiError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const payload = await response.json();
  if (!response.ok) throw new ApiError(payload.error?.message ?? "The request failed.", payload.error?.code);
  return payload.data as T;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-QA", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

const STATUS_STYLES: Record<SubscriptionSummary["status"], string> = {
  active: "border-[color:color-mix(in_srgb,var(--success)_24%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_8%,var(--surface))] text-[var(--success)]",
  trialing: "border-[color:color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]",
  past_due: "border-[color:color-mix(in_srgb,var(--danger)_22%,var(--border))] bg-[color:color-mix(in_srgb,var(--danger)_7%,var(--surface))] text-[var(--danger)]",
  canceled: "border-[color:color-mix(in_srgb,var(--muted)_22%,var(--border))] bg-[var(--subtle)] text-[var(--muted)]",
};
const STATUS_LABELS: Record<SubscriptionSummary["status"], string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due",
  canceled: "Canceled",
};

const STATEMENT_KINDS: Record<string, { label: string; className: string }> = {
  subscription_payment: { label: "Subscription payment", className: "border-[color:color-mix(in_srgb,var(--success)_24%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_8%,var(--surface))] text-[var(--success)]" },
  plan_change: { label: "Plan change", className: "border-[color:color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]" },
  plan_allowance: { label: "Plan allowance", className: "border-[color:color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]" },
  manual: { label: "Manual adjustment", className: "border-[color:color-mix(in_srgb,var(--warning)_24%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_8%,var(--surface))] text-[var(--warning)]" },
};

export function SubscriptionManager({ workspaceId }: { workspaceId: string | null }) {
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [payload, setPayload] = useState<SubscriptionPayload | null>(null);
  const [loading, setLoading] = useState(Boolean(workspaceId));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkoutPending, setCheckoutPending] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelImmediate, setCancelImmediate] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    // Plans are public and immutable enough to cache after the first load;
    // only the subscription payload refreshes on each reload.
    const plansRequest = plans ? Promise.resolve(plans) : api<PlanSummary[]>("/api/v1/plans", { signal: controller.signal });
    api<SubscriptionPayload>(`/api/v1/subscription?workspace_id=${workspaceId}`, { signal: controller.signal })
      .then(async (nextPayload) => {
        const nextPlans = await plansRequest;
        if (controller.signal.aborted) return;
        setPlans(nextPlans);
        setPayload(nextPayload);
        setError(null);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Subscription details could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, reloadToken]);

  function refresh() {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }

  if (!workspaceId) {
    return (
      <div>
        <PageHeader />
        <Card className="mx-auto max-w-lg p-8 text-center">
          <h2 className="text-xl font-bold">No active workspace</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Plans and billing are tied to a workspace. Connect Supabase and create a workspace to manage a subscription.</p>
        </Card>
      </div>
    );
  }

  const subscription = payload?.subscription ?? null;
  const usage = payload?.usage ?? { wordsUsedThisPeriod: 0, allowance: 0 };
  const statements = payload?.statements ?? [];
  const currentPlan = plans?.find((plan) => plan.code === subscription?.planCode) ?? plans?.find((plan) => plan.code === "free") ?? null;
  const usagePercent = usage.allowance > 0 ? Math.min(100, Math.round((usage.wordsUsedThisPeriod / usage.allowance) * 100)) : 0;
  const usageTone = usagePercent >= 80 ? "warning" : "accent";

  async function switchPlan(planCode: string, planName: string) {
    setSwitching(planCode);
    setError(null);
    setNotice(null);
    setCheckoutPending(null);
    try {
      await api("/api/v1/subscription", { method: "POST", body: JSON.stringify({ workspaceId, planCode }) });
      setNotice(`Plan switched to ${planName}. Word allowances apply immediately.`);
      refresh();
    } catch (reason) {
      if (reason instanceof ApiError && (reason.code === "checkout_unavailable" || reason.message.toLowerCase().includes("checkout"))) setCheckoutPending(planName);
      else setError(reason instanceof Error ? reason.message : "The plan could not be changed.");
    } finally {
      setSwitching(null);
    }
  }

  async function cancelSubscription() {
    const when = cancelImmediate ? "immediately" : "at the end of the current period";
    if (!window.confirm(`Cancel this subscription ${when}?`)) return;
    setCancelling(true);
    setError(null);
    setNotice(null);
    try {
      await api("/api/v1/subscription/cancel", { method: "POST", body: JSON.stringify({ workspaceId, immediate: cancelImmediate }) });
      setNotice(cancelImmediate ? "Subscription canceled." : "Subscription will not renew at the end of the period.");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The subscription could not be canceled.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div>
      <PageHeader />

      {error && <p role="alert" className="page-enter mb-6 rounded-xl border border-[color:color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[color:color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-4 text-sm leading-6 text-[var(--danger)]">{error}</p>}
      {notice && <p aria-live="polite" className="page-enter mb-6 rounded-xl border border-[color:color-mix(in_srgb,var(--success)_25%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_8%,var(--surface))] p-4 text-sm leading-6 text-[var(--success)]">{notice}</p>}
      {checkoutPending && (
        <div role="status" className="page-enter mb-6 flex items-start gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[var(--accent-soft)] p-4 text-sm leading-6 text-[var(--accent)]">
          <Info aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
          <p>Online checkout is coming soon — contact support to activate paid plans. <span dir="rtl">الدفع عبر الإنترنت قريباً — تواصل مع الدعم لتفعيل الخطة.</span></p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.6fr)]" aria-busy={loading}>
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Current plan</p>
              <h2 className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-2xl font-bold tracking-[-0.02em]">
                {loading && !payload ? "…" : currentPlan ? currentPlan.name : subscription?.planName ?? "Free"}
                {currentPlan?.nameAr && <span className="text-base font-semibold text-[var(--muted)]" dir="rtl">{currentPlan.nameAr}</span>}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {currentPlan && currentPlan.priceMonthly > 0
                  ? `${formatNumber(currentPlan.priceMonthly)} ${currentPlan.currency} / month · شهرياً`
                  : currentPlan
                    ? "Free · مجاني"
                    : "—"}
              </p>
            </div>
            <Badge className={subscription ? STATUS_STYLES[subscription.status] : STATUS_STYLES.active}>
              {subscription ? STATUS_LABELS[subscription.status] : "Free"}
            </Badge>
          </div>

          {subscription ? (
            <dl className="mt-6 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <div className="flex items-start gap-2.5">
                <CalendarRange aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--muted)]" size={17} />
                <div><dt className="font-semibold">Current period</dt><dd className="mt-0.5 text-[var(--muted)]">{formatDate(subscription.currentPeriodStart)} — {formatDate(subscription.currentPeriodEnd)}</dd></div>
              </div>
              <div className="flex items-start gap-2.5">
                <BadgeCheck aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--muted)]" size={17} />
                <div><dt className="font-semibold">Renews on</dt><dd className="mt-0.5 text-[var(--muted)]">{formatDate(subscription.currentPeriodEnd)}</dd></div>
              </div>
            </dl>
          ) : (
            <p className="mt-6 text-sm leading-6 text-[var(--muted)]">No paid subscription is active on this workspace. You are on the Free plan’s monthly word allowance.</p>
          )}

          {subscription?.cancelAtPeriodEnd && (
            <div role="status" className="mt-5 rounded-xl border border-[color:color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_8%,var(--surface))] p-4 text-sm leading-6 text-[var(--warning)]">
              This subscription will not renew — it ends on {formatDate(subscription.currentPeriodEnd)}. Switch plans any time to resume renewals.
            </div>
          )}
          {subscription?.status === "past_due" && (
            <div role="alert" className="mt-5 rounded-xl border border-[color:color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[color:color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-4 text-sm leading-6 text-[var(--danger)]">
              The last payment failed. Contact support to settle the invoice and restore the plan.
            </div>
          )}
          {currentPlan && (
            <div className="mt-6 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => document.getElementById("plan-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <CreditCard aria-hidden="true" size={16} /> Change plan <ArrowRight aria-hidden="true" size={15} className="rtl:rotate-180" />
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--muted)]">Words this period</p>
              <p className="mt-2 text-3xl font-bold tabular-nums tracking-[-0.03em]">{formatNumber(usage.wordsUsedThisPeriod)}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">of {formatNumber(usage.allowance)} included</p>
            </div>
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", usageTone === "warning" ? "bg-[color:color-mix(in_srgb,var(--warning)_12%,var(--surface))] text-[var(--warning)]" : "bg-[var(--accent-soft)] text-[var(--accent)]")}><Wallet aria-hidden="true" size={19} /></span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--subtle)]">
            <div className={cn("h-full rounded-full transition-[width] duration-300", usageTone === "warning" ? "bg-[var(--warning)]" : "bg-[var(--accent)]")} style={{ width: `${usagePercent}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-[var(--muted)]">
            <span>{usagePercent}% used</span>
            <span>{formatNumber(Math.max(0, usage.allowance - usage.wordsUsedThisPeriod))} left</span>
          </div>
          <p className="mt-5 rounded-xl border bg-[var(--surface-muted)] p-3.5 text-xs leading-5 text-[var(--muted)]">Pay-as-you-go words come from plan allowances. Translations draw down this balance; a new period adds the next allowance.</p>
        </Card>
      </div>

      <section id="plan-grid" className="mt-8 scroll-mt-24" aria-label="Available plans">
        <h2 className="font-bold">Change plan</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Switch instantly — the new word allowance applies to this workspace right away. · <span dir="rtl">غيّر الخطة فوراً</span></p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(loading && !plans ? Array.from({ length: 4 }, () => null) : plans ?? []).map((plan, index) => {
            if (!plan) return <Card key={`plan-skeleton-${index}`} className="min-h-64 p-5" aria-hidden="true"><div className="h-5 w-28 animate-pulse rounded bg-[var(--subtle)]" /><div className="mt-3 h-3 w-20 animate-pulse rounded bg-[var(--subtle)]" /><div className="mt-5 h-8 w-24 animate-pulse rounded bg-[var(--subtle)]" /><div className="mt-5 h-3 w-full animate-pulse rounded bg-[var(--subtle)]" /><div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-[var(--subtle)]" /><div className="mt-6 h-11 w-full animate-pulse rounded-xl bg-[var(--subtle)]" /></Card>;
            const isCurrent = (subscription?.planCode ?? "free") === plan.code;
            return (
              <Card key={plan.code} className={cn("flex flex-col p-5", isCurrent ? "border-[var(--accent)] shadow-[0_10px_28px_color-mix(in_srgb,var(--accent)_12%,transparent)]" : "")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{plan.name}</h3>
                    {plan.nameAr && <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]" dir="rtl">{plan.nameAr}</p>}
                  </div>
                  {isCurrent && <Badge className="border-[color:color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]">Current</Badge>}
                </div>
                <p className="mt-3 text-xl font-bold tabular-nums">{plan.priceMonthly === 0 ? "Free" : `${formatNumber(plan.priceMonthly)} ${plan.currency}`}<span className="ms-1 text-xs font-semibold text-[var(--muted)]">{plan.priceMonthly > 0 ? "/mo" : ""}</span></p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{formatNumber(plan.monthlyWordAllowance)} words / month · {plan.maxSeats} {plan.maxSeats === 1 ? "seat" : "seats"}</p>
                <ul className="mt-4 flex-1 space-y-2 text-xs leading-5">
                  {plan.features.slice(0, 4).map((feature) => <li key={feature} className="flex items-start gap-2"><Check aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--success)]" size={13} /> {feature}</li>)}
                </ul>
                {isCurrent ? (
                  <Button type="button" variant="secondary" className="mt-5 w-full" disabled><Check aria-hidden="true" size={15} /> Current plan</Button>
                ) : (
                  <Button type="button" variant={plan.code === "free" ? "secondary" : "primary"} className="mt-5 w-full" disabled={switching === plan.code} onClick={() => switchPlan(plan.code, plan.name)}>
                    {switching === plan.code && <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />} Switch to {plan.name}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(300px,.6fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-bold"><Ban aria-hidden="true" size={17} className="text-[var(--danger)]" /> Cancel subscription</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Cancel at period end keeps your remaining words until {subscription ? formatDate(subscription.currentPeriodEnd) : "the period end"}. Immediate cancel deactivates the plan now.</p>
          {!subscription ? (
            <p className="mt-5 rounded-xl border bg-[var(--surface-muted)] p-3.5 text-sm leading-6 text-[var(--muted)]">There is no paid subscription to cancel — you are on the Free plan.</p>
          ) : (
            <fieldset className="mt-5 space-y-2">
              <legend className="mb-2 text-sm font-bold">When</legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-[var(--surface)] px-3.5 text-sm font-semibold">
                <input type="radio" name="cancel-when" checked={!cancelImmediate} onChange={() => setCancelImmediate(false)} className="accent-[var(--accent)]" /> At period end (recommended)
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-[var(--surface)] px-3.5 text-sm font-semibold">
                <input type="radio" name="cancel-when" checked={cancelImmediate} onChange={() => setCancelImmediate(true)} className="accent-[var(--accent)]" /> Immediately
              </label>
              <Button type="button" variant="danger" className="mt-4 w-full" disabled={cancelling} onClick={cancelSubscription}>
                {cancelling && <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />} Cancel subscription
              </Button>
            </fieldset>
          )}
        </Card>

        <Card className="overflow-hidden" aria-busy={loading}>
          <div className="border-b px-5 py-5 sm:px-6">
            <h2 className="flex items-center gap-2 font-bold"><ReceiptText aria-hidden="true" size={17} className="text-[var(--accent)]" /> Billing history</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Statements for plan changes, allowances, and payments. · <span dir="rtl">سجل الفواتير</span></p>
          </div>
          {loading && !payload ? (
            <div className="divide-y" aria-hidden="true">
              {[0, 1, 2].map((index) => <div key={index} className="px-5 py-4 sm:px-6"><div className="h-4 w-full max-w-sm animate-pulse rounded bg-[var(--subtle)]" /><div className="mt-2 h-3 w-32 animate-pulse rounded bg-[var(--subtle)]" /></div>)}
            </div>
          ) : statements.length ? (
            <div className="divide-y">
              {statements.map((statement) => {
                const kind = STATEMENT_KINDS[statement.kind] ?? { label: statement.kind.replaceAll("_", " "), className: "" };
                return (
                  <div key={statement.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-6">
                    <p className="w-24 text-sm tabular-nums text-[var(--muted)]">{formatDate(statement.createdAt)}</p>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{statement.description || kind.label}</p>
                      {statement.planCode && <p className="mt-0.5 text-xs text-[var(--muted)]">{statement.planCode}</p>}
                    </div>
                    <Badge className={kind.className || undefined}>{kind.label}</Badge>
                    <p className="w-24 text-end text-sm font-bold tabular-nums">{formatNumber(statement.amount)} <span className="text-xs font-semibold text-[var(--muted)]">{statement.currency}</span></p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-14 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl border bg-[var(--surface-muted)] text-[var(--muted)] shadow-sm"><ReceiptText aria-hidden="true" size={23} /></span>
              <h3 className="mt-5 font-bold">No statements yet</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]"><span dir="rtl">لا توجد فواتير بعد</span> — statements appear after your first plan change or payment.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-semibold text-[var(--accent)]">Plans &amp; billing</p>
      <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Subscription</h1>
      <p className="mt-3 leading-7 text-[var(--muted)]">Manage your plan, monthly word allowance, and billing history. <span dir="rtl">إدارة الخطة والاشتراك والفواتير.</span></p>
    </div>
  );
}
