CREATE TABLE `robaseSmsMessages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int,
  `recipientPhone` varchar(32) NOT NULL,
  `provider` varchar(32) NOT NULL DEFAULT 'robase',
  `providerMessageId` varchar(128),
  `status` enum('queued','sending','sent','delivered','failed','rejected','expired','unknown') NOT NULL DEFAULT 'queued',
  `providerStatus` enum('pending','sent','delivered','failed','blocked','unknown') NOT NULL DEFAULT 'pending',
  `deliveryErrorCode` varchar(64),
  `sentAt` timestamp,
  `deliveredAt` timestamp,
  `failedAt` timestamp,
  `lastWebhookAt` timestamp,
  `lastWebhookEventAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `robaseSmsMessages_id` PRIMARY KEY(`id`),
  CONSTRAINT `robaseSmsMessages_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
);--> statement-breakpoint
CREATE UNIQUE INDEX `robase_sms_provider_message_idx` ON `robaseSmsMessages` (`provider`,`providerMessageId`);
--> statement-breakpoint
CREATE INDEX `robase_sms_user_idx` ON `robaseSmsMessages` (`userId`);
--> statement-breakpoint
CREATE INDEX `robase_sms_status_idx` ON `robaseSmsMessages` (`status`);
--> statement-breakpoint
CREATE TABLE `robaseWebhookEvents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventId` varchar(64) NOT NULL,
  `providerMessageId` varchar(128),
  `eventType` varchar(64) NOT NULL,
  `providerEventAt` timestamp NOT NULL,
  `processed` boolean NOT NULL DEFAULT false,
  `receivedAt` timestamp NOT NULL DEFAULT (now()),
  `processedAt` timestamp,
  CONSTRAINT `robaseWebhookEvents_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `robaseWebhookEvents_eventId_unique` ON `robaseWebhookEvents` (`eventId`);
--> statement-breakpoint
CREATE INDEX `robase_webhook_message_idx` ON `robaseWebhookEvents` (`providerMessageId`);
--> statement-breakpoint
CREATE INDEX `robase_webhook_type_idx` ON `robaseWebhookEvents` (`eventType`);
