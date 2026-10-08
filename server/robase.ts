import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { robaseSmsMessages, robaseWebhookEvents } from "../drizzle/schema";
import { getDb } from "./db";

const ROBASE_SMS_URL = "https://api.robase.dev/v1/sms/send";
const SUPPORTED_EVENTS = new Set(["sms.sent", "sms.delivered", "sms.failed", "sms.blocked"]);
const TERMINAL_STATUSES = new Set(["delivered", "failed", "rejected", "expired"]);

export type KkarSmsStatus = "queued" | "sending" | "sent" | "delivered" | "failed" | "rejected" | "expired" | "unknown";
type RobaseProviderStatus = "pending" | "sent" | "delivered" | "failed" | "blocked" | "unknown";

type RobaseEvent = {
  event: string;
  timestamp: string;
  data: {
    id: string;
    status: string;
    reason?: string;
  };
};

export class RobaseWebhookError extends Error {
  constructor(readonly kind: "configuration" | "signature" | "malformed" | "processing", message: string) {
    super(message);
    this.name = "RobaseWebhookError";
  }
}

function robaseApiKey() {
  const apiKey = process.env.ROBASE_API_KEY;
  if (!apiKey) throw new Error("Robase API is not configured");
  return apiKey;
}

function webhookSecret() {
  return process.env.ROBASE_WEBHOOK_SECRET;
}

function safeReason(reason: unknown) {
  if (typeof reason !== "string") return null;
  return /^[a-z0-9_.-]{1,64}$/i.test(reason) ? reason : "provider_error";
}

export function verifyRobaseSignature(rawBody: Buffer, signature: string | undefined, secret = webhookSecret()) {
  if (!secret || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function parseWebhook(rawBody: Buffer, headerEvent: string | undefined): RobaseEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new RobaseWebhookError("malformed", "Invalid JSON");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new RobaseWebhookError("malformed", "Invalid webhook envelope");
  }
  const record = payload as Record<string, unknown>;
  const event = record.event;
  const timestamp = record.timestamp;
  const data = record.data;
  if (typeof event !== "string" || !event || event.length > 64 || !headerEvent || headerEvent !== event) {
    throw new RobaseWebhookError("malformed", "Webhook event header does not match the payload");
  }
  if (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp)) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(timestamp)) {
    throw new RobaseWebhookError("malformed", "Invalid event timestamp");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new RobaseWebhookError("malformed", "Invalid event data");
  }
  const eventData = data as Record<string, unknown>;
  if (SUPPORTED_EVENTS.has(event)) {
    if (typeof eventData.id !== "string" || !eventData.id || eventData.id.length > 128 || typeof eventData.status !== "string") {
      throw new RobaseWebhookError("malformed", "Missing required SMS event fields");
    }
  }
  return {
    event,
    timestamp,
    data: {
      id: typeof eventData.id === "string" ? eventData.id : "",
      status: typeof eventData.status === "string" ? eventData.status : "",
      reason: typeof eventData.reason === "string" ? eventData.reason : undefined,
    },
  };
}

function mapProviderStatus(event: string, status: string): { status: KkarSmsStatus; providerStatus: RobaseProviderStatus } {
  if (event === "sms.sent") return { status: "sent", providerStatus: "sent" };
  if (event === "sms.delivered") return { status: "delivered", providerStatus: "delivered" };
  if (event === "sms.failed") return { status: "failed", providerStatus: "failed" };
  if (event === "sms.blocked") return { status: "rejected", providerStatus: "blocked" };

  switch (status.toLowerCase()) {
    case "pending": return { status: "queued", providerStatus: "pending" };
    case "sent": return { status: "sent", providerStatus: "sent" };
    case "delivered": return { status: "delivered", providerStatus: "delivered" };
    case "failed": return { status: "failed", providerStatus: "failed" };
    case "blocked": return { status: "rejected", providerStatus: "blocked" };
    default: return { status: "unknown", providerStatus: "unknown" };
  }
}

function makeEventId(event: RobaseEvent) {
  return crypto.createHash("sha256")
    .update(`${event.event}\n${event.timestamp}\n${event.data.id}\n${event.data.status}`)
    .digest("hex");
}

function isDuplicateKey(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string };
  return value.code === "23505";
}

