const DEFAULT_AUTH_DESTINATION = "/app";

export function getSafeInternalPath(
  requestedPath: string | null | undefined,
  fallback = DEFAULT_AUTH_DESTINATION,
) {
  return requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
    ? requestedPath
    : fallback;
}

export function getFallbackAuthCallbackUrl(url: URL) {
  if (url.pathname !== "/") return null;

  const code = url.searchParams.get("code");
  if (!code) return null;

  const callbackUrl = new URL("/auth/callback", url);
  callbackUrl.searchParams.set("code", code);
  callbackUrl.searchParams.set(
    "next",
    getSafeInternalPath(url.searchParams.get("next")),
  );
  return callbackUrl;
}
