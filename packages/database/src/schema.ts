import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type {
  ApprovalAction,
  ConsentEventType,
  ContradictionResolutionType,
  ContradictionStatus,
  ContradictionType,
  DatePrecision,
  RelationshipType,
  StoryItemStatus,
  StoryItemTargetType,
} from '@story-keeper/shared';

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());

const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());

export const families = sqliteTable('families', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const people = sqliteTable(
  'people',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    canonicalDisplayName: text('canonical_display_name').notNull(),
    status: text('status').$type<'active' | 'inactive'>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('people_family_id_id_unique').on(table.familyId, table.id),
    index('people_family_id_idx').on(table.familyId),
    check('people_status_check', sql`${table.status} IN ('active', 'inactive')`),
  ],
);

export const familyMemberships = sqliteTable(
  'family_memberships',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    personId: text('person_id').notNull(),
    role: text('role').$type<'narrator' | 'relative' | 'child'>().notNull(),
    status: text('status').$type<'active' | 'inactive'>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('family_memberships_family_person_unique').on(table.familyId, table.personId),
    foreignKey({
      columns: [table.familyId, table.personId],
      foreignColumns: [people.familyId, people.id],
      name: 'family_memberships_family_person_fk',
    }).onDelete('cascade'),
    check('family_memberships_role_check', sql`${table.role} IN ('narrator', 'relative', 'child')`),
    check('family_memberships_status_check', sql`${table.status} IN ('active', 'inactive')`),
  ],
);

export const interviewSessions = sqliteTable(
  'interview_sessions',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    narratorPersonId: text('narrator_person_id').notNull(),
    status: text('status').$type<'active' | 'completed'>().notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    lastActiveAt: integer('last_active_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('interview_sessions_family_id_id_unique').on(table.familyId, table.id),
    uniqueIndex('interview_sessions_family_id_narrator_id_unique').on(
      table.familyId,
      table.id,
      table.narratorPersonId,
    ),
    uniqueIndex('interview_sessions_one_active_per_narrator_unique')
      .on(table.familyId, table.narratorPersonId)
      .where(sql`${table.status} = 'active'`),
    foreignKey({
      columns: [table.familyId, table.narratorPersonId],
      foreignColumns: [people.familyId, people.id],
      name: 'interview_sessions_family_narrator_fk',
    }).onDelete('restrict'),
    check('interview_sessions_status_check', sql`${table.status} IN ('active', 'completed')`),
  ],
);

export const questions = sqliteTable(
  'questions',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull(),
    interviewSessionId: text('interview_session_id').notNull(),
    type: text('type')
      .$type<
        | 'phase_one_prompt'
        | 'contradiction_clarification'
        | 'person_clarification'
        | 'memory_follow_up'
      >()
      .notNull(),
    text: text('text').notNull(),
    source: text('source')
      .$type<'planner' | 'contradiction' | 'clarification' | 'follow_up'>()
      .notNull(),
    sourceReferenceId: text('source_reference_id'),
    status: text('status').$type<'asked' | 'answered' | 'superseded'>().notNull(),
    askedAt: integer('asked_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('questions_family_interview_id_unique').on(
      table.familyId,
      table.interviewSessionId,
      table.id,
    ),
    uniqueIndex('questions_interview_source_reference_unique').on(
      table.interviewSessionId,
      table.sourceReferenceId,
    ),
    index('questions_family_interview_idx').on(table.familyId, table.interviewSessionId),
    foreignKey({
      columns: [table.familyId, table.interviewSessionId],
      foreignColumns: [interviewSessions.familyId, interviewSessions.id],
      name: 'questions_family_interview_fk',
    }).onDelete('cascade'),
    check(
      'questions_type_check',
      sql`${table.type} IN ('phase_one_prompt', 'contradiction_clarification', 'person_clarification', 'memory_follow_up')`,
    ),
    check(
      'questions_source_check',
      sql`${table.source} IN ('planner', 'contradiction', 'clarification', 'follow_up')`,
    ),
    check('questions_status_check', sql`${table.status} IN ('asked', 'answered', 'superseded')`),
  ],
);

