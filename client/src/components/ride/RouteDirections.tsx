import { ArrowUpRight, CornerDownLeft, CornerDownRight, Navigation, Route } from "lucide-react";
import type { RouteStep } from "./rideLocations";

function formatDistance(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
}

function directionIcon(instruction: string) {
  const normalized = instruction.toLowerCase();
  if (normalized.includes("left")) return CornerDownLeft;
  if (normalized.includes("right")) return CornerDownRight;
  if (normalized.includes("destination") || normalized.includes("arrive")) return Route;
  if (normalized.includes("continue") || normalized.includes("straight")) return Navigation;
  return ArrowUpRight;
}

export function RouteDirections({
  steps,
  className = "",
}: {
  steps: RouteStep[];
  className?: string;
}) {
  if (!steps.length) return null;
  return (
    <details className={`rounded-xl border border-[#dfeceb] bg-white ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-sm font-bold text-[#315b5a]">
        <Route className="h-4 w-4 text-[#16866d]" />
        Turn-by-turn directions
        <span className="ml-auto text-xs font-semibold text-[#7c9790]">{steps.length} steps</span>
      </summary>
      <ol className="space-y-1 border-t border-[#edf3f1] px-3 py-2">
        {steps.map((step, index) => {
          const Icon = directionIcon(step.instruction);
          return (
            <li key={`${index}-${step.instruction}`} className="flex gap-3 py-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#edf7f3] text-[#348272]">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold leading-relaxed text-[#315b5a]">{step.instruction}</div>
                <div className="mt-0.5 text-[10px] text-[#849b95]">
                  {formatDistance(step.distanceMeters)} · {Math.max(1, Math.ceil(step.durationSeconds / 60))} min
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
