CREATE TABLE `driverLocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driverId` int NOT NULL,
	`rideId` int,
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`accuracyM` double,
	`speedKph` double,
	`heading` double,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `driverLocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`rideId` int,
	`type` varchar(64) NOT NULL,
	`title` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`data` text,
	`readAt` timestamp,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platformSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(96) NOT NULL,
	`numericValue` int,
	`textValue` text,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platformSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `platformSettings_settingKey_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `walletAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`walletId` int NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'monnify',
	`customerReference` varchar(128) NOT NULL,
	`accountNumber` varchar(32) NOT NULL,
	`accountName` varchar(160) NOT NULL,
	`bankName` varchar(128) NOT NULL,
	`status` enum('pending','active','suspended') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `walletAccounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `walletAccounts_customerReference_unique` UNIQUE(`customerReference`),
	CONSTRAINT `walletAccounts_accountNumber_unique` UNIQUE(`accountNumber`),
	CONSTRAINT `wallet_accounts_wallet_idx` UNIQUE(`walletId`)
);
--> statement-breakpoint
ALTER TABLE `pricingRules` MODIFY COLUMN `serviceArea` varchar(128) NOT NULL DEFAULT 'Akwa Ibom';--> statement-breakpoint
ALTER TABLE `profiles` MODIFY COLUMN `homeArea` varchar(128) NOT NULL DEFAULT 'Akwa Ibom';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','super_admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `driverDocuments` ADD `originalFileName` varchar(255);--> statement-breakpoint
ALTER TABLE `driverDocuments` ADD `mimeType` varchar(128);--> statement-breakpoint
ALTER TABLE `driverDocuments` ADD `rejectionReason` text;--> statement-breakpoint
ALTER TABLE `driverDocuments` ADD `expiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `driverEarnings` ADD `commissionBps` int NOT NULL;--> statement-breakpoint
ALTER TABLE `drivers` ADD `defaultLga` varchar(80) DEFAULT 'Uyo' NOT NULL;--> statement-breakpoint
ALTER TABLE `drivers` ADD `currentAccuracyM` double;--> statement-breakpoint
ALTER TABLE `drivers` ADD `currentHeading` double;--> statement-breakpoint
ALTER TABLE `rideEvents` ADD `fromStatus` varchar(48);--> statement-breakpoint
ALTER TABLE `rideEvents` ADD `toStatus` varchar(48);--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `mustChangePassword` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `walletTransactions` ADD `balanceAfterKobo` int;--> statement-breakpoint
ALTER TABLE `walletTransactions` ADD `metadata` text;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);--> statement-breakpoint
ALTER TABLE `driverLocations` ADD CONSTRAINT `driverLocations_driverId_drivers_id_fk` FOREIGN KEY (`driverId`) REFERENCES `drivers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `driverLocations` ADD CONSTRAINT `driverLocations_rideId_rides_id_fk` FOREIGN KEY (`rideId`) REFERENCES `rides`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_rideId_rides_id_fk` FOREIGN KEY (`rideId`) REFERENCES `rides`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platformSettings` ADD CONSTRAINT `platformSettings_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `walletAccounts` ADD CONSTRAINT `walletAccounts_walletId_wallets_id_fk` FOREIGN KEY (`walletId`) REFERENCES `wallets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `driver_locations_driver_idx` ON `driverLocations` (`driverId`);--> statement-breakpoint
CREATE INDEX `driver_locations_ride_idx` ON `driverLocations` (`rideId`);--> statement-breakpoint
CREATE INDEX `driver_locations_created_idx` ON `driverLocations` (`createdAt`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`userId`);--> statement-breakpoint
CREATE INDEX `notifications_ride_idx` ON `notifications` (`rideId`);--> statement-breakpoint
CREATE INDEX `drivers_lga_idx` ON `drivers` (`defaultLga`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_created_idx` ON `walletTransactions` (`createdAt`);