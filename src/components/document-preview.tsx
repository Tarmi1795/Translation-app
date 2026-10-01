"use client";

import { useEffect, useRef, useState } from "react";

// PDFs preview through the browser's native viewer in an iframe — the one
// path that renders deterministically everywhere. (A pdfjs canvas renderer
// was tried but its worker handshake hangs in a subset of browsers, leaving
// blank panes.) DOCX previews through docx-preview.
export function DocumentPreview({ url, mimeType, title }: { url: string; mimeType: string; title: string }) {
  const wordRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const word = mimeType.includes("wordprocessingml");

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

  return <div className="min-w-0 rounded-xl border bg-[var(--surface)]">
    <h3 className="flex items-center justify-between gap-2 border-b px-4 py-3 text-sm font-bold">{title}{mimeType.includes("pdf") && <a href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--accent)] hover:underline">Open in new tab</a>}</h3>
    {word && <><p className="px-4 py-2 text-xs text-[var(--muted)]">Word preview of the downloadable file. Desktop Word may paginate differently.</p><div ref={wordRef} className="h-[65vh] min-h-96 overflow-auto bg-slate-100 text-slate-950 [&_.docx-wrapper]:!p-2 [&_section.docx]:!max-w-full" /></>}
    {!word && <iframe title={title} src={url} className="h-[65vh] min-h-96 w-full bg-white" />}
    {error && <p role="alert" className="p-4 text-sm text-[var(--danger)]">{error}</p>}
  </div>;
}
