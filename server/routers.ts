import { COOKIE_NAME } from "@shared/const";
import crypto from "node:crypto";
import { parse } from "cookie";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getActivePricingRules, getDb, getDriverByUserId, getDriverDocuments, getDriverSummary, getLiveRide, getNotifications, getOperationsSnapshot, getRiderRides, getUserById, getUserByUsername, getWalletDetails, getWalletSummary } from "./db";
import { auditLogs, driverDocuments, driverEarnings, driverLocations, drivers, notifications, platformSettings, pricingRules, rideEvents, rides, users } from "../drizzle/schema";
import { createReservedAccount, initializeWalletFunding, processMonnifyWebhook, verifyMonnifyPayment } from "./monnify";
import { storagePut } from "./storage";
import { ADMIN_COOKIE, ADMIN_COOKIE_OPTIONS, hashPassword, issueAdminToken, verifyPassword } from "./adminAuth";
import { calculateDriverSplit } from "./fare";
import { allowedTransitions } from "./rideState";
import { detectLgaFromCoordinates, getLgas, isValidLga } from "./_core/lga";

const vehicleType = z.enum(["bike", "car"]);
const rideStatus = z.enum(["requested", "matching", "driver_assigned", "driver_en_route", "driver_arrived", "trip_started", "trip_completed", "payment_processing", "completed", "cancelled_by_rider", "cancelled_by_driver", "cancelled_no_driver", "payment_failed"]);
const lgas = ["Abak", "Eastern Obolo", "Eket", "Esit Eket", "Essien Udim", "Etim Ekpo", "Etinan", "Ibeno", "Ibesikpo Asutan", "Ibiono-Ibom", "Ika", "Ikono", "Ikot Abasi", "Ikot Ekpene", "Ini", "Itu", "Mbo", "Mkpat-Enin", "Nsit-Atai", "Nsit-Ibom", "Nsit-Ubium", "Obot Akara", "Okobo", "Onna", "Oron", "Oruk Anam", "Udung-Uko", "Ukanafun", "Uruan", "Urue-Offong/Oruko", "Uyo"] as const;

type Pricing = { baseFareKobo: number; perKmKobo: number; minimumFareKobo: number; commissionBps: number };
const draftPricing: Record<"bike" | "car", Pricing> = {
  bike: { baseFareKobo: 40000, perKmKobo: 18000, minimumFareKobo: 70000, commissionBps: 2000 },
  car: { baseFareKobo: 80000, perKmKobo: 30000, minimumFareKobo: 150000, commissionBps: 2000 },
};

async function resolvePricing(type: "bike" | "car"): Promise<Pricing> {
  const rules = await getActivePricingRules();
  const rule = rules.find(item => item.vehicleType === type);
  if (rule) return { baseFareKobo: rule.baseFareKobo, perKmKobo: rule.perKmKobo, minimumFareKobo: rule.minimumFareKobo, commissionBps: rule.commissionBps };
  const db = await getDb();
  if (db) {
    const setting = await db.select().from(platformSettings).where(eq(platformSettings.settingKey, "platform_commission_bps")).limit(1);
    if (setting[0]?.numericValue !== null && setting[0]?.numericValue !== undefined) return { ...draftPricing[type], commissionBps: setting[0].numericValue };
  }
  return draftPricing[type];
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const superAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Super-admin access required" });
  return next({ ctx });
});

