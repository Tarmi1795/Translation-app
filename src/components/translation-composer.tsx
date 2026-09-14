"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Camera, CheckCircle2, FileText, Image as ImageIcon, Languages, LoaderCircle, ScanText, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandingPicker } from "@/components/branding-picker";
import { cn, formatNumber } from "@/lib/utils";
import type { BrandingSelection, LanguageDirection } from "@/types/domain";

type InputMode = "text" | "document" | "scan" | "camera";

export function TranslationComposer({ workspaceId, availableCredits, configured }: { workspaceId?: string; availableCredits: number; configured: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [direction, setDirection] = useState<LanguageDirection>("en-ar");
  const [mode, setMode] = useState<InputMode>("document");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [branding, setBranding] = useState<BrandingSelection[]>([]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [requiresOcrReview, setRequiresOcrReview] = useState(false);
  const [busy, setBusy] = useState<"estimating" | "starting" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const inputReady = mode === "text" ? text.trim().length > 0 : Boolean(file);
  const currentStep = estimate === null ? 0 : 1;

  async function api<T>(url: string, init: RequestInit) {
    const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "The request failed.");
    return payload.data as T;
  }

  async function estimateTranslation() {
    if (!workspaceId || !inputReady) return;
    setBusy("estimating");
    setError(null);
    try {
      const project = projectId
        ? { id: projectId }
        : await api<{ id: string }>("/api/v1/projects", {
            method: "POST",
            body: JSON.stringify({ workspaceId, title: title.trim() || file?.name || "Untitled translation", direction }),
          });
      setProjectId(project.id);

      let documentId: string | undefined;
      if (mode !== "text" && file) {
        const upload = await api<{ documentId: string; signedUrl: string; token: string; path: string }>("/api/v1/uploads", {
          method: "POST",
          body: JSON.stringify({ workspaceId, projectId: project.id, fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size }),
        });
        const uploadResponse = await fetch(upload.signedUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" }, body: file });
        if (!uploadResponse.ok) throw new Error("The file could not be uploaded. Please try again.");
        await api(`/api/v1/uploads/${upload.documentId}/finalize`, { method: "POST", body: JSON.stringify({ token: upload.token }) });
        documentId = upload.documentId;
      }

      const result = await api<{ versionId: string; sourceWordCount: number; requiresOcrReview: boolean }>("/api/v1/estimates", {
        method: "POST",
        body: JSON.stringify({ workspaceId, projectId: project.id, documentId, text: mode === "text" ? text : undefined, direction, branding }),
      });
      setEstimate(result.sourceWordCount);
      setRequiresOcrReview(result.requiresOcrReview);
      setVersionId(result.versionId);
      if (result.requiresOcrReview) {
        router.push(`/app/projects/${project.id}`);
      } else if (result.sourceWordCount <= availableCredits) {
        setBusy("starting");
        const started = await api<{ jobId: string }>("/api/v1/translations", { method: "POST", body: JSON.stringify({ workspaceId, projectId: project.id }) });
        router.push(`/app/projects/${project.id}?job=${started.jobId}`);
      } else setError("This document needs more credits than are available. The extracted source is saved; request a credit grant, then continue.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The estimate could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  async function startTranslation() {
    if (!workspaceId || !projectId || estimate === null) return;
    setBusy("starting");
    setError(null);
    try {
      if (versionId) await api(`/api/v1/projects/${projectId}/branding`, { method: "PATCH", body: JSON.stringify({ workspaceId, versionId, branding }) });
      const result = await api<{ jobId: string }>("/api/v1/translations", { method: "POST", body: JSON.stringify({ workspaceId, projectId }) });
      router.push(`/app/projects/${projectId}?job=${result.jobId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Translation could not be started.");
      setBusy(null);
    }
  }

  function chooseMode(next: InputMode) {
    setProjectId(null);
    setVersionId(null);
    setMode(next);
    setEstimate(null);
    setRequiresOcrReview(false);
    setError(null);
    setFile(null);
  }

  function selectFile(nextFile: File | null) {
    setFile(nextFile);
    setEstimate(null);
    setRequiresOcrReview(false);
    setProjectId(null);
  }

  function dropFile(event: React.DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div>
      <div className="max-w-3xl"><div className="flex items-center gap-2 text-sm font-semibold text-[var(--accent)]"><span className="status-dot size-1.5 rounded-full bg-[var(--success)]" />New document</div><h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Translate a document</h1><p className="mt-3 leading-7 text-[var(--muted)]">Add your document, choose its target language and reuse your branding. We’ll inspect and translate automatically, pausing if text needs your attention. Uses up to your available {formatNumber(availableCredits)} word credits.</p></div>
      <ol className="mt-7 grid max-w-3xl grid-cols-3 overflow-hidden rounded-xl border bg-[var(--surface)] shadow-sm" aria-label="Translation steps">
        {["Document & branding", "Translate", "Review & download"].map((step, index) => {
          const active = index <= currentStep;
          return <li key={step} aria-current={index === currentStep ? "step" : undefined} className={cn("flex min-h-12 items-center gap-2 border-e px-3 text-xs font-bold last:border-e-0 sm:px-4 sm:text-sm", active ? "text-[var(--accent)]" : "text-[var(--muted)]")}><span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px] tabular-nums", active ? "bg-[var(--accent-soft)]" : "bg-[var(--subtle)]")}>{index + 1}</span><span className="truncate">{step}</span></li>;
        })}
      </ol>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden p-5 sm:p-7">
          <fieldset disabled={Boolean(busy)} className="min-w-0">
          <fieldset>
            <legend className="text-sm font-bold">Target language</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(["en-ar", "ar-en"] as const).map((value) => (
                <button key={value} type="button" onClick={() => { setDirection(value); setEstimate(null); setRequiresOcrReview(false); setProjectId(null); }} aria-pressed={direction === value} className={cn("interactive-surface flex min-h-16 items-center justify-between rounded-xl border px-4 text-start font-semibold", direction === value ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm" : "bg-[var(--surface)] hover:bg-[var(--subtle)]")}>
                  <span>{value === "en-ar" ? "English" : "العربية"}</span><span className={cn("grid size-8 place-items-center rounded-full border bg-[var(--surface)] transition-transform duration-200", value === "ar-en" && "rotate-180")}><ArrowRight aria-hidden="true" size={15} /></span><span>{value === "en-ar" ? "العربية" : "English"}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-7">
            <legend className="text-sm font-bold">Source type</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["document", FileText, "PDF / DOCX"],
                ["text", Languages, "Text"],
                ["scan", ScanText, "Image / scan"],
                ["camera", Camera, "Camera"],
              ].map(([value, Icon, label]) => (
                <button key={String(value)} type="button" onClick={() => chooseMode(value as InputMode)} aria-pressed={mode === value} className={cn("interactive-surface flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold", mode === value ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm" : "bg-[var(--surface)] hover:bg-[var(--subtle)]")}>
                  <span className={cn("grid size-8 place-items-center rounded-lg", mode === value ? "bg-[var(--surface)]" : "bg-[var(--subtle)]")}><Icon aria-hidden="true" size={18} /></span> {label as string}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-7">
            <label htmlFor="project-title" className="mb-2 block text-sm font-bold">Project title <span className="font-normal text-[var(--muted)]">(optional)</span></label>
            <input id="project-title" value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-12 w-full rounded-xl border bg-[var(--surface)] px-4 text-base shadow-sm transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_12%,transparent)] focus:outline-none" placeholder="e.g. Supplier agreement — August 2026" />
          </div>

          {mode === "text" ? (
            <div className="mt-6"><label htmlFor="source-text" className="mb-2 block text-sm font-bold">Source text</label><textarea id="source-text" value={text} onChange={(event) => { setText(event.target.value); setEstimate(null); setRequiresOcrReview(false); setProjectId(null); }} dir={direction === "ar-en" ? "rtl" : "ltr"} className="min-h-64 w-full resize-y rounded-xl border bg-[var(--surface)] p-4 text-base leading-7 shadow-sm transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_12%,transparent)] focus:outline-none" placeholder={direction === "ar-en" ? "الصق النص العربي هنا..." : "Paste the English source text here..."} /></div>
          ) : (
            <div className="mt-6">
              <label htmlFor="source-file" className="sr-only">Choose source document</label>
              <input ref={fileRef} id="source-file" type="file" className="sr-only" accept={mode === "document" ? ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "image/jpeg,image/png,application/pdf"} capture={mode === "camera" ? "environment" : undefined} onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragActive(false)} onDrop={dropFile} className={cn("document-grid interactive-surface flex min-h-64 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-7 text-center", dragActive ? "border-[var(--accent)] bg-[var(--accent-soft)]" : file ? "border-[color:color-mix(in_srgb,var(--success)_36%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_5%,var(--surface))]" : "hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]")}>
                <span className={cn("grid size-14 place-items-center rounded-2xl border bg-[var(--surface)] text-[var(--accent)] shadow-sm transition-transform duration-200", dragActive && "scale-105")}>{file ? <CheckCircle2 aria-hidden="true" className="text-[var(--success)]" size={25} /> : mode === "camera" ? <Camera aria-hidden="true" size={25} /> : mode === "scan" ? <ImageIcon aria-hidden="true" size={25} /> : <UploadCloud aria-hidden="true" size={25} />}</span>
                <span className="mt-5 max-w-full truncate font-bold">{dragActive ? "Drop to add this file" : file?.name ?? (mode === "camera" ? "Capture a document" : "Choose or drop a source file")}</span>
                <span className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Select again to replace` : mode === "document" ? "PDF or DOCX. Encrypted, corrupt, and macro-enabled files are rejected." : "JPG, PNG, or scanned PDF. Low-confidence text requires review."}</span>
              </button>
            </div>
          )}

          {requiresOcrReview && projectId && <div role="status" className="mt-5 flex flex-col justify-between gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_8%,var(--surface))] p-4 text-sm sm:flex-row sm:items-center"><p className="text-[var(--warning)]">Low-confidence OCR must be corrected before translation.</p><Button type="button" variant="secondary" size="sm" onClick={() => router.push(`/app/projects/${projectId}`)}>Review OCR</Button></div>}
          {workspaceId && <BrandingPicker workspaceId={workspaceId} value={branding} onChange={setBranding} disabled={Boolean(busy)} />}
          {error && <p role="alert" className="page-enter mt-5 rounded-xl border border-[color:color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[color:color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-4 text-sm text-[var(--danger)]">{error}</p>}
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" onClick={estimate === null ? estimateTranslation : startTranslation} disabled={!configured || !workspaceId || !inputReady || requiresOcrReview || Boolean(busy) || (estimate !== null && estimate > availableCredits)}>
              {busy && <LoaderCircle aria-hidden="true" size={18} className="animate-spin" />} {busy === "estimating" ? "Inspecting document…" : busy === "starting" ? "Starting translation…" : estimate === null ? "Translate document" : "Continue translation"} <ArrowRight aria-hidden="true" size={17} className="rtl:rotate-180" />
            </Button>
          </div>
          </fieldset>
        </Card>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start" aria-label="Translation estimate">
          <Card className="p-5"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-[var(--muted)]">Available balance</p><span className="size-2 rounded-full bg-[var(--success)]" /></div><p className="mt-2 text-3xl font-bold tabular-nums">{formatNumber(availableCredits)}</p><p className="mt-1 text-xs text-[var(--muted)]">source-word credits</p></Card>
          <Card className={cn("p-5 transition-[border-color,box-shadow] duration-200", estimate !== null && "border-[var(--accent)] shadow-[var(--shadow-md)]")} aria-live="polite">
            <p className="text-sm font-semibold text-[var(--muted)]">Exact requirement</p><p className="mt-2 text-3xl font-bold tabular-nums">{estimate === null ? "—" : formatNumber(estimate)}</p><p className="mt-1 text-xs text-[var(--muted)]">{estimate === null ? "Inspect the source to calculate" : estimate > availableCredits ? "Insufficient beta credits" : "Credits will be reserved when you start"}</p>
          </Card>
          <Card className="p-5"><h2 className="text-sm font-bold">What happens next</h2><ol className="mt-4 space-y-4 text-sm leading-6 text-[var(--muted)]">{["File safety and structure checks", "OCR review when confidence is low", "Contextual translation with private terminology", "Names, numbers, dates, and layout QA"].map((item, index) => <li key={item} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--subtle)] text-xs font-bold text-[var(--foreground)]">{index + 1}</span>{item}</li>)}</ol></Card>
        </aside>
      </div>
    </div>
  );
}
