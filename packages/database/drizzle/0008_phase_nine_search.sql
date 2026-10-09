CREATE VIRTUAL TABLE `story_search` USING fts5(
  `family_id` UNINDEXED,
  `source_type` UNINDEXED,
  `source_id` UNINDEXED,
  `person_id` UNINDEXED,
  `person_display_name` UNINDEXED,
  `title`,
  `body`,
  `earliest_year` UNINDEXED,
  `latest_year` UNINDEXED,
  `date_precision` UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `story_search_facts_ai` AFTER INSERT ON `facts` BEGIN
  DELETE FROM `story_search` WHERE `family_id` = NEW.`family_id` AND `source_type` = 'fact' AND `source_id` = NEW.`id`;
  INSERT INTO `story_search` (`family_id`, `source_type`, `source_id`, `person_id`, `person_display_name`, `title`, `body`, `earliest_year`, `latest_year`, `date_precision`)
  SELECT f.`family_id`, 'fact', f.`id`, f.`subject_person_id`, p.`canonical_display_name`, replace(f.`fact_type`, '_', ' '), replace(f.`fact_type`, '_', ' ') || ' ' || f.`normalized_value`, NULL, NULL, NULL
  FROM `facts` f JOIN `people` p ON p.`family_id` = f.`family_id` AND p.`id` = f.`subject_person_id`
  WHERE f.`family_id` = NEW.`family_id` AND f.`id` = NEW.`id` AND f.`approval_status` = 'approved'
    AND NOT EXISTS (SELECT 1 FROM `contradictions` c WHERE c.`family_id` = f.`family_id` AND c.`status` = 'unresolved' AND c.`contradiction_type` = 'fact_value' AND (c.`left_fact_id` = f.`id` OR c.`right_fact_id` = f.`id`));
END;
--> statement-breakpoint
CREATE TRIGGER `story_search_facts_au` AFTER UPDATE ON `facts` BEGIN
  DELETE FROM `story_search` WHERE `family_id` = OLD.`family_id` AND `source_type` = 'fact' AND `source_id` = OLD.`id`;
  INSERT INTO `story_search` (`family_id`, `source_type`, `source_id`, `person_id`, `person_display_name`, `title`, `body`, `earliest_year`, `latest_year`, `date_precision`)
  SELECT f.`family_id`, 'fact', f.`id`, f.`subject_person_id`, p.`canonical_display_name`, replace(f.`fact_type`, '_', ' '), replace(f.`fact_type`, '_', ' ') || ' ' || f.`normalized_value`, NULL, NULL, NULL
  FROM `facts` f JOIN `people` p ON p.`family_id` = f.`family_id` AND p.`id` = f.`subject_person_id`
  WHERE f.`family_id` = NEW.`family_id` AND f.`id` = NEW.`id` AND f.`approval_status` = 'approved'
    AND NOT EXISTS (SELECT 1 FROM `contradictions` c WHERE c.`family_id` = f.`family_id` AND c.`status` = 'unresolved' AND c.`contradiction_type` = 'fact_value' AND (c.`left_fact_id` = f.`id` OR c.`right_fact_id` = f.`id`));
END;
--> statement-breakpoint
CREATE TRIGGER `story_search_facts_ad` AFTER DELETE ON `facts` BEGIN
  DELETE FROM `story_search` WHERE `family_id` = OLD.`family_id` AND `source_type` = 'fact' AND `source_id` = OLD.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `story_search_relationships_ai` AFTER INSERT ON `relationships` BEGIN
  DELETE FROM `story_search` WHERE `family_id` = NEW.`family_id` AND `source_type` = 'relationship' AND `source_id` = NEW.`id`;
  INSERT INTO `story_search` (`family_id`, `source_type`, `source_id`, `person_id`, `person_display_name`, `title`, `body`, `earliest_year`, `latest_year`, `date_precision`)
  SELECT r.`family_id`, 'relationship', r.`id`, r.`from_person_id`, fp.`canonical_display_name`, fp.`canonical_display_name` || ' — ' || replace(r.`relationship_type`, '_', ' ') || ' — ' || tp.`canonical_display_name`, fp.`canonical_display_name` || ' ' || replace(r.`relationship_type`, '_', ' ') || ' ' || tp.`canonical_display_name`, NULL, NULL, NULL
  FROM `relationships` r JOIN `people` fp ON fp.`family_id` = r.`family_id` AND fp.`id` = r.`from_person_id` JOIN `people` tp ON tp.`family_id` = r.`family_id` AND tp.`id` = r.`to_person_id`
  WHERE r.`family_id` = NEW.`family_id` AND r.`id` = NEW.`id` AND r.`approval_status` = 'approved'
    AND fp.`status` = 'active' AND tp.`status` = 'active'
    AND NOT EXISTS (SELECT 1 FROM `person_candidates` pc WHERE pc.`family_id` = r.`family_id` AND pc.`status` = 'unresolved' AND pc.`candidate_person_id` IN (r.`from_person_id`, r.`to_person_id`));
END;
--> statement-breakpoint
CREATE TRIGGER `story_search_relationships_au` AFTER UPDATE ON `relationships` BEGIN
  DELETE FROM `story_search` WHERE `family_id` = OLD.`family_id` AND `source_type` = 'relationship' AND `source_id` = OLD.`id`;
  INSERT INTO `story_search` (`family_id`, `source_type`, `source_id`, `person_id`, `person_display_name`, `title`, `body`, `earliest_year`, `latest_year`, `date_precision`)
  SELECT r.`family_id`, 'relationship', r.`id`, r.`from_person_id`, fp.`canonical_display_name`, fp.`canonical_display_name` || ' — ' || replace(r.`relationship_type`, '_', ' ') || ' — ' || tp.`canonical_display_name`, fp.`canonical_display_name` || ' ' || replace(r.`relationship_type`, '_', ' ') || ' ' || tp.`canonical_display_name`, NULL, NULL, NULL
  FROM `relationships` r JOIN `people` fp ON fp.`family_id` = r.`family_id` AND fp.`id` = r.`from_person_id` JOIN `people` tp ON tp.`family_id` = r.`family_id` AND tp.`id` = r.`to_person_id`
  WHERE r.`family_id` = NEW.`family_id` AND r.`id` = NEW.`id` AND r.`approval_status` = 'approved'
    AND fp.`status` = 'active' AND tp.`status` = 'active'
    AND NOT EXISTS (SELECT 1 FROM `person_candidates` pc WHERE pc.`family_id` = r.`family_id` AND pc.`status` = 'unresolved' AND pc.`candidate_person_id` IN (r.`from_person_id`, r.`to_person_id`));
END;
--> statement-breakpoint
CREATE TRIGGER `story_search_relationships_ad` AFTER DELETE ON `relationships` BEGIN
  DELETE FROM `story_search` WHERE `family_id` = OLD.`family_id` AND `source_type` = 'relationship' AND `source_id` = OLD.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `story_search_timeline_ai` AFTER INSERT ON `timeline_events` BEGIN
  DELETE FROM `story_search` WHERE `family_id` = NEW.`family_id` AND `source_type` = 'timeline_event' AND `source_id` = NEW.`id`;
  INSERT INTO `story_search` (`family_id`, `source_type`, `source_id`, `person_id`, `person_display_name`, `title`, `body`, `earliest_year`, `latest_year`, `date_precision`)
  SELECT e.`family_id`, 'timeline_event', e.`id`, e.`subject_person_id`, p.`canonical_display_name`, e.`title`, replace(e.`event_type`, '_', ' ') || ' ' || e.`title` || ' ' || e.`description`, e.`earliest_year`, e.`latest_year`, e.`date_precision`
  FROM `timeline_events` e JOIN `people` p ON p.`family_id` = e.`family_id` AND p.`id` = e.`subject_person_id`
  WHERE e.`family_id` = NEW.`family_id` AND e.`id` = NEW.`id` AND e.`approval_status` = 'approved'
    AND NOT EXISTS (SELECT 1 FROM `contradictions` c WHERE c.`family_id` = e.`family_id` AND c.`status` = 'unresolved' AND c.`contradiction_type` = 'timeline_date' AND (c.`left_timeline_event_id` = e.`id` OR c.`right_timeline_event_id` = e.`id`));
END;
--> statement-breakpoint
CREATE TRIGGER `story_search_timeline_au` AFTER UPDATE ON `timeline_events` BEGIN
  DELETE FROM `story_search` WHERE `family_id` = OLD.`family_id` AND `source_type` = 'timeline_event' AND `source_id` = OLD.`id`;
  INSERT INTO `story_search` (`family_id`, `source_type`, `source_id`, `person_id`, `person_display_name`, `title`, `body`, `earliest_year`, `latest_year`, `date_precision`)
  SELECT e.`family_id`, 'timeline_event', e.`id`, e.`subject_person_id`, p.`canonical_display_name`, e.`title`, replace(e.`event_type`, '_', ' ') || ' ' || e.`title` || ' ' || e.`description`, e.`earliest_year`, e.`latest_year`, e.`date_precision`
  FROM `timeline_events` e JOIN `people` p ON p.`family_id` = e.`family_id` AND p.`id` = e.`subject_person_id`
  WHERE e.`family_id` = NEW.`family_id` AND e.`id` = NEW.`id` AND e.`approval_status` = 'approved'
    AND NOT EXISTS (SELECT 1 FROM `contradictions` c WHERE c.`family_id` = e.`family_id` AND c.`status` = 'unresolved' AND c.`contradiction_type` = 'timeline_date' AND (c.`left_timeline_event_id` = e.`id` OR c.`right_timeline_event_id` = e.`id`));
END;
--> statement-breakpoint
CREATE TRIGGER `story_search_timeline_ad` AFTER DELETE ON `timeline_events` BEGIN
  DELETE FROM `story_search` WHERE `family_id` = OLD.`family_id` AND `source_type` = 'timeline_event' AND `source_id` = OLD.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `story_search_chapters_ai` AFTER INSERT ON `chapter_drafts` BEGIN
  DELETE FROM `story_search` WHERE `family_id` = NEW.`family_id` AND `source_type` = 'chapter' AND `source_id` = NEW.`id`;
  INSERT INTO `story_search` (`family_id`, `source_type`, `source_id`, `person_id`, `person_display_name`, `title`, `body`, `earliest_year`, `latest_year`, `date_precision`)
  SELECT d.`family_id`, 'chapter', d.`id`, d.`narrator_person_id`, p.`canonical_display_name`, d.`title`, d.`body`, NULL, NULL, NULL
  FROM `chapter_drafts` d JOIN `people` p ON p.`family_id` = d.`family_id` AND p.`id` = d.`narrator_person_id`
  WHERE d.`family_id` = NEW.`family_id` AND d.`id` = NEW.`id` AND d.`status` = 'approved' AND d.`title` IS NOT NULL AND d.`body` IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `story_search_chapters_au` AFTER UPDATE ON `chapter_drafts` BEGIN
  DELETE FROM `story_search` WHERE `family_id` = OLD.`family_id` AND `source_type` = 'chapter' AND `source_id` = OLD.`id`;
  INSERT INTO `story_search` (`family_id`, `source_type`, `source_id`, `person_id`, `person_display_name`, `title`, `body`, `earliest_year`, `latest_year`, `date_precision`)
  SELECT d.`family_id`, 'chapter', d.`id`, d.`narrator_person_id`, p.`canonical_display_name`, d.`title`, d.`body`, NULL, NULL, NULL
  FROM `chapter_drafts` d JOIN `people` p ON p.`family_id` = d.`family_id` AND p.`id` = d.`narrator_person_id`
  WHERE d.`family_id` = NEW.`family_id` AND d.`id` = NEW.`id` AND d.`status` = 'approved' AND d.`title` IS NOT NULL AND d.`body` IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `story_search_chapters_ad` AFTER DELETE ON `chapter_drafts` BEGIN
  DELETE FROM `story_search` WHERE `family_id` = OLD.`family_id` AND `source_type` = 'chapter' AND `source_id` = OLD.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `story_search_candidates_ai` AFTER INSERT ON `person_candidates` WHEN NEW.`status` = 'unresolved' BEGIN
  DELETE FROM `story_search` WHERE `family_id` = NEW.`family_id` AND `source_type` = 'relationship' AND `source_id` IN (SELECT r.`id` FROM `relationships` r WHERE r.`family_id` = NEW.`family_id` AND NEW.`candidate_person_id` IN (r.`from_person_id`, r.`to_person_id`));
END;
--> statement-breakpoint
CREATE TRIGGER `story_search_contradictions_ai` AFTER INSERT ON `contradictions` WHEN NEW.`status` = 'unresolved' BEGIN
  DELETE FROM `story_search` WHERE `family_id` = NEW.`family_id` AND ((`source_type` = 'fact' AND `source_id` IN (NEW.`left_fact_id`, NEW.`right_fact_id`)) OR (`source_type` = 'timeline_event' AND `source_id` IN (NEW.`left_timeline_event_id`, NEW.`right_timeline_event_id`)));
END;
--> statement-breakpoint
CREATE TRIGGER `story_search_contradictions_au` AFTER UPDATE ON `contradictions` BEGIN
  DELETE FROM `story_search` WHERE `family_id` = NEW.`family_id` AND ((`source_type` = 'fact' AND `source_id` IN (OLD.`left_fact_id`, OLD.`right_fact_id`, NEW.`left_fact_id`, NEW.`right_fact_id`)) OR (`source_type` = 'timeline_event' AND `source_id` IN (OLD.`left_timeline_event_id`, OLD.`right_timeline_event_id`, NEW.`left_timeline_event_id`, NEW.`right_timeline_event_id`)));
  INSERT INTO `story_search` (`family_id`, `source_type`, `source_id`, `person_id`, `person_display_name`, `title`, `body`, `earliest_year`, `latest_year`, `date_precision`)
  SELECT f.`family_id`, 'fact', f.`id`, f.`subject_person_id`, p.`canonical_display_name`, replace(f.`fact_type`, '_', ' '), replace(f.`fact_type`, '_', ' ') || ' ' || f.`normalized_value`, NULL, NULL, NULL
  FROM `facts` f JOIN `people` p ON p.`family_id` = f.`family_id` AND p.`id` = f.`subject_person_id`
  WHERE f.`family_id` = NEW.`family_id` AND f.`id` IN (OLD.`left_fact_id`, OLD.`right_fact_id`, NEW.`left_fact_id`, NEW.`right_fact_id`) AND f.`approval_status` = 'approved'
    AND NOT EXISTS (SELECT 1 FROM `contradictions` c WHERE c.`family_id` = f.`family_id` AND c.`status` = 'unresolved' AND c.`contradiction_type` = 'fact_value' AND (c.`left_fact_id` = f.`id` OR c.`right_fact_id` = f.`id`));
  INSERT INTO `story_search` (`family_id`, `source_type`, `source_id`, `person_id`, `person_display_name`, `title`, `body`, `earliest_year`, `latest_year`, `date_precision`)
  SELECT e.`family_id`, 'timeline_event', e.`id`, e.`subject_person_id`, p.`canonical_display_name`, e.`title`, replace(e.`event_type`, '_', ' ') || ' ' || e.`title` || ' ' || e.`description`, e.`earliest_year`, e.`latest_year`, e.`date_precision`
  FROM `timeline_events` e JOIN `people` p ON p.`family_id` = e.`family_id` AND p.`id` = e.`subject_person_id`
  WHERE e.`family_id` = NEW.`family_id` AND e.`id` IN (OLD.`left_timeline_event_id`, OLD.`right_timeline_event_id`, NEW.`left_timeline_event_id`, NEW.`right_timeline_event_id`) AND e.`approval_status` = 'approved'
    AND NOT EXISTS (SELECT 1 FROM `contradictions` c WHERE c.`family_id` = e.`family_id` AND c.`status` = 'unresolved' AND c.`contradiction_type` = 'timeline_date' AND (c.`left_timeline_event_id` = e.`id` OR c.`right_timeline_event_id` = e.`id`));
END;
--> statement-breakpoint
INSERT INTO `story_search` (`family_id`, `source_type`, `source_id`, `person_id`, `person_display_name`, `title`, `body`, `earliest_year`, `latest_year`, `date_precision`)
SELECT f.`family_id`, 'fact', f.`id`, f.`subject_person_id`, p.`canonical_display_name`, replace(f.`fact_type`, '_', ' '), replace(f.`fact_type`, '_', ' ') || ' ' || f.`normalized_value`, NULL, NULL, NULL
FROM `facts` f JOIN `people` p ON p.`family_id` = f.`family_id` AND p.`id` = f.`subject_person_id`
WHERE f.`approval_status` = 'approved' AND NOT EXISTS (SELECT 1 FROM `contradictions` c WHERE c.`family_id` = f.`family_id` AND c.`status` = 'unresolved' AND c.`contradiction_type` = 'fact_value' AND (c.`left_fact_id` = f.`id` OR c.`right_fact_id` = f.`id`));
--> statement-breakpoint
INSERT INTO `story_search` (`family_id`, `source_type`, `source_id`, `person_id`, `person_display_name`, `title`, `body`, `earliest_year`, `latest_year`, `date_precision`)
SELECT r.`family_id`, 'relationship', r.`id`, r.`from_person_id`, fp.`canonical_display_name`, fp.`canonical_display_name` || ' — ' || replace(r.`relationship_type`, '_', ' ') || ' — ' || tp.`canonical_display_name`, fp.`canonical_display_name` || ' ' || replace(r.`relationship_type`, '_', ' ') || ' ' || tp.`canonical_display_name`, NULL, NULL, NULL
FROM `relationships` r JOIN `people` fp ON fp.`family_id` = r.`family_id` AND fp.`id` = r.`from_person_id` JOIN `people` tp ON tp.`family_id` = r.`family_id` AND tp.`id` = r.`to_person_id`
WHERE r.`approval_status` = 'approved' AND fp.`status` = 'active' AND tp.`status` = 'active'
  AND NOT EXISTS (SELECT 1 FROM `person_candidates` pc WHERE pc.`family_id` = r.`family_id` AND pc.`status` = 'unresolved' AND pc.`candidate_person_id` IN (r.`from_person_id`, r.`to_person_id`));
--> statement-breakpoint
INSERT INTO `story_search` (`family_id`, `source_type`, `source_id`, `person_id`, `person_display_name`, `title`, `body`, `earliest_year`, `latest_year`, `date_precision`)
SELECT e.`family_id`, 'timeline_event', e.`id`, e.`subject_person_id`, p.`canonical_display_name`, e.`title`, replace(e.`event_type`, '_', ' ') || ' ' || e.`title` || ' ' || e.`description`, e.`earliest_year`, e.`latest_year`, e.`date_precision`
FROM `timeline_events` e JOIN `people` p ON p.`family_id` = e.`family_id` AND p.`id` = e.`subject_person_id`
WHERE e.`approval_status` = 'approved' AND NOT EXISTS (SELECT 1 FROM `contradictions` c WHERE c.`family_id` = e.`family_id` AND c.`status` = 'unresolved' AND c.`contradiction_type` = 'timeline_date' AND (c.`left_timeline_event_id` = e.`id` OR c.`right_timeline_event_id` = e.`id`));
--> statement-breakpoint
INSERT INTO `story_search` (`family_id`, `source_type`, `source_id`, `person_id`, `person_display_name`, `title`, `body`, `earliest_year`, `latest_year`, `date_precision`)
SELECT d.`family_id`, 'chapter', d.`id`, d.`narrator_person_id`, p.`canonical_display_name`, d.`title`, d.`body`, NULL, NULL, NULL
FROM `chapter_drafts` d JOIN `people` p ON p.`family_id` = d.`family_id` AND p.`id` = d.`narrator_person_id`
WHERE d.`status` = 'approved' AND d.`title` IS NOT NULL AND d.`body` IS NOT NULL;
