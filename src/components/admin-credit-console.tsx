"use client";

import { useState } from "react";
import { Coins, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface UserResult { id: string; email: string; displayName: string; personalWorkspaceId?: string; balance?: number }

export function AdminCreditConsole() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<UserResult | null>(null);
  const [amount, setAmount] = useState("1000");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"search" | "grant" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault(); setBusy("search"); setError(null);
    const response = await fetch(`/api/v1/admin/users?q=${encodeURIComponent(query)}`);
    const payload = await response.json(); setBusy(null);
    if (!response.ok) setError(payload.error?.message ?? "Search failed."); else setResults(payload.data);
  }
  async function grant(event: React.FormEvent) {
    event.preventDefault(); if (!selected?.personalWorkspaceId) return; setBusy("grant"); setError(null); setMessage(null);
    const response = await fetch("/api/v1/admin/credits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: selected.personalWorkspaceId, amount: Number(amount), reason }) });
    const payload = await response.json(); setBusy(null);
    if (!response.ok) setError(payload.error?.message ?? "Grant failed."); else { setMessage(`Granted ${Number(amount).toLocaleString()} credits. Ledger entry ${payload.data.ledgerId}.`); setReason(""); }
  }
  return <div><div className="max-w-3xl"><p className="text-sm font-semibold text-[var(--accent)]">Internal administration</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Beta credit controls</h1><p className="mt-3 leading-7 text-[var(--muted)]">Search verified accounts and issue a manual credit grant. Every adjustment records the author, reason, timestamp, and resulting balance.</p></div><div className="mt-8 grid gap-6 xl:grid-cols-[1fr_420px]">
    <Card className="overflow-hidden"><form onSubmit={search} className="flex gap-3 border-b p-5"><div className="relative flex-1"><label htmlFor="user-search" className="sr-only">Search users</label><Search aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={17} /><input id="user-search" required value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] ps-10 pe-3 text-base" placeholder="Email or display name" /></div><Button type="submit" variant="secondary" disabled={busy === "search"}>{busy === "search" && <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />} Search</Button></form>{results.length ? <div className="divide-y">{results.map((user) => <button key={user.id} type="button" onClick={() => setSelected(user)} className="flex min-h-18 w-full items-center gap-3 px-5 text-start hover:bg-[var(--subtle)]"><span className="grid size-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><ShieldCheck aria-hidden="true" size={18} /></span><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{user.displayName || user.email}</span><span className="block truncate text-sm text-[var(--muted)]">{user.email}</span></span><span className="text-sm font-bold tabular-nums">{Number(user.balance ?? 0).toLocaleString()}</span></button>)}</div> : <div className="py-14 text-center text-sm text-[var(--muted)]">Search for a user to inspect their personal beta account.</div>}</Card>
    <Card className="p-6"><span className="grid size-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Coins aria-hidden="true" size={20} /></span><h2 className="mt-5 font-bold">Issue manual grant</h2><p className="mt-2 text-sm text-[var(--muted)]">{selected ? `Selected: ${selected.email}` : "Select an account from the search results."}</p><form onSubmit={grant} className="mt-5 space-y-4"><div><label htmlFor="grant-amount" className="mb-2 block text-sm font-bold">Word credits</label><input id="grant-amount" type="number" min="1" max="1000000" required value={amount} onChange={(event) => setAmount(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base" /></div><div><label htmlFor="grant-reason" className="mb-2 block text-sm font-bold">Reason</label><textarea id="grant-reason" required minLength={8} value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-28 w-full rounded-xl border bg-[var(--surface)] p-3 text-base" placeholder="Beta research participant extension" /></div><Button type="submit" className="w-full" disabled={!selected?.personalWorkspaceId || busy === "grant"}>{busy === "grant" && <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />} Grant credits</Button></form>{message && <p aria-live="polite" className="mt-4 text-sm leading-6 text-[var(--success)]">{message}</p>}{error && <p role="alert" className="mt-4 text-sm leading-6 text-[var(--danger)]">{error}</p>}</Card>
  </div></div>;
}
