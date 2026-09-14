"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { UploadCloud, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrandingAsset, BrandingSelection } from "@/types/domain";

export function BrandingPicker({ workspaceId, value, onChange, disabled = false, sourceHasLetterhead = false }: { workspaceId: string; value: BrandingSelection[]; onChange: (items: BrandingSelection[]) => void; disabled?: boolean; sourceHasLetterhead?: boolean }) {
  const [assets, setAssets] = useState<BrandingAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; startX: number; startY: number } | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/v1/workspaces/${workspaceId}/branding`, { signal: abort.signal, cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Saved branding could not be loaded.");
      setAssets(payload.data);
    }).catch((reason) => { if (!abort.signal.aborted) setError(String(reason.message)); });
    return () => abort.abort();
  }, [workspaceId]);

  function update(id: string, patch: Partial<BrandingSelection>) {
    onChange(value.map((item) => item.assetId === id ? { ...item, ...patch } : item));
  }

  async function upload(file: File | undefined, kind: "letterhead" | "stamp") {
    if (!file || disabled || busy) return;
    setBusy(true); setError(null); setMessage("");
    try {
      const form = new FormData(); form.append("file", file); form.append("kind", kind);
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/branding`, { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "The image could not be saved.");
      const reload = await fetch(`/api/v1/workspaces/${workspaceId}/branding`, { cache: "no-store" });
      const refreshed = await reload.json();
      if (!reload.ok) throw new Error("Saved image could not be loaded. Please retry.");
      const nextAssets: BrandingAsset[] = refreshed.data;
      setAssets(nextAssets);
      const asset = nextAssets.find((item) => item.id === payload.data.id);
      if (asset) onChange([...value.filter((item) => assets.find((a) => a.id === item.assetId)?.kind !== kind), { assetId: asset.id, ...asset.placement, skipIfPresent: true, alreadyPresent: false }]);
      setMessage("Saved to this workspace. Adjust placement below and save it for next time.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed."); }
    finally { setBusy(false); }
  }

  async function savePlacement(item: BrandingSelection) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/branding`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: item.assetId, placement: { x: item.x, y: item.y, width: item.width, pages: item.pages } }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Placement could not be saved.");
      setAssets((current) => current.map((asset) => asset.id === item.assetId ? { ...asset, placement: { x: item.x, y: item.y, width: item.width, pages: item.pages } } : asset));
      setMessage("Placement saved for future documents.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Save failed."); }
    finally { setBusy(false); }
  }

  return <fieldset disabled={disabled || busy} className="mt-5 min-w-0 rounded-2xl border p-4">
    <legend className="px-2 font-bold">Letterhead & stamp <span className="font-normal text-[var(--muted)]">(optional)</span></legend>
    <p className="text-sm leading-6 text-[var(--muted)]">Choose saved branding or drop a PNG/JPG below. Drag to position, or use the controls. Images keep their proportions.</p>
    {sourceHasLetterhead && <p className="mt-2 text-sm text-[var(--warning)]">A graphic header was detected in the original. Duplicate letterhead will be skipped by default.</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {(["letterhead", "stamp"] as const).map((kind) => <div key={kind} className="min-w-0">
        <label htmlFor={`${kind}-choice`} className="mb-2 block text-sm font-semibold capitalize">{kind}</label>
        <select id={`${kind}-choice`} value={value.find((item) => assets.find((a) => a.id === item.assetId)?.kind === kind)?.assetId ?? ""} onChange={(event) => {
          const remaining = value.filter((item) => assets.find((a) => a.id === item.assetId)?.kind !== kind);
          const asset = assets.find((item) => item.id === event.target.value);
          onChange(asset ? [...remaining, { assetId: asset.id, ...asset.placement, skipIfPresent: true, alreadyPresent: false }] : remaining);
        }} className="min-h-11 w-full rounded-lg border bg-[var(--surface)] px-3 text-sm"><option value="">Keep original only</option>{assets.filter((item) => item.kind === kind).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <label className="mt-2 flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 text-center text-sm" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void upload(event.dataTransfer.files[0], kind); }}><UploadCloud size={18} aria-hidden="true" /> Drop or choose {kind}<input className="sr-only" type="file" accept="image/png,image/jpeg" onChange={(event) => { void upload(event.target.files?.[0], kind); event.target.value = ""; }} /></label>
      </div>)}
    </div>
    {value.length > 0 && <div className="mt-5 grid gap-5 md:grid-cols-[minmax(150px,240px)_1fr]">
      <div>
        <div ref={pageRef} className="relative aspect-[210/297] overflow-hidden rounded-sm border bg-white shadow-sm" aria-label="Branding placement on an A4 reference page">
          <div aria-hidden="true" className="absolute inset-x-[10%] top-[30%] h-[40%] border-y border-dashed border-slate-300 text-center text-xs text-slate-400">Document content</div>
          {value.map((item) => { const asset = assets.find((asset) => asset.id === item.assetId); return asset && !item.alreadyPresent ? <button key={item.assetId} type="button" aria-label={`Move ${asset.kind}; use arrow keys for fine adjustments`} className="absolute cursor-move touch-none border border-dashed border-sky-600 focus:outline-2 focus:outline-sky-600" style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, aspectRatio: `${asset.width}/${asset.height}` }} onKeyDown={(event) => { const offsets: Record<string, [number, number]> = { ArrowLeft: [-0.01,0], ArrowRight: [0.01,0], ArrowUp: [0,-0.01], ArrowDown: [0,0.01] }; if (offsets[event.key]) { event.preventDefault(); const [x,y] = offsets[event.key]; update(item.assetId, { x: Math.max(0, Math.min(1-item.width, item.x+x)), y: Math.max(0, Math.min(0.98, item.y+y)) }); } }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: item.assetId, x: item.x, y: item.y, startX: event.clientX, startY: event.clientY }; }} onPointerMove={(event) => { const active = drag.current; const page = pageRef.current?.getBoundingClientRect(); if (!active || active.id !== item.assetId || !page) return; update(item.assetId, { x: Math.max(0, Math.min(1-item.width, active.x+(event.clientX-active.startX)/page.width)), y: Math.max(0, Math.min(0.98, active.y+(event.clientY-active.startY)/page.height)) }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><Image src={asset.previewUrl} alt={asset.name} fill unoptimized sizes="240px" className="pointer-events-none object-contain" /></button> : null; })}
        </div><p className="mt-2 text-xs leading-5 text-[var(--muted)]">A4 placement guide. Check the rendered output for your source page size.</p>
      </div>
      <div className="space-y-5">{value.map((item) => { const asset = assets.find((a) => a.id === item.assetId); return asset ? <div key={item.assetId} className="space-y-3">
        <p className="truncate text-sm font-bold">{asset.name}</p>
        <div className="grid grid-cols-3 gap-2">{(["x", "y", "width"] as const).map((field) => <label key={field} className="text-xs font-semibold">{field === "x" ? "Left %" : field === "y" ? "Top %" : "Width %"}<input aria-label={`${asset.kind} ${field} percentage`} type="number" min={field === "width" ? 2 : 0} max={100} step={1} value={Math.round(item[field]*100)} onChange={(event) => { const n = Number(event.target.value)/100; if (Number.isFinite(n)) update(item.assetId, { [field]: Math.max(field === "width" ? 0.02 : 0, Math.min(field === "width" ? 1-item.x : field === "x" ? 1-item.width : 0.98, n)) }); }} className="mt-1 min-h-11 w-full rounded-lg border bg-[var(--surface)] px-2 text-sm" /></label>)}</div>
        <label className="block text-xs font-semibold">Apply to<select value={item.pages} onChange={(event) => update(item.assetId, { pages: event.target.value as BrandingSelection["pages"] })} className="mt-1 min-h-11 w-full rounded-lg border bg-[var(--surface)] px-2 text-sm"><option value="first">First page</option><option value="all">Every page</option><option value="last">Last page</option></select></label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={item.alreadyPresent} onChange={(event) => update(item.assetId, { alreadyPresent: event.target.checked })} />Already in source — skip this image</label>
        <Button type="button" variant="secondary" size="sm" onClick={() => savePlacement(item)}><Save size={15} aria-hidden="true" />Save placement for next time</Button>
      </div> : null; })}</div>
    </div>}
    <div aria-live="polite" className="mt-3 text-sm">{busy && <p>Saving branding…</p>}{message && <p className="text-[var(--success)]">{message}</p>}{error && <p role="alert" className="text-[var(--danger)]">{error}</p>}</div>
  </fieldset>;
}
