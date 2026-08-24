import { segmentEditSchema } from "@/lib/api/schemas";
import { ApiError, requireUser } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = segmentEditSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: segment, error } = await supabase.from("segments").select("id,workspace_id,project_id,source_text,translated_text,quality_flags").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!segment) throw new ApiError(404, "Segment not found.", "not_found");
    const fieldName = input.sourceText !== undefined ? "source_text" : "translated_text";
    const oldValue = fieldName === "source_text" ? segment.source_text : segment.translated_text;
    const newValue = input.sourceText ?? input.translatedText ?? "";
    const update = fieldName === "source_text"
      ? { source_text: newValue, quality_flags: (segment.quality_flags ?? []).filter((flag: string) => flag !== "low_ocr_confidence"), updated_by: user.id }
      : { translated_text: newValue, status: "edited", updated_by: user.id };
    const { error: updateError } = await supabase.from("segments").update(update).eq("id", id);
    if (updateError) throw updateError;
    const { error: revisionError } = await supabase.from("segment_revisions").insert({ workspace_id: segment.workspace_id, project_id: segment.project_id, segment_id: id, editor_id: user.id, field_name: fieldName, old_value: oldValue, new_value: newValue, reason: input.reason });
    if (revisionError) throw revisionError;
    if (fieldName === "translated_text" && oldValue !== newValue) {
      await supabase.from("correction_events").insert({ workspace_id: segment.workspace_id, project_id: segment.project_id, segment_id: id, editor_id: user.id, before_text: oldValue, after_text: newValue });
    }
    return apiData({ id, field: fieldName, saved: true });
  } catch (error) { return apiError(error); }
}
