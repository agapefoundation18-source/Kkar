import { afterEach, describe, expect, it, vi } from "vitest";
import { getGeoapifyApiKey, geoapifyTileUrl, getRouteEstimate, reverseGeocode, searchPlaces } from "./rideLocations";

const mockedFetch = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Geoapify ride locations", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    mockedFetch.mockReset();
  });

  it("builds a Geoapify tile URL when the client API key is configured", () => {
    vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
    expect(geoapifyTileUrl()).toContain("maps.geoapify.com/v1/tile/osm-carto/");
    expect(geoapifyTileUrl()).toContain("apiKey=test-key");
    expect(getGeoapifyApiKey()).toBe("test-key");
  });

  it("uses Geoapify autocomplete and limits results to Akwa Ibom in Nigeria", async () => {
    vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
    mockedFetch.mockResolvedValue(jsonResponse({
      results: [
        { formatted: "Uyo, Akwa Ibom, Nigeria", lat: 5.03, lon: 7.91, country_code: "ng" },
        { formatted: "Lagos, Nigeria", lat: 6.45, lon: 3.4, country_code: "ng" },
      ],
    }));
    vi.stubGlobal("fetch", mockedFetch);

    const places = await searchPlaces("Uyo");
    const requestUrl = new URL(String(mockedFetch.mock.calls[0][0]));
    expect(requestUrl.pathname).toBe("/v1/geocode/autocomplete");
    expect(requestUrl.searchParams.get("filter")).toBe("rect:7.25,4.3,8.6,5.7|countrycode:ng");
    expect(places).toEqual([{ label: "Uyo, Akwa Ibom, Nigeria", lat: 5.03, lng: 7.91 }]);
  });

  it("reverse geocodes a map pin through Geoapify", async () => {
    vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
    mockedFetch.mockResolvedValue(jsonResponse({
      results: [{ formatted: "Uyo, Akwa Ibom, Nigeria" }],
    }));
    vi.stubGlobal("fetch", mockedFetch);

    await expect(reverseGeocode({ lat: 5.03, lng: 7.91 })).resolves.toBe("Uyo, Akwa Ibom, Nigeria");
    expect(String(mockedFetch.mock.calls[0][0])).toContain("/v1/geocode/reverse?");
  });

  it("returns Geoapify driving geometry and maneuver instructions", async () => {
    vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
    mockedFetch.mockResolvedValue(jsonResponse({
      features: [{
        geometry: { type: "LineString", coordinates: [[7.91, 5.03], [7.92, 5.04]] },
        properties: {
          distance: 2200,
          time: 420,
          legs: [{
            steps: [
              { distance: 1200, time: 220, instruction: { text: "Head north" } },
              { distance: 1000, time: 200, instruction: { text: "Turn right" } },
            ],
          }],
        },
      }],
    }));
    vi.stubGlobal("fetch", mockedFetch);

    const route = await getRouteEstimate(
      { lat: 5.03, lng: 7.91 },
      { lat: 5.04, lng: 7.92 },
    );
    const requestUrl = new URL(String(mockedFetch.mock.calls[0][0]));
    expect(requestUrl.pathname).toBe("/v1/routing");
    expect(requestUrl.searchParams.get("mode")).toBe("drive");
    expect(requestUrl.searchParams.get("details")).toBe("instruction_details");
    expect(route.distanceKm).toBe(2.2);
    expect(route.durationMinutes).toBe(7);
    expect(route.path).toEqual([{ lat: 5.03, lng: 7.91 }, { lat: 5.04, lng: 7.92 }]);
    expect(route.steps.map(step => step.instruction)).toEqual(["Head north", "Turn right"]);
  });

  it("flattens Geoapify MultiLineString driving geometry", async () => {
    vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
    mockedFetch.mockResolvedValue(jsonResponse({
      features: [{
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [[7.91, 5.03], [7.915, 5.035]],
            [[7.915, 5.035], [7.92, 5.04]],
          ],
        },
        properties: {
          distance: 1935,
          time: 196.829,
          legs: [{
            steps: [
              { distance: 900, time: 90, instruction: { text: "Head north" } },
              { distance: 1035, time: 106, instruction: { text: "Turn right" } },
            ],
          }],
        },
      }],
    }));
    vi.stubGlobal("fetch", mockedFetch);

    const route = await getRouteEstimate(
      { lat: 5.03, lng: 7.91 },
      { lat: 5.04, lng: 7.92 },
    );

    expect(route.path).toEqual([
      { lat: 5.03, lng: 7.91 },
      { lat: 5.035, lng: 7.915 },
      { lat: 5.035, lng: 7.915 },
      { lat: 5.04, lng: 7.92 },
    ]);
    expect(route.distanceKm).toBe(1.935);
    expect(route.steps).toHaveLength(2);
  });

  it("fails clearly when map services are called without the Geoapify key", async () => {
    vi.stubEnv("VITE_GEOAPIFY_API_KEY", "");
    await expect(searchPlaces("Uyo")).rejects.toThrow("Add the Geoapify API key");
  });
});
