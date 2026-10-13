import type { Coordinate } from "@shared/rideMath";
import { getNigerianLgas, nigeriaStates } from "@shared/nigeriaLocations";

export type Place = Coordinate & { label: string; state?: string; lga?: string };
export type RouteStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
};
export type RouteEstimate = {
  distanceKm: number;
  durationMinutes: number;
  path: Coordinate[];
  steps: RouteStep[];
};

type GeoapifyGeocodeResult = {
  formatted?: string;
  lat?: number;
  lon?: number;
  country_code?: string;
  state?: string;
  county?: string;
  district?: string;
  city?: string;
  suburb?: string;
};
type GeoapifyGeocodeResponse = { results?: GeoapifyGeocodeResult[] };

type GeoapifyRouteResponse = {
  features?: Array<{
    geometry?: {
      type?: "LineString" | "MultiLineString";
      coordinates?: [number, number][] | [number, number][][];
    };
    properties?: {
      distance?: number;
      time?: number;
      legs?: Array<{
        steps?: Array<{
          distance?: number;
          time?: number;
          instruction?: { text?: string };
        }>;
      }>;
    };
  }>;
};

const nigeriaCenter: Coordinate = { lat: 9.08, lng: 7.49 };

function normalizeAreaName(value: string) {
  return value
    .toLowerCase()
    .replace(/\blocal government area\b|\blga\b|\bstate\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function canonicalState(value?: string) {
  if (!value) return undefined;
  const normalized = normalizeAreaName(value);
  if (["fct", "federalcapitalterritory", "abuja"].includes(normalized)) return "FCT";
  return nigeriaStates.find(state => normalizeAreaName(state) === normalized);
}

function canonicalLga(state: string | undefined, value?: string) {
  if (!state || !value) return undefined;
  const normalized = normalizeAreaName(value);
  return getNigerianLgas(state).find(lga => normalizeAreaName(lga) === normalized);
}

function geocodedLga(state: string | undefined, place?: GeoapifyGeocodeResult) {
  if (!place) return undefined;
  return canonicalLga(state, place.county)
    ?? canonicalLga(state, place.district)
    ?? canonicalLga(state, place.city);
}

function isRoutePosition(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === "number"
    && typeof value[1] === "number";
}

function isRouteLine(value: unknown): value is [number, number][] {
  return Array.isArray(value) && value.every(isRoutePosition);
}

export function getGeoapifyApiKey() {
  return import.meta.env.VITE_GEOAPIFY_API_KEY?.trim() ?? "";
}

function requireApiKey() {
  const key = getGeoapifyApiKey();
  if (!key) {
    throw new Error("Map services are not configured yet. Add the Geoapify API key to the app configuration.");
  }
  return key;
}

async function fetchGeoapify<T>(url: URL, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Geoapify rejected the API key. Check that it is active and allowed for this site.");
    }
    if (response.status === 429) {
      throw new Error("Geoapify request limit reached. Wait a moment and try again.");
    }
    throw new Error(`Geoapify is temporarily unavailable (${response.status}). Please try again.`);
  }
  return response.json() as Promise<T>;
}

