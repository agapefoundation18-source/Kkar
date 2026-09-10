import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateMonnifySignature } from "./monnify";

describe("Monnify webhook security", () => {
  it("accepts the documented SHA-512 signature and rejects tampering", () => {
    const previous = process.env.MONNIFY_SECRET_KEY;
    const previousBaseUrl = process.env.MONNIFY_BASE_URL;
    process.env.MONNIFY_SECRET_KEY = "test-secret";
    process.env.MONNIFY_BASE_URL = "https://api.monnify.com";
    const body = JSON.stringify({ eventType: "SUCCESSFUL_TRANSACTION", eventData: { paymentReference: "Kkary-WALLET-1-demo" } });
    const signature = crypto.createHash("sha512").update(`test-secret${body}`).digest("hex");

    expect(validateMonnifySignature(body, signature)).toBe(true);
    expect(validateMonnifySignature(`${body}tampered`, signature)).toBe(false);

    if (previous === undefined) delete process.env.MONNIFY_SECRET_KEY;
    else process.env.MONNIFY_SECRET_KEY = previous;
    if (previousBaseUrl === undefined) delete process.env.MONNIFY_BASE_URL;
    else process.env.MONNIFY_BASE_URL = previousBaseUrl;
  });
});
