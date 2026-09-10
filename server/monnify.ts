import crypto from "node:crypto";
import { eq, or } from "drizzle-orm";
import { getDb, ensureWallet, getUserById } from "./db";
import { payments, walletAccounts, walletTransactions, wallets } from "../drizzle/schema";

const SANDBOX_URL = "https://sandbox.monnify.com";
const DEFAULT_CURRENCY = "NGN";
type MonnifyEnvelope<T> = { requestSuccessful?: boolean; responseMessage?: string; responseCode?: string; responseBody?: T };
type AuthResponse = { accessToken: string };
type InitializeResponse = { paymentReference: string; transactionReference: string; checkoutUrl: string; amount: number; paymentStatus: string };
type VerifyResponse = { paymentReference: string; transactionReference: string; amountPaid: number; paymentStatus: string; paymentMethod?: string };
type ReservedAccountResponse = { accountReference: string; accountNumber?: string; accountName?: string; bankName?: string; accounts?: Array<{ accountNumber: string; accountName: string; bankName: string }> };

function config() {
  const apiKey = process.env.MONNIFY_API_KEY;
  const secretKey = process.env.MONNIFY_SECRET_KEY;
  const contractCode = process.env.MONNIFY_CONTRACT_CODE;
  if (!apiKey || !secretKey || !contractCode) throw new Error("Monnify is not configured");
  return { apiKey, secretKey, contractCode, baseUrl: process.env.MONNIFY_BASE_URL || SANDBOX_URL };
}

