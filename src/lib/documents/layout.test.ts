import { describe, expect, it } from "vitest";
import { fitText, intersects, wrapText } from "@/lib/documents/layout";
import { brandingListSchema } from "@/lib/branding";

const measure = (text: string, size: number) => Array.from(text).length * size * 0.5;

describe("readable layout fitting", () => {
  it("moves oversized text to review instead of shrinking below 9pt or clipping", () => {
    expect(fitText("A complete translation that cannot fit in a tiny source cell", 30, 9, 11, measure)).toBeNull();
    const wrapped = wrapText("ABCDEFGHIJKLMNO", 15, 10, measure);
    expect(wrapped.join("")).toBe("ABCDEFGHIJKLMNO");
    expect(wrapped.every((line) => measure(line, 10) <= 15)).toBe(true);
  });
  it("preserves explicit line breaks and Arabic characters", () => {
    const text = "مرحبا بالعالم\nالسطر الثاني";
    expect(wrapText(text, 400, 11, measure)).toEqual(["مرحبا بالعالم", "السطر الثاني"]);
  });
  it("detects branding over content but permits adjacent boxes", () => {
    expect(intersects({ x: 1, y: 1, width: 20, height: 20 }, { x: 10, y: 10, width: 20, height: 20 })).toBe(true);
    expect(intersects({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });
  it("rejects duplicate assets and out-of-page placements", () => {
    const item = { assetId: "ac9f14ad-224a-4090-a82c-b0c6826b63a5", x: 0, y: 0, width: 0.5, pages: "first" };
    expect(brandingListSchema.safeParse([item, item]).success).toBe(false);
    expect(brandingListSchema.safeParse([{ ...item, x: 0.9 }]).success).toBe(false);
  });
});
