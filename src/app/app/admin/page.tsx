import Link from "next/link";
import { AdminCreditConsole } from "@/components/admin-credit-console";
import { Card } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function AdminPage() {
  try {
    await requirePlatformAdmin();
  } catch {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl font-bold">Administration access required</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">This console is limited to platform administrators. Your account is not on the administration allowlist.</p>
        <Link href="/app" className="mt-6 inline-flex min-h-11 items-center rounded-xl border bg-[var(--surface)] px-4 text-sm font-bold shadow-sm hover:bg-[var(--subtle)]">Back to workspace</Link>
      </Card>
    );
  }
  return <AdminCreditConsole />;
}
