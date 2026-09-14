import type { CanonicalDocument } from "@/types/domain";
import { exportSchema } from "@/lib/api/schemas";
import { ApiError, requireWorkspaceRole } from "@/lib/auth";
import { createDocxExport, renderPdf, createTextExport } from "@/lib/exports";
import { DOCX_MIME } from "@/lib/documents/docx";
import { loadRenderBranding } from "@/lib/documents/branding-render";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function POST(request: Request) {
  let exportId: string | null = null;
  try {
    const input = exportSchema.parse(await request.json());
    const { user } = await requireWorkspaceRole(input.workspaceId);
    const supabase = await createClient();
    const { data: project } = await supabase.from("projects").select("id,title,direction,current_document_id").eq("id", input.projectId).eq("workspace_id", input.workspaceId).maybeSingle();
    if (!project) throw new ApiError(404, "Project not found.", "not_found");
    const [{ data: version }, { data: document }] = await Promise.all([
      supabase.from("document_versions").select("id,canonical_tree,branding").eq("project_id", project.id).order("version_number", { ascending: false }).limit(1).maybeSingle(),
      project.current_document_id ? supabase.from("documents").select("mime_type,storage_path").eq("id", project.current_document_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!version) throw new ApiError(409, "No translated document version is available.", "export_not_ready");
    const { data: latestSegments, error: segmentError } = await supabase.from("segments").select("node_id,source_text,translated_text").eq("version_id", version.id).order("segment_order");
    if (segmentError) throw segmentError;
    const segmentByNode = new Map((latestSegments ?? []).map((segment) => [segment.node_id, segment]));
    const canonical = structuredClone(version.canonical_tree) as CanonicalDocument;
    canonical.nodes = canonical.nodes.map((node) => {
      const segment = segmentByNode.get(node.id);
      return segment ? { ...node, sourceText: segment.source_text, translatedText: segment.translated_text ?? node.translatedText } : node;
    });
    if (canonical.nodes.some((node) => node.sourceText.trim() && !node.translatedText?.trim())) throw new ApiError(409, "Complete all translations before creating the preview or download.", "export_not_ready");
    const { data: exportRow, error: createError } = await supabase.from("exports").insert({ workspace_id: input.workspaceId, project_id: project.id, version_id: version.id, requested_by: user.id, format: input.format, status: "processing" }).select("id").single();
    if (createError) throw createError;
    exportId = exportRow.id;
    let sourceBytes: Uint8Array | undefined;
    if (input.format !== "txt" && document?.storage_path) {
      const { data: source, error } = await supabase.storage.from("documents").download(document.storage_path);
      if (error) throw error;
      sourceBytes = new Uint8Array(await source.arrayBuffer());
    }
    const branding = await loadRenderBranding(input.workspaceId, version.branding, canonical, sourceBytes);
    let layoutWarnings = [...canonical.warnings, ...branding.warnings];
    let bytes: Uint8Array;
    if (input.format === "pdf") {
      const rendered = await renderPdf(canonical, project.direction, sourceBytes, branding.assets);
      bytes = rendered.bytes;
      layoutWarnings = [...rendered.warnings, ...branding.warnings];
    } else if (input.format === "docx") {
      bytes = await createDocxExport(canonical, sourceBytes, branding.assets);
      if (canonical.mimeType !== DOCX_MIME) layoutWarnings.push({ code: "formatting_approximate", page: 1, severity: "warning", message: "Editable Word reconstruction: text and source page sizes retained; PDF/scan graphics, cell geometry and exact spacing are not replicated. Use the PDF for visual review." });
      if (branding.assets.length) layoutWarnings.push({ code: "formatting_approximate", page: 1, severity: "warning", message: "Word anchors branding to the first/last paragraph or page headers. Check placement in the Word preview; pagination can differ from PDF." });
    } else bytes = createTextExport(canonical);
    const mimeType = input.format === "txt" ? "text/plain" : input.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const safeTitle = project.title.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 80);
    const path = `${input.workspaceId}/${project.id}/exports/${exportRow.id}-${safeTitle}.${input.format}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, bytes, { contentType: mimeType, upsert: false });
    if (uploadError) throw uploadError;
    const { error: readyError } = await createAdminClient().from("exports").update({ status: "ready", storage_path: path, mime_type: mimeType, size_bytes: bytes.byteLength, layout_warnings: layoutWarnings, expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }).eq("id", exportRow.id);
    if (readyError) throw readyError;
    return apiData({ id: exportRow.id, format: input.format, status: "ready", warnings: layoutWarnings }, { status: 201 });
  } catch (error) {
    if (exportId) await createAdminClient().from("exports").update({ status: "failed", error_message: error instanceof Error ? error.message : "Export failed" }).eq("id", exportId);
    return apiError(error);
  }
}
