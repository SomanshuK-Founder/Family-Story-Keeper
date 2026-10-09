CREATE TABLE `families` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`canonical_display_name` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `people_status_check` CHECK(`status` IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_family_id_id_unique` ON `people` (`family_id`,`id`);
--> statement-breakpoint
CREATE INDEX `people_family_id_idx` ON `people` (`family_id`);
--> statement-breakpoint
CREATE TABLE `family_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`person_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `family_memberships_family_person_fk` FOREIGN KEY (`family_id`,`person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `family_memberships_role_check` CHECK(`role` IN ('narrator', 'relative', 'child')),
	CONSTRAINT `family_memberships_status_check` CHECK(`status` IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_memberships_family_person_unique` ON `family_memberships` (`family_id`,`person_id`);
--> statement-breakpoint
CREATE TABLE `interview_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`narrator_person_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `interview_sessions_family_narrator_fk` FOREIGN KEY (`family_id`,`narrator_person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `interview_sessions_status_check` CHECK(`status` IN ('active', 'completed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_sessions_family_id_id_unique` ON `interview_sessions` (`family_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_sessions_family_id_narrator_id_unique` ON `interview_sessions` (`family_id`,`id`,`narrator_person_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_sessions_one_active_per_narrator_unique` ON `interview_sessions` (`family_id`,`narrator_person_id`) WHERE `status` = 'active';
--> statement-breakpoint
CREATE TABLE `questions` (
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
	CONSTRAINT `questions_type_check` CHECK(`type` = 'phase_one_prompt'),
	CONSTRAINT `questions_source_check` CHECK(`source` = 'planner'),
	CONSTRAINT `questions_status_check` CHECK(`status` IN ('asked', 'answered'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_family_interview_id_unique` ON `questions` (`family_id`,`interview_session_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_interview_source_reference_unique` ON `questions` (`interview_session_id`,`source_reference_id`);
--> statement-breakpoint
CREATE INDEX `questions_family_interview_idx` ON `questions` (`family_id`,`interview_session_id`);
--> statement-breakpoint
CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`interview_session_id` text NOT NULL,
	`question_id` text NOT NULL,
	`narrator_person_id` text NOT NULL,
	`raw_text` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `answers_family_interview_narrator_fk` FOREIGN KEY (`family_id`,`interview_session_id`,`narrator_person_id`) REFERENCES `interview_sessions`(`family_id`,`id`,`narrator_person_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `answers_family_interview_question_fk` FOREIGN KEY (`family_id`,`interview_session_id`,`question_id`) REFERENCES `questions`(`family_id`,`interview_session_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `answers_raw_text_nonempty_check` CHECK(length(trim(`raw_text`)) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answers_family_interview_question_unique` ON `answers` (`family_id`,`interview_session_id`,`question_id`);
--> statement-breakpoint
CREATE INDEX `answers_family_interview_idx` ON `answers` (`family_id`,`interview_session_id`);
