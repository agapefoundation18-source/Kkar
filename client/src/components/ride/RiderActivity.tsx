import { AlertCircle, Bike, Car, Clock3, RefreshCw, Route } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatNaira } from "@shared/rideMath";
import { supabase } from "@/lib/supabase";

export type RideHistoryItem = {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  created_at: string;
  estimated_fare: number | string;
  vehicle_type: "bike" | "car";
  distance_km: number | string | null;
  driver: {
    name: string | null;
    vehicle_type: "bike" | "car";
    vehicle_make: string | null;
    vehicle_model: string | null;
    vehicle_color: string | null;
    plate_number: string | null;
  } | null;
};

export function RiderActivity({ onGetHelp }: { onGetHelp: (ride: RideHistoryItem) => void }) {
  const [rides, setRides] = useState<RideHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadHistory = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("get_my_ride_history");
    if (rpcError) throw rpcError;
    setRides(Array.isArray(data) ? data as RideHistoryItem[] : []);
  }, []);

  useEffect(() => {
    let mounted = true;
    void loadHistory()
      .catch(cause => {
        if (mounted) setError(cause instanceof Error ? cause.message : "Couldn't load ride history.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [loadHistory]);

  return (
    <div className="space-y-3 px-4 pb-4">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#6d9c93]">Your trips</div>
        <h2 className="mt-1 text-2xl font-black tracking-[-0.05em] text-[#153b3b]">Ride activity</h2>
      </div>
      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-6 text-sm text-[#78918d]">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading your rides…
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-[#f0d8d4] bg-[#fff7f5] p-4 text-sm text-[#a5473d]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {!loading && !error && rides.length === 0 && (
        <div className="rounded-2xl border border-[#e5efed] bg-white p-6 text-center">
          <Route className="mx-auto h-8 w-8 text-[#71a29c]" />
          <div className="mt-3 font-black text-[#173d3c]">No rides yet</div>
          <p className="mt-1 text-sm text-[#78918d]">Your completed and current rides will appear here.</p>
        </div>
      )}
      {rides.map(ride => {
        const date = new Date(ride.created_at);
        const formattedDate = Number.isNaN(date.getTime())
          ? "Date unavailable"
          : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date);
        const vehicle = ride.vehicle_type === "bike" ? "Bike" : "Car";
        return (
          <article key={ride.id} className="rounded-[24px] border border-[#e5efed] bg-white p-4 shadow-[0_12px_28px_rgba(16,53,58,0.04)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#6a9a92]">{ride.status.replaceAll("_", " ")}</div>
              <div className="text-sm font-black text-[#163c3d]">{formatNaira(Number(ride.estimated_fare))}</div>
            </div>
            <div className="space-y-2 text-sm text-[#264b4a]">
              <div><span className="mr-2 text-[#16866d]">●</span>{ride.pickup_address}</div>
              <div><span className="mr-2 text-[#f4b942]">●</span>{ride.dropoff_address}</div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[#6a8a86]">
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formattedDate}</span>
              <span>{ride.distance_km == null ? "Distance unavailable" : `${Number(ride.distance_km).toFixed(1)} km`}</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[#edf3f1] pt-3">
              <span className="inline-flex items-center gap-2 text-xs font-bold text-[#4b706b]">
                {ride.vehicle_type === "bike" ? <Bike className="h-4 w-4 text-[#c18c1d]" /> : <Car className="h-4 w-4 text-[#c18c1d]" />}
                {ride.driver?.name || `Kkary ${vehicle}`}
                {ride.driver?.plate_number ? ` · ${ride.driver.plate_number}` : ""}
              </span>
              <button
                type="button"
                onClick={() => onGetHelp(ride)}
                className="rounded-xl border border-[#dfeceb] px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-[#315b5a]"
              >
                Get help
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
