import {
  AnyPgColumn,
  boolean,
  doublePrecision,
  index,
  integer,
  pgSchema,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const kkar = pgSchema("kkar");

export const userRole = kkar.enum("user_role", ["user", "admin", "super_admin", "customer_care"]);
export const preferredVehicle = kkar.enum("preferred_vehicle", ["bike", "car"]);
export const driverStatus = kkar.enum("driver_status", ["pending", "approved", "rejected", "suspended", "offline", "online", "on_trip"]);
export const vehicleType = kkar.enum("vehicle_type", ["bike", "car"]);
export const verificationStatus = kkar.enum("verification_status", ["pending", "approved", "rejected"]);
export const walletAccountStatus = kkar.enum("wallet_account_status", ["pending", "active", "suspended"]);
export const transactionType = kkar.enum("transaction_type", ["credit", "debit", "refund", "ride_payment"]);
export const transactionStatus = kkar.enum("transaction_status", ["pending", "completed", "failed", "reversed"]);
export const rideStatus = kkar.enum("ride_status", ["requested", "matching", "driver_assigned", "driver_en_route", "driver_arrived", "trip_started", "trip_completed", "payment_processing", "completed", "cancelled_by_rider", "cancelled_by_driver", "cancelled_no_driver", "payment_failed"]);
export const paymentStatus = kkar.enum("payment_status", ["pending", "successful", "failed", "reversed"]);
export const smsStatus = kkar.enum("sms_status", ["queued", "sending", "sent", "delivered", "failed", "rejected", "expired", "unknown"]);
export const smsProviderStatus = kkar.enum("sms_provider_status", ["pending", "sent", "delivered", "failed", "blocked", "unknown"]);
export const earningsStatus = kkar.enum("earnings_status", ["pending", "available", "paid", "reversed"]);
export const payoutStatus = kkar.enum("payout_status", ["pending", "processing", "successful", "failed", "reversed"]);
export const supportStatus = kkar.enum("support_status", ["open", "in_progress", "resolved", "closed"]);

export const users = kkar.table("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  adminRole: varchar("adminRole", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const profiles = kkar.table("profiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  phone: varchar("phone", { length: 32 }),
  avatarUrl: text("avatarUrl"),
  homeArea: varchar("homeArea", { length: 128 }).default("Akwa Ibom").notNull(),
  preferredVehicle: preferredVehicle("preferredVehicle"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => ({ userIdx: uniqueIndex("profiles_user_idx").on(table.userId) }));

export const drivers = kkar.table("drivers", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  status: driverStatus("status").default("pending").notNull(),
  vehicleType: vehicleType("vehicleType").notNull(),
  defaultLga: varchar("defaultLga", { length: 80 }).default("Uyo").notNull(),
  vehicleMake: varchar("vehicleMake", { length: 80 }),
  vehicleModel: varchar("vehicleModel", { length: 80 }),
  vehicleColor: varchar("vehicleColor", { length: 40 }),
  plateNumber: varchar("plateNumber", { length: 32 }),
  rating: integer("rating").default(500).notNull(),
  currentLat: doublePrecision("currentLat"),
  currentLng: doublePrecision("currentLng"),
  currentAccuracyM: doublePrecision("currentAccuracyM"),
  currentHeading: doublePrecision("currentHeading"),
  h3Cell: varchar("h3Cell", { length: 32 }),
  lastLocationAt: timestamp("lastLocationAt"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => ({
  userIdx: uniqueIndex("drivers_user_idx").on(table.userId),
  statusIdx: index("drivers_status_idx").on(table.status),
  geoIdx: index("drivers_geo_idx").on(table.h3Cell),
  lgaIdx: index("drivers_lga_idx").on(table.defaultLga),
}));

export const driverDocuments = kkar.table("driverDocuments", {
  id: serial("id").primaryKey(),
  driverId: integer("driverId").notNull().references(() => drivers.id),
  documentType: varchar("documentType", { length: 64 }).notNull(),
  originalFileName: varchar("originalFileName", { length: 255 }),
  mimeType: varchar("mimeType", { length: 128 }),
  storageKey: text("storageKey").notNull(),
  verificationStatus: verificationStatus("verificationStatus").default("pending").notNull(),
  rejectionReason: text("rejectionReason"),
  reviewedBy: integer("reviewedBy").references(() => users.id),
  reviewedAt: timestamp("reviewedAt"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ driverIdx: index("driver_documents_driver_idx").on(table.driverId) }));

export const driverLocations = kkar.table("driverLocations", {
  id: serial("id").primaryKey(),
  driverId: integer("driverId").notNull().references(() => drivers.id),
  rideId: integer("rideId").references(() => rides.id),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  accuracyM: doublePrecision("accuracyM"),
  speedKph: doublePrecision("speedKph"),
  heading: doublePrecision("heading"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  driverIdx: index("driver_locations_driver_idx").on(table.driverId),
  rideIdx: index("driver_locations_ride_idx").on(table.rideId),
  createdIdx: index("driver_locations_created_idx").on(table.createdAt),
}));

export const driverBankAccounts = kkar.table("driverBankAccounts", {
  id: serial("id").primaryKey(),
  driverId: integer("driverId").notNull().references(() => drivers.id),
  bankCode: varchar("bankCode", { length: 16 }).notNull(),
  bankName: varchar("bankName", { length: 128 }).notNull(),
  accountNumberLast4: varchar("accountNumberLast4", { length: 4 }).notNull(),
  providerRecipientCode: varchar("providerRecipientCode", { length: 128 }),
  isPrimary: boolean("isPrimary").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ driverIdx: index("driver_bank_accounts_driver_idx").on(table.driverId) }));

export const wallets = kkar.table("wallets", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ userIdx: uniqueIndex("wallets_user_idx").on(table.userId) }));

