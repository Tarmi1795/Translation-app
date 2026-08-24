"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Download, FileCheck2, LoaderCircle, MessageSquare, RefreshCw, Save, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";
import type { JobStage, LanguageDirection, LayoutWarning, WorkspaceRole } from "@/types/domain";

interface EditorSegment {
  id: string;
  sourceText: string;
  translatedText: string;
  order: number;
  status: string;
  qualityFlags: string[];
  sourceConfidence?: number;
}

interface EditorJob {
  id: string;
  stage: JobStage;
  progress: number;
  completedSegments: number;
  totalSegments: number;
  errorMessage?: string;
}

export function EditorWorkspace({
  project,
  initialSegments,
  initialJob,
  warnings,
  role,
}: {
  project: { id: string; workspaceId: string; title: string; direction: LanguageDirection; state: string; sourceWordCount: number };
  initialSegments: EditorSegment[];
  initialJob: EditorJob | null;
  warnings: LayoutWarning[];
  role: WorkspaceRole;
}) {
  const router = useRouter();
  const [segments, setSegments] = useState(initialSegments);
  const [job, setJob] = useState(initialJob);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const jobActive = job && !["completed", "failed", "cancelled", "ocr_review"].includes(job.stage);

  useEffect(() => {
    if (!jobActive || !job) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/v1/jobs/${job.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setJob(payload.data);
      if (["completed", "failed", "cancelled", "ocr_review"].includes(payload.data.stage)) router.refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [jobActive, job, router]);

  const lowConfidence = useMemo(() => segments.filter((segment) => (segment.sourceConfidence ?? 1) < 0.8).length, [segments]);

  function updateSegment(id: string, value: string, source = false) {
    setSegments((current) => current.map((segment) => segment.id === id ? { ...segment, [source ? "sourceText" : "translatedText"]: value } : segment));
  }

  async function saveSegment(segment: EditorSegment, source = false) {
    setSavingId(segment.id);
    setError(null);
    const response = await fetch(`/api/v1/segments/${segment.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(source ? { sourceText: segment.sourceText, reason: "ocr_correction" } : { translatedText: segment.translatedText, reason: "human_edit" }) });
    const payload = await response.json();
    setSavingId(null);
    if (!response.ok) setError(payload.error?.message ?? "The segment could not be saved.");
    else setMessage(source ? "OCR correction saved." : "Translation saved to the revision history.");
  }

  async function reviewAction(action: "submit" | "request_changes" | "approve") {
    setError(null);
    const response = await fetch("/api/v1/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: project.workspaceId, projectId: project.id, action }) });
    const payload = await response.json();
    if (!response.ok) setError(payload.error?.message ?? "Review action failed.");
    else { setMessage(`Project ${action.replace("_", " ")}.`); router.refresh(); }
  }

  async function requestExport(format: "docx" | "pdf" | "txt") {
    setExporting(format);
    setError(null);
    const response = await fetch("/api/v1/exports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: project.workspaceId, projectId: project.id, format }) });
    const payload = await response.json();
    setExporting(null);
    if (!response.ok) setError(payload.error?.message ?? "Export failed.");
    else router.push(`/api/v1/exports/${payload.data.id}/download`);
  }

  async function startTranslation() {
    setStarting(true); setError(null);
    const response = await fetch("/api/v1/translations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: project.workspaceId, projectId: project.id }) });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error?.message ?? "Translation could not be started."); setStarting(false); return; }
    setJob({ id: payload.data.jobId, stage: payload.data.stage ?? "queued", progress: 20, completedSegments: 0, totalSegments: segments.length });
    setStarting(false); router.refresh();
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <Link href="/app" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"><ArrowLeft aria-hidden="true" size={17} className="rtl:rotate-180" /> Dashboard</Link>
          <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="truncate text-3xl font-bold tracking-[-0.035em]">{project.title}</h1><Badge className="capitalize">{project.state.replaceAll("_", " ")}</Badge></div>
          <p className="mt-2 text-sm text-[var(--muted)]">{project.direction === "en-ar" ? "English → Arabic" : "Arabic → English"} · {formatNumber(project.sourceWordCount)} source words</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!job && project.state === "ready" && <Button size="sm" onClick={startTranslation} disabled={starting}>{starting ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <RefreshCw aria-hidden="true" size={16} />} Start translation</Button>}
          {(["docx", "pdf", "txt"] as const).map((format) => <Button key={format} variant="secondary" size="sm" onClick={() => requestExport(format)} disabled={Boolean(exporting) || segments.length === 0}>{exporting === format ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <Download aria-hidden="true" size={16} />} {format.toUpperCase()}</Button>)}
        </div>
      </div>

      {job && (
        <Card className={cn("mt-6 p-5", job.stage === "failed" && "border-[color:color-mix(in_srgb,var(--danger)_45%,var(--border))]")}>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className={cn("grid size-11 place-items-center rounded-xl", job.stage === "failed" ? "bg-[color:color-mix(in_srgb,var(--danger)_10%,var(--surface))] text-[var(--danger)]" : job.stage === "completed" ? "bg-[color:color-mix(in_srgb,var(--success)_12%,var(--surface))] text-[var(--success)]" : "bg-[var(--accent-soft)] text-[var(--accent)]")}>
                {job.stage === "completed" ? <CheckCircle2 aria-hidden="true" size={21} /> : job.stage === "failed" ? <ShieldAlert aria-hidden="true" size={21} /> : <RefreshCw aria-hidden="true" className="animate-spin" size={20} />}
              </span>
              <div><p className="font-bold capitalize">{job.stage.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-[var(--muted)]">{job.errorMessage || `${job.completedSegments} of ${job.totalSegments || "—"} segments processed`}</p></div>
            </div>
            <span className="text-2xl font-bold tabular-nums">{Math.round(job.progress)}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--subtle)]"><div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${Math.max(2, Math.min(100, job.progress))}%` }} /></div>
        </Card>
      )}

      {(lowConfidence > 0 || warnings.length > 0) && (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {lowConfidence > 0 && <div className="flex gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_8%,var(--surface))] p-4 text-sm leading-6"><AlertTriangle aria-hidden="true" className="mt-1 shrink-0 text-[var(--warning)]" size={18} /><div><strong>{lowConfidence} OCR segment{lowConfidence === 1 ? "" : "s"} need review.</strong><p className="text-[var(--muted)]">Correct the source text before relying on its translation.</p></div></div>}
          {warnings.length > 0 && <div className="flex gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_8%,var(--surface))] p-4 text-sm leading-6"><FileCheck2 aria-hidden="true" className="mt-1 shrink-0 text-[var(--warning)]" size={18} /><div><strong>{warnings.length} layout warning{warnings.length === 1 ? "" : "s"}.</strong><p className="text-[var(--muted)]">Review overflow, font substitutions, or material reflow before approval.</p></div></div>}
        </div>
      )}

      <div aria-live="polite" className="mt-4 min-h-6 text-sm">{message && <p className="text-[var(--success)]">{message}</p>}{error && <p role="alert" className="text-[var(--danger)]">{error}</p>}</div>

      <div className="mt-3 grid gap-4">
        {segments.length ? segments.map((segment, index) => {
          const sourceIsArabic = project.direction === "ar-en";
          return (
            <Card key={segment.id} className="overflow-hidden">
              <div className="flex items-center justify-between border-b bg-[var(--subtle)] px-4 py-3 sm:px-5"><p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted)]">Segment {index + 1}</p><div className="flex gap-2">{segment.qualityFlags.map((flag) => <Badge key={flag} className="text-[var(--warning)]">{flag.replaceAll("_", " ")}</Badge>)}{(segment.sourceConfidence ?? 1) < 0.8 && <Badge className="text-[var(--warning)]">OCR {Math.round((segment.sourceConfidence ?? 0) * 100)}%</Badge>}</div></div>
              <div className="grid lg:grid-cols-2">
                <section className="border-b p-4 lg:border-b-0 lg:border-e sm:p-5" dir={sourceIsArabic ? "rtl" : "ltr"}><label htmlFor={`source-${segment.id}`} className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted)]">Source {sourceIsArabic ? "· العربية" : "· English"}</label><textarea id={`source-${segment.id}`} value={segment.sourceText} onChange={(event) => updateSegment(segment.id, event.target.value, true)} className="min-h-40 w-full resize-y rounded-xl border bg-[var(--surface)] p-4 text-base leading-8" /><div className="mt-3 flex justify-end"><Button variant="ghost" size="sm" onClick={() => saveSegment(segment, true)} disabled={savingId === segment.id}>{savingId === segment.id ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <Save aria-hidden="true" size={16} />} Save OCR correction</Button></div></section>
                <section className="p-4 sm:p-5" dir={sourceIsArabic ? "ltr" : "rtl"}><label htmlFor={`translation-${segment.id}`} className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted)]">Translation {sourceIsArabic ? "· English" : "· العربية"}</label><textarea id={`translation-${segment.id}`} value={segment.translatedText} onChange={(event) => updateSegment(segment.id, event.target.value)} className="min-h-40 w-full resize-y rounded-xl border bg-[var(--surface)] p-4 text-base leading-8" /><div className="mt-3 flex justify-end"><Button size="sm" onClick={() => saveSegment(segment)} disabled={savingId === segment.id}>{savingId === segment.id ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <Check aria-hidden="true" size={16} />} Save translation</Button></div></section>
              </div>
            </Card>
          );
        }) : (
          <Card className="py-16 text-center"><RefreshCw aria-hidden="true" className="mx-auto text-[var(--muted)]" size={30} /><h2 className="mt-4 font-bold">Segments are not ready yet</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">The workflow will place extracted and translated segments here. This page updates when processing completes.</p></Card>
        )}
      </div>

      {segments.length > 0 && (
        <Card className="sticky bottom-4 mt-6 flex flex-col justify-between gap-4 p-4 shadow-[var(--shadow-lg)] sm:flex-row sm:items-center sm:p-5">
          <div className="flex items-start gap-3"><MessageSquare aria-hidden="true" className="mt-1 text-[var(--accent)]" size={20} /><div><p className="font-bold">Review workflow</p><p className="mt-1 text-sm text-[var(--muted)]">Translators cannot approve their own organization work without an audited owner override.</p></div></div>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => reviewAction("request_changes")}>Request changes</Button>{["owner", "admin", "reviewer"].includes(role) ? <Button size="sm" onClick={() => reviewAction("approve")}><CheckCircle2 aria-hidden="true" size={17} /> Approve</Button> : <Button size="sm" onClick={() => reviewAction("submit")}>Submit for review</Button>}</div>
        </Card>
      )}
    </div>
  );
}
