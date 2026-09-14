import { z } from "zod";
import { ApiError, requireWorkspaceRole } from "@/lib/auth";
import { brandingListSchema } from "@/lib/branding";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = z.object({ workspaceId: z.string().uuid(), versionId: z.string().uuid(), branding: brandingListSchema }).parse(await request.json());
    await requireWorkspaceRole(input.workspaceId, ["owner", "admin", "translator", "reviewer"]);
    const db = await createClient();
    const { data: version, error } = await db.from("document_versions").select("id").eq("id", input.versionId).eq("project_id", id).eq("workspace_id", input.workspaceId).maybeSingle();
    if (error) throw error;
    if (!version) throw new ApiError(404, "Document version not found.");
    if (input.branding.length) {
      const { data, error } = await db.from("workspace_branding").select("id").eq("workspace_id", input.workspaceId).in("id", input.branding.map((item) => item.assetId));
      if (error) throw error;
      if (data?.length !== input.branding.length) throw new ApiError(403, "Use branding saved in this workspace.");
    }
    const { error: updateError } = await createAdminClient().from("document_versions").update({ branding: input.branding }).eq("id", version.id).eq("workspace_id", input.workspaceId);
    if (updateError) throw updateError;
    await db.from("projects").update({ state: "review" }).eq("id", id).eq("state", "approved");
    return apiData({ saved: true });
  } catch (error) { return apiError(error); }
}
