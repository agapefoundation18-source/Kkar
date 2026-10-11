import { describe, expect, it } from "vitest";
import { compareSemanticVersions, parseSemanticVersion } from "../shared/appRelease";

describe("application release versions", () => {
  it("accepts valid semantic versions and rejects malformed values", () => {
    expect(parseSemanticVersion("1.2.3")).not.toBeNull();
    expect(parseSemanticVersion("1.2.3-beta.1+build.7")).not.toBeNull();
    expect(parseSemanticVersion("01.2.3")).toBeNull();
    expect(parseSemanticVersion("1.2")).toBeNull();
    expect(parseSemanticVersion("1.2.3-beta.01")).toBeNull();
    expect(parseSemanticVersion("1.2.3-")).toBeNull();
    expect(parseSemanticVersion("999999999999999999999999.0.0")).not.toBeNull();
  });

  it("compares stable and pre-release versions using semantic precedence", () => {
    expect(compareSemanticVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareSemanticVersions("2.0.0", "2.0.0-rc.1")).toBeGreaterThan(0);
    expect(compareSemanticVersions("2.0.0-rc.2", "2.0.0-rc.10")).toBeLessThan(0);
    expect(compareSemanticVersions("1.4.0+build.2", "1.4.0")).toBe(0);
    expect(compareSemanticVersions("999999999999999999999999.0.0", "9.0.0")).toBeGreaterThan(0);
  });
});
