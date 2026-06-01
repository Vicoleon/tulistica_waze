CREATE TABLE `achievements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`iconUrl` text,
	`pointsRequired` int DEFAULT 0,
	`reportsRequired` int DEFAULT 0,
	`badgeType` enum('bronze','silver','gold','platinum') DEFAULT 'bronze',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `achievements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ad_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`brandId` int,
	`sponsor` varchar(128),
	`productId` int,
	`name` varchar(255),
	`type` enum('sponsored_search','banner','cart_suggestion','dashboard_promo','recipe_sponsored') NOT NULL,
	`status` enum('draft','active','paused','ended') NOT NULL DEFAULT 'draft',
	`title` varchar(255),
	`description` text,
	`imageUrl` text,
	`targetUrl` text,
	`bidCpc` float DEFAULT 0,
	`dailyBudgetCents` int DEFAULT 0,
	`totalSpentCents` int DEFAULT 0,
	`targetKeywords` json,
	`targetCategories` json,
	`triggerCategories` json,
	`targetCities` json,
	`targetTiers` json,
	`targetChains` json,
	`targetBasketMix` json,
	`targetCadences` json,
	`targetMinHouseholdSize` varchar(8),
	`activeFrom` timestamp,
	`activeUntil` timestamp,
	`isActive` boolean DEFAULT true,
	`impressions` int DEFAULT 0,
	`clicks` int DEFAULT 0,
	`dailyBudget` float,
	`dailySpend` float DEFAULT 0,
	`dailySpendDate` timestamp,
	`maxImpressionsPerUserPerDay` int DEFAULT 5,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ad_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analytics_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`sessionId` varchar(64),
	`eventName` varchar(64) NOT NULL,
	`properties` json,
	`tier` varchar(16),
	`cadence` varchar(16),
	`householdSize` varchar(8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`settingKey` varchar(128) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_settingKey` PRIMARY KEY(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `brand_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`brandId` int NOT NULL,
	`userId` int NOT NULL,
	`membershipRole` enum('owner','admin','staff') NOT NULL DEFAULT 'staff',
	`invitedByUserId` int,
	`invitedAt` timestamp,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `brand_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
	`kind` enum('advertiser','vendor') NOT NULL DEFAULT 'advertiser',
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
CREATE TABLE `google_places_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`placeId` varchar(255) NOT NULL,
	`storeId` int,
	`name` varchar(255) NOT NULL,
	`address` text,
	`latitude` float NOT NULL,
	`longitude` float NOT NULL,
	`rating` float,
	`userRatingsTotal` int,
	`priceLevel` int,
	`types` json,
	`phone` varchar(32),
	`website` text,
	`openNow` boolean,
	`lastFetchedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `google_places_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `google_places_cache_placeId_unique` UNIQUE(`placeId`)
);
--> statement-breakpoint
CREATE TABLE `integration_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`integration` varchar(64) NOT NULL,
	`label` varchar(128),
	`ciphertext` text NOT NULL,
	`lastVerifiedAt` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integration_credentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
CREATE TABLE `leaderboard` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`period` enum('weekly','monthly','alltime') NOT NULL,
	`periodStart` timestamp,
	`points` int DEFAULT 0,
	`rank` int,
	`priceReports` int DEFAULT 0,
	`verifiedReports` int DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leaderboard_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `list_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listId` int NOT NULL,
	`productId` int,
	`customName` varchar(255),
	`quantity` int DEFAULT 1,
	`unit` varchar(32),
	`isChecked` boolean DEFAULT false,
	`checkedByUserId` int,
	`checkedAt` timestamp,
	`addedByUserId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `list_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `list_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listId` int NOT NULL,
	`userId` int NOT NULL,
	`canEdit` boolean DEFAULT true,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `list_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pantry_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productId` int,
	`customName` varchar(255),
	`quantity` int DEFAULT 1,
	`lastPurchasedAt` timestamp,
	`avgDaysBetweenPurchases` float,
	`purchaseCount` int DEFAULT 0,
	`notifyWhenLow` boolean DEFAULT true,
	`lowThreshold` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pantry_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productId` int NOT NULL,
	`targetPrice` float NOT NULL,
	`currentLowestPrice` float,
	`currentLowestStoreId` int,
	`isActive` boolean DEFAULT true,
	`lastNotifiedAt` timestamp,
	`notificationCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `price_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`productId` int NOT NULL,
	`userId` int NOT NULL,
	`price` float NOT NULL,
	`isVerified` boolean DEFAULT false,
	`isOutlier` boolean DEFAULT false,
	`voteCount` int DEFAULT 0,
	`confirmationCount` int DEFAULT 0,
	`submittedLatitude` float,
	`submittedLongitude` float,
	`withinGeofence` boolean DEFAULT false,
	`zScore` float,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `price_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`productId` int NOT NULL,
	`price` float NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_votes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`priceEntryId` int NOT NULL,
	`userId` int NOT NULL,
	`voteType` enum('confirm','dispute') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_votes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barcode` varchar(64),
	`name` varchar(255) NOT NULL,
	`brand` varchar(128),
	`category` varchar(128),
	`subcategory` varchar(128),
	`description` text,
	`imageUrl` text,
	`unit` varchar(32),
	`unitSize` float,
	`isSponsored` boolean DEFAULT false,
	`sponsoredBid` float DEFAULT 0,
	`searchKeywords` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_barcode_unique` UNIQUE(`barcode`)
);
--> statement-breakpoint
CREATE TABLE `purchase_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productId` int,
	`customName` varchar(255),
	`storeId` int,
	`price` float,
	`quantity` int DEFAULT 1,
	`purchasedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saved_recipes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`sourceUrl` text,
	`ingredients` json,
	`steps` json,
	`servings` int,
	`prepTimeMinutes` int,
	`description` text,
	`imageUrl` text,
	`isAiGenerated` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saved_recipes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shopping_lists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`ownerId` int NOT NULL,
	`isShared` boolean DEFAULT false,
	`shareCode` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shopping_lists_id` PRIMARY KEY(`id`),
	CONSTRAINT `shopping_lists_shareCode_unique` UNIQUE(`shareCode`)
);
--> statement-breakpoint
CREATE TABLE `store_crowdedness` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`userId` int,
	`crowdednessLevel` int NOT NULL,
	`reportSource` enum('user','google','estimated') DEFAULT 'user',
	`waitTimeMinutes` int,
	`comment` text,
	`reportedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `store_crowdedness_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`chainId` varchar(64),
	`address` text,
	`city` varchar(128),
	`state` varchar(64),
	`zipCode` varchar(20),
	`latitude` float NOT NULL,
	`longitude` float NOT NULL,
	`phone` varchar(32),
	`hours` json,
	`imageUrl` text,
	`avgRating` float DEFAULT 0,
	`totalRatings` int DEFAULT 0,
	`isActive` boolean DEFAULT true,
	`brandId` int,
	`placeId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_stores_placeId` UNIQUE(`placeId`)
);
--> statement-breakpoint
CREATE TABLE `user_achievements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`achievementId` int NOT NULL,
	`earnedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_achievements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`type` enum('email_verify','password_reset') NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`passwordHash` varchar(255),
	`loginMethod` varchar(64),
	`role` enum('consumer','vendor_staff','vendor_admin','super_admin') NOT NULL DEFAULT 'consumer',
	`emailVerified` boolean NOT NULL DEFAULT false,
	`emailVerifiedAt` timestamp,
	`trustScore` int NOT NULL DEFAULT 10,
	`totalPoints` int NOT NULL DEFAULT 0,
	`priceReportsCount` int NOT NULL DEFAULT 0,
	`verifiedReportsCount` int NOT NULL DEFAULT 0,
	`homeLatitude` float,
	`homeLongitude` float,
	`workLatitude` float,
	`workLongitude` float,
	`defaultRadiusKm` float DEFAULT 10,
	`fuelCostPerKm` float DEFAULT 250,
	`timeValuePerHour` float DEFAULT 3000,
	`preferences` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE INDEX `idx_campaigns_brand` ON `ad_campaigns` (`brandId`);--> statement-breakpoint
CREATE INDEX `idx_campaigns_status` ON `ad_campaigns` (`status`);--> statement-breakpoint
CREATE INDEX `idx_analytics_event_time` ON `analytics_events` (`eventName`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_analytics_user_time` ON `analytics_events` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_analytics_tier_time` ON `analytics_events` (`tier`,`createdAt`);--> statement-breakpoint
CREATE INDEX `uniq_brand_user` ON `brand_members` (`brandId`,`userId`);--> statement-breakpoint
CREATE INDEX `idx_brand_members_user` ON `brand_members` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_brand_tokens_brand` ON `brand_tokens` (`brandId`);--> statement-breakpoint
CREATE INDEX `idx_brand_tokens_token` ON `brand_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_brands_email` ON `brands` (`email`);--> statement-breakpoint
CREATE INDEX `idx_brands_status` ON `brands` (`status`);--> statement-breakpoint
CREATE INDEX `idx_metrics_campaign_day` ON `campaign_metrics` (`campaignId`,`day`);--> statement-breakpoint
CREATE INDEX `idx_metrics_brand_day` ON `campaign_metrics` (`brandId`,`day`);--> statement-breakpoint
CREATE INDEX `idx_places_location` ON `google_places_cache` (`latitude`,`longitude`);--> statement-breakpoint
CREATE INDEX `idx_creds_user_integration` ON `integration_credentials` (`userId`,`integration`);--> statement-breakpoint
CREATE INDEX `idx_lineitems_invoice` ON `invoice_line_items` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `idx_invoices_brand_period` ON `invoices` (`brandId`,`periodMonth`);--> statement-breakpoint
CREATE INDEX `idx_invoices_status` ON `invoices` (`status`);--> statement-breakpoint
CREATE INDEX `idx_leaderboard_period` ON `leaderboard` (`period`,`rank`);--> statement-breakpoint
CREATE INDEX `idx_items_list` ON `list_items` (`listId`);--> statement-breakpoint
CREATE INDEX `idx_members_list` ON `list_members` (`listId`);--> statement-breakpoint
CREATE INDEX `idx_members_user` ON `list_members` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_pantry_user` ON `pantry_items` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_alerts_user` ON `price_alerts` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_alerts_product` ON `price_alerts` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_alerts_active` ON `price_alerts` (`isActive`);--> statement-breakpoint
CREATE INDEX `idx_price_store_product` ON `price_entries` (`storeId`,`productId`);--> statement-breakpoint
CREATE INDEX `idx_price_product` ON `price_entries` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_price_created` ON `price_entries` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_history_store_product` ON `price_history` (`storeId`,`productId`);--> statement-breakpoint
CREATE INDEX `idx_votes_entry` ON `price_votes` (`priceEntryId`);--> statement-breakpoint
CREATE INDEX `idx_products_barcode` ON `products` (`barcode`);--> statement-breakpoint
CREATE INDEX `idx_products_category` ON `products` (`category`);--> statement-breakpoint
CREATE INDEX `idx_purchase_user` ON `purchase_history` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_purchase_product` ON `purchase_history` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_recipes_user` ON `saved_recipes` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_crowdedness_store` ON `store_crowdedness` (`storeId`);--> statement-breakpoint
CREATE INDEX `idx_crowdedness_time` ON `store_crowdedness` (`reportedAt`);--> statement-breakpoint
CREATE INDEX `idx_stores_location` ON `stores` (`latitude`,`longitude`);--> statement-breakpoint
CREATE INDEX `idx_stores_chain` ON `stores` (`chainId`);--> statement-breakpoint
CREATE INDEX `idx_stores_brand` ON `stores` (`brandId`);--> statement-breakpoint
CREATE INDEX `idx_user_achievements` ON `user_achievements` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_user_tokens_user` ON `user_tokens` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_user_tokens_token` ON `user_tokens` (`token`);