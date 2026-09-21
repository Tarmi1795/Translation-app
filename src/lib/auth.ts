import { cache } from "react";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { readAccessToken, verifyAuthTokenLocally } from "@/lib/auth-token";
import { isPlatformAdminEmail } from "@/lib/env";
import type { WorkspaceRole } from "@/types/domain";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "request_error",
  ) {
    super(message);
  }
}

// Fast path: verify the session JWT against the project's published keys
// locally (cached JWKS, sub-millisecond warm). Falls back to the auth server
// when local verification fails so rotation and edge cases still resolve.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const cookieStore = await cookies();
  const token = readAccessToken(cookieStore.getAll());
  if (token) {
    const claims = await verifyAuthTokenLocally(token);
    if (claims) {
      return {
        id: claims.sub,
        email: claims.email,
        user_metadata: (claims.user_metadata as Record<string, unknown> | undefined) ?? {},
        app_metadata: (claims.app_metadata as Record<string, unknown> | undefined) ?? {},
      } as unknown as User;
    }
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Authentication required.", "unauthorized");
  return user;
}

export async function requireWorkspaceRole(
  workspaceId: string,
  allowed: WorkspaceRole[] = ["owner", "admin", "translator", "reviewer"],
) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (error || !data || !allowed.includes(data.role as WorkspaceRole)) {
    throw new ApiError(403, "You do not have permission for this workspace.", "forbidden");
  }
  return { user, role: data.role as WorkspaceRole };
}

export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (isPlatformAdminEmail(user.email)) return user;

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .single();
  if (!data?.is_platform_admin) {
    throw new ApiError(403, "Platform administrator access required.", "forbidden");
  }
  return user;
}
