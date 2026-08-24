import { createHash, randomBytes } from "node:crypto";
import { inviteSchema } from "@/lib/api/schemas";
import { requireWorkspaceRole } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireWorkspaceRole(id, ["owner", "admin"]);
    const supabase = await createClient();
    const { data, error } = await supabase.from("workspace_invites").select("id,email,role,expires_at,accepted_at,revoked_at,created_at").eq("workspace_id", id).order("created_at", { ascending: false });
    if (error) throw error;
    return apiData(data ?? []);
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = inviteSchema.parse(await request.json());
    const { user } = await requireWorkspaceRole(id, ["owner", "admin"]);
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const supabase = await createClient();
    const { data, error } = await supabase.from("workspace_invites").insert({ workspace_id: id, email: input.email.toLowerCase(), role: input.role, token_hash: tokenHash, invited_by: user.id, expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }).select("id,email,role,expires_at").single();
    if (error) throw error;
    const origin = process.env.APP_URL || new URL(request.url).origin;
    return apiData({ ...data, inviteUrl: `${origin}/invite/${rawToken}` }, { status: 201 });
  } catch (error) { return apiError(error); }
}
