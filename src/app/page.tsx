import { LandingPage } from "@/components/landing-page";
import { getCurrentUser } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  let authenticatedName: string | null = null;
  if (hasSupabaseEnv()) {
    try {
      const user = await getCurrentUser();
      if (user) {
        // A signed-in visitor clicking Home must land on a page that shows
        // their session (never a bare "Sign in"), so the landing page never
        // reads as an accidental logout.
        const supabase = await createClient();
        const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
        authenticatedName = profile?.display_name || user.email?.split("@")[0] || null;
      }
    } catch {
      // A transient auth failure renders the public landing page.
    }
  }
  return authenticatedName !== null ? <LandingPage authenticated userName={authenticatedName} /> : <LandingPage />;
}
