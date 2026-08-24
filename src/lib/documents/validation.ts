import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED = new Map([
  ["application/pdf", ["pdf"]],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ["docx"]],
  ["image/jpeg", ["jpg", "jpeg"]],
  ["image/png", ["png"]],
  ["text/plain", ["txt"]],
]);

export interface FileValidationResult {
  mimeType: string;
  extension: string;
  sha256: string;
  inputKind: "docx" | "pdf" | "image";
}

export async function validateUploadedFile(bytes: Uint8Array, fileName: string, declaredMime: string): Promise<FileValidationResult> {
  if (!bytes.length) throw new Error("The uploaded file is empty.");
  if (bytes.length > MAX_FILE_SIZE) throw new Error("Files larger than 50 MB are not supported in the beta.");
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["docm", "dotm", "xlsm", "pptm"].includes(extension)) throw new Error("Macro-enabled documents are not accepted.");
  const detected = await fileTypeFromBuffer(bytes);
  const mimeType = detected?.mime ?? (extension === "txt" ? "text/plain" : declaredMime);
  const allowedExtensions = ALLOWED.get(mimeType);
  if (!allowedExtensions || !allowedExtensions.includes(extension)) throw new Error("The file signature does not match a supported PDF, DOCX, JPG, or PNG file.");

  if (extension === "docx") {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error("The DOCX archive is corrupt or encrypted."); }
    if (zip.file("word/vbaProject.bin") || zip.file("EncryptedPackage")) throw new Error("Macro-enabled or encrypted Word files are not accepted.");
    const contentTypes = await zip.file("[Content_Types].xml")?.async("string");
    if (!contentTypes || /macroEnabled/i.test(contentTypes)) throw new Error("The Word file is invalid or macro-enabled.");
    if (!zip.file("word/document.xml")) throw new Error("The Word document body is missing.");
  }

  if (extension === "pdf") {
    try { await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false }); }
    catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("encrypt")) throw new Error("Encrypted PDF files are not accepted.");
      throw new Error("The PDF is corrupt or cannot be read.");
    }
  }

  return {
    mimeType,
    extension,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    inputKind: extension === "docx" ? "docx" : extension === "pdf" ? "pdf" : "image",
  };
}