async function transitionRide(rideId: number, toStatus: string, actorUserId: number, driverId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const conditions = driverId ? and(eq(rides.id, rideId), eq(rides.driverId, driverId)) : eq(rides.id, rideId);
  const found = await db.select().from(rides).where(conditions).limit(1);
  const ride = found[0];
  if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
  if (!allowedTransitions[ride.status]?.includes(toStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot move ride from ${ride.status} to ${toStatus}` });
  await db.update(rides).set({ status: toStatus as typeof ride.status, ...(toStatus === "completed" ? { completedAt: new Date() } : {}) }).where(eq(rides.id, rideId));
  await db.insert(rideEvents).values({ rideId, eventType: "ride_status_changed", fromStatus: ride.status, toStatus, actorUserId });
  const recipientIds = [ride.riderId, ride.driverId ? (await db.select({ userId: drivers.userId }).from(drivers).where(eq(drivers.id, ride.driverId)).limit(1))[0]?.userId : undefined].filter((id): id is number => Boolean(id));
  const labels: Record<string, [string, string]> = {
    driver_assigned: ["Driver assigned", "A Kkary driver has accepted your ride."],
    driver_en_route: ["Driver is on the way", "Your driver is heading to the pickup point."],
    driver_arrived: ["Driver has arrived", "Your driver is waiting at the pickup point."],
    trip_started: ["Trip started", "You are on your way."],
    trip_completed: ["Trip complete", "Your trip has ended. Thanks for riding with Kkary."],
    completed: ["Payment complete", "Your Kkary ride payment has been completed."],
    cancelled_by_driver: ["Ride cancelled", "Your driver cancelled this ride. You can request another one."],
    cancelled_no_driver: ["No driver found", "We could not find a nearby driver for this request."],
    payment_failed: ["Payment needs attention", "Your ride ended but payment needs another attempt."],
  };
  const [title, body] = labels[toStatus] ?? ["Ride updated", `Your ride status is now ${toStatus}.`];
  for (const userId of recipientIds) await db.insert(notifications).values({ userId, rideId, type: "ride_status", title, body, data: JSON.stringify({ status: toStatus }) });
  if (toStatus === "completed" && ride.driverId) {
    const existingEarning = await db.select().from(driverEarnings).where(eq(driverEarnings.rideId, ride.id)).limit(1);
    if (!existingEarning[0]) {
      const pricing = await resolvePricing(ride.vehicleType);
      const grossFareKobo = ride.finalFareKobo ?? ride.estimatedFareKobo;
      const split = calculateDriverSplit(grossFareKobo, pricing.commissionBps);
      await db.insert(driverEarnings).values({ driverId: ride.driverId, rideId: ride.id, ...split, status: "available" });
    }
  }
  return { ...ride, status: toStatus as typeof ride.status };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      if (parse(ctx.req.headers.cookie ?? "")[ADMIN_COOKIE]) ctx.res.clearCookie(ADMIN_COOKIE, { ...ADMIN_COOKIE_OPTIONS, maxAge: 0 });
      return { success: true } as const;
    }),
    updateCredentials: protectedProcedure.input(z.object({ username: z.string().min(3).max(64).optional(), name: z.string().min(2).max(120).optional(), email: z.string().email().optional(), newPassword: z.string().min(10).max(128).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      await db.update(users).set({ username: input.username, name: input.name, email: input.email, passwordHash: input.newPassword ? hashPassword(input.newPassword) : undefined, mustChangePassword: input.newPassword ? false : undefined }).where(eq(users.id, ctx.user.id));
      return { success: true } as const;
    }),
  }),

  admin: router({
    login: publicProcedure.input(z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      let admin = await getUserByUsername(input.username);
      if (!admin && input.username === "admin" && input.password === "admin12345") {
        const db = await getDb();
        if (!db) throw new Error("Database is not configured");
        await db.insert(users).values({ openId: "admin-credential", username: "admin", name: "Kkary Administrator", passwordHash: hashPassword("admin12345"), role: "super_admin", mustChangePassword: true, loginMethod: "credentials" });
        admin = await getUserByUsername("admin");
      }
      if (!admin || !admin.passwordHash || !["admin", "super_admin"].includes(admin.role) || !verifyPassword(input.password, admin.passwordHash)) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid administrator credentials" });
      const token = await issueAdminToken(admin.id);
      ctx.res.cookie(ADMIN_COOKIE, token, ADMIN_COOKIE_OPTIONS);
      return { success: true, mustChangePassword: admin.mustChangePassword, role: admin.role } as const;
    }),
    changePassword: protectedProcedure.input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(128) })).mutation(async ({ ctx, input }) => {
      if (!["admin", "super_admin"].includes(ctx.user.role) || !ctx.user.passwordHash || !verifyPassword(input.currentPassword, ctx.user.passwordHash)) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      await db.update(users).set({ passwordHash: hashPassword(input.newPassword), mustChangePassword: false }).where(eq(users.id, ctx.user.id));
      return { success: true } as const;
    }),
    createUser: superAdminProcedure.input(z.object({ username: z.string().min(3).max(64), name: z.string().min(2).max(120), email: z.string().email().optional(), role: z.enum(["admin", "super_admin"]), password: z.string().min(10).max(128) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const exists = await getUserByUsername(input.username);
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Username is already in use" });
      const created = await db.insert(users).values({ openId: `admin-${input.username}-${crypto.randomUUID()}`, username: input.username, name: input.name, email: input.email, passwordHash: hashPassword(input.password), role: input.role, mustChangePassword: true, loginMethod: "credentials" });
      await db.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "admin_created", entityType: "user", entityId: String(created[0].insertId), metadata: JSON.stringify({ role: input.role }) });
      return { success: true } as const;
    }),
  }),

  rider: router({
    estimateFare: publicProcedure.input(z.object({ vehicleType, distanceKm: z.number().min(0).max(500) })).query(async ({ input }) => {
      const pricing = await resolvePricing(input.vehicleType);
      const calculated = pricing.baseFareKobo + Math.round(input.distanceKm * pricing.perKmKobo);
      return { vehicleType: input.vehicleType, distanceKm: input.distanceKm, fareKobo: Math.max(pricing.minimumFareKobo, calculated), pricingSource: "configurable_rule" as const };
    }),
    overview: protectedProcedure.query(async ({ ctx }) => ({ rides: await getRiderRides(ctx.user.id), wallet: await getWalletSummary(ctx.user.id), notifications: await getNotifications(ctx.user.id) })),
    liveRide: protectedProcedure.query(({ ctx }) => getLiveRide(ctx.user.id)),
    requestRide: protectedProcedure.input(z.object({ vehicleType, pickupLabel: z.string().min(2).max(255), pickupLga: z.string().max(80).optional(), destinationLabel: z.string().min(2).max(255), distanceKm: z.number().min(0.1).max(500), etaMinutes: z.number().min(1).max(600), pickupLat: z.number().optional(), pickupLng: z.number().optional(), destinationLat: z.number().optional(), destinationLng: z.number().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const pricing = await resolvePricing(input.vehicleType);
      const fareKobo = Math.max(pricing.minimumFareKobo, pricing.baseFareKobo + Math.round(input.distanceKm * pricing.perKmKobo));
      const created = await db.insert(rides).values({ riderId: ctx.user.id, vehicleType: input.vehicleType, pickupLabel: input.pickupLabel, pickupLga: input.pickupLga, destinationLabel: input.destinationLabel, pickupLat: input.pickupLat, pickupLng: input.pickupLng, destinationLat: input.destinationLat, destinationLng: input.destinationLng, distanceMeters: Math.round(input.distanceKm * 1000), etaSeconds: Math.round(input.etaMinutes * 60), estimatedFareKobo: fareKobo, status: "matching" });
      const rideId = Number(created[0].insertId);
      await db.insert(rideEvents).values({ rideId, eventType: "ride_requested", fromStatus: "requested", toStatus: "matching", actorUserId: ctx.user.id });
      await db.insert(notifications).values({ userId: ctx.user.id, rideId, type: "ride_status", title: "Finding your driver", body: "We are matching your request with nearby drivers.", data: JSON.stringify({ status: "matching" }) });
      return { rideId, fareKobo, status: "matching" as const };
    }),
    cancelRide: protectedProcedure.input(z.object({ rideId: z.number().int().positive(), reason: z.string().max(255).optional() })).mutation(async ({ ctx, input }) => transitionRide(input.rideId, "cancelled_by_rider", ctx.user.id)),
  }),

  wallet: router({
    summary: protectedProcedure.query(({ ctx }) => getWalletSummary(ctx.user.id)),
    details: protectedProcedure.query(({ ctx }) => getWalletDetails(ctx.user.id)),
    fundingInstructions: protectedProcedure.query(async () => ({ provider: "Monnify", status: process.env.MONNIFY_API_KEY && process.env.MONNIFY_SECRET_KEY && process.env.MONNIFY_CONTRACT_CODE ? "connected" as const : "awaiting_credentials" as const, message: "Fund via your dedicated Monnify account or hosted checkout. Wallet credits are only posted from verified provider webhooks.", methods: ["Dedicated bank transfer", "Hosted checkout", "Card", "USSD"] })),
    initializeFunding: protectedProcedure.input(z.object({ amountKobo: z.number().int().min(10000).max(50000000), redirectUrl: z.string().url() })).mutation(({ ctx, input }) => initializeWalletFunding({ userId: ctx.user.id, amountKobo: input.amountKobo, redirectUrl: input.redirectUrl })),
    createVirtualAccount: protectedProcedure.input(z.object({ bvn: z.string().regex(/^\d{11}$/).optional(), nin: z.string().regex(/^\d{11}$/).optional() })).mutation(({ ctx, input }) => createReservedAccount({ userId: ctx.user.id, bvn: input.bvn, nin: input.nin })),
    verifyFunding: protectedProcedure.input(z.object({ paymentReference: z.string().min(10).max(128) })).query(({ input }) => verifyMonnifyPayment(input.paymentReference)),
  }),

  driver: router({
    dashboard: protectedProcedure.query(({ ctx }) => getDriverSummary(ctx.user.id)),
    onboarding: protectedProcedure.query(async ({ ctx }) => ({ driver: await getDriverByUserId(ctx.user.id), documents: await getDriverDocuments(ctx.user.id) })),
    submitApplication: protectedProcedure.input(z.object({ vehicleType, defaultLga: z.enum(lgas), vehicleMake: z.string().min(2).max(80), vehicleModel: z.string().min(1).max(80), vehicleColor: z.string().min(2).max(40), plateNumber: z.string().min(3).max(32) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const existing = await getDriverByUserId(ctx.user.id);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Driver application already exists" });
      const created = await db.insert(drivers).values({ userId: ctx.user.id, ...input, status: "pending" });
      return { driverId: Number(created[0].insertId), status: "pending" as const };
    }),
    uploadDocument: protectedProcedure.input(z.object({ documentType: z.enum(["drivers_license", "vehicle_registration", "insurance", "profile_photo"]), fileName: z.string().min(1).max(255), mimeType: z.string().min(3).max(128), base64: z.string().min(100).max(14000000) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const driver = await getDriverByUserId(ctx.user.id);
      if (!driver) throw new TRPCError({ code: "BAD_REQUEST", message: "Submit your driver application first" });
      const bytes = Buffer.from(input.base64.replace(/^data:[^;]+;base64,/, ""), "base64");
      if (bytes.length > 10 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Document must be 10MB or smaller" });
      const uploaded = await storagePut(`driver-documents/${driver.id}/${input.documentType}/${input.fileName}`, bytes, input.mimeType);
      const created = await db.insert(driverDocuments).values({ driverId: driver.id, documentType: input.documentType, originalFileName: input.fileName, mimeType: input.mimeType, storageKey: uploaded.key });
      return { documentId: Number(created[0].insertId), url: uploaded.url, status: "pending" as const };
    }),
    updateLocation: protectedProcedure.input(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyM: z.number().nonnegative().max(10000).optional(), speedKph: z.number().nonnegative().max(300).optional(), heading: z.number().min(0).max(360).optional(), rideId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const driver = await getDriverByUserId(ctx.user.id);
      if (!driver) throw new TRPCError({ code: "BAD_REQUEST", message: "Driver profile not found" });
      await db.update(drivers).set({ currentLat: input.lat, currentLng: input.lng, currentAccuracyM: input.accuracyM, currentHeading: input.heading, lastLocationAt: new Date() }).where(eq(drivers.id, driver.id));
      await db.insert(driverLocations).values({ driverId: driver.id, rideId: input.rideId, lat: input.lat, lng: input.lng, accuracyM: input.accuracyM, speedKph: input.speedKph, heading: input.heading });
      return { success: true, recordedAt: new Date() } as const;
    }),
    updateAvailability: protectedProcedure.input(z.object({ status: z.enum(["online", "offline"]) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const driver = await getDriverByUserId(ctx.user.id);
      if (!driver || driver.status !== "approved" && input.status === "online") throw new TRPCError({ code: "FORBIDDEN", message: "Driver approval is required before going online" });
      await db.update(drivers).set({ status: input.status }).where(eq(drivers.id, driver.id));
      return { success: true } as const;
    }),
    availableTrips: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const driver = await getDriverByUserId(ctx.user.id);
      if (!driver || driver.status !== "online") return [];
      const trips = await db.select().from(rides).where(and(eq(rides.vehicleType, driver.vehicleType), eq(rides.status, "matching"))).orderBy(desc(rides.createdAt)).limit(50);
      return trips.filter(trip => {
        if (trip.pickupLga && trip.pickupLga === driver.defaultLga) return true;
        if (trip.pickupLat === null || trip.pickupLng === null || driver.currentLat === null || driver.currentLng === null) return false;
        return distanceKm(Number(trip.pickupLat), Number(trip.pickupLng), Number(driver.currentLat), Number(driver.currentLng)) <= 15;
      }).slice(0, 20);
    }),
    acceptRide: protectedProcedure.input(z.object({ rideId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const driver = await getDriverByUserId(ctx.user.id);
      if (!driver || driver.status !== "online") throw new TRPCError({ code: "FORBIDDEN", message: "You must be approved and online to accept trips" });
      const updated = await db.update(rides).set({ driverId: driver.id, status: "driver_assigned" }).where(and(eq(rides.id, input.rideId), eq(rides.status, "matching")));
      if (!updated[0].affectedRows) throw new TRPCError({ code: "CONFLICT", message: "That trip has already been accepted" });
      await transitionRide(input.rideId, "driver_en_route", ctx.user.id, driver.id);
      return { success: true, rideId: input.rideId } as const;
    }),
    transitionTrip: protectedProcedure.input(z.object({ rideId: z.number().int().positive(), toStatus: rideStatus })).mutation(async ({ ctx, input }) => {
      const driver = await getDriverByUserId(ctx.user.id);
      if (!driver) throw new TRPCError({ code: "FORBIDDEN", message: "Driver profile not found" });
      return transitionRide(input.rideId, input.toStatus, ctx.user.id, driver.id);
    }),
  }),

  notifications: router({
    list: protectedProcedure.query(({ ctx }) => getNotifications(ctx.user.id)),
    markRead: protectedProcedure.input(z.object({ notificationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, input.notificationId), eq(notifications.userId, ctx.user.id)));
      return { success: true } as const;
    }),
  }),

  operations: router({
    snapshot: adminProcedure.query(async () => getOperationsSnapshot()),
    liveDrivers: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: drivers.id, defaultLga: drivers.defaultLga, status: drivers.status, currentLat: drivers.currentLat, currentLng: drivers.currentLng, lastLocationAt: drivers.lastLocationAt }).from(drivers).where(eq(drivers.status, "online"));
    }),
    pricing: adminProcedure.query(async () => getActivePricingRules()),
    allPricingRules: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(pricingRules).orderBy(pricingRules.serviceArea, pricingRules.vehicleType);
    }),
    commissionHistory: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const entries = await db.select().from(auditLogs).where(eq(auditLogs.action, "revenue_share_updated")).orderBy(desc(auditLogs.createdAt)).limit(24);
      return entries.map(entry => {
        let metadata: { commissionBps?: number } = {};
        try { metadata = JSON.parse(entry.metadata || "{}"); } catch { /* preserve the audit row even if metadata is malformed */ }
        return { id: entry.id, commissionBps: metadata.commissionBps ?? 0, createdAt: entry.createdAt };
      }).reverse();
    }),
    updateRevenueShare: adminProcedure.input(z.object({ commissionBps: z.number().int().min(0).max(10000) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      await db.insert(platformSettings).values({ settingKey: "platform_commission_bps", numericValue: input.commissionBps, updatedBy: ctx.user.id }).onDuplicateKeyUpdate({ set: { numericValue: input.commissionBps, updatedBy: ctx.user.id } });
      await db.update(pricingRules).set({ commissionBps: input.commissionBps }).where(eq(pricingRules.active, true));
      await db.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "revenue_share_updated", entityType: "platform_settings", entityId: "platform_commission_bps", metadata: JSON.stringify({ commissionBps: input.commissionBps }) });
      return { success: true, commissionBps: input.commissionBps } as const;
    }),
    updatePricing: adminProcedure.input(z.object({ vehicleType, baseFareKobo: z.number().int().nonnegative(), perKmKobo: z.number().int().nonnegative(), minimumFareKobo: z.number().int().nonnegative(), commissionBps: z.number().int().min(0).max(10000), serviceArea: z.string().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const serviceArea = input.serviceArea || "Akwa Ibom";
      if (!isValidLga(serviceArea)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid service area (LGA)" });
      await db.insert(pricingRules).values({ serviceArea, ...input, active: true });
      await db.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "pricing_rule_created", entityType: "pricing_rule", metadata: JSON.stringify({ ...input, serviceArea }) });
      return { success: true } as const;
    }),
    updatePricingRule: adminProcedure.input(z.object({ ruleId: z.number().int().positive(), baseFareKobo: z.number().int().nonnegative(), perKmKobo: z.number().int().nonnegative(), minimumFareKobo: z.number().int().nonnegative(), commissionBps: z.number().int().min(0).max(10000), active: z.boolean() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      await db.update(pricingRules).set({ baseFareKobo: input.baseFareKobo, perKmKobo: input.perKmKobo, minimumFareKobo: input.minimumFareKobo, commissionBps: input.commissionBps, active: input.active }).where(eq(pricingRules.id, input.ruleId));
      await db.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "pricing_rule_updated", entityType: "pricing_rule", entityId: String(input.ruleId), metadata: JSON.stringify(input) });
      return { success: true } as const;
    }),
    recentRides: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(rides).orderBy(desc(rides.createdAt)).limit(20);
    }),
    driverApplications: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(drivers).where(eq(drivers.status, "pending")).limit(20);
    }),
    driverDocuments: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const pending = await db.select().from(driverDocuments).where(eq(driverDocuments.verificationStatus, "pending")).orderBy(desc(driverDocuments.createdAt)).limit(50);
      return pending.map(document => ({ ...document, url: `/manus-storage/${document.storageKey}` }));
    }),
    reviewDriver: adminProcedure.input(z.object({ driverId: z.number().int().positive(), decision: z.enum(["approved", "rejected", "suspended"]) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      await db.update(drivers).set({ status: input.decision, approvedAt: input.decision === "approved" ? new Date() : undefined }).where(eq(drivers.id, input.driverId));
      await db.insert(auditLogs).values({ actorUserId: ctx.user.id, action: `driver_${input.decision}`, entityType: "driver", entityId: String(input.driverId) });
      return { success: true } as const;
    }),
    reviewDocument: adminProcedure.input(z.object({ documentId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), rejectionReason: z.string().max(500).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      await db.update(driverDocuments).set({ verificationStatus: input.decision, rejectionReason: input.rejectionReason, reviewedBy: ctx.user.id, reviewedAt: new Date() }).where(eq(driverDocuments.id, input.documentId));
      await db.insert(auditLogs).values({ actorUserId: ctx.user.id, action: `document_${input.decision}`, entityType: "driver_document", entityId: String(input.documentId), metadata: input.rejectionReason });
      return { success: true } as const;
    }),
    bulkReviewDocuments: adminProcedure.input(z.object({ documentIds: z.array(z.number().int().positive()).min(1).max(100), decision: z.enum(["approved", "rejected"]), rejectionReason: z.string().max(500).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      await db.update(driverDocuments).set({ verificationStatus: input.decision, rejectionReason: input.rejectionReason, reviewedBy: ctx.user.id, reviewedAt: new Date() }).where(inArray(driverDocuments.id, input.documentIds));
      await db.insert(auditLogs).values({ actorUserId: ctx.user.id, action: `documents_bulk_${input.decision}`, entityType: "driver_document", entityId: input.documentIds.join(","), metadata: JSON.stringify({ count: input.documentIds.length, rejectionReason: input.rejectionReason }) });
      return { success: true, count: input.documentIds.length } as const;
    }),
    sandboxPayment: adminProcedure.input(z.object({ accountNumber: z.string().max(32).optional(), customerReference: z.string().max(128).optional(), transactionReference: z.string().min(3).max(128), amountKobo: z.number().int().positive().max(50000000), status: z.enum(["SUCCESSFUL", "PENDING", "FAILED", "REVERSED"]) })).mutation(async ({ ctx, input }) => {
      if ((process.env.MONNIFY_BASE_URL || "https://sandbox.monnify.com") !== "https://sandbox.monnify.com") throw new TRPCError({ code: "FORBIDDEN", message: "Sandbox payment simulation is disabled outside the Monnify sandbox" });
      const rawBody = JSON.stringify({ eventType: "SUCCESSFUL_TRANSACTION", eventData: { transactionReference: input.transactionReference, accountNumber: input.accountNumber, accountReference: input.customerReference, paymentStatus: input.status, amount: input.amountKobo / 100 } });
      const result = await processMonnifyWebhook(rawBody, undefined);
      const db = await getDb();
      if (db) await db.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "monnify_sandbox_payment", entityType: "payment", entityId: input.transactionReference, metadata: JSON.stringify({ ...input, result }) });
      return result;
    }),
    admins: superAdminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: users.id, username: users.username, name: users.name, email: users.email, role: users.role, mustChangePassword: users.mustChangePassword, createdAt: users.createdAt }).from(users).where(sql`${users.role} IN ('admin','super_admin')`).orderBy(desc(users.createdAt));
    }),
  }),

  shared: router({
    rideStatuses: publicProcedure.query(() => rideStatus.options),
    lgas: publicProcedure.query(() => getLgas()),
    mapConfig: publicProcedure.query(() => ({ center: { lat: 5.0513, lng: 7.9335 }, zoom: 9, serviceArea: "Akwa Ibom" })),
    detectLga: publicProcedure.input(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).query(async ({ input }) => {
      const lga = await detectLgaFromCoordinates(input.lat, input.lng);
      return { lga, isValid: lga !== null };
    }),
    pricingByLga: publicProcedure.input(z.object({ lga: z.string(), vehicleType: z.enum(["bike", "car"]) })).query(async ({ input }) => {
      if (!isValidLga(input.lga)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid LGA" });
      const db = await getDb();
      if (!db) return null;
      const rule = await db.select().from(pricingRules).where(and(eq(pricingRules.serviceArea, input.lga), eq(pricingRules.vehicleType, input.vehicleType), eq(pricingRules.active, true))).limit(1);
      return rule[0] ?? null;
    }),
  }),
});

export type AppRouter = typeof appRouter;
