"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Building2,
  CheckCircle2,
  Coins,
  CreditCard,
  Gauge,
  HandCoins,
  History,
  Landmark,
  LoaderCircle,
  ReceiptText,
  Search,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sk, SkCard } from "@/components/skeletons";
import { cn, formatNumber } from "@/lib/utils";
import type { PlanSummary } from "@/types/domain";

type Tab = "overview" | "users" | "workspaces" | "payments" | "activity";
const TABS: Array<{ id: Tab; label: string; icon: typeof Gauge }> = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "users", label: "Users & credits", icon: UsersRound },
  { id: "workspaces", label: "Workspaces", icon: Building2 },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "activity", label: "Activity", icon: History },
];

interface AdminOverview {
  workspaces: number;
  activeSubscriptions: Record<string, number>;
  mrr: number;
  currency: string;
  jobsCompleted: number;
  jobsFailed: number;
  salesVolume: number;
  lastFailures: Array<{ jobId: string; error: string; at: string }>;
}

interface WorkspaceItem {
  id: string;
  name: string;
  kind: string;
  ownerEmail: string | null;
  planCode: string;
  subscriptionStatus: string;
  creditsBalance: number;
  membersCount: number;
  documentsCount: number;
}

interface WorkspacesResponse { items: WorkspaceItem[]; total: number; page: number; pageSize: number }
interface PaymentItem { id: string; kind: string; amount: number; currency: string; description?: string | null; planCode?: string | null; workspaceName: string; createdAt: string }
interface PaymentsResponse { items: PaymentItem[]; events: number }
interface AuditItem { id: string; action: string; targetType: string; actorEmail: string | null; createdAt: string }
interface AuditResponse { items: AuditItem[]; total?: number; page?: number; pageSize?: number }

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
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-QA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

const STATEMENT_KINDS: Record<string, { label: string; className: string }> = {
  subscription_payment: { label: "Subscription payment", className: "border-[color:color-mix(in_srgb,var(--success)_24%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_8%,var(--surface))] text-[var(--success)]" },
  plan_change: { label: "Plan change", className: "border-[color:color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]" },
  plan_allowance: { label: "Plan allowance", className: "border-[color:color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]" },
  manual: { label: "Manual adjustment", className: "border-[color:color-mix(in_srgb,var(--warning)_24%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_8%,var(--surface))] text-[var(--warning)]" },
};

const SUBSCRIPTION_STATUS_STYLES: Record<string, string> = {
  active: "border-[color:color-mix(in_srgb,var(--success)_24%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_8%,var(--surface))] text-[var(--success)]",
  trialing: "border-[color:color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]",
  past_due: "border-[color:color-mix(in_srgb,var(--danger)_22%,var(--border))] bg-[color:color-mix(in_srgb,var(--danger)_7%,var(--surface))] text-[var(--danger)]",
  canceled: "border-[color:color-mix(in_srgb,var(--muted)_22%,var(--border))] bg-[var(--subtle)] text-[var(--muted)]",
};

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="rounded-xl border border-[color:color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[color:color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-4 text-sm leading-6 text-[var(--danger)]">{children}</p>;
}

function Pager({ page, pageCount, onPage, disabled }: { page: number; pageCount: number; onPage: (next: number) => void; disabled?: boolean }) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t px-5 py-4 sm:px-6">
      <p className="text-xs font-semibold text-[var(--muted)]">Page {page} of {pageCount}</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={page <= 1 || disabled} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button type="button" size="sm" variant="secondary" disabled={page >= pageCount || disabled} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

