import { COOKIE_NAME } from "@shared/const";
import crypto from "node:crypto";
import { parse } from "cookie";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getActivePricingRules, getDb, getDriverByUserId, getDriverDocuments, getDriverSummary, getLiveRide, getNotifications, getRiderRides, getUserById, getUserByUsername, getWalletDetails, getWalletSummary } from "./db";
import { auditLogs, driverDocuments, driverEarnings, driverLocations, drivers, notifications, platformSettings, pricingRules, rideEvents, rides, users, adminMessages } from "../drizzle/schema";
import { createReservedAccount, initializeWalletFunding, processMonnifyWebhook, verifyMonnifyPayment } from "./monnify";
import { storagePut } from "./storage";
import { ADMIN_COOKIE, ADMIN_COOKIE_OPTIONS, hashPassword, issueAdminToken, verifyPassword } from "./adminAuth";
import { calculateDriverSplit } from "./fare";
import { allowedTransitions } from "./rideState";
import { detectLgaFromCoordinates, getLgas, isValidLga } from "./_core/lga";
import { compareSemanticVersions, parseSemanticVersion } from "@shared/appRelease";
import { hasVerifiedDriverDocuments } from "@shared/driverDocuments";
import { isNigerianStateLga } from "@shared/nigeriaLocations";

const vehicleType = z.enum(["bike", "car"]);
const rideStatus = z.enum(["requested", "matching", "driver_assigned", "driver_en_route", "driver_arrived", "trip_started", "trip_completed", "payment_processing", "completed", "cancelled_by_rider", "cancelled_by_driver", "cancelled_no_driver", "payment_failed"]);
const lgas = ["Abak", "Eastern Obolo", "Eket", "Esit Eket", "Essien Udim", "Etim Ekpo", "Etinan", "Ibeno", "Ibesikpo Asutan", "Ibiono-Ibom", "Ika", "Ikono", "Ikot Abasi", "Ikot Ekpene", "Ini", "Itu", "Mbo", "Mkpat-Enin", "Nsit-Atai", "Nsit-Ibom", "Nsit-Ubium", "Obot Akara", "Okobo", "Onna", "Oron", "Oruk Anam", "Udung-Uko", "Ukanafun", "Uruan", "Urue-Offong/Oruko", "Uyo"] as const;

type Pricing = { baseFareKobo: number; perKmKobo: number; minimumFareKobo: number; commissionBps: number };
const draftPricing: Record<"bike" | "car", Pricing> = {
  bike: { baseFareKobo: 40000, perKmKobo: 18000, minimumFareKobo: 70000, commissionBps: 2000 },
  car: { baseFareKobo: 80000, perKmKobo: 30000, minimumFareKobo: 150000, commissionBps: 2000 },
};

const appReleaseSettingKey = "app_release";
const launchModeSettingKey = "launch_mode";
const launchWaitlistKeyPrefix = "launch_waitlist:";
const launchWaitlistDraftPrefix = "launch_waitlist_draft:";

type LaunchMode = {
  enabled: boolean;
  launchAt: string | null;
};

const defaultLaunchMode: LaunchMode = { enabled: false, launchAt: null };

async function getLaunchMode(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const [setting] = await db.select({ textValue: platformSettings.textValue })
    .from(platformSettings)
    .where(eq(platformSettings.settingKey, launchModeSettingKey))
    .limit(1);
  if (!setting?.textValue) return defaultLaunchMode;

  let value: unknown;
  try {
    value = JSON.parse(setting.textValue);
  } catch {
    throw new Error("The launch page setting is malformed.");
  }
  const result = z.object({
    enabled: z.boolean(),
    launchAt: z.string().datetime().nullable(),
  }).safeParse(value);
  if (!result.success) throw new Error("The launch page setting is invalid.");
  return result.data;
}

type SupabaseDriverApplication = {
  id: string;
  profile_id: string;
  vehicle_type: "bike" | "car" | "tricycle";
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  plate_number: string | null;
  created_at: string;
  profiles: { full_name: string; email: string | null } | null;
};

type SupabaseDriverDocument = {
  id: string;
  driver_id: string;
  document_type: string;
  original_file_name: string;
  mime_type: string;
  verification_status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  driver_profiles: {
    vehicle_type: "bike" | "car" | "tricycle";
    profiles: { full_name: string; email: string | null } | null;
  } | null;
};

