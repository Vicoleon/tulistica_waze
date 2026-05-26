CREATE TABLE `brands` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyName` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(512) NOT NULL,
	`passwordSalt` varchar(128) NOT NULL,
	`emailVerified` boolean NOT NULL DEFAULT false,
	`logoUrl` text,
	`contactName` varchar(255),
	`phone` varchar(32),
	`country` varchar(64),
	`status` enum('active','suspended','pending') NOT NULL DEFAULT 'pending',
	`billingEmail` varchar(320),
	`taxId` varchar(64),
	`paymentMethodLast4` varchar(4),
	`paymentMethodBrand` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp,
	CONSTRAINT `brands_id` PRIMARY KEY(`id`),
	CONSTRAINT `brands_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `idx_brands_email` ON `brands` (`email`);--> statement-breakpoint
CREATE INDEX `idx_brands_status` ON `brands` (`status`);--> statement-breakpoint
CREATE TABLE `brand_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`brandId` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`type` enum('email_verify','password_reset') NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `brand_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `brand_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE INDEX `idx_brand_tokens_brand` ON `brand_tokens` (`brandId`);--> statement-breakpoint
CREATE INDEX `idx_brand_tokens_token` ON `brand_tokens` (`token`);--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `brandId` int;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `name` varchar(255);--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `status` enum('draft','active','paused','ended') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `dailyBudgetCents` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `totalSpentCents` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `targetCities` json;--> statement-breakpoint
CREATE INDEX `idx_campaigns_brand` ON `ad_campaigns` (`brandId`);--> statement-breakpoint
CREATE INDEX `idx_campaigns_status` ON `ad_campaigns` (`status`);--> statement-breakpoint
CREATE TABLE `campaign_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`brandId` int,
	`day` varchar(10) NOT NULL,
	`impressions` int NOT NULL DEFAULT 0,
	`clicks` int NOT NULL DEFAULT 0,
	`spendCents` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaign_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_metrics_campaign_day` ON `campaign_metrics` (`campaignId`,`day`);--> statement-breakpoint
CREATE INDEX `idx_metrics_brand_day` ON `campaign_metrics` (`brandId`,`day`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`brandId` int NOT NULL,
	`periodMonth` varchar(7) NOT NULL,
	`status` enum('draft','open','paid','uncollectible','void') NOT NULL DEFAULT 'open',
	`subtotalCents` int NOT NULL DEFAULT 0,
	`taxCents` int NOT NULL DEFAULT 0,
	`totalCents` int NOT NULL DEFAULT 0,
	`currency` varchar(8) NOT NULL DEFAULT 'USD',
	`issuedAt` timestamp NOT NULL DEFAULT (now()),
	`dueAt` timestamp,
	`paidAt` timestamp,
	`paymentProviderId` varchar(128),
	`paymentProvider` varchar(64),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_invoices_brand_period` ON `invoices` (`brandId`,`periodMonth`);--> statement-breakpoint
CREATE INDEX `idx_invoices_status` ON `invoices` (`status`);--> statement-breakpoint
CREATE TABLE `invoice_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`campaignId` int,
	`description` varchar(512) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unitPriceCents` int NOT NULL DEFAULT 0,
	`amountCents` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_lineitems_invoice` ON `invoice_line_items` (`invoiceId`);
