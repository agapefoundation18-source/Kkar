CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int,
	`action` varchar(128) NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`entityId` varchar(64),
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `driverBankAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driverId` int NOT NULL,
	`bankCode` varchar(16) NOT NULL,
	`bankName` varchar(128) NOT NULL,
	`accountNumberLast4` varchar(4) NOT NULL,
	`providerRecipientCode` varchar(128),
	`isPrimary` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `driverBankAccounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `driverDocuments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driverId` int NOT NULL,
	`documentType` varchar(64) NOT NULL,
	`storageKey` text NOT NULL,
	`verificationStatus` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `driverDocuments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `driverEarnings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driverId` int NOT NULL,
	`rideId` int NOT NULL,
	`grossFareKobo` int NOT NULL,
	`platformCommissionKobo` int NOT NULL,
	`driverEarningKobo` int NOT NULL,
	`status` enum('pending','available','paid','reversed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `driverEarnings_id` PRIMARY KEY(`id`),
	CONSTRAINT `driver_earnings_ride_idx` UNIQUE(`rideId`)
);
--> statement-breakpoint
CREATE TABLE `driverPayouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driverId` int NOT NULL,
	`amountKobo` int NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'monnify',
	`providerReference` varchar(128),
	`status` enum('pending','processing','successful','failed','reversed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `driverPayouts_id` PRIMARY KEY(`id`),
	CONSTRAINT `driverPayouts_providerReference_unique` UNIQUE(`providerReference`)
);
--> statement-breakpoint
CREATE TABLE `drivers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','approved','rejected','suspended','offline','online','on_trip') NOT NULL DEFAULT 'pending',
	`vehicleType` enum('bike','car') NOT NULL,
	`vehicleMake` varchar(80),
	`vehicleModel` varchar(80),
	`vehicleColor` varchar(40),
	`plateNumber` varchar(32),
	`rating` int NOT NULL DEFAULT 500,
	`currentLat` double,
	`currentLng` double,
	`h3Cell` varchar(32),
	`lastLocationAt` timestamp,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drivers_id` PRIMARY KEY(`id`),
	CONSTRAINT `drivers_user_idx` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `paymentWebhooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'monnify',
	`providerReference` varchar(128) NOT NULL,
	`signatureValid` boolean NOT NULL,
	`processed` boolean NOT NULL DEFAULT false,
	`payload` text NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paymentWebhooks_id` PRIMARY KEY(`id`),
	CONSTRAINT `paymentWebhooks_providerReference_unique` UNIQUE(`providerReference`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rideId` int,
	`walletTransactionId` int,
	`provider` varchar(32) NOT NULL DEFAULT 'monnify',
	`providerReference` varchar(128) NOT NULL,
	`amountKobo` int NOT NULL,
	`status` enum('pending','successful','failed','reversed') NOT NULL DEFAULT 'pending',
	`idempotencyKey` varchar(128) NOT NULL,
	`rawReference` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_providerReference_unique` UNIQUE(`providerReference`),
	CONSTRAINT `payments_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `pricingRules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serviceArea` varchar(128) NOT NULL DEFAULT 'Oru',
	`vehicleType` enum('bike','car') NOT NULL,
	`baseFareKobo` int NOT NULL,
	`perKmKobo` int NOT NULL,
	`minimumFareKobo` int NOT NULL,
	`commissionBps` int NOT NULL DEFAULT 2000,
	`active` boolean NOT NULL DEFAULT true,
	`effectiveFrom` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pricingRules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`phone` varchar(32),
	`avatarUrl` text,
	`homeArea` varchar(128) DEFAULT 'Oru',
	`preferredVehicle` enum('bike','car'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `profiles_user_idx` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rideId` int NOT NULL,
	`riderId` int NOT NULL,
	`driverId` int NOT NULL,
	`stars` int NOT NULL,
	`review` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ratings_id` PRIMARY KEY(`id`),
	CONSTRAINT `ratings_ride_idx` UNIQUE(`rideId`)
);
--> statement-breakpoint
CREATE TABLE `rideEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rideId` int NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`actorUserId` int,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rideEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`riderId` int NOT NULL,
	`driverId` int,
	`vehicleType` enum('bike','car') NOT NULL,
	`pickupLabel` varchar(255) NOT NULL,
	`destinationLabel` varchar(255) NOT NULL,
	`pickupLat` double,
	`pickupLng` double,
	`destinationLat` double,
	`destinationLng` double,
	`distanceMeters` int,
	`etaSeconds` int,
	`estimatedFareKobo` int NOT NULL,
	`finalFareKobo` int,
	`status` enum('requested','matching','driver_assigned','driver_en_route','driver_arrived','trip_started','trip_completed','payment_processing','completed','cancelled_by_rider','cancelled_by_driver','cancelled_no_driver','payment_failed') NOT NULL DEFAULT 'requested',
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supportTickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`rideId` int,
	`category` varchar(64) NOT NULL,
	`subject` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`status` enum('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supportTickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `walletTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`walletId` int NOT NULL,
	`type` enum('credit','debit','refund','ride_payment') NOT NULL,
	`amountKobo` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'NGN',
	`reference` varchar(128) NOT NULL,
	`status` enum('pending','completed','failed','reversed') NOT NULL DEFAULT 'pending',
	`description` text,
	`provider` varchar(32),
	`providerReference` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `walletTransactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `walletTransactions_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'NGN',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wallets_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallets_user_idx` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `auditLogs` ADD CONSTRAINT `auditLogs_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `driverBankAccounts` ADD CONSTRAINT `driverBankAccounts_driverId_drivers_id_fk` FOREIGN KEY (`driverId`) REFERENCES `drivers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `driverDocuments` ADD CONSTRAINT `driverDocuments_driverId_drivers_id_fk` FOREIGN KEY (`driverId`) REFERENCES `drivers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `driverDocuments` ADD CONSTRAINT `driverDocuments_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `driverEarnings` ADD CONSTRAINT `driverEarnings_driverId_drivers_id_fk` FOREIGN KEY (`driverId`) REFERENCES `drivers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `driverEarnings` ADD CONSTRAINT `driverEarnings_rideId_rides_id_fk` FOREIGN KEY (`rideId`) REFERENCES `rides`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `driverPayouts` ADD CONSTRAINT `driverPayouts_driverId_drivers_id_fk` FOREIGN KEY (`driverId`) REFERENCES `drivers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `drivers` ADD CONSTRAINT `drivers_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_rideId_rides_id_fk` FOREIGN KEY (`rideId`) REFERENCES `rides`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_walletTransactionId_walletTransactions_id_fk` FOREIGN KEY (`walletTransactionId`) REFERENCES `walletTransactions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `profiles` ADD CONSTRAINT `profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ratings` ADD CONSTRAINT `ratings_rideId_rides_id_fk` FOREIGN KEY (`rideId`) REFERENCES `rides`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ratings` ADD CONSTRAINT `ratings_riderId_users_id_fk` FOREIGN KEY (`riderId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ratings` ADD CONSTRAINT `ratings_driverId_drivers_id_fk` FOREIGN KEY (`driverId`) REFERENCES `drivers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rideEvents` ADD CONSTRAINT `rideEvents_rideId_rides_id_fk` FOREIGN KEY (`rideId`) REFERENCES `rides`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rideEvents` ADD CONSTRAINT `rideEvents_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rides` ADD CONSTRAINT `rides_riderId_users_id_fk` FOREIGN KEY (`riderId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rides` ADD CONSTRAINT `rides_driverId_drivers_id_fk` FOREIGN KEY (`driverId`) REFERENCES `drivers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supportTickets` ADD CONSTRAINT `supportTickets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supportTickets` ADD CONSTRAINT `supportTickets_rideId_rides_id_fk` FOREIGN KEY (`rideId`) REFERENCES `rides`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `walletTransactions` ADD CONSTRAINT `walletTransactions_walletId_wallets_id_fk` FOREIGN KEY (`walletId`) REFERENCES `wallets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallets` ADD CONSTRAINT `wallets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `driver_bank_accounts_driver_idx` ON `driverBankAccounts` (`driverId`);--> statement-breakpoint
CREATE INDEX `driver_documents_driver_idx` ON `driverDocuments` (`driverId`);--> statement-breakpoint
CREATE INDEX `driver_earnings_driver_idx` ON `driverEarnings` (`driverId`);--> statement-breakpoint
CREATE INDEX `driver_payouts_driver_idx` ON `driverPayouts` (`driverId`);--> statement-breakpoint
CREATE INDEX `drivers_status_idx` ON `drivers` (`status`);--> statement-breakpoint
CREATE INDEX `drivers_geo_idx` ON `drivers` (`h3Cell`);--> statement-breakpoint
CREATE INDEX `payment_webhooks_provider_idx` ON `paymentWebhooks` (`providerReference`);--> statement-breakpoint
CREATE INDEX `pricing_rules_area_vehicle_idx` ON `pricingRules` (`serviceArea`,`vehicleType`);--> statement-breakpoint
CREATE INDEX `ride_events_ride_idx` ON `rideEvents` (`rideId`);--> statement-breakpoint
CREATE INDEX `rides_rider_idx` ON `rides` (`riderId`);--> statement-breakpoint
CREATE INDEX `rides_driver_idx` ON `rides` (`driverId`);--> statement-breakpoint
CREATE INDEX `rides_status_idx` ON `rides` (`status`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_wallet_idx` ON `walletTransactions` (`walletId`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_provider_idx` ON `walletTransactions` (`providerReference`);