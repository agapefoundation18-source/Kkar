import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Coordinate } from "@shared/rideMath";
import { geoapifyTileUrl, searchVisiblePlaces, type MapPlace, type Place } from "./rideLocations";
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
const vehicleEmoji: Record<"bike" | "car" | "tricycle", string> = {
  bike: "🏍️",
  car: "🚗",
  tricycle: "🛺",
};
const vehicleMarkerIcon = (type: "bike" | "car" | "tricycle") => L.divIcon({
  className: "",
  html: `<span style="display:flex;width:34px;height:34px;align-items:center;justify-content:center;border:2px solid white;border-radius:50%;background:#2769c9;box-shadow:0 2px 8px #102a2c88;font-size:18px">${vehicleEmoji[type]}</span>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});
const userLocationIcon = L.divIcon({
  className: "",
  html: '<span style="display:block;width:24px;height:24px;border:3px solid white;border-radius:50%;background:#2878e0;box-shadow:0 0 0 7px #2878e044,0 2px 8px #102a2c88"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});
function placeEmoji(categories: string[]) {
  if (categories.some(category => category.startsWith("education."))) return "🎓";
  if (categories.some(category => category.startsWith("religion."))) return "⛪";
  if (categories.some(category => category.startsWith("healthcare."))) return "🏥";
  if (categories.some(category => category.startsWith("catering."))) return "🍽️";
  if (categories.some(category => category.startsWith("commercial."))) return "🛍️";
  if (categories.some(category => category.startsWith("accommodation."))) return "🏨";
  if (categories.some(category => category.startsWith("tourism."))) return "📍";
  if (categories.some(category => category.startsWith("leisure."))) return "🌳";
  if (categories.some(category => category.startsWith("service.vehicle."))) return "⛽";
  return "📍";
}

function localPlaceIcon(categories: string[]) {
  const icon = placeEmoji(categories);
  return L.divIcon({
    className: "",
    html: `<span style="display:flex;width:27px;height:27px;align-items:center;justify-content:center;border:2px solid white;border-radius:50%;background:#fff;box-shadow:0 1px 5px #102a2c66;font-size:15px">${icon}</span>`,
    iconSize: [27, 27],
    iconAnchor: [13, 13],
  });
}

function LocalPlacesLayer({ onStatusChange }: { onStatusChange: (status: string) => void }) {
  const map = useMap();
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    let timer: number | undefined;
    let controller: AbortController | undefined;
    const loadPlaces = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
      const currentZoom = map.getZoom();
      setZoom(currentZoom);
      if (currentZoom < 15) {
        setPlaces([]);
        onStatusChange("Zoom in to see local places");
        return;
      }
      onStatusChange("Loading mapped local places…");
      timer = window.setTimeout(() => {
        const bounds = map.getBounds();
        const requestController = new AbortController();
        controller = requestController;
        void searchVisiblePlaces({
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        }, requestController.signal)
          .then(results => {
            if (requestController.signal.aborted) return;
            setPlaces(results);
            onStatusChange(results.length
              ? `${results.length} mapped local places`
              : "No mapped places in this view yet");
          })
          .catch(error => {
            if (requestController.signal.aborted) return;
            setPlaces([]);
            const reason = error instanceof Error ? error.message : "Unknown map service error";
            onStatusChange(`Local places unavailable: ${reason}`);
            if (import.meta.env.DEV) console.warn("Could not load mapped places for this view.", error);
          });
      }, 300);
    };

    map.on("moveend zoomend", loadPlaces);
    loadPlaces();
    return () => {
      map.off("moveend zoomend", loadPlaces);
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [map, onStatusChange]);

  return (
    <>
      {places.map(place => (
        <Marker key={place.id} position={[place.lat, place.lng]} icon={localPlaceIcon(place.categories)}>
          <Tooltip permanent={zoom >= 16} direction="top" offset={[0, -11]}>{place.label}</Tooltip>
          <Popup>
            <strong>{place.label}</strong>
            {place.categories.length > 0 && <div>{place.categories.join(" · ")}</div>}
          </Popup>
        </Marker>
      ))}
    </>
  );
}

function MapInteraction({
  target,
  onSelect,
  focus,
  fit,
  userLocation,
}: {
  target: "pickup" | "destination" | null;
  onSelect?: (target: "pickup" | "destination", point: Coordinate) => void;
  focus: Coordinate;
  fit: Coordinate[];
  userLocation?: Coordinate | null;
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
    } else if (fit.length === 1) {
      map.flyTo([focus.lat, focus.lng], 16, { duration: 0.5 });
    } else if (userLocation) {
      map.flyTo([userLocation.lat, userLocation.lng], 16, { duration: 0.8 });
    } else {
      map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 13), { duration: 0.5 });
    }
  }, [fitKey, focus.lat, focus.lng, map, userLocation?.lat, userLocation?.lng]);
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
  userLocation,
  nearbyVehicles,
  route,
  center,
  initialZoom = 13,
  selectionTarget = null,
  onSelectLocation,
  showLocalPlaces = true,
  className = "h-[320px]",
}: {
  pickup?: Place | null;
  destination?: Place | null;
  driver?: (Coordinate & { name?: string | null; vehicleType?: "bike" | "car" | "tricycle" }) | null;
  userLocation?: Coordinate | null;
  nearbyVehicles?: Array<Coordinate & { vehicleType: "bike" | "car" | "tricycle" }>;
  route?: Coordinate[];
  center: Coordinate;
  initialZoom?: number;
  selectionTarget?: "pickup" | "destination" | null;
  onSelectLocation?: (target: "pickup" | "destination", point: Coordinate) => void;
  showLocalPlaces?: boolean;
  className?: string;
}) {
  const tileUrl = geoapifyTileUrl();
  const [localPlacesStatus, setLocalPlacesStatus] = useState("Zoom in to see local places");
  const updateLocalPlacesStatus = useMemo(() => (status: string) => setLocalPlacesStatus(status), []);
  const fitPoints = useMemo(() => [
    ...(route?.length ? route : []),
    ...(pickup ? [pickup] : []),
    ...(destination ? [destination] : []),
    ...(driver ? [{ lat: Number(driver.lat.toFixed(2)), lng: Number(driver.lng.toFixed(2)) }] : []),
  ], [route, pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, driver?.lat.toFixed(2), driver?.lng.toFixed(2)]);
  const focus = pickup ?? center;
  const routePositions = route?.map(point => [point.lat, point.lng] as [number, number]) ?? [];

  return (
    <div className={`relative z-0 overflow-hidden rounded-[24px] ${className}`}>
      {tileUrl ? (
        <MapContainer center={[center.lat, center.lng]} zoom={initialZoom} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> | &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
            url={tileUrl}
            maxZoom={20}
          />
          {showLocalPlaces && <LocalPlacesLayer onStatusChange={updateLocalPlacesStatus} />}
          <MapInteraction
            target={selectionTarget}
            onSelect={onSelectLocation}
            focus={focus}
            fit={fitPoints}
            userLocation={userLocation}
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
            <Marker position={[driver.lat, driver.lng]} icon={vehicleMarkerIcon(driver.vehicleType ?? "car")}>
              <Popup>{driver.name || "Your driver"} · {driver.vehicleType === "bike" ? "Motorcycle" : driver.vehicleType === "tricycle" ? "Tricycle" : "Car"}</Popup>
            </Marker>
          )}
          {nearbyVehicles?.map((vehicle, index) => (
            <Marker
              key={`${vehicle.vehicleType}-${vehicle.lat}-${vehicle.lng}-${index}`}
              position={[vehicle.lat, vehicle.lng]}
              icon={vehicleMarkerIcon(vehicle.vehicleType)}
            >
              <Popup>Online {vehicle.vehicleType === "bike" ? "motorcycle" : vehicle.vehicleType}</Popup>
            </Marker>
          ))}
          {userLocation && (
            <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon} zIndexOffset={1000}>
              <Popup>You are here</Popup>
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
      {tileUrl && showLocalPlaces && (
        <div role="status" title={localPlacesStatus} className="pointer-events-none absolute right-3 top-3 z-[500] max-w-[70vw] truncate rounded-full bg-white/95 px-3 py-2 text-[10px] font-semibold text-[#446b64] shadow">
          {localPlacesStatus}
        </div>
      )}
    </div>
  );
}
