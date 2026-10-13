import { describe, expect, it } from "vitest";
import { shouldShowLaunchPage } from "./launchPage";

const futureLaunch = "2026-10-14T12:00:00.000Z";

describe("public launch-page gating", () => {
  it("gates Rider and Driver public paths, including install-mode query routes", () => {
    expect(shouldShowLaunchPage({
      pathname: "/",
      standalone: false,
      enabled: true,
      launchAt: futureLaunch,
      now: Date.parse("2026-10-13T12:00:00.000Z"),
    })).toBe(true);
    expect(shouldShowLaunchPage({
      pathname: "/drivers",
      standalone: false,
      enabled: true,
      launchAt: futureLaunch,
      now: Date.parse("2026-10-13T12:00:00.000Z"),
    })).toBe(true);
  });

  it("does not gate Admin, installed apps, disabled launch pages, or expired countdowns", () => {
    const base = {
      standalone: false,
      enabled: true,
      launchAt: futureLaunch,
      now: Date.parse("2026-10-13T12:00:00.000Z"),
    };
    expect(shouldShowLaunchPage({ ...base, pathname: "/admin" })).toBe(false);
    expect(shouldShowLaunchPage({ ...base, pathname: "/", standalone: true })).toBe(false);
    expect(shouldShowLaunchPage({ ...base, pathname: "/", enabled: false })).toBe(false);
    expect(shouldShowLaunchPage({
      ...base,
      pathname: "/",
      now: Date.parse(futureLaunch),
    })).toBe(false);
  });
});
