import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";

const secret = new TextEncoder().encode(ENV.cookieSecret || "kkary-development-secret");

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, encoded: string) {
  const [scheme, salt, stored] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !stored) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  const expected = Buffer.from(stored, "hex");
  const actual = Buffer.from(derived, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export async function issueAdminToken(userId: number) {
  return new SignJWT({ userId, kind: "kkary-admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
}

export async function verifyAdminToken(token: string) {
  try {
    const verified = await jwtVerify<{ userId: number; kind: string }>(token, secret);
    if (verified.payload.kind !== "kkary-admin") return undefined;
    return Number(verified.payload.userId);
  } catch {
    return undefined;
  }
}

export const ADMIN_COOKIE = "kkary_admin_session";
export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 12,
};
