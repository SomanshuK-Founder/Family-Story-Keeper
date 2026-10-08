import type { Config } from 'drizzle-kit';

export default {
  dialect: 'sqlite',
  schema: './packages/database/src/schema.ts',
  out: './packages/database/drizzle',
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? './data/story-keeper.sqlite',
  },
} satisfies Config;
