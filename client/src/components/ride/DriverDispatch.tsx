import { AlertCircle, Bike, Car, CheckCircle2, Clock3, LocateFixed, MapPin, Navigation, RefreshCw, ToggleLeft, ToggleRight, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatNaira } from "@shared/rideMath";
import { supabase } from "@/lib/supabase";
import { RideMap } from "./RideMap";
import { RouteDirections } from "./RouteDirections";
import { defaultMapCenter, getRouteEstimate, type Place, type RouteEstimate } from "./rideLocations";

type VehicleType = "bike" | "car";
type RideStatus = "matching" | "driver_assigned" | "driver_en_route" | "driver_arrived" | "trip_started" | "trip_completed" | "cancelled_by_rider" | "cancelled_by_driver" | "cancelled_no_driver";
type DriverProfile = {
  id: string;
  is_approved: boolean;
  is_online: boolean;
  vehicle_type: VehicleType;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_color: string;
  plate_number: string;
  current_lat: number | null;
  current_lng: number | null;
};
type RideRecord = {
  id: string;
  status: RideStatus;
  rider_id: string;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  vehicle_type: VehicleType;
  estimated_fare: number | string;
  distance_km: number | string;
  eta_minutes: number;
  created_at: string;
  driver?: { current_lat: number | null; current_lng: number | null } | null;
  rider?: { name: string | null; avatar_path: string | null } | null;
};
type DriverHistoryItem = {
  id: string;
  status: RideStatus;
  pickup_address: string;
  dropoff_address: string;
  created_at: string;
  estimated_fare: number | string;
  distance_km: number | string | null;
  vehicle_type: VehicleType;
};
type Application = {
  vehicle_type: VehicleType;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_color: string;
  plate_number: string;
};

const initialApplication: Application = {
  vehicle_type: "bike",
  vehicle_make: "",
  vehicle_model: "",
  vehicle_color: "",
  plate_number: "",
};

const nextStatus: Partial<Record<RideStatus, RideStatus>> = {
  driver_assigned: "driver_en_route",
  driver_en_route: "driver_arrived",
  driver_arrived: "trip_started",
  trip_started: "trip_completed",
};
const actionLabel: Partial<Record<RideStatus, string>> = {
  driver_assigned: "Start navigation",
  driver_en_route: "Mark arrived",
  driver_arrived: "Start trip",
  trip_started: "Complete trip",
};

function asDriverProfile(value: unknown): DriverProfile | null {
  if (!value || typeof value !== "object" || !("id" in value)) return null;
  return value as DriverProfile;
}

function asRide(value: unknown): RideRecord | null {
  if (!value || typeof value !== "object" || !("id" in value) || !("status" in value)) return null;
  return value as RideRecord;
}

function pointPlace(lat: number, lng: number, label: string): Place {
  return { lat: Number(lat), lng: Number(lng), label };
}

