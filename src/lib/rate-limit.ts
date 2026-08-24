import { createHash } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/auth";

function hashIdentity(value: string) {
  const salt = process.env.RATE_LIMIT_SALT || process.env.SUPABASE_SECRET_KEY || "local-development-rate-limit-salt";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

export async function enforceJobRateLimit(request: Request, user: User) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const admin = createAdminClient();
  const [userLimit, ipLimit] = await Promise.all([
    admin.rpc("consume_rate_limit", { p_identity_hash: hashIdentity(`user:${user.id}`), p_action: "translation_job", p_max_hits: 10, p_window_seconds: 3600 }),
    admin.rpc("consume_rate_limit", { p_identity_hash: hashIdentity(`ip:${ip}`), p_action: "translation_job", p_max_hits: 20, p_window_seconds: 3600 }),
  ]);
  if (userLimit.error || ipLimit.error) throw new ApiError(503, "Rate-limit service is unavailable. Try again shortly.", "rate_limit_unavailable");
  if (!userLimit.data || !ipLimit.data) throw new ApiError(429, "Translation job limit reached. Try again later.", "rate_limited");
}