export const walletAccounts = kkar.table("walletAccounts", {
  id: serial("id").primaryKey(),
  walletId: integer("walletId").notNull().references(() => wallets.id),
  provider: varchar("provider", { length: 32 }).default("monnify").notNull(),
  customerReference: varchar("customerReference", { length: 128 }).notNull().unique(),
  accountNumber: varchar("accountNumber", { length: 32 }).notNull().unique(),
  accountName: varchar("accountName", { length: 160 }).notNull(),
  bankName: varchar("bankName", { length: 128 }).notNull(),
  status: walletAccountStatus("status").default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => ({ walletIdx: uniqueIndex("wallet_accounts_wallet_idx").on(table.walletId) }));

export const walletTransactions = kkar.table("walletTransactions", {
  id: serial("id").primaryKey(),
  walletId: integer("walletId").notNull().references(() => wallets.id),
  type: transactionType("type").notNull(),
  amountKobo: integer("amountKobo").notNull(),
  balanceAfterKobo: integer("balanceAfterKobo"),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  reference: varchar("reference", { length: 128 }).notNull().unique(),
  status: transactionStatus("status").default("pending").notNull(),
  description: text("description"),
  metadata: text("metadata"),
  provider: varchar("provider", { length: 32 }),
  providerReference: varchar("providerReference", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  walletIdx: index("wallet_transactions_wallet_idx").on(table.walletId),
  providerIdx: index("wallet_transactions_provider_idx").on(table.providerReference),
  createdIdx: index("wallet_transactions_created_idx").on(table.createdAt),
}));

export const pricingRules = kkar.table("pricingRules", {
  id: serial("id").primaryKey(),
  serviceArea: varchar("serviceArea", { length: 128 }).default("Akwa Ibom").notNull(),
  vehicleType: vehicleType("vehicleType").notNull(),
  baseFareKobo: integer("baseFareKobo").notNull(),
  perKmKobo: integer("perKmKobo").notNull(),
  minimumFareKobo: integer("minimumFareKobo").notNull(),
  commissionBps: integer("commissionBps").default(2000).notNull(),
  active: boolean("active").default(true).notNull(),
  effectiveFrom: timestamp("effectiveFrom").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ areaVehicleIdx: index("pricing_rules_area_vehicle_idx").on(table.serviceArea, table.vehicleType) }));

