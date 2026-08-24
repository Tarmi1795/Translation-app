import { estimateSchema } from "@/lib/api/schemas";
import { ApiError, requireWorkspaceRole } from "@/lib/auth";
import { extractCanonicalDocument } from "@/lib/documents/extract";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const input = estimateSchema.parse(await request.json());
    const { user } = await requireWorkspaceRole(input.workspaceId, ["owner", "admin", "translator"]);
    const supabase = await createClient();
    const { data: project } = await supabase.from("projects").select("id,title,direction").eq("id", input.projectId).eq("workspace_id", input.workspaceId).maybeSingle();
    if (!project) throw new ApiError(404, "Project not found.", "not_found");

    let documentId = input.documentId;
    let mimeType = "text/plain";
    let title = project.title;
    let bytes: Uint8Array | undefined;
    if (documentId) {
      const { data: document } = await supabase.from("documents").select("id,file_name,mime_type,status,storage_path").eq("id", documentId).eq("project_id", project.id).maybeSingle();
      if (!document || document.status !== "validated" || !document.storage_path) throw new ApiError(400, "The uploaded document has not passed validation.", "document_not_validated");
      const { data: blob, error } = await supabase.storage.from("documents").download(document.storage_path);
      if (error) throw error;
      bytes = new Uint8Array(await blob.arrayBuffer()); mimeType = document.mime_type; title = document.file_name;
    } else {
      const encoded = new TextEncoder().encode(input.text ?? "");
      const { data: document, error } = await supabase.from("documents").insert({ workspace_id: input.workspaceId, project_id: input.projectId, uploaded_by: user.id, file_name: `${project.title}.txt`, mime_type: "text/plain", size_bytes: encoded.byteLength, input_kind: "text", status: "validated" }).select("id").single();
      if (error) throw error;
      documentId = document.id;
      await supabase.from("projects").update({ current_document_id: documentId }).eq("id", project.id);
    }

    const canonical = await extractCanonicalDocument({ bytes, mimeType, title, direction: input.direction, text: input.text });
    if (canonical.sourceWordCount < 1) throw new ApiError(400, "No readable source words were found.", "empty_source");
    const { data: previous } = await supabase.from("document_versions").select("version_number").eq("project_id", project.id).order("version_number", { ascending: false }).limit(1);
    const versionNumber = Number(previous?.[0]?.version_number ?? 0) + 1;
    const versionId = crypto.randomUUID();
    const { error: versionError } = await supabase.from("document_versions").insert({ id: versionId, workspace_id: input.workspaceId, project_id: project.id, document_id: documentId, version_number: versionNumber, canonical_tree: canonical, layout_warnings: canonical.warnings, created_by: user.id });
    if (versionError) throw versionError;
    const nodeRows = canonical.nodes.map((node) => ({ id: node.id, workspace_id: input.workspaceId, project_id: project.id, version_id: versionId, node_key: node.id, node_type: node.type, page_number: node.page, node_order: node.order, source_text: node.sourceText, translated_text: node.translatedText, confidence: node.confidence, bounds: node.bounds, style: node.style, metadata: node.metadata ?? {} }));
    const segmentRows = canonical.nodes.filter((node) => node.sourceText.trim()).map((node, order) => ({ workspace_id: input.workspaceId, project_id: project.id, version_id: versionId, node_id: node.id, segment_order: order, source_text: node.sourceText, source_confidence: node.confidence, quality_flags: (node.confidence ?? 1) < 0.8 ? ["low_ocr_confidence"] : [], created_by: user.id }));
    const { error: nodesError } = await supabase.from("document_nodes").insert(nodeRows);
    if (nodesError) { await createAdminClient().from("document_versions").delete().eq("id", versionId); throw nodesError; }
    const { error: segmentsError } = await supabase.from("segments").insert(segmentRows);
    if (segmentsError) { await createAdminClient().from("document_versions").delete().eq("id", versionId); throw segmentsError; }
    await supabase.from("projects").update({ source_word_count: canonical.sourceWordCount, state: "ready", current_document_id: documentId }).eq("id", project.id);
    return apiData({ projectId: project.id, documentId, versionId, sourceWordCount: canonical.sourceWordCount, pageCount: canonical.pageCount, requiresOcrReview: canonical.nodes.some((node) => (node.confidence ?? 1) < 0.8) });
  } catch (error) { return apiError(error); }
}
