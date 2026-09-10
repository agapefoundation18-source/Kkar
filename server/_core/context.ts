import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { parse } from "cookie";
import { ADMIN_COOKIE, verifyAdminToken } from "../adminAuth";
import { getUserById } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (!user) {
    const token = parse(opts.req.headers.cookie ?? "")[ADMIN_COOKIE];
    if (token) {
      const userId = await verifyAdminToken(token);
      if (userId) user = (await getUserById(userId)) ?? null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
