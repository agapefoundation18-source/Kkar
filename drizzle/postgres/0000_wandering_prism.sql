CREATE SCHEMA IF NOT EXISTS "kkar";
--> statement-breakpoint
CREATE TYPE "kkar"."driver_status" AS ENUM('pending', 'approved', 'rejected', 'suspended', 'offline', 'online', 'on_trip');--> statement-breakpoint
CREATE TYPE "kkar"."earnings_status" AS ENUM('pending', 'available', 'paid', 'reversed');--> statement-breakpoint
CREATE TYPE "kkar"."payment_status" AS ENUM('pending', 'successful', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "kkar"."payout_status" AS ENUM('pending', 'processing', 'successful', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "kkar"."preferred_vehicle" AS ENUM('bike', 'car');--> statement-breakpoint
CREATE TYPE "kkar"."ride_status" AS ENUM('requested', 'matching', 'driver_assigned', 'driver_en_route', 'driver_arrived', 'trip_started', 'trip_completed', 'payment_processing', 'completed', 'cancelled_by_rider', 'cancelled_by_driver', 'cancelled_no_driver', 'payment_failed');--> statement-breakpoint
CREATE TYPE "kkar"."sms_provider_status" AS ENUM('pending', 'sent', 'delivered', 'failed', 'blocked', 'unknown');--> statement-breakpoint
CREATE TYPE "kkar"."sms_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'failed', 'rejected', 'expired', 'unknown');--> statement-breakpoint
CREATE TYPE "kkar"."support_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "kkar"."transaction_status" AS ENUM('pending', 'completed', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "kkar"."transaction_type" AS ENUM('credit', 'debit', 'refund', 'ride_payment');--> statement-breakpoint
CREATE TYPE "kkar"."user_role" AS ENUM('user', 'admin', 'super_admin', 'customer_care');--> statement-breakpoint
CREATE TYPE "kkar"."vehicle_type" AS ENUM('bike', 'car');--> statement-breakpoint
CREATE TYPE "kkar"."verification_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "kkar"."wallet_account_status" AS ENUM('pending', 'active', 'suspended');--> statement-breakpoint
CREATE TABLE "kkar"."adminMessages" (
	"id" serial PRIMARY KEY NOT NULL,
	"fromUserId" integer NOT NULL,
	"toUserId" integer NOT NULL,
	"subject" varchar(255) NOT NULL,
	"messageBody" text NOT NULL,
	"readAt" timestamp,
	"isReply" boolean DEFAULT false NOT NULL,
	"parentMessageId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."auditLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actorUserId" integer,
	"action" varchar(128) NOT NULL,
	"entityType" varchar(64) NOT NULL,
	"entityId" varchar(64),
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."driverBankAccounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"driverId" integer NOT NULL,
	"bankCode" varchar(16) NOT NULL,
	"bankName" varchar(128) NOT NULL,
	"accountNumberLast4" varchar(4) NOT NULL,
	"providerRecipientCode" varchar(128),
	"isPrimary" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."driverDocuments" (
	"id" serial PRIMARY KEY NOT NULL,
	"driverId" integer NOT NULL,
	"documentType" varchar(64) NOT NULL,
	"originalFileName" varchar(255),
	"mimeType" varchar(128),
	"storageKey" text NOT NULL,
	"verificationStatus" "kkar"."verification_status" DEFAULT 'pending' NOT NULL,
	"rejectionReason" text,
	"reviewedBy" integer,
	"reviewedAt" timestamp,
	"expiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."driverEarnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"driverId" integer NOT NULL,
	"rideId" integer NOT NULL,
	"grossFareKobo" integer NOT NULL,
	"platformCommissionKobo" integer NOT NULL,
	"driverEarningKobo" integer NOT NULL,
	"commissionBps" integer NOT NULL,
	"status" "kkar"."earnings_status" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."driverLocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"driverId" integer NOT NULL,
	"rideId" integer,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracyM" double precision,
	"speedKph" double precision,
	"heading" double precision,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."driverPayouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"driverId" integer NOT NULL,
	"amountKobo" integer NOT NULL,
	"provider" varchar(32) DEFAULT 'monnify' NOT NULL,
	"providerReference" varchar(128),
	"status" "kkar"."payout_status" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	CONSTRAINT "driverPayouts_providerReference_unique" UNIQUE("providerReference")
);
--> statement-breakpoint
CREATE TABLE "kkar"."drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"status" "kkar"."driver_status" DEFAULT 'pending' NOT NULL,
	"vehicleType" "kkar"."vehicle_type" NOT NULL,
	"defaultLga" varchar(80) DEFAULT 'Uyo' NOT NULL,
	"vehicleMake" varchar(80),
	"vehicleModel" varchar(80),
	"vehicleColor" varchar(40),
	"plateNumber" varchar(32),
	"rating" integer DEFAULT 500 NOT NULL,
	"currentLat" double precision,
	"currentLng" double precision,
	"currentAccuracyM" double precision,
	"currentHeading" double precision,
	"h3Cell" varchar(32),
	"lastLocationAt" timestamp,
	"approvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"rideId" integer,
	"type" varchar(64) NOT NULL,
	"title" varchar(180) NOT NULL,
	"body" text NOT NULL,
	"data" text,
	"readAt" timestamp,
	"sentAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."paymentWebhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar(32) DEFAULT 'monnify' NOT NULL,
	"providerReference" varchar(128) NOT NULL,
	"signatureValid" boolean NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"payload" text NOT NULL,
	"receivedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "paymentWebhooks_providerReference_unique" UNIQUE("providerReference")
);
--> statement-breakpoint
CREATE TABLE "kkar"."payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"rideId" integer,
	"walletTransactionId" integer,
	"provider" varchar(32) DEFAULT 'monnify' NOT NULL,
	"providerReference" varchar(128) NOT NULL,
	"amountKobo" integer NOT NULL,
	"status" "kkar"."payment_status" DEFAULT 'pending' NOT NULL,
	"idempotencyKey" varchar(128) NOT NULL,
	"rawReference" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_providerReference_unique" UNIQUE("providerReference"),
	CONSTRAINT "payments_idempotencyKey_unique" UNIQUE("idempotencyKey")
);
--> statement-breakpoint
CREATE TABLE "kkar"."platformSettings" (
	"id" serial PRIMARY KEY NOT NULL,
	"settingKey" varchar(96) NOT NULL,
	"numericValue" integer,
	"textValue" text,
	"updatedBy" integer,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platformSettings_settingKey_unique" UNIQUE("settingKey")
);
--> statement-breakpoint
CREATE TABLE "kkar"."pricingRules" (
	"id" serial PRIMARY KEY NOT NULL,
	"serviceArea" varchar(128) DEFAULT 'Akwa Ibom' NOT NULL,
	"vehicleType" "kkar"."vehicle_type" NOT NULL,
	"baseFareKobo" integer NOT NULL,
	"perKmKobo" integer NOT NULL,
	"minimumFareKobo" integer NOT NULL,
	"commissionBps" integer DEFAULT 2000 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"effectiveFrom" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"phone" varchar(32),
	"avatarUrl" text,
	"homeArea" varchar(128) DEFAULT 'Akwa Ibom' NOT NULL,
	"preferredVehicle" "kkar"."preferred_vehicle",
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"rideId" integer NOT NULL,
	"riderId" integer NOT NULL,
	"driverId" integer NOT NULL,
	"stars" integer NOT NULL,
	"review" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."rideEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"rideId" integer NOT NULL,
	"eventType" varchar(64) NOT NULL,
	"fromStatus" varchar(48),
	"toStatus" varchar(48),
	"actorUserId" integer,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."rides" (
	"id" serial PRIMARY KEY NOT NULL,
	"riderId" integer NOT NULL,
	"driverId" integer,
	"vehicleType" "kkar"."vehicle_type" NOT NULL,
	"pickupLabel" varchar(255) NOT NULL,
	"pickupLga" varchar(80),
	"destinationLabel" varchar(255) NOT NULL,
	"pickupLat" double precision,
	"pickupLng" double precision,
	"destinationLat" double precision,
	"destinationLng" double precision,
	"distanceMeters" integer,
	"etaSeconds" integer,
	"estimatedFareKobo" integer NOT NULL,
	"finalFareKobo" integer,
	"status" "kkar"."ride_status" DEFAULT 'requested' NOT NULL,
	"requestedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."robaseSmsMessages" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"recipientPhone" varchar(32) NOT NULL,
	"provider" varchar(32) DEFAULT 'robase' NOT NULL,
	"providerMessageId" varchar(128),
	"status" "kkar"."sms_status" DEFAULT 'queued' NOT NULL,
	"providerStatus" "kkar"."sms_provider_status" DEFAULT 'pending' NOT NULL,
	"deliveryErrorCode" varchar(64),
	"sentAt" timestamp,
	"deliveredAt" timestamp,
	"failedAt" timestamp,
	"lastWebhookAt" timestamp,
	"lastWebhookEventAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."robaseWebhookEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventId" varchar(64) NOT NULL,
	"providerMessageId" varchar(128),
	"eventType" varchar(64) NOT NULL,
	"providerEventAt" timestamp NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"receivedAt" timestamp DEFAULT now() NOT NULL,
	"processedAt" timestamp,
	CONSTRAINT "robaseWebhookEvents_eventId_unique" UNIQUE("eventId")
);
--> statement-breakpoint
CREATE TABLE "kkar"."supportTickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"rideId" integer,
	"category" varchar(64) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"status" "kkar"."support_status" DEFAULT 'open' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kkar"."users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"username" varchar(64),
	"passwordHash" varchar(255),
	"mustChangePassword" boolean DEFAULT false NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "kkar"."user_role" DEFAULT 'user' NOT NULL,
	"adminRole" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "kkar"."walletAccounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"walletId" integer NOT NULL,
	"provider" varchar(32) DEFAULT 'monnify' NOT NULL,
	"customerReference" varchar(128) NOT NULL,
	"accountNumber" varchar(32) NOT NULL,
	"accountName" varchar(160) NOT NULL,
	"bankName" varchar(128) NOT NULL,
	"status" "kkar"."wallet_account_status" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "walletAccounts_customerReference_unique" UNIQUE("customerReference"),
	CONSTRAINT "walletAccounts_accountNumber_unique" UNIQUE("accountNumber")
);
--> statement-breakpoint
CREATE TABLE "kkar"."walletTransactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"walletId" integer NOT NULL,
	"type" "kkar"."transaction_type" NOT NULL,
	"amountKobo" integer NOT NULL,
	"balanceAfterKobo" integer,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"reference" varchar(128) NOT NULL,
	"status" "kkar"."transaction_status" DEFAULT 'pending' NOT NULL,
	"description" text,
	"metadata" text,
	"provider" varchar(32),
	"providerReference" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "walletTransactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "kkar"."wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kkar"."adminMessages" ADD CONSTRAINT "adminMessages_fromUserId_users_id_fk" FOREIGN KEY ("fromUserId") REFERENCES "kkar"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."adminMessages" ADD CONSTRAINT "adminMessages_toUserId_users_id_fk" FOREIGN KEY ("toUserId") REFERENCES "kkar"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."adminMessages" ADD CONSTRAINT "adminMessages_parentMessageId_adminMessages_id_fk" FOREIGN KEY ("parentMessageId") REFERENCES "kkar"."adminMessages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."auditLogs" ADD CONSTRAINT "auditLogs_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "kkar"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."driverBankAccounts" ADD CONSTRAINT "driverBankAccounts_driverId_drivers_id_fk" FOREIGN KEY ("driverId") REFERENCES "kkar"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."driverDocuments" ADD CONSTRAINT "driverDocuments_driverId_drivers_id_fk" FOREIGN KEY ("driverId") REFERENCES "kkar"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."driverDocuments" ADD CONSTRAINT "driverDocuments_reviewedBy_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "kkar"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."driverEarnings" ADD CONSTRAINT "driverEarnings_driverId_drivers_id_fk" FOREIGN KEY ("driverId") REFERENCES "kkar"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."driverEarnings" ADD CONSTRAINT "driverEarnings_rideId_rides_id_fk" FOREIGN KEY ("rideId") REFERENCES "kkar"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."driverLocations" ADD CONSTRAINT "driverLocations_driverId_drivers_id_fk" FOREIGN KEY ("driverId") REFERENCES "kkar"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."driverLocations" ADD CONSTRAINT "driverLocations_rideId_rides_id_fk" FOREIGN KEY ("rideId") REFERENCES "kkar"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."driverPayouts" ADD CONSTRAINT "driverPayouts_driverId_drivers_id_fk" FOREIGN KEY ("driverId") REFERENCES "kkar"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."drivers" ADD CONSTRAINT "drivers_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "kkar"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."notifications" ADD CONSTRAINT "notifications_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "kkar"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."notifications" ADD CONSTRAINT "notifications_rideId_rides_id_fk" FOREIGN KEY ("rideId") REFERENCES "kkar"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."payments" ADD CONSTRAINT "payments_rideId_rides_id_fk" FOREIGN KEY ("rideId") REFERENCES "kkar"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."payments" ADD CONSTRAINT "payments_walletTransactionId_walletTransactions_id_fk" FOREIGN KEY ("walletTransactionId") REFERENCES "kkar"."walletTransactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."platformSettings" ADD CONSTRAINT "platformSettings_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "kkar"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."profiles" ADD CONSTRAINT "profiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "kkar"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."ratings" ADD CONSTRAINT "ratings_rideId_rides_id_fk" FOREIGN KEY ("rideId") REFERENCES "kkar"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."ratings" ADD CONSTRAINT "ratings_riderId_users_id_fk" FOREIGN KEY ("riderId") REFERENCES "kkar"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."ratings" ADD CONSTRAINT "ratings_driverId_drivers_id_fk" FOREIGN KEY ("driverId") REFERENCES "kkar"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."rideEvents" ADD CONSTRAINT "rideEvents_rideId_rides_id_fk" FOREIGN KEY ("rideId") REFERENCES "kkar"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."rideEvents" ADD CONSTRAINT "rideEvents_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "kkar"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."rides" ADD CONSTRAINT "rides_riderId_users_id_fk" FOREIGN KEY ("riderId") REFERENCES "kkar"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."rides" ADD CONSTRAINT "rides_driverId_drivers_id_fk" FOREIGN KEY ("driverId") REFERENCES "kkar"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."robaseSmsMessages" ADD CONSTRAINT "robaseSmsMessages_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "kkar"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."supportTickets" ADD CONSTRAINT "supportTickets_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "kkar"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."supportTickets" ADD CONSTRAINT "supportTickets_rideId_rides_id_fk" FOREIGN KEY ("rideId") REFERENCES "kkar"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."walletAccounts" ADD CONSTRAINT "walletAccounts_walletId_wallets_id_fk" FOREIGN KEY ("walletId") REFERENCES "kkar"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."walletTransactions" ADD CONSTRAINT "walletTransactions_walletId_wallets_id_fk" FOREIGN KEY ("walletId") REFERENCES "kkar"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kkar"."wallets" ADD CONSTRAINT "wallets_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "kkar"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_messages_from_user_idx" ON "kkar"."adminMessages" USING btree ("fromUserId");--> statement-breakpoint
CREATE INDEX "admin_messages_to_user_idx" ON "kkar"."adminMessages" USING btree ("toUserId");--> statement-breakpoint
CREATE INDEX "admin_messages_created_idx" ON "kkar"."adminMessages" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "admin_messages_parent_idx" ON "kkar"."adminMessages" USING btree ("parentMessageId");--> statement-breakpoint
CREATE INDEX "driver_bank_accounts_driver_idx" ON "kkar"."driverBankAccounts" USING btree ("driverId");--> statement-breakpoint
CREATE INDEX "driver_documents_driver_idx" ON "kkar"."driverDocuments" USING btree ("driverId");--> statement-breakpoint
CREATE INDEX "driver_earnings_driver_idx" ON "kkar"."driverEarnings" USING btree ("driverId");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_earnings_ride_idx" ON "kkar"."driverEarnings" USING btree ("rideId");--> statement-breakpoint
CREATE INDEX "driver_locations_driver_idx" ON "kkar"."driverLocations" USING btree ("driverId");--> statement-breakpoint
CREATE INDEX "driver_locations_ride_idx" ON "kkar"."driverLocations" USING btree ("rideId");--> statement-breakpoint
CREATE INDEX "driver_locations_created_idx" ON "kkar"."driverLocations" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "driver_payouts_driver_idx" ON "kkar"."driverPayouts" USING btree ("driverId");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_user_idx" ON "kkar"."drivers" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "drivers_status_idx" ON "kkar"."drivers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "drivers_geo_idx" ON "kkar"."drivers" USING btree ("h3Cell");--> statement-breakpoint
CREATE INDEX "drivers_lga_idx" ON "kkar"."drivers" USING btree ("defaultLga");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "kkar"."notifications" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "notifications_ride_idx" ON "kkar"."notifications" USING btree ("rideId");--> statement-breakpoint
CREATE INDEX "payment_webhooks_provider_idx" ON "kkar"."paymentWebhooks" USING btree ("providerReference");--> statement-breakpoint
CREATE INDEX "pricing_rules_area_vehicle_idx" ON "kkar"."pricingRules" USING btree ("serviceArea","vehicleType");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_user_idx" ON "kkar"."profiles" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_ride_idx" ON "kkar"."ratings" USING btree ("rideId");--> statement-breakpoint
CREATE INDEX "ride_events_ride_idx" ON "kkar"."rideEvents" USING btree ("rideId");--> statement-breakpoint
CREATE INDEX "rides_rider_idx" ON "kkar"."rides" USING btree ("riderId");--> statement-breakpoint
CREATE INDEX "rides_driver_idx" ON "kkar"."rides" USING btree ("driverId");--> statement-breakpoint
CREATE INDEX "rides_status_idx" ON "kkar"."rides" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "robase_sms_provider_message_idx" ON "kkar"."robaseSmsMessages" USING btree ("provider","providerMessageId");--> statement-breakpoint
CREATE INDEX "robase_sms_user_idx" ON "kkar"."robaseSmsMessages" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "robase_sms_status_idx" ON "kkar"."robaseSmsMessages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "robase_webhook_message_idx" ON "kkar"."robaseWebhookEvents" USING btree ("providerMessageId");--> statement-breakpoint
CREATE INDEX "robase_webhook_type_idx" ON "kkar"."robaseWebhookEvents" USING btree ("eventType");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_accounts_wallet_idx" ON "kkar"."walletAccounts" USING btree ("walletId");--> statement-breakpoint
CREATE INDEX "wallet_transactions_wallet_idx" ON "kkar"."walletTransactions" USING btree ("walletId");--> statement-breakpoint
CREATE INDEX "wallet_transactions_provider_idx" ON "kkar"."walletTransactions" USING btree ("providerReference");--> statement-breakpoint
CREATE INDEX "wallet_transactions_created_idx" ON "kkar"."walletTransactions" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_user_idx" ON "kkar"."wallets" USING btree ("userId");