export function DriverDispatch({ view = "home" }: { view?: "home" | "earnings" }) {
  const defaultCenter = useMemo(defaultMapCenter, []);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [application, setApplication] = useState(initialApplication);
  const [availableRides, setAvailableRides] = useState<RideRecord[]>([]);
  const [activeRide, setActiveRide] = useState<RideRecord | null>(null);
  const [history, setHistory] = useState<DriverHistoryItem[]>([]);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [route, setRoute] = useState<RouteEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [riderAvatarUrls, setRiderAvatarUrls] = useState<Record<string, string>>({});
  const watchId = useRef<number | null>(null);
  const lastLocationSentAt = useRef(0);
  const dismissedRideId = useRef<string | null>(null);
  const signedAvatarPaths = useRef<Record<string, string>>({});
  const notifiedRideIds = useRef(new Set<string>());

  const loadState = useCallback(async () => {
    const [profileResult, activeResult, historyResult] = await Promise.all([
      supabase.rpc("get_my_driver_profile"),
      supabase.rpc("get_my_active_ride"),
      supabase.rpc("get_my_ride_history"),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (activeResult.error) throw activeResult.error;
    if (historyResult.error) throw historyResult.error;
    const nextProfile = asDriverProfile(profileResult.data);
    const nextRide = asRide(activeResult.data);
    setProfile(nextProfile);
    setActiveRide(nextRide?.id === dismissedRideId.current ? null : nextRide);
    setHistory(Array.isArray(historyResult.data) ? historyResult.data as DriverHistoryItem[] : []);
    if (nextProfile?.current_lat != null && nextProfile.current_lng != null) {
      setDriverLocation({ lat: Number(nextProfile.current_lat), lng: Number(nextProfile.current_lng) });
    }
    if (nextProfile?.is_approved && nextProfile.is_online) {
      const { data, error: ridesError } = await supabase.rpc("list_available_ride_offers");
      if (ridesError) throw ridesError;
      const offers = Array.isArray(data) ? data as RideRecord[] : [];
      const newOffers = offers.filter(ride => !notifiedRideIds.current.has(ride.id));
      for (const ride of offers) notifiedRideIds.current.add(ride.id);
      if (newOffers.length) {
        setNotice(newOffers.length === 1 ? "New nearby ride request." : `${newOffers.length} new nearby ride requests.`);
        if ("vibrate" in navigator) navigator.vibrate?.([150, 80, 150]);
      }
      setAvailableRides(offers);
    } else {
      setAvailableRides([]);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        await loadState();
        if (mounted) setError("");
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : "Couldn't load driver dispatch.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [loadState]);

  useEffect(() => {
    if (!activeRide) {
      setRoute(null);
      return;
    }
    const pickup = pointPlace(activeRide.pickup_lat, activeRide.pickup_lng, activeRide.pickup_address);
    const destination = pointPlace(activeRide.dropoff_lat, activeRide.dropoff_lng, activeRide.dropoff_address);
    const controller = new AbortController();
    setRoute(null);
    void getRouteEstimate(pickup, destination, controller.signal)
      .then(setRoute)
      .catch(cause => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Could not load this trip's route.");
        }
      });
    return () => controller.abort();
  }, [activeRide?.id, activeRide?.pickup_lat, activeRide?.pickup_lng, activeRide?.dropoff_lat, activeRide?.dropoff_lng, activeRide?.pickup_address, activeRide?.dropoff_address]);

  useEffect(() => {
    if (!profile?.is_approved || (!profile.is_online && !activeRide)) return;
    if (!navigator.geolocation) {
      setError("Location services are not available on this device.");
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      position => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setDriverLocation(point);
        if (Date.now() - lastLocationSentAt.current < 5000) return;
        lastLocationSentAt.current = Date.now();
        void supabase.rpc("update_driver_location", {
          p_lat: point.lat,
          p_lng: point.lng,
          p_heading: position.coords.heading,
        }).then(({ error: locationError }) => {
          if (locationError) setError(locationError.message);
        });
      },
      cause => {
        setError(cause.code === cause.PERMISSION_DENIED
          ? "Location permission is required to go online and share your trip position."
          : "Your position could not be updated. Check device location services.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
    );
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [profile?.is_approved, profile?.is_online, Boolean(activeRide)]);

  useEffect(() => {
    const ridesToSign = [...availableRides, ...(activeRide ? [activeRide] : [])];
    const missing = ridesToSign.filter(ride => {
      const path = ride.rider?.avatar_path;
      if (!path) {
        delete signedAvatarPaths.current[ride.id];
        setRiderAvatarUrls(current => {
          if (!(ride.id in current)) return current;
          const next = { ...current };
          delete next[ride.id];
          return next;
        });
        return false;
      }
      return signedAvatarPaths.current[ride.id] !== path;
    });
    if (!missing.length) return;

    let current = true;
    void Promise.all(missing.map(async ride => {
      const path = ride.rider?.avatar_path;
      if (!path) return null;
      const { data, error: avatarError } = await supabase.storage
        .from("account-avatars")
        .createSignedUrl(path, 3600);
      if (avatarError) throw avatarError;
      return { rideId: ride.id, path, url: data.signedUrl };
    })).then(results => {
      if (!current) return;
      setRiderAvatarUrls(urls => {
        const next = { ...urls };
        for (const result of results) {
          if (!result) continue;
          signedAvatarPaths.current[result.rideId] = result.path;
          next[result.rideId] = result.url;
        }
        return next;
      });
    }).catch(cause => {
      if (current) setError(cause instanceof Error ? `Unable to load rider profile picture. ${cause.message}` : "Unable to load rider profile picture.");
    });
    return () => { current = false; };
  }, [availableRides, activeRide?.id, activeRide?.rider?.avatar_path]);

  const perform = async (operation: () => Promise<void>, successMessage = "") => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await operation();
      if (successMessage) setNotice(successMessage);
      await loadState();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request could not be completed.");
    } finally {
      setSaving(false);
    }
  };

  const submitApplication = () => perform(async () => {
    const { data, error: rpcError } = await supabase.rpc("register_driver", {
      p_vehicle_type: application.vehicle_type,
      p_vehicle_make: application.vehicle_make,
      p_vehicle_model: application.vehicle_model,
      p_vehicle_color: application.vehicle_color,
      p_plate_number: application.plate_number,
    });
    if (rpcError) throw rpcError;
    setProfile(asDriverProfile(data));
  }, "Application submitted. Kkary must approve the driver account before rides can be accepted.");

  const setAvailability = async (isOnline: boolean) => {
    if (isOnline && !navigator.geolocation) {
      setError("Location services are not available on this device.");
      return;
    }
    if (isOnline) {
      setSaving(true);
      setError("");
      setNotice("");
      navigator.geolocation.getCurrentPosition(
        position => {
          const point = { lat: position.coords.latitude, lng: position.coords.longitude };
          void perform(async () => {
            const { error: availabilityError } = await supabase.rpc("set_driver_availability", {
              p_is_online: true,
              p_lat: point.lat,
              p_lng: point.lng,
            });
            if (availabilityError) throw availabilityError;
            setDriverLocation(point);
          }, "You're online and can receive matching rides.");
        },
        cause => {
          setSaving(false);
          setError(cause.code === cause.PERMISSION_DENIED
            ? "Allow location access to go online."
            : "Your current location could not be determined.");
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
      );
      return;
    }
    await perform(async () => {
      const { error: rpcError } = await supabase.rpc("set_driver_availability", { p_is_online: false });
      if (rpcError) throw rpcError;
    }, "You're offline and won't receive new rides.");
  };

  const acceptRide = (rideId: string) => perform(async () => {
    const { error: rpcError } = await supabase.rpc("accept_ride", { p_ride_id: rideId });
    if (rpcError) throw rpcError;
  }, "Ride accepted. Contact the rider through Kkary and proceed to the pickup.");

  const declineRide = (rideId: string) => perform(async () => {
    const { error: rpcError } = await supabase.rpc("decline_ride", { p_ride_id: rideId });
    if (rpcError) throw rpcError;
  }, "Ride declined. It won't appear in your offers again.");

  const updateRide = (status: RideStatus) => {
    if (!activeRide) return;
    void perform(async () => {
      const { error: rpcError } = await supabase.rpc("update_ride_status", {
        p_ride_id: activeRide.id,
        p_status: status,
      });
      if (rpcError) throw rpcError;
    }, status === "trip_completed" ? "Trip completed." : "Ride status updated.");
  };

  if (view === "earnings") {
    const completedRides = history.filter(ride => ride.status === "trip_completed");
    const total = completedRides.reduce((sum, ride) => sum + Number(ride.estimated_fare), 0);
    return (
      <div className="space-y-4 p-4">
        <h2 className="text-2xl font-bold">Ride history</h2>
        <div className="rounded-xl bg-gray-800 p-4">
          <div className="text-sm text-gray-400">Completed trip estimates</div>
          <div className="mt-1 text-2xl font-black">{formatNaira(total)}</div>
          <div className="mt-1 text-xs text-gray-400">{completedRides.length} completed trips · estimates only</div>
        </div>
        {history.map(ride => (
          <div key={ride.id} className="rounded-xl bg-gray-800 p-4">
            <div className="flex justify-between gap-2 text-sm">
              <span className="font-bold capitalize">{ride.status.replaceAll("_", " ")}</span>
              <span className="font-bold text-green-400">{formatNaira(Number(ride.estimated_fare))}</span>
            </div>
            <div className="mt-2 text-xs text-gray-300">{ride.pickup_address} → {ride.dropoff_address}</div>
            <div className="mt-2 text-[11px] text-gray-500">{new Date(ride.created_at).toLocaleString("en-NG")}</div>
          </div>
        ))}
        {!history.length && !loading && <p className="text-sm text-gray-400">No ride history yet.</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
      </div>
    );
  }

  const pickup = activeRide ? pointPlace(activeRide.pickup_lat, activeRide.pickup_lng, activeRide.pickup_address) : null;
  const destination = activeRide ? pointPlace(activeRide.dropoff_lat, activeRide.dropoff_lng, activeRide.dropoff_address) : null;
  const driver = driverLocation ? { ...driverLocation, name: "Your location" } : null;
  const next = activeRide ? nextStatus[activeRide.status] : undefined;

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-blue-800 p-5 text-white">
        <h2 className="text-xl font-bold">{profile?.is_online ? "You're online" : "Driver dispatch"}</h2>
        <p className="mt-1 text-sm text-blue-100">
          {!profile ? "Complete your vehicle application to get started."
            : !profile.is_approved ? "Your vehicle application is waiting for Kkary approval."
              : profile.is_online ? "Ride requests for your vehicle will appear here."
                : "Go online when you're ready to accept rides."}
        </p>
      </div>

      {profile && (
        <div className="rounded-xl bg-gray-800 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-bold">{profile.vehicle_color} {profile.vehicle_make} {profile.vehicle_model}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-gray-400">{profile.vehicle_type} · {profile.plate_number}</div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${profile.is_approved ? "bg-green-900 text-green-200" : "bg-amber-900 text-amber-200"}`}>
              {profile.is_approved ? "Approved" : "Pending review"}
            </span>
          </div>
          {profile.is_approved && (
            <button
              type="button"
              onClick={() => void setAvailability(!profile.is_online)}
              disabled={saving || Boolean(activeRide?.status === "trip_started" && profile.is_online)}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold disabled:opacity-50 ${profile.is_online ? "bg-red-600" : "bg-green-600"}`}
            >
              {profile.is_online ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
              {saving ? "Updating…" : profile.is_online ? "Go offline" : "Go online"}
            </button>
          )}
          {profile.is_online && (
            <div className="mt-3 flex items-center gap-2 text-xs text-green-300">
              <LocateFixed className="h-4 w-4" /> Sharing live location while available
            </div>
          )}
        </div>
      )}

      {!profile && (
        <form
          className="space-y-3 rounded-xl bg-gray-800 p-4"
          onSubmit={event => { event.preventDefault(); void submitApplication(); }}
        >
          <h3 className="font-bold">Vehicle application</h3>
          <select
            value={application.vehicle_type}
            onChange={event => setApplication({ ...application, vehicle_type: event.target.value as VehicleType })}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-white"
          >
            <option value="bike">Bike</option>
            <option value="car">Car</option>
          </select>
          {([
            ["vehicle_make", "Vehicle make"],
            ["vehicle_model", "Vehicle model"],
            ["vehicle_color", "Vehicle color"],
            ["plate_number", "Plate number"],
          ] as const).map(([field, label]) => (
            <input
              key={field}
              value={application[field]}
              onChange={event => setApplication({ ...application, [field]: event.target.value })}
              placeholder={label}
              required
              minLength={field === "vehicle_model" ? 1 : 2}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-white placeholder:text-gray-500"
            />
          ))}
          <button disabled={saving} className="w-full rounded-lg bg-blue-600 py-3 font-bold disabled:opacity-50">
            {saving ? "Submitting…" : "Submit for approval"}
          </button>
        </form>
      )}

      {activeRide && (
        <>
          <div className="rounded-xl bg-gray-800 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-bold">Current ride · {activeRide.status.replaceAll("_", " ")}</div>
                <div className="mt-1 text-xs text-gray-400">Ride #{activeRide.id.slice(0, 8)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase text-gray-400">Estimate</div>
                <div className="font-black">{formatNaira(Number(activeRide.estimated_fare))}</div>
              </div>
            </div>
            {activeRide.rider && (
              <div className="mb-3 flex items-center gap-3 rounded-xl bg-gray-900/70 p-3">
                {riderAvatarUrls[activeRide.id]
                  ? <img src={riderAvatarUrls[activeRide.id]} alt={`${activeRide.rider.name || "Rider"} profile`} className="h-12 w-12 rounded-full object-cover" />
                  : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-700 text-gray-300"><UserRound className="h-6 w-6" /></span>}
                <div>
                  <div className="text-sm font-bold">{activeRide.rider.name || "Kkary rider"}</div>
                  <div className="text-xs text-gray-400">Pickup location shared for this ride</div>
                </div>
              </div>
            )}
            <RideMap
              pickup={pickup}
              destination={destination}
              driver={driver}
              route={route?.path}
              center={driverLocation ?? pickup ?? defaultCenter}
              className="h-[280px]"
            />
            {route && <RouteDirections steps={route.steps} className="mt-3" />}
            <div className="mt-3 space-y-2 text-sm text-gray-200">
              <div><span className="text-green-400">Pickup:</span> {activeRide.pickup_address}</div>
              <div><span className="text-amber-300">Destination:</span> {activeRide.dropoff_address}</div>
            </div>
            {next && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateRide(next)}
                  disabled={saving}
                  className="rounded-xl bg-blue-600 py-3 font-bold disabled:opacity-50"
                >
                  {saving ? "Updating…" : actionLabel[activeRide.status]}
                </button>
                {activeRide.status !== "trip_started" && (
                  <button
                    type="button"
                    onClick={() => updateRide("cancelled_by_driver")}
                    disabled={saving}
                    className="rounded-xl border border-red-500/50 bg-red-950/40 py-3 font-bold text-red-200 disabled:opacity-50"
                  >
                    Cancel ride
                  </button>
                )}
              </div>
            )}
            {["trip_completed", "cancelled_by_rider", "cancelled_by_driver", "cancelled_no_driver"].includes(activeRide.status) && (
              <button
                type="button"
                onClick={() => {
                  dismissedRideId.current = activeRide.id;
                  setActiveRide(null);
                }}
                className="mt-4 w-full rounded-xl border border-gray-600 py-3 font-bold text-gray-200"
              >
                Dismiss completed ride
              </button>
            )}
          </div>
        </>
      )}

      {profile?.is_approved && profile.is_online && !activeRide && driverLocation && (
        <section className="space-y-2">
          <h3 className="font-bold">Your live location</h3>
          <RideMap
            driver={{ ...driverLocation, name: "You are here" }}
            center={driverLocation}
            className="h-[280px]"
          />
          <p className="text-xs text-gray-400">Your location is shared with Kkary while you’re online.</p>
        </section>
      )}

      {profile?.is_approved && profile.is_online && !activeRide && (
        <section className="space-y-3">
          <h3 className="font-bold">Nearby ride requests</h3>
          {availableRides.map(ride => (
            <article key={ride.id} className="rounded-xl bg-gray-800 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 font-bold">
                  {ride.vehicle_type === "bike" ? <Bike className="h-4 w-4 text-amber-300" /> : <Car className="h-4 w-4 text-amber-300" />}
                  {ride.vehicle_type === "bike" ? "Bike ride" : "Car ride"}
                </div>
                <div className="font-black text-green-300">{formatNaira(Number(ride.estimated_fare))}</div>
              </div>
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-gray-900/70 p-3">
                {riderAvatarUrls[ride.id]
                  ? <img src={riderAvatarUrls[ride.id]} alt={`${ride.rider?.name || "Rider"} profile`} className="h-12 w-12 rounded-full object-cover" />
                  : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-700 text-gray-300"><UserRound className="h-6 w-6" /></span>}
                <div>
                  <div className="text-sm font-bold">{ride.rider?.name || "Kkary rider"}</div>
                  <div className="text-xs text-gray-400">Pickup point on the map</div>
                </div>
              </div>
              <RideMap
                pickup={pointPlace(ride.pickup_lat, ride.pickup_lng, ride.pickup_address)}
                destination={pointPlace(ride.dropoff_lat, ride.dropoff_lng, ride.dropoff_address)}
                center={{ lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) }}
                className="mt-3 h-[180px]"
              />
              <div className="mt-3 space-y-2 text-xs text-gray-300">
                <div className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-green-400" />{ride.pickup_address}</div>
                <div className="flex gap-2"><Navigation className="h-4 w-4 shrink-0 text-amber-300" />{ride.dropoff_address}</div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-400">
                <span>{Number(ride.distance_km).toFixed(1)} km · {ride.eta_minutes} min</span>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => declineRide(ride.id)}
                    disabled={saving}
                    className="rounded-lg border border-gray-600 px-3 py-2 font-bold text-gray-200 disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => acceptRide(ride.id)}
                    disabled={saving}
                    className="rounded-lg bg-green-600 px-4 py-2 font-bold text-white disabled:opacity-50"
                  >
                    Accept ride
                  </button>
                </div>
              </div>
            </article>
          ))}
          {!availableRides.length && !loading && (
            <div className="rounded-xl bg-gray-800 p-5 text-center text-sm text-gray-400">
              <Clock3 className="mx-auto mb-2 h-5 w-5" /> No matching rides nearby yet.
            </div>
          )}
        </section>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-400">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading driver dispatch…
        </div>
      )}
      {notice && <div className="flex items-start gap-2 rounded-xl bg-green-900/60 p-3 text-sm text-green-200"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}
      {error && <div className="flex items-start gap-2 rounded-xl bg-red-900/50 p-3 text-sm text-red-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
    </div>
  );
}
