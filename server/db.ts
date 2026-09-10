import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  driverDocuments,
  driverEarnings,
  driverLocations,
  drivers,
  notifications,
  pricingRules,
  rides,
  users,
  walletAccounts,
  walletTransactions,
  wallets,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "super_admin";
    updateSet.role = "super_admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0];
}

export async function getActivePricingRules() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pricingRules).where(eq(pricingRules.active, true));
}

export async function ensureWallet(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const existing = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(wallets).values({ userId, currency: "NGN" });
  const created = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return created[0];
}

export async function getWalletSummary(userId: number) {
  const db = await getDb();
  if (!db) return { balanceKobo: 0, transactions: [] };
  const wallet = await ensureWallet(userId);
  if (!wallet) return { balanceKobo: 0, transactions: [] };
  const [aggregate, transactions] = await Promise.all([
    db.select({ balanceKobo: sql<number>`COALESCE(SUM(CASE WHEN ${walletTransactions.type} IN ('credit', 'refund') AND ${walletTransactions.status} = 'completed' THEN ${walletTransactions.amountKobo} WHEN ${walletTransactions.type} IN ('debit', 'ride_payment') AND ${walletTransactions.status} = 'completed' THEN -${walletTransactions.amountKobo} ELSE 0 END), 0)` }).from(walletTransactions).where(eq(walletTransactions.walletId, wallet.id)),
    db.select().from(walletTransactions).where(eq(walletTransactions.walletId, wallet.id)).orderBy(desc(walletTransactions.createdAt)).limit(6),
  ]);
  return { balanceKobo: Number(aggregate[0]?.balanceKobo ?? 0), transactions };
}

export async function getWalletDetails(userId: number) {
  const db = await getDb();
  if (!db) return { balanceKobo: 0, account: undefined, transactions: [] };
  const wallet = await ensureWallet(userId);
  if (!wallet) return { balanceKobo: 0, account: undefined, transactions: [] };
  const [summary, account, transactions] = await Promise.all([
    getWalletSummary(userId),
    db.select().from(walletAccounts).where(eq(walletAccounts.walletId, wallet.id)).limit(1),
    db.select().from(walletTransactions).where(eq(walletTransactions.walletId, wallet.id)).orderBy(desc(walletTransactions.createdAt)).limit(100),
  ]);
  return { balanceKobo: summary.balanceKobo, account: account[0], transactions };
}

export async function getRiderRides(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(rides).where(eq(rides.riderId, userId)).orderBy(desc(rides.createdAt)).limit(8);
}

export async function getDriverSummary(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const driver = await db.select().from(drivers).where(eq(drivers.userId, userId)).limit(1);
  if (!driver[0]) return undefined;
  const earnings = await db.select({ totalKobo: sql<number>`COALESCE(SUM(${driverEarnings.driverEarningKobo}), 0)` }).from(driverEarnings).where(and(eq(driverEarnings.driverId, driver[0].id), eq(driverEarnings.status, "available")));
  return { driver: driver[0], availableEarningsKobo: Number(earnings[0]?.totalKobo ?? 0) };
}

export async function getDriverByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(drivers).where(eq(drivers.userId, userId)).limit(1);
  return result[0];
}

export async function getDriverDocuments(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const driver = await getDriverByUserId(userId);
  if (!driver) return [];
  return db.select().from(driverDocuments).where(eq(driverDocuments.driverId, driver.id)).orderBy(desc(driverDocuments.createdAt));
}

export async function getLiveRide(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const active = await db.select().from(rides).where(and(eq(rides.riderId, userId), sql`${rides.status} IN ('requested','matching','driver_assigned','driver_en_route','driver_arrived','trip_started')`)).orderBy(desc(rides.createdAt)).limit(1);
  const ride = active[0];
  if (!ride) return undefined;
  const location = ride.driverId ? await db.select().from(driverLocations).where(eq(driverLocations.driverId, ride.driverId)).orderBy(desc(driverLocations.createdAt)).limit(1) : [];
  return { ride, driverLocation: location[0] };
}

export async function getNotifications(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(30);
}

export async function getOperationsSnapshot() {
  const db = await getDb();
  if (!db) return null;
  const [riderCount, driverCount, activeDriverCount, activeRideCount, completedRideCount, cancelledRideCount, revenue] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "user")),
    db.select({ count: sql<number>`count(*)` }).from(drivers),
    db.select({ count: sql<number>`count(*)` }).from(drivers).where(eq(drivers.status, "online")),
    db.select({ count: sql<number>`count(*)` }).from(rides).where(sql`${rides.status} IN ('requested','matching','driver_assigned','driver_en_route','driver_arrived','trip_started')`),
    db.select({ count: sql<number>`count(*)` }).from(rides).where(eq(rides.status, "completed")),
    db.select({ count: sql<number>`count(*)` }).from(rides).where(sql`${rides.status} IN ('cancelled_by_rider','cancelled_by_driver','cancelled_no_driver')`),
    db.select({ totalKobo: sql<number>`COALESCE(SUM(${rides.finalFareKobo}), 0)` }).from(rides).where(eq(rides.status, "completed")),
  ]);
  return { riderCount: Number(riderCount[0]?.count ?? 0), driverCount: Number(driverCount[0]?.count ?? 0), activeDriverCount: Number(activeDriverCount[0]?.count ?? 0), activeRideCount: Number(activeRideCount[0]?.count ?? 0), completedRideCount: Number(completedRideCount[0]?.count ?? 0), cancelledRideCount: Number(cancelledRideCount[0]?.count ?? 0), revenueKobo: Number(revenue[0]?.totalKobo ?? 0) };
}