export const platformSettings = kkar.table("platformSettings", {
  id: serial("id").primaryKey(),
  settingKey: varchar("settingKey", { length: 96 }).notNull().unique(),
  numericValue: integer("numericValue"),
  textValue: text("textValue"),
  updatedBy: integer("updatedBy").references(() => users.id),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const rides = kkar.table("rides", {
  id: serial("id").primaryKey(),
  riderId: integer("riderId").notNull().references(() => users.id),
  driverId: integer("driverId").references(() => drivers.id),
  vehicleType: vehicleType("vehicleType").notNull(),
  pickupLabel: varchar("pickupLabel", { length: 255 }).notNull(),
  pickupLga: varchar("pickupLga", { length: 80 }),
  destinationLabel: varchar("destinationLabel", { length: 255 }).notNull(),
  pickupLat: doublePrecision("pickupLat"),
  pickupLng: doublePrecision("pickupLng"),
  destinationLat: doublePrecision("destinationLat"),
  destinationLng: doublePrecision("destinationLng"),
  distanceMeters: integer("distanceMeters"),
  etaSeconds: integer("etaSeconds"),
  estimatedFareKobo: integer("estimatedFareKobo").notNull(),
  finalFareKobo: integer("finalFareKobo"),
  status: rideStatus("status").default("requested").notNull(),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => ({
  riderIdx: index("rides_rider_idx").on(table.riderId),
  driverIdx: index("rides_driver_idx").on(table.driverId),
  statusIdx: index("rides_status_idx").on(table.status),
}));

export const rideEvents = kkar.table("rideEvents", {
  id: serial("id").primaryKey(),
  rideId: integer("rideId").notNull().references(() => rides.id),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  fromStatus: varchar("fromStatus", { length: 48 }),
  toStatus: varchar("toStatus", { length: 48 }),
  actorUserId: integer("actorUserId").references(() => users.id),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ rideIdx: index("ride_events_ride_idx").on(table.rideId) }));

export const notifications = kkar.table("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  rideId: integer("rideId").references(() => rides.id),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  data: text("data"),
  readAt: timestamp("readAt"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ userIdx: index("notifications_user_idx").on(table.userId), rideIdx: index("notifications_ride_idx").on(table.rideId) }));

export const payments = kkar.table("payments", {
  id: serial("id").primaryKey(),
  rideId: integer("rideId").references(() => rides.id),
  walletTransactionId: integer("walletTransactionId").references(() => walletTransactions.id),
  provider: varchar("provider", { length: 32 }).default("monnify").notNull(),
  providerReference: varchar("providerReference", { length: 128 }).notNull().unique(),
  amountKobo: integer("amountKobo").notNull(),
  status: paymentStatus("status").default("pending").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull().unique(),
  rawReference: text("rawReference"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const paymentWebhooks = kkar.table("paymentWebhooks", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 32 }).default("monnify").notNull(),
  providerReference: varchar("providerReference", { length: 128 }).notNull().unique(),
  signatureValid: boolean("signatureValid").notNull(),
  processed: boolean("processed").default(false).notNull(),
  payload: text("payload").notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
}, table => ({ providerIdx: index("payment_webhooks_provider_idx").on(table.providerReference) }));

export const robaseSmsMessages = kkar.table("robaseSmsMessages", {
  id: serial("id").primaryKey(),
  userId: integer("userId").references(() => users.id),
  recipientPhone: varchar("recipientPhone", { length: 32 }).notNull(),
  provider: varchar("provider", { length: 32 }).default("robase").notNull(),
  providerMessageId: varchar("providerMessageId", { length: 128 }),
  status: smsStatus("status").default("queued").notNull(),
  providerStatus: smsProviderStatus("providerStatus").default("pending").notNull(),
  deliveryErrorCode: varchar("deliveryErrorCode", { length: 64 }),
  sentAt: timestamp("sentAt"),
  deliveredAt: timestamp("deliveredAt"),
  failedAt: timestamp("failedAt"),
  lastWebhookAt: timestamp("lastWebhookAt"),
  lastWebhookEventAt: timestamp("lastWebhookEventAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => ({
  providerMessageIdx: uniqueIndex("robase_sms_provider_message_idx").on(table.provider, table.providerMessageId),
  userIdx: index("robase_sms_user_idx").on(table.userId),
  statusIdx: index("robase_sms_status_idx").on(table.status),
}));

export const robaseWebhookEvents = kkar.table("robaseWebhookEvents", {
  id: serial("id").primaryKey(),
  eventId: varchar("eventId", { length: 64 }).notNull().unique(),
  providerMessageId: varchar("providerMessageId", { length: 128 }),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  providerEventAt: timestamp("providerEventAt").notNull(),
  processed: boolean("processed").default(false).notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
}, table => ({
  providerMessageIdx: index("robase_webhook_message_idx").on(table.providerMessageId),
  eventTypeIdx: index("robase_webhook_type_idx").on(table.eventType),
}));

export const driverEarnings = kkar.table("driverEarnings", {
  id: serial("id").primaryKey(),
  driverId: integer("driverId").notNull().references(() => drivers.id),
  rideId: integer("rideId").notNull().references(() => rides.id),
  grossFareKobo: integer("grossFareKobo").notNull(),
  platformCommissionKobo: integer("platformCommissionKobo").notNull(),
  driverEarningKobo: integer("driverEarningKobo").notNull(),
  commissionBps: integer("commissionBps").notNull(),
  status: earningsStatus("status").default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ driverIdx: index("driver_earnings_driver_idx").on(table.driverId), rideIdx: uniqueIndex("driver_earnings_ride_idx").on(table.rideId) }));

