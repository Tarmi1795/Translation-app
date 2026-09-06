import { describe, expect, it } from "vitest";
import {
  getFallbackAuthCallbackUrl,
  getSafeInternalPath,
} from "@/lib/auth-redirect";

describe("auth redirects", () => {
  it("defaults to the authenticated workspace", () => {
    expect(getSafeInternalPath(null)).toBe("/app");
  });

  it("accepts only same-origin paths", () => {
    expect(getSafeInternalPath("/app/projects/123")).toBe("/app/projects/123");
    expect(getSafeInternalPath("//example.com/steal")).toBe("/app");
    expect(getSafeInternalPath("https://example.com/steal")).toBe("/app");
  });

  it("bridges a Supabase fallback code from the landing page to the callback", () => {
    const result = getFallbackAuthCallbackUrl(
      new URL("https://translate.example/?code=pkce-code"),
    );

    expect(result?.origin).toBe("https://translate.example");
    expect(result?.pathname).toBe("/auth/callback");
    expect(result?.searchParams.get("code")).toBe("pkce-code");
    expect(result?.searchParams.get("next")).toBe("/app");
  });

  it("does not intercept ordinary landing-page visits or other routes", () => {
    expect(getFallbackAuthCallbackUrl(new URL("https://translate.example/"))).toBeNull();
    expect(
      getFallbackAuthCallbackUrl(
        new URL("https://translate.example/app?code=unrelated"),
      ),
    ).toBeNull();
  });
});
