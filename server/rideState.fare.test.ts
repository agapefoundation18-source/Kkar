import { describe, expect, it } from "vitest";
import { calculateDriverSplit } from "./fare";
import { canTransition } from "./rideState";

describe("Kkary trip and earnings rules", () => {
  it("allows rider cancellation before a trip starts", () => {
    expect(canTransition("matching", "cancelled_by_rider")).toBe(true);
    expect(canTransition("driver_en_route", "cancelled_by_rider")).toBe(true);
    expect(canTransition("trip_started", "cancelled_by_rider")).toBe(false);
  });

  it("applies the configured platform percentage to driver earnings", () => {
    expect(calculateDriverSplit(100000, 2000)).toEqual({ grossFareKobo: 100000, platformCommissionKobo: 20000, driverEarningKobo: 80000, commissionBps: 2000 });
    expect(calculateDriverSplit(100000, 3500).driverEarningKobo).toBe(65000);
  });
});
