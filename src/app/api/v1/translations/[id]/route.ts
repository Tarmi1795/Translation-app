import { getRun, start } from "workflow/api";
import { ApiError, requireUser } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { countSourceWords } from "@/lib/words";
import { translationWorkflow } from "@/workflows/translation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const { action } = await request.json() as { action?: string };
    const supabase = await createClient();
    const { data: job } = await supabase.from("translation_jobs").select("id,workspace_id,project_id,document_id,version_id,stage,workflow_run_id,segment_ids").eq("id", id).maybeSingle();
    if (!job) throw new ApiError(404, "Translation job not found.", "not_found");
    if (action === "cancel") {
      if (!["queued", "validating", "extracting", "ocr_review", "reserving_credits", "retrieving_context", "translating", "quality_check", "reconstructing"].includes(job.stage)) {
        throw new ApiError(409, `A ${job.stage} job can no longer be cancelled.`, "job_not_cancellable");
      }
      await supabase.from("translation_jobs").update({ cancellation_requested_at: new Date().toISOString() }).eq("id", id);
      if (job.workflow_run_id) {
        try { await getRun(job.workflow_run_id).cancel(); }
        catch { /* The database cancellation flag still stops a run between batches. */ }
      }
      const admin = createAdminClient();
      // Count completed words via the version (an id list of hundreds of
      // UUIDs overflows the PostgREST URL limit on large documents).
      const { data: completed } = job.version_id ? await admin.from("segments").select("source_text").eq("version_id", job.version_id).in("status", ["translated", "edited", "approved"]) : { data: [] };
      const successfulWords = (completed ?? []).reduce((sum, segment) => sum + countSourceWords(segment.source_text), 0);
      await admin.rpc("commit_credits", { p_job_id: id, p_successful_words: successfulWords });
      await Promise.all([
        admin.from("translation_jobs").update({ stage: "cancelled", error_code: "cancelled", error_message: "Cancelled by user", completed_at: new Date().toISOString() }).eq("id", id),
        admin.from("projects").update({ state: "cancelled" }).eq("id", job.project_id),
      ]);
      return apiData({ id, cancellationRequested: true });
    }
    if (action === "retry_failed") {
      if (!["failed", "cancelled"].includes(job.stage)) throw new ApiError(409, "Only failed or cancelled jobs can be retried.", "job_not_retryable");
      if (!job.version_id) throw new ApiError(409, "The failed job has no document version.", "version_required");
      const { data: remaining, error: remainingError } = await supabase.from("segments").select("id,source_text,quality_flags").eq("version_id", job.version_id).in("status", ["pending", "failed"]);
      if (remainingError) throw remainingError;
      if (!remaining?.length) throw new ApiError(409, "No failed segments remain to retry.", "nothing_to_retry");
      if (remaining.some((segment) => segment.quality_flags?.includes("low_ocr_confidence"))) throw new ApiError(409, "Review and save all low-confidence OCR segments before retrying.", "ocr_review_required");
      const remainingWords = remaining.reduce((sum, segment) => sum + countSourceWords(segment.source_text), 0);
      const { data: retryJob, error: createError } = await supabase.from("translation_jobs").insert({ workspace_id: job.workspace_id, project_id: job.project_id, document_id: job.document_id, version_id: job.version_id, created_by: (await requireUser()).id, idempotency_key: `retry:${job.id}:${crypto.randomUUID()}`, stage: "reserving_credits", progress: 15, source_word_count: remainingWords, total_segments: remaining.length, segment_ids: remaining.map((segment) => segment.id) }).select("id").single();
      if (createError) throw createError;
      const { error: reserveError } = await supabase.rpc("reserve_credits", { p_workspace_id: job.workspace_id, p_job_id: retryJob.id, p_amount: remainingWords });
      if (reserveError) { await createAdminClient().from("translation_jobs").update({ stage: "failed", error_message: reserveError.message }).eq("id", retryJob.id); throw reserveError; }
      const run = await start(translationWorkflow, [retryJob.id]);
      const admin = createAdminClient();
      await Promise.all([
        admin.from("translation_jobs").update({ workflow_run_id: run.runId, stage: "queued", progress: 20 }).eq("id", retryJob.id),
        admin.from("projects").update({ state: "translating" }).eq("id", job.project_id),
      ]);
      return apiData({ jobId: retryJob.id, workflowRunId: run.runId, stage: "queued" }, { status: 202 });
    }
    throw new ApiError(400, "Unknown translation action.", "validation_error");
  } catch (error) { return apiError(error); }
}
