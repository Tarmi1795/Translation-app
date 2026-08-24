import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FilePlus2,
  FileText,
  Languages,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

interface DashboardProject {
  id: string;
  title: string;
  state: string;
  direction: string;
  sourceWordCount: number;
  updatedAt: string;
}

interface DashboardProps {
  name: string;
  availableCredits: number;
  reservedCredits: number;
  projects: DashboardProject[];
  reviewCount: number;
  failedCount: number;
  configured: boolean;
}

export function Dashboard({ name, availableCredits, reservedCredits, projects, reviewCount, failedCount, configured }: DashboardProps) {
  const creditPercent = Math.min(100, Math.max(0, (availableCredits / 5000) * 100));

  return (
    <div>
      <section className="dot-grid relative overflow-hidden rounded-[1.75rem] border bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)] sm:p-8">
        <div className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--surface)_88%,transparent)]" />
        <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="border-[color:color-mix(in_srgb,var(--success)_25%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_9%,var(--surface))] text-[var(--success)]">
                <span className="status-dot me-2 size-1.5 rounded-full bg-[var(--success)]" /> Workspace ready
              </Badge>
              <span className="text-sm font-medium text-[var(--muted)]">Welcome back, {name}</span>
            </div>
            <h1 className="mt-5 text-balance text-3xl font-bold tracking-[-0.04em] sm:text-5xl">Move a document from source to approved translation.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">Start with a document or pasted text, review uncertain OCR, and keep approved terminology private to this workspace.</p>
          </div>
          <Link href="/app/translate" className="group inline-flex min-h-13 shrink-0 items-center justify-center gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--primary)_88%,black)] bg-[var(--primary)] px-5 text-sm font-bold text-white shadow-[0_10px_26px_color-mix(in_srgb,var(--primary)_20%,transparent)] transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.985] hover:bg-[var(--primary-hover)] hover:shadow-[0_14px_32px_color-mix(in_srgb,var(--primary)_25%,transparent)] dark:border-transparent dark:text-[#0e1724]">
            <FilePlus2 aria-hidden="true" size={18} /> New translation <ArrowRight aria-hidden="true" size={17} className="transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
          </Link>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace summary">
        <Metric label="Words available" value={formatNumber(availableCredits)} detail={reservedCredits ? `${formatNumber(reservedCredits)} currently reserved` : "Free beta credits ready"} icon={Languages} />
        <Metric label="Recent projects" value={String(projects.length)} detail="Visible in this workspace" icon={FileText} />
        <Metric label="Needs review" value={String(reviewCount)} detail="Assignments and layout checks" icon={Clock3} tone={reviewCount ? "warning" : "default"} />
        <Metric label="Processing issues" value={String(failedCount)} detail={failedCount ? "Open a job to retry" : "No current failures"} icon={failedCount ? TriangleAlert : CheckCircle2} tone={failedCount ? "danger" : "success"} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b px-5 py-5 sm:px-6">
            <div><h2 className="font-bold">Recent projects</h2><p className="mt-1 text-sm text-[var(--muted)]">Latest document activity in this workspace</p></div>
            <Link href="/app/translate" className="group inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)]">Start new <ArrowRight aria-hidden="true" size={16} className="transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" /></Link>
          </div>
          {projects.length ? (
            <div className="divide-y">
              {projects.map((project) => (
                <Link key={project.id} href={`/app/projects/${project.id}`} className="group grid min-h-20 gap-3 px-5 py-4 transition-colors hover:bg-[var(--surface-muted)] sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-[var(--surface)] text-[var(--accent)] shadow-sm"><FileText aria-hidden="true" size={18} /></span>
                    <div className="min-w-0"><p className="truncate font-semibold group-hover:text-[var(--accent)]">{project.title}</p><p className="mt-1 text-sm text-[var(--muted)]">{project.direction === "en-ar" ? "English → Arabic" : "Arabic → English"} · {formatNumber(project.sourceWordCount)} words</p></div>
                  </div>
                  <div className="flex items-center gap-3 ps-[3.35rem] sm:ps-0"><ProjectState state={project.state} /><span className="text-xs tabular-nums text-[var(--muted)]">{new Intl.DateTimeFormat("en-QA", { month: "short", day: "numeric" }).format(new Date(project.updatedAt))}</span><ArrowRight aria-hidden="true" size={16} className="hidden text-[var(--muted)] transition-transform duration-200 group-hover:translate-x-0.5 sm:block rtl:rotate-180 rtl:group-hover:-translate-x-0.5" /></div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl border bg-[var(--surface-muted)] text-[var(--muted)] shadow-sm"><FileText aria-hidden="true" size={23} /></span>
              <h3 className="mt-5 font-bold">Your workspace is ready</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">{configured ? "Create your first translation to begin building private terminology memory." : "Connect Supabase to enable projects and persistent history."}</p>
              {configured && <Link href="/app/translate" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border bg-[var(--surface)] px-4 text-sm font-bold shadow-sm hover:bg-[var(--subtle)]">Create first project <ArrowRight aria-hidden="true" size={16} className="rtl:rotate-180" /></Link>}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Beta balance</p>
              <h2 className="mt-2 text-xl font-bold">5,000 words included</h2>
            </div>
            <div className="relative grid size-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--accent) ${creditPercent}%, var(--subtle) ${creditPercent}% 100%)` }} aria-label={`${Math.round(creditPercent)} percent of beta credits remaining`}>
              <span className="grid size-12 place-items-center rounded-full bg-[var(--surface)] text-xs font-bold tabular-nums">{Math.round(creditPercent)}%</span>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-[var(--muted)]">Credits do not replenish automatically. An administrator can issue an audited beta grant when needed.</p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--subtle)]"><div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${creditPercent}%` }} /></div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-[var(--muted)]"><span>{formatNumber(availableCredits)} remaining</span><span>5,000 total</span></div>
          <div className="mt-6 flex gap-3 rounded-xl border bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[var(--muted)]"><ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--success)]" size={18} /><p><strong className="text-[var(--foreground)]">Private by default.</strong> Paid plans are coming later; no checkout or card details are collected.</p></div>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, detail, icon: Icon, tone = "default" }: { label: string; value: string; detail: string; icon: typeof Languages; tone?: "default" | "success" | "warning" | "danger" }) {
  const toneClass = tone === "success" ? "text-[var(--success)] bg-[color:color-mix(in_srgb,var(--success)_12%,var(--surface))]" : tone === "warning" ? "text-[var(--warning)] bg-[color:color-mix(in_srgb,var(--warning)_12%,var(--surface))]" : tone === "danger" ? "text-[var(--danger)] bg-[color:color-mix(in_srgb,var(--danger)_10%,var(--surface))]" : "text-[var(--accent)] bg-[var(--accent-soft)]";
  return <Card className="interactive-surface min-h-40 p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[var(--muted)]">{label}</p><p className="mt-2 text-3xl font-bold tabular-nums tracking-[-0.04em]">{value}</p></div><span className={`grid size-10 place-items-center rounded-xl ${toneClass}`}><Icon aria-hidden="true" size={19} /></span></div><p className="mt-5 text-xs leading-5 text-[var(--muted)]">{detail}</p></Card>;
}

function ProjectState({ state }: { state: string }) {
  const label = state.replaceAll("_", " ");
  const className = state === "approved" ? "border-[color:color-mix(in_srgb,var(--success)_24%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_8%,var(--surface))] text-[var(--success)]" : state === "failed" ? "border-[color:color-mix(in_srgb,var(--danger)_22%,var(--border))] bg-[color:color-mix(in_srgb,var(--danger)_7%,var(--surface))] text-[var(--danger)]" : state === "review" ? "border-[color:color-mix(in_srgb,var(--warning)_24%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_8%,var(--surface))] text-[var(--warning)]" : "border-[color:color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]";
  return <Badge className={className}>{label}</Badge>;
}
