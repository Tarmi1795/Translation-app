import { createUploadSchema } from "@/lib/api/schemas";
import { requireWorkspaceRole } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

function inputKind(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "docx") return "docx";
  if (extension === "pdf") return "pdf";
  if (["jpg", "jpeg", "png"].includes(extension ?? "")) return "image";
  throw new Error("Only PDF, DOCX, JPG, and PNG uploads are supported.");
}

export async function POST(request: Request) {
  try {
    const input = createUploadSchema.parse(await request.json());
    const { user } = await requireWorkspaceRole(input.workspaceId, ["owner", "admin", "translator"]);
    const kind = inputKind(input.fileName);
    const supabase = await createClient();
    const documentId = crypto.randomUUID();
    const safeExtension = input.fileName.split(".").pop()?.toLowerCase();
    const path = `${input.workspaceId}/${input.projectId}/source/${documentId}.${safeExtension}`;
    const { data: document, error: documentError } = await supabase.from("documents").insert({ id: documentId, workspace_id: input.workspaceId, project_id: input.projectId, uploaded_by: user.id, file_name: input.fileName, mime_type: input.mimeType, size_bytes: input.size, input_kind: kind, storage_path: path }).select("id").single();
    if (documentError) throw documentError;
    const { data: signed, error: signedError } = await supabase.storage.from("documents").createSignedUploadUrl(path);
    if (signedError) { await supabase.from("documents").delete().eq("id", document.id); throw signedError; }
    return apiData({ documentId: document.id, path, signedUrl: signed.signedUrl, token: signed.token }, { status: 201 });
  } catch (error) { return apiError(error); }
}
