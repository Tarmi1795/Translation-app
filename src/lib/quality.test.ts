import { describe, expect, it } from "vitest";
import { layoutWarningsForSegments, repairReversedRuns, validateTranslation } from "@/lib/quality";

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

describe("repairReversedRuns", () => {
  it("restores mirrored digit and Latin runs inside Arabic (ELMA cases)", () => {
    expect(repairReversedRuns("Date: September 23, 2026", "التاريخ: 32 سبتمبر 6202")).toBe("التاريخ: 23 سبتمبر 2026");
    expect(repairReversedRuns("Establishment Card No. 17-3104-07", "رقم بطاقة المؤسسة: 71-4013-70")).toBe("رقم بطاقة المؤسسة: 17-3104-07");
    expect(repairReversedRuns("Establishment Card No. 17-3104-07", "رقم بطاقة المؤسسة: 70-4013-71")).toBe("رقم بطاقة المؤسسة: 17-3104-07");
    expect(repairReversedRuns("Passport No.: P7107602B", "رقم جواز السفر: B2067017P")).toBe("رقم جواز السفر: P7107602B");
    expect(repairReversedRuns("QID No.: 27760809031", "رقم QID: 13090806772")).toBe("رقم QID: 27760809031");
    expect(repairReversedRuns("QID No.: 27760809031", "رقم DIQ: 13090806772")).toBe("رقم QID: 27760809031");
    expect(repairReversedRuns("(EOSB) benefits", "مزايا (BSOE)")).toBe("مزايا (EOSB)");
    expect(repairReversedRuns("Mobile No.: +974 3115 1965", "رقم الهاتف المحمول: +479 5113 5691")).toBe("رقم الهاتف المحمول: +974 3115 1965");
  });

  it("leaves correct translations and non-Arabic text untouched", () => {
    expect(repairReversedRuns("Date: September 23, 2026", "التاريخ: 23 سبتمبر 2026")).toBe("التاريخ: 23 سبتمبر 2026");
    expect(repairReversedRuns("Total: 90 QAR", "الإجمالي: 90 ريالاً")).toBe("الإجمالي: 90 ريالاً");
    expect(repairReversedRuns("Order 12 of 34", "Order 12 of 34")).toBe("Order 12 of 34");
  });

  it("does not invent repairs when the original form is already present", () => {
    expect(repairReversedRuns("Ref 1221 and 1221 only", "المرجع 1221 فقط")).toBe("المرجع 1221 فقط");
  });
});
