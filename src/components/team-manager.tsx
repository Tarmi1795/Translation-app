"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Copy, ExternalLink, LoaderCircle, MailPlus, UserRound } from "lucide-react";
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
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("");
  const canManage = role === "owner" || role === "admin";

  async function invite(event: React.FormEvent) {
    event.preventDefault(); if (!workspaceId) return;
    setBusy(true); setError(null); setMessage(null); setInviteUrl(null); setCopied(false);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/invites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role: inviteRole }) });
      const payload = await response.json();
      if (!response.ok) { setError(payload.error?.message ?? "Invite could not be created."); return; }
      // Keep the signed token but bind the link to the origin the admin is on,
      // so a misconfigured APP_URL cannot hand out broken invitations.
      const token = typeof payload.data.inviteUrl === "string" ? payload.data.inviteUrl.split("/invite/")[1] : null;
      if (token) { setInviteUrl(`${window.location.origin}/invite/${token}`); setEmail(""); setMessage("Share this link with your teammate — it expires in seven days."); }
      else setMessage("Invitation created. Email delivery can be connected after SMTP is configured.");
    } catch { setError("Invite could not be created. Check your connection and retry."); }
    finally { setBusy(false); }
  }

  async function copyInviteUrl() {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("Copy failed — select the link text and copy it manually."); }
  }

  async function createOrganization(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await fetch("/api/v1/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: organizationName }) });
      const payload = await response.json();
      if (!response.ok) { setError(payload.error?.message ?? "Organization could not be created."); return; }
      await fetch("/api/v1/workspaces/active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: payload.data.id }) });
      setOrganizationName("");
      router.refresh();
    } catch { setError("Organization could not be created. Check your connection and retry."); }
    finally { setBusy(false); }
  }

  return <div><div className="max-w-3xl"><p className="text-sm font-semibold text-[var(--accent)]">Workspace access</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Members & roles</h1><p className="mt-3 leading-7 text-[var(--muted)]">Separate translation and approval responsibilities with Owner, Admin, Translator, and Reviewer roles.</p></div>{kind === "personal" && <Card className="mt-8 p-5 sm:p-6"><div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end"><div><h2 className="font-bold">Create an organization workspace</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Organization workspaces add invitations, separated roles, review assignments, and owner controls.</p></div><form onSubmit={createOrganization} className="flex flex-col gap-3 sm:flex-row"><div><label htmlFor="organization-name" className="sr-only">Organization name</label><input id="organization-name" required minLength={2} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base sm:w-64" placeholder="Organization name" /></div><Button type="submit" disabled={busy}>{busy && <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />} Create</Button></form></div></Card>}<div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
    <Card className="overflow-hidden"><div className="border-b px-5 py-4 sm:px-6"><h2 className="font-bold">Workspace members</h2><p className="mt-1 text-sm capitalize text-[var(--muted)]">{kind ?? "unconfigured"} workspace</p></div>{members.length ? <div className="divide-y">{members.map((member) => <div key={member.id} className="flex min-h-18 items-center gap-3 px-5 py-3 sm:px-6"><span className="grid size-10 place-items-center rounded-xl bg-[var(--subtle)]"><UserRound aria-hidden="true" size={19} /></span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{member.name}</p><p className="truncate text-sm text-[var(--muted)]">{member.email}</p></div><Badge className="capitalize">{member.role}</Badge></div>)}</div> : <div className="py-14 text-center"><Building2 aria-hidden="true" className="mx-auto text-[var(--muted)]" size={31} /><h3 className="mt-4 font-bold">No member data</h3><p className="mt-2 text-sm text-[var(--muted)]">Connect Supabase or switch to an organization workspace.</p></div>}</Card>
    <Card className="p-5"><span className="grid size-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><MailPlus aria-hidden="true" size={20} /></span><h2 className="mt-5 font-bold">Invite a teammate</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Invitations expire after seven days and are restricted to the selected role.</p><form onSubmit={invite} className="mt-5 space-y-4"><div><label htmlFor="invite-email" className="mb-2 block text-sm font-bold">Email address</label><input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={!canManage} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base" placeholder="reviewer@company.com" /></div><div><label htmlFor="invite-role" className="mb-2 block text-sm font-bold">Role</label><select id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as WorkspaceRole)} disabled={!canManage} className="min-h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-base">{["admin", "translator", "reviewer"].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></div><Button type="submit" className="w-full" disabled={!canManage || busy || !workspaceId}>{busy && <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />} Create invitation</Button></form>{!canManage && <p className="mt-3 text-sm text-[var(--warning)]">Only owners and administrators can invite members.</p>}{inviteUrl && <div className="mt-4 rounded-xl border bg-[var(--surface-muted)] p-3"><p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted)]">Invitation link</p><div className="mt-2 flex items-center gap-2"><input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} className="min-h-10 w-full min-w-0 rounded-lg border bg-[var(--surface)] px-2.5 font-mono text-xs" aria-label="Invitation link" /><Button type="button" variant="secondary" size="sm" onClick={copyInviteUrl} aria-label="Copy invitation link">{copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}</Button><a href={inviteUrl} target="_blank" rel="noreferrer" className="grid size-9 shrink-0 place-items-center rounded-lg border bg-[var(--surface)] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]" aria-label="Open invitation page"><ExternalLink aria-hidden="true" size={15} /></a></div><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Anyone opening this link can join as {inviteRole}. Revoke by inviting again or contacting an administrator.</p></div>}{message && <p aria-live="polite" className="mt-3 text-sm text-[var(--success)]">{message}</p>}{error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}</Card>
  </div></div>;
}
