import type { Coordinate } from "@shared/rideMath";

export type GeolocationFailure = "permission_denied" | "position_unavailable" | "timeout" | "unsupported" | "invalid_position";

export class LocationAcquisitionError extends Error {
  constructor(readonly failure: GeolocationFailure) {
    super(geolocationErrorMessage(failure));
    this.name = "LocationAcquisitionError";
  }
}

export function geolocationErrorMessage(failure: GeolocationFailure): string {
  switch (failure) {
    case "permission_denied":
      return "Location permission was denied. Search for your pickup or allow location access and retry.";
    case "position_unavailable":
      return "Your device could not determine a location. Move to an area with a clearer GPS signal and retry.";
    case "timeout":
      return "Location took too long to respond. You can retry or search for your pickup.";
    case "unsupported":
      return "Location is not supported by this browser. Search for your pickup instead.";
    case "invalid_position":
      return "Your device returned invalid coordinates. Please retry or search for your pickup.";
  }
}

export function validateCoordinates(point: Coordinate): Coordinate {
  if (
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    point.lat < -90 ||
    point.lat > 90 ||
    point.lng < -180 ||
    point.lng > 180
  ) {
    throw new LocationAcquisitionError("invalid_position");
  }
  return point;
}

export function coordinateFallbackLabel(point: Coordinate): string {
  return `Pinned location (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`;
}

export function getCurrentDeviceLocation(
  options: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
): Promise<Coordinate> {
  if (!navigator.geolocation) {
    return Promise.reject(new LocationAcquisitionError("unsupported"));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position => {
        try {
          resolve(validateCoordinates({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }));
        } catch (error) {
          reject(error);
        }
      },
      error => {
        const failure: GeolocationFailure = error.code === error.PERMISSION_DENIED
          ? "permission_denied"
          : error.code === error.POSITION_UNAVAILABLE
            ? "position_unavailable"
            : error.code === error.TIMEOUT
              ? "timeout"
              : "position_unavailable";
        reject(new LocationAcquisitionError(failure));
      },
      options,
    );
  });
}
