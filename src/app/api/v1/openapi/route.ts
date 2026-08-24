import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const spec = await readFile(path.join(process.cwd(), "openapi", "openapi.yaml"), "utf8");
  return new Response(spec, { headers: { "Content-Type": "application/yaml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
