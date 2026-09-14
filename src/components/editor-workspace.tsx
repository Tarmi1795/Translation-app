"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Download, FileCheck2, LoaderCircle, MessageSquare, RefreshCw, Save, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandingPicker } from "@/components/branding-picker";
import { DocumentPreview } from "@/components/document-preview";
import { cn, formatNumber } from "@/lib/utils";
import type { BrandingSelection, JobStage, LanguageDirection, LayoutWarning, WorkspaceRole } from "@/types/domain";

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
  versionId,
  sourceMimeType,
  branding: initialBranding,
  sourceHasLetterhead,
}: {
  project: { id: string; workspaceId: string; title: string; direction: LanguageDirection; state: string; sourceWordCount: number };
  initialSegments: EditorSegment[];
  initialJob: EditorJob | null;
  warnings: LayoutWarning[];
  role: WorkspaceRole;
  versionId?: string;
  sourceMimeType: string;
  branding: BrandingSelection[];
  sourceHasLetterhead: boolean;
}) {
  const router = useRouter();
  const [segments, setSegments] = useState(initialSegments);
  const [job, setJob] = useState(initialJob);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [branding, setBranding] = useState(initialBranding);
  const [brandingDirty, setBrandingDirty] = useState(false);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"preview" | "text">("preview");
  const [artifact, setArtifact] = useState<{ id: string; format: string; warnings: LayoutWarning[] } | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const pendingPreview = useRef<Promise<void> | null>(null);
  const jobActive = job && !["completed", "failed", "cancelled", "ocr_review"].includes(job.stage);
  const activeJobId = job?.id;

  useEffect(() => {
    if (!jobActive || !activeJobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    const poll = async () => {
      try {
      const response = await fetch(`/api/v1/jobs/${activeJobId}`, { cache: "no-store", signal: abort.signal });
      if (!response.ok) throw new Error("Progress could not be loaded. Retrying…");
      const payload = await response.json();
      if (stopped) return;
      setJob(payload.data);
      if (["completed", "failed", "cancelled", "ocr_review"].includes(payload.data.stage)) router.refresh();
      } catch { /* A transient polling error must not discard the current job. */ }
      finally { if (!stopped) timer = setTimeout(poll, 3000); }
    };
    timer = setTimeout(poll, 1000);
    return () => { stopped = true; clearTimeout(timer); abort.abort(); };
  }, [jobActive, activeJobId, router]);

  const lowConfidence = useMemo(() => segments.filter((segment) => segment.qualityFlags.includes("low_ocr_confidence")).length, [segments]);
  const translationReady = segments.length > 0 && segments.every((segment) => segment.translatedText.trim()) && !jobActive;
  const unsaved = dirtyIds.size > 0 || brandingDirty;
  const allWarnings = artifact?.warnings ?? warnings;

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  function updateSegment(id: string, value: string, source = false) {
    setDirtyIds((current) => new Set(current).add(`${id}:${source ? "source" : "translation"}`));
    setArtifact(null);
    setSegments((current) => current.map((segment) => segment.id === id ? { ...segment, [source ? "sourceText" : "translatedText"]: value } : segment));
  }

  async function saveSegment(segment: EditorSegment, source = false) {
    setSavingId(segment.id);
    setError(null);
    const response = await fetch(`/api/v1/segments/${segment.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(source ? { sourceText: segment.sourceText, reason: "ocr_correction" } : { translatedText: segment.translatedText, reason: "human_edit" }) });
    const payload = await response.json();
    setSavingId(null);
    if (!response.ok) setError(payload.error?.message ?? "The segment could not be saved.");
    else {
      setDirtyIds((current) => { const next = new Set(current); next.delete(`${segment.id}:${source ? "source" : "translation"}`); if (payload.data.translationInvalidated) next.delete(`${segment.id}:translation`); return next; });
      setSegments((current) => current.map((item) => item.id === segment.id ? { ...item, ...(source ? { sourceConfidence: 1, qualityFlags: item.qualityFlags.filter((flag) => flag !== "low_ocr_confidence"), translatedText: payload.data.translationInvalidated ? "" : item.translatedText, status: payload.data.translationInvalidated ? "pending" : item.status } : { status: "edited", qualityFlags: payload.data.qualityFlags ?? item.qualityFlags }) } : item));
      setArtifact(null);
      setMessage(source ? "Source saved. Changed source text must be translated again." : "Translation saved. Rebuild the preview to see the change.");
    }
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
    else if (format === "txt") router.push(`/api/v1/exports/${payload.data.id}/download`);
    else { setArtifact({ id: payload.data.id, format, warnings: payload.data.warnings ?? [] }); setView("preview"); }
  }

  // The same in-flight promise is reused during Strict Mode's effect replay.
  useEffect(() => {
    if (!translationReady || unsaved || pendingPreview.current) return;
    pendingPreview.current = requestExport("pdf").catch(() => { setError("Preview could not be generated. Use Build PDF preview to retry."); setExporting(null); });
    // Export is intentionally a snapshot of the initially completed translation.
    // User edits invalidate it and require an explicit rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationReady]);

  async function saveBranding() {
    if (!versionId) return;
    setError(null); setExporting("branding");
    try {
      const response = await fetch(`/api/v1/projects/${project.id}/branding`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: project.workspaceId, versionId, branding }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Branding could not be saved.");
      setBrandingDirty(false); setArtifact(null); setMessage("Document branding saved. Rebuild the preview to check placement.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Save failed."); }
    finally { setExporting(null); }
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
          {!jobActive && !translationReady && <Button size="sm" onClick={startTranslation} disabled={starting || lowConfidence > 0 || unsaved}>{starting ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <RefreshCw aria-hidden="true" size={16} />} {job ? "Retry remaining translation" : "Translate reviewed source"}</Button>}
          {(["pdf", "docx", "txt"] as const).map((format) => <Button key={format} variant="secondary" size="sm" onClick={() => requestExport(format).catch(() => { setError("Export failed. Please retry."); setExporting(null); })} disabled={Boolean(exporting) || !translationReady || unsaved}>{exporting === format ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <Download aria-hidden="true" size={16} />} {format === "txt" ? "Text" : `Build ${format === "pdf" ? "PDF" : "Word"} preview`}</Button>)}
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

      {unsaved && <p role="status" className="mb-3 text-sm text-[var(--warning)]">Save your text or placement changes before previewing, downloading or approving.</p>}
      <div className="my-4 flex flex-wrap items-center gap-2">
        <Button variant={view === "preview" ? "primary" : "secondary"} onClick={() => setView("preview")}>Document preview</Button>
        <Button variant={view === "text" ? "primary" : "secondary"} onClick={() => setView("text")}>Text corrections {lowConfidence ? `(${lowConfidence} OCR)` : ""}</Button>
        {artifact && !unsaved && <a href={`/api/v1/exports/${artifact.id}/download`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-white dark:text-[#0e1724]"><Download size={17} />Download this {artifact.format === "pdf" ? "PDF" : "Word file"}</a>}
      </div>
      {allWarnings.length > 0 && <details className="mb-4 rounded-xl border bg-[var(--surface)] p-4" open><summary className="cursor-pointer text-sm font-bold">{allWarnings.length} items to check — layout fidelity is not guaranteed</summary><ul className="mt-3 space-y-2 text-sm leading-6">{allWarnings.map((warning, index) => <li key={index} className="flex gap-2"><AlertTriangle size={16} className="mt-1 shrink-0 text-[var(--warning)]" aria-hidden="true" /><span>Page {warning.page}: {warning.message}</span></li>)}</ul></details>}
      {view === "preview" && <>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {sourceMimeType !== "text/plain" ? <DocumentPreview url={`/api/v1/projects/${project.id}/source`} mimeType={sourceMimeType} title="Original document" /> : <Card className="p-5"><h3 className="font-bold">Original text</h3><div dir={project.direction === "ar-en" ? "rtl" : "ltr"} className="mt-4 max-h-[65vh] space-y-3 overflow-auto whitespace-pre-wrap">{segments.map((segment) => <p key={segment.id}>{segment.sourceText}</p>)}</div></Card>}
          {artifact ? <DocumentPreview key={artifact.id} url={`/api/v1/exports/${artifact.id}/download?inline=1`} mimeType={artifact.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"} title="Translated document — same file as download" /> : <Card className="flex min-h-64 items-center justify-center p-8 text-center"><p className="max-w-sm text-sm leading-7 text-[var(--muted)]">{exporting ? "Preparing your document preview…" : translationReady ? "Build a preview above to check the exact PDF or editable Word download." : lowConfidence ? "Review the flagged OCR in Text corrections, save it, then translate." : "The translated preview will appear when processing completes."}</p></Card>}
        </div>
        <details className="mt-5"><summary className="min-h-11 cursor-pointer text-sm font-bold">Adjust document letterhead & stamp</summary><BrandingPicker workspaceId={project.workspaceId} value={branding} onChange={(items) => { setBranding(items); setBrandingDirty(true); setArtifact(null); }} sourceHasLetterhead={sourceHasLetterhead} disabled={Boolean(jobActive) || Boolean(exporting)} /><Button className="mt-3" onClick={saveBranding} disabled={!brandingDirty || Boolean(exporting)}>Save document placement</Button></details>
      </>}

      {view === "text" && <><label className="my-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={onlyIssues} onChange={(event) => setOnlyIssues(event.target.checked)} />Show only segments needing attention</label><fieldset disabled={Boolean(jobActive) || Boolean(savingId)} className="mt-3 grid min-w-0 gap-4">
        {segments.length ? segments.filter((segment) => !onlyIssues || segment.qualityFlags.length || !segment.translatedText.trim()).map((segment, index) => {
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
      </fieldset></>}

      {segments.length > 0 && (
        <Card className="mt-6 flex flex-col justify-between gap-4 p-4 shadow-[var(--shadow-lg)] sm:flex-row sm:items-center sm:p-5">
          <div className="flex items-start gap-3"><MessageSquare aria-hidden="true" className="mt-1 text-[var(--accent)]" size={20} /><div><p className="font-bold">Review workflow</p><p className="mt-1 text-sm text-[var(--muted)]">Translators cannot approve their own organization work without an audited owner override.</p></div></div>
          <fieldset disabled={unsaved || !translationReady || !artifact || artifact.warnings.some((warning) => warning.severity === "error")} className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => reviewAction("request_changes")}>Request changes</Button>{["owner", "admin", "reviewer"].includes(role) ? <Button size="sm" onClick={() => reviewAction("approve")}><CheckCircle2 aria-hidden="true" size={17} /> Approve reviewed document</Button> : <Button size="sm" onClick={() => reviewAction("submit")}>Submit for review</Button>}</fieldset>
        </Card>
      )}
    </div>
  );
}
