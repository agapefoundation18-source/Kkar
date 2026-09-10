export const allowedTransitions: Record<string, string[]> = {
  requested: ["matching", "cancelled_by_rider"],
  matching: ["driver_assigned", "cancelled_by_rider", "cancelled_no_driver"],
  driver_assigned: ["driver_en_route", "cancelled_by_driver"],
  driver_en_route: ["driver_arrived", "cancelled_by_rider", "cancelled_by_driver"],
  driver_arrived: ["trip_started", "cancelled_by_rider", "cancelled_by_driver"],
  trip_started: ["trip_completed", "cancelled_by_driver"],
  trip_completed: ["payment_processing"],
  payment_processing: ["completed", "payment_failed"],
};

export function canTransition(fromStatus: string, toStatus: string) {
  return allowedTransitions[fromStatus]?.includes(toStatus) ?? false;
}
