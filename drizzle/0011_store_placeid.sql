-- Hand-written migration: add Google Places `placeId` to `stores` so discovered
-- physical branches can be persisted idempotently (one row per placeId).
-- Applied manually to the Docker DB (the drizzle journal/snapshot chain is out of
-- sync after the bold-allen/main merge; the DB is the source of truth here).
ALTER TABLE `stores` ADD `placeId` varchar(255);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stores_placeId` ON `stores` (`placeId`);
