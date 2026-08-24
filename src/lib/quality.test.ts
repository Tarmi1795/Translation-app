import { describe, expect, it } from "vitest";
import { layoutWarningsForSegments, validateTranslation } from "@/lib/quality";

describe("translation quality checks", () => {
  it("accepts equivalent Western and Arabic numeral forms", () => {
    expect(validateTranslation("Total: 1,250.50 QAR", "الإجمالي: ١٬٢٥٠٫٥٠ ريال قطري")).not.toContain("number_mismatch");
  });

  it("flags missing numbers and stable identifiers", () => {
    expect(validateTranslation("Invoice AB-204 costs 90 QAR", "تكلفة الفاتورة 80 ريالاً")).toEqual(expect.arrayContaining(["number_mismatch", "identifier_mismatch"]));
  });

  it("marks material layout reflow", () => {
    const warnings = layoutWarningsForSegments([{ id: "segment-1", source: "A short source sentence that is long enough to evaluate.", translation: "نص ".repeat(60), page: 2 }]);
    expect(warnings).toMatchObject([{ code: "material_reflow", page: 2, nodeId: "segment-1" }]);
  });
});
