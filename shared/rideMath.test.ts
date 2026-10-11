import { describe, expect, it } from "vitest";
import { calculateDirectDistanceKm, calculateEstimatedFare, formatNaira } from "./rideMath";

describe("ride math", () => {
  it("calculates a sensible direct distance between Uyo landmarks", () => {
    const distance = calculateDirectDistanceKm(
      { lat: 5.0513, lng: 7.9335 },
      { lat: 5.0272, lng: 7.9264 },
    );
    expect(distance).toBeGreaterThan(2);
    expect(distance).toBeLessThan(3);
  });

  it("uses the configured minimum and per-kilometer fare for each vehicle", () => {
    expect(calculateEstimatedFare("bike", 1)).toBe(700);
    expect(calculateEstimatedFare("bike", 10)).toBe(2200);
    expect(calculateEstimatedFare("car", 10)).toBe(3800);
    expect(calculateEstimatedFare("bike", 2.005)).toBe(762);
  });

  it("formats fares as Nigerian naira", () => {
    expect(formatNaira(6800)).toContain("6,800");
  });
});
