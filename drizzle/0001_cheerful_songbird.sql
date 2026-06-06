CREATE TABLE `points_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`points` int NOT NULL,
	`reason` enum('price_report','price_vote','new_product','achievement','streak_bonus','other') NOT NULL,
	`refType` varchar(32),
	`refId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `points_ledger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `createdByUserId` int;--> statement-breakpoint
CREATE INDEX `idx_points_ledger_user` ON `points_ledger` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_points_ledger_user_created` ON `points_ledger` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_points_ledger_created` ON `points_ledger` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_products_creator` ON `products` (`createdByUserId`);