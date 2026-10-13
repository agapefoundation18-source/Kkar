import { describe, expect, it } from "vitest";
import { adminProcedure, router } from "./trpc";
import type { TrpcContext } from "./context";

const adminTestRouter = router({
  role: adminProcedure.query(({ ctx }) => ctx.user.role),
});

function callerFor(role: NonNullable<TrpcContext["user"]>["role"]) {
  const user: NonNullable<TrpcContext["user"]> = {
    id: 1,
    openId: "test-user",
    username: "test-user",
    passwordHash: null,
    mustChangePassword: false,
    name: "Test User",
    email: null,
    loginMethod: "credentials",
    role,
    adminRole: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return adminTestRouter.createCaller({
    user,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  });
}

describe("adminProcedure", () => {
  it("allows customer-care admins that the Admin login accepts", async () => {
    await expect(callerFor("customer_care").role()).resolves.toBe("customer_care");
  });

  it("continues to reject regular users", async () => {
    await expect(callerFor("user").role()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
