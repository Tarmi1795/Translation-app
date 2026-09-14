import { createHash } from "node:crypto";
import { reviewSchema } from "@/lib/api/schemas";
import { ApiError, requireWorkspaceRole } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const input = reviewSchema.parse(await request.json());
    const { user, role } = await requireWorkspaceRole(input.workspaceId);
    const supabase = await createClient();
    const { data: project } = await supabase.from("projects").select("id,direction,workspace:workspaces!inner(kind)").eq("id", input.projectId).eq("workspace_id", input.workspaceId).maybeSingle();
    if (!project) throw new ApiError(404, "Project not found.", "not_found");
    const workspace = Array.isArray(project.workspace) ? project.workspace[0] : project.workspace;
    const { data: version, error: versionError } = await supabase.from("document_versions").select("id").eq("project_id", project.id).order("version_number", { ascending: false }).limit(1).maybeSingle();
    if (versionError) throw versionError;
    if (!version) throw new ApiError(409, "Upload and translate a document before review.");
    const { data: currentSegments, error: segmentError } = await supabase.from("segments").select("id,source_text,translated_text,quality_flags").eq("version_id", version.id);
    if (segmentError) throw segmentError;
    if (input.action !== "request_changes" && (!currentSegments?.length || currentSegments.some((segment) => !segment.translated_text?.trim() || segment.quality_flags?.includes("low_ocr_confidence")))) throw new ApiError(409, "Complete missing translations and OCR review before approval or submission.");
    const { data: latestJob } = await supabase.from("translation_jobs").select("created_by").eq("project_id", project.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (input.action === "approve") {
      if (!["owner", "admin", "reviewer"].includes(role)) throw new ApiError(403, "Only owners, administrators, and reviewers can approve.", "forbidden");
      const selfApproval = workspace?.kind === "organization" && latestJob?.created_by === user.id;
      if (selfApproval && !(role === "owner" && input.ownerOverride && (input.reason?.trim().length ?? 0) >= 8)) throw new ApiError(409, "Translators cannot approve their own organization work without an owner override and reason.", "self_approval_denied");
      const admin = createAdminClient();
      const segments = currentSegments;
      await admin.from("approvals").insert({ workspace_id: input.workspaceId, project_id: project.id, reviewer_id: user.id, decision: "approved", owner_override: selfApproval, reason: input.reason });
      await Promise.all([
        admin.from("projects").update({ state: "approved" }).eq("id", project.id),
        admin.from("segments").update({ status: "approved" }).eq("version_id", version.id),
        admin.from("correction_events").update({ approved: true, approved_by: user.id }).eq("project_id", project.id),
      ]);
      for (const segment of segments ?? []) {
        if (!segment.translated_text) continue;
        await admin.from("translation_memory").upsert({ workspace_id: input.workspaceId, direction: project.direction, source_text: segment.source_text, target_text: segment.translated_text, source_hash: createHash("sha256").update(segment.source_text.normalize("NFKC")).digest("hex"), approved: true, origin: "approved_correction", source_segment_id: segment.id, approved_by: user.id }, { onConflict: "workspace_id,direction,source_hash" });
      }
      await admin.from("audit_logs").insert({ workspace_id: input.workspaceId, actor_id: user.id, action: selfApproval ? "review.owner_override_approved" : "review.approved", target_type: "project", target_id: project.id, metadata: { reason: input.reason ?? null } });
      return apiData({ projectId: project.id, state: "approved" });
    }

    const decision = input.action === "submit" ? "submitted" : "changes_requested";
    const state = input.action === "submit" ? "review" : "translating";
    const { error } = await supabase.from("approvals").insert({ workspace_id: input.workspaceId, project_id: project.id, reviewer_id: user.id, decision, reason: input.reason });
    if (error) throw error;
    await supabase.from("projects").update({ state }).eq("id", project.id);
    return apiData({ projectId: project.id, state, decision });
  } catch (error) { return apiError(error); }
}
