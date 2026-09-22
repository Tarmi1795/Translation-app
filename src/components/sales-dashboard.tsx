"use client";

import { useEffect, useState } from "react";
import {
  Ban,
  CalendarDays,
  CircleDollarSign,
  Download,
  FileStack,
  HandCoins,
  LoaderCircle,
  Plus,
  ReceiptText,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";
import type { SaleRecord, SalesTotals } from "@/types/domain";

const CURRENCIES = ["QAR", "USD", "SAR", "AED", "EGP"] as const;
const PAYMENT_METHODS = [
  ["cash", "Cash · نقدي"],
  ["card", "Card · بطاقة"],
  ["bank_transfer", "Bank transfer · حوالة بنكية"],
  ["cheque", "Cheque · شيك"],
  ["other", "Other · أخرى"],
] as const;

interface SalesResponse {
  sales: SaleRecord[];
  totals: SalesTotals;
  processing: { documents: number; jobsCompleted: number };
  trend: Array<{ period: string; recorded: number; received: number }>;
  page: number;
  pageSize: number;
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

function toDayInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-QA", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatPeriodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, 1);
  return {
    en: new Intl.DateTimeFormat("en-QA", { month: "short", year: "2-digit" }).format(date),
    ar: new Intl.DateTimeFormat("ar-QA", { month: "short", year: "numeric" }).format(date),
  };
}

const STATUS_STYLES: Record<SaleRecord["status"], string> = {
  recorded: "border-[color:color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]",
  partially_paid: "border-[color:color-mix(in_srgb,var(--warning)_24%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_8%,var(--surface))] text-[var(--warning)]",
  paid: "border-[color:color-mix(in_srgb,var(--success)_24%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_8%,var(--surface))] text-[var(--success)]",
  void: "border-[color:color-mix(in_srgb,var(--danger)_22%,var(--border))] bg-[color:color-mix(in_srgb,var(--danger)_7%,var(--surface))] text-[var(--danger)]",
};
const STATUS_LABELS: Record<SaleRecord["status"], string> = {
  recorded: "Recorded",
  partially_paid: "Partially paid",
  paid: "Paid",
  void: "Void",
};

export function SalesDashboard({ workspaceId }: { workspaceId: string | null }) {
  const now = new Date();
  const [draftFrom, setDraftFrom] = useState(() => toDayInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [draftTo, setDraftTo] = useState(() => toDayInput(now));
  const [range, setRange] = useState(() => ({ from: toDayInput(new Date(now.getFullYear(), now.getMonth(), 1)), to: toDayInput(new Date()) }));
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<SalesResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(workspaceId));
  const [error, setError] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [paymentFor, setPaymentFor] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ workspace_id: workspaceId, from: range.from, to: range.to, page: String(page) });
    api<SalesResponse>(`/api/v1/sales?${params}`, { signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setData(next);
        setError(null);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Sales could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId, range, page, reloadToken]);

  function refresh() {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }

  function applyRange(from: string, to: string) {
    setLoading(true);
    setRange({ from, to });
    setPage(1);
    setReloadToken((token) => token + 1);
  }

  function quickChip(kind: "month" | "last30" | "year") {
    const today = new Date();
    let from: Date;
    if (kind === "month") from = new Date(today.getFullYear(), today.getMonth(), 1);
    else if (kind === "last30") from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
    else from = new Date(today.getFullYear(), 0, 1);
    setDraftFrom(toDayInput(from));
    setDraftTo(toDayInput(today));
    applyRange(toDayInput(from), toDayInput(today));
  }

  async function voidSale(sale: SaleRecord) {
    if (!workspaceId) return;
    if (!window.confirm(`Void the sale for ${sale.customerName}? This keeps the record but marks it void.`)) return;
    setActionBusy(`void:${sale.id}`);
    setError(null);
    try {
      await api(`/api/v1/sales/${sale.id}`, { method: "DELETE" });
      setNotice(`Sale for ${sale.customerName} voided.`);
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The sale could not be voided.");
    } finally {
      setActionBusy(null);
    }
  }

  if (!workspaceId) {
    return (
      <div>
        <PageHeader />
        <Card className="mx-auto max-w-lg p-8 text-center">
          <h2 className="text-xl font-bold">No active workspace</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Sales tracking is tied to a workspace. Connect Supabase and create a workspace to record customer sales.</p>
        </Card>
      </div>
    );
  }

  const totals = data?.totals;
  const trend = data?.trend ?? [];
  const trendMax = Math.max(1, ...trend.flatMap((point) => [point.recorded, point.received]));
  const sales = data?.sales ?? [];
  const pageSize = data?.pageSize ?? 20;
  const pageCount = Math.max(1, Math.ceil((totals?.count ?? 0) / pageSize));

  return (
    <div>
      <PageHeader />

      <Card className="p-4 sm:p-5" aria-busy={loading}>
        <form
          onSubmit={(event) => { event.preventDefault(); applyRange(draftFrom, draftTo); }}
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <label htmlFor="sales-from" className="mb-2 block text-sm font-bold">From</label>
            <input id="sales-from" type="date" value={draftFrom} max={draftTo} onChange={(event) => setDraftFrom(event.target.value)} className="min-h-11 rounded-xl border bg-[var(--surface)] px-3 text-base" />
          </div>
          <div>
            <label htmlFor="sales-to" className="mb-2 block text-sm font-bold">To</label>
            <input id="sales-to" type="date" value={draftTo} min={draftFrom} onChange={(event) => setDraftTo(event.target.value)} className="min-h-11 rounded-xl border bg-[var(--surface)] px-3 text-base" />
          </div>
          <Button type="submit" variant="secondary" disabled={loading}>Apply</Button>
          <div className="flex flex-wrap gap-2 sm:ms-2" aria-label="Quick date ranges">
            {[["month", "This month"], ["last30", "Last 30 days"], ["year", "This year"]].map(([kind, label]) => (
              <button key={kind} type="button" onClick={() => quickChip(kind as "month" | "last30" | "year")} className={cn("min-h-10 rounded-full border px-3.5 text-sm font-semibold transition-colors", range.from === getRangeStart(kind) ? "border-[color:color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--subtle)] hover:text-[var(--foreground)]")}>{label}</button>
            ))}
          </div>
          <div className="flex gap-2 sm:ms-auto">
            {/* The report is a file download (CSV), so a plain anchor keeps the
                browser download flow instead of a client-side route load. */}
            <a
              href={`/api/v1/sales/report?workspace_id=${workspaceId}&from=${range.from}&to=${range.to}`}
              download
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] shadow-sm transition-[background-color,border-color] duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--subtle)]"
            >
              <Download aria-hidden="true" size={16} /> CSV
            </a>
            <Button type="button" onClick={() => setRecordOpen((open) => !open)} aria-expanded={recordOpen}><Plus aria-hidden="true" size={17} /> Record sale</Button>
          </div>
        </form>
      </Card>

      {error && <p role="alert" className="page-enter mt-5 rounded-xl border border-[color:color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[color:color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-4 text-sm leading-6 text-[var(--danger)]">{error}</p>}
      {notice && <p aria-live="polite" className="page-enter mt-5 rounded-xl border border-[color:color-mix(in_srgb,var(--success)_25%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_8%,var(--surface))] p-4 text-sm leading-6 text-[var(--success)]">{notice}</p>}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sales summary">
        <StatCard label="Sales recorded" value={totals ? `${formatNumber(totals.recorded)} ${totals.currency}` : "—"} icon={CircleDollarSign} loading={loading && !data} />
        <StatCard label="Payments received" value={totals ? `${formatNumber(totals.received)} ${totals.currency}` : "—"} icon={Wallet} loading={loading && !data} />
        <StatCard label="Outstanding" value={totals ? `${formatNumber(totals.outstanding)} ${totals.currency}` : "—"} icon={HandCoins} tone={totals && totals.outstanding > 0 ? "warning" : "default"} detail={totals && totals.outstanding > 0 ? "Awaiting customer payment" : "Fully collected"} loading={loading && !data} />
        <StatCard label="Documents processed" value={data ? formatNumber(data.processing.documents) : "—"} detail={data ? `${formatNumber(data.processing.jobsCompleted)} translation jobs completed` : undefined} icon={FileStack} loading={loading && !data} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-5 sm:p-6" aria-busy={loading}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-bold"><TrendingUp aria-hidden="true" size={17} className="text-[var(--accent)]" /> Monthly trend</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Recorded sales vs received payments · المبيعات والمقبوضات</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold text-[var(--muted)]">
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-[var(--accent)]" /> Recorded · المسجل</span>
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-[var(--success)]" /> Received · المستلم</span>
              </div>
            </div>
            {loading && !data ? (
              <div className="mt-6 space-y-6" aria-hidden="true">
                {[0, 1, 2, 3].map((index) => <div key={index} className="space-y-2"><div className="h-3 w-20 animate-pulse rounded bg-[var(--subtle)]" /><div className="h-6 w-full animate-pulse rounded-lg bg-[var(--subtle)]" /><div className="h-6 w-2/3 animate-pulse rounded-lg bg-[var(--subtle)]" /></div>)}
              </div>
            ) : trend.length ? (
              <div className="mt-6 space-y-5">
                {trend.map((point) => {
                  const label = formatPeriodLabel(point.period);
                  return (
                    <div key={point.period}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-xs font-bold tabular-nums">{label.en} <span className="font-semibold text-[var(--muted)]" dir="rtl">{label.ar}</span></p>
                        <p className="text-xs font-semibold tabular-nums text-[var(--muted)]">{formatNumber(point.recorded)} / {formatNumber(point.received)}</p>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        <div className="h-5 w-full overflow-hidden rounded-lg bg-[var(--subtle)]"><div className="h-full rounded-lg bg-[var(--accent)] transition-[width] duration-500" style={{ width: `${Math.max(point.recorded > 0 ? 2 : 0, Math.round((point.recorded / trendMax) * 100))}%` }} /></div>
                        <div className="h-5 w-full overflow-hidden rounded-lg bg-[var(--subtle)]"><div className="h-full rounded-lg bg-[var(--success)] transition-[width] duration-500" style={{ width: `${Math.max(point.received > 0 ? 2 : 0, Math.round((point.received / trendMax) * 100))}%` }} /></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-[var(--muted)]">No activity in the selected range yet.</p>
            )}
          </Card>

          <Card className="overflow-hidden" aria-busy={loading}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-5 sm:px-6">
              <div><h2 className="font-bold">Sales records</h2><p className="mt-1 text-sm text-[var(--muted)]">{totals ? `${formatNumber(totals.count)} sales in range` : "Customer sales in the selected range"}</p></div>
            </div>
            {loading && !data ? (
              <div className="divide-y" aria-hidden="true">
                {[0, 1, 2, 3].map((index) => <div key={index} className="px-5 py-4 sm:px-6"><div className="h-4 w-full max-w-md animate-pulse rounded bg-[var(--subtle)]" /><div className="mt-2 h-3 w-40 animate-pulse rounded bg-[var(--subtle)]" /></div>)}
              </div>
            ) : sales.length ? (
              <div className="divide-y">
                {sales.map((sale) => (
                  <div key={sale.id}>
                    <div className="grid min-h-16 gap-3 px-5 py-4 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-center sm:px-6">
                      <div className="flex items-center gap-2 text-sm tabular-nums text-[var(--muted)]"><CalendarDays aria-hidden="true" size={15} className="shrink-0" /> {formatDate(sale.saleDate)}</div>
                      <div className="min-w-0">
                        <p className={cn("truncate font-semibold", sale.status === "void" && "line-through opacity-70")}>{sale.customerName}</p>
                        {sale.description && <p className="mt-0.5 truncate text-sm text-[var(--muted)]" title={sale.description}>{sale.description}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
                        <p className="font-bold tabular-nums">{formatNumber(sale.amount)} <span className="text-xs font-semibold text-[var(--muted)]">{sale.currency}</span></p>
                        <Badge className={STATUS_STYLES[sale.status]}>{STATUS_LABELS[sale.status]}</Badge>
                        <div className="hidden text-end text-xs leading-4 sm:block">
                          <p className="font-bold tabular-nums text-[var(--success)]">{formatNumber(sale.amountPaid)} received</p>
                          <p className={cn("tabular-nums", sale.outstanding > 0 ? "font-bold text-[var(--warning)]" : "text-[var(--muted)]")}>{formatNumber(sale.outstanding)} outstanding</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button type="button" size="sm" variant="secondary" disabled={sale.status === "void" || sale.outstanding <= 0} onClick={() => { setPaymentFor((current) => current === sale.id ? null : sale.id); setNotice(null); }}><HandCoins aria-hidden="true" size={15} /> Payment</Button>
                          <Button type="button" size="sm" variant="ghost" className="text-[var(--danger)] hover:bg-[color:color-mix(in_srgb,var(--danger)_8%,var(--surface))]" disabled={sale.status === "void" || actionBusy === `void:${sale.id}`} onClick={() => voidSale(sale)}>{actionBusy === `void:${sale.id}` ? <LoaderCircle aria-hidden="true" className="animate-spin" size={15} /> : <Ban aria-hidden="true" size={15} />} Void</Button>
                        </div>
                      </div>
                      <div className="flex gap-4 text-xs sm:hidden">
                        <p className="font-bold tabular-nums text-[var(--success)]">{formatNumber(sale.amountPaid)} received</p>
                        <p className={cn("tabular-nums", sale.outstanding > 0 ? "font-bold text-[var(--warning)]" : "text-[var(--muted)]")}>{formatNumber(sale.outstanding)} outstanding</p>
                      </div>
                    </div>
                    {paymentFor === sale.id && (
                      <PaymentForm
                        sale={sale}
                        busy={actionBusy === `pay:${sale.id}`}
                        onCancel={() => setPaymentFor(null)}
                        onSubmit={async (amount, method, paidOn, reference) => {
                          setActionBusy(`pay:${sale.id}`);
                          setError(null);
                          try {
                            await api(`/api/v1/sales/${sale.id}/payments`, { method: "POST", body: JSON.stringify({ amount, method, paidOn, reference: reference || undefined }) });
                            setPaymentFor(null);
                            setNotice(`Payment recorded for ${sale.customerName}.`);
                            refresh();
                          } catch (reason) {
                            setError(reason instanceof Error ? reason.message : "The payment could not be recorded.");
                          } finally {
                            setActionBusy(null);
                          }
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-16 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl border bg-[var(--surface-muted)] text-[var(--muted)] shadow-sm"><ReceiptText aria-hidden="true" size={23} /></span>
                <h3 className="mt-5 font-bold">No sales recorded yet</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]"><span dir="rtl">لا توجد مبيعات مسجلة بعد</span> — record your first customer sale with “Record sale”.</p>
              </div>
            )}
            {data && totals && pageCount > 1 && (
              <div className="flex items-center justify-between gap-3 border-t px-5 py-4 sm:px-6">
                <p className="text-xs font-semibold text-[var(--muted)]">Page {page} of {pageCount}</p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="secondary" disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage((current) => Math.max(1, current - 1)); }}>Previous</Button>
                  <Button type="button" size="sm" variant="secondary" disabled={page >= pageCount || loading} onClick={() => { setLoading(true); setPage((current) => current + 1); }}>Next</Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start" aria-label="Record a sale">
          <RecordSaleCard
            key={recordOpen ? "record-open" : "record-closed"}
            open={recordOpen}
            busy={actionBusy === "sale"}
            defaultDate={range.to}
            onOpen={() => setRecordOpen(true)}
            onCancel={() => setRecordOpen(false)}
            onSubmit={async (form) => {
              setActionBusy("sale");
              setError(null);
              try {
                await api("/api/v1/sales", { method: "POST", body: JSON.stringify({ workspaceId, customerName: form.customerName, description: form.description || undefined, amount: form.amount, currency: form.currency, saleDate: form.saleDate }) });
                setRecordOpen(false);
                setNotice(`Sale recorded for ${form.customerName}.`);
                setPage(1);
                refresh();
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "The sale could not be recorded.");
              } finally {
                setActionBusy(null);
              }
            }}
          />
          <Card className="p-5">
            <h2 className="text-sm font-bold">Why track sales here?</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Customer translation revenue stays separate from your SaaS subscription. Amounts are per currency; outstanding totals update automatically as payments land.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-semibold text-[var(--accent)]">Customer billing</p>
      <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Sales &amp; payments</h1>
      <p className="mt-3 leading-7 text-[var(--muted)]">Record what you charge customers for translation work, track collections, and export the ledger. <span dir="rtl">سجل مبيعاتك ومقبوضاتك.</span></p>
    </div>
  );
}

function StatCard({ label, value, detail, icon: Icon, tone = "default", loading }: { label: string; value: string; detail?: string; icon: typeof Wallet; tone?: "default" | "warning"; loading?: boolean }) {
  const toneClass = tone === "warning" ? "text-[var(--warning)] bg-[color:color-mix(in_srgb,var(--warning)_12%,var(--surface))]" : "text-[var(--accent)] bg-[var(--accent-soft)]";
  return (
    <Card className="interactive-surface min-h-36 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">{label}</p>
          <p className={cn("mt-2 text-2xl font-bold tabular-nums tracking-[-0.03em]", loading && "animate-pulse")}>{value}</p>
        </div>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", toneClass)}><Icon aria-hidden="true" size={19} /></span>
      </div>
      {detail && <p className="mt-4 text-xs leading-5 text-[var(--muted)]">{detail}</p>}
    </Card>
  );
}

function PaymentForm({ sale, busy, onSubmit, onCancel }: { sale: SaleRecord; busy: boolean; onSubmit: (amount: number, method: string, paidOn: string, reference: string) => Promise<void>; onCancel: () => void }) {
  const [amount, setAmount] = useState(String(sale.outstanding));
  const [method, setMethod] = useState<string>("cash");
  const [paidOn, setPaidOn] = useState(() => toDayInput(new Date()));
  const [reference, setReference] = useState("");
  return (
    <form
      onSubmit={async (event) => { event.preventDefault(); await onSubmit(Math.max(0.01, Number(amount)), method, paidOn, reference.trim()); }}
      className="grid gap-3 border-t bg-[var(--surface-muted)] px-5 py-5 sm:grid-cols-2 sm:px-6"
      aria-label={`Record payment for ${sale.customerName}`}
    >
      <div>
        <label htmlFor="payment-amount" className="mb-2 block text-sm font-bold">Amount ({sale.currency})</label>
        <input id="payment-amount" type="number" min="0.01" step="0.01" max={sale.outstanding} required value={amount} onChange={(event) => setAmount(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base" />
      </div>
      <div>
        <label htmlFor="payment-method" className="mb-2 block text-sm font-bold">Method</label>
        <select id="payment-method" value={method} onChange={(event) => setMethod(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base">
          {PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="payment-date" className="mb-2 block text-sm font-bold">Paid on</label>
        <input id="payment-date" type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base" />
      </div>
      <div>
        <label htmlFor="payment-reference" className="mb-2 block text-sm font-bold">Reference <span className="font-normal text-[var(--muted)]">(optional)</span></label>
        <input id="payment-reference" value={reference} onChange={(event) => setReference(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base" placeholder="Cheque no., transfer ref…" />
      </div>
      <div className="flex gap-2 sm:col-span-2 sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}><X aria-hidden="true" size={15} /> Cancel</Button>
        <Button type="submit" disabled={busy}>{busy && <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />} Record payment</Button>
      </div>
    </form>
  );
}

function RecordSaleCard({ open, busy, defaultDate, onOpen, onCancel, onSubmit }: { open: boolean; busy: boolean; defaultDate: string; onOpen: () => void; onCancel: () => void; onSubmit: (form: { customerName: string; description: string; amount: number; currency: string; saleDate: string }) => Promise<void> }) {
  const [customerName, setCustomerName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>("QAR");
  const [saleDate, setSaleDate] = useState(defaultDate);
  if (!open) {
    return (
      <Card className="p-5">
        <span className="grid size-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><ReceiptText aria-hidden="true" size={20} /></span>
        <h2 className="mt-4 font-bold">Record a sale</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Log customer translation revenue, then collect payments against it. <span dir="rtl">سجّل عملية بيع جديدة.</span></p>
        <Button type="button" variant="secondary" className="mt-4 w-full" onClick={onOpen}><Plus aria-hidden="true" size={16} /> New sale</Button>
      </Card>
    );
  }
  return (
    <Card className="page-enter p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><ReceiptText aria-hidden="true" size={20} /></span>
          <h2 className="font-bold">Record a sale</h2>
        </div>
        <button type="button" onClick={onCancel} className="grid size-11 place-items-center rounded-xl text-[var(--muted)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--foreground)]" aria-label="Close record sale form"><X aria-hidden="true" size={18} /></button>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await onSubmit({ customerName: customerName.trim(), description: description.trim(), amount: Math.max(0.01, Number(amount)), currency, saleDate });
        }}
        className="mt-5 space-y-4"
      >
        <div>
          <label htmlFor="sale-customer" className="mb-2 block text-sm font-bold">Customer name</label>
          <input id="sale-customer" required minLength={1} maxLength={160} value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base" placeholder="Gulf Contracting Co." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sale-amount" className="mb-2 block text-sm font-bold">Amount</label>
            <input id="sale-amount" type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base" placeholder="1200" />
          </div>
          <div>
            <label htmlFor="sale-currency" className="mb-2 block text-sm font-bold">Currency</label>
            <select id="sale-currency" value={currency} onChange={(event) => setCurrency(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base">
              {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="sale-date" className="mb-2 block text-sm font-bold">Sale date</label>
          <input id="sale-date" type="date" required value={saleDate} onChange={(event) => setSaleDate(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base" />
        </div>
        <div>
          <label htmlFor="sale-description" className="mb-2 block text-sm font-bold">Description <span className="font-normal text-[var(--muted)]">(optional)</span></label>
          <textarea id="sale-description" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-20 w-full rounded-xl border bg-[var(--surface)] p-3 text-base" placeholder="Contract translation, 42 pages" />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>{busy && <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />} Save sale</Button>
      </form>
    </Card>
  );
}

function getRangeStart(kind: string) {
  const today = new Date();
  if (kind === "month") return toDayInput(new Date(today.getFullYear(), today.getMonth(), 1));
  if (kind === "last30") return toDayInput(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29));
  return toDayInput(new Date(today.getFullYear(), 0, 1));
}
