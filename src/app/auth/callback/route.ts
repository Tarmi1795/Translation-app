import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/app";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/app";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const forwardedProtocol = request.headers.get("x-forwarded-proto");
      const protocol = forwardedProtocol ?? (forwardedHost?.startsWith("localhost") || forwardedHost?.startsWith("127.0.0.1") ? "http" : "https");
      const origin = forwardedHost ? `${protocol}://${forwardedHost}` : url.origin;
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  return NextResponse.redirect(new URL("/auth/auth-code-error", url.origin));
}
