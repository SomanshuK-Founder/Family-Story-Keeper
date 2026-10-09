PRAGMA defer_foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE `__new_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`interview_session_id` text NOT NULL,
	`type` text NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`source_reference_id` text,
	`status` text NOT NULL,
	`asked_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `questions_family_interview_fk` FOREIGN KEY (`family_id`,`interview_session_id`) REFERENCES `interview_sessions`(`family_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `questions_type_check` CHECK(`type` IN ('phase_one_prompt', 'contradiction_clarification', 'person_clarification', 'memory_follow_up')),
	CONSTRAINT `questions_source_check` CHECK(`source` IN ('planner', 'contradiction', 'clarification', 'follow_up')),
	CONSTRAINT `questions_status_check` CHECK(`status` IN ('asked', 'answered', 'superseded'))
);
--> statement-breakpoint
INSERT INTO `__new_questions` (`id`, `family_id`, `interview_session_id`, `type`, `text`, `source`, `source_reference_id`, `status`, `asked_at`, `created_at`)
SELECT `id`, `family_id`, `interview_session_id`, `type`, `text`, `source`, `source_reference_id`, `status`, `asked_at`, `created_at` FROM `questions`;
--> statement-breakpoint
DROP TABLE `questions`;
--> statement-breakpoint
ALTER TABLE `__new_questions` RENAME TO `questions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_family_interview_id_unique` ON `questions` (`family_id`,`interview_session_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_interview_source_reference_unique` ON `questions` (`interview_session_id`,`source_reference_id`);
--> statement-breakpoint
CREATE INDEX `questions_family_interview_idx` ON `questions` (`family_id`,`interview_session_id`);
--> statement-breakpoint
CREATE TABLE `__new_contradictions` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`contradiction_type` text NOT NULL,
	`left_fact_id` text,
	`right_fact_id` text,
	`left_timeline_event_id` text,
	`right_timeline_event_id` text,
	`status` text DEFAULT 'unresolved' NOT NULL,
	`resolution_type` text,
	`resolution_note` text,
	`resolved_by_person_id` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `contradictions_family_resolver_fk` FOREIGN KEY (`family_id`,`resolved_by_person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `contradictions_family_left_fact_fk` FOREIGN KEY (`family_id`,`left_fact_id`) REFERENCES `facts`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `contradictions_family_right_fact_fk` FOREIGN KEY (`family_id`,`right_fact_id`) REFERENCES `facts`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `contradictions_family_left_timeline_event_fk` FOREIGN KEY (`family_id`,`left_timeline_event_id`) REFERENCES `timeline_events`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `contradictions_family_right_timeline_event_fk` FOREIGN KEY (`family_id`,`right_timeline_event_id`) REFERENCES `timeline_events`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `contradictions_type_check` CHECK(`contradiction_type` IN ('fact_value', 'timeline_date')),
	CONSTRAINT `contradictions_references_check` CHECK((
        `contradiction_type` = 'fact_value'
        AND `left_fact_id` IS NOT NULL
        AND `right_fact_id` IS NOT NULL
        AND `left_fact_id` <> `right_fact_id`
        AND `left_timeline_event_id` IS NULL
        AND `right_timeline_event_id` IS NULL
      ) OR (
        `contradiction_type` = 'timeline_date'
        AND `left_timeline_event_id` IS NOT NULL
        AND `right_timeline_event_id` IS NOT NULL
        AND `left_timeline_event_id` <> `right_timeline_event_id`
        AND `left_fact_id` IS NULL
        AND `right_fact_id` IS NULL
      )),
	CONSTRAINT `contradictions_status_check` CHECK(`status` IN ('unresolved', 'resolved', 'dismissed')),
	CONSTRAINT `contradictions_resolution_check` CHECK((
        `status` = 'unresolved'
        AND `resolution_type` IS NULL
        AND `resolved_by_person_id` IS NULL
        AND `resolved_at` IS NULL
      ) OR (
        `status` = 'resolved'
        AND `resolution_type` IN ('keep_left', 'keep_right', 'different_events')
        AND `resolved_by_person_id` IS NOT NULL
        AND `resolved_at` IS NOT NULL
      ) OR (
        `status` = 'dismissed'
        AND `resolution_type` = 'dismiss_not_a_conflict'
        AND `resolved_by_person_id` IS NOT NULL
        AND `resolved_at` IS NOT NULL
      ))
);
--> statement-breakpoint
INSERT INTO `__new_contradictions` (`id`, `family_id`, `contradiction_type`, `left_fact_id`, `right_fact_id`, `left_timeline_event_id`, `right_timeline_event_id`, `status`, `resolution_type`, `resolution_note`, `resolved_by_person_id`, `resolved_at`, `created_at`, `updated_at`)
SELECT `id`, `family_id`, `contradiction_type`, `left_fact_id`, `right_fact_id`, `left_timeline_event_id`, `right_timeline_event_id`, `status`, `resolution_type`, `resolution_note`, NULL, `resolved_at`, `created_at`, `updated_at` FROM `contradictions`;
--> statement-breakpoint
DROP TABLE `contradictions`;
--> statement-breakpoint
ALTER TABLE `__new_contradictions` RENAME TO `contradictions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `contradictions_family_id_id_unique` ON `contradictions` (`family_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `contradictions_fact_pair_unique` ON `contradictions` (`family_id`,`left_fact_id`,`right_fact_id`) WHERE `contradiction_type` = 'fact_value';
--> statement-breakpoint
CREATE UNIQUE INDEX `contradictions_timeline_pair_unique` ON `contradictions` (`family_id`,`left_timeline_event_id`,`right_timeline_event_id`) WHERE `contradiction_type` = 'timeline_date';
--> statement-breakpoint
CREATE INDEX `contradictions_family_status_idx` ON `contradictions` (`family_id`,`status`);
