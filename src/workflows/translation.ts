import { createAdminClient } from "@/lib/supabase/server";
import { getTranslationProvider } from "@/lib/openai/responses-provider";
import { countSourceWords } from "@/lib/words";
import { layoutWarningsForSegments, validateTranslation } from "@/lib/quality";
import type { CanonicalDocument, LanguageDirection } from "@/types/domain";
import type { TranslationContext, TranslationInputSegment } from "@/lib/openai/provider";

interface WorkflowPayload {
  job: { id: string; workspace_id: string; project_id: string; version_id: string; source_word_count: number; segment_ids: string[] };
  project: { direction: LanguageDirection };
  segments: Array<{ id: string; node_id: string | null; source_text: string; segment_order: number }>;
  context: TranslationContext;
}

async function updateStage(jobId: string, stage: string, progress: number, message: string) {
  "use step";
  const admin = createAdminClient();
  const { data: job, error } = await admin.from("translation_jobs").update({ stage, progress, ...(stage === "translating" ? { started_at: new Date().toISOString() } : {}) }).eq("id", jobId).select("workspace_id").single();
  if (error) throw error;
  await admin.from("job_events").insert({ workspace_id: job.workspace_id, job_id: jobId, stage, message });
}

async function loadWorkflowPayload(jobId: string): Promise<WorkflowPayload> {
  "use step";
  const admin = createAdminClient();
  const { data: job, error: jobError } = await admin.from("translation_jobs").select("id,workspace_id,project_id,version_id,source_word_count,segment_ids").eq("id", jobId).single();
  if (jobError || !job.version_id) throw jobError ?? new Error("The translation job has no document version.");
  const { data: project, error: projectError } = await admin.from("projects").select("direction").eq("id", job.project_id).single();
  if (projectError) throw projectError;
  const [{ data: segments, error: segmentError }, { data: glossary }, { data: memory }, { data: globalMemory }] = await Promise.all([
    admin.from("segments").select("id,node_id,source_text,segment_order").eq("version_id", job.version_id).in("id", job.segment_ids).order("segment_order"),
    admin.from("glossary_terms").select("source_term,target_term").eq("workspace_id", job.workspace_id).eq("direction", project.direction).limit(200),
    admin.from("translation_memory").select("source_text,target_text").eq("workspace_id", job.workspace_id).eq("direction", project.direction).eq("approved", true).limit(40),
    admin.from("global_translation_memory").select("source_text,target_text").eq("direction", project.direction).limit(20),
  ]);
  if (segmentError) throw segmentError;
  return {
    job,
    project,
    segments: segments ?? [],
    context: {
      glossary: (glossary ?? []).map((row) => ({ source: row.source_term, target: row.target_term })),
      memory: [...(memory ?? []), ...(globalMemory ?? [])].map((row) => ({ source: row.source_text, target: row.target_text })),
    },
  };
}

async function checkCancellation(jobId: string) {
  "use step";
  const admin = createAdminClient();
  const { data } = await admin.from("translation_jobs").select("cancellation_requested_at").eq("id", jobId).single();
  return Boolean(data?.cancellation_requested_at);
}

async function translateBatchStep(jobId: string, direction: LanguageDirection, batch: TranslationInputSegment[], context: TranslationContext, completedBefore: number, total: number) {
  "use step";
  const provider = getTranslationProvider();
  const translated = await provider.translateBatch(direction, batch, context);
  const admin = createAdminClient();
  for (const result of translated) {
    const source = batch.find((segment) => segment.id === result.id)?.sourceText ?? "";
    const flags = validateTranslation(source, result.translatedText);
    const { error } = await admin.from("segments").update({ translated_text: result.translatedText, status: "translated", quality_flags: flags }).eq("id", result.id);
    if (error) throw error;
  }
  const completed = completedBefore + translated.length;
  const progress = 35 + (completed / Math.max(1, total)) * 45;
  await admin.from("translation_jobs").update({ completed_segments: completed, progress }).eq("id", jobId);
  return { completed, successfulWords: batch.reduce((sum, segment) => sum + countSourceWords(segment.sourceText), 0) };
}

