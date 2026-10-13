import { afterEach, describe, expect, it, vi } from "vitest";
import { coordinateFallbackLabel, geolocationErrorMessage, getCurrentDeviceLocation, validateCoordinates } from "./location";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ride location helpers", () => {
  it("validates real latitude and longitude values", () => {
    expect(validateCoordinates({ lat: 5.03, lng: 7.91 })).toEqual({ lat: 5.03, lng: 7.91 });
    expect(() => validateCoordinates({ lat: 91, lng: 7.91 })).toThrow("invalid coordinates");
    expect(() => validateCoordinates({ lat: 5.03, lng: Number.NaN })).toThrow("invalid coordinates");
  });

  it("keeps a coordinate-based label available when address lookup is unavailable", () => {
    expect(coordinateFallbackLabel({ lat: 5.03, lng: 7.91 })).toBe("Pinned location (5.03000, 7.91000)");
  });

  it("explains permission, unavailable-position, and timeout errors separately", () => {
    expect(geolocationErrorMessage("permission_denied")).toContain("permission was denied");
    expect(geolocationErrorMessage("position_unavailable")).toContain("could not determine");
    expect(geolocationErrorMessage("timeout")).toContain("too long");
  });

  it("returns validated coordinates from the browser geolocation success callback", async () => {
    const getCurrentPosition = vi.fn(success => success({ coords: { latitude: 5.03, longitude: 7.91 } }));
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    await expect(getCurrentDeviceLocation()).resolves.toEqual({ lat: 5.03, lng: 7.91 });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it("classifies browser permission denial as a retryable location failure", async () => {
    const permissionError = { code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
    const getCurrentPosition = vi.fn((_success, failure) => failure(permissionError));
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    await expect(getCurrentDeviceLocation()).rejects.toMatchObject({ failure: "permission_denied" });
  });
});
