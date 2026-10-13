import { describe, expect, it } from "vitest";
import { ADMIN_COOKIE_OPTIONS, hashPassword, issueAdminToken, verifyAdminToken, verifyPassword } from "./adminAuth";

describe("Kkary admin credentials", () => {
  it("keeps the admin cookie for the same 12-hour lifetime as its token", () => {
    expect(ADMIN_COOKIE_OPTIONS.maxAge).toBe(12 * 60 * 60 * 1000);
  });

  it("hashes and verifies passwords without accepting the wrong password", () => {
    const encoded = hashPassword("admin12345");
    expect(encoded).toMatch(/^scrypt\$/);
    expect(verifyPassword("admin12345", encoded)).toBe(true);
    expect(verifyPassword("not-the-password", encoded)).toBe(false);
  });

  it("issues a token that resolves to the administrator id", async () => {
    const token = await issueAdminToken(42);
    await expect(verifyAdminToken(token)).resolves.toBe(42);
    await expect(verifyAdminToken(`${token}tampered`)).resolves.toBeUndefined();
  });
});
