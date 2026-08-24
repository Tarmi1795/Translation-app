"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, LoaderCircle, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { hasSupabaseEnv } from "@/lib/env";
import { Button } from "@/components/ui/button";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next") ?? "/app";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/app";
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configured = hasSupabaseEnv();

  async function signInWithEmail(event: React.FormEvent) {
    event.preventDefault();
    if (!configured) return;
    setLoading("email");
    setMessage(null);
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setLoading(null);
    if (authError) setError(authError.message);
    else setMessage("Check your inbox for a secure sign-in link.");
  }

  async function signInWithProvider(provider: "google" | "azure") {
    if (!configured) return;
    setLoading(provider);
    setError(null);
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        ...(provider === "azure" ? { scopes: "email" } : {}),
      },
    });
    if (authError) {
      setLoading(null);
      setError(authError.message);
    } else if (!data.url) {
      setLoading(null);
      router.refresh();
    }
  }

  return (
    <div>
      {!configured && (
        <div role="alert" className="mb-5 rounded-xl border border-[color:color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_10%,var(--surface))] p-4 text-sm leading-6 text-[var(--warning)]">
          Authentication is ready in code. Add the Supabase variables from <code>.env.example</code> to enable sign-in.
        </div>
      )}
      <form onSubmit={signInWithEmail} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-semibold">Work email</label>
          <div className="relative">
            <Mail aria-hidden="true" className="absolute start-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-12 w-full rounded-xl border bg-[var(--surface)] ps-11 pe-4 text-base placeholder:text-[color:color-mix(in_srgb,var(--muted)_65%,transparent)]"
              placeholder="name@company.com"
              disabled={!configured || Boolean(loading)}
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">We’ll email you a password-free secure link.</p>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={!configured || !email || Boolean(loading)}>
          {loading === "email" && <LoaderCircle aria-hidden="true" className="animate-spin" size={18} />}
          Continue with email
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">or</span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button type="button" variant="secondary" onClick={() => signInWithProvider("google")} disabled={!configured || Boolean(loading)}>
          {loading === "google" ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} /> : <span aria-hidden="true" className="text-base font-bold text-[#4285F4]">G</span>}
          Google
        </Button>
        <Button type="button" variant="secondary" onClick={() => signInWithProvider("azure")} disabled={!configured || Boolean(loading)}>
          {loading === "azure" ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} /> : <Building2 aria-hidden="true" size={18} />}
          Microsoft
        </Button>
      </div>

      <div aria-live="polite" className="mt-5 min-h-6 text-sm">
        {message && <p className="text-[var(--success)]">{message}</p>}
        {error && <p role="alert" className="text-[var(--danger)]">{error}</p>}
      </div>
    </div>
  );
}
