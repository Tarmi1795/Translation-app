import { notFound } from "next/navigation";
import { EditorWorkspace } from "@/components/editor-workspace";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace-context";
import type { JobStage, LanguageDirection, LayoutWarning } from "@/types/domain";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseEnv()) notFound();
  const { activeWorkspace } = await getWorkspaceContext();
  if (!activeWorkspace) notFound();
  const supabase = await createClient();
  const [{ data: project }, { data: segments }, { data: jobs }, { data: versions }] = await Promise.all([
    supabase.from("projects").select("id,workspace_id,title,state,direction,source_word_count").eq("id", id).eq("workspace_id", activeWorkspace.id).maybeSingle(),
    supabase.from("segments").select("id,source_text,translated_text,segment_order,status,quality_flags,source_confidence").eq("project_id", id).order("segment_order"),
    supabase.from("translation_jobs").select("id,stage,progress,completed_segments,total_segments,error_message").eq("project_id", id).order("created_at", { ascending: false }).limit(1),
    supabase.from("document_versions").select("layout_warnings").eq("project_id", id).order("version_number", { ascending: false }).limit(1),
  ]);
  if (!project) notFound();
  const job = jobs?.[0];
  return (
    <EditorWorkspace
      project={{ id: project.id, workspaceId: project.workspace_id, title: project.title, state: project.state, direction: project.direction as LanguageDirection, sourceWordCount: Number(project.source_word_count) }}
      initialSegments={(segments ?? []).map((segment) => ({ id: segment.id, sourceText: segment.source_text, translatedText: segment.translated_text ?? "", order: segment.segment_order, status: segment.status, qualityFlags: (segment.quality_flags ?? []) as string[], sourceConfidence: segment.source_confidence ? Number(segment.source_confidence) : undefined }))}
      initialJob={job ? { id: job.id, stage: job.stage as JobStage, progress: Number(job.progress), completedSegments: job.completed_segments, totalSegments: job.total_segments, errorMessage: job.error_message ?? undefined } : null}
      warnings={(versions?.[0]?.layout_warnings ?? []) as LayoutWarning[]}
      role={activeWorkspace.role}
    />
  );
}
