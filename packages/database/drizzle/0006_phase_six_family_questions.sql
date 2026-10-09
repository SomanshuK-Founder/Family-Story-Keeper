CREATE TABLE `queued_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`from_person_id` text NOT NULL,
	`to_person_id` text NOT NULL,
	`question_text` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`asked_at` integer,
	`answered_at` integer,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `queued_questions_family_sender_fk` FOREIGN KEY (`family_id`,`from_person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `queued_questions_family_target_fk` FOREIGN KEY (`family_id`,`to_person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `queued_questions_people_distinct_check` CHECK(`from_person_id` <> `to_person_id`),
	CONSTRAINT `queued_questions_text_check` CHECK(length(trim(`question_text`)) > 0 AND length(`question_text`) <= 500),
	CONSTRAINT `queued_questions_status_check` CHECK(`status` IN ('queued', 'asked', 'answered', 'skipped', 'withdrawn')),
	CONSTRAINT `queued_questions_priority_check` CHECK(`priority` >= 0 AND `priority` <= 100),
	CONSTRAINT `queued_questions_lifecycle_check` CHECK((
		`status` = 'queued' AND `asked_at` IS NULL AND `answered_at` IS NULL
	) OR (
		`status` = 'asked' AND `asked_at` IS NOT NULL AND `answered_at` IS NULL
	) OR (
		`status` = 'answered' AND `asked_at` IS NOT NULL AND `answered_at` IS NOT NULL
	) OR (
		`status` IN ('skipped', 'withdrawn') AND `answered_at` IS NULL
	))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `queued_questions_family_id_id_unique` ON `queued_questions` (`family_id`,`id`);
--> statement-breakpoint
CREATE INDEX `queued_questions_planner_idx` ON `queued_questions` (`family_id`,`to_person_id`,`status`,`priority`,`created_at`,`id`);
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
	CONSTRAINT `questions_type_check` CHECK(`type` IN ('phase_one_prompt', 'contradiction_clarification', 'family_question', 'person_clarification', 'memory_follow_up')),
	CONSTRAINT `questions_source_check` CHECK(`source` IN ('planner', 'contradiction', 'family_queue', 'clarification', 'follow_up')),
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
