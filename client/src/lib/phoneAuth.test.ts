import { describe, expect, it } from "vitest";
import { normalizeE164PhoneNumber } from "./phoneAuth";

describe("normalizeE164PhoneNumber", () => {
  it("normalizes common display separators", () => {
    expect(normalizeE164PhoneNumber("+234 800-000 (1234)")).toBe("+2348000001234");
  });

  it("rejects numbers that are not valid E.164 values", () => {
    expect(normalizeE164PhoneNumber("08000001234")).toBeNull();
    expect(normalizeE164PhoneNumber("+012345678")).toBeNull();
    expect(normalizeE164PhoneNumber("+123")).toBeNull();
  });
});