async function monnifyFetch<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${config().baseUrl}${path}`, init);
  const payload = await response.json() as MonnifyEnvelope<T>;
  if (!response.ok || payload.requestSuccessful === false) throw new Error(payload.responseMessage || `Monnify request failed (${response.status})`);
  return (payload.responseBody ?? payload) as T;
}

let cachedToken: { token: string; expiresAt: number } | undefined;
export async function getMonnifyAccessToken() {
  const settings = config();
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  const basic = Buffer.from(`${settings.apiKey}:${settings.secretKey}`).toString("base64");
  const result = await monnifyFetch<AuthResponse>("/api/v1/auth/login", { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" } });
  cachedToken = { token: result.accessToken, expiresAt: Date.now() + 55 * 60 * 1000 };
  return result.accessToken;
}

export async function initializeWalletFunding({ userId, amountKobo, redirectUrl }: { userId: number; amountKobo: number; redirectUrl: string }) {
  if (!Number.isInteger(amountKobo) || amountKobo < 10000) throw new Error("Minimum wallet funding is ₦100");
  const settings = config();
  const paymentReference = `Kkary-WALLET-${userId}-${crypto.randomUUID()}`;
  const token = await getMonnifyAccessToken();
  const result = await monnifyFetch<InitializeResponse>("/api/v1/merchant/transactions/init-transaction", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: amountKobo / 100, customerName: `Kkary rider ${userId}`, customerEmail: `rider-${userId}@kkary.app`, paymentReference, paymentDescription: "Kkary wallet funding", currencyCode: DEFAULT_CURRENCY, contractCode: settings.contractCode, redirectUrl, paymentMethods: ["CARD", "ACCOUNT_TRANSFER", "USSD"] }) });
  if (result.paymentReference !== paymentReference || Number(result.amount) !== amountKobo / 100) throw new Error("Monnify returned mismatched transaction details");
  return { ...result, paymentReference, amountKobo };
}

export async function createReservedAccount({ userId, bvn, nin }: { userId: number; bvn?: string; nin?: string }) {
  if (!bvn && !nin) throw new Error("Monnify requires a BVN or NIN before creating a reserved account");
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const wallet = await ensureWallet(userId);
  const user = await getUserById(userId);
  if (!wallet || !user) throw new Error("Wallet profile is not available");
  const existing = await db.select().from(walletAccounts).where(eq(walletAccounts.walletId, wallet.id)).limit(1);
  if (existing[0]) return existing[0];
  const settings = config();
  const accountReference = `Kkary-${userId}-${crypto.randomUUID()}`;
  const token = await getMonnifyAccessToken();
  const response = await monnifyFetch<ReservedAccountResponse>("/api/v2/bank-transfer/reserved-accounts", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ accountReference, accountName: user.name || `Kkary rider ${userId}`, currencyCode: DEFAULT_CURRENCY, contractCode: settings.contractCode, customerEmail: user.email || `rider-${userId}@kkary.app`, customerName: user.name || `Kkary rider ${userId}`, customerBvn: bvn, customerNin: nin, getAllAvailableBanks: true }) });
  const account = response.accounts?.[0] ?? response;
  if (!account.accountNumber || !account.accountName || !account.bankName) throw new Error("Monnify returned incomplete reserved account details");
  const inserted = await db.insert(walletAccounts).values({ walletId: wallet.id, customerReference: accountReference, accountNumber: account.accountNumber, accountName: account.accountName, bankName: account.bankName, status: "active" });
  return { id: Number(inserted[0].insertId), walletId: wallet.id, provider: "monnify", customerReference: accountReference, accountNumber: account.accountNumber, accountName: account.accountName, bankName: account.bankName, status: "active" as const };
}

export async function verifyMonnifyPayment(paymentReference: string) {
  const token = await getMonnifyAccessToken();
  return monnifyFetch<VerifyResponse>(`/api/v2/merchant/transactions/query?paymentReference=${encodeURIComponent(paymentReference)}`, { method: "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
}

export function validateMonnifySignature(rawBody: string, signature: string | undefined) {
  const secretKey = process.env.MONNIFY_SECRET_KEY;
  if (!secretKey) return false;
  if (!signature) return (process.env.MONNIFY_BASE_URL || SANDBOX_URL) === SANDBOX_URL;
  const expected = crypto.createHash("sha512").update(`${secretKey}${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function processMonnifyWebhook(rawBody: string, signature: string | undefined) {
  if (!validateMonnifySignature(rawBody, signature)) throw new Error("Invalid Monnify webhook signature");
  const payload = JSON.parse(rawBody) as { eventData?: Record<string, unknown> } & Record<string, unknown>;
  const data = payload.eventData ?? payload;
  const paymentReference = String(data.paymentReference || "");
  const transactionReference = String(data.transactionReference || data.paymentId || paymentReference);
  const accountNumber = String(data.accountNumber || data.destinationAccountNumber || data.settlementAccountNumber || "");
  const customerReference = String(data.accountReference || data.reservedAccountReference || data.customerReference || "");
  const paymentStatus = String(data.paymentStatus || data.paymentStatusCode || "").toUpperCase();
  const amountPaid = Number(data.amountPaid || data.amount || 0);
  const normalizedStatus: "pending" | "successful" | "failed" | "reversed" = ["PAID", "SUCCESS", "SUCCESSFUL", "COMPLETED"].includes(paymentStatus) ? "successful" : ["REVERSED", "REFUNDED"].includes(paymentStatus) ? "reversed" : ["FAILED", "CANCELLED", "DECLINED"].includes(paymentStatus) ? "failed" : "pending";
  const isHostedWalletPayment = /^Kkary-WALLET-(\d+)-/.test(paymentReference);
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  let wallet: typeof walletAccounts.$inferSelect | undefined;
  let userId: number | undefined;
  if (isHostedWalletPayment) userId = Number(paymentReference.match(/^Kkary-WALLET-(\d+)-/)?.[1]);
  if (!userId && (accountNumber || customerReference)) {
    const account = await db.select().from(walletAccounts).where(or(customerReference ? eq(walletAccounts.customerReference, customerReference) : eq(walletAccounts.accountNumber, accountNumber), accountNumber ? eq(walletAccounts.accountNumber, accountNumber) : eq(walletAccounts.customerReference, customerReference))).limit(1);
    wallet = account[0];
  }
  if (!isHostedWalletPayment && !wallet) return { ignored: true, reason: "unsupported_reference" } as const;
  if (wallet) {
    const walletRow = await db.select({ userId: wallets.userId }).from(wallets).where(eq(wallets.id, wallet.walletId)).limit(1);
    userId = walletRow[0]?.userId;
  }
  const existing = await db.select().from(payments).where(eq(payments.providerReference, transactionReference)).limit(1);
  if (existing[0]?.status === "successful") return { duplicate: true, paymentId: existing[0].id } as const;
  if (normalizedStatus !== "successful") {
    if (existing[0]) await db.update(payments).set({ status: normalizedStatus, rawReference: rawBody }).where(eq(payments.id, existing[0].id));
    else if (userId) await db.insert(payments).values({ provider: "monnify", providerReference: transactionReference, amountKobo: Math.max(0, Math.round(amountPaid * 100)), status: normalizedStatus, idempotencyKey: paymentReference || `Kkary-STATUS-${transactionReference}`, rawReference: rawBody });
    return { updated: true, status: normalizedStatus, paymentId: existing[0]?.id } as const;
  }
  if (!Number.isFinite(amountPaid) || amountPaid <= 0 || !userId) return { ignored: true, reason: "not_paid" } as const;
  const riderWallet = await ensureWallet(userId);
  if (!riderWallet) throw new Error("Rider wallet is not available");
  const walletDuplicate = await db.select().from(walletTransactions).where(eq(walletTransactions.providerReference, transactionReference)).limit(1);
  if (walletDuplicate[0]) return { duplicate: true, walletTransactionId: walletDuplicate[0].id } as const;
  const amountKobo = Math.round(amountPaid * 100);
  const walletReference = `MONNIFY-CREDIT-${transactionReference}`;
  const ledger = await db.insert(walletTransactions).values({ walletId: riderWallet.id, type: "credit", amountKobo, currency: DEFAULT_CURRENCY, reference: walletReference, status: "completed", description: wallet ? "Monnify dedicated account funding" : "Monnify hosted wallet funding", metadata: rawBody, provider: "monnify", providerReference: transactionReference });
  const paymentId = existing[0] ? existing[0].id : Number((await db.insert(payments).values({ provider: "monnify", providerReference: transactionReference, amountKobo, status: "successful", idempotencyKey: paymentReference || `Kkary-RESERVED-${transactionReference}`, walletTransactionId: Number(ledger[0].insertId), rawReference: rawBody }))[0].insertId);
  if (existing[0]) await db.update(payments).set({ amountKobo, status: "successful", walletTransactionId: Number(ledger[0].insertId), rawReference: rawBody }).where(eq(payments.id, existing[0].id));
  return { processed: true, paymentId, amountKobo, fundingMethod: wallet ? "reserved_account" as const : "hosted_checkout" as const };
}
