"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InviteAccept({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function accept() {
    setBusy(true); setError(null);
    const response = await fetch(`/api/v1/workspaces/invites/${encodeURIComponent(token)}/accept`, { method: "POST" });
    if (response.status === 401) { router.push(`/auth/sign-in?next=/invite/${encodeURIComponent(token)}`); return; }
    const payload = await response.json();
    if (!response.ok) { setError(payload.error?.message ?? "Invitation could not be accepted."); setBusy(false); return; }
    document.cookie = `eatai_workspace=${encodeURIComponent(payload.data.workspaceId)}; path=/; max-age=31536000; samesite=lax`;
    router.push("/app"); router.refresh();
  }
  return <div><Button type="button" size="lg" className="w-full" onClick={accept} disabled={busy}>{busy && <LoaderCircle aria-hidden="true" className="animate-spin" size={18} />} Accept invitation</Button>{error && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p>}</div>;
}
