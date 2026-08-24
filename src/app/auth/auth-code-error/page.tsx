import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Brand } from "@/components/brand";

export default function AuthCodeErrorPage() {
  return (
    <main id="main-content" className="grid min-h-dvh place-items-center px-4">
      <div className="surface-panel w-full max-w-md rounded-2xl p-8 text-center">
        <Brand className="justify-center" />
        <AlertTriangle aria-hidden="true" className="mx-auto mt-8 text-[var(--warning)]" size={34} />
        <h1 className="mt-4 text-2xl font-bold">That sign-in link could not be used</h1>
        <p className="mt-3 leading-7 text-[var(--muted)]">It may have expired or already been opened. Request a new secure link and try again.</p>
        <Link href="/auth/sign-in" className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-[var(--primary)] px-5 font-semibold text-white dark:text-[#0e1724]">Return to sign in</Link>
      </div>
    </main>
  );
}