export const answers = sqliteTable(
  'answers',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull(),
    interviewSessionId: text('interview_session_id').notNull(),
    questionId: text('question_id').notNull(),
    narratorPersonId: text('narrator_person_id').notNull(),
    rawText: text('raw_text').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('answers_family_id_id_unique').on(table.familyId, table.id),
    uniqueIndex('answers_family_interview_question_unique').on(
      table.familyId,
      table.interviewSessionId,
      table.questionId,
    ),
    index('answers_family_interview_idx').on(table.familyId, table.interviewSessionId),
    foreignKey({
      columns: [table.familyId, table.interviewSessionId, table.narratorPersonId],
      foreignColumns: [
        interviewSessions.familyId,
        interviewSessions.id,
        interviewSessions.narratorPersonId,
      ],
      name: 'answers_family_interview_narrator_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.familyId, table.interviewSessionId, table.questionId],
      foreignColumns: [questions.familyId, questions.interviewSessionId, questions.id],
      name: 'answers_family_interview_question_fk',
    }).onDelete('restrict'),
    check('answers_raw_text_nonempty_check', sql`length(trim(${table.rawText})) > 0`),
  ],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    type: text('type').$type<'extract_answer'>().notNull(),
    payload: text('payload').notNull(),
    deduplicationKey: text('deduplication_key').notNull(),
    status: text('status')
      .$type<'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'>()
      .notNull()
      .default('queued'),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull(),
    availableAt: integer('available_at', { mode: 'timestamp_ms' }).notNull(),
    lockedAt: integer('locked_at', { mode: 'timestamp_ms' }),
    lockedBy: text('locked_by'),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('jobs_family_id_id_unique').on(table.familyId, table.id),
    uniqueIndex('jobs_deduplication_key_unique').on(table.deduplicationKey),
    index('jobs_claim_idx').on(table.status, table.availableAt, table.createdAt),
    check('jobs_type_check', sql`${table.type} = 'extract_answer'`),
    check(
      'jobs_status_check',
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check('jobs_attempts_check', sql`${table.attemptCount} >= 0 AND ${table.maxAttempts} >= 1`),
    check(
      'jobs_lock_check',
      sql`(${table.status} = 'running' AND ${table.lockedAt} IS NOT NULL AND ${table.lockedBy} IS NOT NULL) OR ${table.status} <> 'running'`,
    ),
  ],
);

