CREATE TABLE `__new_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`deduplication_key` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer NOT NULL,
	`available_at` integer NOT NULL,
	`locked_at` integer,
	`locked_by` text,
	`completed_at` integer,
	`last_error_code` text,
	`last_error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `jobs_type_check` CHECK(`type` IN ('extract_answer', 'draft_chapter')),
	CONSTRAINT `jobs_status_check` CHECK(`status` IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT `jobs_attempts_check` CHECK(`attempt_count` >= 0 AND `max_attempts` >= 1),
	CONSTRAINT `jobs_lock_check` CHECK((`status` = 'running' AND `locked_at` IS NOT NULL AND `locked_by` IS NOT NULL) OR `status` <> 'running')
);
--> statement-breakpoint
INSERT INTO `__new_jobs` (`id`, `family_id`, `type`, `payload`, `deduplication_key`, `status`, `attempt_count`, `max_attempts`, `available_at`, `locked_at`, `locked_by`, `completed_at`, `last_error_code`, `last_error_message`, `created_at`, `updated_at`)
SELECT `id`, `family_id`, `type`, `payload`, `deduplication_key`, `status`, `attempt_count`, `max_attempts`, `available_at`, `locked_at`, `locked_by`, `completed_at`, `last_error_code`, `last_error_message`, `created_at`, `updated_at` FROM `jobs`;
--> statement-breakpoint
DROP TABLE `jobs`;
--> statement-breakpoint
ALTER TABLE `__new_jobs` RENAME TO `jobs`;
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_family_id_id_unique` ON `jobs` (`family_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_deduplication_key_unique` ON `jobs` (`deduplication_key`);
--> statement-breakpoint
CREATE INDEX `jobs_claim_idx` ON `jobs` (`status`,`available_at`,`created_at`);
--> statement-breakpoint
CREATE TABLE `chapter_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`narrator_person_id` text NOT NULL,
	`requested_topic` text NOT NULL,
	`title` text,
	`body` text,
	`status` text NOT NULL,
	`generation_job_id` text NOT NULL,
	`reviewed_by_person_id` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `chapter_drafts_family_narrator_fk` FOREIGN KEY (`family_id`,`narrator_person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `chapter_drafts_family_job_fk` FOREIGN KEY (`family_id`,`generation_job_id`) REFERENCES `jobs`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `chapter_drafts_family_reviewer_fk` FOREIGN KEY (`family_id`,`reviewed_by_person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `chapter_drafts_topic_check` CHECK(length(trim(`requested_topic`)) > 0 AND length(`requested_topic`) <= 200),
	CONSTRAINT `chapter_drafts_status_check` CHECK(`status` IN ('generating', 'pending_review', 'approved', 'rejected', 'failed', 'superseded')),
	CONSTRAINT `chapter_drafts_content_check` CHECK((
		`status` IN ('generating', 'failed') AND `title` IS NULL AND `body` IS NULL AND `reviewed_by_person_id` IS NULL AND `reviewed_at` IS NULL
	) OR (
		`status` = 'pending_review' AND length(trim(`title`)) BETWEEN 1 AND 200 AND length(trim(`body`)) BETWEEN 1 AND 10000 AND `reviewed_by_person_id` IS NULL AND `reviewed_at` IS NULL
	) OR (
		`status` IN ('approved', 'rejected') AND length(trim(`title`)) BETWEEN 1 AND 200 AND length(trim(`body`)) BETWEEN 1 AND 10000 AND `reviewed_by_person_id` IS NOT NULL AND `reviewed_at` IS NOT NULL
	) OR (
		`status` = 'superseded' AND length(trim(`title`)) BETWEEN 1 AND 200 AND length(trim(`body`)) BETWEEN 1 AND 10000
	))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_drafts_family_id_id_unique` ON `chapter_drafts` (`family_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_drafts_generation_job_unique` ON `chapter_drafts` (`generation_job_id`);
--> statement-breakpoint
CREATE INDEX `chapter_drafts_family_narrator_status_idx` ON `chapter_drafts` (`family_id`,`narrator_person_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `chapter_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`chapter_draft_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_label` text NOT NULL,
	`source_summary` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `chapter_sources_family_draft_fk` FOREIGN KEY (`family_id`,`chapter_draft_id`) REFERENCES `chapter_drafts`(`family_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `chapter_sources_type_check` CHECK(`source_type` IN ('fact', 'relationship', 'timeline_event')),
	CONSTRAINT `chapter_sources_label_check` CHECK(length(trim(`source_label`)) > 0 AND length(`source_label`) <= 300),
	CONSTRAINT `chapter_sources_summary_check` CHECK(length(trim(`source_summary`)) > 0 AND length(`source_summary`) <= 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_sources_family_id_id_unique` ON `chapter_sources` (`family_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_sources_draft_source_unique` ON `chapter_sources` (`family_id`,`chapter_draft_id`,`source_type`,`source_id`);
--> statement-breakpoint
CREATE INDEX `chapter_sources_family_draft_idx` ON `chapter_sources` (`family_id`,`chapter_draft_id`);
--> statement-breakpoint
CREATE TABLE `__new_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`actor_person_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `approvals_family_actor_fk` FOREIGN KEY (`family_id`,`actor_person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `approvals_target_type_check` CHECK(`target_type` IN ('fact', 'relationship', 'timeline_event', 'chapter')),
	CONSTRAINT `approvals_action_check` CHECK(`action` IN ('approve', 'reject', 'revoke'))
);
--> statement-breakpoint
INSERT INTO `__new_approvals` (`id`, `family_id`, `actor_person_id`, `target_type`, `target_id`, `action`, `created_at`)
SELECT `id`, `family_id`, `actor_person_id`, `target_type`, `target_id`, `action`, `created_at` FROM `approvals`;
--> statement-breakpoint
DROP TABLE `approvals`;
--> statement-breakpoint
ALTER TABLE `__new_approvals` RENAME TO `approvals`;
--> statement-breakpoint
CREATE INDEX `approvals_family_target_idx` ON `approvals` (`family_id`,`target_type`,`target_id`);
--> statement-breakpoint
CREATE TABLE `__new_consent_events` (
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
	CONSTRAINT `consent_events_target_type_check` CHECK(`target_type` IN ('fact', 'relationship', 'timeline_event', 'chapter'))
);
--> statement-breakpoint
INSERT INTO `__new_consent_events` (`id`, `family_id`, `person_id`, `event_type`, `target_type`, `target_id`, `created_at`)
SELECT `id`, `family_id`, `person_id`, `event_type`, `target_type`, `target_id`, `created_at` FROM `consent_events`;
--> statement-breakpoint
DROP TABLE `consent_events`;
--> statement-breakpoint
ALTER TABLE `__new_consent_events` RENAME TO `consent_events`;
--> statement-breakpoint
CREATE UNIQUE INDEX `consent_events_person_event_target_unique` ON `consent_events` (`family_id`,`person_id`,`event_type`,`target_type`,`target_id`);
--> statement-breakpoint
CREATE INDEX `consent_events_family_target_idx` ON `consent_events` (`family_id`,`target_type`,`target_id`);
