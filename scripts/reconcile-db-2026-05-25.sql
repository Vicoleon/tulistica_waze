-- One-off reconciliation: the DB was migrated by an earlier session that
-- used a different brands schema. Bring it in line with what the merged
-- branch (claude/gallant-chatelet-38ff0b) expects.
--
-- SAFE: only touches brand-related tables. Stores, products, prices, lists,
-- users — all untouched.

USE grocery_waze;

-- 1. Drop brands and any dependent rows from related tables that don't exist yet
DROP TABLE IF EXISTS `invoice_line_items`;
DROP TABLE IF EXISTS `invoices`;
DROP TABLE IF EXISTS `campaign_metrics`;
DROP TABLE IF EXISTS `brand_tokens`;
DROP TABLE IF EXISTS `brands`;

-- 2. Recreate brands with c02ee38's schema
CREATE TABLE `brands` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyName` varchar(255) NOT NULL,
  `email` varchar(320) NOT NULL,
  `passwordHash` varchar(512) NOT NULL,
  `passwordSalt` varchar(128) NOT NULL,
  `emailVerified` boolean DEFAULT false NOT NULL,
  `logoUrl` text,
  `contactName` varchar(255),
  `phone` varchar(32),
  `country` varchar(64),
  `status` enum('active','suspended','pending') DEFAULT 'pending' NOT NULL,
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

CREATE INDEX `idx_brands_email` ON `brands` (`email`);
CREATE INDEX `idx_brands_status` ON `brands` (`status`);

-- 3. brand_tokens
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

CREATE INDEX `idx_brand_tokens_brand` ON `brand_tokens` (`brandId`);
CREATE INDEX `idx_brand_tokens_token` ON `brand_tokens` (`token`);

-- 4. campaign_metrics
CREATE TABLE `campaign_metrics` (
  `id` int AUTO_INCREMENT NOT NULL,
  `campaignId` int NOT NULL,
  `brandId` int,
  `day` varchar(10) NOT NULL,
  `impressions` int DEFAULT 0 NOT NULL,
  `clicks` int DEFAULT 0 NOT NULL,
  `spendCents` int DEFAULT 0 NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `campaign_metrics_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_metrics_campaign_day` ON `campaign_metrics` (`campaignId`, `day`);
CREATE INDEX `idx_metrics_brand_day` ON `campaign_metrics` (`brandId`, `day`);

-- 5. invoices
CREATE TABLE `invoices` (
  `id` int AUTO_INCREMENT NOT NULL,
  `brandId` int NOT NULL,
  `periodMonth` varchar(7) NOT NULL,
  `status` enum('draft','open','paid','uncollectible','void') DEFAULT 'open' NOT NULL,
  `subtotalCents` int DEFAULT 0 NOT NULL,
  `taxCents` int DEFAULT 0 NOT NULL,
  `totalCents` int DEFAULT 0 NOT NULL,
  `currency` varchar(8) DEFAULT 'USD' NOT NULL,
  `issuedAt` timestamp NOT NULL DEFAULT (now()),
  `dueAt` timestamp,
  `paidAt` timestamp,
  `stripeInvoiceId` varchar(64),
  `paymentIntentId` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `invoices_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_invoices_brand` ON `invoices` (`brandId`);
CREATE INDEX `idx_invoices_period` ON `invoices` (`periodMonth`);

-- 6. invoice_line_items
CREATE TABLE `invoice_line_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `invoiceId` int NOT NULL,
  `campaignId` int,
  `description` text NOT NULL,
  `quantity` int DEFAULT 1 NOT NULL,
  `unitPriceCents` int DEFAULT 0 NOT NULL,
  `amountCents` int DEFAULT 0 NOT NULL,
  CONSTRAINT `invoice_line_items_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_line_items_invoice` ON `invoice_line_items` (`invoiceId`);

-- 7. Add the c02ee38 columns missing from ad_campaigns
ALTER TABLE `ad_campaigns` ADD COLUMN `name` varchar(255);
ALTER TABLE `ad_campaigns` ADD COLUMN `status` enum('draft','active','paused','ended') NOT NULL DEFAULT 'draft';
ALTER TABLE `ad_campaigns` ADD COLUMN `dailyBudgetCents` int DEFAULT 0;
ALTER TABLE `ad_campaigns` ADD COLUMN `totalSpentCents` int DEFAULT 0;
ALTER TABLE `ad_campaigns` ADD COLUMN `targetCities` json;

-- 8. Add the redesign's bid-engine v2 columns to ad_campaigns
ALTER TABLE `ad_campaigns` ADD COLUMN `dailyBudget` float;
ALTER TABLE `ad_campaigns` ADD COLUMN `dailySpend` float DEFAULT 0;
ALTER TABLE `ad_campaigns` ADD COLUMN `dailySpendDate` timestamp;
ALTER TABLE `ad_campaigns` ADD COLUMN `maxImpressionsPerUserPerDay` int DEFAULT 5;
