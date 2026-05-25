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
CREATE INDEX `idx_creds_user_integration` ON `integration_credentials` (`userId`,`integration`);