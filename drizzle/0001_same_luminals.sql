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
	`productId` int,
	`type` enum('sponsored_search','banner','cart_suggestion') NOT NULL,
	`title` varchar(255),
	`description` text,
	`imageUrl` text,
	`targetUrl` text,
	`bidCpc` float DEFAULT 0,
	`targetKeywords` json,
	`targetCategories` json,
	`triggerCategories` json,
	`activeFrom` timestamp,
	`activeUntil` timestamp,
	`isActive` boolean DEFAULT true,
	`impressions` int DEFAULT 0,
	`clicks` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ad_campaigns_id` PRIMARY KEY(`id`)
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
	`servings` int,
	`imageUrl` text,
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
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stores_id` PRIMARY KEY(`id`)
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
ALTER TABLE `users` ADD `trustScore` int DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `totalPoints` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `priceReportsCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `verifiedReportsCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `homeLatitude` float;--> statement-breakpoint
ALTER TABLE `users` ADD `homeLongitude` float;--> statement-breakpoint
ALTER TABLE `users` ADD `defaultRadiusKm` float DEFAULT 10;--> statement-breakpoint
ALTER TABLE `users` ADD `fuelCostPerKm` float DEFAULT 0.15;--> statement-breakpoint
ALTER TABLE `users` ADD `timeValuePerHour` float DEFAULT 15;--> statement-breakpoint
ALTER TABLE `users` ADD `preferences` json;--> statement-breakpoint
CREATE INDEX `idx_leaderboard_period` ON `leaderboard` (`period`,`rank`);--> statement-breakpoint
CREATE INDEX `idx_items_list` ON `list_items` (`listId`);--> statement-breakpoint
CREATE INDEX `idx_members_list` ON `list_members` (`listId`);--> statement-breakpoint
CREATE INDEX `idx_members_user` ON `list_members` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_pantry_user` ON `pantry_items` (`userId`);--> statement-breakpoint
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
CREATE INDEX `idx_stores_location` ON `stores` (`latitude`,`longitude`);--> statement-breakpoint
CREATE INDEX `idx_stores_chain` ON `stores` (`chainId`);--> statement-breakpoint
CREATE INDEX `idx_user_achievements` ON `user_achievements` (`userId`);