import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../drizzle/schema";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

vi.mock("./sdk", () => ({
  sdk: { authenticateRequest: vi.fn() },
}));
vi.mock("../adminAuth", () => ({
  ADMIN_COOKIE: "kkary_admin_session",
  verifyAdminToken: vi.fn(),
}));
vi.mock("../db", () => ({
  getUserById: vi.fn(),
}));

import { sdk } from "./sdk";
import { getUserById } from "../db";
import { verifyAdminToken } from "../adminAuth";
import { createContext } from "./context";

const user = (role: User["role"], id: number): User => ({
  id,
  openId: `user-${id}`,
  username: `user${id}`,
  passwordHash: null,
  mustChangePassword: false,
  name: `User ${id}`,
  email: null,
  loginMethod: "credentials",
  role,
  adminRole: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
});

function contextOptions(cookie = "") {
  return {
    req: { headers: { cookie } },
    res: {},
    info: {},
  } as CreateExpressContextOptions;
}

describe("createContext administrator session precedence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses a valid Admin cookie instead of a simultaneous regular user session", async () => {
    vi.mocked(verifyAdminToken).mockResolvedValue(1);
    vi.mocked(getUserById).mockResolvedValue(user("super_admin", 1));
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(user("user", 2));

    const context = await createContext(contextOptions("kkary_admin_session=signed-token"));

    expect(context.user?.role).toBe("super_admin");
    expect(sdk.authenticateRequest).not.toHaveBeenCalled();
  });

  it("uses the regular user session when no valid Admin identity exists", async () => {
    vi.mocked(verifyAdminToken).mockResolvedValue(undefined);
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(user("user", 2));

    const context = await createContext(contextOptions("kkary_admin_session=expired-token"));

    expect(context.user?.role).toBe("user");
    expect(sdk.authenticateRequest).toHaveBeenCalledOnce();
  });
});
