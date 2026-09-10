import {
  boolean,
  double,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "super_admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const profiles = mysqlTable("profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  phone: varchar("phone", { length: 32 }),
  avatarUrl: text("avatarUrl"),
  homeArea: varchar("homeArea", { length: 128 }).default("Akwa Ibom").notNull(),
  preferredVehicle: mysqlEnum("preferredVehicle", ["bike", "car"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ userIdx: uniqueIndex("profiles_user_idx").on(table.userId) }));

export const drivers = mysqlTable("drivers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "suspended", "offline", "online", "on_trip"]).default("pending").notNull(),
  vehicleType: mysqlEnum("vehicleType", ["bike", "car"]).notNull(),
  defaultLga: varchar("defaultLga", { length: 80 }).default("Uyo").notNull(),
  vehicleMake: varchar("vehicleMake", { length: 80 }),
  vehicleModel: varchar("vehicleModel", { length: 80 }),
  vehicleColor: varchar("vehicleColor", { length: 40 }),
  plateNumber: varchar("plateNumber", { length: 32 }),
  rating: int("rating").default(500).notNull(),
  currentLat: double("currentLat"),
  currentLng: double("currentLng"),
  currentAccuracyM: double("currentAccuracyM"),
  currentHeading: double("currentHeading"),
  h3Cell: varchar("h3Cell", { length: 32 }),
  lastLocationAt: timestamp("lastLocationAt"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  userIdx: uniqueIndex("drivers_user_idx").on(table.userId),
  statusIdx: index("drivers_status_idx").on(table.status),
  geoIdx: index("drivers_geo_idx").on(table.h3Cell),
  lgaIdx: index("drivers_lga_idx").on(table.defaultLga),
}));

export const driverDocuments = mysqlTable("driverDocuments", {
  id: int("id").autoincrement().primaryKey(),
  driverId: int("driverId").notNull().references(() => drivers.id),
  documentType: varchar("documentType", { length: 64 }).notNull(),
  originalFileName: varchar("originalFileName", { length: 255 }),
  mimeType: varchar("mimeType", { length: 128 }),
  storageKey: text("storageKey").notNull(),
  verificationStatus: mysqlEnum("verificationStatus", ["pending", "approved", "rejected"]).default("pending").notNull(),
  rejectionReason: text("rejectionReason"),
  reviewedBy: int("reviewedBy").references(() => users.id),
  reviewedAt: timestamp("reviewedAt"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ driverIdx: index("driver_documents_driver_idx").on(table.driverId) }));

export const driverLocations = mysqlTable("driverLocations", {
  id: int("id").autoincrement().primaryKey(),
  driverId: int("driverId").notNull().references(() => drivers.id),
  rideId: int("rideId").references(() => rides.id),
  lat: double("lat").notNull(),
  lng: double("lng").notNull(),
  accuracyM: double("accuracyM"),
  speedKph: double("speedKph"),
  heading: double("heading"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  driverIdx: index("driver_locations_driver_idx").on(table.driverId),
  rideIdx: index("driver_locations_ride_idx").on(table.rideId),
  createdIdx: index("driver_locations_created_idx").on(table.createdAt),
}));

export const driverBankAccounts = mysqlTable("driverBankAccounts", {
  id: int("id").autoincrement().primaryKey(),
  driverId: int("driverId").notNull().references(() => drivers.id),
  bankCode: varchar("bankCode", { length: 16 }).notNull(),
  bankName: varchar("bankName", { length: 128 }).notNull(),
  accountNumberLast4: varchar("accountNumberLast4", { length: 4 }).notNull(),
  providerRecipientCode: varchar("providerRecipientCode", { length: 128 }),
  isPrimary: boolean("isPrimary").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ driverIdx: index("driver_bank_accounts_driver_idx").on(table.driverId) }));

