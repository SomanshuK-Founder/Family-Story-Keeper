CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`actor_person_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `approvals_family_actor_fk` FOREIGN KEY (`family_id`,`actor_person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `approvals_target_type_check` CHECK(`target_type` IN ('fact', 'relationship', 'timeline_event')),
	CONSTRAINT `approvals_action_check` CHECK(`action` IN ('approve', 'reject', 'revoke'))
);
--> statement-breakpoint
CREATE INDEX `approvals_family_target_idx` ON `approvals` (`family_id`,`target_type`,`target_id`);
--> statement-breakpoint
CREATE TABLE `consent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`person_id` text NOT NULL,
	`event_type` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `consent_events_family_person_fk` FOREIGN KEY (`family_id`,`person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `consent_events_type_check` CHECK(`event_type` IN ('story_item_approved', 'story_item_rejected', 'story_item_revoked', 'pending_memory_deleted')),
	CONSTRAINT `consent_events_target_type_check` CHECK(`target_type` IN ('fact', 'relationship', 'timeline_event'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consent_events_person_event_target_unique` ON `consent_events` (`family_id`,`person_id`,`event_type`,`target_type`,`target_id`);
--> statement-breakpoint
CREATE INDEX `consent_events_family_target_idx` ON `consent_events` (`family_id`,`target_type`,`target_id`);
