"use client";

import { useEffect, useRef, useState } from "react";

export function DocumentPreview({ url, mimeType, title }: { url: string; mimeType: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const word = mimeType.includes("wordprocessingml");
  useEffect(() => {
    if (!word || !ref.current) return;
    let active = true;
    const container = ref.current;
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
    <h3 className="border-b px-4 py-3 text-sm font-bold">{title}</h3>
    {word ? <><p className="px-4 py-2 text-xs text-[var(--muted)]">Word preview of the downloadable file. Desktop Word may paginate differently.</p><div ref={ref} className="h-[65vh] min-h-96 overflow-auto bg-slate-100 text-slate-950 [&_.docx-wrapper]:!p-2 [&_section.docx]:!max-w-full" /></> : <iframe title={title} src={url} className="h-[65vh] min-h-96 w-full bg-white" />}
    {error && <p role="alert" className="p-4 text-sm text-[var(--danger)]">{error}</p>}
  </div>;
}