export const personCandidates = sqliteTable(
  'person_candidates',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull(),
    candidatePersonId: text('candidate_person_id').notNull(),
    answerId: text('answer_id').notNull(),
    jobId: text('job_id').notNull(),
    extractedName: text('extracted_name').notNull(),
    confidence: real('confidence').notNull(),
    status: text('status').$type<'unresolved' | 'matched' | 'dismissed'>().notNull(),
    possibleMatchPersonId: text('possible_match_person_id'),
    matchScore: real('match_score'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('person_candidates_family_id_id_unique').on(table.familyId, table.id),
    uniqueIndex('person_candidates_job_person_unique').on(table.jobId, table.candidatePersonId),
    foreignKey({
      columns: [table.familyId, table.candidatePersonId],
      foreignColumns: [people.familyId, people.id],
      name: 'person_candidates_family_candidate_person_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.familyId, table.answerId],
      foreignColumns: [answers.familyId, answers.id],
      name: 'person_candidates_family_answer_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.familyId, table.jobId],
      foreignColumns: [jobs.familyId, jobs.id],
      name: 'person_candidates_family_job_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.familyId, table.possibleMatchPersonId],
      foreignColumns: [people.familyId, people.id],
      name: 'person_candidates_family_possible_match_fk',
    }).onDelete('restrict'),
    check('person_candidates_name_check', sql`length(trim(${table.extractedName})) > 0`),
    check(
      'person_candidates_confidence_check',
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    check(
      'person_candidates_match_score_check',
      sql`${table.matchScore} IS NULL OR (${table.matchScore} >= 0 AND ${table.matchScore} <= 1)`,
    ),
    check(
      'person_candidates_status_check',
      sql`${table.status} IN ('unresolved', 'matched', 'dismissed')`,
    ),
  ],
);

export const facts = sqliteTable(
  'facts',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    subjectPersonId: text('subject_person_id').notNull(),
    factType: text('fact_type').notNull(),
    normalizedValue: text('normalized_value').notNull(),
    confidence: real('confidence').notNull(),
    approvalStatus: text('approval_status').$type<StoryItemStatus>().notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('facts_family_id_id_unique').on(table.familyId, table.id),
    index('facts_family_subject_idx').on(table.familyId, table.subjectPersonId),
    foreignKey({
      columns: [table.familyId, table.subjectPersonId],
      foreignColumns: [people.familyId, people.id],
      name: 'facts_family_subject_fk',
    }).onDelete('restrict'),
    check('facts_type_nonempty_check', sql`length(trim(${table.factType})) > 0`),
    check('facts_value_nonempty_check', sql`length(trim(${table.normalizedValue})) > 0`),
    check('facts_confidence_check', sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`),
    check(
      'facts_approval_status_check',
      sql`${table.approvalStatus} IN ('pending', 'approved', 'rejected')`,
    ),
  ],
);

export const factSources = sqliteTable(
  'fact_sources',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    factId: text('fact_id').notNull(),
    answerId: text('answer_id').notNull(),
    sourceLocator: text('source_excerpt_or_locator'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('fact_sources_family_id_id_unique').on(table.familyId, table.id),
    uniqueIndex('fact_sources_fact_answer_unique').on(table.familyId, table.factId, table.answerId),
    index('fact_sources_family_fact_idx').on(table.familyId, table.factId),
    foreignKey({
      columns: [table.familyId, table.factId],
      foreignColumns: [facts.familyId, facts.id],
      name: 'fact_sources_family_fact_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.familyId, table.answerId],
      foreignColumns: [answers.familyId, answers.id],
      name: 'fact_sources_family_answer_fk',
    }).onDelete('restrict'),
  ],
);

export const relationships = sqliteTable(
  'relationships',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    fromPersonId: text('from_person_id').notNull(),
    toPersonId: text('to_person_id').notNull(),
    relationshipType: text('relationship_type').$type<RelationshipType>().notNull(),
    confidence: real('confidence').notNull(),
    approvalStatus: text('approval_status').$type<StoryItemStatus>().notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('relationships_family_id_id_unique').on(table.familyId, table.id),
    index('relationships_family_people_idx').on(
      table.familyId,
      table.fromPersonId,
      table.toPersonId,
    ),
    foreignKey({
      columns: [table.familyId, table.fromPersonId],
      foreignColumns: [people.familyId, people.id],
      name: 'relationships_family_from_person_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.familyId, table.toPersonId],
      foreignColumns: [people.familyId, people.id],
      name: 'relationships_family_to_person_fk',
    }).onDelete('restrict'),
    check('relationships_distinct_people_check', sql`${table.fromPersonId} <> ${table.toPersonId}`),
    check(
      'relationships_type_check',
      sql`${table.relationshipType} IN ('sibling', 'spouse', 'parent', 'child', 'cousin', 'friend')`,
    ),
    check(
      'relationships_confidence_check',
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    check(
      'relationships_approval_status_check',
      sql`${table.approvalStatus} IN ('pending', 'approved', 'rejected')`,
    ),
  ],
);

export const relationshipSources = sqliteTable(
  'relationship_sources',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull(),
    relationshipId: text('relationship_id').notNull(),
    answerId: text('answer_id').notNull(),
    jobId: text('job_id').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('relationship_sources_relationship_answer_unique').on(
      table.familyId,
      table.relationshipId,
      table.answerId,
    ),
    foreignKey({
      columns: [table.familyId, table.relationshipId],
      foreignColumns: [relationships.familyId, relationships.id],
      name: 'relationship_sources_family_relationship_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.familyId, table.answerId],
      foreignColumns: [answers.familyId, answers.id],
      name: 'relationship_sources_family_answer_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.familyId, table.jobId],
      foreignColumns: [jobs.familyId, jobs.id],
      name: 'relationship_sources_family_job_fk',
    }).onDelete('cascade'),
  ],
);

export const timelineEvents = sqliteTable(
  'timeline_events',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    subjectPersonId: text('subject_person_id').notNull(),
    eventType: text('event_type').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    earliestYear: integer('earliest_year'),
    latestYear: integer('latest_year'),
    datePrecision: text('date_precision').$type<DatePrecision>().notNull(),
    approvalStatus: text('approval_status').$type<StoryItemStatus>().notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('timeline_events_family_id_id_unique').on(table.familyId, table.id),
    index('timeline_events_family_subject_idx').on(table.familyId, table.subjectPersonId),
    foreignKey({
      columns: [table.familyId, table.subjectPersonId],
      foreignColumns: [people.familyId, people.id],
      name: 'timeline_events_family_subject_fk',
    }).onDelete('restrict'),
    check('timeline_events_type_nonempty_check', sql`length(trim(${table.eventType})) > 0`),
    check('timeline_events_title_nonempty_check', sql`length(trim(${table.title})) > 0`),
    check(
      'timeline_events_date_check',
      sql`(
        ${table.datePrecision} = 'unknown'
        AND ${table.earliestYear} IS NULL
        AND ${table.latestYear} IS NULL
      ) OR (
        ${table.datePrecision} = 'exact'
        AND ${table.earliestYear} IS NOT NULL
        AND ${table.latestYear} = ${table.earliestYear}
      ) OR (
        ${table.datePrecision} IN ('approximate', 'range')
        AND ${table.earliestYear} IS NOT NULL
        AND ${table.latestYear} IS NOT NULL
        AND ${table.earliestYear} <= ${table.latestYear}
      )`,
    ),
    check(
      'timeline_events_approval_status_check',
      sql`${table.approvalStatus} IN ('pending', 'approved', 'rejected')`,
    ),
  ],
);

export const timelineEventSources = sqliteTable(
  'timeline_event_sources',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull(),
    timelineEventId: text('timeline_event_id').notNull(),
    answerId: text('answer_id').notNull(),
    jobId: text('job_id').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('timeline_event_sources_event_answer_unique').on(
      table.familyId,
      table.timelineEventId,
      table.answerId,
    ),
    foreignKey({
      columns: [table.familyId, table.timelineEventId],
      foreignColumns: [timelineEvents.familyId, timelineEvents.id],
      name: 'timeline_event_sources_family_event_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.familyId, table.answerId],
      foreignColumns: [answers.familyId, answers.id],
      name: 'timeline_event_sources_family_answer_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.familyId, table.jobId],
      foreignColumns: [jobs.familyId, jobs.id],
      name: 'timeline_event_sources_family_job_fk',
    }).onDelete('cascade'),
  ],
);

export const contradictions = sqliteTable(
  'contradictions',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    contradictionType: text('contradiction_type').$type<ContradictionType>().notNull(),
    leftFactId: text('left_fact_id'),
    rightFactId: text('right_fact_id'),
    leftTimelineEventId: text('left_timeline_event_id'),
    rightTimelineEventId: text('right_timeline_event_id'),
    status: text('status').$type<ContradictionStatus>().notNull().default('unresolved'),
    resolutionType: text('resolution_type').$type<ContradictionResolutionType>(),
    resolutionNote: text('resolution_note'),
    resolvedByPersonId: text('resolved_by_person_id'),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('contradictions_family_id_id_unique').on(table.familyId, table.id),
    uniqueIndex('contradictions_fact_pair_unique')
      .on(table.familyId, table.leftFactId, table.rightFactId)
      .where(sql`${table.contradictionType} = 'fact_value'`),
    uniqueIndex('contradictions_timeline_pair_unique')
      .on(table.familyId, table.leftTimelineEventId, table.rightTimelineEventId)
      .where(sql`${table.contradictionType} = 'timeline_date'`),
    index('contradictions_family_status_idx').on(table.familyId, table.status),
    foreignKey({
      columns: [table.familyId, table.resolvedByPersonId],
      foreignColumns: [people.familyId, people.id],
      name: 'contradictions_family_resolver_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.familyId, table.leftFactId],
      foreignColumns: [facts.familyId, facts.id],
      name: 'contradictions_family_left_fact_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.familyId, table.rightFactId],
      foreignColumns: [facts.familyId, facts.id],
      name: 'contradictions_family_right_fact_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.familyId, table.leftTimelineEventId],
      foreignColumns: [timelineEvents.familyId, timelineEvents.id],
      name: 'contradictions_family_left_timeline_event_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.familyId, table.rightTimelineEventId],
      foreignColumns: [timelineEvents.familyId, timelineEvents.id],
      name: 'contradictions_family_right_timeline_event_fk',
    }).onDelete('restrict'),
    check(
      'contradictions_type_check',
      sql`${table.contradictionType} IN ('fact_value', 'timeline_date')`,
    ),
    check(
      'contradictions_references_check',
      sql`(
        ${table.contradictionType} = 'fact_value'
        AND ${table.leftFactId} IS NOT NULL
        AND ${table.rightFactId} IS NOT NULL
        AND ${table.leftFactId} <> ${table.rightFactId}
        AND ${table.leftTimelineEventId} IS NULL
        AND ${table.rightTimelineEventId} IS NULL
      ) OR (
        ${table.contradictionType} = 'timeline_date'
        AND ${table.leftTimelineEventId} IS NOT NULL
        AND ${table.rightTimelineEventId} IS NOT NULL
        AND ${table.leftTimelineEventId} <> ${table.rightTimelineEventId}
        AND ${table.leftFactId} IS NULL
        AND ${table.rightFactId} IS NULL
      )`,
    ),
    check(
      'contradictions_status_check',
      sql`${table.status} IN ('unresolved', 'resolved', 'dismissed')`,
    ),
    check(
      'contradictions_resolution_check',
      sql`(
        ${table.status} = 'unresolved'
        AND ${table.resolutionType} IS NULL
        AND ${table.resolvedByPersonId} IS NULL
        AND ${table.resolvedAt} IS NULL
      ) OR (
        ${table.status} = 'resolved'
        AND ${table.resolutionType} IN ('keep_left', 'keep_right', 'different_events')
        AND ${table.resolvedByPersonId} IS NOT NULL
        AND ${table.resolvedAt} IS NOT NULL
      ) OR (
        ${table.status} = 'dismissed'
        AND ${table.resolutionType} = 'dismiss_not_a_conflict'
        AND ${table.resolvedByPersonId} IS NOT NULL
        AND ${table.resolvedAt} IS NOT NULL
      )`,
    ),
  ],
);

export const approvals = sqliteTable(
  'approvals',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    actorPersonId: text('actor_person_id').notNull(),
    targetType: text('target_type').$type<StoryItemTargetType>().notNull(),
    targetId: text('target_id').notNull(),
    action: text('action').$type<ApprovalAction>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('approvals_family_target_idx').on(table.familyId, table.targetType, table.targetId),
    foreignKey({
      columns: [table.familyId, table.actorPersonId],
      foreignColumns: [people.familyId, people.id],
      name: 'approvals_family_actor_fk',
    }).onDelete('restrict'),
    check(
      'approvals_target_type_check',
      sql`${table.targetType} IN ('fact', 'relationship', 'timeline_event')`,
    ),
    check('approvals_action_check', sql`${table.action} IN ('approve', 'reject', 'revoke')`),
  ],
);

export const consentEvents = sqliteTable(
  'consent_events',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    personId: text('person_id').notNull(),
    eventType: text('event_type').$type<ConsentEventType>().notNull(),
    targetType: text('target_type').$type<StoryItemTargetType>().notNull(),
    targetId: text('target_id').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('consent_events_person_event_target_unique').on(
      table.familyId,
      table.personId,
      table.eventType,
      table.targetType,
      table.targetId,
    ),
    index('consent_events_family_target_idx').on(table.familyId, table.targetType, table.targetId),
    foreignKey({
      columns: [table.familyId, table.personId],
      foreignColumns: [people.familyId, people.id],
      name: 'consent_events_family_person_fk',
    }).onDelete('restrict'),
    check(
      'consent_events_type_check',
      sql`${table.eventType} IN ('story_item_approved', 'story_item_rejected', 'story_item_revoked', 'pending_memory_deleted')`,
    ),
    check(
      'consent_events_target_type_check',
      sql`${table.targetType} IN ('fact', 'relationship', 'timeline_event')`,
    ),
  ],
);
