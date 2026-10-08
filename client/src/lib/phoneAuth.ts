export function normalizeE164PhoneNumber(value: string): string | null {
  const phone = value.trim().replace(/[\s()-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
