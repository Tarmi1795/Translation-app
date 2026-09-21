import { createRemoteJWKSet, jwtVerify } from "jose";

// Supabase issues ES256 tokens that can be verified locally against the
// project's published keys. Verifying here removes an auth-server round trip
// from every server request; the network path stays as a fallback for
// expired/rotated tokens.
interface CachedJwks {
  jwks: ReturnType<typeof createRemoteJWKSet>;
  fetchedAt: number;
}

let cache: CachedJwks | null = null;
const CACHE_TTL_MS = 3_600_000;

export interface LocalClaims {
  sub: string;
  email?: string;
  [key: string]: unknown;
}

function jwksUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  return `${url}/auth/v1/.well-known/jwks.json`;
}

function apiKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

export async function verifyAuthTokenLocally(token: string): Promise<LocalClaims | null> {
  const url = jwksUrl();
  const key = apiKey();
  if (!url || !key) return null;
  try {
    if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
      cache = { jwks: createRemoteJWKSet(new URL(url), { [key]: "apikey" } as HeadersInit as never), fetchedAt: Date.now() };
    }
    const { payload } = await jwtVerify(token, cache.jwks, { algorithms: ["ES256"] });
    if (!payload.sub || (typeof payload.exp === "number" && payload.exp * 1000 < Date.now())) return null;
    return payload as unknown as LocalClaims;
  } catch {
    return null;
  }
}

// Reads the access token out of the @supabase/ssr cookie (single or chunked,
// "base64-" prefixed). Returns undefined when no session exists.
export function readAccessToken(cookieStore: { name: string; value: string }[]): string | undefined {
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase/)?.[1];
  if (!projectRef) return undefined;
  const prefix = `sb-${projectRef}-auth-token`;
  const main = cookieStore.find((cookie) => cookie.name === prefix);
  const chunks = cookieStore
    .filter((cookie) => cookie.name.startsWith(`${prefix}.`))
    .sort((a, b) => Number(a.name.split(".").pop()) - Number(b.name.split(".").pop()));
  const raw = main?.value ?? chunks.map((chunk) => chunk.value).join("");
  if (!raw) return undefined;
  try {
    const decoded = raw.startsWith("base64-") ? Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8") : decodeURIComponent(raw);
    const session = JSON.parse(decoded) as { access_token?: string };
    return session.access_token;
  } catch {
    return undefined;
  }
}

// Exp remaining in ms, or null when undecodable (then callers should fall
// back to the network path).
export function tokenTimeLeft(token: string): number | null {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as { exp?: number };
    if (typeof payload.exp !== "number") return null;
    return payload.exp * 1000 - Date.now();
  } catch {
    return null;
  }
}
