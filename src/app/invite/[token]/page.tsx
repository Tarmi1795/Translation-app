import { Brand } from "@/components/brand";
import { InviteAccept } from "@/components/invite-accept";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main id="main-content" className="grid min-h-dvh place-items-center px-4"><div className="surface-panel w-full max-w-md rounded-2xl p-8 text-center"><Brand className="justify-center" /><h1 className="mt-8 text-2xl font-bold">Join this translation workspace</h1><p className="mt-3 leading-7 text-[var(--muted)]">Accepting gives you the role selected by the workspace administrator. Access is still enforced by row-level security.</p><div className="mt-7"><InviteAccept token={token} /></div></div></main>;
}
