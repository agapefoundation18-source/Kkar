import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { Coordinate } from "@shared/rideMath";
import type { Place } from "./rideLocations";
import { geoapifyTileUrl } from "./rideLocations";
import "leaflet/dist/leaflet.css";

const markerIcon = (color: string) =>
  L.divIcon({
    className: "",
    html: `<span style="display:block;width:18px;height:18px;border:4px solid white;border-radius:50%;background:${color};box-shadow:0 2px 8px #102a2c88"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const pickupIcon = markerIcon("#16866d");
const destinationIcon = markerIcon("#f4b942");
const driverIcon = markerIcon("#2769c9");

function MapInteraction({
  target,
  onSelect,
  focus,
  fit,
}: {
  target: "pickup" | "destination" | null;
  onSelect?: (target: "pickup" | "destination", point: Coordinate) => void;
  focus: Coordinate;
  fit: Coordinate[];
}) {
  const map = useMap();
  const fitKey = fit.map(point => `${point.lat},${point.lng}`).join(";");
  useMapEvents({
    click(event) {
      if (target && onSelect) {
        onSelect(target, { lat: event.latlng.lat, lng: event.latlng.lng });
      }
    },
  });
  useEffect(() => {
    if (fit.length > 1) {
      map.fitBounds(fit.map(point => [point.lat, point.lng]), { padding: [32, 32], maxZoom: 15 });
    } else {
      map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 13), { duration: 0.5 });
    }
  }, [fitKey, focus.lat, focus.lng, map]);
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 100);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}

export function RideMap({
  pickup,
  destination,
  driver,
  route,
  center,
  selectionTarget = null,
  onSelectLocation,
  className = "h-[320px]",
}: {
  pickup?: Place | null;
  destination?: Place | null;
  driver?: (Coordinate & { name?: string | null }) | null;
  route?: Coordinate[];
  center: Coordinate;
  selectionTarget?: "pickup" | "destination" | null;
  onSelectLocation?: (target: "pickup" | "destination", point: Coordinate) => void;
  className?: string;
}) {
  const tileUrl = geoapifyTileUrl();
  const fitPoints = useMemo(() => [
    ...(route?.length ? route : []),
    ...(pickup ? [pickup] : []),
    ...(destination ? [destination] : []),
  ], [route, pickup?.lat, pickup?.lng, destination?.lat, destination?.lng]);
  const focus = pickup ?? center;
  const routePositions = route?.map(point => [point.lat, point.lng] as [number, number]) ?? [];

  return (
    <div className={`relative z-0 overflow-hidden rounded-[24px] ${className}`}>
      {tileUrl ? (
        <MapContainer center={[center.lat, center.lng]} zoom={13} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> | &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
            url={tileUrl}
            maxZoom={20}
          />
          <MapInteraction
            target={selectionTarget}
            onSelect={onSelectLocation}
            focus={focus}
            fit={fitPoints}
          />
          {routePositions.length > 1 && (
            <Polyline positions={routePositions} pathOptions={{ color: "#167c6a", weight: 5, opacity: 0.8 }} />
          )}
          {pickup && (
            <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}>
              <Popup>Pickup: {pickup.label}</Popup>
            </Marker>
          )}
          {destination && (
            <Marker position={[destination.lat, destination.lng]} icon={destinationIcon}>
              <Popup>Destination: {destination.label}</Popup>
            </Marker>
          )}
          {driver && (
            <Marker position={[driver.lat, driver.lng]} icon={driverIcon}>
              <Popup>{driver.name || "Your driver"}</Popup>
            </Marker>
          )}
        </MapContainer>
      ) : (
        <div className="flex h-full flex-col items-center justify-center bg-[#eaf4f1] px-6 text-center">
          <div className="text-sm font-black text-[#153b3b]">Geoapify map setup needed</div>
          <p className="mt-2 max-w-xs text-xs leading-relaxed text-[#64807a]">
            Add the Geoapify API key as VITE_GEOAPIFY_API_KEY to enable the map, address search, and routes.
          </p>
        </div>
      )}
      {selectionTarget && (
        <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-full bg-white/95 px-3 py-2 text-[11px] font-bold text-[#21494a] shadow">
          Tap map to set {selectionTarget}
        </div>
      )}
    </div>
  );
}