export async function processRobaseWebhook(rawBody: Buffer, signature: string | undefined, headerEvent: string | undefined) {
  const secret = webhookSecret();
  if (!secret) throw new RobaseWebhookError("configuration", "Robase webhook secret is not configured");
  if (!verifyRobaseSignature(rawBody, signature, secret)) {
    throw new RobaseWebhookError("signature", "Invalid Robase webhook signature");
  }

  const event = parseWebhook(rawBody, headerEvent);
  console.info("[Robase] Webhook received", { eventType: event.event, providerMessageId: event.data.id || undefined });
  if (!SUPPORTED_EVENTS.has(event.event)) {
    console.info("[Robase] Ignored unsupported event", { eventType: event.event });
    return { ignored: true as const, eventType: event.event };
  }

  const providerEventAt = new Date(event.timestamp);
  const eventId = makeEventId(event);
  const db = await getDb();
  if (!db) throw new RobaseWebhookError("processing", "Database is not configured");

  try {
    const result = await db.transaction(async tx => {
      const priorEvents = await tx.select().from(robaseWebhookEvents).where(eq(robaseWebhookEvents.eventId, eventId)).limit(1);
      if (priorEvents[0]?.processed) return { duplicate: true as const };
      if (!priorEvents[0]) {
        await tx.insert(robaseWebhookEvents).values({
          eventId,
          providerMessageId: event.data.id,
          eventType: event.event,
          providerEventAt,
          processed: false,
        });
      }

      const messages = await tx.select().from(robaseSmsMessages)
        .where(and(eq(robaseSmsMessages.provider, "robase"), eq(robaseSmsMessages.providerMessageId, event.data.id)))
        .limit(1);
      const message = messages[0];
      if (!message) {
        console.warn("[Robase] Webhook references an unknown message", { eventType: event.event, providerMessageId: event.data.id });
        return { unknownMessage: true as const };
      }

      const incoming = mapProviderStatus(event.event, event.data.status);
      const stale = message.lastWebhookEventAt && providerEventAt < message.lastWebhookEventAt;
      const terminal = TERMINAL_STATUSES.has(message.status);
      const mayAdvance = incoming.status !== "unknown"
        && (!terminal || incoming.status === message.status)
        && (!stale);

      if (mayAdvance) {
        const updates: Partial<typeof robaseSmsMessages.$inferInsert> = {
          providerStatus: incoming.providerStatus,
          lastWebhookAt: new Date(),
          lastWebhookEventAt: providerEventAt,
        };
        if (!terminal || incoming.status === message.status) updates.status = incoming.status;
        if (event.event === "sms.sent") updates.sentAt = providerEventAt;
        if (event.event === "sms.delivered") updates.deliveredAt = providerEventAt;
        if (event.event === "sms.failed" || event.event === "sms.blocked") {
          updates.failedAt = providerEventAt;
          updates.deliveryErrorCode = safeReason(event.data.reason);
        }
        await tx.update(robaseSmsMessages).set(updates).where(eq(robaseSmsMessages.id, message.id));
      }

      await tx.update(robaseWebhookEvents).set({ processed: true, processedAt: new Date() })
        .where(eq(robaseWebhookEvents.eventId, eventId));
      return { processed: true as const, stale: Boolean(stale), providerMessageId: event.data.id };
    });
    if ("duplicate" in result && result.duplicate) {
      console.info("[Robase] Ignored duplicate webhook", { eventType: event.event, providerMessageId: event.data.id });
    } else {
      console.info("[Robase] Webhook processed", { eventType: event.event, providerMessageId: event.data.id, ...result });
    }
    return result;
  } catch (error) {
    if (isDuplicateKey(error)) {
      console.info("[Robase] Ignored duplicate webhook", { eventType: event.event, providerMessageId: event.data.id });
      return { duplicate: true as const };
    }
    const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : "processing_error";
    console.error("[Robase] Webhook processing failure", { eventType: event.event, providerMessageId: event.data.id, errorCode });
    throw new RobaseWebhookError("processing", "Failed to process Robase webhook");
  }
}

export async function sendRobaseSms({ userId, phoneNumber, message }: { userId?: number; phoneNumber: string; message: string }) {
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) throw new Error("Recipient phone number must be in E.164 format");
  if (!message.trim()) throw new Error("SMS message cannot be empty");
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const apiKey = robaseApiKey();
  const [inserted] = await db.insert(robaseSmsMessages).values({
    userId: userId ?? null,
    recipientPhone: phoneNumber,
    status: "sending",
    providerStatus: "pending",
  }).returning({ id: robaseSmsMessages.id });
  const messageRecordId = inserted.id;

  let response: Response;
  try {
    response = await fetch(ROBASE_SMS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: phoneNumber, message }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    await db.update(robaseSmsMessages).set({
      status: "unknown",
      providerStatus: "unknown",
      deliveryErrorCode: "request_uncertain",
    }).where(eq(robaseSmsMessages.id, messageRecordId));
    console.error("[Robase] SMS request failed", { messageRecordId });
    throw new Error("Robase SMS request failed", { cause: error });
  }

  if (!response.ok) {
    const statusIsAmbiguous = response.status >= 500;
    await db.update(robaseSmsMessages).set({
      status: statusIsAmbiguous ? "unknown" : "rejected",
      providerStatus: "unknown",
      deliveryErrorCode: `http_${response.status}`,
      ...(statusIsAmbiguous ? {} : { failedAt: new Date() }),
    }).where(eq(robaseSmsMessages.id, messageRecordId));
    console.error("[Robase] SMS provider rejected request", { messageRecordId, httpStatus: response.status });
    throw new Error(`Robase rejected the SMS request (${response.status})`);
  }

  let providerResponse: unknown;
  try {
    providerResponse = await response.json();
  } catch (error) {
    await db.update(robaseSmsMessages).set({
      status: "unknown",
      providerStatus: "unknown",
      deliveryErrorCode: "invalid_provider_response",
    }).where(eq(robaseSmsMessages.id, messageRecordId));
    throw new Error("Robase returned an invalid SMS response", { cause: error });
  }
  if (!providerResponse || typeof providerResponse !== "object") {
    await db.update(robaseSmsMessages).set({ status: "unknown", providerStatus: "unknown", deliveryErrorCode: "invalid_provider_response" })
      .where(eq(robaseSmsMessages.id, messageRecordId));
    throw new Error("Robase returned an invalid SMS response");
  }

  const result = providerResponse as Record<string, unknown>;
  if (typeof result.id !== "string" || !result.id || result.id.length > 128 || result.status !== "pending") {
    await db.update(robaseSmsMessages).set({ status: "unknown", providerStatus: "unknown", deliveryErrorCode: "invalid_provider_response" })
      .where(eq(robaseSmsMessages.id, messageRecordId));
    throw new Error("Robase returned an unexpected SMS response");
  }

  await db.update(robaseSmsMessages).set({
    providerMessageId: result.id,
    status: "queued",
    providerStatus: "pending",
    deliveryErrorCode: null,
  }).where(eq(robaseSmsMessages.id, messageRecordId));
  console.info("[Robase] SMS accepted", { messageRecordId, providerMessageId: result.id });
  return { id: messageRecordId, providerMessageId: result.id, status: "queued" as const };
}
