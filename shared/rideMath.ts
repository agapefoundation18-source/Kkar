export type Coordinate = { lat: number; lng: number };

const pricing = {
  bike: { baseFare: 400, perKm: 180, minimumFare: 700 },
  car: { baseFare: 800, perKm: 300, minimumFare: 1500 },
} as const;

export function calculateDirectDistanceKm(from: Coordinate, to: Coordinate) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(to.lat - from.lat);
  const longitudeDelta = radians(to.lng - from.lng);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.lat)) *
      Math.cos(radians(to.lat)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateEstimatedFare(vehicleType: keyof typeof pricing, distanceKm: number) {
  const rate = pricing[vehicleType];
  const billableDistance = Math.round((distanceKm + Number.EPSILON) * 100) / 100;
  return Math.max(rate.minimumFare, rate.baseFare + Math.round(billableDistance * rate.perKm));
}

export function formatNaira(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}
