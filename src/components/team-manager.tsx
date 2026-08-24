"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, LoaderCircle, MailPlus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { WorkspaceRole } from "@/types/domain";

interface Member { id: string; name: string; email: string; role: WorkspaceRole }

export function TeamManager({ workspaceId, kind, role, members }: { workspaceId?: string; kind?: string; role?: WorkspaceRole; members: Member[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("translator");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("");
  const canManage = role === "owner" || role === "admin";

  async function invite(event: React.FormEvent) {
    event.preventDefault(); if (!workspaceId) return;
    setBusy(true); setError(null); setMessage(null);
    const response = await fetch(`/api/v1/workspaces/${workspaceId}/invites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role: inviteRole }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) setError(payload.error?.message ?? "Invite could not be created.");
    else { setEmail(""); setMessage("Invitation created. Email delivery can be connected after SMTP is configured."); }
  }

  async function createOrganization(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const response = await fetch("/api/v1/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: organizationName }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) { setError(payload.error?.message ?? "Organization could not be created."); return; }
    document.cookie = `eatai_workspace=${encodeURIComponent(payload.data.id)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return <div><div className="max-w-3xl"><p className="text-sm font-semibold text-[var(--accent)]">Workspace access</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Members & roles</h1><p className="mt-3 leading-7 text-[var(--muted)]">Separate translation and approval responsibilities with Owner, Admin, Translator, and Reviewer roles.</p></div>{kind === "personal" && <Card className="mt-8 p-5 sm:p-6"><div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end"><div><h2 className="font-bold">Create an organization workspace</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Organization workspaces add invitations, separated roles, review assignments, and owner controls.</p></div><form onSubmit={createOrganization} className="flex flex-col gap-3 sm:flex-row"><div><label htmlFor="organization-name" className="sr-only">Organization name</label><input id="organization-name" required minLength={2} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base sm:w-64" placeholder="Organization name" /></div><Button type="submit" disabled={busy}>{busy && <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />} Create</Button></form></div></Card>}<div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
    <Card className="overflow-hidden"><div className="border-b px-5 py-4 sm:px-6"><h2 className="font-bold">Workspace members</h2><p className="mt-1 text-sm capitalize text-[var(--muted)]">{kind ?? "unconfigured"} workspace</p></div>{members.length ? <div className="divide-y">{members.map((member) => <div key={member.id} className="flex min-h-18 items-center gap-3 px-5 py-3 sm:px-6"><span className="grid size-10 place-items-center rounded-xl bg-[var(--subtle)]"><UserRound aria-hidden="true" size={19} /></span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{member.name}</p><p className="truncate text-sm text-[var(--muted)]">{member.email}</p></div><Badge className="capitalize">{member.role}</Badge></div>)}</div> : <div className="py-14 text-center"><Building2 aria-hidden="true" className="mx-auto text-[var(--muted)]" size={31} /><h3 className="mt-4 font-bold">No member data</h3><p className="mt-2 text-sm text-[var(--muted)]">Connect Supabase or switch to an organization workspace.</p></div>}</Card>
    <Card className="p-5"><span className="grid size-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><MailPlus aria-hidden="true" size={20} /></span><h2 className="mt-5 font-bold">Invite a teammate</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Invitations expire after seven days and are restricted to the selected role.</p><form onSubmit={invite} className="mt-5 space-y-4"><div><label htmlFor="invite-email" className="mb-2 block text-sm font-bold">Email address</label><input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={!canManage} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base" placeholder="reviewer@company.com" /></div><div><label htmlFor="invite-role" className="mb-2 block text-sm font-bold">Role</label><select id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as WorkspaceRole)} disabled={!canManage} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base">{["admin", "translator", "reviewer"].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></div><Button type="submit" className="w-full" disabled={!canManage || busy || !workspaceId}>{busy && <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />} Create invitation</Button></form>{!canManage && <p className="mt-3 text-sm text-[var(--warning)]">Only owners and administrators can invite members.</p>}{message && <p aria-live="polite" className="mt-3 text-sm text-[var(--success)]">{message}</p>}{error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}</Card>
  </div></div>;
}
