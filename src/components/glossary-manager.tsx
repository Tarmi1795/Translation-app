"use client";

import { useState } from "react";
import { BookMarked, LoaderCircle, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Term { id: string; sourceTerm: string; targetTerm: string; notes?: string; caseSensitive: boolean }

export function GlossaryManager({ workspaceId, initialTerms, memoryCount }: { workspaceId?: string; initialTerms: Term[]; memoryCount: number }) {
  const [terms, setTerms] = useState(initialTerms);
  const [query, setQuery] = useState("");
  const [sourceTerm, setSourceTerm] = useState("");
  const [targetTerm, setTargetTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filtered = terms.filter((term) => `${term.sourceTerm} ${term.targetTerm}`.toLowerCase().includes(query.toLowerCase()));

  async function addTerm(event: React.FormEvent) {
    event.preventDefault();
    if (!workspaceId) return;
    setBusy(true); setError(null);
    const response = await fetch(`/api/v1/workspaces/${workspaceId}/glossary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceTerm, targetTerm, direction: "en-ar" }) });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) setError(payload.error?.message ?? "Term could not be added.");
    else { setTerms((current) => [{ id: payload.data.id, sourceTerm, targetTerm, caseSensitive: false }, ...current]); setSourceTerm(""); setTargetTerm(""); }
  }

  async function removeTerm(id: string) {
    if (!workspaceId) return;
    const response = await fetch(`/api/v1/workspaces/${workspaceId}/glossary/${id}`, { method: "DELETE" });
    if (response.ok) setTerms((current) => current.filter((term) => term.id !== id));
  }

  return (
    <div>
      <div className="max-w-3xl"><p className="text-sm font-semibold text-[var(--accent)]">Language assets</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Glossary & private memory</h1><p className="mt-3 leading-7 text-[var(--muted)]">Control preferred terminology and reuse only the corrections approved inside this workspace.</p></div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <div className="border-b p-5 sm:p-6"><form onSubmit={addTerm} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><div><label htmlFor="source-term" className="mb-2 block text-sm font-bold">English term</label><input id="source-term" required value={sourceTerm} onChange={(event) => setSourceTerm(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base" placeholder="Force majeure" /></div><div><label htmlFor="target-term" className="mb-2 block text-sm font-bold">Arabic equivalent</label><input id="target-term" dir="rtl" required value={targetTerm} onChange={(event) => setTargetTerm(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base" placeholder="القوة القاهرة" /></div><Button type="submit" className="self-end" disabled={!workspaceId || busy}>{busy ? <LoaderCircle aria-hidden="true" className="animate-spin" size={17} /> : <Plus aria-hidden="true" size={17} />} Add</Button></form>{error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}</div>
          <div className="p-4 sm:p-5"><label htmlFor="term-search" className="sr-only">Search terms</label><div className="relative"><Search aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={17} /><input id="term-search" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] ps-10 pe-3 text-base" placeholder="Search terminology" /></div></div>
          {filtered.length ? <div className="divide-y">{filtered.map((term) => <div key={term.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:px-6"><div><p className="font-semibold">{term.sourceTerm}</p><p className="mt-1 text-xs text-[var(--muted)]">English</p></div><div dir="rtl"><p className="font-semibold">{term.targetTerm}</p><p className="mt-1 text-xs text-[var(--muted)]">العربية</p></div><button type="button" onClick={() => removeTerm(term.id)} className="grid size-11 place-items-center rounded-xl text-[var(--muted)] hover:bg-[color:color-mix(in_srgb,var(--danger)_8%,var(--surface))] hover:text-[var(--danger)]" aria-label={`Delete ${term.sourceTerm}`}><Trash2 aria-hidden="true" size={17} /></button></div>)}</div> : <div className="py-14 text-center"><BookMarked aria-hidden="true" className="mx-auto text-[var(--muted)]" size={30} /><h2 className="mt-4 font-bold">No glossary terms</h2><p className="mt-2 text-sm text-[var(--muted)]">Add preferred terminology for more consistent translations.</p></div>}
        </Card>
        <div className="space-y-4"><Card className="p-5"><p className="text-sm font-semibold text-[var(--muted)]">Private translation memory</p><p className="mt-2 text-3xl font-bold tabular-nums">{memoryCount}</p><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Approved segment pairs available only to this workspace.</p></Card><Card className="p-5"><h2 className="font-bold">How learning works</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Edits become candidates only after approval. Private memory never crosses workspaces. Global learning remains separate and opt-in.</p></Card></div>
      </div>
    </div>
  );
}
