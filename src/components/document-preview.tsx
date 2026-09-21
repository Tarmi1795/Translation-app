"use client";

import { useEffect, useRef, useState } from "react";

// PDF preview strategy: render through pdfjs onto canvases (works even when
// browser PDF plugins / "download PDFs" settings replace embeds with a
// placeholder), and fall back to a native iframe when canvas rendering does
// not complete. DOCX uses docx-preview.
//
// When segment overlays are supplied (translated PDFs with known positions),
// each rendered page hosts editable text pinned to its segment regions — a
// WYSIWYG correction surface. Edits are committed on blur via onOverlayEdit.
const CANVAS_WATCHDOG_MS = 15_000;

export interface PreviewOverlay {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  text: string;
}

export function DocumentPreview({ url, mimeType, title, overlays = [], onOverlayEdit, overlayDir = "rtl" }: {
  url: string;
  mimeType: string;
  title: string;
  overlays?: PreviewOverlay[];
  onOverlayEdit?: (id: string, text: string) => Promise<boolean>;
  overlayDir?: "ltr" | "rtl";
}) {
  const wordRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const overlaysRef = useRef(overlays);
  const editRef = useRef(onOverlayEdit);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"canvas" | "iframe">("canvas");
  const word = mimeType.includes("wordprocessingml");
  const pdf = mimeType.includes("pdf");

  // Refs are synced in effects (not during render) per the React compiler rules.
  useEffect(() => { overlaysRef.current = overlays; }, [overlays]);
  useEffect(() => { editRef.current = onOverlayEdit; }, [onOverlayEdit]);

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
        const editables = overlaysRef.current;
        const pages = Math.min(doc.numPages, 30);
        for (let number = 1; number <= pages; number += 1) {
          const page = await doc.getPage(number);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.max(1, Math.min(2, 720 / base.width));
          const viewport = page.getViewport({ scale });
          const wrapper = document.createElement("div");
          wrapper.style.cssText = "position:relative;margin:0 auto 1rem;width:fit-content;max-width:100%;container-type:inline-size;line-height:0";
          const canvas = document.createElement("canvas");
          canvas.dir = "ltr";
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "block max-w-full rounded shadow-sm";
          wrapper.appendChild(canvas);
          // Overlay layer: positioned in % of the page so it stays pinned to
          // the render at any width; font sizes scale via container units.
          const pageOverlays = editables.filter((overlay) => overlay.page === number && overlay.width > 0 && overlay.height > 0);
          if (pageOverlays.length) {
            const layer = document.createElement("div");
            layer.style.cssText = "position:absolute;inset:0";
            for (const overlay of pageOverlays) {
              const field = document.createElement("div");
              field.contentEditable = "true";
              field.spellcheck = false;
              field.dataset.segmentId = overlay.id;
              field.dir = overlayDir;
              field.textContent = overlay.text;
              field.style.cssText = [
                `left:${(overlay.x / base.width) * 100}%`,
                `top:${(overlay.y / base.height) * 100}%`,
                `width:${(overlay.width / base.width) * 100}%`,
                `min-height:${(overlay.height / base.height) * 100}%`,
                `font-size:${(overlay.fontSize / base.width) * 100}cqw`,
                "position:absolute",
                "line-height:1.3",
                "padding:0.15em 0.25em",
                "border:1px dashed transparent",
                "border-radius:2px",
                "background:rgba(255,255,255,0.94)",
                "color:#111827",
                "overflow:visible",
                "cursor:text",
                "transition:border-color 120ms",
              ].join(";");
              field.addEventListener("focus", () => { field.style.borderColor = "#0ea5e9"; field.style.zIndex = "5"; });
              field.addEventListener("blur", async () => {
                field.style.borderColor = "transparent";
                field.style.zIndex = "";
                const next = (field.textContent ?? "").replace(/\s+\n/g, "\n").trim();
                const original = editables.find((item) => item.id === overlay.id)?.text ?? "";
                if (next === original.trim()) return;
                if (!editRef.current) return;
                field.style.opacity = "0.6";
                const ok = await editRef.current(overlay.id, next);
                field.style.opacity = ok ? "1" : "0.9";
                if (!ok) field.textContent = original;
              });
              field.addEventListener("keydown", (event) => {
                if ((event as KeyboardEvent).key === "Escape") {
                  field.textContent = editables.find((item) => item.id === overlay.id)?.text ?? "";
                  field.blur();
                }
              });
              layer.appendChild(field);
            }
            wrapper.appendChild(layer);
          }
          wrapper.appendChild(canvas);
          if (!active) return;
          container.appendChild(wrapper);
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
    // Overlays are read through a ref on purpose: text edits flow back through
    // onOverlayEdit, so the render must not restart on every state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, pdf, mode]);

  // Keep overlay text in sync when segment text changes elsewhere (e.g. the
  // Text corrections tab or a rebuild), without touching the rendered pages.
  useEffect(() => {
    if (!pdf || !pdfRef.current) return;
    for (const overlay of overlays) {
      const field = pdfRef.current.querySelector<HTMLDivElement>(`[data-segment-id="${overlay.id}"]`);
      if (field && document.activeElement !== field && field.textContent !== overlay.text) field.textContent = overlay.text;
    }
  }, [overlays, pdf]);

  return <div className="min-w-0 rounded-xl border bg-[var(--surface)]">
    <h3 className="flex items-center justify-between gap-2 border-b px-4 py-3 text-sm font-bold">{title}{pdf && <a href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--accent)] hover:underline">Open in new tab</a>}</h3>
    {word && <><p className="px-4 py-2 text-xs text-[var(--muted)]">Word preview of the downloadable file. Desktop Word may paginate differently.</p><div ref={wordRef} className="h-[65vh] min-h-96 overflow-auto bg-slate-100 text-slate-950 [&_.docx-wrapper]:!p-2 [&_section.docx]:!max-w-full" /></>}
    {pdf && mode === "canvas" && <div ref={pdfRef} aria-busy={busy} className="h-[65vh] min-h-96 overflow-auto bg-slate-100 p-3 text-slate-950" />}
    {pdf && mode === "iframe" && <iframe title={title} src={url} className="h-[65vh] min-h-96 w-full bg-white" />}
    {pdf && busy && mode === "canvas" && !error && <p className="px-4 pb-3 text-xs text-[var(--muted)]">Rendering pages…</p>}
    {error && <p role="alert" className="p-4 text-sm text-[var(--danger)]">{error}</p>}
  </div>;
}
