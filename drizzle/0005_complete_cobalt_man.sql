ALTER TABLE `saved_recipes` ADD `steps` json;--> statement-breakpoint
ALTER TABLE `saved_recipes` ADD `prepTimeMinutes` int;--> statement-breakpoint
ALTER TABLE `saved_recipes` ADD `description` text;--> statement-breakpoint
ALTER TABLE `saved_recipes` ADD `isAiGenerated` boolean DEFAULT false;