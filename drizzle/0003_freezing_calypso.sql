ALTER TABLE `list_items` ADD `priceAtChecked` float;--> statement-breakpoint
ALTER TABLE `list_items` ADD `priceChainId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `lastPriceReportAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `currentStreak` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_price_user_created` ON `price_entries` (`userId`,`createdAt`);