export const driverPayouts = kkar.table("driverPayouts", {
  id: serial("id").primaryKey(),
  driverId: integer("driverId").notNull().references(() => drivers.id),
  amountKobo: integer("amountKobo").notNull(),
  provider: varchar("provider", { length: 32 }).default("monnify").notNull(),
  providerReference: varchar("providerReference", { length: 128 }).unique(),
  status: payoutStatus("status").default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, table => ({ driverIdx: index("driver_payouts_driver_idx").on(table.driverId) }));

export const ratings = kkar.table("ratings", {
  id: serial("id").primaryKey(),
  rideId: integer("rideId").notNull().references(() => rides.id),
  riderId: integer("riderId").notNull().references(() => users.id),
  driverId: integer("driverId").notNull().references(() => drivers.id),
  stars: integer("stars").notNull(),
  review: text("review"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ rideIdx: uniqueIndex("ratings_ride_idx").on(table.rideId) }));

export const supportTickets = kkar.table("supportTickets", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  rideId: integer("rideId").references(() => rides.id),
  category: varchar("category", { length: 64 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  description: text("description").notNull(),
  status: supportStatus("status").default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const auditLogs = kkar.table("auditLogs", {
  id: serial("id").primaryKey(),
  actorUserId: integer("actorUserId").references(() => users.id),
  action: varchar("action", { length: 128 }).notNull(),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  entityId: varchar("entityId", { length: 64 }),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const adminMessages = kkar.table("adminMessages", {
  id: serial("id").primaryKey(),
  fromUserId: integer("fromUserId").notNull().references(() => users.id),
  toUserId: integer("toUserId").notNull().references(() => users.id),
  subject: varchar("subject", { length: 255 }).notNull(),
  messageBody: text("messageBody").notNull(),
  readAt: timestamp("readAt"),
  isReply: boolean("isReply").default(false).notNull(),
  parentMessageId: integer("parentMessageId").references((): AnyPgColumn => adminMessages.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => ({
  fromUserIdx: index("admin_messages_from_user_idx").on(table.fromUserId),
  toUserIdx: index("admin_messages_to_user_idx").on(table.toUserId),
  createdIdx: index("admin_messages_created_idx").on(table.createdAt),
  parentIdx: index("admin_messages_parent_idx").on(table.parentMessageId),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Ride = typeof rides.$inferSelect;
export type PricingRule = typeof pricingRules.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
