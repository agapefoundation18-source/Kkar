import { beforeEach, describe, expect, it, vi } from "vitest";
import { payments, walletAccounts, walletTransactions, wallets } from "../drizzle/schema";

const { getDb, ensureWallet } = vi.hoisted(() => ({ getDb: vi.fn(), ensureWallet: vi.fn() }));
vi.mock("./db", () => ({ getDb, ensureWallet, getUserById: vi.fn() }));

import { processMonnifyWebhook } from "./monnify";

function createFakeDb(lookup: (table: unknown) => unknown[]) {
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => lookup(table)),
        })),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn(async () => [{ insertId: 88 }]) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  };
}

describe("Monnify wallet webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MONNIFY_SECRET_KEY = "test-secret";
    process.env.MONNIFY_BASE_URL = "https://sandbox.monnify.com";
    ensureWallet.mockResolvedValue({ id: 5 });
  });

  it("credits a hosted checkout once and returns duplicate on replay", async () => {
    let paymentLookupCount = 0;
    const fakeDb = createFakeDb(table => {
      if (table === payments) {
        paymentLookupCount += 1;
        return paymentLookupCount > 1 ? [{ id: 77, status: "successful" }] : [];
      }
      return [];
    });
    getDb.mockResolvedValue(fakeDb);
    const body = JSON.stringify({ eventType: "SUCCESSFUL_TRANSACTION", eventData: { paymentReference: "Kkary-WALLET-5-demo", transactionReference: "MON-123", paymentStatus: "PAID", amountPaid: 1500 } });

    await expect(processMonnifyWebhook(body, undefined)).resolves.toMatchObject({ processed: true, amountKobo: 150000, fundingMethod: "hosted_checkout" });
    await expect(processMonnifyWebhook(body, undefined)).resolves.toMatchObject({ duplicate: true, paymentId: 77 });
    expect(fakeDb.insert).toHaveBeenCalledTimes(2);
  });

  it("recognizes a dedicated-account transfer by its account number", async () => {
    const fakeDb = createFakeDb(table => {
      if (table === walletAccounts) return [{ walletId: 5, accountNumber: "1234567890" }];
      if (table === wallets) return [{ userId: 5 }];
      return [];
    });
    getDb.mockResolvedValue(fakeDb);
    const body = JSON.stringify({ eventType: "SUCCESSFUL_TRANSACTION", eventData: { transactionReference: "MON-RESERVED-1", accountNumber: "1234567890", paymentStatus: "SUCCESSFUL", amount: 900 } });
    await expect(processMonnifyWebhook(body, undefined)).resolves.toMatchObject({ processed: true, amountKobo: 90000, fundingMethod: "reserved_account" });
  });
});