function geocodeUrl(endpoint: "autocomplete" | "reverse") {
  const url = new URL(`https://api.geoapify.com/v1/geocode/${endpoint}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("lang", "en");
  url.searchParams.set("apiKey", requireApiKey());
  return url;
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  area?: { state?: string; lga?: string; location?: Coordinate | null },
): Promise<Place[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 3) return [];

  const url = geocodeUrl("autocomplete");
  url.searchParams.set("text", `${trimmedQuery}, Nigeria`);
  url.searchParams.set("filter", "countrycode:ng");
  const bias = area?.location ?? nigeriaCenter;
  url.searchParams.set("bias", `proximity:${bias.lng},${bias.lat}`);
  url.searchParams.set("limit", "6");
  const result = await fetchGeoapify<GeoapifyGeocodeResponse>(url, signal);
  return (result.results ?? [])
    .filter(item =>
      typeof item.formatted === "string"
      && Number.isFinite(item.lat)
      && Number.isFinite(item.lon)
      && item.country_code?.toLowerCase() === "ng"
      && isInsideServiceArea({ lat: item.lat!, lng: item.lon! }),
    )
    .map(item => {
      const state = canonicalState(item.state);
      return {
        label: item.formatted!.slice(0, 255),
        lat: item.lat!,
        lng: item.lon!,
        state,
        lga: geocodedLga(state, item),
      };
    });
}

export async function reverseGeocode(point: Coordinate, signal?: AbortSignal): Promise<string> {
  const place = await reverseGeocodePlace(point, signal);
  return place.label;
}

export async function reverseGeocodePlace(point: Coordinate, signal?: AbortSignal): Promise<Place> {
  const url = geocodeUrl("reverse");
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  const result = await fetchGeoapify<GeoapifyGeocodeResponse>(url, signal);
  const address = result.results?.[0];
  return {
    ...point,
    label: address?.formatted?.slice(0, 255) || "Pinned map location",
    state: canonicalState(address?.state),
    lga: geocodedLga(canonicalState(address?.state), address),
  };
}

export async function getRouteEstimate(
  pickup: Coordinate,
  destination: Coordinate,
  signal?: AbortSignal,
): Promise<RouteEstimate> {
  const url = new URL("https://api.geoapify.com/v1/routing");
  url.searchParams.set("waypoints", `${pickup.lat},${pickup.lng}|${destination.lat},${destination.lng}`);
  url.searchParams.set("mode", "drive");
  url.searchParams.set("units", "metric");
  url.searchParams.set("lang", "en");
  url.searchParams.set("details", "instruction_details");
  url.searchParams.set("format", "geojson");
  url.searchParams.set("apiKey", requireApiKey());

  const result = await fetchGeoapify<GeoapifyRouteResponse>(url, signal);
  const feature = result.features?.[0];
  const properties = feature?.properties;
  const distance = properties?.distance;
  const duration = properties?.time;
  const geometry = feature?.geometry;
  const coordinates = geometry?.type === "LineString" && isRouteLine(geometry.coordinates)
    ? [geometry.coordinates]
    : geometry?.type === "MultiLineString"
      && Array.isArray(geometry.coordinates)
      && geometry.coordinates.every(isRouteLine)
      ? geometry.coordinates
      : null;
  if (
    !properties
    || typeof distance !== "number"
    || !Number.isFinite(distance)
    || typeof duration !== "number"
    || !Number.isFinite(duration)
    || distance <= 0
    || duration <= 0
    || !coordinates
    || coordinates.length === 0
  ) {
    throw new Error("Geoapify could not find a drivable route between those locations.");
  }

  const path = coordinates
    .flat()
    .map(([lng, lat]) => ({ lat, lng }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (path.length < 2) {
    throw new Error("Geoapify returned an invalid route geometry.");
  }

  const steps = (properties.legs ?? [])
    .flatMap(leg => leg.steps ?? [])
    .filter(step =>
      typeof step.instruction?.text === "string"
      && Number.isFinite(step.distance)
      && Number.isFinite(step.time),
    )
    .map(step => ({
      instruction: step.instruction!.text!,
      distanceMeters: step.distance!,
      durationSeconds: step.time!,
    }));

  return {
    distanceKm: distance / 1000,
    durationMinutes: Math.max(1, Math.ceil(duration / 60)),
    path,
    steps,
  };
}

export function geoapifyTileUrl() {
  const key = getGeoapifyApiKey();
  if (!key) return null;
  return `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(key)}`;
}

export function defaultMapCenter(): Coordinate {
  return nigeriaCenter;
}

export function isInsideServiceArea(point: Coordinate) {
  return point.lat >= 4 && point.lat <= 14 && point.lng >= 2 && point.lng <= 15;
}
