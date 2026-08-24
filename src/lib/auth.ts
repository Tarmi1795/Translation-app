import { cache } from "react";
import { createClient, createAdminClient } from "@/lib/supabase/server";
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

export const getCurrentUser = cache(async () => {
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
