import { segmentEditSchema } from "@/lib/api/schemas";
import { ApiError, requireUser } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";
import { validateTranslation } from "@/lib/quality";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = segmentEditSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: segment, error } = await supabase.from("segments").select("id,workspace_id,project_id,source_text,translated_text,quality_flags").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!segment) throw new ApiError(404, "Segment not found.", "not_found");
    const { data: activeJob, error: jobError } = await supabase.from("translation_jobs").select("id").eq("project_id", segment.project_id).in("stage", ["queued", "reserving_credits", "retrieving_context", "translating", "quality_check", "reconstructing"]).limit(1).maybeSingle();
    if (jobError) throw jobError;
    if (activeJob) throw new ApiError(409, "Wait for processing to finish before editing this document.", "job_active");
    const fieldName = input.sourceText !== undefined ? "source_text" : "translated_text";
    const oldValue = fieldName === "source_text" ? segment.source_text : segment.translated_text;
    const newValue = input.sourceText ?? input.translatedText ?? "";
    if (!newValue.trim()) throw new ApiError(400, "Text cannot be empty. Keep all original content represented.", "empty_text");
    const sourceChanged = fieldName === "source_text" && oldValue !== newValue;
    const qualityFlags = fieldName === "translated_text" ? validateTranslation(segment.source_text, newValue) : (segment.quality_flags ?? []).filter((flag: string) => flag !== "low_ocr_confidence");
    const update = fieldName === "source_text"
      ? { source_text: newValue, source_confidence: 1, quality_flags: qualityFlags, ...(sourceChanged ? { translated_text: null, status: "pending" } : {}), updated_by: user.id }
      : { translated_text: newValue, quality_flags: qualityFlags, status: "edited", updated_by: user.id };
    const { error: updateError } = await supabase.from("segments").update(update).eq("id", id);
    if (updateError) throw updateError;
    const { error: revisionError } = await supabase.from("segment_revisions").insert({ workspace_id: segment.workspace_id, project_id: segment.project_id, segment_id: id, editor_id: user.id, field_name: fieldName, old_value: oldValue, new_value: newValue, reason: input.reason });
    if (revisionError) throw revisionError;
    if (fieldName === "translated_text" && oldValue !== newValue) {
      await supabase.from("correction_events").insert({ workspace_id: segment.workspace_id, project_id: segment.project_id, segment_id: id, editor_id: user.id, before_text: oldValue, after_text: newValue });
    }
    await supabase.from("projects").update({ state: sourceChanged ? "ready" : "review" }).eq("id", segment.project_id);
    return apiData({ id, field: fieldName, saved: true, translationInvalidated: sourceChanged, qualityFlags });
  } catch (error) { return apiError(error); }
}
