"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookMarked,
  ChevronDown,
  FileText,
  Gauge,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { UiControls } from "@/components/ui-controls";
import { createClient } from "@/lib/supabase/browser";
import { cn, formatNumber, initials } from "@/lib/utils";
import type { WorkspaceSummary } from "@/lib/workspace-context";

const navigation = [
  { href: "/app", label: "Overview", icon: Gauge },
  { href: "/app/translate", label: "New translation", icon: FileText },
  { href: "/app/glossary", label: "Glossary & memory", icon: BookMarked },
  { href: "/app/team", label: "Team", icon: UsersRound },
  { href: "/app/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({
  children,
  user,
  workspaces,
  activeWorkspace,
  creditBalance,
  isPlatformAdmin,
}: {
  children: React.ReactNode;
  user: { email?: string; name: string };
  workspaces: WorkspaceSummary[];
  activeWorkspace: WorkspaceSummary | null;
  creditBalance: number;
  isPlatformAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  // Optimistic highlight: the clicked menu item activates immediately instead
  // of waiting ~1s for the round trip to the server region.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [renderedPathname, setRenderedPathname] = useState(pathname);
  if (renderedPathname !== pathname) {
    setRenderedPathname(pathname);
    setPendingHref(null);
  }
  const currentPage = navigation.find(({ href }) => href === "/app" ? pathname === href : pathname.startsWith(href))?.label ?? (pathname.startsWith("/app/admin") ? "Beta administration" : "Workspace");
  const creditPercent = Math.min(100, Math.max(0, (creditBalance / Math.max(5000, creditBalance)) * 100));

  useEffect(() => {
    if (!workspaceOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") { setWorkspaceOpen(false); return; }
      if (event instanceof MouseEvent && workspaceRef.current && !workspaceRef.current.contains(event.target as Node)) setWorkspaceOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [workspaceOpen]);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/");
    router.refresh();
  }

  async function selectWorkspace(id: string) {
    try {
      const response = await fetch("/api/v1/workspaces/active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: id }) });
      if (!response.ok) { setWorkspaceError("The workspace could not be changed. Please try again."); return; }
      setWorkspaceError(null);
      setWorkspaceOpen(false);
      if (pathname !== "/app") router.replace("/app");
      router.refresh();
    } catch { setWorkspaceError("The workspace could not be changed. Please try again."); }
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex min-h-18 items-center justify-between border-b px-4">
        <Brand />
        <button type="button" onClick={() => setMobileOpen(false)} className="grid size-11 place-items-center rounded-xl transition-colors hover:bg-[var(--subtle)] lg:hidden" aria-label="Close navigation"><X aria-hidden="true" size={20} /></button>
      </div>

      <div ref={workspaceRef} className="relative mx-3 mt-4">
        {workspaceError && <p role="alert" className="mb-2 text-sm text-[var(--danger)]">{workspaceError}</p>}
        <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Current workspace</p>
        <button type="button" onClick={() => setWorkspaceOpen((open) => !open)} className="interactive-surface flex min-h-14 w-full items-center gap-3 rounded-xl border bg-[var(--surface)] px-3 text-start" aria-expanded={workspaceOpen} aria-haspopup="listbox">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent)] ring-1 ring-inset ring-[color:color-mix(in_srgb,var(--accent)_16%,transparent)]">{initials(activeWorkspace?.name ?? "Workspace")}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{activeWorkspace?.name ?? "No workspace"}</span><span className="block text-xs capitalize text-[var(--muted)]">{activeWorkspace?.role ?? "Configure Supabase"}</span></span>
          <ChevronDown aria-hidden="true" size={17} className={cn("text-[var(--muted)] transition-transform duration-200", workspaceOpen && "rotate-180")} />
        </button>
        {workspaceOpen && workspaces.length > 0 && (
          <div className="glass-panel page-enter absolute inset-x-0 top-[calc(100%+.5rem)] z-50 rounded-xl p-2 shadow-[var(--shadow-lg)]" role="listbox" aria-label="Select workspace">
            {workspaces.map((workspace) => (
              <button key={workspace.id} type="button" role="option" aria-selected={workspace.id === activeWorkspace?.id} onClick={() => selectWorkspace(workspace.id)} className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-start text-sm font-semibold transition-colors hover:bg-[var(--subtle)]"><span className="truncate">{workspace.name}</span>{workspace.id === activeWorkspace?.id && <span className="size-2 rounded-full bg-[var(--accent)]" />}</button>
            ))}
          </div>
        )}
      </div>

      <nav className="mt-6 flex-1 space-y-1 px-3" aria-label="Workspace navigation">
        <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Workspace</p>
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = href === "/app" ? pathname === href : pathname.startsWith(href);
          return (
            <Link key={href} href={href} onClick={() => { setMobileOpen(false); if (href !== pathname) setPendingHref(href); }} aria-current={active ? "page" : undefined} className={cn("group relative flex min-h-11 items-center gap-3 rounded-xl px-2.5 text-sm font-semibold transition-[background-color,color,transform] duration-200 active:scale-[0.99]", active || pendingHref === href ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--muted)] hover:bg-[var(--subtle)] hover:text-[var(--foreground)]")}>
              {active && <span className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-[var(--accent)]" />}
              <span className={cn("grid size-8 place-items-center rounded-lg transition-colors", active ? "bg-[color:color-mix(in_srgb,var(--accent)_10%,var(--surface))]" : "group-hover:bg-[var(--surface)]")}><Icon aria-hidden="true" size={18} strokeWidth={1.8} /></span> {label}
            </Link>
          );
        })}
        {isPlatformAdmin && (
          <Link href="/app/admin" onClick={() => setMobileOpen(false)} aria-current={pathname.startsWith("/app/admin") ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold", pathname.startsWith("/app/admin") ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--muted)] hover:bg-[var(--subtle)] hover:text-[var(--foreground)]")}>
            <ShieldCheck aria-hidden="true" size={19} /> Beta administration
          </Link>
        )}
      </nav>

      <div className="m-3 rounded-2xl border bg-[var(--surface-muted)] p-3.5">
        <div className="flex items-center justify-between text-xs font-semibold text-[var(--muted)]"><span>Beta credits</span><span className="tabular-nums text-[var(--foreground)]">{formatNumber(creditBalance)}</span></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--border)]"><div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${creditPercent}%` }} /></div>
        <p className="mt-2.5 text-[11px] leading-4 text-[var(--muted)]">One source word uses one credit.</p>
      </div>
      <div className="mx-3 mb-3 flex items-center gap-2 border-t pt-3">
        <span title={user.email} className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--primary)] text-xs font-bold text-white dark:text-[#0e1724]">{initials(user.name)}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{user.name}</span><span className="block truncate text-[11px] text-[var(--muted)]">{user.email}</span></span>
        <button type="button" onClick={signOut} className="grid size-11 shrink-0 place-items-center rounded-xl text-[var(--muted)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--foreground)]" aria-label="Sign out"><LogOut aria-hidden="true" size={18} /></button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[270px_1fr]">
      <aside className="fixed inset-y-0 start-0 z-50 hidden w-[270px] border-e bg-[var(--surface-raised)] backdrop-blur-xl lg:block">{sidebar}</aside>
      {mobileOpen && <div className="page-enter fixed inset-0 z-50 bg-black/55 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)}><aside className="h-full w-[min(86vw,310px)] bg-[var(--surface)] shadow-[var(--shadow-lg)]" onClick={(event) => event.stopPropagation()}>{sidebar}</aside></div>}
      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-40 flex min-h-18 items-center justify-between gap-4 border-b bg-[color:color-mix(in_srgb,var(--background)_88%,transparent)] px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileOpen(true)} className="grid size-11 shrink-0 place-items-center rounded-xl border bg-[var(--surface)] lg:hidden" aria-label="Open navigation"><Menu aria-hidden="true" size={20} /></button>
            <div className="min-w-0"><p className="truncate text-sm font-bold">{currentPage}</p><p className="truncate text-xs text-[var(--muted)]">{activeWorkspace?.name ?? "English Arabic Translate AI"}</p></div>
          </div>
          <div className="flex items-center gap-2"><span className="hidden items-center gap-2 rounded-full border bg-[var(--surface)] px-3 py-2 text-xs font-bold text-[var(--foreground)] shadow-sm sm:inline-flex"><span className="status-dot size-1.5 rounded-full bg-[var(--success)]" />{formatNumber(creditBalance)} words</span><UiControls /></div>
        </header>
        <main key={pathname} id="main-content" className="page-enter mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
