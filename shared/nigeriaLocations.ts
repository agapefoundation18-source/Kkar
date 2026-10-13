import locations from "./data/nigeria-states-lgas.json";

export const nigeriaStates = Object.keys(locations).sort((a, b) => a.localeCompare(b));

export function getNigerianLgas(state: string): string[] {
  return state in locations ? [...locations[state as keyof typeof locations]] : [];
}

export function isNigerianStateLga(state: string, lga: string): boolean {
  return getNigerianLgas(state).includes(lga);
}

export function serviceAreaKey(state: string, lga: string): string {
  return `${state} / ${lga}`;
}
