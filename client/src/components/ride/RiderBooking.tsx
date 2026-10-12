import { AlertCircle, Bike, Car, CheckCircle2, Clock3, LocateFixed, MapPin, Navigation, RefreshCw, Search, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Coordinate } from "@shared/rideMath";
import { formatNaira } from "@shared/rideMath";
import { supabase } from "@/lib/supabase";
import { RideMap } from "./RideMap";
import { RouteDirections } from "./RouteDirections";
import { akwaIbomMapBounds, defaultMapCenter, getRouteEstimate, isInsideServiceArea, reverseGeocode, searchPlaces, type Place, type RouteEstimate } from "./rideLocations";

type VehicleType = "bike" | "car";
type RideStatus = "matching" | "driver_assigned" | "driver_en_route" | "driver_arrived" | "trip_started" | "trip_completed" | "cancelled_by_rider" | "cancelled_by_driver" | "cancelled_no_driver";
type DriverSummary = {
  name: string | null;
  vehicle_type: VehicleType;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  plate_number: string | null;
  avatar_path: string | null;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: string | null;
};
type ActiveRide = {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  status: RideStatus;
  vehicle_type: VehicleType;
  estimated_fare: number | string;
  distance_km: number | string;
  eta_minutes: number;
  driver: DriverSummary | null;
};
type VehicleOption = {
  vehicle_type: VehicleType;
  estimated_fare: number | string;
  available_drivers: number;
};

const statusText: Record<RideStatus, string> = {
  matching: "Finding an available driver",
  driver_assigned: "Driver accepted your ride",
  driver_en_route: "Your driver is on the way",
  driver_arrived: "Your driver has arrived",
  trip_started: "Your trip is in progress",
  trip_completed: "Trip completed",
  cancelled_by_rider: "Ride cancelled",
  cancelled_by_driver: "Ride cancelled by driver",
  cancelled_no_driver: "No driver found",
};

function asRide(value: unknown): ActiveRide | null {
  if (!value || typeof value !== "object" || !("id" in value) || !("status" in value)) return null;
  return value as ActiveRide;
}

