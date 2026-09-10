/**
 * LGA Reverse Geocoding Service
 * Detects user's current LGA (Local Government Area) from GPS coordinates
 */

import { makeRequest, GeocodingResult, LatLng } from "./map";

// Akwa Ibom LGAs with alternate names and keywords
const lgas = [
  "Abak",
  "Eastern Obolo",
  "Eket",
  "Esit Eket",
  "Essien Udim",
  "Etim Ekpo",
  "Etinan",
  "Ibeno",
  "Ibesikpo Asutan",
  "Ibiono-Ibom",
  "Ika",
  "Ikono",
  "Ikot Abasi",
  "Ikot Ekpene",
  "Ini",
  "Itu",
  "Mbo",
  "Mkpat-Enin",
  "Nsit-Atai",
  "Nsit-Ibom",
  "Nsit-Ubium",
  "Obot Akara",
  "Okobo",
  "Onna",
  "Oron",
  "Oruk Anam",
  "Udung-Uko",
  "Ukanafun",
  "Uruan",
  "Urue-Offong/Oruko",
  "Uyo",
] as const;

export type LGA = typeof lgas[number];

/**
 * Reverse geocode GPS coordinates to determine which LGA they are in
 * Returns the LGA name or null if not found in Akwa Ibom
 */
export async function detectLgaFromCoordinates(
  lat: number,
  lng: number
): Promise<LGA | null> {
  try {
    // Call Google Maps Reverse Geocoding API
    const result = await makeRequest<GeocodingResult>("/maps/api/geocode/json", {
      latlng: `${lat},${lng}`,
    });

    if (result.status !== "OK" || !result.results.length) {
      return null;
    }

    // Extract address components
    const firstResult = result.results[0];
    const addressComponents = firstResult.address_components || [];
    const formattedAddress = firstResult.formatted_address || "";

    // Look for LGA match in address components
    for (const component of addressComponents) {
      const longName = component.long_name;
      if (lgas.includes(longName as LGA)) {
        return longName as LGA;
      }
    }

    // Fallback: check formatted address
    for (const lga of lgas) {
      if (formattedAddress.includes(lga)) {
        return lga;
      }
    }

    // Default to Uyo if in Akwa Ibom but LGA not identified
    if (formattedAddress.includes("Akwa Ibom")) {
      return "Uyo";
    }

    return null;
  } catch (error) {
    console.error("LGA detection error:", error);
    return null;
  }
}

/**
 * Get the list of valid LGAs
 */
export function getLgas(): ReadonlyArray<LGA> {
  return lgas;
}

/**
 * Validate if an LGA is in the list
 */
export function isValidLga(lga: string): lga is LGA {
  return lgas.includes(lga as LGA);
}

/**
 * Calculate distance between two coordinates (in km)
 */
export function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
