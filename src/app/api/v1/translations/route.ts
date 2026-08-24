import { start } from "workflow/api";
import { startTranslationSchema } from "@/lib/api/schemas";
import { ApiError, requireWorkspaceRole } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { enforceJobRateLimit } from "@/lib/rate-limit";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { translationWorkflow } from "@/workflows/translation";

export async function POST(request: Request) {
  let jobId: string | null = null;
  try {
    const input = startTranslationSchema.parse(await request.json());
    const { user } = await requireWorkspaceRole(input.workspaceId, ["owner", "admin", "translator"]);
    await enforceJobRateLimit(request, user);
    const supabase = await createClient();
    const { data: project } = await supabase.from("projects").select("id,current_document_id,source_word_count,state").eq("id", input.projectId).eq("workspace_id", input.workspaceId).maybeSingle();
    if (!project || !project.current_document_id || Number(project.source_word_count) < 1) throw new ApiError(400, "Estimate the source before starting translation.", "estimate_required");
    const { data: version } = await supabase.from("document_versions").select("id").eq("project_id", project.id).order("version_number", { ascending: false }).limit(1).maybeSingle();
    if (!version) throw new ApiError(400, "The extracted document version is missing.", "version_required");
    const [{ count: lowConfidence }, { count: totalSegments }] = await Promise.all([
      supabase.from("segments").select("id", { count: "exact", head: true }).eq("version_id", version.id).contains("quality_flags", ["low_ocr_confidence"]),
      supabase.from("segments").select("id", { count: "exact", head: true }).eq("version_id", version.id),
    ]);
    if ((lowConfidence ?? 0) > 0) throw new ApiError(409, "Review and save all low-confidence OCR segments before translation.", "ocr_review_required");
    const { data: active } = await supabase.from("translation_jobs").select("id,stage").eq("project_id", project.id).in("stage", ["queued", "reserving_credits", "retrieving_context", "translating", "quality_check", "reconstructing"]).maybeSingle();
    if (active) return apiData({ jobId: active.id, stage: active.stage, reused: true });
    const idempotencyKey = request.headers.get("idempotency-key") || `${project.id}:${version.id}:${crypto.randomUUID()}`;
    const { data: job, error: jobError } = await supabase.from("translation_jobs").insert({ workspace_id: input.workspaceId, project_id: project.id, document_id: project.current_document_id, version_id: version.id, created_by: user.id, idempotency_key: idempotencyKey, stage: "reserving_credits", progress: 15, source_word_count: project.source_word_count, total_segments: totalSegments ?? 0 }).select("id").single();
    if (jobError) throw jobError;
    jobId = job.id;
    const { error: reserveError } = await supabase.rpc("reserve_credits", { p_workspace_id: input.workspaceId, p_job_id: job.id, p_amount: project.source_word_count });
    if (reserveError) throw new ApiError(reserveError.message.includes("insufficient") ? 402 : 409, reserveError.message, reserveError.message.includes("insufficient") ? "insufficient_credits" : "credit_reservation_failed");
    await supabase.from("projects").update({ state: "translating" }).eq("id", project.id);
    const run = await start(translationWorkflow, [job.id]);
    await createAdminClient().from("translation_jobs").update({ workflow_run_id: run.runId, stage: "queued", progress: 20 }).eq("id", job.id);
    return apiData({ jobId: job.id, workflowRunId: run.runId, stage: "queued" }, { status: 202 });
  } catch (error) {
    if (jobId) {
      const admin = createAdminClient();
      await admin.rpc("release_credits", { p_job_id: jobId, p_reason: "Job start failed" });
      await admin.from("translation_jobs").update({ stage: "failed", error_code: "start_failed", error_message: error instanceof Error ? error.message : "Job start failed" }).eq("id", jobId);
    }
    return apiError(error);
  }
}
