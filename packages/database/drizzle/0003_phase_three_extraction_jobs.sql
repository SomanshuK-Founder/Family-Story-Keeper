CREATE TABLE `jobs` (
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
	CONSTRAINT `jobs_type_check` CHECK(`type` = 'extract_answer'),
	CONSTRAINT `jobs_status_check` CHECK(`status` IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT `jobs_attempts_check` CHECK(`attempt_count` >= 0 AND `max_attempts` >= 1),
	CONSTRAINT `jobs_lock_check` CHECK((`status` = 'running' AND `locked_at` IS NOT NULL AND `locked_by` IS NOT NULL) OR `status` <> 'running')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_family_id_id_unique` ON `jobs` (`family_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_deduplication_key_unique` ON `jobs` (`deduplication_key`);
--> statement-breakpoint
CREATE INDEX `jobs_claim_idx` ON `jobs` (`status`,`available_at`,`created_at`);
--> statement-breakpoint
CREATE TABLE `person_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`candidate_person_id` text NOT NULL,
	`answer_id` text NOT NULL,
	`job_id` text NOT NULL,
	`extracted_name` text NOT NULL,
	`confidence` real NOT NULL,
	`status` text NOT NULL,
	`possible_match_person_id` text,
	`match_score` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `person_candidates_family_candidate_person_fk` FOREIGN KEY (`family_id`,`candidate_person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `person_candidates_family_answer_fk` FOREIGN KEY (`family_id`,`answer_id`) REFERENCES `answers`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `person_candidates_family_job_fk` FOREIGN KEY (`family_id`,`job_id`) REFERENCES `jobs`(`family_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `person_candidates_family_possible_match_fk` FOREIGN KEY (`family_id`,`possible_match_person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `person_candidates_name_check` CHECK(length(trim(`extracted_name`)) > 0),
	CONSTRAINT `person_candidates_confidence_check` CHECK(`confidence` >= 0 AND `confidence` <= 1),
	CONSTRAINT `person_candidates_match_score_check` CHECK(`match_score` IS NULL OR (`match_score` >= 0 AND `match_score` <= 1)),
	CONSTRAINT `person_candidates_status_check` CHECK(`status` IN ('unresolved', 'matched', 'dismissed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_candidates_family_id_id_unique` ON `person_candidates` (`family_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_candidates_job_person_unique` ON `person_candidates` (`job_id`,`candidate_person_id`);
--> statement-breakpoint
CREATE TABLE `relationship_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`relationship_id` text NOT NULL,
	`answer_id` text NOT NULL,
	`job_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `relationship_sources_family_relationship_fk` FOREIGN KEY (`family_id`,`relationship_id`) REFERENCES `relationships`(`family_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `relationship_sources_family_answer_fk` FOREIGN KEY (`family_id`,`answer_id`) REFERENCES `answers`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `relationship_sources_family_job_fk` FOREIGN KEY (`family_id`,`job_id`) REFERENCES `jobs`(`family_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `relationship_sources_relationship_answer_unique` ON `relationship_sources` (`family_id`,`relationship_id`,`answer_id`);
--> statement-breakpoint
CREATE TABLE `timeline_event_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`timeline_event_id` text NOT NULL,
	`answer_id` text NOT NULL,
	`job_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `timeline_event_sources_family_event_fk` FOREIGN KEY (`family_id`,`timeline_event_id`) REFERENCES `timeline_events`(`family_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `timeline_event_sources_family_answer_fk` FOREIGN KEY (`family_id`,`answer_id`) REFERENCES `answers`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `timeline_event_sources_family_job_fk` FOREIGN KEY (`family_id`,`job_id`) REFERENCES `jobs`(`family_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timeline_event_sources_event_answer_unique` ON `timeline_event_sources` (`family_id`,`timeline_event_id`,`answer_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `contradictions_fact_pair_unique` ON `contradictions` (`family_id`,`left_fact_id`,`right_fact_id`) WHERE `contradiction_type` = 'fact_value';
--> statement-breakpoint
CREATE UNIQUE INDEX `contradictions_timeline_pair_unique` ON `contradictions` (`family_id`,`left_timeline_event_id`,`right_timeline_event_id`) WHERE `contradiction_type` = 'timeline_date';
