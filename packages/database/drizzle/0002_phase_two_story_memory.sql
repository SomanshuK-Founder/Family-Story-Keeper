CREATE UNIQUE INDEX `answers_family_id_id_unique` ON `answers` (`family_id`,`id`);
--> statement-breakpoint
CREATE TABLE `facts` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`subject_person_id` text NOT NULL,
	`fact_type` text NOT NULL,
	`normalized_value` text NOT NULL,
	`confidence` real NOT NULL,
	`approval_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `facts_family_subject_fk` FOREIGN KEY (`family_id`,`subject_person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `facts_type_nonempty_check` CHECK(length(trim(`fact_type`)) > 0),
	CONSTRAINT `facts_value_nonempty_check` CHECK(length(trim(`normalized_value`)) > 0),
	CONSTRAINT `facts_confidence_check` CHECK(`confidence` >= 0 AND `confidence` <= 1),
	CONSTRAINT `facts_approval_status_check` CHECK(`approval_status` IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facts_family_id_id_unique` ON `facts` (`family_id`,`id`);
--> statement-breakpoint
CREATE INDEX `facts_family_subject_idx` ON `facts` (`family_id`,`subject_person_id`);
--> statement-breakpoint
CREATE TABLE `fact_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`fact_id` text NOT NULL,
	`answer_id` text NOT NULL,
	`source_excerpt_or_locator` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `fact_sources_family_fact_fk` FOREIGN KEY (`family_id`,`fact_id`) REFERENCES `facts`(`family_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `fact_sources_family_answer_fk` FOREIGN KEY (`family_id`,`answer_id`) REFERENCES `answers`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fact_sources_family_id_id_unique` ON `fact_sources` (`family_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `fact_sources_fact_answer_unique` ON `fact_sources` (`family_id`,`fact_id`,`answer_id`);
--> statement-breakpoint
CREATE INDEX `fact_sources_family_fact_idx` ON `fact_sources` (`family_id`,`fact_id`);
--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`from_person_id` text NOT NULL,
	`to_person_id` text NOT NULL,
	`relationship_type` text NOT NULL,
	`confidence` real NOT NULL,
	`approval_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `relationships_family_from_person_fk` FOREIGN KEY (`family_id`,`from_person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `relationships_family_to_person_fk` FOREIGN KEY (`family_id`,`to_person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `relationships_distinct_people_check` CHECK(`from_person_id` <> `to_person_id`),
	CONSTRAINT `relationships_type_check` CHECK(`relationship_type` IN ('sibling', 'spouse', 'parent', 'child', 'cousin', 'friend')),
	CONSTRAINT `relationships_confidence_check` CHECK(`confidence` >= 0 AND `confidence` <= 1),
	CONSTRAINT `relationships_approval_status_check` CHECK(`approval_status` IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `relationships_family_id_id_unique` ON `relationships` (`family_id`,`id`);
--> statement-breakpoint
CREATE INDEX `relationships_family_people_idx` ON `relationships` (`family_id`,`from_person_id`,`to_person_id`);
--> statement-breakpoint
CREATE TABLE `timeline_events` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`subject_person_id` text NOT NULL,
	`event_type` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`earliest_year` integer,
	`latest_year` integer,
	`date_precision` text NOT NULL,
	`approval_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `timeline_events_family_subject_fk` FOREIGN KEY (`family_id`,`subject_person_id`) REFERENCES `people`(`family_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `timeline_events_type_nonempty_check` CHECK(length(trim(`event_type`)) > 0),
	CONSTRAINT `timeline_events_title_nonempty_check` CHECK(length(trim(`title`)) > 0),
	CONSTRAINT `timeline_events_date_check` CHECK((
        `date_precision` = 'unknown'
        AND `earliest_year` IS NULL
        AND `latest_year` IS NULL
      ) OR (
        `date_precision` = 'exact'
        AND `earliest_year` IS NOT NULL
        AND `latest_year` = `earliest_year`
      ) OR (
        `date_precision` IN ('approximate', 'range')
        AND `earliest_year` IS NOT NULL
        AND `latest_year` IS NOT NULL
        AND `earliest_year` <= `latest_year`
      )),
	CONSTRAINT `timeline_events_approval_status_check` CHECK(`approval_status` IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timeline_events_family_id_id_unique` ON `timeline_events` (`family_id`,`id`);
--> statement-breakpoint
CREATE INDEX `timeline_events_family_subject_idx` ON `timeline_events` (`family_id`,`subject_person_id`);
--> statement-breakpoint
CREATE TABLE `contradictions` (
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
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
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
	CONSTRAINT `contradictions_status_check` CHECK(`status` IN ('unresolved', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contradictions_family_id_id_unique` ON `contradictions` (`family_id`,`id`);
--> statement-breakpoint
CREATE INDEX `contradictions_family_status_idx` ON `contradictions` (`family_id`,`status`);
