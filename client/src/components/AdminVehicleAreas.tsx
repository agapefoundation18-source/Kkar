import { useEffect, useMemo, useState } from "react";
import { Car, Check, LoaderCircle, Bike, Triangle } from "lucide-react";
import { toast } from "sonner";
import { getNigerianLgas, nigeriaStates } from "@shared/nigeriaLocations";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const vehicleChoices = [
  { type: "car" as const, label: "Car", Icon: Car },
  { type: "bike" as const, label: "Motorcycle", Icon: Bike },
  { type: "tricycle" as const, label: "Tricycle", Icon: Triangle },
];

export function AdminVehicleAreas() {
  const [state, setState] = useState("Akwa Ibom");
  const lgas = useMemo(() => getNigerianLgas(state), [state]);
  const [lga, setLga] = useState(lgas[0] ?? "");
  const utils = trpc.useUtils();
  const area = trpc.operations.serviceVehicleAreas.useQuery(
    { state, lga },
    { enabled: Boolean(state && lga) },
  );
  const save = trpc.operations.setServiceVehicleArea.useMutation({
    onSuccess: async result => {
      toast.success(`${result.vehicle_type === "bike" ? "Motorcycle" : result.vehicle_type === "car" ? "Car" : "Tricycle"} availability updated.`);
      await utils.operations.serviceVehicleAreas.invalidate({ state, lga });
      await utils.shared.serviceVehicles.invalidate({ state, lga });
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!lgas.includes(lga)) setLga(lgas[0] ?? "");
  }, [lgas, lga]);

  const enabledTypes = new Set((area.data ?? []).filter(item => item.enabled).map(item => item.vehicle_type));

  return (
    <Card className="rounded-[26px] border-[#e0ece8]">
      <CardHeader>
        <CardTitle className="text-base text-[#193d3c]">Vehicles operating by L.G.A.</CardTitle>
        <p className="text-xs leading-relaxed text-[#89a19d]">
          Only enabled vehicle types can be selected by new drivers or requested by riders in that L.G.A.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-[#67837d]">
            State
            <select value={state} onChange={event => setState(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[#dcebe5] bg-white px-3 text-sm font-normal text-[#355754]">
              {nigeriaStates.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-[#67837d]">
            L.G.A.
            <select value={lga} onChange={event => setLga(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[#dcebe5] bg-white px-3 text-sm font-normal text-[#355754]">
              {lgas.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        {area.error ? (
          <div role="alert" className="rounded-xl bg-[#fff2ef] p-3 text-sm text-[#a85d52]">
            Could not load vehicle availability: {area.error.message}
            <button type="button" onClick={() => void area.refetch()} className="ml-2 font-bold underline">Retry</button>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            {vehicleChoices.map(({ type, label, Icon }) => {
              const enabled = enabledTypes.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  disabled={area.isLoading || save.isPending}
                  aria-pressed={enabled}
                  onClick={() => save.mutate({ state, lga, vehicleType: type, enabled: !enabled })}
                  className={`flex min-h-14 items-center justify-between gap-2 rounded-xl border px-3 py-3 text-sm font-bold disabled:opacity-60 ${enabled ? "border-[#a8d4c5] bg-[#edf8f2] text-[#347a68]" : "border-[#e0ece8] bg-white text-[#718b86]"}`}
                >
                  <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span>
                  {save.isPending && save.variables?.vehicleType === type
                    ? <LoaderCircle className="h-4 w-4 animate-spin" />
                    : enabled ? <Check className="h-4 w-4" /> : <span className="text-[10px] uppercase">Off</span>}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
