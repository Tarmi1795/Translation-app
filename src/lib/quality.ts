import type { LayoutWarning } from "@/types/domain";

const NUMBER_PATTERN = /(?:\p{Sc}\s*)?[+-]?(?:[\d٠-٩]{1,3}(?:[,٬][\d٠-٩]{3})*|[\d٠-٩]+)(?:[.٫][\d٠-٩]+)?%?/gu;
// Translations legitimately spell small numbers as words ("1" → "واحدة"/"one");
// normalize them so the validator does not raise false number_mismatch flags.
const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
  thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90", hundred: "100", thousand: "1000", million: "1000000",
  "صفر": "0", "واحد": "1", "واحدة": "1", "اثنان": "2", "اثنين": "2", "ثلاث": "3", "ثلاثة": "3", "أربع": "4", "أربعة": "4", "خمس": "5", "خمسة": "5",
  "ست": "6", "ستة": "6", "سبع": "7", "سبعة": "7", "ثمان": "8", "ثمانية": "8", "تسع": "9", "تسعة": "9", "عشر": "10", "عشرة": "10",
  "عشرين": "20", "ثلاثين": "30", "أربعين": "40", "خمسين": "50", "ستين": "60", "سبعين": "70", "ثمانين": "80", "تسعين": "90",
  "مئة": "100", "مائة": "100", "ألف": "1000", "آلاف": "1000", "مليون": "1000000", "ملايين": "1000000",
};

function normalizedNumbers(text: string) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const numeric = (text.match(NUMBER_PATTERN) ?? []).map((value) => value.replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit))).replaceAll("٬", ",").replaceAll("٫", ".").replace(/\s/g, ""));
  const words = text.match(/[\p{L}]+/gu) ?? [];
  for (const word of words) {
    const digit = NUMBER_WORDS[word.toLocaleLowerCase()] ?? NUMBER_WORDS[word];
    if (digit) numeric.push(digit);
  }
  return numeric.sort();
}

export function validateTranslation(source: string, translated: string) {
  const flags: string[] = [];
  if (!translated.trim()) flags.push("missing_translation");
  // Only flag numbers the translation DROPPED. Extra or reordered numbers in
  // the translation are far less alarming than a missing amount, and strict
  // multiset equality produced false positives on spelled-out numbers.
  const sourceNumbers = normalizedNumbers(source);
  const translatedNumbers = [...normalizedNumbers(translated)];
  const dropped = sourceNumbers.filter((value) => {
    const index = translatedNumbers.indexOf(value);
    if (index === -1) return true;
    translatedNumbers.splice(index, 1);
    return false;
  });
  if (dropped.length) flags.push("number_mismatch");
  const sourceCodes = source.match(/\b[A-Z]{2,}-?\d+[A-Z0-9-]*\b/g) ?? [];
  if (sourceCodes.some((code) => !translated.includes(code))) flags.push("identifier_mismatch");
  if (translated.length > source.length * 2.1 && source.length > 40) flags.push("possible_overflow");
  return flags;
}

export function layoutWarningsForSegments(segments: Array<{ id: string; source: string; translation: string; page: number }>): LayoutWarning[] {
  return segments.flatMap((segment) => segment.translation.length > segment.source.length * 2.1 && segment.source.length > 40 ? [{ code: "material_reflow" as const, message: "Translation is substantially longer than the source and may reflow.", page: segment.page, nodeId: segment.id, severity: "warning" as const }] : []);
}