async function supabaseAdminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceRoleKey) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Supabase driver review is not configured on the server.",
    });
  }

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
  });
  if (!response.ok) {
    console.error(`[Supabase driver review] Request failed with status ${response.status}`);
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: `Supabase driver review failed (${response.status}).`,
    });
  }
  return response.json() as Promise<T>;
}

async function createDriverDocumentReviewUrl(documentId: string) {
  const rows = await supabaseAdminRequest<Array<{ storage_key: string }>>(
    `driver_documents?select=storage_key&id=eq.${encodeURIComponent(documentId)}`,
  );
  const storageKey = rows[0]?.storage_key;
  if (!storageKey || storageKey.split("/").length < 4 || storageKey.includes("..")) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Driver document was not found." });
  }
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const safePath = storageKey.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${url}/storage/v1/object/sign/driver-documents/${safePath}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 300 }),
  });
  if (!response.ok) {
    console.error(`[Supabase driver document review] Signed URL request failed with status ${response.status}`);
    throw new TRPCError({ code: "BAD_GATEWAY", message: "Could not create a secure document review link." });
  }
  const result = await response.json() as { signedURL?: string };
  if (!result.signedURL) {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "Supabase did not return a document review link." });
  }
  return { url: result.signedURL.startsWith("http") ? result.signedURL : `${url}/storage/v1${result.signedURL}` };
}

type AppRelease = {
  version: string;
  buildId: string;
  notes: string;
  releaseId: string;
  publishedAt: string;
  promptForUpdate: boolean;
  updateType: "version" | "deployment";
};

async function getAppRelease(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const [setting] = await db.select({ textValue: platformSettings.textValue })
    .from(platformSettings)
    .where(eq(platformSettings.settingKey, appReleaseSettingKey))
    .limit(1);
  if (!setting?.textValue) return null;

  let value: unknown;
  try {
    value = JSON.parse(setting.textValue);
  } catch {
    throw new Error("The published app release setting is malformed.");
  }
  const releaseSchema = z.object({
    version: z.string(),
    buildId: z.string(),
    notes: z.string(),
    releaseId: z.string(),
    publishedAt: z.string(),
    promptForUpdate: z.boolean().default(true),
    updateType: z.enum(["version", "deployment"]).default("version"),
  });
  const result = releaseSchema.safeParse(value);
  if (!result.success) throw new Error("The published app release setting is invalid.");
  return result.data;
}

function currentBuildId() {
  return process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA;
}

function configuredVercelDeployHook() {
  const configured = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!configured) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Configure the Vercel deploy hook before publishing this deployment.",
    });
  }
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The Vercel deploy hook is invalid." });
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.vercel.com" ||
    !url.pathname.startsWith("/v1/integrations/deploy/") ||
    url.username ||
    url.password
  ) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The Vercel deploy hook is invalid." });
  }
  return url;
}

