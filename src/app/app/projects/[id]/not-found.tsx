import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function ProjectNotFound() {
  return <div className="surface-panel rounded-2xl py-20 text-center"><FileQuestion aria-hidden="true" className="mx-auto text-[var(--muted)]" size={34} /><h1 className="mt-4 text-2xl font-bold">Project not found</h1><p className="mt-2 text-[var(--muted)]">It may have been deleted or belongs to another workspace.</p><Link href="/app" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[var(--primary)] px-5 font-semibold text-white dark:text-[#0e1724]">Return to dashboard</Link></div>;
}
