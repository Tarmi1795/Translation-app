import { z } from "zod";

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  SUPABASE_SECRET_KEY: z.string().min(10),
  AI_PROVIDER: z.enum(["openai", "openrouter", "zai"]).default("openai"),
  OPENAI_API_KEY: z.string().min(10).optional(),
  OPENROUTER_API_KEY: z.string().min(10).optional(),
  OPENAI_MODEL_TRANSLATION: z.string().default("gpt-5.6-terra"),
  OPENAI_MODEL_OCR: z.string().default("gpt-5.6-terra"),
  ZAI_API_KEY: z.string().min(10).optional(),
  ZAI_BASE_URL: z.string().url().optional(),
  ZAI_MODEL_TRANSLATION: z.string().default("glm-5.3-flash"),
  ZAI_MODEL_OCR: z.string().default("glm-4.5v"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  PLATFORM_ADMIN_EMAILS: z.string().default(""),
  RATE_LIMIT_SALT: z.string().min(32).optional(),
}).superRefine((env, context) => {
  const requiredKey = env.AI_PROVIDER === "openrouter" ? env.OPENROUTER_API_KEY : env.AI_PROVIDER === "zai" ? env.ZAI_API_KEY : env.OPENAI_API_KEY;
  if (!requiredKey) {
    context.addIssue({
      code: "custom",
      path: [env.AI_PROVIDER === "openrouter" ? "OPENROUTER_API_KEY" : env.AI_PROVIDER === "zai" ? "ZAI_API_KEY" : "OPENAI_API_KEY"],
      message: `A server-side ${env.AI_PROVIDER} API key is required.`,
    });
  }
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
