import type { paths } from "@/types/openapi.generated";

type Method = "get" | "post" | "put" | "patch" | "delete";

export class ApiClient {
  constructor(private baseUrl = "/api/v1") {}

  async request<TPath extends keyof paths, TMethod extends Extract<keyof paths[TPath], Method>>(
    path: TPath,
    method: TMethod,
    options: { body?: unknown; query?: Record<string, string | number | boolean | undefined>; headers?: HeadersInit } = {},
  ) {
    const url = new URL(`${this.baseUrl}${String(path)}`, typeof window === "undefined" ? "http://localhost" : window.location.origin);
    Object.entries(options.query ?? {}).forEach(([key, value]) => value !== undefined && url.searchParams.set(key, String(value)));
    const response = await fetch(url.pathname + url.search, { method: String(method).toUpperCase(), headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }, body: options.body ? JSON.stringify(options.body) : undefined, credentials: "include" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? `API request failed with ${response.status}`);
    return payload;
  }
}
