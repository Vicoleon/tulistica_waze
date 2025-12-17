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
CREATE INDEX `idx_places_location` ON `google_places_cache` (`latitude`,`longitude`);--> statement-breakpoint
CREATE INDEX `idx_alerts_user` ON `price_alerts` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_alerts_product` ON `price_alerts` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_alerts_active` ON `price_alerts` (`isActive`);--> statement-breakpoint
CREATE INDEX `idx_crowdedness_store` ON `store_crowdedness` (`storeId`);--> statement-breakpoint
CREATE INDEX `idx_crowdedness_time` ON `store_crowdedness` (`reportedAt`);