import { describe, expect, it } from "vitest";

describe("Monnify credentials", () => {
  it("authenticates against the sandbox API with server-side credentials", async () => {
    const apiKey = process.env.MONNIFY_API_KEY;
    const secretKey = process.env.MONNIFY_SECRET_KEY;
    const contractCode = process.env.MONNIFY_CONTRACT_CODE;

    expect(apiKey, "MONNIFY_API_KEY is required").toBeTruthy();
    expect(secretKey, "MONNIFY_SECRET_KEY is required").toBeTruthy();
    expect(contractCode, "MONNIFY_CONTRACT_CODE is required").toBeTruthy();

    const credentials = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");
    const response = await fetch("https://sandbox.monnify.com/api/v1/auth/login", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
    });
    const payload = await response.json() as { requestSuccessful?: boolean; responseMessage?: string };

    expect(response.ok, payload.responseMessage || "Monnify authentication failed").toBe(true);
    expect(payload.requestSuccessful).toBe(true);
  }, 30000);
});
