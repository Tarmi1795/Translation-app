import { z } from "zod";

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  SUPABASE_SECRET_KEY: z.string().min(10),
  OPENAI_API_KEY: z.string().min(10),
  OPENAI_MODEL_TRANSLATION: z.string().default("gpt-5.6-terra"),
  OPENAI_MODEL_OCR: z.string().default("gpt-5.6-terra"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  PLATFORM_ADMIN_EMAILS: z.string().default(""),
  RATE_LIMIT_SALT: z.string().min(32).optional(),
});

export function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getPublicEnv() {
  const result = z
    .object({
      url: z.string().url(),
      publishableKey: z.string().min(10),
    })
    .safeParse({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });

  if (!result.success) {
    throw new Error("Supabase public environment variables are not configured.");
  }
  return result.data;
}

export function getServerEnv() {
  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      `Server environment is incomplete: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  return result.data;
}

export function isPlatformAdminEmail(email: string | undefined) {
  if (!email) return false;
  const allowlist = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}
