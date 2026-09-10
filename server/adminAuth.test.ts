import { describe, expect, it } from "vitest";
import { hashPassword, issueAdminToken, verifyAdminToken, verifyPassword } from "./adminAuth";

describe("Kkary admin credentials", () => {
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
