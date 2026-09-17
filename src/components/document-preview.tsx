"use client";

import { useEffect, useRef, useState } from "react";

// PDF preview strategy: render through pdfjs onto canvases (works even when
// browser PDF plugins / "download PDFs" settings replace embeds with a
// placeholder), and fall back to a native iframe when canvas rendering does
// not complete. DOCX uses docx-preview.
const CANVAS_WATCHDOG_MS = 15_000;

export function DocumentPreview({ url, mimeType, title }: { url: string; mimeType: string; title: string }) {
  const wordRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"canvas" | "iframe">("canvas");
  const word = mimeType.includes("wordprocessingml");
  const pdf = mimeType.includes("pdf");

  useEffect(() => {
    if (!word || !wordRef.current) return;
    let active = true;
    const container = wordRef.current;
    const abort = new AbortController();
    async function render() {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) throw new Error("The Word preview could not be loaded.");
      const blob = await response.blob();
      const { renderAsync } = await import("docx-preview");
      if (!active) return;
      container.replaceChildren();
      await renderAsync(blob, container, undefined, { inWrapper: true, ignoreWidth: true, renderAltChunks: false, useBase64URL: true, breakPages: true });
      // Document content must not introduce executable or external link actions.
      container.querySelectorAll("a").forEach((anchor) => anchor.removeAttribute("href"));
    }
    render().catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; abort.abort(); container.replaceChildren(); };
  }, [url, word]);

  useEffect(() => {
    if (!pdf || mode !== "canvas" || !pdfRef.current) return;
    let active = true;
    const container = pdfRef.current;
    const abort = new AbortController();
    setBusy(true);
    setError(null);
    async function render() {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) throw new Error("The document could not be loaded.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      // The legacy build with a real worker is the most compatible pdfjs setup.
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const doc = await pdfjs.getDocument({ data: bytes, isOffscreenCanvasSupported: false }).promise;
      if (!active) return;
      container.replaceChildren();
      // If the first page never lands, swap to the native viewer instead of
      // leaving an empty pane; some locked-down browsers cannot run pdfjs.
      const watchdog = setTimeout(() => { if (active && !container.querySelector("canvas")) setMode("iframe"); }, CANVAS_WATCHDOG_MS);
      try {
        const pages = Math.min(doc.numPages, 30);
        for (let number = 1; number <= pages; number += 1) {
          const page = await doc.getPage(number);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.max(1, Math.min(2, 720 / base.width));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.dir = "ltr";
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto mb-4 block max-w-full rounded shadow-sm";
          await page.render({ canvas, viewport }).promise;
          clearTimeout(watchdog);
          if (!active) return;
          container.appendChild(canvas);
        }
        if (doc.numPages > pages) {
          const note = document.createElement("p");
          note.textContent = `Showing the first ${pages} of ${doc.numPages} pages. Download the file for the complete document.`;
          note.className = "text-center text-sm";
          container.appendChild(note);
        }
      } finally {
        clearTimeout(watchdog);
      }
    }
    render().catch(() => { if (active) setMode("iframe"); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; abort.abort(); container.replaceChildren(); };
  }, [url, pdf, mode]);

  return <div className="min-w-0 rounded-xl border bg-[var(--surface)]">
    <h3 className="flex items-center justify-between gap-2 border-b px-4 py-3 text-sm font-bold">{title}{pdf && <a href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--accent)] hover:underline">Open in new tab</a>}</h3>
    {word && <><p className="px-4 py-2 text-xs text-[var(--muted)]">Word preview of the downloadable file. Desktop Word may paginate differently.</p><div ref={wordRef} className="h-[65vh] min-h-96 overflow-auto bg-slate-100 text-slate-950 [&_.docx-wrapper]:!p-2 [&_section.docx]:!max-w-full" /></>}
    {pdf && mode === "canvas" && <div ref={pdfRef} aria-busy={busy} className="h-[65vh] min-h-96 overflow-auto bg-slate-100 p-3 text-slate-950" />}
    {pdf && mode === "iframe" && <iframe title={title} src={url} className="h-[65vh] min-h-96 w-full bg-white" />}
    {pdf && busy && mode === "canvas" && !error && <p className="px-4 pb-3 text-xs text-[var(--muted)]">Rendering pages…</p>}
    {error && <p role="alert" className="p-4 text-sm text-[var(--danger)]">{error}</p>}
  </div>;
}
