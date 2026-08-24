import { ApiError, requireUser } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase.from("translation_jobs").select("id,stage,progress,completed_segments,total_segments,error_code,error_message,created_at,started_at,completed_at").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, "Job not found.", "not_found");
    return apiData({ id: data.id, stage: data.stage, progress: Number(data.progress), completedSegments: data.completed_segments, totalSegments: data.total_segments, errorCode: data.error_code, errorMessage: data.error_message, createdAt: data.created_at, startedAt: data.started_at, completedAt: data.completed_at });
  } catch (error) { return apiError(error); }
}
