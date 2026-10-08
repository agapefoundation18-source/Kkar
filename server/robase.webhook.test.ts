import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getDb, robaseSmsMessages, robaseWebhookEvents } = vi.hoisted(() => ({
  getDb: vi.fn(),
  robaseSmsMessages: {
    id: "sms.id",
    provider: "sms.provider",
    providerMessageId: "sms.providerMessageId",
  },
  robaseWebhookEvents: {
    eventId: "event.eventId",
  },
}));
vi.mock("./db", () => ({ getDb }));
vi.mock("../drizzle/schema", () => ({ robaseSmsMessages, robaseWebhookEvents }));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: (field: unknown, value: unknown) => ({ field, value }),
}));

import { processRobaseWebhook, RobaseWebhookError, sendRobaseSms, verifyRobaseSignature } from "./robase";

const SECRET = "test-robase-webhook-secret";
let previousSecret: string | undefined;
let previousApiKey: string | undefined;

function signedEvent(event: string, timestamp: string, data: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify({ event, timestamp, data }));
  return {
    body,
    event,
    signature: crypto.createHmac("sha256", SECRET).update(body).digest("hex"),
  };
}

function fakeDatabase(initialStatus: "queued" | "sent" | "delivered" | "failed" = "queued", knownMessage = true) {
  const messages: Array<Record<string, unknown>> = knownMessage ? [{
    id: 12,
    provider: "robase",
    providerMessageId: "sms-123",
    status: initialStatus,
    providerStatus: "pending",
    lastWebhookEventAt: null,
  }] : [];
  const events: Array<Record<string, unknown>> = [];

  const matches = (row: Record<string, unknown>, condition: unknown) => {
    const conditions = Array.isArray(condition) ? condition : [condition];
    return conditions.every(item => {
      const comparison = item as { field: unknown; value: unknown };
      if (!comparison || !("field" in comparison)) return true;
      const name = Object.entries(robaseWebhookEvents).find(([, field]) => field === comparison.field)?.[0]
        ?? Object.entries(robaseSmsMessages).find(([, field]) => field === comparison.field)?.[0];
      return !name || row[name] === comparison.value;
    });
  };

  const database = {
    transaction: async <T>(callback: (tx: typeof database) => Promise<T>) => callback(database),
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => ({
          limit: async () => {
            const rows = table === robaseWebhookEvents ? events : messages;
            return rows.filter(row => matches(row, condition)).slice(0, 1);
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === robaseWebhookEvents) {
          if (events.some(event => event.eventId === values.eventId)) {
            throw Object.assign(new Error("Duplicate"), { code: "23505" });
          }
          events.push({ ...values });
          return Promise.resolve([]);
        }
        if (table === robaseSmsMessages) {
          messages.push({ ...values, id: 12 });
          return { returning: async () => [{ id: 12 }] };
        }
        return Promise.resolve([]);
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (condition: unknown) => {
          const rows = table === robaseWebhookEvents ? events : messages;
          const row = rows.find(item => matches(item, condition));
          if (row) Object.assign(row, values);
        },
      }),
    }),
  };

  return { database, messages, events };
}

