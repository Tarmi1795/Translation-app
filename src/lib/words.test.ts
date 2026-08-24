import { describe, expect, it } from "vitest";
import { countDocumentWords, countSourceWords } from "@/lib/words";

describe("source word credits", () => {
  it("counts English, Arabic, numbers, and joined words consistently", () => {
    expect(countSourceWords("Hello, world! 2026 isn't far-off.")).toBe(5);
    expect(countSourceWords("مرحباً بالعالم، هذه ترجمة ممتازة." )).toBe(5);
  });

  it("adds document blocks without counting punctuation", () => {
    expect(countDocumentWords(["One two", "ثلاثة، أربعة", "500"])).toBe(5);
  });
});
