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

  const token = parse(opts.req.headers.cookie ?? "")[ADMIN_COOKIE];
  if (token) {
    const userId = await verifyAdminToken(token);
    if (userId) {
      const adminUser = await getUserById(userId);
      if (adminUser && ["admin", "super_admin", "customer_care"].includes(adminUser.role)) {
        user = adminUser;
      }
    }
  }

  if (!user) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
