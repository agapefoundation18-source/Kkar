export type DriverVehicleType = "bike" | "car" | "tricycle";
export type DriverDocumentType =
  | "drivers_license"
  | "nin"
  | "motorcycle_registration"
  | "motorcycle_insurance"
  | "tricycle_registration"
  | "tricycle_insurance"
  | "car_registration"
  | "car_insurance";

export const DRIVER_DOCUMENT_LABELS: Record<DriverDocumentType, string> = {
  drivers_license: "Driver licence",
  nin: "National Identification Number (NIN)",
  motorcycle_registration: "Motorcycle registration",
  motorcycle_insurance: "Motorcycle insurance",
  tricycle_registration: "Tricycle registration",
  tricycle_insurance: "Tricycle insurance",
  car_registration: "Car registration",
  car_insurance: "Car insurance",
};

export function requiredDriverDocuments(vehicleType: DriverVehicleType): DriverDocumentType[] {
  const vehicleDocuments: DriverDocumentType[] = vehicleType === "bike"
    ? ["motorcycle_registration", "motorcycle_insurance"]
    : vehicleType === "car"
      ? ["car_registration", "car_insurance"]
      : ["tricycle_registration", "tricycle_insurance"];
  return ["drivers_license", "nin", ...vehicleDocuments];
}

export function hasVerifiedDriverDocuments(
  vehicleType: DriverVehicleType,
  documents: Array<{ document_type: string; verification_status: string }>,
): boolean {
  return requiredDriverDocuments(vehicleType).every(type =>
    documents.some(document =>
      document.document_type === type && document.verification_status === "approved",
    ),
  );
}
