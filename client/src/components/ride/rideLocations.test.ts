import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultMapCenter, getGeoapifyApiKey, geoapifyTileUrl, getRouteEstimate, isInsideServiceArea, reverseGeocode, searchPlaces, searchVisiblePlaces } from "./rideLocations";

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

  it("centers maps and limits place search to Akwa Ibom", async () => {
    expect(defaultMapCenter()).toEqual({ lat: 5.04, lng: 7.92 });
    expect(isInsideServiceArea({ lat: 5.04, lng: 7.92 })).toBe(true);
    expect(isInsideServiceArea({ lat: 6.45, lng: 3.4 })).toBe(false);
  });

  it("uses Akwa Ibom-biased autocomplete and filters out results in other states", async () => {
    vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
    mockedFetch.mockResolvedValue(jsonResponse({
      results: [
        { formatted: "336 Nwaniba Road, Uyo, Akwa Ibom, Nigeria", lat: 5.03, lon: 7.91, country_code: "ng", state: "Akwa Ibom State", county: "Uyo" },
        { formatted: "Lagos Island, Lagos, Nigeria", lat: 6.45, lon: 3.4, country_code: "ng", state: "Lagos State", county: "Lagos Island" },
      ],
    }));
    vi.stubGlobal("fetch", mockedFetch);

    const places = await searchPlaces("Uyo");
    const requestUrl = new URL(String(mockedFetch.mock.calls[0][0]));
    expect(requestUrl.pathname).toBe("/v1/geocode/autocomplete");
    expect(requestUrl.searchParams.get("filter")).toBe("rect:7.2,4.2,8.5,5.7");
    expect(requestUrl.searchParams.get("text")).toBe("Uyo, Akwa Ibom, Nigeria");
    expect(places).toEqual([
      { label: "336 Nwaniba Road, Uyo, Akwa Ibom, Nigeria", lat: 5.03, lng: 7.91, state: "Akwa Ibom", lga: "Uyo" },
    ]);
  });

  it("loads only mapped local places intersecting the Akwa Ibom viewport", async () => {
    vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
    mockedFetch.mockResolvedValue(jsonResponse({
      features: [
        {
          geometry: { type: "Point", coordinates: [7.91, 5.03] },
          properties: {
            place_id: "ibom-icon",
            name: "Ibom Icon Hotels and Golf Resort",
            state: "Akwa Ibom State",
            categories: ["accommodation.hotel", "tourism.attraction"],
          },
        },
        {
          geometry: { type: "Point", coordinates: [7.91, 5.03] },
          properties: { place_id: "unknown-state", name: "Outside service area", state: "Abia State", categories: ["commercial.shop"] },
        },
      ],
    }));
    vi.stubGlobal("fetch", mockedFetch);

    const places = await searchVisiblePlaces({ south: 4.9, west: 7.8, north: 5.2, east: 8.1 });
    const requestUrl = new URL(String(mockedFetch.mock.calls[0][0]));
    expect(requestUrl.pathname).toBe("/v2/places");
    expect(requestUrl.searchParams.get("filter")).toBe("rect:7.8,4.9,8.1,5.2");
    expect(requestUrl.searchParams.get("categories")).toContain("education.school");
    expect(places).toEqual([{
      id: "ibom-icon",
      label: "Ibom Icon Hotels and Golf Resort",
      lat: 5.03,
      lng: 7.91,
      state: "Akwa Ibom",
      categories: ["accommodation.hotel", "tourism.attraction"],
    }]);
  });

  it("does not query the POI service outside the Akwa Ibom map bounds", async () => {
    vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
    vi.stubGlobal("fetch", mockedFetch);

    await expect(searchVisiblePlaces({ south: 6, west: 7.8, north: 6.2, east: 8.1 })).resolves.toEqual([]);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("reports an invalid POI response instead of treating it as an empty map", async () => {
    vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
    mockedFetch.mockResolvedValue(jsonResponse({ message: "unexpected response" }));
    vi.stubGlobal("fetch", mockedFetch);

    await expect(searchVisiblePlaces({ south: 5.25, west: 7.8, north: 5.4, east: 8.1 }))
      .rejects.toThrow("Geoapify returned an invalid local-place response.");
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
