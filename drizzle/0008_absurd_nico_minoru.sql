CREATE TABLE `app_settings` (
	`settingKey` varchar(128) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_settingKey` PRIMARY KEY(`settingKey`)
);
