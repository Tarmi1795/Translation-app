import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/env";
import { readAccessToken, tokenTimeLeft } from "@/lib/auth-token";

// Refresh only when the access token is near expiry; otherwise the request
// proceeds without any auth round trip (verification happens in the route).
const REFRESH_WINDOW_MS = 10 * 60 * 1000;

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!hasSupabaseEnv()) return response;

  // Only run the auth round-trip when a session cookie exists and is close to
  // expiry; anonymous or freshly-refreshed requests otherwise pay a full
  // Supabase verification call for nothing.
  const token = readAccessToken(request.cookies.getAll());
  if (!token) return response;
  const timeLeft = tokenTimeLeft(token);
  if (timeLeft !== null && timeLeft > REFRESH_WINDOW_MS) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getClaims();
  return response;
}
