import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("Kkary fare engine", () => {
  it("calculates a bike fare from the configurable rule and distance", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });

    const result = await caller.rider.estimateFare({ vehicleType: "bike", distanceKm: 6.4 });

    expect(result.pricingSource).toBe("configurable_rule");
    expect(result.fareKobo).toBe(155200);
    expect(result.fareKobo).not.toBe(500 * 100 * 6.4);
  });

  it("enforces the minimum fare for very short car trips", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });

    const result = await caller.rider.estimateFare({ vehicleType: "car", distanceKm: 0.1 });

    expect(result.fareKobo).toBe(150000);
  });
});
