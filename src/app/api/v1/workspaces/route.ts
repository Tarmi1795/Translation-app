import { createWorkspaceSchema } from "@/lib/api/schemas";
import { requireUser } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { data, error } = await supabase.from("workspace_members").select("role,workspace:workspaces!inner(id,name,kind,created_at)").eq("user_id", user.id).order("created_at");
    if (error) throw error;
    return apiData(data ?? []);
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = createWorkspaceSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: workspace, error } = await admin.from("workspaces").insert({ owner_id: user.id, name: input.name, kind: "organization" }).select("id,name,kind,created_at").single();
    if (error) throw error;
    const results = await Promise.all([
      admin.from("workspace_members").insert({ workspace_id: workspace.id, user_id: user.id, role: "owner", created_by: user.id }),
      admin.from("credit_accounts").insert({ workspace_id: workspace.id }),
      admin.from("training_consents").insert({ workspace_id: workspace.id, global_learning: false, updated_by: user.id }),
      admin.from("audit_logs").insert({ workspace_id: workspace.id, actor_id: user.id, action: "workspace.created", target_type: "workspace", target_id: workspace.id }),
    ]);
    const childError = results.find((result) => result.error)?.error;
    if (childError) { await admin.from("workspaces").delete().eq("id", workspace.id); throw childError; }
    return apiData({ ...workspace, role: "owner" }, { status: 201 });
  } catch (error) { return apiError(error); }
}