export function AdminConsole() {
  const [tab, setTab] = useState<Tab>("overview");
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);

  useEffect(() => {
    let active = true;
    api<PlanSummary[]>("/api/v1/plans").then((data) => { if (active) setPlans(data); }).catch(() => { /* plan filters fall back to free-text */ });
    return () => { active = false; };
  }, []);

  return (
    <div>
      <div className="max-w-3xl">
        <p className="text-sm font-semibold text-[var(--accent)]">Internal administration</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Platform console</h1>
        <p className="mt-3 leading-7 text-[var(--muted)]">Monitor the platform, issue audited credit grants, and manage workspace plans. <span dir="rtl">لوحة تحكم المنصة.</span></p>
      </div>

      <div role="tablist" aria-label="Administration sections" className="mt-8 flex flex-wrap gap-2 rounded-2xl border bg-[var(--surface)] p-1.5 shadow-sm">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`admin-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`admin-panel-${id}`}
            onClick={() => setTab(id)}
            className={cn("inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors", tab === id ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--muted)] hover:bg-[var(--subtle)] hover:text-[var(--foreground)]")}
          >
            <Icon aria-hidden="true" size={16} strokeWidth={1.9} /> {label}
          </button>
        ))}
      </div>

      <div id={`admin-panel-${tab}`} role="tabpanel" aria-labelledby={`admin-tab-${tab}`} className="mt-6">
        {tab === "overview" && <OverviewPanel />}
        {tab === "users" && <UsersCreditPanel />}
        {tab === "workspaces" && <WorkspacesPanel plans={plans} />}
        {tab === "payments" && <PaymentsPanel />}
        {tab === "activity" && <ActivityPanel />}
      </div>
    </div>
  );
}

function OverviewPanel() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api<AdminOverview>("/api/v1/admin/overview", { signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setData(next);
        setError(null);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Overview could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadToken]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (loading && !data) {
    return (
      <div aria-busy="true">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((index) => <SkCard key={index} className="min-h-36"><Sk className="h-4 w-28" /><Sk className="mt-4 h-8 w-24" /><Sk className="mt-5 h-3 w-32" /></SkCard>)}</div>
        <div className="mt-6 grid gap-6 xl:grid-cols-2"><SkCard className="min-h-56" /><SkCard className="min-h-56" /></div>
      </div>
    );
  }
  if (!data) return null;

  const planRows = Object.entries(data.activeSubscriptions).sort(([, a], [, b]) => b - a);
  return (
    <div aria-busy={loading}>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Platform summary">
        <Metric label="Workspaces" value={formatNumber(data.workspaces)} icon={Building2} />
        <Metric label="MRR" value={`${formatNumber(data.mrr)} ${data.currency}`} icon={TrendingUp} />
        <Metric label="Jobs completed" value={formatNumber(data.jobsCompleted)} detail={`${formatNumber(data.jobsFailed)} failed`} icon={data.jobsFailed > 0 ? TriangleAlert : CheckCircle2} tone={data.jobsFailed > 0 ? "warning" : "success"} />
        <Metric label="Sales volume" value={`${formatNumber(data.salesVolume)} ${data.currency}`} detail="Customer sales across workspaces" icon={HandCoins} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b px-5 py-5 sm:px-6"><h2 className="font-bold">Active subscriptions by plan</h2><p className="mt-1 text-sm text-[var(--muted)]">Workspaces currently subscribed per plan</p></div>
          {planRows.length ? (
            <div className="divide-y">
              {planRows.map(([planCode, count]) => (
                <div key={planCode} className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
                  <p className="text-sm font-semibold capitalize">{planCode.replaceAll("_", " ")}</p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(count)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-6 py-10 text-center text-sm text-[var(--muted)]">No active subscriptions yet.</p>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b px-5 py-5 sm:px-6"><h2 className="flex items-center gap-2 font-bold"><TriangleAlert aria-hidden="true" size={16} className="text-[var(--warning)]" /> Recent failures</h2><p className="mt-1 text-sm text-[var(--muted)]">Latest translation job errors</p></div>
          {data.lastFailures.length ? (
            <ul className="divide-y">
              {data.lastFailures.map((failure) => (
                <li key={failure.jobId} className="px-5 py-3.5 sm:px-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-mono text-xs font-semibold">{failure.jobId}</p>
                    <p className="shrink-0 text-xs tabular-nums text-[var(--muted)]">{formatDate(failure.at)}</p>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{failure.error}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 py-10 text-center text-sm text-[var(--muted)]">No recent job failures.</p>
          )}
        </Card>
      </div>
      <div className="mt-6">
        <Button type="button" variant="secondary" onClick={() => { setLoading(true); setReloadToken((token) => token + 1); }} disabled={loading}>{loading && <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />} Refresh</Button>
      </div>
    </div>
  );
}

interface UserResult { id: string; email: string; displayName: string; personalWorkspaceId?: string; balance?: number }

function UsersCreditPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<UserResult | null>(null);
  const [amount, setAmount] = useState("1000");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"search" | "grant" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy("search");
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/users?q=${encodeURIComponent(query)}`);
      const payload = await response.json();
      if (!response.ok) setError(payload.error?.message ?? "Search failed.");
      else setResults(payload.data);
    } catch {
      setError("Search failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function grant(event: React.FormEvent) {
    event.preventDefault();
    if (!selected?.personalWorkspaceId) return;
    if (!window.confirm(`Grant ${Number(amount).toLocaleString()} word credits to ${selected.email}?`)) return;
    setBusy("grant");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/admin/credits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: selected.personalWorkspaceId, amount: Number(amount), reason }) });
      const payload = await response.json();
      if (!response.ok) setError(payload.error?.message ?? "Grant failed.");
      else { setMessage(`Granted ${Number(amount).toLocaleString()} credits. Ledger entry ${payload.data.ledgerId}.`); setReason(""); setResults((current) => current.map((user) => user.id === selected.id ? { ...user, balance: (user.balance ?? 0) + Number(amount) } : user)); setSelected((current) => current ? { ...current, balance: (current.balance ?? 0) + Number(amount) } : current); }
    } catch {
      setError("Grant failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <Card className="overflow-hidden">
        <form onSubmit={search} className="flex gap-3 border-b p-5">
          <div className="relative flex-1">
            <label htmlFor="user-search" className="sr-only">Search users</label>
            <Search aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={17} />
            <input id="user-search" required value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] ps-10 pe-3 text-base" placeholder="Email or display name" />
          </div>
          <Button type="submit" variant="secondary" disabled={busy === "search"}>{busy === "search" && <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />} Search</Button>
        </form>
        {results.length ? (
          <div className="divide-y">
            {results.map((user) => (
              <button key={user.id} type="button" onClick={() => setSelected(user)} className={cn("flex min-h-18 w-full items-center gap-3 px-5 text-start transition-colors hover:bg-[var(--subtle)]", selected?.id === user.id && "bg-[var(--accent-soft)]")}>
                <span className="grid size-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><ShieldCheck aria-hidden="true" size={18} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{user.displayName || user.email}</span><span className="block truncate text-sm text-[var(--muted)]">{user.email}</span></span>
                <span className="text-sm font-bold tabular-nums">{Number(user.balance ?? 0).toLocaleString()}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-14 text-center text-sm text-[var(--muted)]">Search for a user to inspect their personal beta account.</div>
        )}
      </Card>
      <Card className="p-6">
        <span className="grid size-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Coins aria-hidden="true" size={20} /></span>
        <h2 className="mt-5 font-bold">Issue manual grant</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{selected ? `Selected: ${selected.email}` : "Select an account from the search results."}</p>
        <form onSubmit={grant} className="mt-5 space-y-4">
          <div>
            <label htmlFor="grant-amount" className="mb-2 block text-sm font-bold">Word credits</label>
            <input id="grant-amount" type="number" min="1" max="1000000" required value={amount} onChange={(event) => setAmount(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base" />
          </div>
          <div>
            <label htmlFor="grant-reason" className="mb-2 block text-sm font-bold">Reason</label>
            <textarea id="grant-reason" required minLength={8} value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-28 w-full rounded-xl border bg-[var(--surface)] p-3 text-base" placeholder="Beta research participant extension" />
          </div>
          <Button type="submit" className="w-full" disabled={!selected?.personalWorkspaceId || busy === "grant"}>{busy === "grant" && <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />} Grant credits</Button>
        </form>
        {message && <p aria-live="polite" className="mt-4 text-sm leading-6 text-[var(--success)]">{message}</p>}
        {error && <p role="alert" className="mt-4 text-sm leading-6 text-[var(--danger)]">{error}</p>}
      </Card>
    </div>
  );
}

function WorkspacesPanel({ plans }: { plans: PlanSummary[] | null }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<WorkspacesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [planDrafts, setPlanDrafts] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    if (debounced) params.set("q", debounced);
    if (planFilter) params.set("plan", planFilter);
    if (statusFilter) params.set("status", statusFilter);
    api<WorkspacesResponse>(`/api/v1/admin/workspaces?${params}`, { signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setData(next);
        setError(null);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Workspaces could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debounced, planFilter, statusFilter, page, reloadToken]);

  function refresh() {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }

  async function setPlan(workspace: WorkspaceItem, planCode: string) {
    const planName = plans?.find((plan) => plan.code === planCode)?.name ?? planCode;
    if (!window.confirm(`Set ${workspace.name} to the ${planName} plan for the next 30 days? The word allowance is granted immediately.`)) return;
    setApplying(workspace.id);
    setError(null);
    setNotice(null);
    try {
      await api("/api/v1/admin/workspaces/plan", { method: "POST", body: JSON.stringify({ workspaceId: workspace.id, planCode, periodDays: 30 }) });
      setNotice(`${workspace.name} moved to ${planName}.`);
      setPlanDrafts((current) => { const next = { ...current }; delete next[workspace.id]; return next; });
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The plan could not be set.");
    } finally {
      setApplying(null);
    }
  }

  const items = data?.items ?? [];
  const pageSize = data?.pageSize ?? 20;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  const searching = query.trim() !== debounced;

  return (
    <div aria-busy={loading || searching}>
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label htmlFor="workspace-search" className="mb-2 block text-sm font-bold">Search</label>
            <div className="relative">
              <Search aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
              <input id="workspace-search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] ps-10 pe-3 text-base" placeholder="Workspace or owner email" />
            </div>
          </div>
          <div>
            <label htmlFor="workspace-plan-filter" className="mb-2 block text-sm font-bold">Plan</label>
            <select id="workspace-plan-filter" value={planFilter} onChange={(event) => { setLoading(true); setPlanFilter(event.target.value); setPage(1); }} className="min-h-11 rounded-xl border bg-[var(--surface)] px-3 text-base">
              <option value="">All plans</option>
              {(plans ?? []).map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="workspace-status-filter" className="mb-2 block text-sm font-bold">Status</label>
            <select id="workspace-status-filter" value={statusFilter} onChange={(event) => { setLoading(true); setStatusFilter(event.target.value); setPage(1); }} className="min-h-11 rounded-xl border bg-[var(--surface)] px-3 text-base">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="trialing">Trial</option>
              <option value="past_due">Past due</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
          <Button type="button" variant="secondary" onClick={refresh} disabled={loading}>{(loading || searching) && <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />} Refresh</Button>
        </div>
      </Card>

      {error && <div className="mt-5"><ErrorText>{error}</ErrorText></div>}
      {notice && <p aria-live="polite" className="mt-5 rounded-xl border border-[color:color-mix(in_srgb,var(--success)_25%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_8%,var(--surface))] p-4 text-sm leading-6 text-[var(--success)]">{notice}</p>}

      <Card className="mt-5 overflow-hidden">
        {loading && !data ? (
          <div className="divide-y" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((index) => <div key={index} className="px-5 py-4 sm:px-6"><div className="h-4 w-full max-w-lg animate-pulse rounded bg-[var(--subtle)]" /><div className="mt-2 h-3 w-40 animate-pulse rounded bg-[var(--subtle)]" /></div>)}
          </div>
        ) : items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b text-start text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
                  <th scope="col" className="px-5 py-3.5 text-start sm:px-6">Workspace</th>
                  <th scope="col" className="px-4 py-3.5 text-start">Owner</th>
                  <th scope="col" className="px-4 py-3.5 text-start">Kind</th>
                  <th scope="col" className="px-4 py-3.5 text-start">Plan</th>
                  <th scope="col" className="px-4 py-3.5 text-start">Status</th>
                  <th scope="col" className="px-4 py-3.5 text-end">Credits</th>
                  <th scope="col" className="px-4 py-3.5 text-end">Members</th>
                  <th scope="col" className="px-4 py-3.5 text-end">Docs</th>
                  <th scope="col" className="px-5 py-3.5 text-end sm:px-6">Set plan</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((workspace) => (
                  <tr key={workspace.id} className="align-middle">
                    <td className="max-w-56 truncate px-5 py-3.5 font-semibold sm:px-6" title={workspace.name}>{workspace.name}</td>
                    <td className="max-w-52 truncate px-4 py-3.5 text-[var(--muted)]" title={workspace.ownerEmail ?? undefined}>{workspace.ownerEmail ?? "—"}</td>
                    <td className="px-4 py-3.5 capitalize text-[var(--muted)]">{workspace.kind}</td>
                    <td className="px-4 py-3.5"><Badge className="border-[color:color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]">{workspace.planCode}</Badge></td>
                    <td className="px-4 py-3.5"><Badge className={SUBSCRIPTION_STATUS_STYLES[workspace.subscriptionStatus] ?? ""}><span className="capitalize">{workspace.subscriptionStatus.replaceAll("_", " ") || "—"}</span></Badge></td>
                    <td className="px-4 py-3.5 text-end font-bold tabular-nums">{formatNumber(workspace.creditsBalance)}</td>
                    <td className="px-4 py-3.5 text-end tabular-nums text-[var(--muted)]">{formatNumber(workspace.membersCount)}</td>
                    <td className="px-4 py-3.5 text-end tabular-nums text-[var(--muted)]">{formatNumber(workspace.documentsCount)}</td>
                    <td className="px-5 py-3.5 sm:px-6">
                      <div className="flex items-center justify-end gap-2">
                        <label className="sr-only" htmlFor={`set-plan-${workspace.id}`}>Plan for {workspace.name}</label>
                        <select id={`set-plan-${workspace.id}`} value={planDrafts[workspace.id] ?? ""} onChange={(event) => setPlanDrafts((current) => ({ ...current, [workspace.id]: event.target.value }))} className="min-h-10 rounded-xl border bg-[var(--surface)] px-2 text-sm" disabled={applying === workspace.id}>
                          <option value="">Plan…</option>
                          {(plans ?? []).map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}
                        </select>
                        <Button type="button" size="sm" variant="secondary" disabled={!planDrafts[workspace.id] || applying === workspace.id} onClick={() => void setPlan(workspace, planDrafts[workspace.id])}>
                          {applying === workspace.id && <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />} Apply
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl border bg-[var(--surface-muted)] text-[var(--muted)] shadow-sm"><Building2 aria-hidden="true" size={23} /></span>
            <h3 className="mt-5 font-bold">No workspaces found</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Adjust the search or filters to see more results.</p>
          </div>
        )}
        {data && <Pager page={data.page} pageCount={pageCount} onPage={setPage} disabled={loading} />}
      </Card>
      {data && <p className="mt-3 text-xs text-[var(--muted)]">{formatNumber(data.total)} workspaces total</p>}
    </div>
  );
}

function PaymentsPanel() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<PaymentsResponse>(`/api/v1/admin/payments?page=${page}`, { signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setData(next);
        setError(null);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Payments could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page]);

  const items = data?.items ?? [];
  // The payments endpoint does not return a total; assume a full page means
  // more rows exist so Next stays available until an empty/short page loads.
  const pageSize = 20;
  const pageCount = items.length < pageSize ? page : page + 1;

  if (error && !data) return <ErrorText>{error}</ErrorText>;
  return (
    <div aria-busy={loading}>
      {error && <ErrorText>{error}</ErrorText>}
      <Card className="mb-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--muted)]">Provider events processed</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{data ? formatNumber(data.events) : "…"}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Idempotent subscription webhooks handled</p>
          </div>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Landmark aria-hidden="true" size={19} /></span>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b px-5 py-5 sm:px-6"><h2 className="flex items-center gap-2 font-bold"><ReceiptText aria-hidden="true" size={17} className="text-[var(--accent)]" /> Billing statements</h2><p className="mt-1 text-sm text-[var(--muted)]">Platform-wide statements across workspaces</p></div>
        {loading && !data ? (
          <div className="divide-y" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => <div key={index} className="px-5 py-4 sm:px-6"><div className="h-4 w-full max-w-md animate-pulse rounded bg-[var(--subtle)]" /><div className="mt-2 h-3 w-32 animate-pulse rounded bg-[var(--subtle)]" /></div>)}
          </div>
        ) : items.length ? (
          <div className="divide-y">
            {items.map((statement) => {
              const kind = STATEMENT_KINDS[statement.kind] ?? { label: statement.kind.replaceAll("_", " "), className: "" };
              return (
                <div key={statement.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-6">
                  <p className="w-40 shrink-0 text-sm tabular-nums text-[var(--muted)]">{formatDate(statement.createdAt)}</p>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{statement.workspaceName}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{statement.description || kind.label}{statement.planCode ? ` · ${statement.planCode}` : ""}</p>
                  </div>
                  <Badge className={kind.className || undefined}>{kind.label}</Badge>
                  <p className="w-28 text-end text-sm font-bold tabular-nums">{formatNumber(statement.amount)} <span className="text-xs font-semibold text-[var(--muted)]">{statement.currency}</span></p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl border bg-[var(--surface-muted)] text-[var(--muted)] shadow-sm"><ReceiptText aria-hidden="true" size={23} /></span>
            <h3 className="mt-5 font-bold">No statements yet</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Statements appear once plans are activated or payments arrive.</p>
          </div>
        )}
        {data && data.items.length > 0 && <Pager page={page} pageCount={pageCount} onPage={setPage} disabled={loading || Boolean(error)} />}
      </Card>
    </div>
  );
}

function ActivityPanel() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<AuditResponse>(`/api/v1/admin/audit?page=${page}`, { signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setData(next);
        setError(null);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The audit log could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page]);

  const items = data?.items ?? [];
  const pageSize = data?.pageSize ?? 20;
  const total = data?.total;
  const pageCount = total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : (items.length < pageSize ? page : page + 1);

  if (error && !data) return <ErrorText>{error}</ErrorText>;
  return (
    <div aria-busy={loading}>
      {error && <ErrorText>{error}</ErrorText>}
      <Card className="overflow-hidden">
        <div className="border-b px-5 py-5 sm:px-6"><h2 className="flex items-center gap-2 font-bold"><Activity aria-hidden="true" size={17} className="text-[var(--accent)]" /> Audit log</h2><p className="mt-1 text-sm text-[var(--muted)]">Administrative actions in chronological order</p></div>
        {loading && !data ? (
          <div className="divide-y" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => <div key={index} className="px-5 py-4 sm:px-6"><div className="h-4 w-full max-w-sm animate-pulse rounded bg-[var(--subtle)]" /><div className="mt-2 h-3 w-48 animate-pulse rounded bg-[var(--subtle)]" /></div>)}
          </div>
        ) : items.length ? (
          <div className="divide-y">
            {items.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-6">
                <p className="w-44 shrink-0 text-sm tabular-nums text-[var(--muted)]">{formatDate(entry.createdAt)}</p>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={entry.action}>{entry.action}</p>
                <Badge className="border-[color:color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]">{entry.targetType}</Badge>
                <p className="w-52 shrink-0 truncate text-sm text-[var(--muted)]" title={entry.actorEmail ?? undefined}>{entry.actorEmail ?? "system"}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl border bg-[var(--surface-muted)] text-[var(--muted)] shadow-sm"><Activity aria-hidden="true" size={23} /></span>
            <h3 className="mt-5 font-bold">No activity yet</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Administrative actions will appear here.</p>
          </div>
        )}
        {data && data.items.length > 0 && <Pager page={page} pageCount={pageCount} onPage={setPage} disabled={loading || Boolean(error)} />}
      </Card>
    </div>
  );
}

function Metric({ label, value, detail, icon: Icon, tone = "default" }: { label: string; value: string; detail?: string; icon: typeof Building2; tone?: "default" | "success" | "warning" }) {
  const toneClass = tone === "success" ? "text-[var(--success)] bg-[color:color-mix(in_srgb,var(--success)_12%,var(--surface))]" : tone === "warning" ? "text-[var(--warning)] bg-[color:color-mix(in_srgb,var(--warning)_12%,var(--surface))]" : "text-[var(--accent)] bg-[var(--accent-soft)]";
  return (
    <Card className="interactive-surface min-h-36 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-[-0.03em]">{value}</p>
        </div>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", toneClass)}><Icon aria-hidden="true" size={19} /></span>
      </div>
      {detail && <p className="mt-4 text-xs leading-5 text-[var(--muted)]">{detail}</p>}
    </Card>
  );
}
