import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

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
    type: text('type').$type<'phase_one_prompt'>().notNull(),
    text: text('text').notNull(),
    source: text('source').$type<'planner'>().notNull(),
    sourceReferenceId: text('source_reference_id'),
    status: text('status').$type<'asked' | 'answered'>().notNull(),
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
    check('questions_type_check', sql`${table.type} = 'phase_one_prompt'`),
    check('questions_source_check', sql`${table.source} = 'planner'`),
    check('questions_status_check', sql`${table.status} IN ('asked', 'answered')`),
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