describe("Robase webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previousSecret = process.env.ROBASE_WEBHOOK_SECRET;
    previousApiKey = process.env.ROBASE_API_KEY;
    process.env.ROBASE_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousSecret === undefined) delete process.env.ROBASE_WEBHOOK_SECRET;
    else process.env.ROBASE_WEBHOOK_SECRET = previousSecret;
    if (previousApiKey === undefined) delete process.env.ROBASE_API_KEY;
    else process.env.ROBASE_API_KEY = previousApiKey;
  });

  it("verifies and applies a valid delivery event", async () => {
    const db = fakeDatabase();
    getDb.mockResolvedValue(db.database);
    const webhook = signedEvent("sms.delivered", "2026-08-29T10:20:00Z", { id: "sms-123", status: "delivered" });

    await expect(processRobaseWebhook(webhook.body, webhook.signature, webhook.event)).resolves.toMatchObject({ processed: true });
    expect(db.messages[0]).toMatchObject({ status: "delivered", providerStatus: "delivered" });
    expect(db.messages[0].deliveredAt).toEqual(new Date("2026-08-29T10:20:00Z"));
  });

  it("rejects an invalid signature without accessing the database", async () => {
    const webhook = signedEvent("sms.delivered", "2026-08-29T10:20:00Z", { id: "sms-123", status: "delivered" });
    await expect(processRobaseWebhook(webhook.body, "0".repeat(64), webhook.event))
      .rejects.toMatchObject<Partial<RobaseWebhookError>>({ kind: "signature" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("verifies the exact raw bytes rather than a re-encoded JSON object", async () => {
    const body = Buffer.from('{ "event": "credit_balance.low", "timestamp": "2026-08-29T10:20:00Z", "data": {} }');
    const signature = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
    expect(verifyRobaseSignature(body, signature)).toBe(true);
    await expect(processRobaseWebhook(body, signature, "credit_balance.low")).resolves.toMatchObject({ ignored: true });
  });

  it("acknowledges duplicate webhooks without applying them twice", async () => {
    const db = fakeDatabase();
    getDb.mockResolvedValue(db.database);
    const webhook = signedEvent("sms.sent", "2026-08-29T10:20:00Z", { id: "sms-123", status: "sent" });

    await processRobaseWebhook(webhook.body, webhook.signature, webhook.event);
    await expect(processRobaseWebhook(webhook.body, webhook.signature, webhook.event)).resolves.toMatchObject({ duplicate: true });
    expect(db.events).toHaveLength(1);
    expect(db.messages[0].status).toBe("sent");
  });

  it("acknowledges an unknown message but leaves its event eligible for retry", async () => {
    const db = fakeDatabase("queued", false);
    getDb.mockResolvedValue(db.database);
    const webhook = signedEvent("sms.sent", "2026-08-29T10:20:00Z", { id: "unknown", status: "sent" });

    await expect(processRobaseWebhook(webhook.body, webhook.signature, webhook.event)).resolves.toMatchObject({ unknownMessage: true });
    expect(db.events[0].processed).toBe(false);
  });

  it("acknowledges valid but unsupported events", async () => {
    const webhook = signedEvent("credit_balance.low", "2026-08-29T10:20:00Z", { balance: 9 });
    await expect(processRobaseWebhook(webhook.body, webhook.signature, webhook.event)).resolves.toMatchObject({ ignored: true });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and mismatched event headers", async () => {
    const malformed = Buffer.from("{");
    const signature = crypto.createHmac("sha256", SECRET).update(malformed).digest("hex");
    await expect(processRobaseWebhook(malformed, signature, "sms.sent"))
      .rejects.toMatchObject<Partial<RobaseWebhookError>>({ kind: "malformed" });

    const webhook = signedEvent("sms.sent", "2026-08-29T10:20:00Z", { id: "sms-123", status: "sent" });
    await expect(processRobaseWebhook(webhook.body, webhook.signature, "sms.failed"))
      .rejects.toMatchObject<Partial<RobaseWebhookError>>({ kind: "malformed" });
  });

  it("maps delivery failures and blocked messages to normalized terminal states", async () => {
    const db = fakeDatabase();
    getDb.mockResolvedValue(db.database);
    const failed = signedEvent("sms.failed", "2026-08-29T10:20:00Z", { id: "sms-123", status: "failed", reason: "delivery_failed" });
    await processRobaseWebhook(failed.body, failed.signature, failed.event);
    expect(db.messages[0]).toMatchObject({ status: "failed", providerStatus: "failed", deliveryErrorCode: "delivery_failed" });

    const blocked = signedEvent("sms.blocked", "2026-08-29T10:21:00Z", { id: "sms-123", status: "blocked" });
    await processRobaseWebhook(blocked.body, blocked.signature, blocked.event);
    expect(db.messages[0].status).toBe("failed");
  });

  it("does not let an older sent event move a delivered message backwards", async () => {
    const db = fakeDatabase();
    getDb.mockResolvedValue(db.database);
    const delivered = signedEvent("sms.delivered", "2026-08-29T10:20:00Z", { id: "sms-123", status: "delivered" });
    await processRobaseWebhook(delivered.body, delivered.signature, delivered.event);
    const lateSent = signedEvent("sms.sent", "2026-08-29T10:19:00Z", { id: "sms-123", status: "sent" });
    await processRobaseWebhook(lateSent.body, lateSent.signature, lateSent.event);

    expect(db.messages[0].status).toBe("delivered");
  });

  it("rejects supported events missing required identifiers or status", async () => {
    const webhook = signedEvent("sms.sent", "2026-08-29T10:20:00Z", { id: "sms-123" });
    await expect(processRobaseWebhook(webhook.body, webhook.signature, webhook.event))
      .rejects.toMatchObject<Partial<RobaseWebhookError>>({ kind: "malformed" });
  });

  it("stores the Robase message ID and keeps accepted SMS queued, not delivered", async () => {
    const db = fakeDatabase("queued", false);
    getDb.mockResolvedValue(db.database);
    process.env.ROBASE_API_KEY = "test-api-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "robase-456", status: "pending" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendRobaseSms({ userId: 8, phoneNumber: "+2348012345678", message: "Your ride is arriving." }))
      .resolves.toMatchObject({ providerMessageId: "robase-456", status: "queued" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.robase.dev/v1/sms/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-api-key" }),
      }),
    );
    expect(db.messages[0]).toMatchObject({ providerMessageId: "robase-456", status: "queued", providerStatus: "pending" });
    expect(db.messages[0].status).not.toBe("delivered");
  });
});