function LocationSearch({
  label,
  value,
  onChange,
  onSearch,
  onChoose,
  isSearching,
  results,
  color,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  onChoose: (place: Place) => void;
  isSearching: boolean;
  results: Place[];
  color: "green" | "yellow";
}) {
  return (
    <div className="rounded-2xl border border-[#e5efed] bg-[#f8fbfa] p-3">
      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#71a29c]">{label}</div>
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 shrink-0 rounded-full ${color === "green" ? "bg-[#16866d]" : "bg-[#f4b942]"}`} />
        <input
          value={value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSearch();
            }
          }}
          placeholder={`Search ${label.toLowerCase()} in Akwa Ibom`}
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#1c3d3d] outline-none placeholder:font-normal placeholder:text-[#8ba29d]"
        />
        <button
          type="button"
          onClick={onSearch}
          disabled={isSearching || value.trim().length < 3}
          aria-label={`Search ${label.toLowerCase()}`}
          className="rounded-xl p-2 text-[#3f8174] disabled:opacity-40"
        >
          {isSearching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </button>
      </div>
      {results.length > 0 && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-[#e3eeeb] bg-white">
          {results.map((place, index) => (
            <button
              key={`${place.lat}-${place.lng}-${index}`}
              type="button"
              onClick={() => onChoose(place)}
              className="flex w-full items-start gap-2 border-b border-[#edf3f1] px-3 py-2.5 text-left text-xs text-[#476b66] last:border-b-0 hover:bg-[#f2faf6]"
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#59958a]" />
              <span>{place.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RiderBooking() {
  const defaultCenter = useMemo(defaultMapCenter, []);
  const [pickup, setPickup] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [pickupQuery, setPickupQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [pickupResults, setPickupResults] = useState<Place[]>([]);
  const [destinationResults, setDestinationResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState<"pickup" | "destination" | null>(null);
  const [route, setRoute] = useState<RouteEstimate | null>(null);
  const [routeError, setRouteError] = useState("");
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [loadingVehicleOptions, setLoadingVehicleOptions] = useState(false);
  const [driverAvatarUrl, setDriverAvatarUrl] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("bike");
  const [selectionTarget, setSelectionTarget] = useState<"pickup" | "destination">("pickup");
  const [mapCenter, setMapCenter] = useState<Coordinate>(defaultCenter);
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [locationNotice, setLocationNotice] = useState("");
  const [activeRide, setActiveRide] = useState<ActiveRide | null>(null);
  const [loadingRide, setLoadingRide] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [locationBusy, setLocationBusy] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationNotice("Location is unavailable on this device. The map is showing Akwa Ibom.");
      return;
    }

    let active = true;
    navigator.geolocation.getCurrentPosition(
      position => {
        if (!active) return;
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (!isInsideServiceArea(point)) {
          setLocationNotice("Your location is outside the current service area. The map is showing Akwa Ibom.");
          return;
        }
        setUserLocation(point);
        setMapCenter(point);
        setLocationNotice("");
      },
      cause => {
        if (!active) return;
        setLocationNotice(cause.code === cause.PERMISSION_DENIED
          ? "Allow location access to pin your position. You can still explore the Akwa Ibom map."
          : "Your location could not be determined. You can still explore the Akwa Ibom map.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );

    return () => {
      active = false;
    };
  }, []);

  const loadActiveRide = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("get_my_active_ride");
    if (rpcError) throw rpcError;
    setActiveRide(asRide(data));
  }, []);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        await loadActiveRide();
        if (mounted) setError("");
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : "Couldn't load your current ride.");
      } finally {
        if (mounted) setLoadingRide(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [loadActiveRide]);

  const routePickup = useMemo(() => activeRide
    ? { lat: Number(activeRide.pickup_lat), lng: Number(activeRide.pickup_lng), label: activeRide.pickup_address }
    : pickup, [activeRide?.id, activeRide?.pickup_lat, activeRide?.pickup_lng, activeRide?.pickup_address, pickup]);
  const routeDestination = useMemo(() => activeRide
    ? { lat: Number(activeRide.dropoff_lat), lng: Number(activeRide.dropoff_lng), label: activeRide.dropoff_address }
    : destination, [activeRide?.id, activeRide?.dropoff_lat, activeRide?.dropoff_lng, activeRide?.dropoff_address, destination]);

  useEffect(() => {
    if (!routePickup || !routeDestination) {
      setRoute(null);
      setRouteError("");
      return;
    }
    const controller = new AbortController();
    setRoute(null);
    setRouteError("");
    void getRouteEstimate(routePickup, routeDestination, controller.signal)
      .then(result => {
        setRoute(result);
        if (!activeRide) setMapCenter(routePickup);
      })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setRouteError(cause instanceof Error ? cause.message : "Could not calculate a route.");
        }
      });
    return () => controller.abort();
  }, [
    activeRide?.id,
    activeRide?.pickup_lat,
    activeRide?.pickup_lng,
    activeRide?.dropoff_lat,
    activeRide?.dropoff_lng,
    activeRide?.pickup_address,
    activeRide?.dropoff_address,
    routePickup,
    routeDestination,
  ]);

  useEffect(() => {
    if (activeRide || !pickup || !destination || !route) {
      setVehicleOptions([]);
      setLoadingVehicleOptions(false);
      return;
    }

    let current = true;
    let firstLoad = true;
    const refreshVehicleOptions = async () => {
      try {
        const { data, error: optionsError } = await supabase.rpc("get_ride_vehicle_options", {
          p_pickup_lat: pickup.lat,
          p_pickup_lng: pickup.lng,
          p_route_distance_km: route.distanceKm,
          p_eta_minutes: route.durationMinutes,
        });
        if (optionsError) throw optionsError;
        if (!current) return;
        const options = Array.isArray(data) ? data as VehicleOption[] : [];
        setVehicleOptions(options);
        setVehicleType(selected => {
          if (options.some(option => option.vehicle_type === selected && Number(option.available_drivers) > 0)) return selected;
          return options.find(option => Number(option.available_drivers) > 0)?.vehicle_type ?? selected;
        });
        setError("");
      } catch (cause) {
        if (current) setError(cause instanceof Error ? cause.message : "Could not check nearby vehicle availability.");
      } finally {
        if (current && firstLoad) {
          firstLoad = false;
          setLoadingVehicleOptions(false);
        }
      }
    };
    setLoadingVehicleOptions(true);
    void refreshVehicleOptions();
    const timer = window.setInterval(() => void refreshVehicleOptions(), 15000);
    return () => {
      current = false;
      window.clearInterval(timer);
    };
  }, [activeRide?.id, pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, route?.distanceKm, route?.durationMinutes]);

  useEffect(() => {
    const avatarPath = activeRide?.driver?.avatar_path;
    if (!avatarPath) {
      setDriverAvatarUrl("");
      return;
    }
    let current = true;
    void supabase.storage.from("account-avatars").createSignedUrl(avatarPath, 3600)
      .then(({ data, error: avatarError }) => {
        if (avatarError) throw avatarError;
        if (current) setDriverAvatarUrl(data.signedUrl);
      })
      .catch(cause => {
        if (current) setError(cause instanceof Error ? `Unable to load your driver's profile picture. ${cause.message}` : "Unable to load your driver's profile picture.");
      });
    return () => { current = false; };
  }, [activeRide?.driver?.avatar_path]);

  useEffect(() => {
    const controller = new AbortController();
    const searches = [
      { target: "pickup" as const, query: pickupQuery, selected: pickup },
      { target: "destination" as const, query: destinationQuery, selected: destination },
    ];
    const timers = searches.map(({ target, query, selected }) => {
      const trimmedQuery = query.trim();
      if (trimmedQuery.length < 3 || trimmedQuery === selected?.label) return null;
      return window.setTimeout(() => {
        setSearching(target);
        void searchPlaces(trimmedQuery, controller.signal)
          .then(places => {
            if (target === "pickup") setPickupResults(places);
            else setDestinationResults(places);
          })
          .catch(cause => {
            if (!controller.signal.aborted) {
              setError(cause instanceof Error ? cause.message : "Place search failed. Please try again.");
            }
          })
          .finally(() => {
            if (!controller.signal.aborted) setSearching(null);
          });
      }, 350);
    });
    return () => {
      controller.abort();
      timers.forEach(timer => {
        if (timer !== null) window.clearTimeout(timer);
      });
    };
  }, [pickupQuery, destinationQuery, pickup, destination]);

  const searchLocation = async (target: "pickup" | "destination") => {
    const query = target === "pickup" ? pickupQuery : destinationQuery;
    setSearching(target);
    setError("");
    if (target === "pickup") setPickupResults([]);
    else setDestinationResults([]);
    try {
      const places = await searchPlaces(query);
      if (target === "pickup") setPickupResults(places);
      else setDestinationResults(places);
      if (!places.length) setError("No matching places found in Akwa Ibom. Try a nearby landmark or use the map.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Place search failed. Please try again.");
    } finally {
      setSearching(null);
    }
  };

  const choosePlace = (target: "pickup" | "destination", place: Place) => {
    setMapCenter(place);
    if (target === "pickup") {
      setPickup(place);
      setPickupQuery(place.label);
      setPickupResults([]);
      setSelectionTarget("destination");
    } else {
      setDestination(place);
      setDestinationQuery(place.label);
      setDestinationResults([]);
    }
  };

  const selectMapPoint = async (target: "pickup" | "destination", point: Coordinate) => {
    if (!isInsideServiceArea(point)) {
      setError("Kkary rides are currently available only in Akwa Ibom.");
      return;
    }
    setMapCenter(point);
    setError("");
    let label = `Pinned location (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`;
    try {
      label = await reverseGeocode(point);
    } catch (cause) {
      setError(cause instanceof Error ? `${cause.message} Using the map pin coordinates.` : "Address lookup failed. Using the map pin coordinates.");
    }
    choosePlace(target, { ...point, label });
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Location access is not available on this device.");
      return;
    }
    setLocationBusy(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      position => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (!isInsideServiceArea(point)) {
          setLocationBusy(false);
          setLocationNotice("Your location is outside the current service area. Rides are currently available in Akwa Ibom.");
          setError("Kkary rides are currently available only in Akwa Ibom. Search for a pickup there instead.");
          return;
        }
        setUserLocation(point);
        setLocationNotice("");
        setMapCenter(point);
        void reverseGeocode(point)
          .then(label => {
            const place = { ...point, label };
            setPickup(place);
            setPickupQuery(label);
            setSelectionTarget("destination");
          })
          .catch(cause => setError(cause instanceof Error ? cause.message : "Couldn't identify your current location."))
          .finally(() => setLocationBusy(false));
      },
      cause => {
        setLocationBusy(false);
        setError(cause.code === cause.PERMISSION_DENIED
          ? "Allow location access in your browser settings, or search for your pickup."
          : "Your location could not be determined. Search for the pickup instead.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  const cancelRide = async () => {
    if (!activeRide) return;
    setRequesting(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("update_ride_status", {
        p_ride_id: activeRide.id,
        p_status: "cancelled_by_rider",
      });
      if (rpcError) throw rpcError;
      await loadActiveRide();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not cancel this ride.");
      await loadActiveRide();
    } finally {
      setRequesting(false);
    }
  };

  const requestRide = async () => {
    if (!pickup || !destination || !route) return;
    setRequesting(true);
    setError("");
    try {
      const { data: freshOptionsData, error: availabilityError } = await supabase.rpc("get_ride_vehicle_options", {
        p_pickup_lat: pickup.lat,
        p_pickup_lng: pickup.lng,
        p_route_distance_km: route.distanceKm,
        p_eta_minutes: route.durationMinutes,
      });
      if (availabilityError) throw availabilityError;
      const freshOptions = Array.isArray(freshOptionsData) ? freshOptionsData as VehicleOption[] : [];
      setVehicleOptions(freshOptions);
      if (!freshOptions.some(option => option.vehicle_type === vehicleType && Number(option.available_drivers) > 0)) {
        throw new Error("No approved drivers for this vehicle are currently available near your pickup. Choose another vehicle or try again shortly.");
      }
      const adjustedEta = vehicleType === "bike"
        ? Math.ceil(route.durationMinutes * 1.25)
        : route.durationMinutes;
      const { data, error: rpcError } = await supabase.rpc("request_ride", {
        p_pickup_address: pickup.label,
        p_dropoff_address: destination.label,
        p_pickup_lat: pickup.lat,
        p_pickup_lng: pickup.lng,
        p_dropoff_lat: destination.lat,
        p_dropoff_lng: destination.lng,
        p_vehicle_type: vehicleType,
        p_pickup_lga: null,
        p_route_distance_km: route.distanceKm,
        p_eta_minutes: adjustedEta,
      });
      if (rpcError) throw rpcError;
      const created = asRide(data);
      if (!created) throw new Error("Kkary couldn't confirm the ride request. Please retry.");
      setActiveRide(created);
      setPickup(null);
      setDestination(null);
      setRoute(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ride request failed. Please try again.");
    } finally {
      setRequesting(false);
    }
  };

  const driverLocation = activeRide?.driver?.current_lat != null && activeRide.driver.current_lng != null
    ? { lat: Number(activeRide.driver.current_lat), lng: Number(activeRide.driver.current_lng), name: activeRide.driver.name }
    : null;
  const activePickup = activeRide
    ? { lat: Number(activeRide.pickup_lat), lng: Number(activeRide.pickup_lng), label: activeRide.pickup_address }
    : pickup;
  const activeDestination = activeRide
    ? { lat: Number(activeRide.dropoff_lat), lng: Number(activeRide.dropoff_lng), label: activeRide.dropoff_address }
    : destination;
  const selectedVehicleOption = vehicleOptions.find(option => option.vehicle_type === vehicleType);
  const fare = selectedVehicleOption ? Number(selectedVehicleOption.estimated_fare) : null;
  const activeStatus = activeRide ? statusText[activeRide.status] ?? activeRide.status : "";
  const isTerminal = activeRide && ["trip_completed", "cancelled_by_rider", "cancelled_by_driver", "cancelled_no_driver"].includes(activeRide.status);
  const startAnotherRide = () => {
    setActiveRide(null);
    setPickup(null);
    setDestination(null);
    setPickupQuery("");
    setDestinationQuery("");
  };

  return (
    <div className="space-y-4 px-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#6d9c93]">Kkary rides</div>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.05em] text-[#153b3b]">
            {activeRide ? "Your ride" : "Where are you going?"}
          </h2>
        </div>
        {!activeRide && (
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locationBusy}
            className="inline-flex items-center gap-2 rounded-xl border border-[#dfeceb] bg-white px-3 py-2.5 text-xs font-bold text-[#34796e] disabled:opacity-50"
          >
            {locationBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            My location
          </button>
        )}
      </div>

      {activeRide ? (
        <div className="rounded-2xl border border-[#dcebe5] bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-[#e9f5ef] text-[#24806e]">
                {activeRide.status === "matching" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              </span>
              <div>
                <div className="font-black text-[#163c3d]">{activeStatus}</div>
                <div className="mt-1 text-xs text-[#78918d]">Ride #{activeRide.id.slice(0, 8)}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase text-[#7e9992]">Estimate</div>
              <div className="font-black text-[#163c3d]">{formatNaira(Number(activeRide.estimated_fare))}</div>
            </div>
          </div>
          {activeRide.driver && (
            <div className="mt-4 rounded-xl bg-[#f4f9f7] p-3">
              <div className="flex items-center gap-3">
                {driverAvatarUrl
                  ? <img src={driverAvatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                  : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#dcece6] text-[#38786d]"><UserRound className="h-6 w-6" /></span>}
                <div>
                  <div className="text-sm font-black text-[#173d3c]">{activeRide.driver.name || "Kkary driver"}</div>
                  <div className="mt-1 text-xs text-[#66827c]">
                    {[activeRide.driver.vehicle_color, activeRide.driver.vehicle_make, activeRide.driver.vehicle_model].filter(Boolean).join(" ")}
                    {activeRide.driver.plate_number ? ` · ${activeRide.driver.plate_number}` : ""}
                  </div>
                </div>
              </div>
              <div className="mt-1 text-[11px] font-semibold capitalize text-[#4c8377]">
                {activeRide.driver.vehicle_type} · Assigned
              </div>
            </div>
          )}
          <div className="mt-4">
            <RideMap
              pickup={activePickup}
              destination={activeDestination}
              driver={driverLocation}
              userLocation={userLocation}
              route={route?.path}
              center={activePickup ?? mapCenter}
              className="h-[300px]"
            />
          </div>
          {route && <RouteDirections steps={route.steps} className="mt-3" />}
          <div className="mt-3 grid gap-2 text-xs text-[#52736d]">
            <div><span className="font-bold text-[#16866d]">Pickup:</span> {activeRide.pickup_address}</div>
            <div><span className="font-bold text-[#b8871d]">Destination:</span> {activeRide.dropoff_address}</div>
          </div>
          {!isTerminal && activeRide.status !== "trip_started" && (
            <button
              type="button"
              onClick={cancelRide}
              disabled={requesting}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#f0d8d4] py-2.5 text-xs font-bold text-[#a5473d] disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Cancel ride
            </button>
          )}
          {isTerminal && (
            <button
              type="button"
              onClick={startAnotherRide}
              className="mt-4 w-full rounded-xl bg-[#12393a] py-3 text-sm font-black text-white"
            >
              Done · Book another ride
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-[28px] border border-[#dfeceb] bg-white p-3 shadow-[0_14px_36px_rgba(16,53,58,0.06)]">
            <RideMap
              pickup={pickup}
              destination={destination}
              userLocation={userLocation}
              center={mapCenter}
              initialBounds={akwaIbomMapBounds}
              initialZoom={9}
              route={route?.path}
              selectionTarget={selectionTarget}
              onSelectLocation={selectMapPoint}
              className="h-[min(58vh,520px)] min-h-[340px]"
            />
            {locationNotice && (
              <div role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-[#f2f8f5] p-3 text-xs text-[#567770]">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#34796e]" />
                {locationNotice}
              </div>
            )}
            {route && <RouteDirections steps={route.steps} className="mt-3" />}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectionTarget("pickup")}
                className={`rounded-xl px-3 py-2.5 text-xs font-bold ${selectionTarget === "pickup" ? "bg-[#e9f5ef] text-[#247966]" : "bg-[#f5f8f7] text-[#66817b]"}`}
              >
                Choose pickup on map
              </button>
              <button
                type="button"
                onClick={() => setSelectionTarget("destination")}
                className={`rounded-xl px-3 py-2.5 text-xs font-bold ${selectionTarget === "destination" ? "bg-[#fff4dc] text-[#9b751f]" : "bg-[#f5f8f7] text-[#66817b]"}`}
              >
                Choose destination
              </button>
            </div>
          </div>

          <LocationSearch
            label="Pickup"
            value={pickupQuery}
            onChange={setPickupQuery}
            onSearch={() => void searchLocation("pickup")}
            onChoose={place => choosePlace("pickup", place)}
            isSearching={searching === "pickup"}
            results={pickupResults}
            color="green"
          />
          <LocationSearch
            label="Destination"
            value={destinationQuery}
            onChange={setDestinationQuery}
            onSearch={() => void searchLocation("destination")}
            onChoose={place => choosePlace("destination", place)}
            isSearching={searching === "destination"}
            results={destinationResults}
            color="yellow"
          />

          {route && (
            <div className="rounded-2xl bg-[#12393a] p-4 text-white">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[#c0ddd5]">
                  <Navigation className="h-4 w-4 text-[#f4b942]" />
                  {route.distanceKm.toFixed(1)} km · about {vehicleType === "bike" ? Math.ceil(route.durationMinutes * 1.25) : route.durationMinutes} min
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-[#c0ddd5]">Estimated fare</div>
                  <div className="text-lg font-black">
                    {fare === null
                      ? loadingVehicleOptions ? "Checking nearby vehicles…" : "Fare unavailable"
                      : formatNaira(fare)}
                  </div>
                </div>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2">
                {(["bike", "car"] as const).map(vehicle => {
                  const option = vehicleOptions.find(item => item.vehicle_type === vehicle);
                  const available = Number(option?.available_drivers ?? 0);
                  return (
                    <button
                      key={vehicle}
                      type="button"
                      onClick={() => setVehicleType(vehicle)}
                      disabled={available === 0}
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2.5 text-xs font-bold capitalize disabled:cursor-not-allowed disabled:opacity-50 ${vehicleType === vehicle ? "bg-[#f4b942] text-[#153a3a]" : "bg-white/10 text-white"}`}
                    >
                      <span className="flex items-center gap-2">
                        {vehicle === "bike" ? <Bike className="h-4 w-4" /> : <Car className="h-4 w-4" />}
                        {vehicle}
                      </span>
                      <span className="text-[10px]">{loadingVehicleOptions ? "Checking nearby…" : available > 0 ? `${available} nearby · ${formatNaira(Number(option?.estimated_fare))}` : "No drivers nearby"}</span>
                    </button>
                  );
                })}
              </div>
              {!loadingVehicleOptions && !vehicleOptions.some(option => Number(option.available_drivers) > 0) && (
                <p className="mb-3 text-center text-xs text-[#f4d797]">No approved drivers are currently available near your pickup. Try again shortly.</p>
              )}
              <button
                type="button"
                onClick={() => void requestRide()}
                disabled={requesting || loadingRide || loadingVehicleOptions || !selectedVehicleOption || Number(selectedVehicleOption.available_drivers) === 0}
                className="w-full rounded-xl bg-[#f4b942] px-4 py-3 text-sm font-black text-[#153a3a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {requesting ? "Requesting ride…" : loadingVehicleOptions ? "Checking nearby drivers…" : !selectedVehicleOption || Number(selectedVehicleOption.available_drivers) === 0 ? "No nearby drivers" : `Request ${vehicleType === "bike" ? "Bike" : "Car"}`}
              </button>
              <p className="mt-2 text-center text-[10px] text-[#c0ddd5]">Fare is an estimate. Confirm payment with your driver before travel.</p>
            </div>
          )}
          {!route && pickup && destination && !routeError && (
            <div className="flex items-center gap-2 rounded-xl bg-white p-3 text-xs font-semibold text-[#567770]">
              <RefreshCw className="h-4 w-4 animate-spin" /> Calculating your route…
            </div>
          )}
          {routeError && (
            <div className="flex items-start gap-2 rounded-xl border border-[#f0d8d4] bg-[#fff7f5] p-3 text-xs text-[#a5473d]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {routeError}
            </div>
          )}
        </>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-[#f0d8d4] bg-[#fff7f5] p-3 text-xs text-[#a5473d]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {loadingRide && !activeRide && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-[#78918d]">
          <Clock3 className="h-4 w-4 animate-pulse" /> Checking for an active ride…
        </div>
      )}
      {activeRide?.status === "matching" && (
        <div className="flex items-center gap-2 rounded-xl bg-[#eef7f3] p-3 text-xs text-[#4d766e]">
          <RefreshCw className="h-4 w-4 animate-spin" /> We’ll refresh this screen as drivers respond.
        </div>
      )}
    </div>
  );
}