async function finalizeDocument(jobId: string, payload: WorkflowPayload, successfulWords: number) {
  "use step";
  const admin = createAdminClient();
  const { data: version, error: versionError } = await admin.from("document_versions").select("canonical_tree").eq("id", payload.job.version_id).single();
  const { data: segments, error: segmentError } = await admin.from("segments").select("id,node_id,source_text,translated_text,quality_flags").eq("version_id", payload.job.version_id).order("segment_order");
  if (versionError || segmentError) throw versionError || segmentError;
  const canonical = version.canonical_tree as CanonicalDocument;
  const translatedByNode = new Map((segments ?? []).map((segment) => [segment.node_id, segment.translated_text ?? ""]));
  canonical.nodes = canonical.nodes.map((node) => ({ ...node, translatedText: translatedByNode.get(node.id) ?? node.translatedText }));
  const pageByNode = new Map(canonical.nodes.map((node) => [node.id, node.page]));
  const warnings = [...canonical.warnings, ...layoutWarningsForSegments((segments ?? []).map((segment) => ({ id: segment.node_id ?? segment.id, source: segment.source_text, translation: segment.translated_text ?? "", page: pageByNode.get(segment.node_id ?? "") ?? 1 })))];
  canonical.warnings = warnings;
  const { error: updateError } = await admin.from("document_versions").update({ canonical_tree: canonical, layout_warnings: warnings }).eq("id", payload.job.version_id);
  if (updateError) throw updateError;
  const { error: creditError } = await admin.rpc("commit_credits", { p_job_id: jobId, p_successful_words: successfulWords });
  if (creditError) throw creditError;
  await Promise.all([
    admin.from("translation_jobs").update({ stage: "completed", progress: 100, completed_at: new Date().toISOString() }).eq("id", jobId),
    admin.from("projects").update({ state: "review" }).eq("id", payload.job.project_id),
    admin.from("job_events").insert({ workspace_id: payload.job.workspace_id, job_id: jobId, stage: "completed", message: "Translation completed and credits committed.", payload: { successfulWords, layoutWarnings: warnings.length } }),
  ]);
}

async function failWorkflow(jobId: string, message: string, cancelled: boolean, successfulWords: number) {
  "use step";
  const admin = createAdminClient();
  const stage = cancelled ? "cancelled" : "failed";
  const { data: job } = await admin.from("translation_jobs").update({ stage, error_code: cancelled ? "cancelled" : "workflow_failed", error_message: message, completed_at: new Date().toISOString() }).eq("id", jobId).select("workspace_id,project_id").single();
  await admin.rpc("commit_credits", { p_job_id: jobId, p_successful_words: successfulWords });
  if (job) {
    await Promise.all([
      admin.from("projects").update({ state: stage }).eq("id", job.project_id),
      admin.from("job_events").insert({ workspace_id: job.workspace_id, job_id: jobId, stage, message }),
    ]);
  }
}

export async function translationWorkflow(jobId: string) {
  "use workflow";
  let successfulWords = 0;
  try {
    await updateStage(jobId, "retrieving_context", 25, "Loading glossary and private translation memory.");
    const payload = await loadWorkflowPayload(jobId);
    await updateStage(jobId, "translating", 35, "Translating contextual segment batches.");
    const batchSize = 12;
    let completed = 0;
    for (let index = 0; index < payload.segments.length; index += batchSize) {
      if (await checkCancellation(jobId)) {
        await failWorkflow(jobId, "Translation cancelled by the user.", true, successfulWords);
        return { status: "cancelled" as const };
      }
      const slice = payload.segments.slice(index, index + batchSize);
      const batch = slice.map((segment, localIndex) => ({ id: segment.id, sourceText: segment.source_text, contextBefore: slice[localIndex - 1]?.source_text, contextAfter: slice[localIndex + 1]?.source_text }));
      const result = await translateBatchStep(jobId, payload.project.direction, batch, payload.context, completed, payload.segments.length);
      completed = result.completed;
      successfulWords += result.successfulWords;
    }
    await updateStage(jobId, "quality_check", 84, "Checking names, numbers, terminology, and missing content.");
    await updateStage(jobId, "reconstructing", 92, "Preparing layout-aware exports and warnings.");
    await finalizeDocument(jobId, payload, successfulWords);
    return { status: "completed" as const, successfulWords };
  } catch (error) {
    // Workflow steps cross a serialization boundary; their errors are not
    // necessarily instances of the workflow sandbox's Error constructor.
    const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : "Translation workflow failed.";
    await failWorkflow(jobId, message, false, successfulWords);
    throw error;
  }
}
