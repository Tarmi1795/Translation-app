import type { LayoutWarning } from "@/types/domain";

const NUMBER_PATTERN = /(?:\p{Sc}\s*)?[+-]?(?:[\d٠-٩]{1,3}(?:[,٬][\d٠-٩]{3})*|[\d٠-٩]+)(?:[.٫][\d٠-٩]+)?%?/gu;

function normalizedNumbers(text: string) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  return (text.match(NUMBER_PATTERN) ?? []).map((value) => value.replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit))).replaceAll("٬", ",").replaceAll("٫", ".").replace(/\s/g, "")).sort();
}

export function validateTranslation(source: string, translated: string) {
  const flags: string[] = [];
  if (!translated.trim()) flags.push("missing_translation");
  if (JSON.stringify(normalizedNumbers(source)) !== JSON.stringify(normalizedNumbers(translated))) flags.push("number_mismatch");
  const sourceCodes = source.match(/\b[A-Z]{2,}-?\d+[A-Z0-9-]*\b/g) ?? [];
  if (sourceCodes.some((code) => !translated.includes(code))) flags.push("identifier_mismatch");
  if (translated.length > source.length * 2.1 && source.length > 40) flags.push("possible_overflow");
  return flags;
}

export function layoutWarningsForSegments(segments: Array<{ id: string; source: string; translation: string; page: number }>): LayoutWarning[] {
  return segments.flatMap((segment) => segment.translation.length > segment.source.length * 2.1 && segment.source.length > 40 ? [{ code: "material_reflow" as const, message: "Translation is substantially longer than the source and may reflow.", page: segment.page, nodeId: segment.id, severity: "warning" as const }] : []);
}
