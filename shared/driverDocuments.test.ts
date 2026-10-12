import { describe, expect, it } from "vitest";
import { hasVerifiedDriverDocuments, requiredDriverDocuments } from "./driverDocuments";

describe("driver document checklist", () => {
  it("requires identity and motorcycle-specific documents", () => {
    expect(requiredDriverDocuments("bike")).toEqual([
      "drivers_license",
      "nin",
      "motorcycle_registration",
      "motorcycle_insurance",
    ]);
  });

  it("requires identity and car-specific documents", () => {
    expect(requiredDriverDocuments("car")).toEqual([
      "drivers_license",
      "nin",
      "car_registration",
      "car_insurance",
    ]);
  });

  it("does not verify a driver until every required document is approved", () => {
    const documents = requiredDriverDocuments("bike").map(document_type => ({
      document_type,
      verification_status: "approved",
    }));
    expect(hasVerifiedDriverDocuments("bike", documents)).toBe(true);
    expect(hasVerifiedDriverDocuments("car", documents)).toBe(false);
    expect(hasVerifiedDriverDocuments("bike", documents.slice(1))).toBe(false);
    expect(hasVerifiedDriverDocuments("bike", [
      ...documents.slice(1),
      { document_type: "drivers_license", verification_status: "pending" },
    ])).toBe(false);
  });
});
