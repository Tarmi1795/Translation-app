import { createHash } from "node:crypto";
import { ApiError, requireUser } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const user = await requireUser();
    const { token } = await params;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const admin = createAdminClient();
    const { data: invite } = await admin.from("workspace_invites").select("id,workspace_id,email,role,expires_at,accepted_at,revoked_at").eq("token_hash", tokenHash).maybeSingle();
    if (!invite || invite.revoked_at || invite.accepted_at || new Date(invite.expires_at) < new Date()) throw new ApiError(410, "This invitation is invalid or expired.", "invite_expired");
    if (!user.email || user.email.toLowerCase() !== invite.email.toLowerCase()) throw new ApiError(403, "Sign in with the email address that received this invitation.", "invite_email_mismatch");
    const { error } = await admin.from("workspace_members").upsert({ workspace_id: invite.workspace_id, user_id: user.id, role: invite.role, created_by: user.id }, { onConflict: "workspace_id,user_id" });
    if (error) throw error;
    await admin.from("workspace_invites").update({ accepted_by: user.id, accepted_at: new Date().toISOString() }).eq("id", invite.id);
    await admin.from("audit_logs").insert({ workspace_id: invite.workspace_id, actor_id: user.id, action: "workspace.invite_accepted", target_type: "workspace_invite", target_id: invite.id, metadata: { role: invite.role } });
    return apiData({ workspaceId: invite.workspace_id, role: invite.role });
  } catch (error) { return apiError(error); }
}
