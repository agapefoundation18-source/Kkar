import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bike, Car, Clock, MapPin, Zap } from "lucide-react";
import { toast } from "sonner";

const money = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;

interface VehicleOption {
  type: "bike" | "car" | "tricycle";
  label: string;
  description: string;
  estimatedArrivalSeconds: number;
  estimatedFare: number;
  availableDrivers: number;
}

interface VehicleSelectionProps {
  pickupLat: number;
  pickupLng: number;
  destinationLat: number;
  destinationLng: number;
  currentLga?: string;
  onSelectVehicle: (vehicleType: "bike" | "car", estimatedFareKobo: number) => void;
  disabled?: boolean;
}

const getVehicleIcon = (type: "bike" | "car" | "tricycle") => {
  switch (type) {
    case "bike":
      return <Bike className="h-6 w-6" />;
    case "car":
      return <Car className="h-6 w-6" />;
    case "tricycle":
      return <Bike className="h-6 w-6 rotate-45" />;
  }
};

const getVehicleColor = (type: "bike" | "car" | "tricycle") => {
  switch (type) {
    case "bike":
      return "bg-[#e3f2fd] text-[#1976d2]";
    case "car":
      return "bg-[#f3e5f5] text-[#7b1fa2]";
    case "tricycle":
      return "bg-[#fff3e0] text-[#e65100]";
  }
};

export function VehicleSelection({
  pickupLat,
  pickupLng,
  destinationLat,
  destinationLng,
  currentLga,
  onSelectVehicle,
  disabled = false,
}: VehicleSelectionProps) {
  const [selectedType, setSelectedType] = useState<"bike" | "car" | null>(null);
  const [lga, setLga] = useState(currentLga || "Uyo");

  // Detect LGA from current location
  useEffect(() => {
    if (currentLga) {
      setLga(currentLga);
    } else {
      detectLga();
    }
  }, [pickupLat, pickupLng, currentLga]);

  const detectLga = async () => {
    try {
      const result = await trpc.shared.detectLga.query({
        lat: pickupLat,
        lng: pickupLng,
      });
      if (result.lga) {
        setLga(result.lga);
      }
    } catch (error) {
      console.error("Failed to detect LGA:", error);
      // Use default LGA
    }
  };

  // Fetch pricing for current LGA and vehicle type
  const bikePricing = trpc.shared.pricingByLga.useQuery(
    { lga, vehicleType: "bike" },
    { enabled: !!lga }
  );
  const carPricing = trpc.shared.pricingByLga.useQuery(
    { lga, vehicleType: "car" },
    { enabled: !!lga }
  );

  // Calculate estimated fare
  const distanceKm =
    Math.hypot(destinationLat - pickupLat, destinationLng - pickupLng) * 111.32;

  const calculateFare = (pricing: any) => {
    if (!pricing) return 0;
    const estimatedFareKobo =
      Math.max(
        pricing.baseFareKobo + Math.ceil(distanceKm * pricing.perKmKobo),
        pricing.minimumFareKobo
      ) || 0;
    return estimatedFareKobo;
  };

  const bikeEstimateFareKobo = calculateFare(bikePricing.data);
  const carEstimatedFareKobo = calculateFare(carPricing.data);

  // Estimate arrival time (rough calculation: avg 10km/h for distance, 2-5 min response time)
  const estimateArrivalSeconds = (distanceKm: number) => {
    const travelTimeMin = Math.ceil(distanceKm / 10) * 60;
    const responseTimeSeconds = Math.floor(Math.random() * (300 - 120)) + 120; // 2-5 min
    return travelTimeSeconds + responseTimeSeconds;
  };

  const vehicles: VehicleOption[] = [
    {
      type: "bike",
      label: "Bike",
      description: "Fast & affordable",
      estimatedArrivalSeconds: estimateArrivalSeconds(distanceKm),
      estimatedFare: bikeEstimateFareKobo,
      availableDrivers: Math.floor(Math.random() * 8) + 2,
    },
    {
      type: "car",
      label: "Car",
      description: "Comfortable & spacious",
      estimatedArrivalSeconds: estimateArrivalSeconds(distanceKm),
      estimatedFare: carEstimatedFareKobo,
      availableDrivers: Math.floor(Math.random() * 6) + 1,
    },
  ];

  const formatArrivalTime = (seconds: number) => {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} min`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg bg-[#e3f2fd] p-3">
        <MapPin className="h-4 w-4 text-[#1976d2]" />
        <span className="text-xs font-semibold text-[#1976d2]">
          Service area: {lga}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {vehicles.map((vehicle) => (
          <button
            key={vehicle.type}
            onClick={() => {
              setSelectedType(vehicle.type);
              onSelectVehicle(
                vehicle.type,
                vehicle.type === "bike"
                  ? bikeEstimateFareKobo
                  : carEstimatedFareKobo
              );
            }}
            disabled={disabled}
            className={`relative overflow-hidden rounded-2xl border-2 p-4 transition-all ${
              selectedType === vehicle.type
                ? "border-[#2e7d7c] bg-[#e8f5f3]"
                : "border-[#e0ece8] bg-white hover:border-[#d0e0dd]"
            } ${disabled ? "opacity-50" : ""}`}
          >
            {/* Background accent */}
            <div className="absolute right-0 top-0 h-20 w-20 -translate-y-1/2 translate-x-1/2 rounded-full bg-gradient-to-br from-[#f4b942]/20 to-transparent" />

            <div className="relative">
              {/* Icon and label */}
              <div className="flex items-start justify-between">
                <div>
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${getVehicleColor(vehicle.type)}`}>
                    {getVehicleIcon(vehicle.type)}
                  </div>
                  <div className="mt-2 text-left">
                    <h3 className="text-sm font-bold text-[#153b3b]">
                      {vehicle.label}
                    </h3>
                    <p className="text-[11px] text-[#7b9490]">
                      {vehicle.description}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="bg-[#e6f5ee] text-[#3a8c78]"
                >
                  {vehicle.availableDrivers} online
                </Badge>
              </div>

              {/* Pricing and arrival info */}
              <div className="mt-4 space-y-2 border-t border-[#e0ece8] pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-[#f4b942]" />
                    <span className="text-xs text-[#7b9490]">Estimated fare</span>
                  </div>
                  <span className="font-bold text-[#153b3b]">
                    {money(vehicle.estimatedFare)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-[#4ea88e]" />
                    <span className="text-xs text-[#7b9490]">Arrival</span>
                  </div>
                  <span className="font-bold text-[#153b3b]">
                    {formatArrivalTime(vehicle.estimatedArrivalSeconds)}
                  </span>
                </div>
              </div>
            </div>

            {/* Selection indicator */}
            {selectedType === vehicle.type && (
              <div className="absolute bottom-2 right-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4ea88e] text-white">
                  <span className="text-[10px] font-bold">✓</span>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="rounded-lg bg-[#f9fdfb] p-3 text-[11px] text-[#7b9490]">
        <p>
          💡 <strong>Tip:</strong> Prices may vary based on demand and distance.
          Final fare confirmed after ride completion.
        </p>
      </div>
    </div>
  );
}