async function saveAppRelease(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  release: AppRelease,
  updatedBy: number,
) {
  await db.insert(platformSettings).values({
    settingKey: appReleaseSettingKey,
    textValue: JSON.stringify(release),
    updatedBy,
  }).onConflictDoUpdate({
    target: platformSettings.settingKey,
    set: {
      textValue: JSON.stringify(release),
      updatedBy,
      updatedAt: new Date(),
    },
  });
}

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
      if (!admin && input.username === "superadmin" && input.password === "supa12345") {
        const db = await getDb();
        if (!db) throw new Error("Database is not configured");
        await db.insert(users).values({ openId: "admin-credential", username: "superadmin", name: "Kkary Super Administrator", passwordHash: hashPassword("supa12345"), role: "super_admin", mustChangePassword: true, loginMethod: "credentials" });
        admin = await getUserByUsername("superadmin");
      }
      if (!admin || !admin.passwordHash || !["admin", "super_admin", "customer_care"].includes(admin.role) || !verifyPassword(input.password, admin.passwordHash)) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid administrator credentials" });
      const token = await issueAdminToken(admin.id);
      ctx.res.cookie(ADMIN_COOKIE, token, ADMIN_COOKIE_OPTIONS);
      return { success: true, mustChangePassword: admin.mustChangePassword, role: admin.role } as const;
    }),
    changePassword: protectedProcedure.input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(128) })).mutation(async ({ ctx, input }) => {
      if (!["admin", "super_admin", "customer_care"].includes(ctx.user.role) || !ctx.user.passwordHash || !verifyPassword(input.currentPassword, ctx.user.passwordHash)) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      await db.update(users).set({ passwordHash: hashPassword(input.newPassword), mustChangePassword: false }).where(eq(users.id, ctx.user.id));
      return { success: true } as const;
    }),
    completeInitialSetup: protectedProcedure.input(z.object({
      currentPassword: z.string().min(1).max(128),
      username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/, "Use letters, numbers, dots, underscores, or hyphens for the username."),
      newPassword: z.string().min(10).max(128),
    })).mutation(async ({ ctx, input }) => {
      if (!["admin", "super_admin", "customer_care"].includes(ctx.user.role) || !ctx.user.mustChangePassword || !ctx.user.passwordHash) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Initial administrator setup is not required for this account." });
      }
      if (!verifyPassword(input.currentPassword, ctx.user.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
      }
      const existing = await getUserByUsername(input.username);
      if (existing && existing.id !== ctx.user.id) {
        throw new TRPCError({ code: "CONFLICT", message: "That username is already in use." });
      }
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      await db.update(users).set({
        username: input.username,
        passwordHash: hashPassword(input.newPassword),
        mustChangePassword: false,
      }).where(eq(users.id, ctx.user.id));
      ctx.res.clearCookie(ADMIN_COOKIE, { ...ADMIN_COOKIE_OPTIONS, maxAge: 0 });
      return { success: true } as const;
    }),
    createUser: superAdminProcedure.input(z.object({ username: z.string().min(3).max(64), name: z.string().min(2).max(120), email: z.string().email().optional(), role: z.enum(["admin", "super_admin"]), password: z.string().min(10).max(128) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const exists = await getUserByUsername(input.username);
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Username is already in use" });
      const [created] = await db.insert(users).values({ openId: `admin-${input.username}-${crypto.randomUUID()}`, username: input.username, name: input.name, email: input.email, passwordHash: hashPassword(input.password), role: input.role, mustChangePassword: true, loginMethod: "credentials" }).returning({ id: users.id });
      await db.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "admin_created", entityType: "user", entityId: String(created.id), metadata: JSON.stringify({ role: input.role }) });
      return { success: true } as const;
    }),
    listAdmins: superAdminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const admins = await db.select({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        role: users.role,
        adminRole: users.adminRole,
        createdAt: users.createdAt,
      }).from(users).where(inArray(users.role, ["admin", "super_admin", "customer_care"]));
      return admins;
    }),
    createAdmin: superAdminProcedure.input(z.object({ username: z.string().min(3).max(64), name: z.string().min(2).max(120), email: z.string().email().optional(), role: z.enum(["admin", "super_admin", "customer_care"]), adminRole: z.string().max(128).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const exists = await getUserByUsername(input.username);
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Username is already in use" });
      const tempPassword = crypto.randomBytes(8).toString("hex");
      const [created] = await db.insert(users).values({
        openId: `admin-${input.username}-${crypto.randomUUID()}`,
        username: input.username,
        name: input.name,
        email: input.email,
        passwordHash: hashPassword(tempPassword),
        role: input.role,
        adminRole: input.adminRole,
        mustChangePassword: true,
        loginMethod: "credentials",
      }).returning({ id: users.id });
      await db.insert(auditLogs).values({
        actorUserId: ctx.user.id,
        action: "admin_created",
        entityType: "user",
        entityId: String(created.id),
        metadata: JSON.stringify({ role: input.role, adminRole: input.adminRole }),
      });
      return { success: true, userId: created.id, tempPassword, mustChangePassword: true } as const;
    }),
    removeAdmin: superAdminProcedure.input(z.object({ adminId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const target = await getUserById(input.adminId);
      if (!target || !["admin", "super_admin", "customer_care"].includes(target.role)) throw new TRPCError({ code: "NOT_FOUND", message: "Admin not found" });
      if (target.role === "super_admin" && target.id !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove other super admins" });
      await db.update(users).set({ role: "user" }).where(eq(users.id, input.adminId));
      await db.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "admin_removed", entityType: "user", entityId: String(input.adminId) });
      return { success: true } as const;
    }),
    sendMail: protectedProcedure.input(z.object({ toUsername: z.string().min(1).max(64), subject: z.string().min(3).max(255), messageBody: z.string().min(1).max(5000) })).mutation(async ({ ctx, input }) => {
      if (!["admin", "super_admin", "customer_care"].includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can send mail" });
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const recipient = await getUserByUsername(input.toUsername);
      if (!recipient) throw new TRPCError({ code: "NOT_FOUND", message: "Recipient user not found" });
      const [created] = await db.insert(adminMessages).values({
        fromUserId: ctx.user.id,
        toUserId: recipient.id,
        subject: input.subject,
        messageBody: input.messageBody,
        isReply: false,
      }).returning({ id: adminMessages.id });
      await db.insert(auditLogs).values({
        actorUserId: ctx.user.id,
        action: "mail_sent",
        entityType: "message",
        entityId: String(created.id),
        metadata: JSON.stringify({ toUserId: recipient.id }),
      });
      return { success: true, messageId: created.id } as const;
    }),
    replyToMail: protectedProcedure.input(z.object({ parentMessageId: z.number().int().positive(), messageBody: z.string().min(1).max(5000) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const parent = await db.select().from(adminMessages).where(eq(adminMessages.id, input.parentMessageId)).limit(1);
      if (!parent[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Parent message not found" });
      const parentMsg = parent[0];
      if (parentMsg.toUserId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot reply to someone else's mail" });
      const [created] = await db.insert(adminMessages).values({
        fromUserId: ctx.user.id,
        toUserId: parentMsg.fromUserId,
        subject: `RE: ${parentMsg.subject}`,
        messageBody: input.messageBody,
        isReply: true,
        parentMessageId: input.parentMessageId,
      }).returning({ id: adminMessages.id });
      await db.insert(auditLogs).values({
        actorUserId: ctx.user.id,
        action: "mail_reply_sent",
        entityType: "message",
        entityId: String(created.id),
        metadata: JSON.stringify({ parentMessageId: input.parentMessageId }),
      });
      return { success: true, messageId: created.id } as const;
    }),
    listReceivedMail: protectedProcedure.input(z.object({ page: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(50).default(20), unreadOnly: z.boolean().default(false) })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const baseQuery = db
        .select({
          id: adminMessages.id,
          fromUserId: adminMessages.fromUserId,
          fromUsername: users.username,
          fromName: users.name,
          subject: adminMessages.subject,
          messageBody: adminMessages.messageBody,
          readAt: adminMessages.readAt,
          isReply: adminMessages.isReply,
          createdAt: adminMessages.createdAt,
        })
        .from(adminMessages)
        .leftJoin(users, eq(adminMessages.fromUserId, users.id))
        .where(
          input.unreadOnly
            ? and(eq(adminMessages.toUserId, ctx.user.id), sql`${adminMessages.readAt} IS NULL`)
            : eq(adminMessages.toUserId, ctx.user.id)
        );
      const results = await baseQuery
        .orderBy(desc(adminMessages.createdAt))
        .limit(input.limit)
        .offset(input.page * input.limit);
      return results;
    }),
    markMailAsRead: protectedProcedure.input(z.object({ messageId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const msg = await db.select().from(adminMessages).where(eq(adminMessages.id, input.messageId)).limit(1);
      if (!msg[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
      if (msg[0].toUserId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot mark someone else's mail as read" });
      await db.update(adminMessages).set({ readAt: new Date() }).where(eq(adminMessages.id, input.messageId));
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
      const [created] = await db.insert(rides).values({ riderId: ctx.user.id, vehicleType: input.vehicleType, pickupLabel: input.pickupLabel, pickupLga: input.pickupLga, destinationLabel: input.destinationLabel, pickupLat: input.pickupLat, pickupLng: input.pickupLng, destinationLat: input.destinationLat, destinationLng: input.destinationLng, distanceMeters: Math.round(input.distanceKm * 1000), etaSeconds: Math.round(input.etaMinutes * 60), estimatedFareKobo: fareKobo, status: "matching" }).returning({ id: rides.id });
      const rideId = created.id;
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
      const [created] = await db.insert(drivers).values({ userId: ctx.user.id, ...input, status: "pending" }).returning({ id: drivers.id });
      return { driverId: created.id, status: "pending" as const };
    }),
    uploadDocument: protectedProcedure.input(z.object({ documentType: z.enum(["drivers_license", "vehicle_registration", "insurance", "profile_photo"]), fileName: z.string().min(1).max(255), mimeType: z.string().min(3).max(128), base64: z.string().min(100).max(14000000) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const driver = await getDriverByUserId(ctx.user.id);
      if (!driver) throw new TRPCError({ code: "BAD_REQUEST", message: "Submit your driver application first" });
      const bytes = Buffer.from(input.base64.replace(/^data:[^;]+;base64,/, ""), "base64");
      if (bytes.length > 10 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Document must be 10MB or smaller" });
      const uploaded = await storagePut(`driver-documents/${driver.id}/${input.documentType}/${input.fileName}`, bytes, input.mimeType);
      const [created] = await db.insert(driverDocuments).values({ driverId: driver.id, documentType: input.documentType, originalFileName: input.fileName, mimeType: input.mimeType, storageKey: uploaded.key }).returning({ id: driverDocuments.id });
      return { documentId: created.id, url: uploaded.url, status: "pending" as const };
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
      const updated = await db.update(rides).set({ driverId: driver.id, status: "driver_assigned" })
        .where(and(eq(rides.id, input.rideId), eq(rides.status, "matching")))
        .returning({ id: rides.id });
      if (updated.length === 0) throw new TRPCError({ code: "CONFLICT", message: "That trip has already been accepted" });
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
    launchStatus: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Launch status is temporarily unavailable." });
      }
      return getLaunchMode(db);
    }),
    joinLaunchWaitlist: publicProcedure.input(z.object({
      email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The waitlist is temporarily unavailable. Please try again later." });
      const digest = crypto.createHash("sha256").update(input.email).digest("hex");
      const settingKey = `${launchWaitlistKeyPrefix}${digest}`;
      await db.insert(platformSettings).values({
        settingKey,
        textValue: input.email,
        updatedBy: null,
      }).onConflictDoNothing();
      return { success: true } as const;
    }),
    saveLaunchMode: adminProcedure.input(z.object({
      enabled: z.boolean(),
      launchAt: z.string().datetime().nullable(),
    }).refine(value => !value.enabled || value.launchAt !== null, {
      message: "Choose a launch date and time before enabling the coming soon page.",
      path: ["launchAt"],
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const config: LaunchMode = input;
      await db.insert(platformSettings).values({
        settingKey: launchModeSettingKey,
        textValue: JSON.stringify(config),
        updatedBy: ctx.user.id,
      }).onConflictDoUpdate({
        target: platformSettings.settingKey,
        set: { textValue: JSON.stringify(config), updatedBy: ctx.user.id, updatedAt: new Date() },
      });
      await db.insert(auditLogs).values({
        actorUserId: ctx.user.id,
        action: "launch_mode_updated",
        entityType: "platform_setting",
        entityId: launchModeSettingKey,
        metadata: JSON.stringify(config),
      });
      return config;
    }),
    launchWaitlist: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const entries = await db.select({
        email: platformSettings.textValue,
        joinedAt: platformSettings.updatedAt,
      }).from(platformSettings)
        .where(like(platformSettings.settingKey, `${launchWaitlistKeyPrefix}%`))
        .orderBy(desc(platformSettings.updatedAt));
      return entries.flatMap(entry => entry.email ? [{ email: entry.email, joinedAt: entry.joinedAt }] : []);
    }),
    saveWaitlistDraft: adminProcedure.input(z.object({
      subject: z.string().trim().min(1).max(255),
      body: z.string().trim().min(1).max(10000),
      recipients: z.array(z.string().trim().email().max(320).transform(value => value.toLowerCase())).min(1).max(1000),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const recipients = [...new Set(input.recipients)];
      const draftId = crypto.randomUUID();
      await db.insert(platformSettings).values({
        settingKey: `${launchWaitlistDraftPrefix}${draftId}`,
        textValue: JSON.stringify({ id: draftId, subject: input.subject, body: input.body, recipients }),
        updatedBy: ctx.user.id,
      });
      await db.insert(auditLogs).values({
        actorUserId: ctx.user.id,
        action: "launch_waitlist_draft_saved",
        entityType: "platform_setting",
        entityId: draftId,
        metadata: JSON.stringify({ recipientCount: recipients.length }),
      });
      return { id: draftId, subject: input.subject, recipientCount: recipients.length } as const;
    }),
    launchWaitlistDrafts: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const rows = await db.select({
        textValue: platformSettings.textValue,
        updatedAt: platformSettings.updatedAt,
      }).from(platformSettings)
        .where(like(platformSettings.settingKey, `${launchWaitlistDraftPrefix}%`))
        .orderBy(desc(platformSettings.updatedAt));
      const schema = z.object({
        id: z.string().uuid(),
        subject: z.string(),
        body: z.string(),
        recipients: z.array(z.string().email()),
      });
      return rows.map(row => {
        if (!row.textValue) throw new Error("A saved waitlist draft has no content.");
        let value: unknown;
        try {
          value = JSON.parse(row.textValue);
        } catch {
          throw new Error("A saved waitlist draft is malformed.");
        }
        const parsed = schema.safeParse(value);
        if (!parsed.success) throw new Error("A saved waitlist draft is invalid.");
        return { ...parsed.data, updatedAt: row.updatedAt };
      });
    }),
    removeLaunchWaitlistEntries: adminProcedure.input(z.object({
      emails: z.array(z.string().trim().email().max(320).transform(value => value.toLowerCase())).min(1).max(500),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const emails = [...new Set(input.emails)];
      const settingKeys = emails.map(email => `${launchWaitlistKeyPrefix}${crypto.createHash("sha256").update(email).digest("hex")}`);
      const existing = await db.select({ settingKey: platformSettings.settingKey })
        .from(platformSettings)
        .where(inArray(platformSettings.settingKey, settingKeys));
      await db.delete(platformSettings).where(inArray(platformSettings.settingKey, settingKeys));
      await db.insert(auditLogs).values({
        actorUserId: ctx.user.id,
        action: "launch_waitlist_entries_removed",
        entityType: "platform_setting",
        entityId: launchWaitlistKeyPrefix,
        metadata: JSON.stringify({ count: existing.length }),
      });
      return { removedCount: existing.length } as const;
    }),
    appRelease: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return null;
      return getAppRelease(db);
    }),
    releaseStatus: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      return {
        release: await getAppRelease(db),
        deployHookConfigured: Boolean(process.env.VERCEL_DEPLOY_HOOK_URL),
      };
    }),
    publishAppVersion: adminProcedure
      .input(z.object({
        version: z.string().min(1).max(64).refine(value => parseSemanticVersion(value) !== null, "Enter a semantic version such as 1.2.3."),
        notes: z.string().trim().max(2000).default(""),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database is not configured");
        const buildId = currentBuildId();
        if (!buildId) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "A deployment build ID is unavailable. Publish this version from the deployed admin console.",
          });
        }
        const previous = await getAppRelease(db);
        if (previous?.version && compareSemanticVersions(input.version, previous.version) <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Version ${input.version} must be newer than ${previous.version}.`,
          });
        }
        const release: AppRelease = {
          version: input.version,
          buildId,
          notes: input.notes,
          releaseId: crypto.randomUUID(),
          publishedAt: new Date().toISOString(),
          promptForUpdate: true,
          updateType: "version",
        };
        await saveAppRelease(db, release, ctx.user.id);
        await db.insert(auditLogs).values({
          actorUserId: ctx.user.id,
          action: "app_version_published",
          entityType: "app_release",
          entityId: release.releaseId,
          metadata: JSON.stringify({ version: release.version, buildId: release.buildId }),
        });
        return release;
      }),
    publishCurrentDeployment: adminProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const hookUrl = configuredVercelDeployHook();
      const response = await fetch(hookUrl, { method: "POST", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "Vercel did not accept the deployment request.",
        });
      }
      const previous = await getAppRelease(db);
      const releaseId = crypto.randomUUID();
      const release: AppRelease = {
        version: previous?.version ?? "",
        buildId: currentBuildId() ?? previous?.buildId ?? releaseId,
        notes: "A new Kkary app update is available.",
        releaseId,
        publishedAt: new Date().toISOString(),
        promptForUpdate: true,
        updateType: "deployment",
      };
      await saveAppRelease(db, release, ctx.user.id);
      await db.insert(auditLogs).values({
        actorUserId: ctx.user.id,
        action: "app_deployment_published",
        entityType: "app_release",
        entityId: release.releaseId,
        metadata: JSON.stringify({ version: release.version || null, updateType: release.updateType }),
      });
      return { success: true, release } as const;
    }),
    snapshot: adminProcedure.query(async () => supabaseAdminRequest<{
      riderCount: number;
      driverCount: number;
      activeDriverCount: number;
      activeRideCount: number;
      completedRideCount: number;
      cancelledRideCount: number;
      revenueKobo: number;
    }>("rpc/admin_dashboard_snapshot", { method: "POST", body: "{}" })),
    liveDrivers: adminProcedure.query(async () => {
      const recentSince = encodeURIComponent(new Date(Date.now() - 2 * 60_000).toISOString());
      const rows = await supabaseAdminRequest<Array<{
        id: string;
        state: string | null;
        lga: string | null;
        vehicle_type: "bike" | "car" | "tricycle";
        current_lat: number;
        current_lng: number;
        location_updated_at: string;
      }>>(
        `driver_profiles?select=id,state,lga,vehicle_type,current_lat,current_lng,location_updated_at&is_online=eq.true&is_approved=eq.true&location_updated_at=gte.${recentSince}&current_lat=not.is.null&current_lng=not.is.null&order=location_updated_at.desc&limit=200`,
      );
      return rows.map(driver => ({
        id: driver.id,
        defaultLga: [driver.lga, driver.state].filter(Boolean).join(", "),
        vehicleType: driver.vehicle_type,
        currentLat: Number(driver.current_lat),
        currentLng: Number(driver.current_lng),
        lastLocationAt: driver.location_updated_at,
      }));
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
      await db.insert(platformSettings).values({ settingKey: "platform_commission_bps", numericValue: input.commissionBps, updatedBy: ctx.user.id }).onConflictDoUpdate({ target: platformSettings.settingKey, set: { numericValue: input.commissionBps, updatedBy: ctx.user.id } });
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
    serviceVehicleAreas: adminProcedure
      .input(z.object({ state: z.string().min(1), lga: z.string().min(1) }))
      .query(async ({ input }) => {
        if (!isNigerianStateLga(input.state, input.lga)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid Nigerian state and L.G.A." });
        }
        return supabaseAdminRequest<Array<{ vehicle_type: "bike" | "car" | "tricycle"; enabled: boolean }>>(
          `service_vehicle_areas?select=vehicle_type,enabled&state=eq.${encodeURIComponent(input.state)}&lga=eq.${encodeURIComponent(input.lga)}`,
        );
      }),
    setServiceVehicleArea: adminProcedure
      .input(z.object({
        state: z.string().min(1),
        lga: z.string().min(1),
        vehicleType: z.enum(["bike", "car", "tricycle"]),
        enabled: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isNigerianStateLga(input.state, input.lga)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid Nigerian state and L.G.A." });
        }
        const rows = await supabaseAdminRequest<Array<{ vehicle_type: string; enabled: boolean }>>(
          "service_vehicle_areas?on_conflict=state,lga,vehicle_type",
          {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=representation" },
            body: JSON.stringify({
              state: input.state,
              lga: input.lga,
              vehicle_type: input.vehicleType,
              enabled: input.enabled,
              updated_by: String(ctx.user.id),
              updated_at: new Date().toISOString(),
            }),
          },
        );
        const db = await getDb();
        if (db) await db.insert(auditLogs).values({
          actorUserId: ctx.user.id,
          action: "service_vehicle_area_updated",
          entityType: "service_vehicle_area",
          entityId: `${input.state}/${input.lga}/${input.vehicleType}`,
          metadata: JSON.stringify({ enabled: input.enabled }),
        });
        return rows[0] ?? { vehicle_type: input.vehicleType, enabled: input.enabled };
      }),
    driverApplications: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(drivers).where(eq(drivers.status, "pending")).limit(20);
    }),
    supabaseDriverApplications: adminProcedure.query(async () => {
      const rows = await supabaseAdminRequest<SupabaseDriverApplication[]>(
        "driver_profiles?select=id,profile_id,vehicle_type,vehicle_make,vehicle_model,vehicle_color,plate_number,created_at,profiles(full_name,email)&is_approved=eq.false&order=created_at.asc",
      );
      return rows;
    }),
    supabaseDriverDocuments: adminProcedure.query(async () => {
      const rows = await supabaseAdminRequest<SupabaseDriverDocument[]>(
        "driver_documents?select=id,driver_id,document_type,original_file_name,mime_type,verification_status,rejection_reason,created_at,driver_profiles(vehicle_type)&verification_status=eq.pending&order=created_at.asc&limit=100",
      );
      return rows.map(document => ({
        id: document.id,
        driverId: document.driver_id,
        documentType: document.document_type,
        fileName: document.original_file_name,
        mimeType: document.mime_type,
        createdAt: document.created_at,
        vehicleType: document.driver_profiles?.vehicle_type ?? null,
      }));
    }),
    supabaseDriverDocumentReviewUrl: adminProcedure
      .input(z.object({ documentId: z.string().uuid() }))
      .mutation(({ input }) => createDriverDocumentReviewUrl(input.documentId)),
    reviewSupabaseDriverDocument: adminProcedure
      .input(z.object({
        documentId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        rejectionReason: z.string().trim().max(500).optional(),
      }).superRefine((input, ctx) => {
        if (input.decision === "rejected" && !input.rejectionReason) {
          ctx.addIssue({ code: "custom", message: "Provide a reason when rejecting a document.", path: ["rejectionReason"] });
        }
      }))
      .mutation(async ({ ctx, input }) => {
        const rows = await supabaseAdminRequest<Array<{ id: string; driver_id: string }>>(
          `driver_documents?id=eq.${encodeURIComponent(input.documentId)}&verification_status=eq.pending`,
          {
            method: "PATCH",
            body: JSON.stringify({
              verification_status: input.decision,
              rejection_reason: input.decision === "rejected" ? input.rejectionReason : null,
              reviewed_by: String(ctx.user.id),
              reviewed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
          },
        );
        if (rows.length !== 1) {
          throw new TRPCError({ code: "CONFLICT", message: "This document was already reviewed or no longer exists." });
        }
        const db = await getDb();
        if (db) {
          await db.insert(auditLogs).values({
            actorUserId: ctx.user.id,
            action: `supabase_document_${input.decision}`,
            entityType: "supabase_driver_document",
            entityId: input.documentId,
            metadata: input.decision === "rejected" ? input.rejectionReason : undefined,
          });
        }
        return { success: true } as const;
      }),
    approveSupabaseDriver: adminProcedure
      .input(z.object({ driverId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const [driver] = await supabaseAdminRequest<Array<{ id: string; vehicle_type: "bike" | "car" | "tricycle" }>>(
          `driver_profiles?select=id,vehicle_type&id=eq.${encodeURIComponent(input.driverId)}&is_approved=eq.false`,
        );
        if (!driver) {
          throw new TRPCError({ code: "CONFLICT", message: "This driver application was already reviewed or no longer exists." });
        }
        const documents = await supabaseAdminRequest<Array<{ document_type: string; verification_status: string }>>(
          `driver_documents?select=document_type,verification_status&driver_id=eq.${encodeURIComponent(input.driverId)}`,
        );
        if (!hasVerifiedDriverDocuments(driver.vehicle_type, documents)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Approve the driver licence, NIN, and required vehicle documents before approving this driver.",
          });
        }
        const rows = await supabaseAdminRequest<Array<{ id: string }>>(
          `driver_profiles?id=eq.${encodeURIComponent(input.driverId)}&is_approved=eq.false`,
          { method: "PATCH", body: JSON.stringify({ is_approved: true }) },
        );
        if (rows.length !== 1) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This driver application was already reviewed or no longer exists.",
          });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The admin audit database is unavailable." });
        await db.insert(auditLogs).values({
          actorUserId: ctx.user.id,
          action: "supabase_driver_approved",
          entityType: "supabase_driver",
          entityId: input.driverId,
        });
        return { success: true } as const;
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
    serviceVehicles: publicProcedure
      .input(z.object({ state: z.string().min(1), lga: z.string().min(1) }))
      .query(async ({ input }) => {
        if (!isNigerianStateLga(input.state, input.lga)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid Nigerian state and L.G.A." });
        }
        const rows = await supabaseAdminRequest<Array<{ vehicle_type: "bike" | "car" | "tricycle" }>>(
          `service_vehicle_areas?select=vehicle_type&state=eq.${encodeURIComponent(input.state)}&lga=eq.${encodeURIComponent(input.lga)}&enabled=eq.true`,
        );
        return rows.map(row => row.vehicle_type);
      }),
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
