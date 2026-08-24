import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { UiControls } from "@/components/ui-controls";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main id="main-content" className="grid min-h-dvh lg:grid-cols-[.9fr_1.1fr]">
      <section className="flex flex-col border-e bg-[var(--surface)] px-4 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between">
          <Brand />
          <UiControls />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          <Link href="/" className="mb-8 inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]">
            <ArrowLeft aria-hidden="true" size={17} className="rtl:rotate-180" /> Back to home
          </Link>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Free beta access</p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Your bilingual workspace</h1>
          <p className="mt-4 leading-7 text-[var(--muted)]">Sign in to receive your one-time 5,000-word credit grant and create your private workspace.</p>
          <div className="mt-8">
            <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-[var(--subtle)]" aria-label="Loading sign-in options" />}>
              <SignInForm />
            </Suspense>
          </div>
          <p className="mt-6 text-xs leading-5 text-[var(--muted)]">By continuing, you agree to responsible use of the beta. AI-assisted drafts require human review and are not legally certified.</p>
        </div>
      </section>
      <aside className="document-grid relative hidden overflow-hidden p-12 lg:flex lg:items-center lg:justify-center" aria-label="Product benefits">
        <div className="glass-panel relative z-10 max-w-lg rounded-[2rem] p-9 shadow-[var(--shadow-lg)]">
          <span className="grid size-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><ShieldCheck aria-hidden="true" size={24} /></span>
          <h2 className="mt-8 text-3xl font-bold tracking-[-0.035em]">Professional control at every step.</h2>
          <ul className="mt-7 space-y-5 text-[var(--muted)]">
            {["Private translation memory for your workspace", "Side-by-side editing, review, and approval", "Audited word-credit accounting with no card required"].map((item) => (
              <li key={item} className="flex gap-3 leading-7"><CheckCircle2 aria-hidden="true" className="mt-1 shrink-0 text-[var(--success)]" size={19} /> {item}</li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}
