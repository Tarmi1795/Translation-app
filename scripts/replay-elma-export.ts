// E2E replay: re-render the ELMA project through the fixed export pipeline.
// Read-only against the database; output PDFs go to the OS temp dir.
//   npx tsx --env-file=.env scripts/replay-elma-export.ts
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { extractDigitalPdf } from "../src/lib/documents/pdf";
import { renderPdf } from "../src/lib/exports";
import { repairReversedRuns } from "../src/lib/quality";
import type { CanonicalDocument } from "../src/types/domain";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Missing Supabase env");
const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

async function main() {
  const { data: projects } = await admin.from("projects").select("id,title,direction,current_document_id").eq("id", "ba3ab707-0b75-4217-a386-cba7d2bbdc94").limit(1);
  if (!projects?.length) throw new Error("ELMA project not found");
  for (const project of projects) console.log(`candidate project: ${project.id} "${project.title}" ${project.direction}`);
  const project = projects[0];
  const { data: version } = await admin.from("document_versions").select("id,version_number,canonical_tree").eq("project_id", project.id).order("version_number", { ascending: false }).limit(1).maybeSingle();
  if (!version) throw new Error("No document version");
  const { data: segments } = await admin.from("segments").select("node_id,source_text,translated_text").eq("version_id", version.id).order("segment_order");
  console.log(`version ${version.version_number}: ${segments?.length ?? 0} segments`);
  const repaired = (segments ?? []).map((segment) => ({ ...segment, healed: repairReversedRuns(segment.source_text, segment.translated_text ?? "") }));
  const changedCount = repaired.filter((segment) => segment.healed !== segment.translated_text).length;
  console.log(`repair changed ${changedCount}/${repaired.length} segment translations`);

  const bytes = new Uint8Array(await readFile("C:/Users/Admin/Downloads/ELMA.pdf"));

  // A) What the user gets re-exporting the existing project (stored bounds).
  const stored = structuredClone(version.canonical_tree) as CanonicalDocument;
  const byNode = new Map(repaired.map((segment) => [segment.node_id, segment]));
  stored.nodes = stored.nodes.map((node) => {
    const segment = byNode.get(node.id);
    return segment ? { ...node, translatedText: segment.healed || node.translatedText } : node;
  });
  const storedResult = await renderPdf(stored, project.direction as "en-ar", bytes);
  await writeFile("C:/Users/Admin/AppData/Local/Temp/elma-fixed-storedbounds.pdf", storedResult.bytes);
  console.log(`A) stored-bounds render: ${storedResult.bytes.byteLength} bytes, warnings:`, storedResult.warnings.map((warning) => `${warning.code}@p${warning.page}`));

  // B) A fresh upload of the same file (honest extraction geometry).
  const extracted = await extractDigitalPdf(bytes.slice(), "ELMA.pdf", project.direction as "en-ar");
  if (!extracted) throw new Error("Extraction returned null");
  const bySource = new Map(repaired.map((segment) => [normalize(segment.source_text), segment.healed]));
  let matched = 0;
  extracted.nodes = extracted.nodes.map((node) => {
    const healed = bySource.get(normalize(node.sourceText));
    if (healed !== undefined) { matched += 1; return { ...node, translatedText: healed }; }
    return node;
  });
  console.log(`B) fresh extraction: ${extracted.nodes.length} nodes (heights: ${extracted.nodes.map((node) => node.bounds!.height.toFixed(1)).join(", ")}), translation matched ${matched}/${extracted.nodes.length}`);
  const freshResult = await renderPdf(extracted, project.direction as "en-ar", bytes);
  await writeFile("C:/Users/Admin/AppData/Local/Temp/elma-fixed-fresh.pdf", freshResult.bytes);
  console.log(`B) fresh render: ${freshResult.bytes.byteLength} bytes, warnings:`, freshResult.warnings.map((warning) => `${warning.code}@p${warning.page}`));
}

main().catch((error) => { console.error(error); process.exit(1); });
