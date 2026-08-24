import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { extractDocx } from "../src/lib/documents/docx";
import { extractTextDocument } from "../src/lib/documents/text";
import type { CanonicalDocument, LanguageDirection } from "../src/types/domain";

function option(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function required(name: string) {
  const value = option(name);
  if (!value) throw new Error(`Missing --${name}=...`);
  return value;
}

async function extract(filePath: string, direction: LanguageDirection) {
  const bytes = new Uint8Array(await readFile(filePath));
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".docx") return extractDocx(bytes, path.basename(filePath), direction);
  if (extension === ".txt") return extractTextDocument(new TextDecoder().decode(bytes), path.basename(filePath), direction);
  throw new Error("Corpus files must be DOCX or UTF-8 text files.");
}

function texts(document: CanonicalDocument) {
  return document.nodes.map((node) => node.sourceText.trim()).filter(Boolean);
}

function hashSource(value: string) {
  return createHash("sha256").update(value.normalize("NFKC").replace(/\s+/g, " ").trim()).digest("hex");
}

async function upsertRows(table: "global_translation_memory" | "evaluation_segments", rows: Array<Record<string, string>>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required in .env.local.");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(index, index + 500), { onConflict: "direction,source_hash", ignoreDuplicates: false });
    if (error) throw error;
  }
}

async function main() {
  const sourcePath = path.resolve(required("source"));
  const targetPath = path.resolve(required("target"));
  const corpusName = required("name").trim();
  const direction = required("direction") as LanguageDirection;
  if (!(["en-ar", "ar-en"] as string[]).includes(direction)) throw new Error("--direction must be en-ar or ar-en.");
  if (corpusName.length < 3) throw new Error("--name must contain at least three characters.");

  const targetDirection: LanguageDirection = direction === "en-ar" ? "ar-en" : "en-ar";
  const [sourceDocument, targetDocument] = await Promise.all([extract(sourcePath, direction), extract(targetPath, targetDirection)]);
  const sourceSegments = texts(sourceDocument);
  const targetSegments = texts(targetDocument);
  if (sourceSegments.length !== targetSegments.length) {
    throw new Error(`Alignment stopped: source has ${sourceSegments.length} blocks and target has ${targetSegments.length}. Align the documents manually so paragraph counts match.`);
  }
  if (sourceSegments.length < 5) throw new Error("At least five aligned blocks are required to create an 80/20 split.");

  const pairs = sourceSegments.map((sourceText, index) => ({
    direction,
    source_text: sourceText,
    target_text: targetSegments[index],
    source_hash: hashSource(sourceText),
    corpus_name: corpusName,
  }));
  const duplicateCount = pairs.length - new Set(pairs.map((pair) => pair.source_hash)).size;
  if (duplicateCount) throw new Error(`Found ${duplicateCount} duplicate source blocks. Remove or merge duplicates before approval.`);
  const suspicious = pairs.filter((pair) => pair.target_text.length / Math.max(1, pair.source_text.length) < 0.2 || pair.target_text.length / Math.max(1, pair.source_text.length) > 5);
  if (suspicious.length) throw new Error(`Found ${suspicious.length} suspiciously mismatched block lengths. Review the parallel alignment before approval.`);

  const holdoutCount = Math.max(1, Math.round(pairs.length * 0.2));
  const holdoutHashes = new Set([...pairs].sort((a, b) => a.source_hash.localeCompare(b.source_hash)).slice(0, holdoutCount).map((pair) => pair.source_hash));
  const evaluation = pairs.filter((pair) => holdoutHashes.has(pair.source_hash));
  const memory = pairs.filter((pair) => !holdoutHashes.has(pair.source_hash));

  console.log(`Validated ${pairs.length} aligned pairs: ${memory.length} retrieval examples and ${evaluation.length} isolated evaluation rows.`);
  if (!process.argv.includes("--approve")) {
    console.log("Preview only. Manually compare the aligned documents, then rerun with --approve to attest that the pairs are valid.");
    return;
  }
  await upsertRows("global_translation_memory", memory);
  await upsertRows("evaluation_segments", evaluation);
  console.log(`Imported corpus '${corpusName}'. Evaluation rows are inaccessible to authenticated clients and excluded from translation retrieval.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
