import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { ApiError, requireWorkspaceRole } from "@/lib/auth";
import { defaultPlacement, placementSchema } from "@/lib/branding";
import { apiData, apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    await requireWorkspaceRole(id);
    const db = await createClient();
    const { data, error } = await db.from("workspace_branding").select("id,name,kind,width,height,placement,storage_path").eq("workspace_id", id).order("created_at");
    if (error) throw error;
    const assets = await Promise.all((data ?? []).map(async ({ storage_path, ...asset }) => {
      const { data: signed, error } = await db.storage.from("documents").createSignedUrl(storage_path, 3600);
      if (error) throw error;
      return { ...asset, previewUrl: signed.signedUrl };
    }));
    return apiData(assets);
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const { user } = await requireWorkspaceRole(id, ["owner", "admin", "translator"]);
    if (Number(request.headers.get("content-length")) > 3_500_000) throw new ApiError(413, "Use a PNG or JPG smaller than 3 MB.");
    const form = await request.formData();
    const file = form.get("file");
    const kind = z.enum(["letterhead", "stamp"]).parse(form.get("kind"));
    if (!(file instanceof File) || file.size > 3_000_000 || !file.size) throw new ApiError(400, "Choose a PNG or JPG smaller than 3 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpg) throw new ApiError(400, "Letterhead and stamp must be PNG or JPG images.");
    const pdf = await PDFDocument.create();
    const image = png ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    if (image.width > 20000 || image.height > 20000) throw new ApiError(400, "This image is too large. Resize it below 20,000 pixels.");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const db = await createClient();
    const { data: existing, error: lookupError } = await db.from("workspace_branding").select("id").eq("workspace_id", id).eq("kind", kind).eq("sha256", sha256).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return apiData(existing);
    const assetId = crypto.randomUUID();
    const path = `${id}/branding/${assetId}.${png ? "png" : "jpg"}`;
    const { error: uploadError } = await db.storage.from("documents").upload(path, bytes, { contentType: png ? "image/png" : "image/jpeg", upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await db.from("workspace_branding").insert({ id: assetId, workspace_id: id, created_by: user.id, kind, name: file.name.slice(0, 120), storage_path: path, sha256, width: image.width, height: image.height, placement: defaultPlacement(kind) });
    if (error) throw error;
    return apiData({ id: assetId }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    await requireWorkspaceRole(id, ["owner", "admin", "translator"]);
    const input = z.object({ assetId: z.string().uuid(), placement: placementSchema }).parse(await request.json());
    const db = await createClient();
    const { data, error } = await db.from("workspace_branding").update({ placement: input.placement }).eq("id", input.assetId).eq("workspace_id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, "Branding asset not found.");
    return apiData(data);
  } catch (error) { return apiError(error); }
}