export const wallets = mysqlTable("wallets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ userIdx: uniqueIndex("wallets_user_idx").on(table.userId) }));

export const walletAccounts = mysqlTable("walletAccounts", {
  id: int("id").autoincrement().primaryKey(),
  walletId: int("walletId").notNull().references(() => wallets.id),
  provider: varchar("provider", { length: 32 }).default("monnify").notNull(),
  customerReference: varchar("customerReference", { length: 128 }).notNull().unique(),
  accountNumber: varchar("accountNumber", { length: 32 }).notNull().unique(),
  accountName: varchar("accountName", { length: 160 }).notNull(),
  bankName: varchar("bankName", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["pending", "active", "suspended"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ walletIdx: uniqueIndex("wallet_accounts_wallet_idx").on(table.walletId) }));

export const walletTransactions = mysqlTable("walletTransactions", {
  id: int("id").autoincrement().primaryKey(),
  walletId: int("walletId").notNull().references(() => wallets.id),
  type: mysqlEnum("type", ["credit", "debit", "refund", "ride_payment"]).notNull(),
  amountKobo: int("amountKobo").notNull(),
  balanceAfterKobo: int("balanceAfterKobo"),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  reference: varchar("reference", { length: 128 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "completed", "failed", "reversed"]).default("pending").notNull(),
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

export const pricingRules = mysqlTable("pricingRules", {
  id: int("id").autoincrement().primaryKey(),
  serviceArea: varchar("serviceArea", { length: 128 }).default("Akwa Ibom").notNull(),
  vehicleType: mysqlEnum("vehicleType", ["bike", "car"]).notNull(),
  baseFareKobo: int("baseFareKobo").notNull(),
  perKmKobo: int("perKmKobo").notNull(),
  minimumFareKobo: int("minimumFareKobo").notNull(),
  commissionBps: int("commissionBps").default(2000).notNull(),
  active: boolean("active").default(true).notNull(),
  effectiveFrom: timestamp("effectiveFrom").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ areaVehicleIdx: index("pricing_rules_area_vehicle_idx").on(table.serviceArea, table.vehicleType) }));

export const platformSettings = mysqlTable("platformSettings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 96 }).notNull().unique(),
  numericValue: int("numericValue"),
  textValue: text("textValue"),
  updatedBy: int("updatedBy").references(() => users.id),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const rides = mysqlTable("rides", {
  id: int("id").autoincrement().primaryKey(),
  riderId: int("riderId").notNull().references(() => users.id),
  driverId: int("driverId").references(() => drivers.id),
  vehicleType: mysqlEnum("vehicleType", ["bike", "car"]).notNull(),
  pickupLabel: varchar("pickupLabel", { length: 255 }).notNull(),
  pickupLga: varchar("pickupLga", { length: 80 }),
  destinationLabel: varchar("destinationLabel", { length: 255 }).notNull(),
  pickupLat: double("pickupLat"),
  pickupLng: double("pickupLng"),
  destinationLat: double("destinationLat"),
  destinationLng: double("destinationLng"),
  distanceMeters: int("distanceMeters"),
  etaSeconds: int("etaSeconds"),
  estimatedFareKobo: int("estimatedFareKobo").notNull(),
  finalFareKobo: int("finalFareKobo"),
  status: mysqlEnum("status", ["requested", "matching", "driver_assigned", "driver_en_route", "driver_arrived", "trip_started", "trip_completed", "payment_processing", "completed", "cancelled_by_rider", "cancelled_by_driver", "cancelled_no_driver", "payment_failed"]).default("requested").notNull(),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  riderIdx: index("rides_rider_idx").on(table.riderId),
  driverIdx: index("rides_driver_idx").on(table.driverId),
  statusIdx: index("rides_status_idx").on(table.status),
}));

export const rideEvents = mysqlTable("rideEvents", {
  id: int("id").autoincrement().primaryKey(),
  rideId: int("rideId").notNull().references(() => rides.id),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  fromStatus: varchar("fromStatus", { length: 48 }),
  toStatus: varchar("toStatus", { length: 48 }),
  actorUserId: int("actorUserId").references(() => users.id),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ rideIdx: index("ride_events_ride_idx").on(table.rideId) }));

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  rideId: int("rideId").references(() => rides.id),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  data: text("data"),
  readAt: timestamp("readAt"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ userIdx: index("notifications_user_idx").on(table.userId), rideIdx: index("notifications_ride_idx").on(table.rideId) }));

export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  rideId: int("rideId").references(() => rides.id),
  walletTransactionId: int("walletTransactionId").references(() => walletTransactions.id),
  provider: varchar("provider", { length: 32 }).default("monnify").notNull(),
  providerReference: varchar("providerReference", { length: 128 }).notNull().unique(),
  amountKobo: int("amountKobo").notNull(),
  status: mysqlEnum("status", ["pending", "successful", "failed", "reversed"]).default("pending").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull().unique(),
  rawReference: text("rawReference"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const paymentWebhooks = mysqlTable("paymentWebhooks", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 32 }).default("monnify").notNull(),
  providerReference: varchar("providerReference", { length: 128 }).notNull().unique(),
  signatureValid: boolean("signatureValid").notNull(),
  processed: boolean("processed").default(false).notNull(),
  payload: text("payload").notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
}, table => ({ providerIdx: index("payment_webhooks_provider_idx").on(table.providerReference) }));

export const driverEarnings = mysqlTable("driverEarnings", {
  id: int("id").autoincrement().primaryKey(),
  driverId: int("driverId").notNull().references(() => drivers.id),
  rideId: int("rideId").notNull().references(() => rides.id),
  grossFareKobo: int("grossFareKobo").notNull(),
  platformCommissionKobo: int("platformCommissionKobo").notNull(),
  driverEarningKobo: int("driverEarningKobo").notNull(),
  commissionBps: int("commissionBps").notNull(),
  status: mysqlEnum("status", ["pending", "available", "paid", "reversed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ driverIdx: index("driver_earnings_driver_idx").on(table.driverId), rideIdx: uniqueIndex("driver_earnings_ride_idx").on(table.rideId) }));

export const driverPayouts = mysqlTable("driverPayouts", {
  id: int("id").autoincrement().primaryKey(),
  driverId: int("driverId").notNull().references(() => drivers.id),
  amountKobo: int("amountKobo").notNull(),
  provider: varchar("provider", { length: 32 }).default("monnify").notNull(),
  providerReference: varchar("providerReference", { length: 128 }).unique(),
  status: mysqlEnum("status", ["pending", "processing", "successful", "failed", "reversed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, table => ({ driverIdx: index("driver_payouts_driver_idx").on(table.driverId) }));

export const ratings = mysqlTable("ratings", {
  id: int("id").autoincrement().primaryKey(),
  rideId: int("rideId").notNull().references(() => rides.id),
  riderId: int("riderId").notNull().references(() => users.id),
  driverId: int("driverId").notNull().references(() => drivers.id),
  stars: int("stars").notNull(),
  review: text("review"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ rideIdx: uniqueIndex("ratings_ride_idx").on(table.rideId) }));

export const supportTickets = mysqlTable("supportTickets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  rideId: int("rideId").references(() => rides.id),
  category: varchar("category", { length: 64 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  description: text("description").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId").references(() => users.id),
  action: varchar("action", { length: 128 }).notNull(),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  entityId: varchar("entityId", { length: 64 }),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Ride = typeof rides.$inferSelect;
export type PricingRule = typeof pricingRules.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
