import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getFallbackAuthCallbackUrl } from "@/lib/auth-redirect";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Supabase falls back to the configured Site URL when an environment's
  // callback URL is not allowlisted. Preserve that successful PKCE login by
  // forwarding root-level auth codes to the real callback route.
  const fallbackCallbackUrl = getFallbackAuthCallbackUrl(request.nextUrl);
  if (fallbackCallbackUrl) {
    return NextResponse.redirect(fallbackCallbackUrl);
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|pdf.worker.min.mjs|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mjs|css|txt|woff2)$).*)"],
};
